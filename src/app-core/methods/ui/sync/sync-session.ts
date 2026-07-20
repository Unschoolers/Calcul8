import type { SyncCoordinatorState } from "./sync-coordinator.ts";
import { getSyncCoordinatorState } from "./sync-coordinator.ts";
import type { SyncServiceContext } from "../../../context/sync.ts";
import type { SyncPushOptions, SyncServiceDeps } from "./sync-service.ts";
import { resolveSyncScopeContext, toSyncScopeContext, type SyncScopeContext } from "./sync-scope.ts";
import type { SyncPayload } from "./sync-payload.ts";

export type SyncSession = {
  app: SyncServiceContext;
  deps: SyncServiceDeps;
  scope: SyncScopeContext;
  state: SyncCoordinatorState;
  baseUrl: string;
  markOffline(): void;
  getStoredClientVersion(): number;
  setStoredClientVersion(version: number): void;
  createPayload(clientVersion?: number): SyncPayload;
  getPayloadSignature(payload: SyncPayload): string;
  getCurrentPayloadSignature(): string;
  setLastSyncedPayloadHash(signature: string | null): void;
  requestPull(): Promise<Response>;
  requestPush(payload: SyncPayload): Promise<Response>;
  handleWorkspaceAccessLost(): Promise<void>;
};

export function createSyncSession(
  app: SyncServiceContext,
  deps: SyncServiceDeps,
  options: SyncPushOptions = {}
): SyncSession {
  const scope = options.scopeOverride ? toSyncScopeContext(options.scopeOverride) : resolveSyncScopeContext(app);
  const state = getSyncCoordinatorState(app as object, scope.scopeKey);
  const baseUrl = deps.resolveApiBaseUrl();

  return {
    app,
    deps,
    scope,
    state,
    baseUrl,
    markOffline(): void {
      app.isOffline = true;
      app.startOfflineReconnectScheduler();
    },
    getStoredClientVersion(): number {
      return deps.getStoredClientVersion(scope);
    },
    setStoredClientVersion(version: number): void {
      deps.setStoredClientVersion(scope, version);
    },
    createPayload(clientVersion?: number): SyncPayload {
      return deps.createSyncPayload(app, clientVersion, scope);
    },
    getPayloadSignature(payload: SyncPayload): string {
      return deps.getSyncPayloadSignature(payload);
    },
    getCurrentPayloadSignature(): string {
      return deps.getSyncPayloadSignature(deps.createSyncPayload(app, undefined, scope));
    },
    setLastSyncedPayloadHash(signature: string | null): void {
      app.lastSyncedPayloadHash = signature ?? "";
      deps.setStoredLastSyncedPayloadHash(scope, signature);
    },
    requestPull(): Promise<Response> {
      return deps.requestCloudSyncPull(
        baseUrl,
        scope.scopeType === "workspace" ? scope.workspaceId ?? undefined : undefined,
        "session-preferred"
      );
    },
    requestPush(payload: SyncPayload): Promise<Response> {
      return deps.requestCloudSyncPush(baseUrl, payload, "session-preferred");
    },
    handleWorkspaceAccessLost(): Promise<void> {
      if (scope.scopeType !== "workspace") {
        return Promise.resolve();
      }
      return app.handleWorkspaceAccessLost(scope.workspaceId ?? undefined);
    }
  };
}
