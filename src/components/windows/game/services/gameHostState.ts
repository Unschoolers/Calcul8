import type { WheelConfig } from "../../../../types/app.ts";
import type { BracketBattleRoll, BracketBattleSession } from "../bracket/bracketBattleDomain.ts";
import type { GameStageOverlayCommand } from "../overlay/gameStageOverlayTypes.ts";

export function createGameHostState() {
  return {
    editingWheelConfig: null as WheelConfig | null,
    appliedWheelConfigSnapshot: null as WheelConfig | null,
    wheelConfigSyncPending: false, wheelAutospinEnabled: false, wheelSoundEnabled: true, wheelReducedMotion: false,
    wheelMobileInspectorOpen: false, wheelCelebrationVisible: false, wheelCelebrationLabel: "",
    wheelCelebrationColor: "#f0a500", wheelCelebrationImage: "", wheelCelebrationEmoji: "",
    wheelCelebrationPreview: false, wheelCelebrationNonce: 0, wheelGridRevealAnimating: false,
    wheelGridResetAnimating: false, wheelGridHighlightCellIndex: -1, wheelCanvasSize: 360,
    wheelConfigReady: false, wheelViewportWidth: 0, wheelMode: "config" as "config" | "live",
    _wheelDraftSaveTimeoutId: undefined as ReturnType<typeof globalThis.setTimeout> | undefined,
    wheelInspectorTab: "config" as "config" | "session" | "history", wheelEndingSession: false,
    wheelEndSessionReviewActive: false, wheelPresentationMode: false, wheelConfirmDialog: false,
    wheelConfirmAction: "" as "reset" | "delete" | "apply" | "end" | "", wheelLiveConfirmDialog: false,
    wheelRequestedMode: null as "config" | "live" | null, wheelPendingMenuOpen: false, wheelChaseDialog: false,
    wheelChasePreviewMode: false, wheelChaseReplacementSinglesId: null as number | null,
    wheelChasePendingTierId: "", wheelCreateDialog: false, wheelManageDialog: false, wheelManageName: "",
    gameSpectatorDialog: false, gameSpectatorSessionId: "", gameSpectatorSessionStatus: "inactive" as "inactive" | "starting" | "live" | "ended",
    gameSpectatorSessionUrl: "", gameSpectatorSessionQrUrl: "", gameSpectatorPublishPending: false,
    gameSpectatorConnectedCount: 0, gameStageOverlayEnabled: false, gameStageOverlayMounted: false,
    gameStageOverlayActiveCommand: null as GameStageOverlayCommand | null, gameStageOverlayLastResolvedAt: 0,
    bracketBattleSession: null as BracketBattleSession | null, bracketBattleLastRolls: [] as BracketBattleRoll[],
    bracketBattleRolling: false, bracketBattleShowcaseMatchId: null as string | null, _wheelAppliedRealtimeRevision: 0
  };
}

export type GameHostState = ReturnType<typeof createGameHostState>;
