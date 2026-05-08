import { inject, type PropType } from "vue";
import { getScopedBracketBattleSessionStorageKey } from "../../../../app-core/storageKeys.ts";
import { getActiveStorageScope } from "../../../../app-core/workspace-scope.ts";
import { createDefaultBracketBattleConfig } from "../../../../app-core/shared/bracket-battle-config.ts";
import type { BracketBattleConfig, Lot, WheelConfig, WorkspaceScopeType } from "../../../../types/app.ts";
import { createNestedWindowContextBridge } from "../../shared/contextBridge.ts";
import { resolveBracketBattleMatchRoll, type BracketBattleMatch, type BracketBattleRoll, type BracketBattleSession } from "./bracketBattleDomain.ts";
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
  bracketDraft: BracketBattleDraft;
  bracketSession: BracketBattleSession | null;
  bracketLastRolls: BracketBattleRoll[];
  bracketRollPreview: BracketBattleRollPreview[];
  bracketResetDialog: boolean;
  bracketRolling: boolean;
  bracketRollIntervalId: BracketBattleIntervalHandle | null;
  bracketRollResolveTimeoutId: BracketBattleTimeoutHandle | null;
  canStartBracketBattle: boolean;
  activeBracketMatch: BracketBattleMatch | null;
  wheelDisplayConfig: WheelConfig | null;
  activeWheelConfigId: number | null;
  lots: Lot[];
  activeScopeType: WorkspaceScopeType;
  activeWorkspaceId: string | null;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
  loadBracketSession(): void;
  persistBracketSession(): void;
  clearBracketRollAnimation(): void;
  bracketParticipantLabel(participantId: string | null | undefined): string;
};

const BRACKET_ROLL_PREVIEW_INTERVAL_MS = 90;
const BRACKET_ROLL_RESOLVE_DELAY_MS = 1000;

function isBracketBattleSession(value: unknown): value is BracketBattleSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as BracketBattleSession;
  return (
    candidate.id != null
    && (candidate.participantCount === 4 || candidate.participantCount === 8)
    && Array.isArray(candidate.participants)
    && Array.isArray(candidate.matches)
    && Array.isArray(candidate.prizes)
    && Array.isArray(candidate.rolls)
    && Array.isArray(candidate.awards)
  );
}

function getSessionStorageKey(context: BracketBattlePanelThis): string {
  const baseKey = getScopedBracketBattleSessionStorageKey(getActiveStorageScope({
    activeScopeType: context.activeScopeType,
    activeWorkspaceId: context.activeWorkspaceId
  }));
  return `${baseKey}_${context.activeWheelConfigId ?? "none"}`;
}

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
  data() {
    return {
      bracketSession: null as BracketBattleSession | null,
      bracketLastRolls: [] as BracketBattleRoll[],
      bracketRollPreview: [] as BracketBattleRollPreview[],
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
      return this.bracketSession?.matches.find((match) => match.status === "active") ?? null;
    },
    bracketRoundGroups(this: BracketBattlePanelThis): Array<{ round: number; matches: BracketBattleMatch[] }> {
      const session = this.bracketSession;
      if (!session) return [];
      const rounds = new Map<number, BracketBattleMatch[]>();
      for (const match of session.matches) {
        const matches = rounds.get(match.round) ?? [];
        matches.push(match);
        rounds.set(match.round, matches);
      }
      return [...rounds.entries()].map(([round, matches]) => ({ round, matches }));
    },
    bracketChampionName(this: BracketBattlePanelThis): string {
      const championId = this.bracketSession?.championParticipantId ?? null;
      return this.bracketParticipantLabel(championId);
    }
  },
  methods: {
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
    },
    loadBracketSession(this: BracketBattlePanelThis): void {
      this.clearBracketRollAnimation();
      try {
        const raw = localStorage.getItem(getSessionStorageKey(this));
        if (!raw) return;
        const parsed = JSON.parse(raw) as unknown;
        if (isBracketBattleSession(parsed)) {
          this.bracketSession = parsed;
          this.bracketLastRolls = [];
        }
      } catch {
        this.bracketSession = null;
        this.bracketLastRolls = [];
      }
    },
    persistBracketSession(this: BracketBattlePanelThis): void {
      try {
        const storageKey = getSessionStorageKey(this);
        if (!this.bracketSession) {
          localStorage.removeItem(storageKey);
          return;
        }
        localStorage.setItem(storageKey, JSON.stringify(this.bracketSession));
      } catch {
        // Local play should continue even when browser storage is unavailable.
      }
    },
    startBracketBattle(this: BracketBattlePanelThis): void {
      if (!this.canStartBracketBattle) return;
      this.clearBracketRollAnimation();
      this.bracketSession = createBracketBattleSessionFromDraft(this.bracketDraft);
      this.bracketLastRolls = [];
      this.persistBracketSession();
    },
    rollActiveBracketMatch(this: BracketBattlePanelThis): void {
      const session = this.bracketSession;
      const match = this.activeBracketMatch;
      if (!session || !match || this.bracketRolling) return;

      this.clearBracketRollAnimation();
      this.bracketRolling = true;
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
          this.bracketLastRolls = result.rolls;
          this.persistBracketSession();
        } finally {
          this.bracketRollPreview = [];
          this.bracketRolling = false;
          this.bracketRollResolveTimeoutId = null;
        }
      }, BRACKET_ROLL_RESOLVE_DELAY_MS);
    },
    resetBracketBattle(this: BracketBattlePanelThis): void {
      this.clearBracketRollAnimation();
      this.bracketSession = null;
      this.bracketLastRolls = [];
      this.bracketResetDialog = false;
      this.persistBracketSession();
    },
    bracketParticipantLabel(this: BracketBattlePanelThis, participantId: string | null | undefined): string {
      const participant = findById(this.bracketSession?.participants ?? [], participantId);
      return participant?.buyerName || this.t("bracketBattleWaitingLabel");
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
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedGameCtx = inject<Record<string, unknown> | null>("gameCtx", null);
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedGameCtx ?? props.ctx ?? injectedCtx) as Record<string, unknown>;
    return createNestedWindowContextBridge(source);
  }
};
