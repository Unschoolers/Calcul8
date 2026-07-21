import type { AuthSessionContext } from "../context/auth.ts";
import {
  clearStoredCsrfToken,
  clearStoredSessionUserId
} from "./storage.ts";
import {
  clearStoredGoogleIdToken,
  clearStoredGoogleProfileCache
} from "./providers/google.ts";

export function buildSessionHeaders(
  extraHeaders: Record<string, string> = {}
): Record<string, string> {
  return { ...extraHeaders };
}

export function buildBootstrapBearerHeaders(
  googleIdToken: string,
  extraHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers = { ...extraHeaders };
  const token = googleIdToken.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function handleExpiredAuthState(app: AuthSessionContext): void {
  clearStoredGoogleIdToken();
  clearStoredGoogleProfileCache();
  clearStoredSessionUserId();
  clearStoredCsrfToken();
  app.googleAuthEpoch += 1;
}

