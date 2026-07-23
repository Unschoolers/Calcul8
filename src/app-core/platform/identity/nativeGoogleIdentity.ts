import { registerPlugin } from "@capacitor/core";
import {
  IdentityCredentialError,
  type IdentityCredential,
  type IdentityCredentialMode,
  type IdentityCredentialPort
} from "./types.ts";

interface NativeGoogleIdentityPlugin {
  requestCredential(options: { mode: IdentityCredentialMode }): Promise<unknown>;
  clearCredentialState(): Promise<void>;
}

const nativePlugin = registerPlugin<NativeGoogleIdentityPlugin>("WhatFeesGoogleIdentity");

function normalizeError(error: unknown): IdentityCredentialError {
  const value = typeof error === "object" && error !== null
    ? error as { code?: unknown; message?: unknown }
    : {};
  return new IdentityCredentialError(
    typeof value.code === "string" ? value.code : "identity_unavailable",
    typeof value.message === "string" && value.message.trim()
      ? value.message
      : "Google identity is unavailable."
  );
}

function normalizeCredential(value: unknown): IdentityCredential {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new IdentityCredentialError("invalid_credential", "Google returned an invalid credential.");
  }
  const candidate = value as Record<string, unknown>;
  const idToken = typeof candidate.idToken === "string" ? candidate.idToken.trim() : "";
  if (!idToken) {
    throw new IdentityCredentialError("invalid_credential", "Google returned an empty ID token.");
  }
  return {
    idToken,
    displayName: typeof candidate.displayName === "string"
      ? candidate.displayName.trim() || null
      : null,
    photoUrl: typeof candidate.photoUrl === "string"
      ? candidate.photoUrl.trim() || null
      : null
  };
}

export function createNativeGoogleIdentityPort(
  plugin: NativeGoogleIdentityPlugin = nativePlugin
): IdentityCredentialPort {
  return {
    async requestCredential(mode: IdentityCredentialMode): Promise<IdentityCredential> {
      try {
        return normalizeCredential(await plugin.requestCredential({ mode }));
      } catch (error) {
        if (error instanceof IdentityCredentialError) throw error;
        throw normalizeError(error);
      }
    },
    async clearCredentialState(): Promise<void> {
      try {
        await plugin.clearCredentialState();
      } catch (error) {
        throw normalizeError(error);
      }
    }
  };
}
