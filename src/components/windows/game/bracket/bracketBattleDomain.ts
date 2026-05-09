export type BracketBattleParticipantCount = 4 | 8;
export type BracketBattleStatus = "setup" | "active" | "complete";
export type BracketBattleMatchStatus = "pending" | "active" | "complete";
export type BracketBattlePrizeSource = "manual" | "lot" | "singles";
export type BracketBattleSettlementStatus = "pending" | "settled" | "error";

export type BracketBattleParticipant = {
  id: string;
  buyerName: string;
  seed: number;
  status: "active" | "eliminated" | "champion";
};

export type BracketBattlePrize = {
  id: string;
  matchId: string;
  sourceType: BracketBattlePrizeSource;
  label: string;
  lotId?: number | null;
  singlesPurchaseEntryId?: number | null;
  quantity?: number | null;
  cost?: number | null;
  value?: number | null;
};

export type BracketBattlePrizeInput = {
  sourceType?: BracketBattlePrizeSource;
  label: string;
  lotId?: number | null;
  singlesPurchaseEntryId?: number | null;
  quantity?: number | null;
  cost?: number | null;
  value?: number | null;
};

export type BracketBattleMatch = {
  id: string;
  round: number;
  position: number;
  participantAId: string | null;
  participantBId: string | null;
  winnerParticipantId: string | null;
  prizeId: string;
  status: BracketBattleMatchStatus;
};

export type BracketBattleRoll = {
  id: string;
  matchId: string;
  participantId: string;
  value: number;
  rollNumber: number;
  tiebreakerIndex: number;
};

export type BracketBattleAward = {
  id: string;
  matchId: string;
  participantId: string;
  prizeId: string;
  awardedAt: number;
  settlementStatus: BracketBattleSettlementStatus;
};

export type BracketBattleSession = {
  id: string;
  name: string;
  participantCount: BracketBattleParticipantCount;
  rollMin: number;
  rollMax: number;
  status: BracketBattleStatus;
  participants: BracketBattleParticipant[];
  matches: BracketBattleMatch[];
  prizes: BracketBattlePrize[];
  rolls: BracketBattleRoll[];
  awards: BracketBattleAward[];
  championParticipantId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type CreateBracketBattleSessionInput = {
  participantCount: BracketBattleParticipantCount;
  participants: string[];
  prizeLabels?: string[];
  prizes?: BracketBattlePrizeInput[];
  name?: string;
  now?: () => number;
  randomInt?: (minInclusive: number, maxInclusive: number) => number;
};

export type ResolveBracketBattleMatchResult = {
  match: BracketBattleMatch;
  winnerParticipantId: string;
  rolls: BracketBattleRoll[];
  award: BracketBattleAward;
};

export const BRACKET_BATTLE_DIE_MIN = 1;
export const BRACKET_BATTLE_DIE_MAX = 6;
const DEFAULT_ROLL_MIN = BRACKET_BATTLE_DIE_MIN;
const DEFAULT_ROLL_MAX = BRACKET_BATTLE_DIE_MAX;
const MAX_TIEBREAKER_PAIRS = 100;

export function getBracketBattleMatchCount(participantCount: BracketBattleParticipantCount): number {
  return participantCount - 1;
}

function assertParticipantCount(value: number): asserts value is BracketBattleParticipantCount {
  if (value !== 4 && value !== 8) {
    throw new Error("Bracket Battle supports exactly 4 or 8 participants.");
  }
}

function createDefaultRandomInt(): (minInclusive: number, maxInclusive: number) => number {
  return (minInclusive, maxInclusive) => {
    const min = Math.ceil(minInclusive);
    const max = Math.floor(maxInclusive);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };
}

export function normalizeBracketBattleRollValue(value: unknown): number {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) {
    return BRACKET_BATTLE_DIE_MIN;
  }
  return Math.min(BRACKET_BATTLE_DIE_MAX, Math.max(BRACKET_BATTLE_DIE_MIN, numeric));
}

export function normalizeBracketBattleSessionDice(session: BracketBattleSession): BracketBattleSession {
  session.rollMin = BRACKET_BATTLE_DIE_MIN;
  session.rollMax = BRACKET_BATTLE_DIE_MAX;
  session.rolls = session.rolls.map((roll) => ({
    ...roll,
    value: normalizeBracketBattleRollValue(roll.value)
  }));
  return session;
}

function normalizeParticipantNames(participants: string[], participantCount: BracketBattleParticipantCount): string[] {
  const names = participants.map((entry) => String(entry || "").trim()).filter(Boolean);
  if (names.length !== participantCount) {
    throw new Error(`Bracket Battle requires exactly ${participantCount} participants.`);
  }
  return names;
}

function normalizePrizeLabels(prizeLabels: string[], matchCount: number): string[] {
  const labels = prizeLabels.map((entry) => String(entry || "").trim()).filter(Boolean);
  if (labels.length !== matchCount) {
    throw new Error(`Bracket Battle requires exactly ${matchCount} prizes.`);
  }
  return labels;
}

function normalizePrizeSource(value: unknown): BracketBattlePrizeSource {
  return value === "lot" || value === "singles" ? value : "manual";
}

function toOptionalPositiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.floor(numeric);
}

function toOptionalNonNegativeNumber(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

function normalizePrizeInputs(input: CreateBracketBattleSessionInput, matchCount: number): BracketBattlePrizeInput[] {
  if (Array.isArray(input.prizes)) {
    if (input.prizes.length !== matchCount) {
      throw new Error(`Bracket Battle requires exactly ${matchCount} prizes.`);
    }
    return input.prizes.map((prize) => {
      const label = String(prize?.label || "").trim();
      if (!label) {
        throw new Error("Bracket Battle prizes require labels.");
      }
      const sourceType = normalizePrizeSource(prize?.sourceType);
      return {
        sourceType,
        label,
        lotId: sourceType === "lot" || sourceType === "singles"
          ? toOptionalPositiveInteger(prize?.lotId)
          : null,
        singlesPurchaseEntryId: sourceType === "singles"
          ? toOptionalPositiveInteger(prize?.singlesPurchaseEntryId)
          : null,
        quantity: toOptionalPositiveInteger(prize?.quantity),
        cost: toOptionalNonNegativeNumber(prize?.cost),
        value: toOptionalNonNegativeNumber(prize?.value)
      };
    });
  }

  return normalizePrizeLabels(input.prizeLabels || [], matchCount).map((label) => ({
    sourceType: "manual",
    label,
    lotId: null,
    singlesPurchaseEntryId: null,
    quantity: null,
    cost: null,
    value: null
  }));
}

function shuffleIndexes(count: number, randomInt: (minInclusive: number, maxInclusive: number) => number): number[] {
  const indexes = Array.from({ length: count }, (_unused, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    const current = indexes[index]!;
    indexes[index] = indexes[swapIndex]!;
    indexes[swapIndex] = current;
  }
  return indexes;
}

function getRoundCount(participantCount: BracketBattleParticipantCount): number {
  return Math.log2(participantCount);
}

function getMatchId(round: number, position: number, participantCount: BracketBattleParticipantCount): string {
  let offset = 0;
  for (let currentRound = 1; currentRound < round; currentRound += 1) {
    offset += participantCount / 2 ** currentRound;
  }
  return `match-${offset + position}`;
}

function findMatch(session: BracketBattleSession, matchId: string): BracketBattleMatch {
  const match = session.matches.find((candidate) => candidate.id === matchId);
  if (!match) {
    throw new Error(`Bracket Battle match ${matchId} was not found.`);
  }
  return match;
}

function refreshMatchStatus(match: BracketBattleMatch): void {
  if (match.status === "complete") return;
  match.status = match.participantAId && match.participantBId ? "active" : "pending";
}

function getNextMatch(session: BracketBattleSession, match: BracketBattleMatch): BracketBattleMatch | null {
  const finalRound = getRoundCount(session.participantCount);
  if (match.round >= finalRound) return null;
  return findMatch(session, getMatchId(match.round + 1, Math.ceil(match.position / 2), session.participantCount));
}

export function createBracketBattleSession(input: CreateBracketBattleSessionInput): BracketBattleSession {
  assertParticipantCount(input.participantCount);
  const now = input.now ?? Date.now;
  const randomInt = input.randomInt ?? createDefaultRandomInt();
  const timestamp = now();
  const matchCount = getBracketBattleMatchCount(input.participantCount);
  const participantNames = normalizeParticipantNames(input.participants, input.participantCount);
  const prizeInputs = normalizePrizeInputs(input, matchCount);
  const shuffledIndexes = shuffleIndexes(input.participantCount, randomInt);
  const participants = shuffledIndexes.map((originalIndex, seedIndex) => ({
    id: `participant-${originalIndex + 1}`,
    buyerName: participantNames[originalIndex]!,
    seed: seedIndex + 1,
    status: "active" as const
  }));
  const participantBySeed = new Map(participants.map((participant) => [participant.seed, participant]));
  const rounds = getRoundCount(input.participantCount);
  const matches: BracketBattleMatch[] = [];
  const prizes: BracketBattlePrize[] = [];
  let prizeIndex = 0;

  for (let round = 1; round <= rounds; round += 1) {
    const matchesInRound = input.participantCount / 2 ** round;
    for (let position = 1; position <= matchesInRound; position += 1) {
      const id = getMatchId(round, position, input.participantCount);
      const participantA = round === 1 ? participantBySeed.get((position - 1) * 2 + 1)?.id ?? null : null;
      const participantB = round === 1 ? participantBySeed.get((position - 1) * 2 + 2)?.id ?? null : null;
      const prizeId = `prize-${prizeIndex + 1}`;
      const prizeInput = prizeInputs[prizeIndex]!;
      const match: BracketBattleMatch = {
        id,
        round,
        position,
        participantAId: participantA,
        participantBId: participantB,
        winnerParticipantId: null,
        prizeId,
        status: participantA && participantB ? "active" : "pending"
      };
      matches.push(match);
      prizes.push({
        id: prizeId,
        matchId: id,
        sourceType: prizeInput.sourceType ?? "manual",
        label: prizeInput.label,
        lotId: prizeInput.lotId ?? null,
        singlesPurchaseEntryId: prizeInput.singlesPurchaseEntryId ?? null,
        quantity: prizeInput.quantity ?? null,
        cost: prizeInput.cost ?? null,
        value: prizeInput.value ?? null
      });
      prizeIndex += 1;
    }
  }

  return {
    id: `bracket-${timestamp}`,
    name: String(input.name || "Bracket Battle").trim() || "Bracket Battle",
    participantCount: input.participantCount,
    rollMin: DEFAULT_ROLL_MIN,
    rollMax: DEFAULT_ROLL_MAX,
    status: "active",
    participants,
    matches,
    prizes,
    rolls: [],
    awards: [],
    championParticipantId: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function resolveBracketBattleMatchRoll(
  session: BracketBattleSession,
  matchId: string,
  randomInt: (minInclusive: number, maxInclusive: number) => number = createDefaultRandomInt(),
  now: () => number = Date.now
): ResolveBracketBattleMatchResult {
  if (session.status !== "active") {
    throw new Error("Bracket Battle must be active before resolving matches.");
  }
  const match = findMatch(session, matchId);
  if (match.status === "complete") {
    throw new Error("Bracket Battle match is already complete.");
  }
  if (!match.participantAId || !match.participantBId) {
    throw new Error("Bracket Battle match is missing a participant.");
  }

  const matchRolls: BracketBattleRoll[] = [];
  let winnerParticipantId: string | null = null;
  for (let tiebreakerIndex = 0; tiebreakerIndex <= MAX_TIEBREAKER_PAIRS; tiebreakerIndex += 1) {
    const rollA = normalizeBracketBattleRollValue(randomInt(BRACKET_BATTLE_DIE_MIN, BRACKET_BATTLE_DIE_MAX));
    const rollB = normalizeBracketBattleRollValue(randomInt(BRACKET_BATTLE_DIE_MIN, BRACKET_BATTLE_DIE_MAX));
    const rollNumber = tiebreakerIndex + 1;
    matchRolls.push({
      id: `roll-${session.rolls.length + matchRolls.length + 1}`,
      matchId: match.id,
      participantId: match.participantAId,
      value: rollA,
      rollNumber,
      tiebreakerIndex
    });
    matchRolls.push({
      id: `roll-${session.rolls.length + matchRolls.length + 1}`,
      matchId: match.id,
      participantId: match.participantBId,
      value: rollB,
      rollNumber,
      tiebreakerIndex
    });
    if (rollA > rollB) {
      winnerParticipantId = match.participantAId;
      break;
    }
    if (rollB > rollA) {
      winnerParticipantId = match.participantBId;
      break;
    }
  }

  if (!winnerParticipantId) {
    throw new Error("Bracket Battle tiebreaker limit reached.");
  }

  session.rolls.push(...matchRolls);
  match.winnerParticipantId = winnerParticipantId;
  match.status = "complete";

  const loserParticipantId = winnerParticipantId === match.participantAId ? match.participantBId : match.participantAId;
  const loser = session.participants.find((participant) => participant.id === loserParticipantId);
  if (loser) {
    loser.status = "eliminated";
  }

  const award: BracketBattleAward = {
    id: `award-${session.awards.length + 1}`,
    matchId: match.id,
    participantId: winnerParticipantId,
    prizeId: match.prizeId,
    awardedAt: now(),
    settlementStatus: "pending"
  };
  session.awards.push(award);

  const nextMatch = getNextMatch(session, match);
  if (nextMatch) {
    if (match.position % 2 === 1) {
      nextMatch.participantAId = winnerParticipantId;
    } else {
      nextMatch.participantBId = winnerParticipantId;
    }
    refreshMatchStatus(nextMatch);
  } else {
    const champion = session.participants.find((participant) => participant.id === winnerParticipantId);
    if (champion) {
      champion.status = "champion";
    }
    session.championParticipantId = winnerParticipantId;
    session.status = "complete";
  }
  session.updatedAt = now();

  return {
    match,
    winnerParticipantId,
    rolls: matchRolls,
    award
  };
}
