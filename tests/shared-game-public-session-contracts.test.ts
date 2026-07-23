import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import ts from "typescript";
import type {
  GamePublicSessionSnapshot as CanonicalGamePublicSessionSnapshot
} from "../shared/game-public-session-contracts";
import type {
  GamePublicSessionSnapshot as EsmGamePublicSessionSnapshot
} from "../shared/game-public-session-contracts.mjs";
import type {
  GamePublicSessionSnapshot as CommonJsGamePublicSessionSnapshot
} from "../shared/game-public-session-contracts.cjs";
import type {
  GamePublicSessionSnapshot as ApiGamePublicSessionSnapshot
} from "../apps/api/src/shared/game-public-session-contracts";
import type {
  GamePublicSessionSnapshot as ApiCommonJsGamePublicSessionSnapshot
} from "../apps/api/src/shared/game-public-session-contracts.cjs";
import {
  CURRENT_GAME_PUBLIC_SESSION_SNAPSHOT_VERSION,
  normalizeGamePublicSessionSnapshot
} from "../shared/game-public-session-contracts.mjs";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Expect<Value extends true> = Value;
type GamePublicSessionContractParity = [
  Expect<Equal<CanonicalGamePublicSessionSnapshot, EsmGamePublicSessionSnapshot>>,
  Expect<Equal<CanonicalGamePublicSessionSnapshot, CommonJsGamePublicSessionSnapshot>>,
  Expect<Equal<CanonicalGamePublicSessionSnapshot, ApiGamePublicSessionSnapshot>>,
  Expect<Equal<CanonicalGamePublicSessionSnapshot, ApiCommonJsGamePublicSessionSnapshot>>
];

void (0 as unknown as GamePublicSessionContractParity);

test("game and sync declarations resolve for isolated NodeNext module consumers", () => {
  const configPath = fileURLToPath(
    new URL("./fixtures/shared-contracts-nodenext/tsconfig.json", import.meta.url)
  );
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(configFile.error, undefined);

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath
  );
  assert.deepEqual(parsedConfig.errors, []);

  for (const consumerPath of parsedConfig.fileNames) {
    const source = ts.sys.readFile(consumerPath);
    assert.ok(source, `Missing NodeNext fixture: ${consumerPath}`);

    const declarationSuffix = consumerPath.endsWith(".mts") ? ".d.mts" : ".d.cts";
    for (const importedFile of ts.preProcessFile(source).importedFiles) {
      const resolved = ts.resolveModuleName(
        importedFile.fileName,
        consumerPath,
        parsedConfig.options,
        ts.sys
      ).resolvedModule;

      assert.ok(resolved, `${importedFile.fileName} must resolve from ${consumerPath}`);
      assert.ok(
        resolved.resolvedFileName.endsWith(declarationSuffix),
        `${importedFile.fileName} resolved to ${resolved.resolvedFileName}`
      );
    }
  }
});

test("game public session declarations use one canonical contract body", async () => {
  const declarationUrls = [
    new URL("../shared/game-public-session-contracts.d.mts", import.meta.url),
    new URL("../shared/game-public-session-contracts.d.cts", import.meta.url),
    new URL("../apps/api/src/shared/game-public-session-contracts.d.ts", import.meta.url),
    new URL("../apps/api/src/shared/game-public-session-contracts.d.cts", import.meta.url)
  ];

  for (const declarationUrl of declarationUrls) {
    const lines = (await readFile(declarationUrl, "utf8"))
      .split(/\r?\n/u)
      .filter((line) => line.trim().length > 0);

    assert.equal(lines.length, 1, `${declarationUrl.pathname} must be a thin re-export`);
    assert.match(lines[0] ?? "", /^export \* from /u);
  }
});

test("game public session contracts upgrade legacy wheel snapshots into v2 game fields", () => {
  const snapshot = normalizeGamePublicSessionSnapshot({
    wheelName: " Legacy Wheel ",
    sessionStatus: "live",
    totalSpins: "4",
    lastResultLabel: "Prize",
    lastResultColor: "#f00",
    wheelCurrentAngle: "2.5",
    wheelSlots: [{
      name: " Prize ",
      color: "#f00",
      tier: "tier-1",
      isChase: false
    }],
    spinAnimation: {
      spinId: "spin-1",
      startedAt: "2000",
      durationMs: "45000",
      startAngle: "0.25",
      endAngle: "18.5",
      targetIndex: "0"
    },
    updatedAt: 456
  });

  assert.deepEqual(snapshot, {
    snapshotVersion: CURRENT_GAME_PUBLIC_SESSION_SNAPSHOT_VERSION,
    gameName: "Legacy Wheel",
    gameType: "wheel",
    sessionStatus: "live",
    isSpinning: false,
    sessionResultCount: 4,
    lastResultLabel: "Prize",
    lastResultColor: "#f00",
    gameCurrentAngle: 2.5,
    outcomeSlots: [{
      name: "Prize",
      color: "#f00",
      tier: "tier-1",
      isChase: false
    }],
    boardCells: [],
    boardHighlightCellIndex: -1,
    boardResetAnimating: false,
    resultAnimation: {
      spinId: "spin-1",
      startedAt: 2000,
      durationMs: 30_000,
      startAngle: 0.25,
      endAngle: 18.5,
      targetIndex: 0
    },
    recentFairnessHistory: [],
    chaseHistory: [],
    chaseBoard: [],
    featuredChaseLabel: null,
    featuredChaseHeat: null,
    fairnessVerificationUrl: null,
    bracket: null,
    updatedAt: 456
  });
});

test("game public session contracts normalize v2 snapshots without wheel-prefixed fields", () => {
  const snapshot = normalizeGamePublicSessionSnapshot({
    snapshotVersion: 2,
    gameName: "Grid",
    gameType: "grid",
    sessionStatus: "live",
    sessionResultCount: "3",
    gameCurrentAngle: "1.25",
    outcomeSlots: [{ name: "Chase", color: "#0f0", tier: "tier-1", isChase: true }],
    boardCells: [
      { index: "0", revealed: true, label: "Chase", color: "#0f0", tier: "tier-1", slotIndex: "7" },
      { index: "1", revealed: false, label: "hidden", color: "#f00", tier: "tier-2", slotIndex: "8" }
    ],
    boardHighlightCellIndex: "0",
    boardResetAnimating: true,
    updatedAt: "1234"
  });

  assert.equal(snapshot?.gameName, "Grid");
  assert.equal(snapshot?.gameType, "grid");
  assert.equal(snapshot?.sessionResultCount, 3);
  assert.equal(snapshot?.gameCurrentAngle, 1.25);
  assert.equal(snapshot?.boardResetAnimating, true);
  assert.equal(snapshot?.boardHighlightCellIndex, 0);
  assert.deepEqual(snapshot?.boardCells, [
    { index: 0, revealed: true, label: "Chase", color: "#0f0", tier: "tier-1", slotIndex: 7 },
    { index: 1, revealed: false, label: "", color: "", tier: "", slotIndex: 8 }
  ]);
  assert.equal(Object.hasOwn(snapshot as object, "wheelName"), false);
  assert.equal(Object.hasOwn(snapshot as object, "totalSpins"), false);
  assert.equal(Object.hasOwn(snapshot as object, "wheelCurrentAngle"), false);
  assert.equal(Object.hasOwn(snapshot as object, "wheelSlots"), false);
  assert.equal(Object.hasOwn(snapshot as object, "gridCells"), false);
  assert.equal(Object.hasOwn(snapshot as object, "spinAnimation"), false);
});

test("game public session contracts infer grid games from legacy board cells", () => {
  const snapshot = normalizeGamePublicSessionSnapshot({
    gameType: "banana",
    gridCells: [{ index: -1 }, { index: "2", revealed: true }],
    featuredChaseHeat: "burning",
    updatedAt: "bad"
  }, 999);

  assert.equal(snapshot?.gameType, "grid");
  assert.equal(snapshot?.featuredChaseHeat, null);
  assert.equal(snapshot?.updatedAt, 999);
  assert.deepEqual(snapshot?.boardCells, [
    { index: 2, revealed: true, label: "", color: "#d4af37", tier: "", slotIndex: -1 }
  ]);
});

test("game public session contracts preserve bracket snapshots with bounded public fields", () => {
  const snapshot = normalizeGamePublicSessionSnapshot({
    snapshotVersion: 2,
    gameName: "Saturday Bracket",
    gameType: "bracket",
    sessionStatus: "live",
    isSpinning: true,
    sessionResultCount: "2",
    lastResultLabel: "Alex beat Bri",
    bracket: {
      status: "active",
      participantCount: "8",
      activeMatchId: "match-2",
      championParticipantId: "participant-1",
      activeMatch: {
        id: "match-2",
        round: "1",
        position: "2",
        status: "active",
        participantAId: "participant-3",
        participantALabel: "Cam",
        participantBId: "participant-4",
        participantBLabel: "Dev",
        winnerParticipantId: "",
        prizeLabel: "Round prize",
        participantAResult: "6",
        participantBResult: "4"
      },
      matches: [{
        id: "match-1",
        round: "1",
        position: "1",
        status: "complete",
        participantAId: "participant-1",
        participantALabel: "Alex",
        participantBId: "participant-2",
        participantBLabel: "Bri",
        winnerParticipantId: "participant-1",
        prizeLabel: "First prize",
        participantAResult: "5",
        participantBResult: "2"
      }],
      recentRolls: [{
        id: "roll-1",
        matchId: "match-1",
        participantId: "participant-1",
        participantLabel: "Alex",
        value: "5",
        rollNumber: "1",
        tiebreakerIndex: "0"
      }],
      awards: [{
        id: "award-1",
        matchId: "match-1",
        participantId: "participant-1",
        participantLabel: "Alex",
        prizeLabel: "First prize",
        settlementStatus: "settled"
      }]
    },
    updatedAt: 2000
  });

  assert.equal(snapshot?.gameType, "bracket");
  assert.equal(snapshot?.bracket?.status, "active");
  assert.equal(snapshot?.bracket?.participantCount, 8);
  assert.equal(snapshot?.bracket?.activeMatch?.participantAResult, 6);
  assert.equal(snapshot?.bracket?.activeMatch?.participantBResult, 4);
  assert.deepEqual(snapshot?.bracket?.matches.map((match) => ({
    id: match.id,
    status: match.status,
    winnerParticipantId: match.winnerParticipantId
  })), [{
    id: "match-1",
    status: "complete",
    winnerParticipantId: "participant-1"
  }]);
  assert.deepEqual(snapshot?.bracket?.recentRolls.map((roll) => ({
    participantLabel: roll.participantLabel,
    value: roll.value
  })), [{
    participantLabel: "Alex",
    value: 5
  }]);
});
