type WorkspaceConfigSyncApp = {
  activeScopeType: "personal" | "workspace";
  activeWorkspaceId: string | null;
  currentLotId: number | null;
  isOffline: boolean;
  pushCloudSync(force?: boolean, options?: { allowEmptyOverwrite?: boolean }): Promise<void>;
};

type WorkspaceConfigSyncState = {
  timeoutId: number | null;
};

const WORKSPACE_CONFIG_SYNC_DEBOUNCE_MS = 400;
const workspaceConfigSyncStateByApp = new WeakMap<object, WorkspaceConfigSyncState>();

function getWorkspaceConfigSyncState(app: object): WorkspaceConfigSyncState {
  let state = workspaceConfigSyncStateByApp.get(app);
  if (!state) {
    state = {
      timeoutId: null
    };
    workspaceConfigSyncStateByApp.set(app, state);
  }
  return state;
}

function canQueueWorkspaceConfigSync(app: WorkspaceConfigSyncApp): boolean {
  if (app.activeScopeType !== "workspace") return false;
  if (!String(app.activeWorkspaceId ?? "").trim()) return false;
  if (app.isOffline) return false;
  return Number.isFinite(Number(app.currentLotId)) && Number(app.currentLotId) > 0;
}

export function queueWorkspaceConfigSyncPush(app: WorkspaceConfigSyncApp): void {
  if (!canQueueWorkspaceConfigSync(app)) return;

  const state = getWorkspaceConfigSyncState(app as object);
  if (state.timeoutId != null) {
    globalThis.clearTimeout(state.timeoutId);
  }

  state.timeoutId = globalThis.setTimeout(() => {
    state.timeoutId = null;
    void app.pushCloudSync();
  }, WORKSPACE_CONFIG_SYNC_DEBOUNCE_MS);
}

export function stopWorkspaceConfigSyncPush(app: object): void {
  const state = workspaceConfigSyncStateByApp.get(app);
  if (!state || state.timeoutId == null) return;
  globalThis.clearTimeout(state.timeoutId);
  state.timeoutId = null;
}
