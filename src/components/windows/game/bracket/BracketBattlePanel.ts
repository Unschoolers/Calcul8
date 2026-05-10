import { inject, nextTick, type PropType } from "vue";
import { createDefaultBracketBattleConfig } from "../../../../app-core/shared/bracket-battle-config.ts";
import type { BracketBattleConfig, Lot, WheelConfig, WorkspaceScopeType } from "../../../../types/app.ts";
import { createNestedWindowContextBridge } from "../../shared/contextBridge.ts";
import type { GameStageOverlayAnchor, GameStageOverlayCommand } from "../overlay/gameStageOverlayTypes.ts";
import { createBracketBattleOverlayAnchor } from "./bracketBattleOverlayAnchors.ts";
import {
  resolveBracketBattleMatchRoll,
  type BracketBattleMatch,
  type BracketBattleRoll,
  type BracketBattleSession
} from "./bracketBattleDomain.ts";
import {
  buildBracketBattleSessionStatePayload,
  getBracketBattleSessionStorageKey,
  groupBracketBattleRounds,
  loadBracketBattleSessionState,
  persistBracketBattleSessionState,
  resolveBracketBattleActiveMatch,
  resolveBracketBattleQueuedMatch,
  type BracketBattleSessionStatePayload
} from "./bracketBattleHostFlow.ts";
import {
  createBracketBattleSessionFromDraft,
  getBracketBattleDraftValidation,
  type BracketBattleDraft,
} from "./bracketBattlePanelModel.ts";

type BracketBattleRollPreview = {
  participantId: string | null;
  value: number;
};

type BracketBattleIntervalHandle = ReturnType<typeof globalThis.setInterval>;
type BracketBattleTimeoutHandle = ReturnType<typeof globalThis.setTimeout>;

type BracketBattlePanelThis = Record<string, unknown> & {
  bracketBattleParentCtx?: Record<string, unknown> | null;
  bracketDraft: BracketBattleDraft;
  bracketSession: BracketBattleSession | null;
  bracketLastRolls: BracketBattleRoll[];
  bracketRollPreview: BracketBattleRollPreview[];
  bracketShowcaseMatchId: string | null;
  bracketResetDialog: boolean;
  bracketRolling: boolean;
  bracketRollIntervalId: BracketBattleIntervalHandle | null;
  bracketRollResolveTimeoutId: BracketBattleTimeoutHandle | null;
  bracketBattleSession: BracketBattleSession | null;
  bracketBattleLastRolls: BracketBattleRoll[];
  bracketBattleRolling: boolean;
  bracketBattleShowcaseMatchId: string | null;
  canStartBracketBattle: boolean;
  activeBracketMatch: BracketBattleMatch | null;
  queuedBracketMatch: BracketBattleMatch | null;
  wheelDisplayConfig: WheelConfig | null;
  wheelMode: "config" | "live";
  activeWheelConfigId: number | null;
  wheelPresentationMode: boolean;
  wheelViewportWidth: number;
  lots: Lot[];
  activeScopeType: WorkspaceScopeType;
  activeWorkspaceId: string | null;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  $emit: {
    (event: "overlay-command", command: GameStageOverlayCommand): void;
    (event: "session-state", payload: BracketBattleSessionStatePayload): void;
  };
  $el?: Element | null;
  $refs?: {
    leftRollSlotEl?: Element | null;
    rightRollSlotEl?: Element | null;
    actionDiceStageEl?: Element | null;
  };
  loadBracketSession(): void;
  persistBracketSession(): void;
  clearBracketRollAnimation(): void;
  getBracketBattleRollSlotAnchors(): { leftAnchor?: GameStageOverlayAnchor; rightAnchor?: GameStageOverlayAnchor };
  getBracketBattleActionDiceAnchors(): { leftAnchor?: GameStageOverlayAnchor; rightAnchor?: GameStageOverlayAnchor };
  refreshBracketBattleDiceAnchors(): void;
  getBracketBattleChampionWinnerSide(): "left" | "right" | null;
  isBracketFinalMatch(match: BracketBattleMatch | null | undefined): boolean;
  bracketParticipantLabel(participantId: string | null | undefined): string;
  bracketRollColorTone(roll: BracketBattleRoll): "dark" | "light";
  syncBracketBattleParentState?: () => void;
  publishLiveBracketSpectatorSnapshot?: () => void;
  publishWheelSpectatorSessionSnapshot?: (statusOverride?: "starting" | "live" | "ended") => Promise<void>;
};

const BRACKET_ROLL_PREVIEW_INTERVAL_MS = 90;
const BRACKET_ROLL_RESOLVE_DELAY_MS = 1000;

function findById<T extends { id: string }>(items: T[], id: string | null | undefined): T | null {
  if (!id) return null;
  return items.find((entry) => entry.id === id) ?? null;
}

function createBracketBattleDraftFromConfig(config: BracketBattleConfig, name: string): BracketBattleDraft {
  return {
    name,
    participantCount: config.participantCount,
    participants: [...config.participants],
    prizes: config.prizes.map((prize) => ({ ...prize }))
  };
}

function randomRollValue(min: number, max: number): number {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

export const BracketBattlePanel = {
  name: "BracketBattlePanel",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  emits: ["overlay-command", "session-state"],
  watch: {
    wheelMode(this: BracketBattlePanelThis) {
      this.loadBracketSession();
    },
    activeWheelConfigId(this: BracketBattlePanelThis) {
      this.loadBracketSession();
    },
    wheelPresentationMode(this: BracketBattlePanelThis) {
      void nextTick(() => this.refreshBracketBattleDiceAnchors());
    },
    wheelViewportWidth(this: BracketBattlePanelThis) {
      void nextTick(() => this.refreshBracketBattleDiceAnchors());
    }
  },
  data() {
    return {
      bracketSession: null as BracketBattleSession | null,
      bracketLastRolls: [] as BracketBattleRoll[],
      bracketRollPreview: [] as BracketBattleRollPreview[],
      bracketShowcaseMatchId: null as string | null,
      bracketResetDialog: false,
      bracketRolling: false,
      bracketRollIntervalId: null as BracketBattleIntervalHandle | null,
      bracketRollResolveTimeoutId: null as BracketBattleTimeoutHandle | null
    };
  },
  computed: {
    bracketDraft(this: BracketBattlePanelThis): BracketBattleDraft {
      const config = (this.wheelDisplayConfig as WheelConfig | null)?.bracketBattle
        ?? createDefaultBracketBattleConfig(4);
      return createBracketBattleDraftFromConfig(config, (this.wheelDisplayConfig as WheelConfig | null)?.name || "Bracket Battle");
    },
    bracketDraftValidation(this: BracketBattlePanelThis) {
      return getBracketBattleDraftValidation(this.bracketDraft);
    },
    canStartBracketBattle(this: BracketBattlePanelThis): boolean {
      return getBracketBattleDraftValidation(this.bracketDraft).valid;
    },
    activeBracketMatch(this: BracketBattlePanelThis): BracketBattleMatch | null {
      return resolveBracketBattleActiveMatch(this.bracketSession, this.bracketShowcaseMatchId);
    },
    queuedBracketMatch(this: BracketBattlePanelThis): BracketBattleMatch | null {
      return resolveBracketBattleQueuedMatch(this.bracketSession);
    },
    bracketRoundGroups(this: BracketBattlePanelThis): Array<{ round: number; matches: BracketBattleMatch[] }> {
      return groupBracketBattleRounds(this.bracketSession);
    },
    bracketChampionName(this: BracketBattlePanelThis): string {
      const championId = this.bracketSession?.championParticipantId ?? null;
      return this.bracketParticipantLabel(championId);
    }
  },
  methods: {
    emitBracketBattleSessionState(this: BracketBattlePanelThis, publishLive: boolean = false): void {
      this.$emit("session-state", buildBracketBattleSessionStatePayload({
        session: this.bracketSession,
        lastRolls: this.bracketLastRolls,
        rolling: this.bracketRolling,
        showcaseMatchId: this.bracketShowcaseMatchId,
        publishLive
      }));
    },
    syncBracketBattleParentState(this: BracketBattlePanelThis): void {
      if (typeof this.emitBracketBattleSessionState === "function") {
        this.emitBracketBattleSessionState(false);
      }
    },
    publishLiveBracketSpectatorSnapshot(this: BracketBattlePanelThis): void {
      if (typeof this.syncBracketBattleParentState === "function") {
        this.syncBracketBattleParentState();
      }
      if (typeof this.emitBracketBattleSessionState === "function") {
        this.emitBracketBattleSessionState(true);
      }
    },
    clearBracketRollAnimation(this: BracketBattlePanelThis): void {
      if (this.bracketRollIntervalId != null) {
        clearInterval(this.bracketRollIntervalId);
        this.bracketRollIntervalId = null;
      }
      if (this.bracketRollResolveTimeoutId != null) {
        clearTimeout(this.bracketRollResolveTimeoutId);
        this.bracketRollResolveTimeoutId = null;
      }
      this.bracketRollPreview = [];
      this.bracketRolling = false;
      this.syncBracketBattleParentState?.();
    },
    loadBracketSession(this: BracketBattlePanelThis): void {
      this.clearBracketRollAnimation();
      const loaded = loadBracketBattleSessionState(localStorage, this);
      this.bracketSession = loaded.session;
      this.bracketLastRolls = loaded.lastRolls;
      this.bracketShowcaseMatchId = loaded.showcaseMatchId;
      this.syncBracketBattleParentState?.();
      if (loaded.shouldClearDice) {
        this.$emit("overlay-command", { type: "clear", effect: "dice" });
      }
    },
    persistBracketSession(this: BracketBattlePanelThis): void {
      persistBracketBattleSessionState(
        localStorage,
        getBracketBattleSessionStorageKey(this),
        this.bracketSession
      );
    },
    getBracketBattleRollSlotAnchors(this: BracketBattlePanelThis): {
      leftAnchor?: GameStageOverlayAnchor;
      rightAnchor?: GameStageOverlayAnchor;
    } {
      const componentEl = this.$el as { closest?: (selector: string) => unknown } | null | undefined;
      const surfaceEl = typeof componentEl?.closest === "function"
        ? componentEl.closest(".game-stage-overlay-surface")
        : null;
      const leftRollSlotEl = this.$refs?.leftRollSlotEl;
      const rightRollSlotEl = this.$refs?.rightRollSlotEl;
      if (
        !surfaceEl
        || typeof (surfaceEl as { getBoundingClientRect?: unknown }).getBoundingClientRect !== "function"
        || !leftRollSlotEl
        || typeof (leftRollSlotEl as { getBoundingClientRect?: unknown }).getBoundingClientRect !== "function"
        || !rightRollSlotEl
        || typeof (rightRollSlotEl as { getBoundingClientRect?: unknown }).getBoundingClientRect !== "function"
      ) {
        return {};
      }

      const surfaceRect = (surfaceEl as { getBoundingClientRect: () => DOMRectReadOnly }).getBoundingClientRect();
      return {
        leftAnchor: createBracketBattleOverlayAnchor(
          surfaceRect,
          (leftRollSlotEl as { getBoundingClientRect: () => DOMRectReadOnly }).getBoundingClientRect()
        ),
        rightAnchor: createBracketBattleOverlayAnchor(
          surfaceRect,
          (rightRollSlotEl as { getBoundingClientRect: () => DOMRectReadOnly }).getBoundingClientRect()
        )
      };
    },
    getBracketBattleActionDiceAnchors(this: BracketBattlePanelThis): {
      leftAnchor?: GameStageOverlayAnchor;
      rightAnchor?: GameStageOverlayAnchor;
    } {
      const componentEl = this.$el as { closest?: (selector: string) => unknown } | null | undefined;
      const surfaceEl = typeof componentEl?.closest === "function"
        ? componentEl.closest(".game-stage-overlay-surface")
        : null;
      const actionDiceStageEl = this.$refs?.actionDiceStageEl;
      if (
        !surfaceEl
        || typeof (surfaceEl as { getBoundingClientRect?: unknown }).getBoundingClientRect !== "function"
        || !actionDiceStageEl
        || typeof (actionDiceStageEl as { getBoundingClientRect?: unknown }).getBoundingClientRect !== "function"
      ) {
        return {};
      }

      const surfaceRect = (surfaceEl as { getBoundingClientRect: () => DOMRectReadOnly }).getBoundingClientRect();
      const stageRect = (actionDiceStageEl as { getBoundingClientRect: () => DOMRectReadOnly }).getBoundingClientRect();
      const slotWidth = stageRect.width * 0.38;
      const slotHeight = stageRect.height;
      const leftRect = {
        left: stageRect.left + stageRect.width * 0.08,
        top: stageRect.top,
        width: slotWidth,
        height: slotHeight
      };
      const rightRect = {
        left: stageRect.left + stageRect.width * 0.54,
        top: stageRect.top,
        width: slotWidth,
        height: slotHeight
      };

      return {
        leftAnchor: createBracketBattleOverlayAnchor(surfaceRect, leftRect),
        rightAnchor: createBracketBattleOverlayAnchor(surfaceRect, rightRect)
      };
    },
    refreshBracketBattleDiceAnchors(this: BracketBattlePanelThis): void {
      if (!this.bracketSession) return;
      const anchors = this.activeBracketMatch
        ? this.getBracketBattleRollSlotAnchors()
        : this.getBracketBattleActionDiceAnchors();
      this.$emit("overlay-command", {
        type: "anchorUpdate",
        effect: "dice",
        leftAnchor: anchors.leftAnchor,
        rightAnchor: anchors.rightAnchor
      });
    },
    getBracketBattleChampionWinnerSide(this: BracketBattlePanelThis): "left" | "right" | null {
      const session = this.bracketSession;
      if (!session?.championParticipantId) {
        return null;
      }
      const finalMatch = [...session.matches]
        .reverse()
        .find((match) => match.winnerParticipantId === session.championParticipantId);
      if (!finalMatch) {
        return null;
      }
      if (finalMatch.participantAId === session.championParticipantId) {
        return "left";
      }
      if (finalMatch.participantBId === session.championParticipantId) {
        return "right";
      }
      return null;
    },
    isBracketFinalMatch(this: BracketBattlePanelThis, match: BracketBattleMatch | null | undefined): boolean {
      if (!this.bracketSession || !match) {
        return false;
      }
      return match.round === Math.log2(this.bracketSession.participantCount);
    },
    startBracketBattle(this: BracketBattlePanelThis): void {
      if (!this.canStartBracketBattle) return;
      this.clearBracketRollAnimation();
      this.bracketSession = createBracketBattleSessionFromDraft(this.bracketDraft);
      this.bracketShowcaseMatchId = this.bracketSession.matches.find((match) => match.status === "active")?.id ?? null;
      this.bracketLastRolls = [];
      this.persistBracketSession();
      this.publishLiveBracketSpectatorSnapshot?.();
      const emitStageEnter = () => {
        const { leftAnchor, rightAnchor } = this.getBracketBattleRollSlotAnchors();
        this.$emit("overlay-command", {
          type: "stageEnter",
          effect: "dice",
          leftAnchor,
          rightAnchor
        });
      };
      if (typeof queueMicrotask === "function") {
        queueMicrotask(emitStageEnter);
      } else {
        globalThis.setTimeout(emitStageEnter, 0);
      }
    },
    rollActiveBracketMatch(this: BracketBattlePanelThis): void {
      const session = this.bracketSession;
      const match = this.queuedBracketMatch;
      if (!session || !match || this.bracketRolling) return;

      this.clearBracketRollAnimation();
      this.bracketShowcaseMatchId = match.id;
      this.bracketRolling = true;
      this.syncBracketBattleParentState?.();
      this.publishLiveBracketSpectatorSnapshot?.();
      this.bracketRollPreview = [
        {
          participantId: match.participantAId,
          value: randomRollValue(session.rollMin, session.rollMax)
        },
        {
          participantId: match.participantBId,
          value: randomRollValue(session.rollMin, session.rollMax)
        }
      ];
      const activeAnchors: { leftAnchor?: GameStageOverlayAnchor; rightAnchor?: GameStageOverlayAnchor } = this.getBracketBattleRollSlotAnchors();
      const startPreview = (leftAnchor?: GameStageOverlayAnchor, rightAnchor?: GameStageOverlayAnchor) => {
        activeAnchors.leftAnchor = leftAnchor;
        activeAnchors.rightAnchor = rightAnchor;
        this.$emit("overlay-command", {
          type: "rollMatchStart",
          effect: "dice",
          leftLabel: this.bracketParticipantLabel(match.participantAId),
          rightLabel: this.bracketParticipantLabel(match.participantBId),
          leftAnchor,
          rightAnchor
        });
        this.bracketRollIntervalId = globalThis.setInterval(() => {
          this.bracketRollPreview = this.bracketRollPreview.map((entry) => ({
            participantId: entry.participantId,
            value: randomRollValue(session.rollMin, session.rollMax)
          }));
        }, BRACKET_ROLL_PREVIEW_INTERVAL_MS);
      };
      startPreview(activeAnchors.leftAnchor, activeAnchors.rightAnchor);
      this.bracketRollResolveTimeoutId = globalThis.setTimeout(() => {
        try {
          if (this.bracketRollIntervalId != null) {
            clearInterval(this.bracketRollIntervalId);
            this.bracketRollIntervalId = null;
          }
          const result = resolveBracketBattleMatchRoll(session, match.id);
          this.bracketLastRolls = result.rolls;
          const decidingRolls = result.rolls.slice(-2);
          const leftRoll = decidingRolls.find((entry) => entry.participantId === match.participantAId);
          const rightRoll = decidingRolls.find((entry) => entry.participantId === match.participantBId);
          if (session.status === "complete") {
            this.bracketShowcaseMatchId = null;
          }
          this.persistBracketSession();
          if (leftRoll && rightRoll) {
            const emitResolve = (resolvedLeftAnchor?: GameStageOverlayAnchor, resolvedRightAnchor?: GameStageOverlayAnchor) => {
              this.$emit("overlay-command", {
                type: "rollMatchResolve",
                effect: "dice",
                leftValue: leftRoll.value,
                rightValue: rightRoll.value,
                winnerSide: result.winnerParticipantId === match.participantAId ? "left" : "right",
                winnerLabel: this.bracketParticipantLabel(result.winnerParticipantId),
                leftAnchor: resolvedLeftAnchor ?? activeAnchors.leftAnchor,
                rightAnchor: resolvedRightAnchor ?? activeAnchors.rightAnchor,
                finalMatch: session.status === "complete"
              });
            };

            if (session.status === "complete") {
              void nextTick(() => {
                const championAnchors = this.getBracketBattleActionDiceAnchors();
                emitResolve(championAnchors.leftAnchor, championAnchors.rightAnchor);
              });
            } else {
              emitResolve(activeAnchors.leftAnchor, activeAnchors.rightAnchor);
            }
          }
        } finally {
          this.bracketRollPreview = [];
          this.bracketRolling = false;
          this.syncBracketBattleParentState?.();
          this.publishLiveBracketSpectatorSnapshot?.();
          this.bracketRollResolveTimeoutId = null;
        }
      }, BRACKET_ROLL_RESOLVE_DELAY_MS);
    },
    resetBracketBattle(this: BracketBattlePanelThis): void {
      const resetAnchors = this.bracketSession?.status === "complete"
        ? this.getBracketBattleActionDiceAnchors()
        : this.getBracketBattleRollSlotAnchors();
      const winnerSide = this.getBracketBattleChampionWinnerSide();
      this.clearBracketRollAnimation();
      this.bracketSession = null;
      this.bracketLastRolls = [];
      this.bracketShowcaseMatchId = null;
      this.bracketResetDialog = false;
      this.persistBracketSession();
      this.publishLiveBracketSpectatorSnapshot?.();
      this.$emit("overlay-command", {
        type: "stageExit",
        effect: "dice",
        leftAnchor: resetAnchors.leftAnchor,
        rightAnchor: resetAnchors.rightAnchor,
        winnerSide,
        style: winnerSide ? "champion" : "default"
      });
    },
    bracketParticipantLabel(this: BracketBattlePanelThis, participantId: string | null | undefined): string {
      const participant = findById(this.bracketSession?.participants ?? [], participantId);
      return participant?.buyerName || this.t("bracketBattleWaitingLabel");
    },
    bracketRollColorTone(this: BracketBattlePanelThis, roll: BracketBattleRoll): "dark" | "light" {
      const match = this.bracketSession?.matches.find((entry) => entry.id === roll.matchId);
      if (match?.participantAId === roll.participantId) {
        return "dark";
      }
      return "light";
    },
    bracketPrizeLabel(this: BracketBattlePanelThis, prizeId: string | null | undefined): string {
      const prize = findById(this.bracketSession?.prizes ?? [], prizeId);
      return prize?.label || this.t("bracketBattlePrizeFallbackLabel");
    },
    bracketMatchRollSummary(this: BracketBattlePanelThis, match: BracketBattleMatch): string {
      const rolls = (this.bracketSession?.rolls || []).filter((roll) => roll.matchId === match.id);
      if (!rolls.length) return "";
      return rolls.map((roll) => `${this.bracketParticipantLabel(roll.participantId)} ${roll.value}`).join(" / ");
    },
    bracketRollDisplayValue(this: BracketBattlePanelThis, participantId: string | null | undefined): string {
      if (!participantId) return "--";
      const preview = this.bracketRollPreview.find((entry) => entry.participantId === participantId);
      if (preview) return String(preview.value);
      const match = this.activeBracketMatch;
      if (!match) return "--";
      const lastRoll = [...this.bracketLastRolls]
        .reverse()
        .find((entry) => entry.matchId === match.id && entry.participantId === participantId);
      return lastRoll ? String(lastRoll.value) : "--";
    },
    bracketParticipantMatchState(this: BracketBattlePanelThis, match: BracketBattleMatch | null, participantId: string | null | undefined): string {
      if (!match || !participantId) return "pending";
      if (match.status !== "complete") return "active";
      return match.winnerParticipantId === participantId ? "winner" : "eliminated";
    },
  },
  mounted(this: BracketBattlePanelThis) {
    this.loadBracketSession();
  },
  beforeUnmount(this: BracketBattlePanelThis) {
    this.clearBracketRollAnimation();
    if (typeof this.emitBracketBattleSessionState === "function") {
      this.bracketSession = null;
      this.bracketLastRolls = [];
      this.bracketRolling = false;
      this.bracketShowcaseMatchId = null;
      this.emitBracketBattleSessionState(false);
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedGameCtx = inject<Record<string, unknown> | null>("gameCtx", null);
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedGameCtx ?? props.ctx ?? injectedCtx) as Record<string, unknown>;
    const bridge = createNestedWindowContextBridge(source);
    return new Proxy(bridge, {
      get(target, key, receiver) {
        if (key === "bracketBattleParentCtx") {
          return source;
        }
        return Reflect.get(target, key, receiver);
      },
      has(target, key) {
        return key === "bracketBattleParentCtx" || Reflect.has(target, key);
      },
      getOwnPropertyDescriptor(target, key) {
        if (key === "bracketBattleParentCtx") {
          return {
            enumerable: true,
            configurable: true,
            writable: false,
            value: source
          };
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      }
    });
  }
};
