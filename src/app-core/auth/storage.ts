import { removeStorage, STORAGE_KEYS } from "../storageKeys.ts";

const AUTH_CSRF_TOKEN_KEY = STORAGE_KEYS.CSRF_TOKEN;
const GOOGLE_AUTH_TOKEN_KEY = STORAGE_KEYS.GOOGLE_ID_TOKEN;
export const GOOGLE_AUTH_PROFILE_CACHE_KEY = STORAGE_KEYS.GOOGLE_PROFILE_CACHE;
export const GOOGLE_AUTO_SIGNIN_DISABLED_KEY = STORAGE_KEYS.GOOGLE_AUTO_SIGNIN_DISABLED;

let hydratedStorageRef: unknown;
let hydratedSecrets = false;
let storedCsrfToken = "";
let storedGoogleIdToken = "";
let storedSessionUserId = "";

function readTrimmedStorageValue(key: string): string {
  try {
    return (localStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function clearInMemorySecrets(): void {
  storedCsrfToken = "";
  storedGoogleIdToken = "";
  storedSessionUserId = "";
}

function getCurrentStorageRef(): unknown {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function hydrateSecretStorage(): void {
  const currentStorageRef = getCurrentStorageRef();
  if (hydratedSecrets && currentStorageRef === hydratedStorageRef) {
    return;
  }

  if (currentStorageRef !== hydratedStorageRef) {
    clearInMemorySecrets();
  }

  hydratedStorageRef = currentStorageRef;
  hydratedSecrets = true;

  storedCsrfToken = readTrimmedStorageValue(AUTH_CSRF_TOKEN_KEY);
  storedGoogleIdToken = readTrimmedStorageValue(GOOGLE_AUTH_TOKEN_KEY);

  removeStorage(AUTH_CSRF_TOKEN_KEY);
  removeStorage(GOOGLE_AUTH_TOKEN_KEY);
}

export function primeStoredAuthSecretsFromStorage(): void {
  hydrateSecretStorage();
}

export function getStoredCsrfToken(): string {
  hydrateSecretStorage();
  return storedCsrfToken;
}

export function setStoredCsrfToken(token: string): void {
  hydrateSecretStorage();
  storedCsrfToken = String(token || "").trim();
  removeStorage(AUTH_CSRF_TOKEN_KEY);
}

export function clearStoredCsrfToken(): void {
  hydrateSecretStorage();
  storedCsrfToken = "";
  removeStorage(AUTH_CSRF_TOKEN_KEY);
}

export function getStoredGoogleIdToken(): string {
  hydrateSecretStorage();
  return storedGoogleIdToken;
}

export function setStoredGoogleIdToken(token: string): void {
  hydrateSecretStorage();
  storedGoogleIdToken = String(token || "").trim();
  removeStorage(GOOGLE_AUTH_TOKEN_KEY);
}

export function clearStoredGoogleIdToken(): void {
  hydrateSecretStorage();
  storedGoogleIdToken = "";
  removeStorage(GOOGLE_AUTH_TOKEN_KEY);
}

export function getStoredSessionUserId(): string {
  hydrateSecretStorage();
  return storedSessionUserId;
}

export function setStoredSessionUserId(userId: string): void {
  hydrateSecretStorage();
  storedSessionUserId = String(userId || "").trim();
}

export function clearStoredSessionUserId(): void {
  hydrateSecretStorage();
  storedSessionUserId = "";
}

export function clearStoredGoogleProfileCache(): void {
  removeStorage(GOOGLE_AUTH_PROFILE_CACHE_KEY);
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
