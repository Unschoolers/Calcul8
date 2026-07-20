import type { SyncPayloadContext } from "../../../context/sync.ts";
import { normalizeSystemPricingDefaults } from "../../../shared/system-pricing-defaults.ts";
import {
  normalizeOptionalSyncId,
  toSyncLotDtos,
  toSyncWheelConfigDtos,
  type SyncPayloadDto
} from "./sync-contracts.ts";

export type SyncPayload = SyncPayloadDto;

export function createSyncPayload(context: SyncPayloadContext, clientVersion?: number): SyncPayload {
  const payload: SyncPayload = {
    lots: toSyncLotDtos(context.lots),
    salesByLot: {},
    wheelConfigs: toSyncWheelConfigDtos(context.wheelConfigs),
    activeWheelConfigId: normalizeOptionalSyncId(context.activeWheelConfigId),
    clientVersion
  };

  if ("systemPricingDefaults" in context && context.systemPricingDefaults) {
    payload.systemPricingDefaults = normalizeSystemPricingDefaults(context.systemPricingDefaults);
  }

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
    systemPricingDefaults: payload.systemPricingDefaults,
    workspaceId: payload.workspaceId
  });
}

