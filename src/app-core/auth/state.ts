import { getStoredCsrfToken, getStoredGoogleIdToken } from "./storage.ts";

export function hasServerSession(): boolean {
  return getStoredCsrfToken().length > 0;
}

export function hasGoogleBootstrapToken(): boolean {
  return getStoredGoogleIdToken().length > 0;
}
