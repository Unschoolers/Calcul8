import { translateAppMessage } from "../../../app-core/i18n/index.ts";
import type { WheelConfig } from "../../../types/app.ts";
import { getWheelDisplaySlots } from "./wheelComputedShared.ts";
import type { WheelSlot } from "./wheelHelpers.ts";

export const wheelStageComputeds = {
  wheelStageTitle(this: Record<string, unknown>): string {
    const displayConfig = (this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null;
    return displayConfig?.name || translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageTitleFallback");
  },

  wheelStageModeLabel(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelMode === "config"
      ? translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageModeConfigLabel")
      : translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageModeLiveLabel");
  },

  wheelStageSlotsLabel(this: Record<string, unknown>): string {
    const slots = (((this as Record<string, unknown>).wheelDisplaySlots || []) as WheelSlot[]).length;
    return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageSlotsValue", { count: slots });
  },

  wheelStageSpinPriceLabel(this: Record<string, unknown>): string {
    const displayConfig = (this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null;
    return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageSpinPriceValue", {
      amount: Number(displayConfig?.spinPrice || 0).toFixed(2)
    });
  },

  wheelPresentationToggleTitle(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelPresentationMode
      ? translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelPresentationToggleLabel")
      : translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelPresentationModeLabel");
  },

  wheelSpectatorActionLabel(this: Record<string, unknown>): string {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    if ((this as Record<string, unknown>).wheelSpectatorSessionStatus === "ended") {
      return translateAppMessage(preferredLanguage, "wheelSpectatorActionEnded");
    }
    const baseLabel = translateAppMessage(preferredLanguage, "wheelSpectatorAction");
    const count = Math.max(0, Math.floor(Number((this as Record<string, unknown>).wheelSpectatorConnectedCount) || 0));
    return count > 0 ? `${count} ${baseLabel}` : baseLabel;
  },

  wheelSpectatorDialogHint(this: Record<string, unknown>): string {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    return (this as Record<string, unknown>).wheelSpectatorSessionStatus === "ended"
      ? translateAppMessage(preferredLanguage, "wheelSpectatorDialogEndedBody")
      : translateAppMessage(preferredLanguage, "wheelSpectatorDialogBody");
  },

  wheelSpectatorStartButtonLabel(this: Record<string, unknown>): string {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    return (this as Record<string, unknown>).wheelSpectatorSessionStatus === "ended"
      ? translateAppMessage(preferredLanguage, "wheelSpectatorRestartAction")
      : translateAppMessage(preferredLanguage, "wheelSpectatorStartAction");
  },

  wheelSpinButtonIcon(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelMode === "config" ? "mdi-flask-outline" : "mdi-lightning-bolt";
  },

  wheelSpinButtonLabel(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelMode === "config"
      ? translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelSpinTestButtonLabel")
      : translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelSpinButtonLabel");
  },

  wheelAutospinButtonIcon(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelAutospinEnabled ? "mdi-stop-circle-outline" : "mdi-autorenew";
  },

  wheelAutospinButtonLabel(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelAutospinEnabled
      ? translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelAutospinStopAction")
      : translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelAutospinStartAction");
  },

  wheelAutospinCompactLabel(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelAutospinEnabled
      ? translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelAutospinCompactStopAction")
      : translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelAutospinCompactAction");
  },

  wheelAutospinToggleDisabled(this: Record<string, unknown>): boolean {
    if ((this as Record<string, unknown>).wheelMode !== "config") return true;
    if ((this as Record<string, unknown>).wheelAutospinEnabled) return false;
    return Boolean(
      (this as Record<string, unknown>).wheelConfigSyncPending
      ||
      !(((this as Record<string, unknown>).wheelDisplaySlots || []) as WheelSlot[]).length
      || (this as Record<string, unknown>).wheelEndingSession
    );
  },

  wheelPrimarySpinDisabled(this: Record<string, unknown>): boolean {
    const isConfigMode = (this as Record<string, unknown>).wheelMode === "config";
    return Boolean(
      (this as Record<string, unknown>).wheelSpinning
      || (isConfigMode && (this as Record<string, unknown>).wheelConfigSyncPending)
      || (isConfigMode && (this as Record<string, unknown>).wheelAutospinEnabled)
      || !(((this as Record<string, unknown>).wheelDisplaySlots || []) as WheelSlot[]).length
      || (this as Record<string, unknown>).wheelEndingSession
      || (this as Record<string, unknown>).wheelChaseDialog
      || (!isConfigMode && (this as Record<string, unknown>).wheelSpinBlockedReason)
      || (!isConfigMode && (this as Record<string, unknown>).isWorkspaceScopeActive && !(this as Record<string, unknown>).isCurrentWorkspaceOwner)
    );
  },

  wheelStageCaption(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelMode === "config"
      ? translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageCaptionConfig")
      : translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageCaptionLive");
  },

  wheelCelebrationKicker(this: Record<string, unknown>): string {
    return (this as Record<string, unknown>).wheelCelebrationPreview
      ? translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelCelebrationPreviewKicker")
      : translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelCelebrationLiveKicker");
  },

  wheelConfirmTitle(this: Record<string, unknown>): string {
    const action = (this as Record<string, unknown>).wheelConfirmAction as "reset" | "delete" | "end" | "";
    if (action === "reset") return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelConfirmResetTitle");
    if (action === "end") return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelConfirmEndTitle");
    if (action === "delete") return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelConfirmDeleteTitle");
    return "";
  },

  wheelConfirmBody(this: Record<string, unknown>): string {
    const action = (this as Record<string, unknown>).wheelConfirmAction as "reset" | "delete" | "end" | "";
    const wheelMode = (this as Record<string, unknown>).wheelMode as "config" | "live";
    if (action === "reset") {
      return wheelMode === "config"
        ? translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelConfirmResetConfigBody")
        : translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelConfirmResetLiveBody");
    }
    if (action === "end") {
      return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelConfirmEndBody");
    }
    if (action === "delete") {
      return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelConfirmDeleteBody");
    }
    return "";
  },

  wheelConfirmButtonColor(this: Record<string, unknown>): string {
    const action = (this as Record<string, unknown>).wheelConfirmAction as "reset" | "delete" | "end" | "";
    return action === "reset" || action === "delete" || action === "end" ? "error" : "primary";
  },

  wheelConfirmButtonLabel(this: Record<string, unknown>): string {
    const action = (this as Record<string, unknown>).wheelConfirmAction as "reset" | "delete" | "end" | "";
    if (action === "reset") return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "commonReset");
    if (action === "end") return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelEndSessionAction");
    if (action === "delete") return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "commonDelete");
    return "";
  },

  wheelLiveConfirmSummaryName(this: Record<string, unknown>): string {
    const activeConfig = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    return activeConfig?.name || translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelStageTitleFallback");
  },

  wheelLiveConfirmSummarySlots(this: Record<string, unknown>): number {
    return getWheelDisplaySlots(this as Record<string, unknown>).length;
  },

  wheelLiveConfirmSummarySpinPrice(this: Record<string, unknown>): string {
    const activeConfig = (this as Record<string, unknown>).activeWheelConfig as WheelConfig | null;
    return Number(activeConfig?.spinPrice || 0).toFixed(2);
  },

  wheelPendingInventoryIssuesTitle(this: Record<string, unknown>): string {
    const issueCount = (((this as Record<string, unknown>).wheelPendingInventoryIssues || []) as unknown[]).length;
    return translateAppMessage(String((this as Record<string, unknown>).preferredLanguage ?? ""), "wheelPendingInventoryIssuesTitle", {
      count: issueCount,
      suffix: issueCount === 1 ? "" : "s"
    });
  },

  wheelStageSummaryCards(this: Record<string, unknown>): Array<{
    id: string;
    label: string;
    value: string | number;
    meta: string;
    valueClass?: string;
    valueStyle?: string;
  }> {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    const mode = String((this as Record<string, unknown>).wheelMode || "config");
    if (mode === "live") {
      return [
        {
          id: "spins",
          label: translateAppMessage(preferredLanguage, "wheelSpinsLabel"),
          value: Number((this as Record<string, unknown>).wheelTotalSpins || 0),
          meta: translateAppMessage(preferredLanguage, "wheelLiveRevenueMeta", {
            amount: Number((this as Record<string, unknown>).wheelSessionRevenue || 0).toFixed(2)
          })
        },
        {
          id: "profit",
          label: translateAppMessage(preferredLanguage, "wheelGrossProfitLabel"),
          value: String((this as Record<string, unknown>).wheelSessionProfitDisplay || ""),
          meta: translateAppMessage(preferredLanguage, "wheelLivePrizeCostMeta", {
            amount: Number((this as Record<string, unknown>).wheelSessionCost || 0).toFixed(2)
          }),
          valueClass: String((this as Record<string, unknown>).wheelSessionProfitClass || "")
        },
        {
          id: "margin",
          label: translateAppMessage(preferredLanguage, "wheelSessionMarginLabel"),
          value: String((this as Record<string, unknown>).wheelSessionMarginDisplay || "—"),
          meta: String((this as Record<string, unknown>).wheelSessionMarginHint || ""),
          valueStyle: String((this as Record<string, unknown>).wheelSessionMarginColor || "")
        }
      ];
    }

    return [
      {
        id: "expected-margin",
        label: translateAppMessage(preferredLanguage, "wheelStageExpectedMarginLabel"),
        value: String((this as Record<string, unknown>).expectedMarginDisplay || "—"),
        meta: String((this as Record<string, unknown>).expectedMarginHint || ""),
        valueStyle: String((this as Record<string, unknown>).expectedMarginColor || "")
      },
      {
        id: "target-margin",
        label: translateAppMessage(preferredLanguage, "wheelStageTargetMarginLabel"),
        value: `${Number(((this as Record<string, unknown>).wheelDisplayConfig as WheelConfig | null)?.targetMargin || 0)}%`,
        meta: translateAppMessage(preferredLanguage, "wheelConfiguredSlotsMeta", {
          count: (((this as Record<string, unknown>).wheelDisplaySlots || []) as WheelSlot[]).length
        })
      },
      {
        id: "builder-status",
        label: translateAppMessage(preferredLanguage, "wheelBuilderLabel"),
        value: Boolean((this as Record<string, unknown>).canApplyWheelConfig)
          ? translateAppMessage(preferredLanguage, "wheelBuilderReadyLabel")
          : translateAppMessage(preferredLanguage, "wheelBuilderPendingLabel"),
        meta: Boolean((this as Record<string, unknown>).canApplyWheelConfig)
          ? translateAppMessage(preferredLanguage, "wheelBuilderReadyHelp")
          : translateAppMessage(preferredLanguage, "wheelBuilderPendingHelp")
      }
    ];
  }
};
