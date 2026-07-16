import type { AppStorageScope } from "./storageKeys.ts";
import { getWorkspaceScopeKey } from "./workspace-scope.ts";

type StorageFailureMap = WeakMap<object, Map<string, Set<string>>>;

const readFailures: StorageFailureMap = new WeakMap();
const writeFailures: StorageFailureMap = new WeakMap();

function getScopeFailures(
  failures: StorageFailureMap,
  context: object,
  scope: AppStorageScope,
  create: boolean
): Set<string> | null {
  let failuresByScope = failures.get(context);
  if (!failuresByScope && create) {
    failuresByScope = new Map();
    failures.set(context, failuresByScope);
  }
  if (!failuresByScope) return null;

  const scopeKey = getWorkspaceScopeKey(scope);
  let keys = failuresByScope.get(scopeKey);
  if (!keys && create) {
    keys = new Set();
    failuresByScope.set(scopeKey, keys);
  }
  return keys ?? null;
}

function markFailure(
  failures: StorageFailureMap,
  context: object,
  scope: AppStorageScope,
  storageKey: string
): boolean {
  const keys = getScopeFailures(failures, context, scope, true)!;
  const wasNew = !keys.has(storageKey);
  keys.add(storageKey);
  return wasNew;
}

function clearFailure(
  failures: StorageFailureMap,
  context: object,
  scope: AppStorageScope,
  storageKey: string
): void {
  getScopeFailures(failures, context, scope, false)?.delete(storageKey);
}

export function markStorageReadFailure(
  context: object,
  scope: AppStorageScope,
  storageKey: string
): boolean {
  return markFailure(readFailures, context, scope, storageKey);
}

export function clearStorageReadFailure(
  context: object,
  scope: AppStorageScope,
  storageKey: string
): void {
  clearFailure(readFailures, context, scope, storageKey);
}

export function hasStorageReadFailure(context: object, scope: AppStorageScope): boolean {
  return (getScopeFailures(readFailures, context, scope, false)?.size ?? 0) > 0;
}

export function clearStorageReadFailuresForScope(context: object, scope: AppStorageScope): void {
  const failuresByScope = readFailures.get(context);
  failuresByScope?.delete(getWorkspaceScopeKey(scope));
}

export function markStorageWriteFailure(
  context: object,
  scope: AppStorageScope,
  storageKey: string
): boolean {
  return markFailure(writeFailures, context, scope, storageKey);
}

export function clearStorageWriteFailure(
  context: object,
  scope: AppStorageScope,
  storageKey: string
): void {
  clearFailure(writeFailures, context, scope, storageKey);
}
