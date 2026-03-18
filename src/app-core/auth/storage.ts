import {
  getLegacyStorageKeys,
  removeStorageWithLegacy,
  STORAGE_KEYS
} from "../storageKeys.ts";

const LEGACY_KEYS = getLegacyStorageKeys();

export const AUTH_CSRF_TOKEN_KEY = STORAGE_KEYS.CSRF_TOKEN;
export const GOOGLE_AUTH_TOKEN_KEY = STORAGE_KEYS.GOOGLE_ID_TOKEN;
export const GOOGLE_AUTH_PROFILE_CACHE_KEY = STORAGE_KEYS.GOOGLE_PROFILE_CACHE;
export const GOOGLE_AUTO_SIGNIN_DISABLED_KEY = STORAGE_KEYS.GOOGLE_AUTO_SIGNIN_DISABLED;

export function getStoredCsrfToken(): string {
  return (localStorage.getItem(AUTH_CSRF_TOKEN_KEY) || "").trim();
}

export function setStoredCsrfToken(token: string): void {
  localStorage.setItem(AUTH_CSRF_TOKEN_KEY, token);
}

export function clearStoredCsrfToken(): void {
  removeStorageWithLegacy(AUTH_CSRF_TOKEN_KEY);
}

export function getStoredGoogleIdToken(): string {
  return (localStorage.getItem(GOOGLE_AUTH_TOKEN_KEY) || "").trim();
}

export function setStoredGoogleIdToken(token: string): void {
  localStorage.setItem(GOOGLE_AUTH_TOKEN_KEY, token);
}

export function clearStoredGoogleIdToken(): void {
  removeStorageWithLegacy(GOOGLE_AUTH_TOKEN_KEY, LEGACY_KEYS.GOOGLE_ID_TOKEN);
}

export function clearStoredGoogleProfileCache(): void {
  removeStorageWithLegacy(GOOGLE_AUTH_PROFILE_CACHE_KEY, LEGACY_KEYS.GOOGLE_PROFILE_CACHE);
}

export function isGoogleAutoSignInDisabled(): boolean {
  return (localStorage.getItem(GOOGLE_AUTO_SIGNIN_DISABLED_KEY) || "").trim() === "1";
}

export function disableGoogleAutoSignIn(): void {
  localStorage.setItem(GOOGLE_AUTO_SIGNIN_DISABLED_KEY, "1");
}

export function enableGoogleAutoSignIn(): void {
  localStorage.removeItem(GOOGLE_AUTO_SIGNIN_DISABLED_KEY);
}
