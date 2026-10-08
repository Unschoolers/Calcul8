import assert from "node:assert/strict";
import { test } from "vitest";
import { normalizeSyncGameSessionDto } from "../shared/sync-contracts.cjs";

test("API game session serialization retains the pending sale and retry mutation identity", () => {
  const session = normalizeSyncGameSessionDto({ wheelPendingInventoryIssues: [{
    slotTier: "tier-1", selectedLotId: "7", pendingSaleLotId: "7",
    pendingSale: { id: "777", type: "wheel", quantity: "1", price: "12", mutationId: " sale-777 ", unknown: "drop" }
  }] }, 999);
  const restored = normalizeSyncGameSessionDto(JSON.parse(JSON.stringify(session)), 999);
  assert.deepEqual(restored.wheelPendingInventoryIssues[0]?.pendingSale,
    { id: 777, type: "wheel", quantity: 1, price: 12, mutationId: "sale-777" });
  assert.equal(restored.wheelPendingInventoryIssues[0]?.pendingSaleLotId, 7);
});
