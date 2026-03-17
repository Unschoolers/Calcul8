import type { Container } from "@azure/cosmos";
import type {
  ApiConfig,
  EntitlementDocument,
  MigrationMarkerDocument,
  MigrationRunDocument,
  PurchaseVerificationResultDocument,
  PlayPurchaseDocument,
  SyncMetaDocument,
  SyncPresetDocument,
  SyncSnapshotDocument,
  SessionDocument
} from "../types";
import {
  EPOCH_DATE_ISO,
  getContainers,
  getExternalSyncContainer,
  isConflictError,
  isNotFoundError,
  withCosmosRetry,
  type ExternalSyncSourceConfig
} from "./cosmos/core";
import {
  entitlementId,
  migrationMarkerId,
  playPurchaseId,
  purchaseVerificationResultId,
  syncMetaId,
  syncPresetId,
  syncSnapshotId
} from "./cosmos/ids";
export {
  createWorkspaceJoinLink,
  createWorkspaceWithOwner,
  deactivateWorkspaceMembership,
  getWorkspaceById,
  getWorkspaceJoinLinkByInviteId,
  getWorkspaceJoinLinkByTokenHash,
  getWorkspaceMembership,
  hasWorkspaceMembership,
  listWorkspaceJoinLinks,
  listWorkspaceMemberships,
  listWorkspaceMembershipsForUser,
  listWorkspacesForUser,
  markWorkspaceJoinLinkUsed,
  revokeWorkspaceJoinLink,
  softDeleteWorkspace,
  transferWorkspaceOwnership,
  upsertWorkspaceDocument,
  upsertWorkspaceMembership
} from "./cosmos/workspaceRepository";
export type {
  CreateWorkspaceJoinLinkInput,
  CreateWorkspaceWithOwnerInput,
  CreateWorkspaceWithOwnerResult
} from "./cosmos/workspaceRepository";
export type { ExternalSyncSourceConfig } from "./cosmos/core";
import { calculateSyncPresetDiff, type SyncPresetState } from "./syncDiff";

export async function createSession(
  config: ApiConfig,
  session: SessionDocument
): Promise<SessionDocument> {
  const { sessions } = getContainers(config);
  const { resource } = await withCosmosRetry(() =>
    sessions.items.upsert<SessionDocument>(session)
  );

  if (!resource) {
    throw new Error("Failed to create session.");
  }

  return resource;
}

export async function getSession(
  config: ApiConfig,
  sessionId: string
): Promise<SessionDocument | null> {
  const { sessions } = getContainers(config);

  try {
    const { resource } = await withCosmosRetry(() =>
      sessions.item(sessionId, sessionId).read<SessionDocument>()
    );
    if (!resource || resource.docType !== "session") return null;
    return resource;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

interface TouchSessionInput {
  sessionId: string;
  lastSeenAt: string;
  idleExpiresAt: string;
}

export async function touchSession(
  config: ApiConfig,
  input: TouchSessionInput
): Promise<void> {
  const existing = await getSession(config, input.sessionId);
  if (!existing) return;

  const { sessions } = getContainers(config);
  const updatedDocument: SessionDocument = {
    ...existing,
    lastSeenAt: input.lastSeenAt,
    idleExpiresAt: input.idleExpiresAt
  };
  await withCosmosRetry(() =>
    sessions.items.upsert<SessionDocument>(updatedDocument)
  );
}

export async function deleteSession(
  config: ApiConfig,
  sessionId: string
): Promise<void> {
  const { sessions } = getContainers(config);
  try {
    await withCosmosRetry(() => sessions.item(sessionId, sessionId).delete());
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw error;
  }
}

export async function revokeAllSessionsForUser(
  config: ApiConfig,
  userId: string
): Promise<number> {
  const { sessions } = getContainers(config);
  const querySpec = {
    query: "SELECT c.id FROM c WHERE c.docType = @docType AND c.userId = @userId",
    parameters: [
      { name: "@docType", value: "session" },
      { name: "@userId", value: userId }
    ]
  };
  const iterator = sessions.items.query<{ id?: string }>(querySpec);
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  const rows = resources ?? [];
  let deletedCount = 0;

  for (const row of rows) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    try {
      await withCosmosRetry(() => sessions.item(id, id).delete());
      deletedCount += 1;
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  return deletedCount;
}

interface SearchCardsInput {
  game: string;
  query: string;
  limit: number;
}

export interface CardCatalogSearchResult {
  id: string;
  game: string;
  cardNo: string;
  name: string;
  series?: string;
  seriesName?: string;
  image?: string;
  rarity?: string;
  marketPrice?: number | null;
}

type CardCatalogSearchClause = {
  clause: string;
  parameters: Array<{ name: string; value: string }>;
};

export function buildCardCatalogSearchClause(query: unknown): CardCatalogSearchClause {
  const tokens = String(query || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => {
      const normalized = token.replace(/[★☆✩✭✮✯]/g, "*");
      return {
        rarityOnly: normalized.includes("*"),
        value: normalized.trim()
      };
    })
    .filter((token) => token.value.replace(/\*/g, "").length > 0);

  if (tokens.length === 0) {
    return { clause: "", parameters: [] };
  }

  const parameters = [] as Array<{ name: string; value: string }>;
  const normalizedRarity = [
    "REPLACE(",
    "REPLACE(",
    "REPLACE(",
    "REPLACE(",
    "REPLACE(",
    "REPLACE(LOWER(c.rarity), '★', '*'),",
    " '☆', '*'),",
    " '✩', '*'),",
    " '✭', '*'),",
    " '✮', '*'),",
    " '✯', '*')"
  ].join("");
  const clause = tokens
    .map((token, index) => {
      const paramName = `@token${index}`;
      parameters.push({ name: paramName, value: token.value });
      if (token.rarityOnly) {
        return `(IS_DEFINED(c.rarity) AND STARTSWITH(${normalizedRarity}, ${paramName}))`;
      }
      return `(
        CONTAINS(LOWER(c.name), ${paramName})
        OR CONTAINS(LOWER(c.cardNo), ${paramName})
        OR (IS_DEFINED(c.rarity) AND CONTAINS(${normalizedRarity}, ${paramName}))
      )`;
    })
    .join("\n      AND ");

  return { clause, parameters };
}

export async function searchCardCatalog(
  config: ApiConfig,
  input: SearchCardsInput
): Promise<CardCatalogSearchResult[]> {
  const { cardCatalog } = getContainers(config);
  const safeGame = String(input.game || "").trim().toLowerCase();
  const safeLimit = Math.max(1, Math.min(25, Math.floor(Number(input.limit) || 25)));
  const searchClause = buildCardCatalogSearchClause(input.query);

  if (!safeGame || !searchClause.clause) return [];

  const querySpec = {
    query: `SELECT TOP ${safeLimit}
      c.id,
      c.game,
      c.cardNo,
      c.name,
      c.series,
      c.seriesName,
      c.image,
      c.rarity,
      c.marketPrice
      FROM c
      WHERE c.pk = @pk
      AND c.game = @game
      AND ${searchClause.clause}
      ORDER BY c.cardNo`,
    parameters: [
      { name: "@pk", value: safeGame },
      { name: "@game", value: safeGame },
      ...searchClause.parameters
    ]
  };

  const iterator = cardCatalog.items.query<CardCatalogSearchResult>(querySpec, {
    partitionKey: safeGame,
    maxItemCount: safeLimit
  });

  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return (resources || []).map((row) => ({
    id: String(row.id || ""),
    game: String(row.game || safeGame),
    cardNo: String(row.cardNo || ""),
    name: String(row.name || ""),
    series: typeof row.series === "string" ? row.series : undefined,
    seriesName: typeof row.seriesName === "string" ? row.seriesName : undefined,
    image: typeof row.image === "string" ? row.image : undefined,
    rarity: typeof row.rarity === "string" ? row.rarity : undefined,
    marketPrice: Number.isFinite(Number(row.marketPrice)) ? Number(row.marketPrice) : null
  }));
}

export async function upsertMigrationRun(
  config: ApiConfig,
  document: MigrationRunDocument
): Promise<MigrationRunDocument> {
  const { migrationRuns } = getContainers(config);
  const { resource } = await withCosmosRetry(() =>
    migrationRuns.items.upsert<MigrationRunDocument>(document)
  );

  if (!resource) {
    throw new Error("Failed to upsert migration run.");
  }

  return resource;
}

export interface UpsertMigrationMarkerInput {
  migrationId: string;
  runId: string;
  triggeredByUserId: string;
  note: string;
  result: Record<string, unknown> | null;
}

export async function upsertMigrationMarker(
  config: ApiConfig,
  input: UpsertMigrationMarkerInput
): Promise<MigrationMarkerDocument> {
  const { migrationRuns } = getContainers(config);
  const document: MigrationMarkerDocument = {
    id: migrationMarkerId(input.migrationId),
    docType: "migration_marker",
    migrationId: input.migrationId,
    updatedAt: new Date().toISOString(),
    lastRunId: input.runId,
    triggeredByUserId: input.triggeredByUserId,
    note: input.note,
    result: input.result
  };

  const { resource } = await withCosmosRetry(() =>
    migrationRuns.items.upsert<MigrationMarkerDocument>(document)
  );

  if (!resource) {
    throw new Error("Failed to upsert migration marker.");
  }

  return resource;
}

export async function getMigrationMarker(
  config: ApiConfig,
  migrationId: string
): Promise<MigrationMarkerDocument | null> {
  const { migrationRuns } = getContainers(config);
  const markerId = migrationMarkerId(migrationId);
  const querySpec = {
    query: "SELECT TOP 1 * FROM c WHERE c.id = @id AND c.docType = @docType",
    parameters: [
      { name: "@id", value: markerId },
      { name: "@docType", value: "migration_marker" }
    ]
  };

  const iterator = migrationRuns.items.query<MigrationMarkerDocument>(querySpec, {
    maxItemCount: 1
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources?.[0] ?? null;
}

interface ListMigrationRunsOptions {
  migrationId?: string;
  limit?: number;
}

export async function listMigrationRuns(
  config: ApiConfig,
  { migrationId, limit = 20 }: ListMigrationRunsOptions = {}
): Promise<MigrationRunDocument[]> {
  const { migrationRuns } = getContainers(config);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20;

  const querySpec = migrationId
    ? {
      query: `SELECT TOP ${safeLimit} * FROM c WHERE c.docType = @docType AND c.migrationId = @migrationId ORDER BY c.startedAt DESC`,
      parameters: [
        { name: "@docType", value: "migration_run" },
        { name: "@migrationId", value: migrationId }
      ]
    }
    : {
      query: `SELECT TOP ${safeLimit} * FROM c WHERE c.docType = @docType ORDER BY c.startedAt DESC`,
      parameters: [{ name: "@docType", value: "migration_run" }]
    };

  const iterator = migrationRuns.items.query<MigrationRunDocument>(querySpec, {
    maxItemCount: safeLimit
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources ?? [];
}

export async function getEntitlement(
  config: ApiConfig,
  userId: string
): Promise<EntitlementDocument | null> {
  const { entitlements } = getContainers(config);
  const id = entitlementId(userId);

  try {
    const { resource } = await withCosmosRetry(() => entitlements.item(id, userId).read<EntitlementDocument>());
    return resource ?? null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function upsertEntitlement(
  config: ApiConfig,
  entitlement: EntitlementDocument
): Promise<EntitlementDocument> {
  const { entitlements } = getContainers(config);
  const { resource } = await withCosmosRetry(() =>
    entitlements.items.upsert<EntitlementDocument>({
      ...entitlement,
      id: entitlementId(entitlement.userId)
    })
  );

  if (!resource) {
    throw new Error("Failed to upsert entitlement.");
  }

  return resource;
}

export async function getPlayPurchaseByTokenHash(
  config: ApiConfig,
  purchaseTokenHash: string
): Promise<PlayPurchaseDocument | null> {
  const { entitlements } = getContainers(config);
  const querySpec = {
    query: "SELECT TOP 1 * FROM c WHERE c.docType = @docType AND c.purchaseTokenHash = @purchaseTokenHash",
    parameters: [
      { name: "@docType", value: "play_purchase" },
      { name: "@purchaseTokenHash", value: purchaseTokenHash }
    ]
  };

  const iterator = entitlements.items.query<PlayPurchaseDocument>(querySpec, {
    maxItemCount: 1
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources?.[0] ?? null;
}

export async function listPlayPurchasesForUser(
  config: ApiConfig,
  userId: string
): Promise<PlayPurchaseDocument[]> {
  const { entitlements } = getContainers(config);
  const querySpec = {
    query: "SELECT * FROM c WHERE c.userId = @userId AND c.docType = @docType",
    parameters: [
      { name: "@userId", value: userId },
      { name: "@docType", value: "play_purchase" }
    ]
  };

  const iterator = entitlements.items.query<PlayPurchaseDocument>(querySpec, {
    partitionKey: userId
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources ?? [];
}

export async function upsertPlayPurchase(
  config: ApiConfig,
  purchase: PlayPurchaseDocument
): Promise<PlayPurchaseDocument> {
  const { entitlements } = getContainers(config);
  const { resource } = await withCosmosRetry(() =>
    entitlements.items.upsert<PlayPurchaseDocument>({
      ...purchase,
      id: playPurchaseId(purchase.purchaseTokenHash)
    })
  );

  if (!resource) {
    throw new Error("Failed to upsert play purchase.");
  }

  return resource;
}

interface PurchaseVerificationResultLookupInput {
  userId: string;
  provider: string;
  idempotencyKey: string;
}

export async function getPurchaseVerificationResult(
  config: ApiConfig,
  input: PurchaseVerificationResultLookupInput
): Promise<PurchaseVerificationResultDocument | null> {
  const { entitlements } = getContainers(config);
  const id = purchaseVerificationResultId(input.userId, input.provider, input.idempotencyKey);

  try {
    const { resource } = await withCosmosRetry(() =>
      entitlements.item(id, input.userId).read<PurchaseVerificationResultDocument>()
    );
    if (!resource || resource.docType !== "purchase_verification_result") {
      return null;
    }
    return resource;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

interface CreatePurchaseVerificationResultInput {
  userId: string;
  provider: string;
  idempotencyKey: string;
  responseStatus: number;
  responseBody: Record<string, unknown>;
  createdAt: string;
}

export async function createPurchaseVerificationResult(
  config: ApiConfig,
  input: CreatePurchaseVerificationResultInput
): Promise<PurchaseVerificationResultDocument> {
  const { entitlements } = getContainers(config);
  const document: PurchaseVerificationResultDocument = {
    id: purchaseVerificationResultId(input.userId, input.provider, input.idempotencyKey),
    docType: "purchase_verification_result",
    userId: input.userId,
    provider: input.provider,
    idempotencyKey: input.idempotencyKey,
    responseStatus: input.responseStatus,
    responseBody: input.responseBody,
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  };

  try {
    const { resource } = await withCosmosRetry(() =>
      entitlements.items.create<PurchaseVerificationResultDocument>(document)
    );

    if (!resource) {
      throw new Error("Failed to create purchase verification result.");
    }

    return resource;
  } catch (error) {
    if (isConflictError(error)) {
      const existing = await getPurchaseVerificationResult(config, {
        userId: input.userId,
        provider: input.provider,
        idempotencyKey: input.idempotencyKey
      });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function deleteEntitlement(
  config: ApiConfig,
  userId: string
): Promise<void> {
  const { entitlements } = getContainers(config);
  const id = entitlementId(userId);

  try {
    await withCosmosRetry(() => entitlements.item(id, userId).delete());
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw error;
  }
}

export async function deletePlayPurchasesForUser(
  config: ApiConfig,
  userId: string
): Promise<void> {
  const { entitlements } = getContainers(config);
  const purchases = await listPlayPurchasesForUser(config, userId);

  for (const purchase of purchases) {
    try {
      await withCosmosRetry(() => entitlements.item(purchase.id, userId).delete());
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
}

export async function getSyncPresetDocuments(
  config: ApiConfig,
  userId: string
): Promise<SyncPresetDocument[]> {
  const { syncSnapshots } = getContainers(config);
  return getSyncPresetDocumentsFromContainer(syncSnapshots, userId);
}

async function getSyncPresetDocumentsFromContainer(
  container: Container,
  userId: string
): Promise<SyncPresetDocument[]> {
  const querySpec = {
    query: "SELECT * FROM c WHERE c.userId = @userId AND c.docType = @docType",
    parameters: [
      { name: "@userId", value: userId },
      { name: "@docType", value: "sync_preset" }
    ]
  };
  const iterator = container.items.query<SyncPresetDocument>(querySpec, {
    partitionKey: userId
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources ?? [];
}

export async function getSyncMetaDocument(
  config: ApiConfig,
  userId: string
): Promise<SyncMetaDocument | null> {
  const { syncSnapshots } = getContainers(config);
  return getSyncMetaDocumentFromContainer(syncSnapshots, userId);
}

async function getSyncMetaDocumentFromContainer(
  container: Container,
  userId: string
): Promise<SyncMetaDocument | null> {
  const id = syncMetaId(userId);

  try {
    const { resource } = await withCosmosRetry(() => container.item(id, userId).read<SyncMetaDocument>());
    return resource ?? null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

function toPresetState(document: SyncPresetDocument): SyncPresetState {
  return {
    presetId: document.presetId,
    preset: document.preset,
    sales: document.sales
  };
}

export async function getSyncSnapshotFromPresetDocuments(
  config: ApiConfig,
  userId: string
): Promise<SyncSnapshotDocument | null> {
  const { syncSnapshots } = getContainers(config);
  return getSyncSnapshotFromContainer(syncSnapshots, userId);
}

async function getSyncSnapshotFromContainer(
  container: Container,
  userId: string
): Promise<SyncSnapshotDocument | null> {
  const [presetDocuments, metaDocument] = await Promise.all([
    getSyncPresetDocumentsFromContainer(container, userId),
    getSyncMetaDocumentFromContainer(container, userId)
  ]);

  if (presetDocuments.length === 0) {
    return null;
  }

  const lots = presetDocuments.map((document) => document.preset);
  const salesByLot = Object.fromEntries(
    presetDocuments.map((document) => [
      document.presetId,
      Array.isArray(document.sales) ? document.sales : []
    ])
  ) as Record<string, unknown[]>;

  const maxVersion = Math.max(
    0,
    metaDocument?.version ?? 0,
    ...presetDocuments.map((document) => document.version || 0)
  );
  const latestUpdatedAt = [
    metaDocument?.updatedAt,
    ...presetDocuments.map((document) => document.updatedAt)
  ]
    .filter((value): value is string => typeof value === "string")
    .toSorted()
    .at(-1) ?? EPOCH_DATE_ISO;

  return {
    id: syncSnapshotId(userId),
    userId,
    lots,
    salesByLot,
    version: maxVersion,
    updatedAt: latestUpdatedAt
  };
}

export async function getEffectiveSyncSnapshot(
  config: ApiConfig,
  userId: string
): Promise<SyncSnapshotDocument | null> {
  return getSyncSnapshotFromPresetDocuments(config, userId);
}

export async function getEffectiveSyncSnapshotFromExternalSource(
  source: ExternalSyncSourceConfig,
  userId: string
): Promise<SyncSnapshotDocument | null> {
  const container = getExternalSyncContainer(source);
  return getSyncSnapshotFromContainer(container, userId);
}

interface IncrementalSyncUpsertInput {
  userId: string;
  lots: unknown[];
  salesByLot: Record<string, unknown[]>;
  version: number;
  updatedAt: string;
}

function buildIncomingPresetStates(
  lots: unknown[],
  salesByLot: Record<string, unknown[]>
): SyncPresetState[] {
  return lots.flatMap((lot): SyncPresetState[] => {
    if (typeof lot !== "object" || lot === null || Array.isArray(lot)) {
      return [];
    }
    const presetIdRaw = (lot as { id?: unknown }).id;
    if (typeof presetIdRaw !== "string" && typeof presetIdRaw !== "number") {
      return [];
    }

    const presetId = String(presetIdRaw);
    return [{
      presetId,
      preset: lot,
      sales: Array.isArray(salesByLot[presetId]) ? salesByLot[presetId] : []
    }];
  });
}

interface IncrementalSyncUpsertResult {
  changed: boolean;
  upsertedCount: number;
  deletedCount: number;
}

export async function upsertSyncSnapshotIncremental(
  config: ApiConfig,
  input: IncrementalSyncUpsertInput
): Promise<IncrementalSyncUpsertResult> {
  const { syncSnapshots } = getContainers(config);
  const existingDocuments = await getSyncPresetDocuments(config, input.userId);
  const existingStates = existingDocuments.map(toPresetState);
  const incomingStates = buildIncomingPresetStates(input.lots, input.salesByLot);
  const diff = calculateSyncPresetDiff(existingStates, incomingStates);

  const incomingById = new Map<string, SyncPresetState>();
  for (const state of incomingStates) {
    incomingById.set(state.presetId, state);
  }

  let upsertedCount = 0;
  for (const presetId of diff.upsertPresetIds) {
    const state = incomingById.get(presetId);
    if (!state) continue;

    const document: SyncPresetDocument = {
      id: syncPresetId(input.userId, presetId),
      docType: "sync_preset",
      userId: input.userId,
      presetId,
      preset: state.preset,
      sales: state.sales,
      version: input.version,
      updatedAt: input.updatedAt
    };

    await withCosmosRetry(() => syncSnapshots.items.upsert<SyncPresetDocument>(document));
    upsertedCount += 1;
  }

  let deletedCount = 0;
  for (const presetId of diff.deletePresetIds) {
    const id = syncPresetId(input.userId, presetId);
    try {
      await withCosmosRetry(() => syncSnapshots.item(id, input.userId).delete());
      deletedCount += 1;
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  const changed = upsertedCount > 0 || deletedCount > 0;

  if (changed) {
    const metaDocument: SyncMetaDocument = {
      id: syncMetaId(input.userId),
      docType: "sync_meta",
      userId: input.userId,
      version: input.version,
      updatedAt: input.updatedAt
    };
    await withCosmosRetry(() => syncSnapshots.items.upsert<SyncMetaDocument>(metaDocument));
  }

  return {
    changed,
    upsertedCount,
    deletedCount
  };
}

export async function deleteAllSyncData(
  config: ApiConfig,
  userId: string
): Promise<void> {
  const { syncSnapshots } = getContainers(config);

  const presetDocuments = await getSyncPresetDocuments(config, userId);
  for (const document of presetDocuments) {
    try {
      await withCosmosRetry(() => syncSnapshots.item(document.id, userId).delete());
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  const deletions = [
    () => syncSnapshots.item(syncMetaId(userId), userId).delete(),
    () => syncSnapshots.item(syncSnapshotId(userId), userId).delete()
  ];

  for (const deletion of deletions) {
    try {
      await withCosmosRetry(deletion);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
}
