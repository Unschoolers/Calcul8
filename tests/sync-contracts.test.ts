import assert from "node:assert/strict";
import { test } from "vitest";
import { parseCloudSnapshot } from "../src/app-core/methods/ui/sync-apply.ts";
import { createSyncPayload } from "../src/app-core/methods/ui/sync-payload.ts";
import {
  parseSyncSnapshotDto,
  toSyncLotDtos,
  toSyncSalesByLotDto,
  toSyncWheelConfigDtos
} from "../src/app-core/methods/ui/sync-contracts.ts";

test("sync contract helpers keep only entity records with usable ids", () => {
  assert.deepEqual(toSyncLotDtos([
    { id: "12", name: "Cloud lot" },
    { id: "not-a-number", name: "Broken lot" },
    null,
    "bad"
  ]), [{ id: 12, name: "Cloud lot" }]);

  assert.deepEqual(toSyncSalesByLotDto({
    "12": [{ id: 1, price: 10 }, null, "bad"],
    "13": "bad"
  }), {
    "12": [{ id: 1, price: 10 }]
  });

  assert.deepEqual(toSyncWheelConfigDtos([
    { id: 91, name: "Wheel" },
    null,
    "bad"
  ]), [{ id: 91, name: "Wheel" }]);
});

test("parseSyncSnapshotDto requires shaped sales and wheel collections", () => {
  const valid = parseSyncSnapshotDto({
    lots: [{ id: 1 }],
    salesByLot: { "1": [{ id: 11 }] },
    wheelConfigs: [],
    activeWheelConfigId: "91",
    version: "3"
  });
  assert.equal(valid.hasRequiredCollections, true);
  assert.equal(valid.snapshot.activeWheelConfigId, 91);
  assert.equal(valid.snapshot.version, 3);

  const invalidSales = parseSyncSnapshotDto({
    lots: [{ id: 1 }],
    salesByLot: { "1": "bad" },
    wheelConfigs: [],
    version: 4
  });
  assert.equal(invalidSales.hasRequiredCollections, false);

  const invalidWheels = parseSyncSnapshotDto({
    lots: [{ id: 1 }],
    salesByLot: {},
    wheelConfigs: [null],
    version: 4
  });
  assert.equal(invalidWheels.hasRequiredCollections, false);
});

test("parseCloudSnapshot does not report malformed entity snapshots as syncable data", () => {
  assert.deepEqual(parseCloudSnapshot({
    lots: [{ name: "No id" }],
    salesByLot: {},
    wheelConfigs: [],
    version: 8
  }), {
    lots: [],
    salesByLot: {},
    wheelConfigs: [],
    activeWheelConfigId: null,
    version: 8,
    hasData: false
  });

  assert.equal(parseCloudSnapshot({
    lots: [{ id: 1 }],
    salesByLot: { "1": "bad" },
    wheelConfigs: [],
    version: 9
  }).hasData, false);
});

test("createSyncPayload emits the same entity contract sent to the API", () => {
  const payload = createSyncPayload({
    lots: [{ id: 2, name: "Local lot" }, null],
    currentLotId: "2",
    sales: [],
    loadSalesForLotId: () => [],
    wheelConfigs: [{ id: 91, name: "Wheel" }, null],
    activeWheelConfigId: "91",
    workspaceId: " team-42 "
  } as never, 5);

  assert.deepEqual(payload, {
    lots: [{ id: 2, name: "Local lot" }],
    salesByLot: {},
    wheelConfigs: [{ id: 91, name: "Wheel" }],
    activeWheelConfigId: 91,
    clientVersion: 5,
    activeLotId: 2,
    workspaceId: "team-42"
  });
});
