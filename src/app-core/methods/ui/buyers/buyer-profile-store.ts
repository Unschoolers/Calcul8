import type {
  BuyerProfile,
  BuyerProfilePendingMutation,
  BuyerProfilesLoadStatus,
  BuyerProfileSaveState
} from "../../../../types/app.ts";
import { buildBuyerProfileIndex, normalizeBuyerProfileTags } from "../../../buyer-profile.ts";
import type { AppStorageScope } from "../../../storageKeys.ts";
import { getActiveStorageScope } from "../../../workspace-scope.ts";
import { normalizeBuyerKey } from "../../../computed/buyer-quick-view.ts";
import { SalesLiveApiError, createMutationId } from "../../entity-api-shared.ts";
import {
  canUseBuyerProfileApi,
  deleteBuyerProfileFromApi,
  fetchBuyerProfilesFromApi,
  upsertBuyerProfileToApi,
  type BuyerProfileApiApp,
  type BuyerProfileMutationRequest
} from "./buyer-profile-api.ts";
import {
  readBuyerProfileOutbox,
  readCachedBuyerProfiles,
  writeBuyerProfileOutbox,
  writeCachedBuyerProfiles
} from "./buyer-profile-cache.ts";

export interface BuyerProfileStoreApp extends BuyerProfileApiApp {
  buyerProfilesByKey: Record<string, BuyerProfile>;
  buyerProfilesScopeKey: string;
  buyerProfilesLoadStatus: BuyerProfilesLoadStatus;
  buyerProfileSaveStates: Record<string, BuyerProfileSaveState>;
  buyerProfilePendingMutations: BuyerProfilePendingMutation[];
  isOffline: boolean;
}

export interface BuyerProfileDraft {
  username: string;
  preferredName?: string;
  tags: string[];
}

export interface BuyerProfileStoreDependencies {
  readCache(scope: AppStorageScope): BuyerProfile[];
  writeCache(scope: AppStorageScope, profiles: BuyerProfile[]): void;
  readOutbox(scope: AppStorageScope): BuyerProfilePendingMutation[];
  writeOutbox(scope: AppStorageScope, mutations: BuyerProfilePendingMutation[]): void;
  canUseApi(): boolean;
  fetchProfiles(app: BuyerProfileApiApp): Promise<BuyerProfile[]>;
  upsertProfile(app: BuyerProfileApiApp, input: BuyerProfileMutationRequest): Promise<BuyerProfile>;
  deleteProfile(
    app: BuyerProfileApiApp,
    input: Pick<BuyerProfileMutationRequest, "username" | "baseVersion" | "mutationId">
  ): Promise<{ version: number }>;
  createMutationId(prefix: string): string;
  now(): string;
}

const defaultDependencies: BuyerProfileStoreDependencies = {
  readCache: readCachedBuyerProfiles,
  writeCache: writeCachedBuyerProfiles,
  readOutbox: readBuyerProfileOutbox,
  writeOutbox: writeBuyerProfileOutbox,
  canUseApi: canUseBuyerProfileApi,
  fetchProfiles: fetchBuyerProfilesFromApi,
  upsertProfile: upsertBuyerProfileToApi,
  deleteProfile: deleteBuyerProfileFromApi,
  createMutationId,
  now: () => new Date().toISOString()
};

function scopeKey(scope: AppStorageScope): string {
  return scope.scopeType === "workspace" && scope.workspaceId
    ? `workspace:${String(scope.workspaceId).trim()}`
    : "personal";
}

function activeScope(app: BuyerProfileStoreApp): AppStorageScope {
  return getActiveStorageScope(app);
}

function profileValues(app: BuyerProfileStoreApp): BuyerProfile[] {
  return Object.values(app.buyerProfilesByKey);
}

function setProfiles(app: BuyerProfileStoreApp, scope: AppStorageScope, profiles: BuyerProfile[]): void {
  app.buyerProfilesByKey = buildBuyerProfileIndex(profiles);
  app.buyerProfilesScopeKey = scopeKey(scope);
}

function cleanPreferredName(value: unknown): string | undefined {
  const preferredName = String(value ?? "").trim().replace(/\s+/g, " ");
  return preferredName.slice(0, 80) || undefined;
}

function replacePendingMutation(
  mutations: BuyerProfilePendingMutation[],
  next: BuyerProfilePendingMutation
): BuyerProfilePendingMutation[] {
  const key = normalizeBuyerKey(next.username);
  return [...mutations.filter((mutation) => normalizeBuyerKey(mutation.username) !== key), next];
}

function removePendingMutation(
  mutations: BuyerProfilePendingMutation[],
  mutationId: string
): BuyerProfilePendingMutation[] {
  return mutations.filter((mutation) => mutation.mutationId !== mutationId);
}

function persistLocalState(
  app: BuyerProfileStoreApp,
  scope: AppStorageScope,
  deps: BuyerProfileStoreDependencies
): void {
  deps.writeCache(scope, profileValues(app));
  deps.writeOutbox(scope, app.buyerProfilePendingMutations);
}

export async function hydrateBuyerProfilesForActiveScope(
  app: BuyerProfileStoreApp,
  deps: BuyerProfileStoreDependencies = defaultDependencies
): Promise<void> {
  const scope = activeScope(app);
  const expectedScopeKey = scopeKey(scope);
  setProfiles(app, scope, deps.readCache(scope));
  app.buyerProfilePendingMutations = deps.readOutbox(scope);
  app.buyerProfilesLoadStatus = "loading";
  if (app.isOffline || !deps.canUseApi()) {
    app.buyerProfilesLoadStatus = "loaded";
    return;
  }

  try {
    const profiles = await deps.fetchProfiles(app);
    if (scopeKey(activeScope(app)) !== expectedScopeKey) return;
    setProfiles(app, scope, profiles);
    deps.writeCache(scope, profiles);
    app.buyerProfilesLoadStatus = "loaded";
  } catch (error) {
    if (scopeKey(activeScope(app)) !== expectedScopeKey) return;
    app.buyerProfilesLoadStatus = "error";
    console.warn("Failed to hydrate buyer profiles", error);
  }
}

async function submitMutation(
  app: BuyerProfileStoreApp,
  mutation: BuyerProfilePendingMutation,
  deps: BuyerProfileStoreDependencies
): Promise<"saved" | "pending" | "conflict" | "error"> {
  const scope = activeScope(app);
  const expectedScopeKey = scopeKey(scope);
  const key = normalizeBuyerKey(mutation.username);
  if (app.isOffline || !deps.canUseApi()) {
    app.buyerProfileSaveStates[key] = "pending";
    return "pending";
  }

  app.buyerProfileSaveStates[key] = "saving";
  try {
    if (mutation.operation === "delete") {
      await deps.deleteProfile(app, mutation);
      if (scopeKey(activeScope(app)) !== expectedScopeKey) return "saved";
      const next = { ...app.buyerProfilesByKey };
      delete next[key];
      app.buyerProfilesByKey = next;
    } else {
      const profile = await deps.upsertProfile(app, mutation);
      if (scopeKey(activeScope(app)) !== expectedScopeKey) return "saved";
      app.buyerProfilesByKey = { ...app.buyerProfilesByKey, [key]: profile };
    }
    app.buyerProfilePendingMutations = removePendingMutation(
      app.buyerProfilePendingMutations,
      mutation.mutationId
    );
    app.buyerProfileSaveStates[key] = "idle";
    persistLocalState(app, scope, deps);
    return "saved";
  } catch (error) {
    if (scopeKey(activeScope(app)) !== expectedScopeKey) return "error";
    if (error instanceof SalesLiveApiError && error.status === 409) {
      app.buyerProfileSaveStates[key] = "conflict";
      deps.writeOutbox(scope, app.buyerProfilePendingMutations);
      return "conflict";
    }
    if (error instanceof SalesLiveApiError && (error.status === 0 || error.status === 401)) {
      app.buyerProfileSaveStates[key] = "pending";
      deps.writeOutbox(scope, app.buyerProfilePendingMutations);
      return "pending";
    }
    app.buyerProfileSaveStates[key] = "error";
    deps.writeOutbox(scope, app.buyerProfilePendingMutations);
    return "error";
  }
}

export async function saveBuyerProfileForApp(
  app: BuyerProfileStoreApp,
  rawDraft: BuyerProfileDraft,
  deps: BuyerProfileStoreDependencies = defaultDependencies
): Promise<"saved" | "pending" | "conflict" | "error"> {
  const scope = activeScope(app);
  const currentScopeKey = scopeKey(scope);
  if (app.buyerProfilesScopeKey !== currentScopeKey) {
    setProfiles(app, scope, deps.readCache(scope));
    app.buyerProfilePendingMutations = deps.readOutbox(scope);
  }
  const username = String(rawDraft.username ?? "").trim().replace(/\s+/g, " ");
  const key = normalizeBuyerKey(username);
  if (!key) return "error";
  const preferredName = cleanPreferredName(rawDraft.preferredName);
  const tags = normalizeBuyerProfileTags(rawDraft.tags);
  const existing = app.buyerProfilesByKey[key];
  const operation = preferredName || tags.length > 0 ? "upsert" : "delete";
  const mutation: BuyerProfilePendingMutation = {
    mutationId: deps.createMutationId("buyer-profile"),
    operation,
    username,
    preferredName,
    tags,
    baseVersion: existing?.version ?? 0,
    queuedAt: deps.now()
  };
  app.buyerProfilePendingMutations = replacePendingMutation(app.buyerProfilePendingMutations, mutation);

  if (operation === "delete") {
    const next = { ...app.buyerProfilesByKey };
    delete next[key];
    app.buyerProfilesByKey = next;
  } else {
    app.buyerProfilesByKey = {
      ...app.buyerProfilesByKey,
      [key]: {
        username,
        preferredName,
        tags,
        createdAt: existing?.createdAt ?? mutation.queuedAt,
        updatedAt: mutation.queuedAt,
        version: existing?.version ?? 0
      }
    };
  }
  app.buyerProfileSaveStates[key] = "pending";
  persistLocalState(app, scope, deps);
  return submitMutation(app, mutation, deps);
}

export async function retryPendingBuyerProfilesForApp(
  app: BuyerProfileStoreApp,
  deps: BuyerProfileStoreDependencies = defaultDependencies
): Promise<void> {
  for (const mutation of [...app.buyerProfilePendingMutations]) {
    const state = app.buyerProfileSaveStates[normalizeBuyerKey(mutation.username)];
    if (state === "saving" || state === "conflict") continue;
    await submitMutation(app, mutation, deps);
  }
}

export async function resolveBuyerProfileConflictForApp(
  app: BuyerProfileStoreApp,
  username: string,
  strategy: "retry" | "reload",
  deps: BuyerProfileStoreDependencies = defaultDependencies
): Promise<"saved" | "pending" | "error" | "reloaded"> {
  const scope = activeScope(app);
  const expectedScopeKey = scopeKey(scope);
  const key = normalizeBuyerKey(username);
  const pending = app.buyerProfilePendingMutations.find(
    (mutation) => normalizeBuyerKey(mutation.username) === key
  );
  if (!key || !pending) return "reloaded";
  if (app.isOffline || !deps.canUseApi()) {
    app.buyerProfileSaveStates[key] = "pending";
    return "pending";
  }

  try {
    const remoteProfiles = await deps.fetchProfiles(app);
    if (scopeKey(activeScope(app)) !== expectedScopeKey) return "error";
    setProfiles(app, scope, remoteProfiles);
    const latest = app.buyerProfilesByKey[key];

    if (strategy === "reload") {
      app.buyerProfilePendingMutations = app.buyerProfilePendingMutations.filter(
        (mutation) => normalizeBuyerKey(mutation.username) !== key
      );
      app.buyerProfileSaveStates[key] = "idle";
      persistLocalState(app, scope, deps);
      return "reloaded";
    }

    const rebasedMutation: BuyerProfilePendingMutation = {
      ...pending,
      baseVersion: latest?.version ?? 0
    };
    app.buyerProfilePendingMutations = replacePendingMutation(
      app.buyerProfilePendingMutations,
      rebasedMutation
    );
    if (rebasedMutation.operation === "upsert") {
      app.buyerProfilesByKey = {
        ...app.buyerProfilesByKey,
        [key]: {
          username: rebasedMutation.username,
          preferredName: rebasedMutation.preferredName,
          tags: [...rebasedMutation.tags],
          createdAt: latest?.createdAt ?? rebasedMutation.queuedAt,
          updatedAt: rebasedMutation.queuedAt,
          version: latest?.version ?? 0
        }
      };
    }
    app.buyerProfileSaveStates[key] = "pending";
    persistLocalState(app, scope, deps);
    const result = await submitMutation(app, rebasedMutation, deps);
    return result === "conflict" ? "error" : result;
  } catch (error) {
    if (scopeKey(activeScope(app)) === expectedScopeKey) {
      app.buyerProfileSaveStates[key] = "error";
    }
    console.warn("Failed to resolve buyer profile conflict", error);
    return "error";
  }
}
