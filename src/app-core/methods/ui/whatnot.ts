import type { AppContext, AppMethodState } from "../../context-app.ts";
import type { WhatnotConnectionSummary, WhatnotCsvPreparedRowInput } from "../../../types/app.ts";
import { translateAppMessage } from "../../i18n/index.ts";
import { normalizeWhatnotReviewRows } from "../../shared/whatnot-csv.ts";
import { cacheAuthoritativeSales, canUseAuthoritativeSalesLiveApi, fetchAuthoritativeSales } from "../sales-live-api.ts";
import { fetchAuthenticatedApiResponse, handleExpiredAuth, resolveApiBaseUrl } from "./shared.ts";

type WhatnotApp = Pick<
  AppContext,
  | "activeScopeType"
  | "activeWorkspaceId"
  | "askConfirmation"
  | "googleAuthEpoch"
  | "hasProAccess"
  | "isCurrentWorkspaceOwner"
  | "notify"
  | "preferredLanguage"
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
  | "whatnotCsvMapListingTitle"
  | "whatnotCsvMapBuyerName"
  | "whatnotCsvMapOrderPlacedAt"
  | "whatnotCsvMapOriginalItemPrice"
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
  | "currentLotId"
  | "sales"
  | "getSalesStorageKey"
>;

const EMPTY_WHATNOT_CSV_IMPORT_STATE = {
  whatnotCsvRawInput: "",
  whatnotCsvSellerAccountId: "",
  whatnotCsvHeaders: [],
  whatnotCsvRows: [],
  whatnotCsvMapExternalSaleId: null,
  whatnotCsvMapOrderId: null,
  whatnotCsvMapOrderItemId: null,
  whatnotCsvMapSellerAccountId: null,
  whatnotCsvMapTitle: null,
  whatnotCsvMapListingTitle: null,
  whatnotCsvMapBuyerName: null,
  whatnotCsvMapOrderPlacedAt: null,
  whatnotCsvMapOriginalItemPrice: null,
  whatnotCsvMapSku: null,
  whatnotCsvMapProductCategory: null,
  whatnotCsvMapQuantity: null,
  whatnotCsvMapPrice: null,
  whatnotCsvMapBuyerShipping: null,
  whatnotCsvMapDate: null,
  whatnotCsvMapOrderStatus: null
};

const EMPTY_WHATNOT_REVIEW_STATE = {
  whatnotReviewBatchId: null,
  whatnotReviewRows: []
};

function resetWhatnotCsvImportState(app: WhatnotApp): void {
  Object.assign(app, EMPTY_WHATNOT_CSV_IMPORT_STATE);
}

function resetWhatnotReviewState(app: WhatnotApp): void {
  Object.assign(app, EMPTY_WHATNOT_REVIEW_STATE);
}

function getAffectedWhatnotLotIds(rows: WhatnotApp["whatnotReviewRows"]): number[] {
  const lotIds = new Set<number>();
  for (const row of rows) {
    const selectedImportAction = row.selectedImportAction ?? (row.action === "update" ? "update_existing" : row.action === "skip" ? "skip" : "create");
    if (row.skipImport || selectedImportAction === "skip") {
      continue;
    }
    const lotId = Math.max(0, Math.floor(Number(row.selectedLotId) || 0));
    if (lotId > 0) {
      lotIds.add(lotId);
    }
  }
  return [...lotIds];
}

async function refreshAffectedWhatnotSales(app: WhatnotApp, lotIds: number[]): Promise<void> {
  if (!canUseAuthoritativeSalesLiveApi() || lotIds.length === 0) {
    return;
  }

  await Promise.all(lotIds.map(async (lotId) => {
    try {
      const latestSales = await fetchAuthoritativeSales(app, lotId);
      if (!latestSales) {
        return;
      }
      cacheAuthoritativeSales(app, lotId, latestSales);
      if (app.currentLotId === lotId) {
        app.sales = latestSales;
      }
    } catch (error) {
      console.warn("Failed to refresh authoritative sales after Whatnot import", {
        lotId,
        error
      });
    }
  }));
}

export function resetWhatnotTransientUiState(app: WhatnotApp): void {
  app.showWhatnotCsvImportDialog = false;
  app.showWhatnotReviewDialog = false;
  resetWhatnotCsvImportState(app);
  resetWhatnotReviewState(app);
}

export function resetWhatnotSignedOutState(app: WhatnotApp): void {
  app.whatnotConnectionStatus = "unconfigured";
  app.whatnotSyncStatus = "idle";
  app.whatnotConnectionSummary = null;
  app.whatnotCallbackStatus = null;
  app.whatnotCallbackMessage = "";
  resetWhatnotTransientUiState(app);
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
  fallbackMessage: string,
  options: {
    expireAuthOn401?: boolean;
  } = {}
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) {
    app.notify("Whatnot integration is unavailable until the API base URL is configured.", "warning");
    return { ok: false };
  }

  const response = await fetchAuthenticatedApiResponse(app, path, init, options);

  if (response.status === 401) {
    if (options.expireAuthOn401 !== false) {
      handleExpiredAuth(app);
    }
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
  | "discardWhatnotReviewBatch"
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
      "Failed to load Whatnot status.",
      {
        expireAuthOn401: false
      }
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

  discardWhatnotReviewBatch(): void {
    if (!this.whatnotReviewBatchId) {
      this.notify(translateAppMessage(this.preferredLanguage, "whatnotReviewNoBatchLoadedNotice"), "warning");
      return;
    }

    this.askConfirmation(
      {
        title: translateAppMessage(this.preferredLanguage, "whatnotReviewDiscardConfirmTitle"),
        text: translateAppMessage(this.preferredLanguage, "whatnotReviewDiscardConfirmBody"),
        color: "warning"
      },
      () => {
        void (async () => {
          const result = await fetchWhatnotJson(
            this,
            "/integrations/whatnot/review/discard",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                ...buildWhatnotScopeBody(this),
                batchId: this.whatnotReviewBatchId
              })
            },
            translateAppMessage(this.preferredLanguage, "whatnotReviewDiscardFailedNotice")
          );
          if (!result.ok) return;

          this.showWhatnotReviewDialog = false;
          resetWhatnotReviewState(this);
          resetWhatnotCsvImportState(this);
          await this.refreshWhatnotStatus();
          this.notify(translateAppMessage(this.preferredLanguage, "whatnotReviewDiscardedNotice"), "info");
        })();
      }
    );
  },

  async confirmWhatnotImportBatch(): Promise<void> {
    if (!this.whatnotReviewBatchId) {
      this.notify(translateAppMessage(this.preferredLanguage, "whatnotReviewNoBatchLoadedNotice"), "warning");
      return;
    }

    const affectedLotIds = getAffectedWhatnotLotIds(this.whatnotReviewRows);

    for (const row of this.whatnotReviewRows) {
      const selectedImportAction = row.selectedImportAction ?? (row.action === "update" ? "update_existing" : row.action === "skip" ? "skip" : "create");
      const shouldSkip = row.skipImport || selectedImportAction === "skip";
      if (shouldSkip) continue;

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
      if (selectedImportAction === "update_existing") {
        const targetSaleId = String(row.targetSaleId ?? row.manualDuplicateCandidate?.saleId ?? row.existingSaleId ?? "").trim();
        if (!targetSaleId) {
          this.notify(`Choose a matching sale to update for ${row.title || row.externalOrderId}.`, "warning");
          return;
        }
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
          decisions: this.whatnotReviewRows.map((row) => {
            const selectedImportAction = row.selectedImportAction ?? (row.action === "update" ? "update_existing" : row.action === "skip" ? "skip" : "create");
            const targetSaleId = String(row.targetSaleId ?? row.manualDuplicateCandidate?.saleId ?? row.existingSaleId ?? "").trim();
            const targetKind = selectedImportAction === "update_existing"
              ? (row.targetKind
                ?? (row.manualDuplicateCandidate
                  ? "manual_candidate"
                  : targetSaleId
                    ? "whatnot_mapping"
                    : null))
              : selectedImportAction === "create"
                ? "new"
                : null;

            return {
              rowId: row.rowId,
              lotId: row.selectedLotId,
              saleType: row.selectedSaleType,
              packsCount: row.selectedPacksCount,
              skip: row.skipImport || selectedImportAction === "skip",
              selectedImportAction,
              targetKind,
              targetSaleId: targetSaleId || undefined
            };
          })
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
    resetWhatnotReviewState(this);
    resetWhatnotCsvImportState(this);
    await this.refreshWhatnotStatus();
    await this.pullCloudSync();
    await refreshAffectedWhatnotSales(this, affectedLotIds);
    this.notify(
      `Whatnot import complete: ${importedCount} new, ${updatedCount} updated, ${skippedCount} skipped.`,
      "success"
    );
  }
};









