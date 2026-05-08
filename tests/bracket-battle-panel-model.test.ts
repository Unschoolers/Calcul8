import assert from "node:assert/strict";
import { test } from "vitest";
import type { Lot } from "../src/types/app.ts";
import {
  applyBracketBattlePrizeCatalogSelection,
  buildBracketBattlePrizeCatalog,
  createBracketBattleDraft,
  createBracketBattleSessionFromDraft,
  getBracketBattleDraftValidation,
  resizeBracketBattleDraft
} from "../src/components/windows/game/bracket/bracketBattlePanelModel.ts";

test("createBracketBattleDraft sizes participants and pre-assigned prizes for the bracket", () => {
  const draft = createBracketBattleDraft(4);

  assert.equal(draft.participants.length, 4);
  assert.equal(draft.prizes.length, 3);
  assert.deepEqual(draft.prizes.map((prize) => prize.sourceType), ["manual", "manual", "manual"]);
});

test("resizeBracketBattleDraft preserves existing setup while expanding the bracket", () => {
  const draft = createBracketBattleDraft(4);
  draft.participants[0] = "Alex";
  draft.prizes[0]!.label = "Opening pack";

  const resized = resizeBracketBattleDraft(draft, 8);

  assert.equal(resized.participants.length, 8);
  assert.equal(resized.prizes.length, 7);
  assert.equal(resized.participants[0], "Alex");
  assert.equal(resized.prizes[0]?.label, "Opening pack");
  assert.equal(resized.prizes[6]?.label, "Match 7 prize");
});

test("buildBracketBattlePrizeCatalog exposes bulk lots and individual singles as prize sources", () => {
  const lots = [
    { id: 10, name: "Bulk Box", lotType: "bulk", boxPriceCost: 120, packPrice: 12 },
    {
      id: 20,
      name: "Singles Tray",
      lotType: "singles",
      singlesPurchases: [
        { id: 1, item: "Charizard", cardNumber: "4/102", quantity: 1, cost: 25, marketValue: 80 },
        { id: 2, item: "Blastoise", quantity: 2, cost: 15, marketValue: 45 }
      ]
    }
  ] as Lot[];

  const catalog = buildBracketBattlePrizeCatalog(lots);

  assert.deepEqual(catalog.map((entry) => ({
    value: entry.value,
    title: entry.title,
    sourceType: entry.sourceType,
    lotId: entry.lotId,
    singlesPurchaseEntryId: entry.singlesPurchaseEntryId
  })), [
    { value: "lot:10", title: "Bulk Box", sourceType: "lot", lotId: 10, singlesPurchaseEntryId: null },
    { value: "singles:20:1", title: "Charizard #4/102", sourceType: "singles", lotId: 20, singlesPurchaseEntryId: 1 },
    { value: "singles:20:2", title: "Blastoise", sourceType: "singles", lotId: 20, singlesPurchaseEntryId: 2 }
  ]);
});

test("applyBracketBattlePrizeCatalogSelection copies lot and singles metadata into the prize draft", () => {
  const draft = createBracketBattleDraft(4);
  const catalog = buildBracketBattlePrizeCatalog([
    {
      id: 20,
      name: "Singles Tray",
      lotType: "singles",
      singlesPurchases: [
        { id: 1, item: "Charizard", cardNumber: "4/102", quantity: 1, cost: 25, marketValue: 80 }
      ]
    }
  ] as Lot[]);

  applyBracketBattlePrizeCatalogSelection(draft.prizes[0]!, "singles:20:1", catalog);

  assert.deepEqual(draft.prizes[0], {
    id: "draft-prize-1",
    sourceType: "singles",
    sourceKey: "singles:20:1",
    label: "Charizard #4/102",
    lotId: 20,
    singlesPurchaseEntryId: 1,
    quantity: 1,
    cost: 25,
    value: 80
  });
});

test("createBracketBattleSessionFromDraft validates complete buyers and prizes", () => {
  const draft = createBracketBattleDraft(4);
  draft.participants = ["Alex", "Bri", "Cam", "Dev"];
  draft.prizes[0]!.label = "Pack 1";
  draft.prizes[1]!.label = "Pack 2";
  draft.prizes[2]!.label = "Final";

  assert.equal(getBracketBattleDraftValidation(draft).valid, true);

  const session = createBracketBattleSessionFromDraft(draft, {
    now: () => 123,
    randomInt: (_min, max) => max
  });

  assert.equal(session.id, "bracket-123");
  assert.equal(session.matches.length, 3);
  assert.deepEqual(session.prizes.map((prize) => prize.label), ["Pack 1", "Pack 2", "Final"]);
});
