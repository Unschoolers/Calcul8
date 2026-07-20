import type { BuyerProfile } from "../types/app.ts";
import { normalizeBuyerKey } from "./computed/buyer-quick-view.ts";

export interface BuyerIdentityDisplay {
  username: string;
  preferredName: string | null;
  primaryLabel: string;
  secondaryLabel: string | null;
  accessibleLabel: string;
  tags: string[];
}

function cleanWhitespace(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeSearchText(value: unknown): string {
  return cleanWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export function normalizeBuyerProfileTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const rawTag of value) {
    if (typeof rawTag !== "string") continue;
    const tag = cleanWhitespace(rawTag);
    if (!tag || tag.length > 32) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 10) break;
  }
  return tags;
}

export function normalizeBuyerProfileDto(value: unknown): BuyerProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const username = cleanWhitespace(raw.username);
  const preferredName = cleanWhitespace(raw.preferredName);
  const createdAt = cleanWhitespace(raw.createdAt);
  const updatedAt = cleanWhitespace(raw.updatedAt);
  const version = Number(raw.version);
  if (!username || username.length > 100 || !Array.isArray(raw.tags)) return null;
  if (!Number.isInteger(version) || version < 0) return null;
  if (preferredName.length > 80) return null;
  return {
    username,
    preferredName: preferredName || undefined,
    tags: normalizeBuyerProfileTags(raw.tags),
    createdAt,
    updatedAt,
    version
  };
}

export function buildBuyerProfileIndex(profiles: BuyerProfile[]): Record<string, BuyerProfile> {
  const index: Record<string, BuyerProfile> = {};
  for (const profile of profiles) {
    const key = normalizeBuyerKey(profile.username);
    if (key) index[key] = profile;
  }
  return index;
}

export function buildBuyerProfileTagSuggestions(profiles: BuyerProfile[]): string[] {
  const tagsByKey = new Map<string, string>();
  for (const profile of profiles) {
    for (const tag of profile.tags) {
      const key = normalizeSearchText(tag);
      if (key && !tagsByKey.has(key)) tagsByKey.set(key, tag);
    }
  }
  return [...tagsByKey.values()].sort((left, right) => left.localeCompare(right));
}

export function matchesBuyerProfileSearch(
  username: string,
  profile: BuyerProfile | null | undefined,
  query: unknown
): boolean {
  const search = normalizeSearchText(query);
  if (!search) return true;
  return [username, profile?.preferredName, ...(profile?.tags || [])]
    .some((value) => normalizeSearchText(value).includes(search));
}

function usernameLabel(username: string): string {
  const cleaned = cleanWhitespace(username).replace(/^@+/, "");
  return cleaned ? `@${cleaned}` : "";
}

export function composeBuyerIdentity(
  usernameValue: unknown,
  profile: BuyerProfile | null | undefined
): BuyerIdentityDisplay {
  const username = cleanWhitespace(usernameValue).replace(/^@+/, "");
  const preferredName = cleanWhitespace(profile?.preferredName) || null;
  const handle = usernameLabel(username);
  return {
    username,
    preferredName,
    primaryLabel: preferredName || handle,
    secondaryLabel: preferredName ? handle : null,
    accessibleLabel: preferredName ? `${preferredName} (${handle})` : handle,
    tags: profile ? [...profile.tags] : []
  };
}
