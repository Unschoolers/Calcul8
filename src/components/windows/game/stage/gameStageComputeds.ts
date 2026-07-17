import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import type { GameWindowThis } from "../coordinator/gameControllerState.ts";
import { getWheelDisplaySlots } from "../coordinator/gameComputedShared.ts";
import { getTierPrizeGameAdapter } from "../services/gameAdapters.ts";

type GameStageContext = Omit<Partial<GameWindowThis>, "gameSpectatorSessionStatus"> & {
  gameSpectatorSessionStatus?: string;
  preferredLanguage?: string;
  isWorkspaceScopeActive?: boolean;
  isCurrentWorkspaceOwner?: boolean;
  wheelSessionRevenue?: number;
  wheelSessionProfitDisplay?: string;
  wheelSessionCost?: number;
  wheelSessionProfitClass?: string;
  wheelSessionMarginHint?: string;
  expectedMarginHint?: string;
  canApplyWheelConfig?: boolean;
};

interface StageSummaryCard {
  id: string;
  label: string;
  value: string | number;
  meta: string;
  valueClass?: string;
  valueStyle?: string;
}

function adapterContext(context: GameStageContext): Record<string, unknown> {
  return context as unknown as Record<string, unknown>;
}

function translate(
  context: GameStageContext,
  key: string,
  params?: Record<string, string | number>
): string {
  return translateAppMessage(String(context.preferredLanguage ?? ""), key, params);
}

export const gameStageComputeds = {
  wheelStageTitle(this: GameStageContext): string {
    return this.wheelDisplayConfig?.name || translate(this, "wheelStageTitleFallback");
  },

  wheelStageModeLabel(this: GameStageContext): string {
    return translate(this, this.wheelMode === "config" ? "wheelStageModeConfigLabel" : "wheelStageModeLiveLabel");
  },

  wheelStageSlotsLabel(this: GameStageContext): string {
    const config = this.wheelDisplayConfig ?? null;
    return getTierPrizeGameAdapter(config).stageSlotsLabel(adapterContext(this), config);
  },

  wheelStageSpinPriceLabel(this: GameStageContext): string {
    return translate(this, "wheelStageSpinPriceValue", {
      amount: Number(this.wheelDisplayConfig?.spinPrice || 0).toFixed(2)
    });
  },

  wheelPresentationToggleTitle(this: GameStageContext): string {
    return translate(this, this.wheelPresentationMode ? "wheelPresentationToggleLabel" : "wheelPresentationModeLabel");
  },

  wheelSoundToggleTitle(this: GameStageContext): string {
    return translate(this, this.wheelSoundEnabled === false ? "wheelSoundEnableLabel" : "wheelSoundDisableLabel");
  },

  wheelMotionToggleTitle(this: GameStageContext): string {
    return translate(this, this.wheelReducedMotion ? "wheelMotionEnableLabel" : "wheelMotionReduceLabel");
  },

  gameSpectatorActionLabel(this: GameStageContext): string {
    if (this.gameSpectatorSessionStatus === "ended") {
      return translate(this, "gameSpectatorActionEnded");
    }
    const label = translate(this, "gameSpectatorAction");
    const count = Math.max(0, Math.floor(Number(this.gameSpectatorConnectedCount) || 0));
    return count > 0 ? `${count} ${label}` : label;
  },

  gameSpectatorDialogHint(this: GameStageContext): string {
    return translate(this, this.gameSpectatorSessionStatus === "ended"
      ? "gameSpectatorDialogEndedBody"
      : "gameSpectatorDialogBody");
  },

  gameSpectatorStartButtonLabel(this: GameStageContext): string {
    return translate(this, this.gameSpectatorSessionStatus === "ended"
      ? "gameSpectatorRestartAction"
      : "gameSpectatorStartAction");
  },

  wheelSpinButtonIcon(this: GameStageContext): string {
    const config = this.wheelDisplayConfig ?? null;
    return getTierPrizeGameAdapter(config).primaryActionIcon(adapterContext(this), config);
  },

  wheelSpinButtonLabel(this: GameStageContext): string {
    const config = this.wheelDisplayConfig ?? null;
    return getTierPrizeGameAdapter(config).primaryActionLabel(adapterContext(this), config);
  },

  wheelAutospinButtonIcon(this: GameStageContext): string {
    return this.wheelAutospinEnabled ? "mdi-stop-circle-outline" : "mdi-autorenew";
  },

  wheelAutospinButtonLabel(this: GameStageContext): string {
    return translate(this, this.wheelAutospinEnabled ? "wheelAutospinStopAction" : "wheelAutospinStartAction");
  },

  wheelAutospinCompactLabel(this: GameStageContext): string {
    return translate(this, this.wheelAutospinEnabled ? "wheelAutospinCompactStopAction" : "wheelAutospinCompactAction");
  },

  wheelAutospinToggleDisabled(this: GameStageContext): boolean {
    if (this.wheelMode !== "config") return true;
    if (this.wheelAutospinEnabled) return false;
    return this.wheelConfigSyncPending === true || !(this.wheelDisplaySlots?.length) || this.wheelEndingSession === true;
  },

  wheelResetButtonLabel(this: GameStageContext): string {
    return translate(this, "wheelResetSessionAction");
  },

  wheelResetShortcutDisabled(this: GameStageContext): boolean {
    const lacksWorkspaceControl = this.wheelMode !== "config"
      && this.isWorkspaceScopeActive === true
      && this.isCurrentWorkspaceOwner !== true;
    return !this.wheelDisplayConfig
      || this.wheelSpinning
      || this.wheelGridRevealAnimating
      || this.wheelGridResetAnimating
      || this.wheelEndingSession
      || this.wheelChaseDialog
      || lacksWorkspaceControl;
  },

  wheelPrimarySpinDisabled(this: GameStageContext): boolean {
    const isConfigMode = this.wheelMode === "config";
    const lacksWorkspaceControl = !isConfigMode
      && this.isWorkspaceScopeActive === true
      && this.isCurrentWorkspaceOwner !== true;
    return this.wheelSpinning
      || this.wheelGridRevealAnimating
      || (isConfigMode && this.wheelConfigSyncPending)
      || (isConfigMode && this.wheelAutospinEnabled)
      || !(this.wheelDisplaySlots?.length)
      || this.wheelEndingSession
      || this.wheelChaseDialog
      || (!isConfigMode && Boolean(this.wheelSpinBlockedReason))
      || lacksWorkspaceControl;
  },

  wheelStageCaption(this: GameStageContext): string {
    const config = this.wheelDisplayConfig ?? null;
    return getTierPrizeGameAdapter(config).stageCaption(adapterContext(this), config);
  },

  wheelCelebrationKicker(this: GameStageContext): string {
    return translate(this, this.wheelCelebrationPreview
      ? "wheelCelebrationPreviewKicker"
      : "wheelCelebrationLiveKicker");
  },

  wheelConfirmTitle(this: GameStageContext): string {
    if (this.wheelConfirmAction === "reset") return translate(this, "wheelConfirmResetTitle");
    if (this.wheelConfirmAction === "end") return translate(this, "wheelConfirmEndTitle");
    if (this.wheelConfirmAction === "delete") return translate(this, "wheelConfirmDeleteTitle");
    return "";
  },

  wheelConfirmBody(this: GameStageContext): string {
    if (this.wheelConfirmAction === "reset") {
      return translate(this, this.wheelMode === "config" ? "wheelConfirmResetConfigBody" : "wheelConfirmResetLiveBody");
    }
    if (this.wheelConfirmAction === "end") return translate(this, "wheelConfirmEndBody");
    if (this.wheelConfirmAction === "delete") return translate(this, "wheelConfirmDeleteBody");
    return "";
  },

  wheelConfirmButtonColor(this: GameStageContext): string {
    return ["reset", "delete", "end"].includes(this.wheelConfirmAction ?? "") ? "error" : "primary";
  },

  wheelConfirmButtonLabel(this: GameStageContext): string {
    if (this.wheelConfirmAction === "reset") return translate(this, "commonReset");
    if (this.wheelConfirmAction === "end") return translate(this, "wheelEndSessionAction");
    if (this.wheelConfirmAction === "delete") return translate(this, "commonDelete");
    return "";
  },

  wheelLiveConfirmSummaryName(this: GameStageContext): string {
    return this.activeWheelConfig?.name || translate(this, "wheelStageTitleFallback");
  },

  wheelLiveConfirmSummarySlots(this: GameStageContext): number {
    return getWheelDisplaySlots(adapterContext(this)).length;
  },

  wheelLiveConfirmSummarySpinPrice(this: GameStageContext): string {
    return Number(this.activeWheelConfig?.spinPrice || 0).toFixed(2);
  },

  wheelPendingInventoryIssuesTitle(this: GameStageContext): string {
    const count = this.wheelPendingInventoryIssues?.length ?? 0;
    return translate(this, "wheelPendingInventoryIssuesTitle", {
      count,
      suffix: count === 1 ? "" : "s"
    });
  },

  wheelHasRequiredLotSelection(this: GameStageContext): boolean {
    return (this.wheelPendingInventoryIssues ?? []).some((entry) => entry.requiresLotSelection === true);
  },

  wheelStageSummaryCards(this: GameStageContext): StageSummaryCard[] {
    if (this.wheelMode === "live") {
      return [
        {
          id: "spins",
          label: translate(this, "wheelSpinsLabel"),
          value: Number(this.wheelTotalSpins || 0),
          meta: translate(this, "wheelLiveRevenueMeta", {
            amount: Number(this.wheelSessionRevenue || 0).toFixed(2)
          })
        },
        {
          id: "profit",
          label: translate(this, "wheelGrossProfitLabel"),
          value: String(this.wheelSessionProfitDisplay || ""),
          meta: translate(this, "wheelLivePrizeCostMeta", {
            amount: Number(this.wheelSessionCost || 0).toFixed(2)
          }),
          valueClass: String(this.wheelSessionProfitClass || "")
        },
        {
          id: "margin",
          label: translate(this, "wheelSessionMarginLabel"),
          value: String(this.wheelSessionMarginDisplay || "—"),
          meta: String(this.wheelSessionMarginHint || ""),
          valueStyle: String(this.wheelSessionMarginColor || "")
        }
      ];
    }

    const builderReady = this.canApplyWheelConfig === true;
    return [
      {
        id: "expected-margin",
        label: translate(this, "wheelStageExpectedMarginLabel"),
        value: String(this.expectedMarginDisplay || "—"),
        meta: String(this.expectedMarginHint || ""),
        valueStyle: String(this.expectedMarginColor || "")
      },
      {
        id: "builder-status",
        label: translate(this, "wheelBuilderLabel"),
        value: translate(this, builderReady ? "wheelBuilderReadyLabel" : "wheelBuilderPendingLabel"),
        meta: translate(this, builderReady ? "wheelBuilderReadyHelp" : "wheelBuilderPendingHelp")
      }
    ];
  }
};
