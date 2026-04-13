import { GOOGLE_PROFILE_CACHE_KEY } from "../methods/ui/shared.ts";
import type { AppComputedObject } from "../context-contracts.ts";
import {
  getStoredGoogleIdToken,
  getStoredSessionUserId,
  hasAuthSignal
} from "../auth/index.ts";

interface GoogleJwtPayload {
  sub?: string;
  name?: string;
  email?: string;
  picture?: string;
}

function decodeGoogleJwtPayload(idToken: string): GoogleJwtPayload | null {
  const parts = idToken.split(".");
  if (parts.length < 2) return null;

  const payloadPart = parts[1]?.replace(/-/g, "+").replace(/_/g, "/");
  if (!payloadPart) return null;

  const padded = payloadPart.padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
  try {
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as GoogleJwtPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function readCachedGoogleProfile(): GoogleJwtPayload | null {
  try {
    const raw = localStorage.getItem(GOOGLE_PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as GoogleJwtPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function resolveGoogleProfile(idToken: string): GoogleJwtPayload {
  const fromToken = decodeGoogleJwtPayload(idToken) ?? {};
  const fromCache = readCachedGoogleProfile() ?? {};
  return {
    sub: (fromToken.sub || "").trim(),
    name: (fromToken.name || fromCache.name || "").trim(),
    email: (fromToken.email || fromCache.email || "").trim(),
    picture: (fromToken.picture || fromCache.picture || "").trim()
  };
}

export const authProfileComputed: Pick<
  AppComputedObject,
  "isDark" |
  "isGoogleSignedIn" |
  "googleProfileUserId" |
  "googleProfileName" |
  "googleProfileEmail" |
  "googleProfilePicture" |
  "lotNameDraft"
> = {
  isDark(): boolean {
    return this.$vuetify.theme.global.name === "unionArenaDark";
  },

  isGoogleSignedIn(): boolean {
    void this.googleAuthEpoch;
    return hasAuthSignal();
  },

  googleProfileUserId(): string {
    void this.googleAuthEpoch;
    const token = getStoredGoogleIdToken();
    if (token) {
      return resolveGoogleProfile(token).sub || "";
    }
    return hasAuthSignal() ? getStoredSessionUserId() : "";
  },

  googleProfileName(): string {
    void this.googleAuthEpoch;
    if (!hasAuthSignal()) return "";
    return resolveGoogleProfile(getStoredGoogleIdToken()).name || "";
  },

  googleProfileEmail(): string {
    void this.googleAuthEpoch;
    if (!hasAuthSignal()) return "";
    return resolveGoogleProfile(getStoredGoogleIdToken()).email || "";
  },

  googleProfilePicture(): string {
    void this.googleAuthEpoch;
    if (!hasAuthSignal()) return "";
    return resolveGoogleProfile(getStoredGoogleIdToken()).picture || "";
  },

  lotNameDraft: {
    get() {
      return this.newLotName;
    },
    set(newValue) {
      this.newLotName = String(newValue ?? "");
    }
  }
};

