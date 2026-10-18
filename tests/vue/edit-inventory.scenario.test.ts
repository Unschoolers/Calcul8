import { fireEvent, screen } from "@testing-library/vue";
import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { defineComponent, nextTick, reactive } from "vue";
import { createInitialState } from "../../src/app-core/state.ts";
import { translateAppMessage } from "../../src/app-core/i18n/index.ts";
import AppDialogShell from "../../src/components/ui/AppDialogShell.vue";
import AppFormLayout from "../../src/components/ui/AppFormLayout.vue";
import LotImageEditor from "../../src/components/ui/LotImageEditor.vue";
import ShopifyLotIntegration from "../../src/components/windows/shopify/ShopifyLotIntegration.vue";
import { renderWithApp } from "./render.ts";
import { vuetify } from "../../src/vuetify.ts";

const source = readFileSync("src/App.html", "utf8");
const template = source.slice(source.indexOf('<app-dialog-shell :model-value="showRenameLotModal'), source.indexOf('<!-- Verify Play Purchase Modal -->'));

afterEach(() => { vuetify.theme.global.name.value = "unionArenaDark"; });

test.each(["unionArenaDark", "unionArenaLight"])("%s: linked inventory hides the local reference and keeps actions in the fixed dialog footer", async theme => {
  vuetify.theme.global.name.value = theme;
  const save = vi.fn();
  const ctx = reactive({
    ...createInitialState(),
    currentLotId: 7, currentLotType: "bulk", currentLotCatalogSource: "none", isCurrentWorkspaceOwner: true,
    lots: [{ id: 7, name: "Kaiju #8", externalSku: "KEPT-REFERENCE" }],
    getSavedCurrentLot: () => ({ id: 7, name: "Kaiju #8", externalSku: "KEPT-REFERENCE" }),
    showRenameLotModal: true, renameLotName: "Kaiju #8", renameLotExternalSku: "KEPT-REFERENCE", renameLotWhatnotVertical: "tcg",
    shopifyEditListingStatus: "loaded",
    shopifyEditListing: { mode: "managed", productTitle: "Kaiju #8 — sealed box", productId: "gid://shopify/Product/7", price: "131.00", currency: "CAD" } as object | null,
    t: (key: string) => translateAppMessage("en", key), renameCurrentLot: save,
    closeRenameLotModal: vi.fn(), deleteCurrentLot: vi.fn(), setCurrentLotCatalogSource: vi.fn(),
    loadShopifyDraftPreview: vi.fn(), createShopifyDraft: vi.fn(), refreshShopifyEditListing: vi.fn(), loadShopifyLinkedStock: vi.fn(),
    applyShopifyBinding: vi.fn(), saveShopifyProductDetails: vi.fn(), onShopifyEditQueryChange: vi.fn(), searchShopifyEditProducts: vi.fn()
  });
  renderWithApp(defineComponent({ components: { AppDialogShell, AppFormLayout, ShopifyLotIntegration, LotImageEditor }, setup: () => ctx, template }));
  expect(screen.queryByRole("textbox", { name: "Inventory reference (optional)" })).toBeNull();
  expect(ctx.renameLotExternalSku).toBe("KEPT-REFERENCE");
  const manage = screen.getByRole("button", { name: "Manage Shopify product" });
  expect(manage.closest(`.v-theme--${theme}`)).toBeTruthy();
  expect(manage).toHaveTextContent(/^Manage$/);
  expect(screen.getByText("131.00 CAD")).toBeTruthy();
  expect(manage.closest("section")?.querySelector("svg path")).toBeTruthy();
  const saveButton = screen.getByRole("button", { name: "Save" });
  expect(saveButton.closest(".app-sticky-action-footer")).toBeTruthy();
  await fireEvent.click(saveButton);
  expect(save).toHaveBeenCalledOnce();

  ctx.shopifyEditListing = null;
  await nextTick();
  expect(screen.getByRole("textbox", { name: "Inventory reference (optional)" })).toHaveValue("KEPT-REFERENCE");
  for (const status of ["idle", "error"]) {
    ctx.shopifyEditListingStatus = status;
    await nextTick();
    expect(screen.getByRole("textbox", { name: "Inventory reference (optional)" })).toHaveValue("KEPT-REFERENCE");
  }
});
