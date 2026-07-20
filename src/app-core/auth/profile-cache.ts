import { GOOGLE_AUTH_PROFILE_CACHE_KEY } from "./storage.ts";

export interface CachedAuthProfile {
  name: string;
  email: string;
  picture: string;
}

type AuthProfileInput = Partial<Record<keyof CachedAuthProfile, unknown>>;

function normalizeProfileField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readCachedAuthProfile(
  cacheKey: string = GOOGLE_AUTH_PROFILE_CACHE_KEY
): CachedAuthProfile | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthProfileInput;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      name: normalizeProfileField(parsed.name),
      email: normalizeProfileField(parsed.email),
      picture: normalizeProfileField(parsed.picture)
    };
  } catch {
    return null;
  }
}

export function cacheAuthProfile(
  input: AuthProfileInput,
  cacheKey: string = GOOGLE_AUTH_PROFILE_CACHE_KEY
): boolean {
  const previous = readCachedAuthProfile(cacheKey);
  const next: CachedAuthProfile = {
    name: normalizeProfileField(input.name) || previous?.name || "",
    email: normalizeProfileField(input.email) || previous?.email || "",
    picture: normalizeProfileField(input.picture) || previous?.picture || ""
  };

  if (!next.name && !next.email && !next.picture) return false;
  if (
    previous?.name === next.name
    && previous.email === next.email
    && previous.picture === next.picture
  ) {
    return false;
  }

  try {
    localStorage.setItem(cacheKey, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
