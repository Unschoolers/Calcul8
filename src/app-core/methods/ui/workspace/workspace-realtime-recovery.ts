import { fetchAuthoritativeLivePricing } from "../../lot-live-pricing-api.ts";
import { fetchAuthoritativeSales } from "../../lot-sales-api.ts";
import type { WorkspaceRealtimeContext } from "../../../context/workspace.ts";
import { hasUnsavedLivePricingChanges, reconcileIncomingLivePricingSnapshot } from "../sync/lot-entity-polling.ts";
import { createSyncPayload, getSyncPayloadSignature } from "../sync/sync-payload.ts";
import { captureWorkspaceScopeGuard, getWorkspaceScopeRevision, resolveWorkspaceScopeContext } from "../../../workspace-scope.ts";
import {
  clearRealtimeRecoveredTimeout,
  getRealtimeSocketState,
  getWorkspaceRealtimeApplyRevision,
  setWorkspaceRealtimeStatus
} from "./workspace-realtime-state.ts";

export type WorkspaceRealtimeCatchUpReason =
  | "manual"
  | "subscribed"
  | "reconnected"
  | "uncertain-event";

const RECOVERED_STATUS_MS = 2500;

export function isWorkspaceRealtimeSyncClean(app: WorkspaceRealtimeContext): boolean {
  const expectedSignature = String(app.lastSyncedPayloadHash ?? "").trim();
  if (!expectedSignature) return false;

  const currentSignature = getSyncPayloadSignature(createSyncPayload({
    lots: app.lots,
    currentLotId: app.currentLotId,
    wheelConfigs: app.wheelConfigs,
    activeWheelConfigId: app.activeWheelConfigId,
    systemPricingDefaults: app.systemPricingDefaults,
    workspaceId: app.activeWorkspaceId
  }));

  return currentSignature === expectedSignature;
}

function markRecoveredThenConnected(app: WorkspaceRealtimeContext): void {
  const state = getRealtimeSocketState(app as object);
  clearRealtimeRecoveredTimeout(state);
  setWorkspaceRealtimeStatus(app, "recovered");
  state.recoveredTimeoutId = Number(globalThis.setTimeout(() => {
    if (app.workspaceRealtimeStatus === "recovered") {
      setWorkspaceRealtimeStatus(app, "connected");
    }
    state.recoveredTimeoutId = null;
  }, RECOVERED_STATUS_MS));
}

async function refreshActiveLotState(
  app: WorkspaceRealtimeContext,
  lotId: number,
  isRequestCurrent: () => boolean
): Promise<void> {
  const scope = resolveWorkspaceScopeContext(app);
  const [sales, livePricing] = await Promise.all([
    fetchAuthoritativeSales(app, lotId, {
      cache: false,
      scope: { scopeType: scope.scopeType, workspaceId: scope.workspaceId },
      isRequestCurrent
    }),
    fetchAuthoritativeLivePricing(app, lotId, {
      scope: { scopeType: scope.scopeType, workspaceId: scope.workspaceId },
      isRequestCurrent
    })
  ]);

  if (Array.isArray(sales) && isRequestCurrent()) {
    app.sales = sales;
  }

  if (livePricing && isRequestCurrent()) {
    reconcileIncomingLivePricingSnapshot(app, livePricing);
  }
}

async function performWorkspaceRealtimeCatchUp(app: WorkspaceRealtimeContext): Promise<void> {
  const capturedLotId = app.currentLotId;
  const lotId = Math.floor(Number(capturedLotId));
  const lotHydrationRevision = Number(app.lotHydrationRevision) || 0;
  const isCurrentScope = captureWorkspaceScopeGuard(app);
  const realtimeApplyRevision = getWorkspaceRealtimeApplyRevision(app as object);
  const expectedPayloadSignature = getSyncPayloadSignature(createSyncPayload({
    lots: app.lots,
    currentLotId: app.currentLotId,
    wheelConfigs: app.wheelConfigs,
    activeWheelConfigId: app.activeWheelConfigId,
    systemPricingDefaults: app.systemPricingDefaults,
    workspaceId: app.activeWorkspaceId
  }));
  const isRequestCurrent = () => isCurrentScope()
    && app.currentLotId === capturedLotId
    && (Number(app.lotHydrationRevision) || 0) === lotHydrationRevision
    && getWorkspaceRealtimeApplyRevision(app as object) === realtimeApplyRevision;
  const broadSyncAllowed = isWorkspaceRealtimeSyncClean(app) && !hasUnsavedLivePricingChanges(app);
  const isBroadSyncRequestCurrent = () => isRequestCurrent()
    && isWorkspaceRealtimeSyncClean(app)
    && !hasUnsavedLivePricingChanges(app)
    && getSyncPayloadSignature(createSyncPayload({
      lots: app.lots,
      currentLotId: app.currentLotId,
      wheelConfigs: app.wheelConfigs,
      activeWheelConfigId: app.activeWheelConfigId,
      systemPricingDefaults: app.systemPricingDefaults,
      workspaceId: app.activeWorkspaceId
    })) === expectedPayloadSignature;
  const markStaleIfScopeCurrent = () => {
    if (isCurrentScope()) setWorkspaceRealtimeStatus(app, "stale");
  };

  try {
    if (Number.isFinite(lotId) && lotId > 0) {
      await refreshActiveLotState(app, lotId, isRequestCurrent);
    }

    if (!isRequestCurrent()) {
      markStaleIfScopeCurrent();
      return;
    }
    if (!broadSyncAllowed) {
      setWorkspaceRealtimeStatus(app, "stale");
      return;
    }

    const outcome = await app.pullCloudSync(false, {
      expectedPayloadSignature,
      isRequestCurrent: isBroadSyncRequestCurrent
    });
    if (outcome.kind !== "confirmed" && !isBroadSyncRequestCurrent()) {
      markStaleIfScopeCurrent();
      return;
    }
    if (outcome.kind === "confirmed"
        && isCurrentScope()
        && app.currentLotId === capturedLotId
        && getWorkspaceRealtimeApplyRevision(app as object) === realtimeApplyRevision) {
      markRecoveredThenConnected(app);
    }
    else setWorkspaceRealtimeStatus(app, "stale");
  } catch {
    markStaleIfScopeCurrent();
  }
}

export async function runWorkspaceRealtimeCatchUp(
  app: WorkspaceRealtimeContext,
  options: { reason: WorkspaceRealtimeCatchUpReason }
): Promise<void> {
  const state = getRealtimeSocketState(app as object);
  const visitKey = JSON.stringify({
    scopeRevision: getWorkspaceScopeRevision(app),
    scope: resolveWorkspaceScopeContext(app).scopeKey,
    authEpoch: app.googleAuthEpoch,
    lotId: app.currentLotId,
    lotHydrationRevision: Number(app.lotHydrationRevision) || 0,
    realtimeApplyRevision: getWorkspaceRealtimeApplyRevision(app as object)
  });
  if (state.catchUpPromise) {
    if (state.catchUpVisitKey !== visitKey && !state.pendingCatchUpReason) {
      state.pendingCatchUpReason = options.reason;
    }
    return state.catchUpPromise;
  }

  clearRealtimeRecoveredTimeout(state);
  setWorkspaceRealtimeStatus(app, "catching_up");
  state.catchUpVisitKey = visitKey;
  state.catchUpPromise = performWorkspaceRealtimeCatchUp(app)
    .finally(() => {
      state.catchUpPromise = null;
      state.catchUpVisitKey = null;
      const pendingReason = state.pendingCatchUpReason;
      state.pendingCatchUpReason = null;
      if (pendingReason) {
        void Promise.resolve().then(() => runWorkspaceRealtimeCatchUp(app, { reason: pendingReason }));
      }
    });
  return state.catchUpPromise;
}
