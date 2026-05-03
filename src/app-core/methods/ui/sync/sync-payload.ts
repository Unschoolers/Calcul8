import type { AppContext } from "../../../context-app.ts";
import {
  normalizeOptionalSyncId,
  toSyncLotDtos,
  toSyncWheelConfigDtos,
  type SyncPayloadDto
} from "./sync-contracts.ts";

export type SyncPayload = SyncPayloadDto;

export type SyncPayloadContext = Pick<
  AppContext,
  "lots" | "currentLotId" | "sales" | "loadSalesForLotId" | "wheelConfigs" | "activeWheelConfigId"
> & { workspaceId?: unknown };

export function createSyncPayload(context: SyncPayloadContext, clientVersion?: number): SyncPayload {
  const payload: SyncPayload = {
    lots: toSyncLotDtos(context.lots),
    salesByLot: {},
    wheelConfigs: toSyncWheelConfigDtos(context.wheelConfigs),
    activeWheelConfigId: normalizeOptionalSyncId(context.activeWheelConfigId),
    clientVersion
  };

  const activeLotId = normalizeOptionalSyncId(context.currentLotId);
  if (activeLotId != null) {
    payload.activeLotId = activeLotId;
  }

  const rawWorkspaceId = context.workspaceId;
  if (typeof rawWorkspaceId === "string") {
    const normalizedWorkspaceId = rawWorkspaceId.trim();
    if (normalizedWorkspaceId) {
      payload.workspaceId = normalizedWorkspaceId;
    }
  }

  return payload;
}

export function getSyncPayloadSignature(payload: SyncPayload): string {
  return JSON.stringify({
    lots: payload.lots,
    salesByLot: payload.salesByLot,
    wheelConfigs: payload.wheelConfigs,
    activeWheelConfigId: payload.activeWheelConfigId,
    workspaceId: payload.workspaceId
  });
}

