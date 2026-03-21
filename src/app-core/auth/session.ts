import type { AppContext } from "../context.ts";
import {
  clearStoredCsrfToken,
  getStoredCsrfToken,
  getStoredGoogleIdToken
} from "./storage.ts";
import {
  clearStoredGoogleIdToken,
  clearStoredGoogleProfileCache
} from "./providers/google.ts";

export type FrontendAuthMode = "session-preferred" | "bearer-required";

export function buildAuthenticatedHeaders(
  mode: FrontendAuthMode,
  extraHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };
  const googleIdToken = getStoredGoogleIdToken();

  if (googleIdToken) {
    headers.Authorization = `Bearer ${googleIdToken}`;
  }

  return headers;
}

export function handleExpiredAuthState(app: Pick<AppContext, "googleAuthEpoch" | "hasProAccess">): void {
  clearStoredGoogleIdToken();
  clearStoredGoogleProfileCache();
  clearStoredCsrfToken();
  app.googleAuthEpoch += 1;
}
