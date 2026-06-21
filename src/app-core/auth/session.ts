import type { AppContext } from "../context-app.ts";
import {
  clearStoredCsrfToken,
  clearStoredSessionUserId,
  getStoredGoogleIdToken
} from "./storage.ts";
import {
  clearStoredGoogleIdToken,
  clearStoredGoogleProfileCache
} from "./providers/google.ts";

export type FrontendAuthMode = "session-preferred" | "bearer-required";

export function buildAuthenticatedHeaders(
  mode: FrontendAuthMode,
  extraHeaders: Record<string, string> = {},
  requestUrl?: string
): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };
  const googleIdToken = getStoredGoogleIdToken();
  void requestUrl;
  const shouldAttachBearer = mode === "bearer-required";

  if (googleIdToken && shouldAttachBearer) {
    headers.Authorization = `Bearer ${googleIdToken}`;
  }

  return headers;
}

export function handleExpiredAuthState(app: Pick<AppContext, "googleAuthEpoch" | "hasProAccess">): void {
  clearStoredGoogleIdToken();
  clearStoredGoogleProfileCache();
  clearStoredSessionUserId();
  clearStoredCsrfToken();
  app.googleAuthEpoch += 1;
}

