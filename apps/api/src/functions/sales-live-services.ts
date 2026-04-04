import { HttpError } from "../lib/auth";
import {
  deleteSaleDocument,
  getLotLivePricing,
  listSalesForLot,
  upsertLotLivePricing,
  upsertSaleDocument
} from "../lib/cosmos/salesRepository";
import { hasWorkspaceMembership } from "../lib/cosmos/workspaceRepository";
import {
  buildWorkspaceLotRealtimeRoom,
  buildWorkspacePresenceRealtimeRoom,
  buildWorkspaceWheelRealtimeRoom,
  signRealtimeSubscribeToken
} from "../lib/realtime";
import { assertSyncScopeAccess, resolveSyncScope } from "../lib/syncScopeResolution";
import type { ApiConfig } from "../types";

function buildRealtimeTokenExpiryEpochSeconds(ttlSeconds = 60): number {
  return Math.floor(Date.now() / 1000) + ttlSeconds;
}

export function toSaleResponse(document: {
  sale: unknown;
  version: number;
  updatedAt: string;
  updatedBy: string;
  mutationId: string;
}): Record<string, unknown> {
  if (typeof document.sale !== "object" || document.sale === null || Array.isArray(document.sale)) {
    return {
      version: document.version,
      updatedAt: document.updatedAt,
      updatedBy: document.updatedBy,
      mutationId: document.mutationId
    };
  }

  return {
    ...(document.sale as Record<string, unknown>),
    version: document.version,
    updatedAt: document.updatedAt,
    updatedBy: document.updatedBy,
    mutationId: document.mutationId
  };
}

export async function listLotSalesForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId: string | undefined,
  lotId: string
): Promise<{
  lotId: string;
  sales: Array<Record<string, unknown>>;
}> {
  const syncScope = resolveSyncScope(actorUserId, workspaceId);
  await assertSyncScopeAccess(
    syncScope,
    (userId, nextWorkspaceId) => hasWorkspaceMembership(config, userId, nextWorkspaceId)
  );
  const sales = await listSalesForLot(config, syncScope.partitionKey, lotId);

  return {
    lotId,
    sales: sales.map((document) => toSaleResponse(document))
  };
}

export async function upsertLotSaleForActor(
  config: ApiConfig,
  actorUserId: string,
  params: {
    workspaceId?: string;
    lotId: string;
    sale: Record<string, unknown>;
    baseVersion?: number;
    mutationId: string;
  }
): Promise<{
  lotId: string;
  sale: Record<string, unknown>;
}> {
  const syncScope = resolveSyncScope(actorUserId, params.workspaceId);
  await assertSyncScopeAccess(
    syncScope,
    (userId, nextWorkspaceId) => hasWorkspaceMembership(config, userId, nextWorkspaceId)
  );

  const saleId = String(params.sale.id ?? "").trim();
  const sale = await upsertSaleDocument(config, {
    scopeKey: syncScope.partitionKey,
    lotId: params.lotId,
    saleId,
    sale: params.sale,
    updatedBy: actorUserId,
    mutationId: params.mutationId,
    baseVersion: params.baseVersion
  });

  return {
    lotId: params.lotId,
    sale: toSaleResponse(sale)
  };
}

export async function deleteLotSaleForActor(
  config: ApiConfig,
  actorUserId: string,
  params: {
    workspaceId?: string;
    lotId: string;
    saleId: string;
    baseVersion?: number;
    mutationId: string;
  }
): Promise<{
  lotId: string;
  saleId: string;
}> {
  const syncScope = resolveSyncScope(actorUserId, params.workspaceId);
  await assertSyncScopeAccess(
    syncScope,
    (userId, nextWorkspaceId) => hasWorkspaceMembership(config, userId, nextWorkspaceId)
  );

  const deleted = await deleteSaleDocument(config, {
    scopeKey: syncScope.partitionKey,
    lotId: params.lotId,
    saleId: params.saleId,
    updatedBy: actorUserId,
    mutationId: params.mutationId,
    baseVersion: params.baseVersion
  });

  if (!deleted) {
    throw new HttpError(404, "Sale was not found.");
  }

  return {
    lotId: params.lotId,
    saleId: params.saleId
  };
}

export async function getLotLivePricingForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId: string | undefined,
  lotId: string
): Promise<{
  lotId: string;
  livePricing: {
    livePackPrice: number;
    liveBoxPriceSell: number;
    liveSpotPrice: number;
    version: number;
    updatedAt: string;
    updatedBy: string;
    mutationId: string;
  } | null;
}> {
  const syncScope = resolveSyncScope(actorUserId, workspaceId);
  await assertSyncScopeAccess(
    syncScope,
    (userId, nextWorkspaceId) => hasWorkspaceMembership(config, userId, nextWorkspaceId)
  );

  const livePricing = await getLotLivePricing(config, syncScope.partitionKey, lotId);
  return {
    lotId,
    livePricing: livePricing
      ? {
        livePackPrice: livePricing.livePackPrice,
        liveBoxPriceSell: livePricing.liveBoxPriceSell,
        liveSpotPrice: livePricing.liveSpotPrice,
        version: livePricing.version,
        updatedAt: livePricing.updatedAt,
        updatedBy: livePricing.updatedBy,
        mutationId: livePricing.mutationId
      }
      : null
  };
}

export async function saveLotLivePricingForActor(
  config: ApiConfig,
  actorUserId: string,
  params: {
    workspaceId?: string;
    lotId: string;
    baseVersion?: number;
    mutationId: string;
    livePackPrice: number;
    liveBoxPriceSell: number;
    liveSpotPrice: number;
  }
): Promise<{
  lotId: string;
  livePricing: {
    livePackPrice: number;
    liveBoxPriceSell: number;
    liveSpotPrice: number;
    version: number;
    updatedAt: string;
    updatedBy: string;
    mutationId: string;
  };
}> {
  const syncScope = resolveSyncScope(actorUserId, params.workspaceId);
  await assertSyncScopeAccess(
    syncScope,
    (userId, nextWorkspaceId) => hasWorkspaceMembership(config, userId, nextWorkspaceId)
  );

  const livePricing = await upsertLotLivePricing(config, {
    scopeKey: syncScope.partitionKey,
    lotId: params.lotId,
    livePackPrice: params.livePackPrice,
    liveBoxPriceSell: params.liveBoxPriceSell,
    liveSpotPrice: params.liveSpotPrice,
    updatedBy: actorUserId,
    mutationId: params.mutationId,
    baseVersion: params.baseVersion
  });

  return {
    lotId: params.lotId,
    livePricing: {
      livePackPrice: livePricing.livePackPrice,
      liveBoxPriceSell: livePricing.liveBoxPriceSell,
      liveSpotPrice: livePricing.liveSpotPrice,
      version: livePricing.version,
      updatedAt: livePricing.updatedAt,
      updatedBy: livePricing.updatedBy,
      mutationId: livePricing.mutationId
    }
  };
}

export async function mintLotRealtimeTokenForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId: string | undefined,
  lotId: string
): Promise<{
  lotId: string;
  workspaceId: string;
  room: string;
  rooms: string[];
  token: string | null;
  expiresAt: number;
}> {
  if (!workspaceId) {
    throw new HttpError(400, "Query param 'workspaceId' is required.");
  }

  const syncScope = resolveSyncScope(actorUserId, workspaceId);
  await assertSyncScopeAccess(
    syncScope,
    (userId, nextWorkspaceId) => hasWorkspaceMembership(config, userId, nextWorkspaceId)
  );

  const room = buildWorkspaceLotRealtimeRoom(workspaceId, lotId);
  const presenceRoom = buildWorkspacePresenceRealtimeRoom(workspaceId);
  const wheelRoom = buildWorkspaceWheelRealtimeRoom(workspaceId);
  const rooms = [room, presenceRoom, wheelRoom];
  const tokenSecret = String(config.realtimeTokenSecret ?? "").trim();
  if (!tokenSecret && config.apiEnv === "prod") {
    throw new HttpError(503, "Realtime subscribe signing is not configured.");
  }
  const expiresAt = buildRealtimeTokenExpiryEpochSeconds();

  return {
    lotId,
    workspaceId,
    room,
    rooms,
    token: tokenSecret ? signRealtimeSubscribeToken(tokenSecret, {
      rooms,
      userId: actorUserId,
      exp: expiresAt
    }) : null,
    expiresAt
  };
}

export async function mintWorkspaceRealtimeTokenForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId: string
): Promise<{
  workspaceId: string;
  room: string;
  rooms: string[];
  token: string | null;
  expiresAt: number;
}> {
  const syncScope = resolveSyncScope(actorUserId, workspaceId);
  await assertSyncScopeAccess(
    syncScope,
    (userId, nextWorkspaceId) => hasWorkspaceMembership(config, userId, nextWorkspaceId)
  );

  const room = buildWorkspacePresenceRealtimeRoom(workspaceId);
  const rooms = [room];
  const tokenSecret = String(config.realtimeTokenSecret ?? "").trim();
  if (!tokenSecret && config.apiEnv === "prod") {
    throw new HttpError(503, "Realtime subscribe signing is not configured.");
  }
  const expiresAt = buildRealtimeTokenExpiryEpochSeconds();

  return {
    workspaceId,
    room,
    rooms,
    token: tokenSecret ? signRealtimeSubscribeToken(tokenSecret, {
      rooms,
      userId: actorUserId,
      exp: expiresAt
    }) : null,
    expiresAt
  };
}
