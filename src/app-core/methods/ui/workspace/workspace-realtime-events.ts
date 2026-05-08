import type { Sale } from "../../../../types/app.ts";
import { getActiveWorkspaceId, resolveWorkspaceScopeContext } from "../../../workspace-scope.ts";
import { removeById, upsertById } from "../../../shared/collection-updaters.ts";
import { normalizeWheelConfigs } from "../../../shared/normalize-wheel-config.ts";
import {
  applyRootWheelSessionSnapshot,
  type RootWheelSessionStateContext
} from "../../../shared/wheel-root-session-state.ts";
import {
  cacheAuthoritativeSales,
  normalizeSale
} from "../../lot-sales-api.ts";
import { normalizeLivePricing } from "../../lot-live-pricing-api.ts";
import { reconcileIncomingLivePricingSnapshot } from "../sync/lot-entity-polling.ts";
import {
  normalizeSyncGameSessionDto
} from "../sync/sync-contracts.ts";
import { createSyncPayload, getSyncPayloadSignature } from "../sync/sync-payload.ts";
import {
  getDesiredRealtimeSubscription,
  type RealtimeApp,
  type RealtimeEventPayload
} from "./workspace-realtime-state.ts";

function upsertRealtimeSale(app: RealtimeApp, lotId: number, nextSale: Sale): void {
  if (app.currentLotId !== lotId) return;

  app.sales = upsertById(app.sales, nextSale);
  cacheAuthoritativeSales(app as never, lotId, app.sales);
}

function deleteRealtimeSale(app: RealtimeApp, lotId: number, saleId: number): void {
  if (app.currentLotId !== lotId) return;

  const nextSales = removeById(app.sales, saleId);
  if (nextSales.length === app.sales.length) return;

  app.sales = nextSales;
  cacheAuthoritativeSales(app as never, lotId, nextSales);
}

function applyWorkspacePresenceSnapshot(
  app: RealtimeApp,
  data: unknown
): void {
  const raw = typeof data === "object" && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const workspaceId = String(raw.workspaceId ?? "").trim();
  if (!workspaceId || workspaceId !== String(getActiveWorkspaceId(app) ?? "").trim()) {
    return;
  }

  const members = Array.isArray(raw.members) ? raw.members : [];
  const nextPresenceByUserId: Record<string, { userId: string; isOnline: boolean; lastSeenAt?: string }> = {};
  for (const member of members) {
    if (typeof member !== "object" || member === null || Array.isArray(member)) continue;
    const candidate = member as Record<string, unknown>;
    const userId = String(candidate.userId ?? "").trim();
    if (!userId) continue;
    nextPresenceByUserId[userId] = {
      userId,
      isOnline: candidate.isOnline === true,
      lastSeenAt: String(candidate.lastSeenAt ?? "").trim() || undefined
    };
  }

  app.workspacePresenceByUserId = nextPresenceByUserId;
}

function isWorkspaceSnapshotSyncClean(app: RealtimeApp): boolean {
  const expectedSignature = String(app.lastSyncedPayloadHash ?? "").trim();
  if (!expectedSignature) return false;

  const currentSignature = getSyncPayloadSignature(createSyncPayload({
    lots: app.lots,
    currentLotId: app.currentLotId,
    sales: app.sales,
    loadSalesForLotId: app.loadSalesForLotId,
    wheelConfigs: app.wheelConfigs,
    activeWheelConfigId: app.activeWheelConfigId,
    workspaceId: getActiveWorkspaceId(app)
  }));
  return currentSignature === expectedSignature;
}

function parseRealtimeEventPayload(app: RealtimeApp, data: unknown): RealtimeEventPayload | null {
  const raw = typeof data === "object" && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const lotId = Number(raw.lotId ?? app.currentLotId);
  if (!Number.isFinite(lotId) || lotId <= 0) return null;
  return {
    lotId: Math.floor(lotId),
    raw
  };
}

function handleSaleUpsertEvent(app: RealtimeApp, payload: RealtimeEventPayload): void {
  const sale = normalizeSale(payload.raw.sale);
  if (sale) {
    upsertRealtimeSale(app, payload.lotId, sale);
  }
}

function handleSaleDeletedEvent(app: RealtimeApp, payload: RealtimeEventPayload): void {
  const saleId = Number(payload.raw.saleId);
  if (Number.isFinite(saleId) && saleId > 0) {
    deleteRealtimeSale(app, payload.lotId, Math.floor(saleId));
  }
}

function handleLivePricingUpdatedEvent(app: RealtimeApp, payload: RealtimeEventPayload): void {
  const livePricing = normalizeLivePricing(payload.raw.livePricing);
  if (livePricing && app.currentLotId === payload.lotId) {
    reconcileIncomingLivePricingSnapshot(app, livePricing);
  }
}

function handleLotConfigUpdatedEvent(app: RealtimeApp, payload: RealtimeEventPayload): void {
  if (app.currentLotId !== payload.lotId) return;
  if (!isWorkspaceSnapshotSyncClean(app)) return;
  void app.pullCloudSync();
}

function handleWheelSessionUpdatedEvent(app: RealtimeApp, data: unknown): void {
  const scope = resolveWorkspaceScopeContext(app);
  if (!scope.isWorkspace) return;

  const raw = typeof data === "object" && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const session = normalizeSyncGameSessionDto(raw);

  const incomingUpdatedAt = session.wheelSessionUpdatedAt;
  if (incomingUpdatedAt > 0 && incomingUpdatedAt < app.wheelSessionUpdatedAt) return;

  if (Array.isArray(raw.wheelConfigs)) {
    app.wheelConfigs = normalizeWheelConfigs(session.wheelConfigs, app.lots) as typeof app.wheelConfigs;
  }

  const incomingConfigId = session.activeWheelConfigId;
  if (incomingConfigId == null) {
    app.activeWheelConfigId = null;
  } else if (app.wheelConfigs.some((config) => config.id === incomingConfigId)) {
    app.activeWheelConfigId = incomingConfigId;
  } else if (incomingConfigId !== app.activeWheelConfigId) {
    return;
  }

  applyRootWheelSessionSnapshot(app as unknown as RootWheelSessionStateContext, {
    ...session,
    wheelSessionUpdatedAt: incomingUpdatedAt > 0 ? incomingUpdatedAt : Date.now()
  });
}

export function applyRealtimeMessage(app: RealtimeApp, room: string, eventType: string, data: unknown): void {
  const desiredSubscription = getDesiredRealtimeSubscription(app);
  if (!desiredSubscription || !desiredSubscription.rooms.includes(room)) return;

  if (eventType === "workspace.presence") {
    applyWorkspacePresenceSnapshot(app, data);
    return;
  }

  if (eventType === "wheel.session.updated") {
    handleWheelSessionUpdatedEvent(app, data);
    return;
  }

  const payload = parseRealtimeEventPayload(app, data);
  if (!payload) return;

  if (eventType === "sale.upserted") {
    handleSaleUpsertEvent(app, payload);
    return;
  }

  if (eventType === "sale.deleted") {
    handleSaleDeletedEvent(app, payload);
    return;
  }

  if (eventType === "livePricing.updated") {
    handleLivePricingUpdatedEvent(app, payload);
    return;
  }

  if (eventType === "lot.config.updated") {
    handleLotConfigUpdatedEvent(app, payload);
  }
}
