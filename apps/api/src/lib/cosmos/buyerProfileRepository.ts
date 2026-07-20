import type { ApiConfig, BuyerProfileDocument } from "../../types";
import {
  getContainers,
  isConflictError,
  isNotFoundError,
  isPreconditionFailedError,
  withCosmosRetry
} from "./core";
import { buyerProfileDocumentId } from "./ids";

const MAX_USERNAME_LENGTH = 100;
const MAX_PREFERRED_NAME_LENGTH = 80;
const MAX_TAG_COUNT = 10;
const MAX_TAG_LENGTH = 32;

export class BuyerProfileVersionConflictError extends Error {
  constructor(message = "Buyer profile changed since it was last loaded.") {
    super(message);
    this.name = "BuyerProfileVersionConflictError";
  }
}

export interface UpsertBuyerProfileInput {
  scopeKey: string;
  username: string;
  preferredName?: string;
  tags: string[];
  updatedBy: string;
  mutationId: string;
  baseVersion: number;
}

export interface DeleteBuyerProfileInput {
  scopeKey: string;
  username: string;
  updatedBy: string;
  mutationId: string;
  baseVersion: number;
}

function cleanWhitespace(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeBuyerProfileUsername(value: unknown): string {
  return cleanWhitespace(value).toLocaleLowerCase();
}

export function normalizeBuyerProfileTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError("Buyer profile tags must be an array.");
  }
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const rawTag of value) {
    const tag = cleanWhitespace(rawTag);
    if (!tag) continue;
    if (tag.length > MAX_TAG_LENGTH) {
      throw new RangeError(`Buyer profile tags cannot exceed ${MAX_TAG_LENGTH} characters.`);
    }
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length > MAX_TAG_COUNT) {
      throw new RangeError(`Buyer profiles cannot contain more than ${MAX_TAG_COUNT} tags.`);
    }
  }
  return tags;
}

function normalizeWriteInput(input: UpsertBuyerProfileInput): UpsertBuyerProfileInput & {
  normalizedUsername: string;
} {
  const scopeKey = cleanWhitespace(input.scopeKey);
  const username = cleanWhitespace(input.username);
  const normalizedUsername = normalizeBuyerProfileUsername(username);
  const preferredName = cleanWhitespace(input.preferredName);
  const updatedBy = cleanWhitespace(input.updatedBy);
  const mutationId = cleanWhitespace(input.mutationId);
  const baseVersion = Math.floor(Number(input.baseVersion));
  if (!scopeKey || !username || !normalizedUsername || !updatedBy || !mutationId) {
    throw new TypeError("Buyer profile scope, username, actor, and mutation identity are required.");
  }
  if (username.length > MAX_USERNAME_LENGTH) {
    throw new RangeError(`Buyer profile usernames cannot exceed ${MAX_USERNAME_LENGTH} characters.`);
  }
  if (preferredName.length > MAX_PREFERRED_NAME_LENGTH) {
    throw new RangeError(`Buyer profile preferred names cannot exceed ${MAX_PREFERRED_NAME_LENGTH} characters.`);
  }
  if (!Number.isFinite(baseVersion) || baseVersion < 0) {
    throw new RangeError("Buyer profile baseVersion must be a non-negative integer.");
  }
  return {
    ...input,
    scopeKey,
    username,
    normalizedUsername,
    preferredName: preferredName || undefined,
    tags: normalizeBuyerProfileTags(input.tags),
    updatedBy,
    mutationId,
    baseVersion
  };
}

function isBuyerProfileDocument(value: unknown): value is BuyerProfileDocument {
  return !!value
    && typeof value === "object"
    && (value as { docType?: unknown }).docType === "buyer_profile";
}

function isActiveBuyerProfile(value: unknown): value is BuyerProfileDocument {
  return isBuyerProfileDocument(value) && !value.deletedAt;
}

function readEtag(value: unknown): string {
  return String((value as { _etag?: unknown } | null)?._etag ?? "").trim();
}

function ifMatchOptions(etag: string) {
  return {
    accessCondition: {
      type: "IfMatch" as const,
      condition: etag
    }
  };
}

function mapWriteConflict(error: unknown): never {
  if (isConflictError(error) || isPreconditionFailedError(error)) {
    throw new BuyerProfileVersionConflictError();
  }
  throw error;
}

async function readBuyerProfile(
  config: ApiConfig,
  scopeKey: string,
  normalizedUsername: string
): Promise<BuyerProfileDocument | null> {
  const { syncSnapshots } = getContainers(config);
  const id = buyerProfileDocumentId(normalizedUsername);
  try {
    const { resource } = await withCosmosRetry(() => (
      syncSnapshots.item(id, scopeKey).read<BuyerProfileDocument>()
    ));
    return isBuyerProfileDocument(resource) ? resource : null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function getBuyerProfile(
  config: ApiConfig,
  scopeKey: string,
  username: string
): Promise<BuyerProfileDocument | null> {
  const normalizedScopeKey = cleanWhitespace(scopeKey);
  const normalizedUsername = normalizeBuyerProfileUsername(username);
  if (!normalizedScopeKey || !normalizedUsername) return null;
  const profile = await readBuyerProfile(config, normalizedScopeKey, normalizedUsername);
  return isActiveBuyerProfile(profile) ? profile : null;
}

export async function listBuyerProfiles(
  config: ApiConfig,
  scopeKey: string
): Promise<BuyerProfileDocument[]> {
  const { syncSnapshots } = getContainers(config);
  const normalizedScopeKey = cleanWhitespace(scopeKey);
  if (!normalizedScopeKey) return [];
  const iterator = syncSnapshots.items.query<BuyerProfileDocument>({
    query: `
      SELECT * FROM c
      WHERE c.userId = @scopeKey
        AND c.docType = @docType
        AND (NOT IS_DEFINED(c.deletedAt) OR IS_NULL(c.deletedAt))
    `,
    parameters: [
      { name: "@scopeKey", value: normalizedScopeKey },
      { name: "@docType", value: "buyer_profile" }
    ]
  }, {
    partitionKey: normalizedScopeKey
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return (resources ?? [])
    .filter(isActiveBuyerProfile)
    .sort((left, right) => left.username.localeCompare(right.username));
}

export async function upsertBuyerProfile(
  config: ApiConfig,
  rawInput: UpsertBuyerProfileInput
): Promise<BuyerProfileDocument> {
  const input = normalizeWriteInput(rawInput);
  const { syncSnapshots } = getContainers(config);
  const existing = await readBuyerProfile(config, input.scopeKey, input.normalizedUsername);
  if (existing?.mutationId === input.mutationId) return existing;

  const now = new Date().toISOString();
  if (!existing) {
    if (input.baseVersion !== 0) throw new BuyerProfileVersionConflictError();
    const document: BuyerProfileDocument = {
      id: buyerProfileDocumentId(input.normalizedUsername),
      docType: "buyer_profile",
      userId: input.scopeKey,
      username: input.username,
      normalizedUsername: input.normalizedUsername,
      preferredName: input.preferredName,
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
      updatedBy: input.updatedBy,
      mutationId: input.mutationId,
      version: 1,
      deletedAt: null
    };
    try {
      const { resource } = await withCosmosRetry(() => syncSnapshots.items.create<BuyerProfileDocument>(document));
      if (!resource) throw new Error("Failed to create buyer profile.");
      return resource;
    } catch (error) {
      return mapWriteConflict(error);
    }
  }

  if (existing.version !== input.baseVersion) throw new BuyerProfileVersionConflictError();
  const document: BuyerProfileDocument = {
    id: existing.id,
    docType: "buyer_profile",
    userId: input.scopeKey,
    username: input.username,
    normalizedUsername: input.normalizedUsername,
    preferredName: input.preferredName,
    tags: input.tags,
    createdAt: existing.createdAt,
    updatedAt: now,
    updatedBy: input.updatedBy,
    mutationId: input.mutationId,
    version: existing.version + 1,
    deletedAt: null
  };
  try {
    const item = syncSnapshots.item(existing.id, input.scopeKey);
    const { resource } = await withCosmosRetry(() => (
      item.replace<BuyerProfileDocument>(document, ifMatchOptions(readEtag(existing)))
    ));
    if (!resource) throw new Error("Failed to update buyer profile.");
    return resource;
  } catch (error) {
    return mapWriteConflict(error);
  }
}

export async function deleteBuyerProfile(
  config: ApiConfig,
  rawInput: DeleteBuyerProfileInput
): Promise<BuyerProfileDocument | null> {
  const input = normalizeWriteInput({ ...rawInput, tags: [] });
  const { syncSnapshots } = getContainers(config);
  const existing = await readBuyerProfile(config, input.scopeKey, input.normalizedUsername);
  if (!existing) return null;
  if (existing.mutationId === input.mutationId || existing.deletedAt) return existing;
  if (existing.version !== input.baseVersion) throw new BuyerProfileVersionConflictError();

  const now = new Date().toISOString();
  const document: BuyerProfileDocument = {
    ...existing,
    username: input.username,
    preferredName: undefined,
    tags: [],
    updatedAt: now,
    updatedBy: input.updatedBy,
    mutationId: input.mutationId,
    version: existing.version + 1,
    deletedAt: now,
    _etag: undefined
  };
  try {
    const item = syncSnapshots.item(existing.id, input.scopeKey);
    const { resource } = await withCosmosRetry(() => (
      item.replace<BuyerProfileDocument>(document, ifMatchOptions(readEtag(existing)))
    ));
    if (!resource) throw new Error("Failed to delete buyer profile.");
    return resource;
  } catch (error) {
    return mapWriteConflict(error);
  }
}
