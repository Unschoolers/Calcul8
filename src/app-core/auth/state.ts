import {
  getStoredCsrfToken,
  getStoredGoogleIdToken,
  getStoredSessionUserId
} from "./storage.ts";

export function hasServerSession(): boolean {
  return getStoredCsrfToken().length > 0;
}

export function hasGoogleBootstrapToken(): boolean {
  return getStoredGoogleIdToken().length > 0;
}

export function hasAuthSignal(): boolean {
  return hasGoogleBootstrapToken() || hasServerSession() || getStoredSessionUserId().length > 0;
}
