import type { AppComputedObject } from "../context-contracts.ts";
import {
  getStoredGoogleIdToken,
  getStoredSessionUserId,
  hasAuthSignal,
  readCachedAuthProfile
} from "../auth/index.ts";
import { isDevNoLoginRoute } from "../dev-nologin.ts";

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

function resolveGoogleProfile(idToken: string): GoogleJwtPayload {
  const fromToken = decodeGoogleJwtPayload(idToken) ?? {};
  const fromCache = readCachedAuthProfile() ?? {
    name: "",
    email: "",
    picture: ""
  };
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
    if (isDevNoLoginRoute()) return true;
    return hasAuthSignal();
  },

  googleProfileUserId(): string {
    void this.googleAuthEpoch;
    if (isDevNoLoginRoute()) return "dev-nologin-user";
    const token = getStoredGoogleIdToken();
    if (token) {
      return resolveGoogleProfile(token).sub || "";
    }
    return hasAuthSignal() ? getStoredSessionUserId() : "";
  },

  googleProfileName(): string {
    void this.googleAuthEpoch;
    if (isDevNoLoginRoute()) return "Dev No Login";
    if (!hasAuthSignal()) return "";
    return resolveGoogleProfile(getStoredGoogleIdToken()).name || "";
  },

  googleProfileEmail(): string {
    void this.googleAuthEpoch;
    if (isDevNoLoginRoute()) return "dev-nologin@local.test";
    if (!hasAuthSignal()) return "";
    return resolveGoogleProfile(getStoredGoogleIdToken()).email || "";
  },

  googleProfilePicture(): string {
    void this.googleAuthEpoch;
    if (isDevNoLoginRoute()) return "";
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

