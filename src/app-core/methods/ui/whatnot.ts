import type { AppContext, AppMethodState } from "../../context.ts";
import type { WhatnotConnectionSummary, WhatnotCsvPreparedRowInput } from "../../../types/app.ts";
import { normalizeWhatnotReviewRows } from "../../shared/whatnot-csv.ts";
import { buildAuthenticatedHeaders } from "../../auth/index.ts";
import { fetchWithRetry, handleExpiredAuth, resolveApiBaseUrl } from "./shared.ts";
type WhatnotApp = Pick<
  AppContext,
  | "activeScopeType"
  | "activeWorkspaceId"
  | "googleAuthEpoch"
  | "hasProAccess"
  | "isCurrentWorkspaceOwner"
  | "notify"
  | "whatnotConnectionStatus"
  | "whatnotSyncStatus"
  | "whatnotConnectionSummary"
  | "whatnotCsvRawInput"
  | "whatnotCsvSellerAccountId"
  | "whatnotCsvHeaders"
  | "whatnotCsvRows"
  | "whatnotCsvMapExternalSaleId"
  | "whatnotCsvMapOrderId"
  | "whatnotCsvMapOrderItemId"
  | "whatnotCsvMapSellerAccountId"
  | "whatnotCsvMapTitle"
  | "whatnotCsvMapSku"
  | "whatnotCsvMapProductCategory"
  | "whatnotCsvMapQuantity"
  | "whatnotCsvMapPrice"
  | "whatnotCsvMapBuyerShipping"
  | "whatnotCsvMapDate"
  | "whatnotCsvMapOrderStatus"
  | "whatnotReviewBatchId"
  | "whatnotReviewRows"
  | "showWhatnotCsvImportDialog"
  | "showWhatnotReviewDialog"
  | "whatnotCallbackStatus"
  | "whatnotCallbackMessage"
  | "pullCloudSync"
>;

function resetWhatnotCsvImportState(app: WhatnotApp): void {
  app.whatnotCsvRawInput = "";
  app.whatnotCsvSellerAccountId = "";
  app.whatnotCsvHeaders = [];
  app.whatnotCsvRows = [];
  app.whatnotCsvMapExternalSaleId = null;
  app.whatnotCsvMapOrderId = null;
  app.whatnotCsvMapOrderItemId = null;
  app.whatnotCsvMapSellerAccountId = null;
  app.whatnotCsvMapTitle = null;
  app.whatnotCsvMapSku = null;
  app.whatnotCsvMapProductCategory = null;
  app.whatnotCsvMapQuantity = null;
  app.whatnotCsvMapPrice = null;
  app.whatnotCsvMapBuyerShipping = null;
  app.whatnotCsvMapDate = null;
  app.whatnotCsvMapOrderStatus = null;
}

function canManageWhatnot(app: Pick<AppContext, "activeScopeType" | "isCurrentWorkspaceOwner">): boolean {
  return app.activeScopeType === "personal" || app.isCurrentWorkspaceOwner;
}

function buildWhatnotScopeBody(app: Pick<AppContext, "activeScopeType" | "activeWorkspaceId">): Record<string, string> {
  return {
    ...(app.activeScopeType === "workspace" && app.activeWorkspaceId
      ? { workspaceId: app.activeWorkspaceId }
      : {}),
    appReturnUrl: window.location.origin
  };
}

async function fetchWhatnotJson(
  app: WhatnotApp,
  path: string,
  init: RequestInit,
  fallbackMessage: string
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) {
    app.notify("Whatnot integration is unavailable until the API base URL is configured.", "warning");
    return { ok: false };
  }

  const response = await fetchWithRetry(`${baseUrl}${path}`, {
    ...init,
    headers: buildAuthenticatedHeaders("session-preferred", init.headers as Record<string, string> | undefined)
  });

  if (response.status === 401) {
    handleExpiredAuth(app);
    app.notify("Your sign-in expired. Please sign in again.", "warning");
    return { ok: false };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = String((body as { error?: unknown } | null)?.error ?? fallbackMessage).trim() || fallbackMessage;
    app.notify(message, "error");
    return { ok: false };
  }

  return { ok: true, body };
}

function applyWhatnotStatus(
  app: WhatnotApp,
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

export const uiWhatnotMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "refreshWhatnotStatus"
  | "connectWhatnot"
  | "disconnectWhatnot"
  | "syncWhatnotSales"
  | "openWhatnotCsvImportDialog"
  | "closeWhatnotCsvImportDialog"
  | "prepareWhatnotCsvImport"
  | "openWhatnotReviewDialog"
  | "closeWhatnotReviewDialog"
  | "confirmWhatnotImportBatch"
> = {
  async refreshWhatnotStatus(): Promise<void> {
    const result = await fetchWhatnotJson(
      this,
      "/integrations/whatnot/status",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildWhatnotScopeBody(this))
      },
      "Failed to load Whatnot status."
    );
    if (!result.ok) {
      this.whatnotConnectionSummary = null;
      this.whatnotConnectionStatus = "error";
      return;
    }

    applyWhatnotStatus(this, result.body);
  },

  async connectWhatnot(): Promise<void> {
    if (!canManageWhatnot(this)) {
      this.notify("Only the workspace owner can connect Whatnot for this workspace.", "warning");
      return;
    }

    this.whatnotConnectionStatus = "connecting";
    const result = await fetchWhatnotJson(
      this,
      "/integrations/whatnot/connect/start",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildWhatnotScopeBody(this))
      },
      "Failed to start Whatnot connection."
    );
    if (!result.ok) {
      this.whatnotConnectionStatus = "error";
      return;
    }

    const authorizeUrl = String((result.body as { authorizeUrl?: unknown } | null)?.authorizeUrl ?? "").trim();
    if (!authorizeUrl) {
      this.whatnotConnectionStatus = "error";
      this.notify("Whatnot connect URL was missing.", "error");
      return;
    }

    window.location.assign(authorizeUrl);
  },

  async disconnectWhatnot(): Promise<void> {
    if (!canManageWhatnot(this)) {
      this.notify("Only the workspace owner can disconnect Whatnot for this workspace.", "warning");
      return;
    }

    const result = await fetchWhatnotJson(
      this,
      "/integrations/whatnot/disconnect",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildWhatnotScopeBody(this))
      },
      "Failed to disconnect Whatnot."
    );
    if (!result.ok) return;

    this.whatnotConnectionSummary = null;
    this.whatnotConnectionStatus = "disconnected";
    this.notify("Whatnot disconnected.", "success");
  },

  async syncWhatnotSales(): Promise<void> {
    if (!canManageWhatnot(this)) {
      this.notify("Only the workspace owner can sync Whatnot for this workspace.", "warning");
      return;
    }

    this.whatnotSyncStatus = "syncing";
    const result = await fetchWhatnotJson(
      this,
      "/integrations/whatnot/sync",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildWhatnotScopeBody(this))
      },
      "Failed to sync Whatnot sales."
    );
    if (!result.ok) {
      this.whatnotSyncStatus = "error";
      return;
    }

    const body = (result.body && typeof result.body === "object" && !Array.isArray(result.body))
      ? result.body as Record<string, unknown>
      : {};
    this.whatnotReviewBatchId = String(body.batchId ?? "").trim() || null;
    this.whatnotReviewRows = normalizeWhatnotReviewRows(Array.isArray(body.rows) ? body.rows : []);
    this.showWhatnotReviewDialog = true;
    this.whatnotSyncStatus = "success";
    await this.refreshWhatnotStatus();
  },

  openWhatnotCsvImportDialog(): void {
    this.showWhatnotCsvImportDialog = true;
  },

  closeWhatnotCsvImportDialog(): void {
    resetWhatnotCsvImportState(this);
    this.showWhatnotCsvImportDialog = false;
  },

  async prepareWhatnotCsvImport(rows: WhatnotCsvPreparedRowInput[], sellerAccountId?: string): Promise<boolean> {
    if (!Array.isArray(rows) || rows.length === 0) {
      this.notify("No valid Whatnot CSV rows were found.", "warning");
      return false;
    }

    const result = await fetchWhatnotJson(
      this,
      "/integrations/whatnot/import",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...(this.activeScopeType === "workspace" && this.activeWorkspaceId
            ? { workspaceId: this.activeWorkspaceId }
            : {}),
          externalAccountId: String(sellerAccountId ?? "").trim() || undefined,
          rows
        })
      },
      "Failed to prepare Whatnot CSV import."
    );
    if (!result.ok) {
      return false;
    }

    const body = (result.body && typeof result.body === "object" && !Array.isArray(result.body))
      ? result.body as Record<string, unknown>
      : {};
    this.whatnotReviewBatchId = String(body.batchId ?? "").trim() || null;
    this.whatnotReviewRows = normalizeWhatnotReviewRows(Array.isArray(body.rows) ? body.rows : []);
    resetWhatnotCsvImportState(this);
    this.showWhatnotCsvImportDialog = false;
    this.showWhatnotReviewDialog = true;
    return true;
  },

  async openWhatnotReviewDialog(): Promise<void> {
    const result = await fetchWhatnotJson(
      this,
      "/integrations/whatnot/review",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildWhatnotScopeBody(this))
      },
      "Failed to load Whatnot review rows."
    );
    if (!result.ok) return;

    const body = (result.body && typeof result.body === "object" && !Array.isArray(result.body))
      ? result.body as Record<string, unknown>
      : {};
    this.whatnotReviewBatchId = String(body.batchId ?? "").trim() || null;
    this.whatnotReviewRows = normalizeWhatnotReviewRows(Array.isArray(body.rows) ? body.rows : []);
    this.showWhatnotReviewDialog = true;
  },

  closeWhatnotReviewDialog(): void {
    this.showWhatnotReviewDialog = false;
  },

  async confirmWhatnotImportBatch(): Promise<void> {
    if (!this.whatnotReviewBatchId) {
      this.notify("No Whatnot review batch is loaded.", "warning");
      return;
    }

    for (const row of this.whatnotReviewRows) {
      if (row.skipImport) continue;
      if (!row.selectedLotId) {
        this.notify(`Choose a lot for ${row.title || row.externalOrderId}.`, "warning");
        return;
      }
      const selectedSaleType = row.selectedSaleType ?? (row.suggestedSaleType ?? null);
      if (!selectedSaleType) {
        this.notify(`Choose a sale type for ${row.title || row.externalOrderId}.`, "warning");
        return;
      }
      if (selectedSaleType === "rtyh" && (!row.selectedPacksCount || row.selectedPacksCount <= 0)) {
        this.notify(`Enter sold items for RTYH row ${row.title || row.externalOrderId}.`, "warning");
        return;
      }
    }

    const result = await fetchWhatnotJson(
      this,
      "/integrations/whatnot/review/confirm",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...buildWhatnotScopeBody(this),
          batchId: this.whatnotReviewBatchId,
          decisions: this.whatnotReviewRows.map((row) => ({
            rowId: row.rowId,
            lotId: row.selectedLotId,
            saleType: row.selectedSaleType,
            packsCount: row.selectedPacksCount,
            skip: row.skipImport
          }))
        })
      },
      "Failed to import Whatnot sales."
    );
    if (!result.ok) return;

    const body = (result.body && typeof result.body === "object" && !Array.isArray(result.body))
      ? result.body as Record<string, unknown>
      : {};
    const importedCount = Math.max(0, Math.floor(Number(body.importedCount) || 0));
    const updatedCount = Math.max(0, Math.floor(Number(body.updatedCount) || 0));
    const skippedCount = Math.max(0, Math.floor(Number(body.skippedCount) || 0));

    this.showWhatnotReviewDialog = false;
    this.whatnotReviewBatchId = null;
    this.whatnotReviewRows = [];
    resetWhatnotCsvImportState(this);
    await this.refreshWhatnotStatus();
    await this.pullCloudSync();
    this.notify(
      `Whatnot import complete: ${importedCount} new, ${updatedCount} updated, ${skippedCount} skipped.`,
      "success"
    );
  }
};








