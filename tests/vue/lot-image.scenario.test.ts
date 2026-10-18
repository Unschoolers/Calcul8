import { fireEvent, screen } from "@testing-library/vue";
import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { defineComponent, reactive } from "vue";
import { appOptions } from "../../src/app.ts";
import { createInitialState } from "../../src/app-core/state.ts";
import { translateAppMessage } from "../../src/app-core/i18n/index.ts";
import { renderWithApp } from "./render.ts";

const html = readFileSync("src/App.html", "utf8");
const template = html.slice(html.indexOf('<!-- New Lot Modal -->'), html.indexOf('<!-- Verify Play Purchase Modal -->'));

test("create and edit forms offer an optional image independent of a Shopify connection", async () => {
  const ctx = reactive({ ...createInitialState(), showNewLotModal: true, lotNameDraft: "Box", currentLotType: "bulk", currentLotCatalogSource: "none", isCurrentWorkspaceOwner: true,
    getSavedCurrentLot: () => undefined,
    t: (key: string) => translateAppMessage("en", key), createNewLot: vi.fn(), closeRenameLotModal: vi.fn(), renameCurrentLot: vi.fn(), deleteCurrentLot: vi.fn(),
    setCurrentLotCatalogSource: vi.fn(), loadShopifyDraftPreview: vi.fn(), createShopifyDraft: vi.fn(), refreshShopifyEditListing: vi.fn(), loadShopifyLinkedStock: vi.fn(),
    applyShopifyBinding: vi.fn(), saveShopifyProductDetails: vi.fn(), onShopifyEditQueryChange: vi.fn(), searchShopifyEditProducts: vi.fn() });
  renderWithApp(defineComponent({ components: appOptions.components, setup: () => ctx, template }));
  expect(screen.getByRole("button", { name: "Add image" })).toBeVisible();
  ctx.showNewLotModal = false; ctx.showRenameLotModal = true;
  ctx.renameLotImage = "data:image/jpeg;base64,/9j/2Q==";
  expect(await screen.findByRole("button", { name: "Replace image" })).toBeVisible();
  await fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
  expect(ctx.renameLotImage).toBe("");
});
