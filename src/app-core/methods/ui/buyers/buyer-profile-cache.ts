import type {
  BuyerProfile,
  BuyerProfilePendingMutation
} from "../../../../types/app.ts";
import {
  getScopedBuyerProfileOutboxKey,
  getScopedBuyerProfilesCacheKey,
  type AppStorageScope
} from "../../../storageKeys.ts";
import { normalizeBuyerProfileDto, normalizeBuyerProfileTags } from "../../../buyer-profile.ts";

export function getBuyerProfilesCacheStorageKey(scope: AppStorageScope): string {
  return getScopedBuyerProfilesCacheKey(scope);
}

export function getBuyerProfileOutboxStorageKey(scope: AppStorageScope): string {
  return getScopedBuyerProfileOutboxKey(scope);
}

function readJsonArray(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(key: string, values: unknown[]): void {
  try {
    if (values.length === 0) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Cache writes are best-effort. In-memory state remains authoritative for the session.
  }
}

export function readCachedBuyerProfiles(scope: AppStorageScope): BuyerProfile[] {
  return readJsonArray(getBuyerProfilesCacheStorageKey(scope))
    .map(normalizeBuyerProfileDto)
    .filter((profile): profile is BuyerProfile => profile != null);
}

export function writeCachedBuyerProfiles(scope: AppStorageScope, profiles: BuyerProfile[]): void {
  writeJsonArray(getBuyerProfilesCacheStorageKey(scope), profiles);
}

function normalizePendingMutation(value: unknown): BuyerProfilePendingMutation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const mutationId = String(raw.mutationId ?? "").trim();
  const operation = raw.operation === "delete" ? "delete" : raw.operation === "upsert" ? "upsert" : null;
  const username = String(raw.username ?? "").trim().replace(/\s+/g, " ");
  const preferredName = String(raw.preferredName ?? "").trim().replace(/\s+/g, " ");
  const baseVersion = Number(raw.baseVersion);
  const queuedAt = String(raw.queuedAt ?? "").trim();
  if (!mutationId || !operation || !username || !Number.isInteger(baseVersion) || baseVersion < 0 || !queuedAt) {
    return null;
  }
  return {
    mutationId,
    operation,
    username,
    preferredName: preferredName || undefined,
    tags: normalizeBuyerProfileTags(raw.tags),
    baseVersion,
    queuedAt
  };
}

export function readBuyerProfileOutbox(scope: AppStorageScope): BuyerProfilePendingMutation[] {
  return readJsonArray(getBuyerProfileOutboxStorageKey(scope))
    .map(normalizePendingMutation)
    .filter((mutation): mutation is BuyerProfilePendingMutation => mutation != null);
}

export function writeBuyerProfileOutbox(
  scope: AppStorageScope,
  mutations: BuyerProfilePendingMutation[]
): void {
  writeJsonArray(getBuyerProfileOutboxStorageKey(scope), mutations);
}
