import { fireEvent, screen, waitFor } from "@testing-library/vue";
import { expect, test, vi } from "vitest";
import { reactive } from "vue";
import ShopifyCreateDraftDialog from "../../src/components/windows/shopify/ShopifyCreateDraftDialog.vue";
import ShopifyProductPicker from "../../src/components/windows/shopify/ShopifyProductPicker.vue";
import type { ShopifyDraftPreview } from "../../src/domain/shopify-draft.ts";
import { renderWithApp } from "./render.ts";

const preview: ShopifyDraftPreview = {
  title: "Dragon Shield Matte Sleeves",
  variantTitle: "Sealed box",
  sku: "DS-MATTE-100",
  price: "34.50",
  currency: "CAD",
  quantity: 7,
  locations: [
    { id: "gid://shopify/Location/111", name: "Main Warehouse" },
    { id: "gid://shopify/Location/222", name: "Overflow Storage" }
  ],
  previewToken: "a".repeat(64)
};

const t = (key: string) => ({
  shopifyDraftDialogTitle: "Create Shopify draft",
  configShopifySectionTitle: "Shopify product",
  configShopifyCreateDraft: "Create Shopify product",
  configShopifyDraftSaveFirst: "Save the lot name and SKU first. The draft uses saved inventory details.",
  shopifyDraftTitleLabel: "Product title",
  shopifyDraftVariantLabel: "Variant",
  shopifyDraftSkuLabel: "SKU",
  shopifyDraftPriceLabel: "Price",
  shopifyDraftQuantityLabel: "Initial quantity",
  shopifyDraftLocationLabel: "Inventory location",
  shopifyDraftNotPublished: "This product stays a draft until you publish it in Shopify.",
  shopifyDraftFutureStock: "Shopify owns future stock and product management.",
  shopifyDraftCreate: "Create draft and link",
  shopifyDraftLoading: "Loading authoritative preview…",
  shopifyDraftLoadError: "Could not load preview.",
  shopifyDraftCreateError: "Could not create the draft.",
  configShopifyPickerOpen: "Link existing product",
  commonClose: "Close",
  shopifyDraftRefreshPreview: "Refresh preview"
}[key] ?? key);

function renderDialog(overrides: Partial<{
  modelValue: boolean;
  loadPreview: () => Promise<ShopifyDraftPreview>;
  createDraft: (locationId: string, previewToken: string) => Promise<void>;
}> = {}) {
  return renderWithApp(ShopifyCreateDraftDialog, {
    props: {
      modelValue: true,
      t,
      loadPreview: vi.fn(async () => preview),
      createDraft: vi.fn(async () => undefined),
      "onUpdate:modelValue": vi.fn(),
      ...overrides
    }
  });
}

test("shows only the authoritative server preview and Shopify draft ownership notes", async () => {
  const loadPreview = vi.fn(async () => preview);
  renderDialog({ loadPreview });

  expect(await screen.findByText("Dragon Shield Matte Sleeves")).toBeTruthy();
  expect(screen.getByText("Sealed box")).toBeTruthy();
  expect(screen.getByText("DS-MATTE-100")).toBeTruthy();
  expect(screen.getByText("34.50 CAD")).toBeTruthy();
  expect(screen.getByText("7")).toBeTruthy();
  expect(screen.getByText("This product stays a draft until you publish it in Shopify.")).toBeTruthy();
  expect(screen.getByText("Shopify owns future stock and product management.")).toBeTruthy();
  expect(loadPreview).toHaveBeenCalledOnce();
});

test("requires an explicit location choice when the shop has multiple locations", async () => {
  renderDialog();
  const create = await screen.findByRole("button", { name: "Create draft and link" });
  expect(create.hasAttribute("disabled")).toBe(true);

  const location = screen.getByRole("combobox", { name: "Inventory location" });
  await fireEvent.click(location);
  await fireEvent.keyDown(location, { key: "ArrowDown" });
  await waitFor(() => expect(screen.getByRole("option", { name: "Main Warehouse" })).toBeTruthy());
  await fireEvent.click(screen.getByRole("option", { name: "Main Warehouse" }));
  expect(create.hasAttribute("disabled")).toBe(false);
});

test("submits the preview token once and closes only after successful create", async () => {
  const createDraft = vi.fn(async () => undefined);
  const props = reactive({
    modelValue: true, t, loadPreview: async () => preview, createDraft,
    "onUpdate:modelValue": (value: boolean) => { props.modelValue = value; }
  });
  renderWithApp(ShopifyCreateDraftDialog, { props });

  await screen.findByText("Dragon Shield Matte Sleeves");
  const location = screen.getByRole("combobox", { name: "Inventory location" });
  await fireEvent.click(location);
  await fireEvent.keyDown(location, { key: "ArrowDown" });
  await waitFor(() => expect(screen.getByRole("option", { name: "Main Warehouse" })).toBeTruthy());
  await fireEvent.click(screen.getByRole("option", { name: "Main Warehouse" }));
  const create = screen.getByRole("button", { name: "Create draft and link" });
  await fireEvent.click(create);
  await fireEvent.click(create);

  await waitFor(() => expect(createDraft).toHaveBeenCalledOnce());
  expect(createDraft).toHaveBeenCalledWith("gid://shopify/Location/111", "a".repeat(64));
  expect(props.modelValue).toBe(false);
});

test("keeps the preview after create error and reloads it when retrying preview", async () => {
  const createDraft = vi.fn().mockRejectedValueOnce(new Error("stale preview"));
  const loadPreview = vi.fn(async () => preview);
  renderDialog({ createDraft, loadPreview });
  await screen.findByText("Dragon Shield Matte Sleeves");
  const location = screen.getByRole("combobox", { name: "Inventory location" });
  await fireEvent.click(location);
  await fireEvent.keyDown(location, { key: "ArrowDown" });
  await waitFor(() => expect(screen.getByRole("option", { name: "Main Warehouse" })).toBeTruthy());
  await fireEvent.click(screen.getByRole("option", { name: "Main Warehouse" }));
  await fireEvent.click(screen.getByRole("button", { name: "Create draft and link" }));

  expect(await screen.findByText("stale preview")).toBeTruthy();
  expect(screen.getByText("Dragon Shield Matte Sleeves")).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "Refresh preview" }));
  await waitFor(() => expect(loadPreview).toHaveBeenCalledTimes(2));
  expect(screen.getByText("Dragon Shield Matte Sleeves")).toBeTruthy();
});

test("ignores a preview response from an earlier open after close and reopen", async () => {
  let resolveFirst!: (value: ShopifyDraftPreview) => void;
  const loadPreview = vi.fn()
    .mockImplementationOnce(() => new Promise<ShopifyDraftPreview>(resolve => { resolveFirst = resolve; }))
    .mockResolvedValueOnce({ ...preview, title: "Current preview" });
  const props = reactive({
    modelValue: true, t, loadPreview, createDraft: async () => undefined,
    "onUpdate:modelValue": vi.fn()
  });
  renderWithApp(ShopifyCreateDraftDialog, { props });

  await waitFor(() => expect(loadPreview).toHaveBeenCalledOnce());
  props.modelValue = false;
  await waitFor(() => expect(screen.queryByText("Loading authoritative preview…")).toBeNull());
  props.modelValue = true;
  expect(await screen.findByText("Current preview")).toBeTruthy();
  resolveFirst({ ...preview, title: "Obsolete preview" });
  await waitFor(() => expect(screen.queryByText("Obsolete preview")).toBeNull());
});

test("rejects a preview whose server identity fields are not canonical", async () => {
  const malformed = {
    ...preview,
    price: "0.00",
    currency: "cad",
    locations: [{ id: "gid://shopify/Location/111", name: "Main Warehouse" }],
    previewToken: "A".repeat(64)
  };
  renderDialog({ loadPreview: async () => malformed });

  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid Shopify draft preview");
  expect(screen.queryByText("Dragon Shield Matte Sleeves")).toBeNull();
  expect(screen.getByRole("button", { name: "Create draft and link" }).hasAttribute("disabled")).toBe(true);
});

test("keeps draft creation explicit and disables it with a save-first hint for unsaved lot details", () => {
  renderWithApp(ShopifyProductPicker, { props: {
    query: "", results: [], loading: false, completed: false, hasMore: false,
    selectedVariantId: null, selectedLocationId: null, error: null, disabled: false, t,
    canCreateDraft: true, createDraftDisabled: true, loadDraftPreview: async () => preview,
    createDraft: async () => undefined
  } });

  expect(screen.getByRole("button", { name: "Link existing product" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Create Shopify product" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByText("Save the lot name and SKU first. The draft uses saved inventory details.")).toBeTruthy();
});
