import assert from "node:assert/strict";
import { test } from "vitest";
import { createLotSelectorContextBridge } from "../src/components/shell/LotSelectorOnboardingBlock.ts";
import { resolveLotSelectorDisplayItem } from "../src/components/shell/lotSelectorDisplay.ts";

const lotItem = {
  title: "Base Set",
  subtitle: "Bulk lot",
  symbolIcon: "mdi-cube-outline",
  completionIcon: "mdi-check-circle",
  groupLabel: "Bulk",
  lotType: "bulk"
};

test("lot selector resolves Vuetify raw slot items", () => {
  assert.deepEqual(resolveLotSelectorDisplayItem({ raw: lotItem }), lotItem);
});

test("lot selector resolves direct slot items when Vuetify omits raw", () => {
  assert.deepEqual(resolveLotSelectorDisplayItem(lotItem), lotItem);
});

test("lot selector returns empty display fields for malformed slot items", () => {
  assert.deepEqual(resolveLotSelectorDisplayItem(null), {
    title: "",
    subtitle: "",
    symbolIcon: "",
    completionIcon: "",
    groupLabel: "",
    lotType: ""
  });
});

test("lot selector setup bridge exposes display resolver without hiding app context", () => {
  const source = {
    currentLotId: "lot-1",
    selectLot(value: string) {
      this.currentLotId = value;
    }
  };

  const bridge = createLotSelectorContextBridge(source);
  assert.equal(bridge.currentLotId, "lot-1");
  assert.equal(typeof bridge.resolveLotSelectorDisplayItem, "function");

  const selectLot = bridge.selectLot as (value: string) => void;
  selectLot("lot-2");
  assert.equal(source.currentLotId, "lot-2");
});
