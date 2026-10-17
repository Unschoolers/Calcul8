import type { Container } from "@azure/cosmos";
import { createHash } from "node:crypto";
import type { ApiConfig, SaleDocument, SyncMetaDocument, SyncPresetDocument } from "../../types";
import { HttpError } from "../auth";
import { calculateSealedBoxInventory } from "../../shared/box-inventory.cjs";
import type { SaleConsumptionInput, SaleConsumptionLot } from "../../shared/box-inventory.cjs";
import { assertSuccessfulCosmosBatch, CosmosBatchConflictError } from "./batchResponse";
import { getContainers, isConflictError, isNotFoundError, isPreconditionFailedError, withCosmosRetry } from "./core";
import { saleDocumentId, syncMetaId } from "./ids";
import { loadCoherentSyncSnapshotInputs, SyncSnapshotConflictError } from "./syncSnapshotRepository.shared";

const MAX_GUARD_ACQUIRE_ATTEMPTS = 5;
const MAX_TRANSACTION_ATTEMPTS = 4;
const TRUSTED_EXTERNAL_PROVIDERS = new Set(["shopify", "whatnot"]);

export class EntityVersionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityVersionConflictError";
  }
}

export interface InventorySaleMutationInput {
  scopeKey: string;
  lotId: string;
  saleId: string;
  updatedBy: string;
  mutationId: string;
  baseVersion?: number;
  trustedExternal?: boolean;
}

export interface UpsertInventorySaleInput extends InventorySaleMutationInput {
  sale: unknown;
}

interface InventoryGuardDocument {
  id: string;
  docType: "sales_inventory_guard";
  userId: string;
  lotId: string;
  version: number;
  updatedAt: string;
  _etag?: string;
}

interface SaleMutationDocument {
  id: string;
  docType: "sale_mutation";
  userId: string;
  scopeKey: string;
  lotId: string;
  saleId: string;
  mutationId: string;
  mutationFingerprint: string;
  saleDocumentId: string;
  committedVersion: number;
  createdAt: string;
}

interface CapturedLotState {
  meta: SyncMetaDocument | null;
  metaEtag: string;
  metaOperationDocument: SyncMetaDocument;
  lot: Record<string, unknown> | null;
  embeddedSales: Record<string, unknown>[];
  entitySales: SaleDocument[];
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function readEtag(value: unknown): string {
  return value && typeof value === "object" ? clean((value as { _etag?: unknown })._etag) : "";
}

function guardId(scopeKey: string, lotId: string): string {
  return `sales_inventory_guard:${scopeKey}:${lotId}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function normalizedSaleId(value: unknown): string {
  return clean(value);
}

function saleRecordId(value: unknown): string {
  return normalizedSaleId(asRecord(value)?.id);
}

async function ensureGuard(container: Container, scopeKey: string, lotId: string): Promise<InventoryGuardDocument> {
  const id = guardId(scopeKey, lotId);
  for (let attempt = 0; attempt < MAX_GUARD_ACQUIRE_ATTEMPTS; attempt += 1) {
    try {
      const { resource } = await withCosmosRetry(() => container.item(id, scopeKey).read<InventoryGuardDocument>());
      if (resource?.docType === "sales_inventory_guard" && resource.userId === scopeKey && resource.lotId === lotId
        && Number.isSafeInteger(resource.version) && resource.version > 0 && readEtag(resource)) return resource;
      if (resource) throw new Error("Invalid sales inventory guard document.");
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }

    const document: InventoryGuardDocument = {
      id,
      docType: "sales_inventory_guard",
      userId: scopeKey,
      lotId,
      version: 1,
      updatedAt: new Date().toISOString()
    };
    try {
      const { resource } = await withCosmosRetry(() => container.items.create<InventoryGuardDocument>(document));
      if (resource) return resource;
    } catch (error) {
      if (!(isConflictError(error) || isPreconditionFailedError(error))) throw error;
    }
  }
  throw new EntityVersionConflictError("Sale inventory changed during concurrent updates. Retry the sale.");
}

async function readEntitySales(container: Container, scopeKey: string, lotId: string): Promise<SaleDocument[]> {
  const iterator = container.items.query<SaleDocument>({
    query: `SELECT * FROM c WHERE c.userId = @scopeKey AND c.docType = @docType AND c.lotId = @lotId`,
    parameters: [
      { name: "@scopeKey", value: scopeKey },
      { name: "@docType", value: "sale" },
      { name: "@lotId", value: lotId }
    ]
  }, { partitionKey: scopeKey });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return (resources ?? []).filter((resource) => resource?.docType === "sale" && resource.lotId === lotId);
}

async function captureLotState(container: Container, scopeKey: string, lotId: string): Promise<CapturedLotState> {
  let meta: SyncMetaDocument | null;
  let currentPresets: SyncPresetDocument[];
  try {
    ({ metaDocument: meta, presetDocuments: currentPresets } = await loadCoherentSyncSnapshotInputs(container, scopeKey));
  } catch (error) {
    if (error instanceof SyncSnapshotConflictError || (error as { name?: unknown })?.name === "SyncSnapshotConflictError") {
      throw new EntityVersionConflictError("Sync data changed during sale validation. Retry the sale.");
    }
    throw error;
  }
  const entitySales = await readEntitySales(container, scopeKey, lotId);
  const lots = currentPresets.map((document) => document.preset);
  const lot = lots.map(asRecord).find((candidate) => candidate && clean(candidate.id) === lotId) ?? null;
  const embeddedSales = meta?.salesMode === "entity"
    ? []
    : currentPresets
      .filter((document) => document.presetId === lotId)
      .flatMap((document) => Array.isArray(document.sales) ? document.sales.map(asRecord).filter((sale): sale is Record<string, unknown> => !!sale) : []);
  const metaEtag = readEtag(meta);
  if (meta && !metaEtag) throw new EntityVersionConflictError("Sync data changed during sale validation. Retry the sale.");
  const metaOperationDocument: SyncMetaDocument = meta
    ? Object.fromEntries(Object.entries(meta).filter(([key]) => !key.startsWith("_"))) as SyncMetaDocument
    : {
      id: syncMetaId(scopeKey), docType: "sync_meta", userId: scopeKey, version: 0,
      updatedAt: new Date().toISOString(), wheelConfigs: [], activeWheelConfigId: null
    };
  return { meta, metaEtag, metaOperationDocument, lot, embeddedSales, entitySales };
}

function currentSales(state: CapturedLotState): Map<string, Record<string, unknown>> {
  const sales = new Map<string, Record<string, unknown>>();
  for (const sale of state.embeddedSales) {
    const id = saleRecordId(sale);
    if (id) sales.set(id, sale);
  }
  for (const document of state.entitySales) {
    if (document.deletedAt) sales.delete(document.saleId);
    else {
      const sale = asRecord(document.sale);
      if (sale) sales.set(document.saleId, sale);
    }
  }
  return sales;
}

function isTrustedExternalSale(enabled: boolean | undefined, sale: unknown): boolean {
  if (!enabled) return false;
  const provider = clean(asRecord(sale)?.externalProvider).toLowerCase();
  if (!TRUSTED_EXTERNAL_PROVIDERS.has(provider)) {
    throw new Error("Trusted inventory bypass is reserved for server-created Shopify and Whatnot sales.");
  }
  return true;
}

function normalizeForConsumption(sale: Record<string, unknown>): SaleConsumptionInput | null {
  if (!(sale.type === "pack" || sale.type === "box" || sale.type === "rtyh" || sale.type === "wheel")) return null;
  if (!isSafeCount(sale.quantity) || !isSafeCount(sale.packsCount)) return null;
  const singlesItems = Array.isArray(sale.singlesItems)
    ? sale.singlesItems.map((item) => {
      const line = asRecord(item);
      return line ? {
        quantity: line.quantity as number,
        ...(line.singlesPurchaseEntryId == null ? {} : { singlesPurchaseEntryId: line.singlesPurchaseEntryId as number })
      } : { quantity: Number.NaN };
    })
    : undefined;
  return {
    type: clean(sale.type), quantity: sale.quantity, packsCount: sale.packsCount,
    ...(singlesItems ? { singlesItems } : {})
  } as SaleConsumptionInput;
}

function calculateUsage(lot: Record<string, unknown>, sales: Map<string, Record<string, unknown>>) {
  const lotType = lot.lotType === "singles" ? "singles" : "bulk";
  if (lotType === "singles") {
    const purchases = Array.isArray(lot.singlesPurchases) ? lot.singlesPurchases.map(asRecord).filter((entry): entry is Record<string, unknown> => !!entry) : [];
    const capacities = new Map<string, number>();
    let totalCapacity = 0;
    for (const purchase of purchases) {
      const id = normalizedSaleId(purchase.id);
      const quantity = purchase.quantity ?? 0;
      if (!Number.isSafeInteger(Number(purchase.id)) || Number(purchase.id) <= 0 || !id || !isSafeCount(quantity) || capacities.has(id)) {
        throw new HttpError(409, "Sale inventory configuration is invalid.");
      }
      capacities.set(id, quantity);
      totalCapacity += quantity;
      if (!Number.isSafeInteger(totalCapacity)) throw new HttpError(409, "Sale inventory configuration is invalid.");
    }
    const usage = new Map<string, number>([["__total__", 0]]);
    for (const sale of sales.values()) {
      const value = normalizeForConsumption(sale);
      if (!value) throw new HttpError(409, "A stored sale has invalid inventory consumption.");
      const singlesLines = Array.isArray(sale.singlesItems) ? sale.singlesItems : [];
      const hasSinglesReference = sale.singlesPurchaseEntryId != null || singlesLines.some((item) => asRecord(item)?.singlesPurchaseEntryId != null);
      if (sale.type === "wheel" && value.packsCount === 0 && !hasSinglesReference && singlesLines.length === 0) continue;
      if (sale.singlesPurchaseEntryId != null && clean(sale.singlesPurchaseEntryId) !== ""
        && !capacities.has(normalizedSaleId(sale.singlesPurchaseEntryId))) {
        throw new HttpError(409, "Sale references a singles purchase that does not exist.");
      }
      if ((sale.type === "pack" || sale.type === "rtyh") && value.quantity <= 0) {
        throw new HttpError(409, "Pack sales must consume at least one unit.");
      }
      const lines = Array.isArray(sale.singlesItems) && sale.singlesItems.length > 0
        ? sale.singlesItems.map(asRecord)
        : [{ singlesPurchaseEntryId: sale.singlesPurchaseEntryId, quantity: sale.quantity }];
      let total = 0;
      for (const line of lines) {
        if (!line || !isSafeCount(line.quantity)) throw new HttpError(409, "A stored sale has invalid inventory consumption.");
        total += line.quantity;
        if (!Number.isSafeInteger(total)) throw new HttpError(409, "A stored sale has invalid inventory consumption.");
        if (line.singlesPurchaseEntryId != null && clean(line.singlesPurchaseEntryId) !== "") {
          const key = normalizedSaleId(line.singlesPurchaseEntryId);
          if (!capacities.has(key)) throw new HttpError(409, "Sale references a singles purchase that does not exist.");
          usage.set(key, (usage.get(key) ?? 0) + line.quantity);
          if (!Number.isSafeInteger(usage.get(key))) throw new HttpError(409, "A stored sale has invalid inventory consumption.");
        }
      }
      const hasPhysicalWheelConsumption = sale.type === "wheel"
        && (value.packsCount > 0 || hasSinglesReference || singlesLines.length > 0);
      if (((sale.type === "pack" || sale.type === "rtyh") || hasPhysicalWheelConsumption) && total <= 0) {
        throw new HttpError(409, "Pack sales must consume at least one unit.");
      }
      usage.set("__total__", (usage.get("__total__") ?? 0) + total);
      if (!Number.isSafeInteger(usage.get("__total__"))) throw new HttpError(409, "A stored sale has invalid inventory consumption.");
    }
    return { capacities, usage, totalCapacity };
  }
  const packsPerBox = lot.packsPerBox == null || lot.packsPerBox === 0 ? 16 : lot.packsPerBox;
  if (!isSafeCount(packsPerBox) || packsPerBox <= 0) throw new HttpError(409, "Sale inventory configuration is invalid.");
  const boxesPurchased = lot.boxesPurchased ?? 0;
  if (!isSafeCount(boxesPurchased) || !Number.isSafeInteger(boxesPurchased * packsPerBox)) {
    throw new HttpError(409, "Sale inventory configuration is invalid.");
  }
  const normalized: SaleConsumptionInput[] = [];
  let sealedUsage = 0;
  let openedPackUsage = 0;
  for (const sale of sales.values()) {
    const value = normalizeForConsumption(sale);
    if (!value) throw new HttpError(409, "A stored sale has invalid inventory consumption.");
    if ((value.type === "pack" || value.type === "rtyh") && value.packsCount <= 0) {
      throw new HttpError(409, "Pack sales must consume at least one pack.");
    }
    const consumed = value.type === "box" ? value.quantity : value.packsCount;
    if (value.type === "box") sealedUsage += consumed;
    else openedPackUsage += consumed;
    if (!Number.isSafeInteger(sealedUsage) || !Number.isSafeInteger(openedPackUsage)) {
      throw new HttpError(409, "A stored sale has invalid inventory consumption.");
    }
    normalized.push(value);
  }
  const result = calculateSealedBoxInventory({ boxesPurchased, packsPerBox }, normalized as never);
  return { result, normalized, sealedUsage, openedPackUsage, openedBoxUsage: Math.ceil(openedPackUsage / packsPerBox) };
}

function validateSalesTransition(lot: Record<string, unknown>, before: Map<string, Record<string, unknown>>, after: Map<string, Record<string, unknown>>): void {
  if (lot.lotType === "singles") {
    const oldUsage = calculateUsage(lot, before) as ReturnType<typeof calculateUsage> & { capacities: Map<string, number>; usage: Map<string, number>; totalCapacity: number };
    const nextUsage = calculateUsage(lot, after) as typeof oldUsage;
    const keys = new Set([...oldUsage.usage.keys(), ...nextUsage.usage.keys()]);
    const capacityFor = (key: string) => key === "__total__" ? oldUsage.totalCapacity : oldUsage.capacities.get(key) ?? 0;
    const wasOversold = [...oldUsage.usage].some(([key, quantity]) => quantity > capacityFor(key));
    if (wasOversold) {
      for (const key of keys) {
        if ((nextUsage.usage.get(key) ?? 0) > (oldUsage.usage.get(key) ?? 0)) {
          throw new HttpError(409, "Sale exceeds available singles inventory; edits cannot increase historical inventory consumption.");
        }
      }
    }
    for (const key of keys) {
      const capacity = capacityFor(key);
      const previousOverage = Math.max(0, (oldUsage.usage.get(key) ?? 0) - capacity);
      const nextOverage = Math.max(0, (nextUsage.usage.get(key) ?? 0) - capacity);
      if (nextOverage > previousOverage) throw new HttpError(409, "Sale exceeds available singles inventory.");
    }
    return;
  }
  const oldUsage = calculateUsage(lot, before) as { result: ReturnType<typeof calculateSealedBoxInventory>; sealedUsage: number; openedPackUsage: number; openedBoxUsage: number };
  const nextUsage = calculateUsage(lot, after) as typeof oldUsage;
  if (!nextUsage.result.valid && (oldUsage.result.valid || nextUsage.result.error !== oldUsage.result.error)) {
    throw new HttpError(409, "Sale exceeds available lot inventory.");
  }
  if (oldUsage.result.valid === false) {
    // Historical oversold rows may be reduced, but an edit cannot transfer
    // consumption from sealed boxes to opened packs, or the reverse.
    if (nextUsage.sealedUsage > oldUsage.sealedUsage || nextUsage.openedPackUsage > oldUsage.openedPackUsage) {
      throw new HttpError(409, "Sale edits cannot shift historical inventory consumption.");
    }
  }
}

function assertSaleVersion(existing: SaleDocument | null, input: InventorySaleMutationInput, baseline?: Record<string, unknown> | null): void {
  const currentVersion = existing?.version ?? (Number(baseline?.version) || 0);
  const requested = input.baseVersion;
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 0 || currentVersion >= Number.MAX_SAFE_INTEGER) {
    throw new EntityVersionConflictError("Sale changed since it was last loaded.");
  }
  const expectedVersion = requested ?? 0;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion !== currentVersion) {
    throw new EntityVersionConflictError("Sale changed since it was last loaded.");
  }
}

function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]));
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}

function mutationFingerprint(input: InventorySaleMutationInput, sale: unknown, remove: boolean): string {
  const canonical = canonicalJson({
    operation: remove ? "delete" : "upsert",
    scopeKey: clean(input.scopeKey),
    lotId: clean(input.lotId),
    saleId: clean(input.saleId),
    baseVersion: input.baseVersion ?? null,
    payload: remove ? null : sale
  });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

function saleMutationDocumentId(scopeKey: string, mutationId: string): string {
  const hash = createHash("sha256").update(clean(mutationId)).digest("hex");
  return `sale_mutation:${scopeKey}:${hash}`;
}

async function readSaleMutation(
  container: Container,
  scopeKey: string,
  mutationId: string
): Promise<SaleMutationDocument | null> {
  try {
    const { resource } = await withCosmosRetry(() => container.item(saleMutationDocumentId(scopeKey, mutationId), scopeKey).read<SaleMutationDocument>());
    return resource?.docType === "sale_mutation" ? resource : null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

async function readMutationReplay(
  container: Container,
  scopeKey: string,
  input: InventorySaleMutationInput,
  fingerprint: string
): Promise<SaleDocument | null> {
  const record = await readSaleMutation(container, scopeKey, input.mutationId);
  if (!record) return null;
  if (record.scopeKey !== scopeKey || record.mutationId !== clean(input.mutationId) || record.mutationFingerprint !== fingerprint) {
    throw new EntityVersionConflictError("Sale mutation ID was reused for a different request.");
  }
  let current: SaleDocument | null;
  try {
    const { resource } = await withCosmosRetry(() => container.item(record.saleDocumentId, scopeKey).read<SaleDocument>());
    current = resource?.docType === "sale" ? resource : null;
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    current = null;
  }
  if (!current
    || current.mutationId !== record.mutationId
    || current.mutationFingerprint !== record.mutationFingerprint
    || current.version !== record.committedVersion) {
    throw new EntityVersionConflictError("Sale changed after this mutation was committed.");
  }
  return current;
}

function buildSaleMutationOperation(
  input: InventorySaleMutationInput,
  document: SaleDocument,
  fingerprint: string
) {
  const scopeKey = clean(input.scopeKey);
  const mutationId = clean(input.mutationId);
  const record: SaleMutationDocument = {
    id: saleMutationDocumentId(scopeKey, mutationId),
    docType: "sale_mutation",
    userId: scopeKey,
    scopeKey,
    lotId: clean(input.lotId),
    saleId: clean(input.saleId),
    mutationId,
    mutationFingerprint: fingerprint,
    saleDocumentId: document.id,
    committedVersion: document.version,
    createdAt: new Date().toISOString()
  };
  return { operationType: "Create", resourceBody: record as never };
}

function buildSaleDocument(input: UpsertInventorySaleInput, captured: CapturedLotState, existing: SaleDocument | null, baseline: Record<string, unknown> | null, fingerprint: string): SaleDocument {
  const scopeKey = clean(input.scopeKey);
  const lotId = clean(input.lotId);
  const saleId = clean(input.saleId);
  const now = new Date().toISOString();
  const existingVersion = existing?.version ?? (Number(baseline?.version) || 0);
  return {
    id: saleDocumentId(scopeKey, lotId, saleId), docType: "sale", userId: scopeKey, scopeKey, lotId, saleId,
    sale: input.sale, version: existingVersion + 1, createdAt: existing?.createdAt ?? (clean(baseline?.createdAt) || now),
    updatedAt: now, updatedBy: clean(input.updatedBy), mutationId: clean(input.mutationId), mutationFingerprint: fingerprint, deletedAt: null
  };
}

function buildMetaOperation(captured: CapturedLotState) {
  if (captured.meta) return { operationType: "Replace", id: captured.metaOperationDocument.id, resourceBody: captured.metaOperationDocument as never, ifMatch: captured.metaEtag };
  return { operationType: "Create", resourceBody: captured.metaOperationDocument as never };
}

function buildGuardOperation(guard: InventoryGuardDocument, scopeKey: string, lotId: string) {
  const etag = readEtag(guard);
  if (!etag) throw new EntityVersionConflictError("Sale inventory changed during concurrent updates. Retry the sale.");
  const { _etag: _ignored, ...guardBody } = guard;
  return {
    operationType: "Replace", id: guard.id, ifMatch: etag,
    resourceBody: { ...guardBody, userId: scopeKey, lotId, version: guard.version + 1, updatedAt: new Date().toISOString() } as never
  };
}

async function mutateSale(config: ApiConfig, input: InventorySaleMutationInput, saleValue?: unknown, remove = false): Promise<SaleDocument | null> {
  const scopeKey = clean(input.scopeKey);
  const lotId = clean(input.lotId);
  const saleId = clean(input.saleId);
  if (!scopeKey || !lotId || !saleId) throw new HttpError(400, "Sale identifiers are required.");
  const { syncSnapshots: container } = getContainers(config);
  // The guard is acquired before the meta, snapshot, preset, sale, or lot reads.
  let guard = await ensureGuard(container, scopeKey, lotId);
  const fingerprint = mutationFingerprint(input, saleValue, remove);
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    const replay = await readMutationReplay(container, scopeKey, input, fingerprint);
    if (replay) return replay;
    const captured = await captureLotState(container, scopeKey, lotId);
    const existing = captured.entitySales.find((document) => document.saleId === saleId) ?? null;
    if (!captured.lot) throw new HttpError(404, "Lot was not found.");
    const before = currentSales(captured);
    const baseline = before.get(saleId) ?? null;
    if (remove && !existing && !baseline) return null;
    assertSaleVersion(existing, input, baseline);
    if (remove && existing?.deletedAt) return null;

    const nextSales = new Map(before);
    let document: SaleDocument | null = null;
    if (remove) {
      const source = existing?.sale ?? baseline;
      const sourceSale = asRecord(source);
      const now = new Date().toISOString();
      document = {
        id: saleDocumentId(scopeKey, lotId, saleId), docType: "sale", userId: scopeKey, scopeKey, lotId, saleId,
        sale: source, version: (existing?.version ?? (Number(baseline?.version) || 0)) + 1,
        createdAt: existing?.createdAt ?? (clean(baseline?.createdAt) || now),
        updatedAt: now, updatedBy: clean(input.updatedBy), mutationId: clean(input.mutationId), mutationFingerprint: fingerprint, deletedAt: now
      };
      nextSales.delete(saleId);
      const trusted = isTrustedExternalSale(input.trustedExternal, sourceSale);
      if (!trusted) validateSalesTransition(captured.lot, before, nextSales);
    } else {
      const sale = asRecord(saleValue);
      if (!sale) throw new HttpError(400, "Sale must be an object.");
      document = buildSaleDocument({ ...input, sale: saleValue }, captured, existing, baseline, fingerprint);
      const trusted = isTrustedExternalSale(input.trustedExternal, saleValue);
      nextSales.set(saleId, sale);
      if (!trusted) validateSalesTransition(captured.lot, before, nextSales);
    }
    const saleEtag = readEtag(existing);
    if (existing && !saleEtag) throw new EntityVersionConflictError("Sale changed since it was last loaded.");
    const saleOperation = existing
      ? { operationType: "Replace", id: document.id, resourceBody: document as never, ifMatch: saleEtag }
      : { operationType: "Create", resourceBody: document as never };
    const operations = [
      buildGuardOperation(guard, scopeKey, lotId),
      saleOperation,
      buildSaleMutationOperation(input, document, fingerprint),
      buildMetaOperation(captured)
    ];
    try {
      const response = await withCosmosRetry(() => container.items.batch(operations as never, scopeKey));
      assertSuccessfulCosmosBatch(response, operations.length);
      return document;
    } catch (error) {
      if (!(error instanceof CosmosBatchConflictError) && !(isConflictError(error) || isPreconditionFailedError(error))) throw error;
      if (attempt + 1 >= MAX_TRANSACTION_ATTEMPTS) break;
      guard = await ensureGuard(container, scopeKey, lotId);
      // Each retry rereads every authoritative document and revalidates the sale.
    }
  }
  throw new EntityVersionConflictError("Sale inventory changed during concurrent updates. Retry the sale.");
}

export async function upsertInventorySale(config: ApiConfig, input: UpsertInventorySaleInput): Promise<SaleDocument> {
  const document = await mutateSale(config, input, input.sale, false);
  if (!document) throw new Error("Sale upsert failed.");
  return document;
}

export async function deleteInventorySale(config: ApiConfig, input: InventorySaleMutationInput): Promise<SaleDocument | null> {
  return mutateSale(config, input, undefined, true);
}
