import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "vitest";
import * as boxes from "../shared/box-inventory.mjs";
import * as games from "../shared/game-public-session-contracts.mjs";
import * as scopes from "../shared/scope-keys.mjs";
import * as sync from "../shared/sync-contracts.mjs";
import * as whatnot from "../shared/whatnot-import-contracts.mjs";
import * as rooms from "../shared/workspace-realtime-rooms.mjs";
import * as apiScopes from "../apps/api/src/lib/scopeKeys";
import * as realtimeRooms from "../apps/realtime/src/workspace-realtime-rooms";

type Case = { method: string; args: unknown[]; expected: unknown };
const contracts: { name: string; browser: Record<string, unknown>; api?: boolean; service?: Record<string, unknown>; cases: Case[] }[] = [
  { name: "box-inventory", browser: boxes, api: true, cases: [
    { method: "calculateSaleConsumption", args: [{ packsPerBox: 10, lotType: "bulk" }, { type: "box", quantity: 1, packsCount: 0 }],
      expected: { units: 10, sealedBoxes: 1, openedPacks: 0, valid: true } },
    { method: "calculateSealedBoxInventory", args: [{ boxesPurchased: 3, packsPerBox: 10 }, [{ type: "pack", quantity: 2, packsCount: 2 }]],
      expected: { sealedBoxes: 2, openedBoxes: 1, loosePacks: 8, valid: true } },
    { method: "calculateSealedBoxInventory", args: [{ boxesPurchased: -1, packsPerBox: 10 }, []],
      expected: { sealedBoxes: 0, openedBoxes: 0, loosePacks: 0, valid: false, error: "invalid_lot" } }
  ] },
  { name: "game-public-session-contracts", browser: games, api: true, cases: [
    { method: "normalizeGamePublicSessionSnapshot", args: [null, 999], expected: null }
  ] },
  { name: "scope-keys", browser: scopes, api: true, service: apiScopes, cases: [
    { method: "buildEntitlementScopeKey", args: ["workspace", " team-42 "], expected: "ws:team-42" },
    { method: "buildSyncScopePartitionKey", args: ["user", " alice "], expected: "u:alice" },
    { method: "buildEntitlementDocumentId", args: ["user", ""], expected: null }
  ] },
  { name: "sync-contracts", browser: sync, api: true, cases: [
    { method: "normalizeSyncSaleDto", args: [{ id: "77", type: "wheel", mutationId: " retry-77 ", unknown: true }],
      expected: { id: 77, type: "wheel", mutationId: "retry-77" } },
    { method: "normalizeSyncSaleDto", args: [{ id: "bad" }], expected: null }
  ] },
  { name: "whatnot-import-contracts", browser: whatnot, api: true, cases: [
    { method: "normalizeWhatnotImportCandidate", args: [{ externalOrderId: " order-1 ", externalOrderItemId: "item-1", title: " Cards ", date: "2026-09-14", price: "4.5", quantity: "2" }],
      expected: { externalOrderId: "order-1", externalOrderItemId: "item-1", externalSaleId: "order-1:item-1", title: "Cards", quantity: 2, price: 4.5, buyerShipping: 0, date: "2026-09-14", orderStatus: "COMPLETED" } },
    { method: "normalizeWhatnotImportDecision", args: [null], expected: null }
  ] },
  { name: "workspace-realtime-rooms", browser: rooms, service: realtimeRooms, cases: [
    { method: "buildWorkspaceLotRealtimeRoom", args: ["team-42", 7], expected: "workspace:team-42:lot:7" },
    { method: "buildGamePublicSessionRealtimeRoom", args: [" ABC123 "], expected: "wheel-public:abc123" },
    { method: "parseWorkspacePresenceRealtimeRoom", args: ["workspace:team-42:presence"], expected: "team-42" },
    { method: "parseWorkspacePresenceRealtimeRoom", args: ["workspace:team-42:lot:7"], expected: null }
  ] }
];

for (const contract of contracts) {
  test(`${contract.name} browser, root CommonJS and available service entry points agree`, () => {
    const require = createRequire(import.meta.url);
    const codecs = [contract.browser, require(`../shared/${contract.name}.cjs`) as Record<string, unknown>];
    if (contract.api) codecs.push(require(`../apps/api/src/shared/${contract.name}.cjs`) as Record<string, unknown>);
    if (contract.service) codecs.push(contract.service);
    for (const codec of codecs) {
      assert.deepEqual(Object.keys(codec).sort(), Object.keys(contract.browser).sort());
      for (const fixture of contract.cases) {
        const method = codec[fixture.method];
        assert.equal(typeof method, "function");
        assert.deepEqual((method as (...args: unknown[]) => unknown)(...fixture.args), fixture.expected);
      }
    }
  });
}
