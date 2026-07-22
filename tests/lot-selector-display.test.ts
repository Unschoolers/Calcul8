import assert from "node:assert/strict";
import { test } from "vitest";
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
