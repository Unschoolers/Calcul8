import assert from "node:assert/strict";
import test from "node:test";
import { calculateSyncPresetDiff, type SyncPresetState } from "./syncDiff";

function state(
  presetId: string,
  preset: unknown,
  sales: unknown[] = []
): SyncPresetState {
  return { presetId, preset, sales };
}

test("calculateSyncPresetDiff returns empty changes when states are identical", () => {
  const existing = [
    state("1", { id: 1, name: "A", packPrice: 7 }, [{ id: 10, price: 7 }]),
    state("2", { id: 2, name: "B", packPrice: 8 }, [])
  ];
  const incoming = [
    state("1", { id: 1, name: "A", packPrice: 7 }, [{ id: 10, price: 7 }]),
    state("2", { id: 2, name: "B", packPrice: 8 }, [])
  ];

  const diff = calculateSyncPresetDiff(existing, incoming);
  assert.deepEqual(diff.upsertPresetIds, []);
  assert.deepEqual(diff.deletePresetIds, []);
});

test("calculateSyncPresetDiff upserts only changed or new presets", () => {
  const existing = [
    state("1", { id: 1, name: "A", packPrice: 7 }, [{ id: 10, price: 7 }]),
    state("2", { id: 2, name: "B", packPrice: 8 }, [])
  ];
  const incoming = [
    state("1", { id: 1, name: "A", packPrice: 9 }, [{ id: 10, price: 7 }]),
    state("2", { id: 2, name: "B", packPrice: 8 }, []),
    state("3", { id: 3, name: "C", packPrice: 6 }, [])
  ];

  const diff = calculateSyncPresetDiff(existing, incoming);
  assert.deepEqual(diff.upsertPresetIds.sort(), ["1", "3"]);
  assert.deepEqual(diff.deletePresetIds, []);
});

test("calculateSyncPresetDiff deletes missing presets", () => {
  const existing = [
    state("1", { id: 1, name: "A" }),
    state("2", { id: 2, name: "B" })
  ];
  const incoming = [state("1", { id: 1, name: "A" })];

  const diff = calculateSyncPresetDiff(existing, incoming);
  assert.deepEqual(diff.upsertPresetIds, []);
  assert.deepEqual(diff.deletePresetIds, ["2"]);
});
