import type { Sale } from "../../../types/app.ts";
import type { AppContext } from "../../context.ts";

export type SyncPayload = {
  lots: unknown[];
  salesByLot: Record<string, Sale[]>;
  clientVersion?: number;
  workspaceId?: string;
};

export function createSyncPayload(context: AppContext, clientVersion?: number): SyncPayload {
  const salesByLot: Record<string, Sale[]> = {};
  for (const lot of context.lots) {
    salesByLot[String(lot.id)] = context.loadSalesForLotId(lot.id);
  }

  const payload: SyncPayload = {
    lots: context.lots,
    salesByLot,
    clientVersion
  };

  const rawWorkspaceId = (context as AppContext & { workspaceId?: unknown }).workspaceId;
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
    workspaceId: payload.workspaceId
  });
}
