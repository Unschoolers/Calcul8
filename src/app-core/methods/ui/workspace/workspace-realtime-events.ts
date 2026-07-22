import type { Sale } from "../../../../types/app.ts";
import type { WorkspaceRealtimeContext } from "../../../context/workspace.ts";
import { getActiveWorkspaceId, resolveWorkspaceScopeContext } from "../../../workspace-scope.ts";
import { removeById, upsertById } from "../../../shared/collection-updaters.ts";
import { normalizeWheelConfigs } from "../../../shared/normalize-wheel-config.ts";
import {
  cacheAuthoritativeSales,
  normalizeSale
} from "../../lot-sales-api.ts";
import { normalizeLivePricing } from "../../lot-live-pricing-api.ts";
import { reconcileIncomingLivePricingSnapshot } from "../sync/lot-entity-polling.ts";
import {
  normalizeSyncGameSessionDto
} from "../sync/sync-contracts.ts";
import {
  runWorkspaceRealtimeCatchUp
} from "./workspace-realtime-recovery.ts";
import {
  getDesiredRealtimeSubscription,
  type RealtimeEventPayload
} from "./workspace-realtime-state.ts";

function upsertRealtimeSale(app: WorkspaceRealtimeContext, lotId: number, nextSale: Sale): void {
  if (app.currentLotId !== lotId) return;

  app.sales = upsertById(app.sales, nextSale);
  cacheAuthoritativeSales(app, lotId, app.sales);
}

function deleteRealtimeSale(app: WorkspaceRealtimeContext, lotId: number, saleId: number): void {
  if (app.currentLotId !== lotId) return;

  const nextSales = removeById(app.sales, saleId);
  if (nextSales.length === app.sales.length) return;

  app.sales = nextSales;
  cacheAuthoritativeSales(app, lotId, nextSales);
}

function applyWorkspacePresenceSnapshot(
  app: WorkspaceRealtimeContext,
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

function parseRealtimeEventPayload(app: WorkspaceRealtimeContext, data: unknown): RealtimeEventPayload | null {
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

function handleSaleUpsertEvent(app: WorkspaceRealtimeContext, payload: RealtimeEventPayload): void {
  const sale = normalizeSale(payload.raw.sale);
  if (sale) {
    upsertRealtimeSale(app, payload.lotId, sale);
  }
}

function handleSaleDeletedEvent(app: WorkspaceRealtimeContext, payload: RealtimeEventPayload): void {
  const saleId = Number(payload.raw.saleId);
  if (Number.isFinite(saleId) && saleId > 0) {
    deleteRealtimeSale(app, payload.lotId, Math.floor(saleId));
  }
}

function handleLivePricingUpdatedEvent(app: WorkspaceRealtimeContext, payload: RealtimeEventPayload): void {
  const livePricing = normalizeLivePricing(payload.raw.livePricing);
  if (livePricing && app.currentLotId === payload.lotId) {
    reconcileIncomingLivePricingSnapshot(app, livePricing);
  }
}

function handleLotConfigUpdatedEvent(app: WorkspaceRealtimeContext, payload: RealtimeEventPayload): void {
  if (app.currentLotId !== payload.lotId) return;
  void runWorkspaceRealtimeCatchUp(app, { reason: "uncertain-event" });
}

function handleWheelSessionUpdatedEvent(app: WorkspaceRealtimeContext, data: unknown): void {
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

  const {
    wheelConfigs: _normalizedConfigs,
    activeWheelConfigId: _normalizedConfigId,
    wheelSkippedDeductions: _legacyPendingIssues,
    ...sessionState
  } = session;
  Object.assign(app, sessionState, {
    wheelSessionUpdatedAt: incomingUpdatedAt > 0 ? incomingUpdatedAt : Date.now(),
    wheelPreviewSpinCounts: [],
    wheelPreviewTotalSpins: 0,
    wheelPreviewFairnessHistory: [],
    wheelPreviewChaseTallyHistory: [],
    wheelSessionLotSelections: {},
    wheelSpinHash: "",
    wheelSpinSeed: "",
    wheelSpinClientSeed: "",
    wheelSpinVerificationUrl: "",
    wheelSpinAlgorithm: ""
  });
}

export function applyRealtimeMessage(app: WorkspaceRealtimeContext, room: string, eventType: string, data: unknown): void {
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

  if (eventType === "buyer.profile.changed") {
    // The event intentionally carries no customer data. Refetching keeps profile
    // details scoped to the authenticated HTTP boundary and avoids PII on realtime.
    void app.hydrateBuyerProfiles();
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
