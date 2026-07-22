import { defineComponent, nextTick } from "vue";
import { createDefaultBracketBattleConfig } from "../../../../app-core/shared/bracket-battle-config.ts";
import type { BracketBattleConfig, WheelConfig } from "../../../../types/app.ts";
import { gameContextProp, setupGameContext } from "../../shared/contextBridge.ts";
import type { GameHostState } from "../services/gameHostState.ts";
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
  runBracketBattleMatchSettlement,
  runBracketBattleSessionReset,
  resolveBracketBattleActiveMatch,
  resolveBracketBattleQueuedMatch,
  type BracketBattleHostFlowContext,
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

type BracketBattleLatestRollDuelEntry = {
  id: string;
  label: string;
  value: number;
  tone: "dark" | "light";
  winner: boolean;
};

type BracketBattleLatestRollDuelGroup = {
  id: string;
  tied: boolean;
  entries: BracketBattleLatestRollDuelEntry[];
};

type BracketBattleIntervalHandle = ReturnType<typeof globalThis.setInterval>;
type BracketBattleTimeoutHandle = ReturnType<typeof globalThis.setTimeout>;

type BracketBattleLifecycleHost = {
  bracketSession: BracketBattleSession | null;
  bracketLastRolls: BracketBattleRoll[];
  bracketRolling: boolean;
  bracketShowcaseMatchId: string | null;
  persistBracketSession(): void;
  syncBracketBattleParentState?(): void;
};

type BracketBattleParentContext = BracketBattleHostFlowContext
  & Pick<GameHostState, "wheelPresentationMode" | "wheelViewportWidth">
  & {
  wheelDisplayConfig: WheelConfig | null;
  t(key: string, params?: Record<string, string | number | null | undefined>): string;
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

function commitBracketBattleLifecycleState(
  panel: BracketBattleLifecycleHost,
  state: BracketBattleSessionStatePayload
): void {
  panel.bracketSession = state.session;
  panel.bracketLastRolls = state.lastRolls;
  panel.bracketRolling = state.rolling;
  panel.bracketShowcaseMatchId = state.showcaseMatchId;
  panel.persistBracketSession();
  panel.syncBracketBattleParentState?.();
}

export const BracketBattlePanel = defineComponent({
  name: "BracketBattlePanel",
  props: {
    ctx: gameContextProp
  },
  emits: ["overlay-command", "session-state"],
  watch: {
    wheelMode() {
      this.loadBracketSession();
    },
    activeWheelConfigId() {
      this.loadBracketSession();
    },
    wheelPresentationMode() {
      void nextTick(() => this.refreshBracketBattleDiceAnchors());
    },
    wheelViewportWidth() {
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
    bracketDraft(): BracketBattleDraft {
      const config = (this.wheelDisplayConfig as WheelConfig | null)?.bracketBattle
        ?? createDefaultBracketBattleConfig(4);
      return createBracketBattleDraftFromConfig(config, (this.wheelDisplayConfig as WheelConfig | null)?.name || "Bracket Battle");
    },
    bracketDraftValidation() {
      return getBracketBattleDraftValidation(this.bracketDraft);
    },
    canStartBracketBattle(): boolean {
      return getBracketBattleDraftValidation(this.bracketDraft).valid;
    },
    activeBracketMatch(): BracketBattleMatch | null {
      return resolveBracketBattleActiveMatch(this.bracketSession, this.bracketShowcaseMatchId);
    },
    queuedBracketMatch(): BracketBattleMatch | null {
      return resolveBracketBattleQueuedMatch(this.bracketSession);
    },
    bracketRoundGroups(): Array<{ round: number; matches: BracketBattleMatch[] }> {
      return groupBracketBattleRounds(this.bracketSession);
    },
    bracketChampionName(): string {
      const championId = this.bracketSession?.championParticipantId ?? null;
      return this.bracketParticipantLabel(championId);
    }
  },
  methods: {
    emitBracketBattleSessionState(publishLive: boolean = false): void {
      this.$emit("session-state", buildBracketBattleSessionStatePayload({
        session: this.bracketSession,
        lastRolls: this.bracketLastRolls,
        rolling: this.bracketRolling,
        showcaseMatchId: this.bracketShowcaseMatchId,
        publishLive
      }));
    },
    syncBracketBattleParentState(): void {
      if (typeof this.emitBracketBattleSessionState === "function") {
        this.emitBracketBattleSessionState(false);
      }
    },
    publishLiveBracketSpectatorSnapshot(): void {
      if (typeof this.emitBracketBattleSessionState === "function") {
        this.emitBracketBattleSessionState(true);
      }
    },
    clearBracketRollAnimation(): void {
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
    loadBracketSession(): void {
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
    persistBracketSession(): void {
      persistBracketBattleSessionState(
        localStorage,
        getBracketBattleSessionStorageKey(this),
        this.bracketSession
      );
    },
    getBracketBattleRollSlotAnchors(): {
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
    getBracketBattleActionDiceAnchors(): {
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
    refreshBracketBattleDiceAnchors(): void {
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
    getBracketBattleChampionWinnerSide(): "left" | "right" | null {
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
    isBracketFinalMatch(match: BracketBattleMatch | null | undefined): boolean {
      if (!this.bracketSession || !match) {
        return false;
      }
      return match.round === Math.log2(this.bracketSession.participantCount);
    },
    startBracketBattle(): void {
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
      void nextTick(emitStageEnter);
    },
    advanceBracketBattleToQueuedMatch(): boolean {
      const activeMatch = this.activeBracketMatch;
      const queuedMatch = this.queuedBracketMatch;
      if (
        this.bracketRolling
        || activeMatch?.status !== "complete"
        || !queuedMatch
        || queuedMatch.id === activeMatch.id
      ) {
        return false;
      }

      this.bracketShowcaseMatchId = queuedMatch.id;
      this.bracketRollPreview = [];
      this.publishLiveBracketSpectatorSnapshot?.();
      void nextTick(() => {
        if (!this.bracketRolling && this.bracketShowcaseMatchId === queuedMatch.id) {
          this.refreshBracketBattleDiceAnchors();
        }
      });
      return true;
    },
    runBracketBattlePrimaryAction(): void {
      if (this.advanceBracketBattleToQueuedMatch()) {
        return;
      }
      this.rollActiveBracketMatch();
    },
    rollActiveBracketMatch(): void {
      const session = this.bracketSession;
      const match = this.queuedBracketMatch;
      if (!session || !match || this.bracketRolling) return;

      this.clearBracketRollAnimation();
      this.bracketShowcaseMatchId = match.id;
      this.bracketRolling = true;
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
      const startPreview = () => {
        const activeAnchors: { leftAnchor?: GameStageOverlayAnchor; rightAnchor?: GameStageOverlayAnchor } =
          this.getBracketBattleRollSlotAnchors();
        this.$emit("overlay-command", {
          type: "rollMatchStart",
          effect: "dice",
          leftLabel: this.bracketParticipantLabel(match.participantAId),
          rightLabel: this.bracketParticipantLabel(match.participantBId),
          leftAnchor: activeAnchors.leftAnchor,
          rightAnchor: activeAnchors.rightAnchor
        });
        this.bracketRollIntervalId = globalThis.setInterval(() => {
          this.bracketRollPreview = this.bracketRollPreview.map((entry) => ({
            participantId: entry.participantId,
            value: randomRollValue(session.rollMin, session.rollMax)
          }));
        }, BRACKET_ROLL_PREVIEW_INTERVAL_MS);

        this.bracketRollResolveTimeoutId = globalThis.setTimeout(() => {
          try {
            if (this.bracketRollIntervalId != null) {
              clearInterval(this.bracketRollIntervalId);
              this.bracketRollIntervalId = null;
            }
            const result = resolveBracketBattleMatchRoll(session, match.id);
            const decidingRolls = result.rolls.slice(-2);
            const leftRoll = decidingRolls.find((entry) => entry.participantId === match.participantAId);
            const rightRoll = decidingRolls.find((entry) => entry.participantId === match.participantBId);
            void runBracketBattleMatchSettlement(buildBracketBattleSessionStatePayload({
              session: this.bracketSession,
              lastRolls: this.bracketLastRolls,
              rolling: this.bracketRolling,
              showcaseMatchId: this.bracketShowcaseMatchId
            }), this.wheelMode === "live" ? "live" : "preview", session, result.rolls, {
              persist: (next) => commitBracketBattleLifecycleState(this, next),
              publish: () => this.publishLiveBracketSpectatorSnapshot?.()
            });
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

              void nextTick(() => {
                const resolvedAnchors = session.status === "complete"
                  ? this.getBracketBattleActionDiceAnchors()
                  : this.getBracketBattleRollSlotAnchors();
                emitResolve(resolvedAnchors.leftAnchor, resolvedAnchors.rightAnchor);
              });
            }
          } finally {
            this.bracketRollPreview = [];
            this.bracketRollResolveTimeoutId = null;
          }
        }, BRACKET_ROLL_RESOLVE_DELAY_MS);
      };
      void nextTick(() => {
        if (!this.bracketRolling || this.bracketShowcaseMatchId !== match.id) return;
        startPreview();
      });
    },
    resetBracketBattle(): void {
      const resetAnchors = this.bracketSession?.status === "complete"
        ? this.getBracketBattleActionDiceAnchors()
        : this.getBracketBattleRollSlotAnchors();
      const winnerSide = this.getBracketBattleChampionWinnerSide();
      this.clearBracketRollAnimation();
      this.bracketResetDialog = false;
      void runBracketBattleSessionReset(buildBracketBattleSessionStatePayload({
        session: this.bracketSession,
        lastRolls: this.bracketLastRolls,
        rolling: this.bracketRolling,
        showcaseMatchId: this.bracketShowcaseMatchId
      }), this.wheelMode === "live" ? "live" : "preview", {
        persist: (next) => commitBracketBattleLifecycleState(this, next),
        publish: () => this.publishLiveBracketSpectatorSnapshot?.()
      });
      this.$emit("overlay-command", {
        type: "stageExit",
        effect: "dice",
        leftAnchor: resetAnchors.leftAnchor,
        rightAnchor: resetAnchors.rightAnchor,
        winnerSide,
        style: winnerSide ? "champion" : "default"
      });
    },
    bracketParticipantLabel(participantId: string | null | undefined): string {
      const participant = findById(this.bracketSession?.participants ?? [], participantId);
      return participant?.buyerName || this.t("bracketBattleWaitingLabel");
    },
    bracketRollColorTone(roll: BracketBattleRoll): "dark" | "light" {
      const match = this.bracketSession?.matches.find((entry) => entry.id === roll.matchId);
      if (match?.participantAId === roll.participantId) {
        return "dark";
      }
      return "light";
    },
    bracketPrizeLabel(prizeId: string | null | undefined): string {
      const prize = findById(this.bracketSession?.prizes ?? [], prizeId);
      return prize?.label || this.t("bracketBattlePrizeFallbackLabel");
    },
    bracketLatestRollDuelGroups(): BracketBattleLatestRollDuelGroup[] {
      const groups = new Map<string, BracketBattleRoll[]>();
      for (const roll of this.bracketLastRolls) {
        const key = `${roll.matchId}-${roll.rollNumber}`;
        const entries = groups.get(key) ?? [];
        entries.push(roll);
        groups.set(key, entries);
      }

      return [...groups.entries()].map(([id, rolls]) => {
        const highestValue = Math.max(...rolls.map((roll) => roll.value));
        const tied = rolls.filter((roll) => roll.value === highestValue).length !== 1;
        return {
          id,
          tied,
          entries: rolls.map((roll) => ({
            id: roll.id,
            label: this.bracketParticipantLabel(roll.participantId),
            value: roll.value,
            tone: this.bracketRollColorTone(roll),
            winner: !tied && roll.value === highestValue
          }))
        };
      });
    },
    bracketDuelStatusLabel(): string {
      const match = this.activeBracketMatch;
      if (this.bracketRolling) {
        return this.t("bracketBattleRollingLabel");
      }
      if (match?.status === "complete" && match.winnerParticipantId) {
        return this.t("bracketBattleMatchWonLabel", {
          winner: this.bracketParticipantLabel(match.winnerParticipantId),
          prize: this.bracketPrizeLabel(match.prizeId)
        });
      }
      return this.t("bracketBattleReadyLabel");
    },
    bracketRollButtonLabel(): string {
      const activeMatch = this.activeBracketMatch;
      const queuedMatch = this.queuedBracketMatch;
      if (activeMatch?.status === "complete" && queuedMatch && queuedMatch.id !== activeMatch.id) {
        return this.t("bracketBattleNextMatchAction");
      }
      return this.t("bracketBattleRollAction");
    },
    bracketProgressSummary(): string {
      const session = this.bracketSession;
      if (!session) return "";
      const totalMatches = session.matches.length;
      const match = this.activeBracketMatch
        ?? this.queuedBracketMatch
        ?? session.matches[session.matches.length - 1]
        ?? null;
      const matchIndex = match
        ? Math.max(1, session.matches.findIndex((entry) => entry.id === match.id) + 1)
        : totalMatches;
      const round = match?.round ?? Math.log2(session.participantCount);
      return this.t("bracketBattleProgressSummary", {
        current: matchIndex,
        total: totalMatches,
        round,
        awards: session.awards.length
      });
    },
    bracketRollDisplayValue(participantId: string | null | undefined): string {
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
    bracketParticipantMatchState(match: BracketBattleMatch | null, participantId: string | null | undefined): string {
      if (!match || !participantId) return "pending";
      if (match.status !== "complete") return "active";
      return match.winnerParticipantId === participantId ? "winner" : "eliminated";
    },
  },
  mounted() {
    this.loadBracketSession();
  },
  beforeUnmount() {
    this.clearBracketRollAnimation();
    if (typeof this.emitBracketBattleSessionState === "function") {
      this.bracketSession = null;
      this.bracketLastRolls = [];
      this.bracketRolling = false;
      this.bracketShowcaseMatchId = null;
      this.emitBracketBattleSessionState(false);
    }
  },
  setup(props): BracketBattleParentContext {
    return setupGameContext(props) as BracketBattleParentContext;
  }
});
