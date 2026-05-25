import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import {
  resolveVuetifySlotNumber,
  resolveVuetifySlotString,
  resolveVuetifySlotValue
} from "../src/app-core/shared/vuetify-slot-items.ts";

test("resolveVuetifySlotString falls back across raw, normalized item, and props fields", () => {
  assert.equal(
    resolveVuetifySlotString(
      { raw: { name: " " }, title: "Normalized title", props: { title: "Prop title" } },
      ["name", "title"]
    ),
    "Normalized title"
  );
  assert.equal(
    resolveVuetifySlotString(
      { raw: {}, props: { image: " https://img.test/card.webp " } },
      ["image"]
    ),
    "https://img.test/card.webp"
  );
  assert.equal(
    resolveVuetifySlotString(
      { raw: { cardNo: null }, cardNumber: "UE01BT/001" },
      ["cardNo", "cardNumber"]
    ),
    "UE01BT/001"
  );
});

test("resolveVuetifySlotValue and number preserve non-string slot values", () => {
  assert.equal(resolveVuetifySlotValue({ raw: { marketPrice: 0 } }, ["marketPrice"]), 0);
  assert.equal(resolveVuetifySlotNumber({ raw: {}, props: { quantity: "3" } }, ["quantity"]), 3);
  assert.equal(resolveVuetifySlotNumber({ raw: {}, props: { quantity: "" } }, ["quantity"]), null);
});

test("dropdown templates use shared Vuetify slot fallbacks instead of direct raw display fields", async () => {
  const slotTemplatePaths = [
    "src/components/windows/singles/SinglesConfigWindow.html",
    "src/components/windows/live/LiveSinglesPanel.html",
    "src/components/shell/SaleEditorModal.html",
    "src/components/windows/game/coordinator/GameWindow.html",
    "src/components/windows/game/inspector/WheelTierCard.html",
    "src/components/windows/game/bracket/BracketBattleBuilder.html"
  ];

  for (const path of slotTemplatePaths) {
    const template = await readFile(path, "utf8");
    assert.doesNotMatch(template, /item\??\.raw\??\./, `${path} should not directly assume item.raw display fields`);
    assert.match(template, /resolveVuetifySlot/, `${path} should resolve Vuetify slot fields through the shared helper`);
  }
});
