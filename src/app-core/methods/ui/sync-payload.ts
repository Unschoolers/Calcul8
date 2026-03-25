import type { Sale } from "../../../types/app.ts";
import type { AppContext } from "../../context.ts";

export type SyncPayload = {
  lots: unknown[];
  salesByLot: Record<string, Sale[]>;
  wheelConfigs: unknown[];
  activeWheelConfigId: number | null;
  activeLotId?: number;
  clientVersion?: number;
  allowEmptyOverwrite?: boolean;
  workspaceId?: string;
};

export type SyncPayloadContext = Pick<
  AppContext,
  "lots" | "currentLotId" | "sales" | "loadSalesForLotId" | "wheelConfigs" | "activeWheelConfigId"
> & { workspaceId?: unknown };

export function createSyncPayload(context: SyncPayloadContext, clientVersion?: number): SyncPayload {
  const payload: SyncPayload = {
    lots: context.lots,
    salesByLot: {},
    wheelConfigs: Array.isArray(context.wheelConfigs) ? context.wheelConfigs : [],
    activeWheelConfigId: context.activeWheelConfigId == null
      ? null
      : Math.floor(Number(context.activeWheelConfigId) || 0) || null,
    clientVersion
  };

  const activeLotId = Number(context.currentLotId);
  if (Number.isFinite(activeLotId) && activeLotId > 0) {
    payload.activeLotId = Math.floor(activeLotId);
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
