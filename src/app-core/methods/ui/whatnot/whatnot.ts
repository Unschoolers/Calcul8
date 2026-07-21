import type { WhatnotCsvPreparedRowInput } from "../../../../types/app.ts";
import type { WhatnotMethodImplementation } from "../../../context/whatnot.ts";
import { translateAppMessage } from "../../../i18n/index.ts";
import { normalizeWhatnotReviewRows } from "../../../shared/whatnot-csv.ts";
import { buildWhatnotReviewDecisions, validateWhatnotReviewRowsForImport } from "./whatnot-review-decisions.ts";
import { getAffectedWhatnotLotIds, refreshAffectedWhatnotSales } from "./whatnot-sales-refresh.ts";
import { buildWhatnotScopeBody, canManageWhatnot, fetchWhatnotJson } from "./whatnot-http.ts";
import { resetWhatnotCsvImportState, resetWhatnotReviewState } from "./whatnot-state.ts";
import { applyWhatnotStatus } from "./whatnot-status.ts";

export { resetWhatnotSignedOutState, resetWhatnotTransientUiState } from "./whatnot-state.ts";

export const uiWhatnotMethods = {
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
    this.whatnotConfirmationRetryPayload = null;
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
    this.whatnotConfirmationRetryPayload = null;
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
    this.whatnotConfirmationRetryPayload = Array.isArray(body.confirmationDecisions)
      ? JSON.stringify(body.confirmationDecisions)
      : null;
    this.showWhatnotReviewDialog = true;
  },

  closeWhatnotReviewDialog(): void {
    this.showWhatnotReviewDialog = false;
  },

  discardWhatnotReviewBatch(): void {
    if (this.isConfirmingWhatnotImport) return;
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
    if (this.isConfirmingWhatnotImport) return;
    if (!this.whatnotReviewBatchId) {
      this.notify(translateAppMessage(this.preferredLanguage, "whatnotReviewNoBatchLoadedNotice"), "warning");
      return;
    }

    const hasFrozenRetry = Boolean(this.whatnotConfirmationRetryPayload);
    if (!hasFrozenRetry && !validateWhatnotReviewRowsForImport(this)) {
      return;
    }

    const currentDecisions = buildWhatnotReviewDecisions(this.whatnotReviewRows);
    const retryPayload = this.whatnotConfirmationRetryPayload ?? JSON.stringify(currentDecisions);
    this.whatnotConfirmationRetryPayload = retryPayload;
    let retryDecisions: Array<{ lotId?: unknown }> = currentDecisions;
    try {
      const parsed = JSON.parse(retryPayload) as unknown;
      retryDecisions = Array.isArray(parsed)
        ? parsed.filter((decision): decision is { lotId?: unknown } => Boolean(decision) && typeof decision === "object" && !Array.isArray(decision))
        : currentDecisions;
    } catch {
      this.whatnotConfirmationRetryPayload = JSON.stringify(currentDecisions);
    }
    const affectedLotIds = hasFrozenRetry
      ? [...new Set(retryDecisions
        .map((decision) => Math.floor(Number(decision.lotId) || 0))
        .filter((lotId) => lotId > 0))]
      : getAffectedWhatnotLotIds(this.whatnotReviewRows);

    this.isConfirmingWhatnotImport = true;
    try {
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
            decisions: retryDecisions
          })
        },
        translateAppMessage(this.preferredLanguage, "whatnotReviewConfirmFailedNotice"),
        {
          errorMessagesByCode: {
            RECOVERY_CONFLICT: translateAppMessage(this.preferredLanguage, "whatnotReviewRecoveryRequiredNotice"),
            OPERATION_IN_PROGRESS: translateAppMessage(this.preferredLanguage, "whatnotReviewRecoveryInProgressNotice"),
            IDEMPOTENCY_MISMATCH: translateAppMessage(this.preferredLanguage, "whatnotReviewIdempotencyMismatchNotice")
          }
        }
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
    } finally {
      this.isConfirmingWhatnotImport = false;
    }
  }
} satisfies WhatnotMethodImplementation;









