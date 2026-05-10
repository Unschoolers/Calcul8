import type { GameSpectatorSnapshot } from "../../../../types/app.ts";
import type {
  BracketBattleAward,
  BracketBattleMatch,
  BracketBattleRoll,
  BracketBattleSession
} from "./bracketBattleDomain.ts";

export type BracketBattleSpectatorSnapshot = NonNullable<GameSpectatorSnapshot["bracket"]>;

export function findBracketParticipantLabel(session: BracketBattleSession, participantId: string | null | undefined): string {
  if (!participantId) return "";
  return session.participants.find((entry) => entry.id === participantId)?.buyerName || "";
}

function findBracketPrizeLabel(session: BracketBattleSession, prizeId: string | null | undefined): string {
  if (!prizeId) return "";
  return session.prizes.find((entry) => entry.id === prizeId)?.label || "";
}

function findBracketMatchResult(session: BracketBattleSession, match: BracketBattleMatch, participantId: string | null): number | null {
  if (!participantId) return null;
  const roll = [...session.rolls]
    .reverse()
    .find((entry) => entry.matchId === match.id && entry.participantId === participantId);
  return roll?.value ?? null;
}

function buildBracketSpectatorMatch(session: BracketBattleSession, match: BracketBattleMatch) {
  return {
    id: match.id,
    round: match.round,
    position: match.position,
    status: match.status,
    participantAId: match.participantAId,
    participantALabel: findBracketParticipantLabel(session, match.participantAId),
    participantBId: match.participantBId,
    participantBLabel: findBracketParticipantLabel(session, match.participantBId),
    winnerParticipantId: match.winnerParticipantId,
    prizeLabel: findBracketPrizeLabel(session, match.prizeId),
    participantAResult: findBracketMatchResult(session, match, match.participantAId),
    participantBResult: findBracketMatchResult(session, match, match.participantBId)
  };
}

function buildBracketSpectatorRoll(session: BracketBattleSession, roll: BracketBattleRoll) {
  return {
    id: roll.id,
    matchId: roll.matchId,
    participantId: roll.participantId,
    participantLabel: findBracketParticipantLabel(session, roll.participantId),
    value: roll.value,
    rollNumber: roll.rollNumber,
    tiebreakerIndex: roll.tiebreakerIndex
  };
}

function buildBracketSpectatorAward(session: BracketBattleSession, award: BracketBattleAward) {
  return {
    id: award.id,
    matchId: award.matchId,
    participantId: award.participantId,
    participantLabel: findBracketParticipantLabel(session, award.participantId),
    prizeLabel: findBracketPrizeLabel(session, award.prizeId),
    settlementStatus: award.settlementStatus
  };
}

export function buildBracketBattleSpectatorSnapshot(
  session: BracketBattleSession,
  options: {
    rolling?: boolean;
    showcaseMatchId?: string | null;
    lastRolls?: BracketBattleRoll[];
  } = {}
): BracketBattleSpectatorSnapshot {
  const sessionActiveMatch = session.status === "complete"
    ? null
    : session.matches.find((match) => match.status === "active") ?? null;
  const showcaseMatchId = String(options.showcaseMatchId ?? "").trim();
  const showcasedMatch = showcaseMatchId
    ? session.matches.find((match) => match.id === showcaseMatchId) ?? null
    : null;
  const activeMatch = options.rolling === true
    ? sessionActiveMatch
    : (showcasedMatch ?? sessionActiveMatch);
  const recentRolls = Array.isArray(options.lastRolls) && options.lastRolls.length
    ? options.lastRolls
    : session.rolls.slice(-12);

  return {
    status: session.status,
    participantCount: session.participantCount,
    activeMatchId: activeMatch?.id ?? null,
    championParticipantId: session.championParticipantId,
    activeMatch: activeMatch ? buildBracketSpectatorMatch(session, activeMatch) : null,
    matches: session.matches.map((match) => buildBracketSpectatorMatch(session, match)),
    recentRolls: recentRolls.slice(-12).map((roll) => buildBracketSpectatorRoll(session, roll)),
    awards: session.awards.slice(-15).map((award) => buildBracketSpectatorAward(session, award))
  };
}
