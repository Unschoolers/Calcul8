import type { WhatnotConnectionSummary } from "../../../../types/app.ts";
import type { WhatnotStatusContext } from "../../../context/whatnot.ts";

export function applyWhatnotStatus(
  app: WhatnotStatusContext,
  payload: unknown
): void {
  const body = (payload && typeof payload === "object" && !Array.isArray(payload))
    ? payload as Record<string, unknown>
    : {};
  const summary: WhatnotConnectionSummary = {
    configured: body.configured === true,
    connected: body.connected === true,
    displayName: String(body.displayName ?? "").trim(),
    externalAccountId: String(body.externalAccountId ?? "").trim(),
    scopes: Array.isArray(body.scopes) ? body.scopes.map((value) => String(value ?? "").trim()).filter((value) => value.length > 0) : [],
    lastSyncedAt: String(body.lastSyncedAt ?? "").trim() || null,
    pendingReviewCount: Math.max(0, Math.floor(Number(body.pendingReviewCount) || 0)),
    pendingBatchId: String(body.pendingBatchId ?? "").trim() || null
  };

  app.whatnotConnectionSummary = summary;
  if (!summary.configured) {
    app.whatnotConnectionStatus = "unconfigured";
    return;
  }
  app.whatnotConnectionStatus = summary.connected ? "connected" : "disconnected";
}
