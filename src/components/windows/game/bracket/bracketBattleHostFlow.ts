import { getScopedBracketBattleSessionStorageKey } from "../../../../app-core/storageKeys.ts";
import { getActiveStorageScope } from "../../../../app-core/workspace-scope.ts";
import type { WorkspaceScopeType } from "../../../../types/app.ts";
import {
  readGameSession,
  removeGameSession,
  writeGameSession,
  type GameSessionCodec,
  type GameSessionStorage
} from "../services/gameSessionStore.ts";
import {
  normalizeBracketBattleSessionDice,
  type BracketBattleMatch,
  type BracketBattleRoll,
  type BracketBattleSession
} from "./bracketBattleDomain.ts";

export type BracketBattleHostFlowContext = {
  activeScopeType: WorkspaceScopeType;
  activeWorkspaceId: string | null;
  activeWheelConfigId: number | null;
  wheelMode: "config" | "live";
};

export type BracketBattleSessionStatePayload = {
  session: BracketBattleSession | null;
  lastRolls: BracketBattleRoll[];
  rolling: boolean;
  showcaseMatchId: string | null;
  publishLive: boolean;
};

export type BracketBattleLoadedSessionState = {
  storageKey: string;
  session: BracketBattleSession | null;
  lastRolls: BracketBattleRoll[];
  showcaseMatchId: string | null;
  shouldClearDice: boolean;
};

export type BracketBattleStorage = GameSessionStorage;

export type BracketBattleHostStateTarget = {
  bracketBattleSession: BracketBattleSession | null;
  bracketBattleLastRolls: BracketBattleRoll[];
  bracketBattleRolling: boolean;
  bracketBattleShowcaseMatchId: string | null;
  publishGameSpectatorSessionSnapshot?: (statusOverride?: "starting" | "live" | "ended") => Promise<void>;
};

export function isBracketBattleSession(value: unknown): value is BracketBattleSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BracketBattleSession>;
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

const bracketBattleSessionCodec: GameSessionCodec<BracketBattleSession> = {
  decode: (value) => isBracketBattleSession(value) ? value : null,
  encode: (value) => value
};

export function getBracketBattleSessionStorageKey(context: BracketBattleHostFlowContext): string {
  const modeSuffix = context.wheelMode === "live" ? "live" : "preview";
  const baseKey = getScopedBracketBattleSessionStorageKey(getActiveStorageScope({
    activeScopeType: context.activeScopeType,
    activeWorkspaceId: context.activeWorkspaceId
  }));
  return `${baseKey}_${context.activeWheelConfigId ?? "none"}_${modeSuffix}`;
}

export function resolveBracketBattleQueuedMatch(session: BracketBattleSession | null | undefined): BracketBattleMatch | null {
  if (!session || session.status === "complete") return null;
  return session.matches.find((match) => match.status === "active") ?? null;
}

export function resolveBracketBattleActiveMatch(
  session: BracketBattleSession | null | undefined,
  showcaseMatchId: string | null | undefined
): BracketBattleMatch | null {
  if (!session || session.status === "complete") return null;
  if (showcaseMatchId) {
    return session.matches.find((match) => match.id === showcaseMatchId) ?? null;
  }
  return resolveBracketBattleQueuedMatch(session);
}

export function resolveBracketBattleShowcaseMatchId(session: BracketBattleSession | null | undefined): string | null {
  if (!session || session.status === "complete") return null;
  const latestAward = session.awards.length
    ? session.awards[session.awards.length - 1] ?? null
    : null;
  return latestAward?.matchId ?? resolveBracketBattleQueuedMatch(session)?.id ?? null;
}

export function groupBracketBattleRounds(session: BracketBattleSession | null | undefined): Array<{ round: number; matches: BracketBattleMatch[] }> {
  if (!session) return [];
  const rounds = new Map<number, BracketBattleMatch[]>();
  for (const match of session.matches) {
    const matches = rounds.get(match.round) ?? [];
    matches.push(match);
    rounds.set(match.round, matches);
  }
  return [...rounds.entries()].map(([round, matches]) => ({ round, matches }));
}

export function loadBracketBattleSessionState(
  storage: BracketBattleStorage,
  context: BracketBattleHostFlowContext
): BracketBattleLoadedSessionState {
  const storageKey = getBracketBattleSessionStorageKey(context);
  const storedSession = readGameSession(storage, storageKey, bracketBattleSessionCodec);
  if (!storedSession) {
    return {
      storageKey,
      session: null,
      lastRolls: [],
      showcaseMatchId: null,
      shouldClearDice: true
    };
  }
  const session = normalizeBracketBattleSessionDice(storedSession);
  return {
    storageKey,
    session,
    lastRolls: [],
    showcaseMatchId: resolveBracketBattleShowcaseMatchId(session),
    shouldClearDice: !session.rolls.length
  };
}

export function persistBracketBattleSessionState(
  storage: Pick<BracketBattleStorage, "setItem" | "removeItem">,
  storageKey: string,
  session: BracketBattleSession | null
): void {
  if (!session) {
    removeGameSession(storage, storageKey);
    return;
  }
  writeGameSession(storage, storageKey, session, bracketBattleSessionCodec);
}

export function buildBracketBattleSessionStatePayload(input: {
  session: BracketBattleSession | null;
  lastRolls: BracketBattleRoll[];
  rolling: boolean;
  showcaseMatchId: string | null;
  publishLive?: boolean;
}): BracketBattleSessionStatePayload {
  return {
    session: input.session,
    lastRolls: input.lastRolls,
    rolling: input.rolling,
    showcaseMatchId: input.showcaseMatchId,
    publishLive: input.publishLive === true
  };
}

export async function applyBracketBattleHostState(
  target: BracketBattleHostStateTarget,
  payload: BracketBattleSessionStatePayload
): Promise<void> {
  target.bracketBattleSession = payload.session;
  target.bracketBattleLastRolls = payload.lastRolls;
  target.bracketBattleRolling = payload.rolling;
  target.bracketBattleShowcaseMatchId = payload.showcaseMatchId;
  if (payload.publishLive) {
    await (target.publishGameSpectatorSessionSnapshot?.() ?? Promise.resolve());
  }
}
