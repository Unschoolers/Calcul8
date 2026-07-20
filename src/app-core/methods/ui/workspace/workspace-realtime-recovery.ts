import { fetchAuthoritativeLivePricing } from "../../lot-live-pricing-api.ts";
import { fetchAuthoritativeSales } from "../../lot-sales-api.ts";
import type { WorkspaceRealtimeContext } from "../../../context/workspace.ts";
import { reconcileIncomingLivePricingSnapshot } from "../sync/lot-entity-polling.ts";
import { createSyncPayload, getSyncPayloadSignature } from "../sync/sync-payload.ts";
import {
  clearRealtimeRecoveredTimeout,
  getRealtimeSocketState,
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

async function refreshActiveLotState(app: WorkspaceRealtimeContext, lotId: number): Promise<void> {
  const [sales, livePricing] = await Promise.all([
    fetchAuthoritativeSales(app, lotId),
    fetchAuthoritativeLivePricing(app, lotId)
  ]);

  if (Array.isArray(sales) && app.currentLotId === lotId) {
    app.sales = sales;
  }

  if (livePricing && app.currentLotId === lotId) {
    reconcileIncomingLivePricingSnapshot(app, livePricing);
  }
}

async function performWorkspaceRealtimeCatchUp(app: WorkspaceRealtimeContext): Promise<void> {
  const lotId = Math.floor(Number(app.currentLotId));
  const broadSyncAllowed = isWorkspaceRealtimeSyncClean(app);

  try {
    if (Number.isFinite(lotId) && lotId > 0) {
      await refreshActiveLotState(app, lotId);
    }

    if (!broadSyncAllowed) {
      setWorkspaceRealtimeStatus(app, "stale");
      return;
    }

    await app.pullCloudSync();
    markRecoveredThenConnected(app);
  } catch {
    setWorkspaceRealtimeStatus(app, "stale");
  }
}

export async function runWorkspaceRealtimeCatchUp(
  app: WorkspaceRealtimeContext,
  _options: { reason: WorkspaceRealtimeCatchUpReason }
): Promise<void> {
  const state = getRealtimeSocketState(app as object);
  if (state.catchUpPromise) return state.catchUpPromise;

  clearRealtimeRecoveredTimeout(state);
  setWorkspaceRealtimeStatus(app, "catching_up");
  state.catchUpPromise = performWorkspaceRealtimeCatchUp(app)
    .finally(() => {
      state.catchUpPromise = null;
    });
  return state.catchUpPromise;
}
