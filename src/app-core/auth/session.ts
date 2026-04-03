import type { AppContext } from "../context-app.ts";
import {
  clearStoredCsrfToken,
  getStoredGoogleIdToken
} from "./storage.ts";
import {
  clearStoredGoogleIdToken,
  clearStoredGoogleProfileCache
} from "./providers/google.ts";
import { hasServerSession } from "./state.ts";

export type FrontendAuthMode = "session-preferred" | "bearer-required";

function canPreferServerSession(requestUrl?: string): boolean {
  if (!hasServerSession()) return false;
  if (!requestUrl) return true;

  try {
    const currentOrigin = globalThis.window?.location?.origin?.trim();
    if (!currentOrigin) return true;
    return new URL(requestUrl, currentOrigin).origin === currentOrigin;
  } catch {
    return true;
  }
}

export function buildAuthenticatedHeaders(
  mode: FrontendAuthMode,
  extraHeaders: Record<string, string> = {},
  requestUrl?: string
): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };
  const googleIdToken = getStoredGoogleIdToken();
  const shouldAttachBearer = mode === "bearer-required" || !canPreferServerSession(requestUrl);

  if (googleIdToken && shouldAttachBearer) {
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

