import { fireEvent, screen, waitFor } from "@testing-library/vue";
import { defineComponent, h, reactive } from "vue";
import { expect, test, vi } from "vitest";
import ShopifyLinkedStock from "../../src/components/windows/shopify/ShopifyLinkedStock.vue";
import { renderWithApp } from "./render.ts";

const observation = (available: number) => ({
  shop: "store.myshopify.com", variantId: "gid://shopify/ProductVariant/2", inventoryItemId: "gid://shopify/InventoryItem/3",
  locationId: "gid://shopify/Location/4", locationName: "Main store", available, onHand: available + 1, committed: 1,
  observedAt: "2026-09-30T20:00:00.000Z"
});
const t = (key: string) => key;
const value = (key: string) => screen.getByTestId(`stock-value-${key}`).textContent;

test("Shopify receipts, imported box sales, and opened boxes move independent inventory counts", async () => {
  let stock = 10;
  const state = reactive({ sales: [] as { type: string; quantity: number; packsCount: number; externalProvider?: string }[] });
  const loadStock = vi.fn(async () => observation(stock));
  const Harness = defineComponent({ setup: () => () => h(ShopifyLinkedStock, {
    boxesPurchased: 10, packsPerBox: 10, sales: state.sales, loadStock, t
  }) });
  renderWithApp(Harness);
  await waitFor(() => expect(value("configShopifyStockAvailable")).toContain("10"));
  expect(value("configShopifyStockSealed")).toContain("10");

  stock = 12; // Shopify receives two boxes; WhatFees purchase history stays unchanged.
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyStockRefresh" }));
  await waitFor(() => expect(value("configShopifyStockAvailable")).toContain("12"));
  expect(value("configShopifyStockSealed")).toContain("10");
  expect(value("configShopifyStockDifference")).toContain("+2");

  stock = 11;
  state.sales.push({ type: "box", quantity: 1, packsCount: 0, externalProvider: "shopify" });
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyStockRefresh" }));
  await waitFor(() => expect(value("configShopifyStockAvailable")).toContain("11"));
  expect(value("configShopifyStockSealed")).toContain("9");
  expect(value("configShopifyStockDifference")).toContain("+2"); // Current Shopify availability is not deducted again.

  state.sales.push({ type: "pack", quantity: 1, packsCount: 1 });
  await waitFor(() => expect(value("configShopifyStockSealed")).toContain("8"));
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyStockDetails" }));
  expect(screen.getByTestId("stock-value-configShopifyStockOpened").textContent).toContain("1");
  expect(screen.getByTestId("stock-value-configShopifyStockLoosePacks").textContent).toContain("9");
  expect(value("configShopifyStockAvailable")).toContain("11");
  expect(value("configShopifyStockDifference")).toContain("+3");
});

test("failed refresh preserves the previous observation and exposes a stale state", async () => {
  const loadStock = vi.fn().mockResolvedValueOnce(observation(4)).mockRejectedValueOnce(new Error("offline"));
  renderWithApp(ShopifyLinkedStock, { props: { boxesPurchased: 4, packsPerBox: 10, sales: [], loadStock, t } });
  await waitFor(() => expect(value("configShopifyStockAvailable")).toContain("4"));
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyStockRefresh" }));
  await waitFor(() => expect(screen.getByText("configShopifyStockStale")).toBeTruthy());
  expect(value("configShopifyStockAvailable")).toContain("4");
  expect(screen.getByRole("button", { name: "configShopifyStockRefresh" }).hasAttribute("disabled")).toBe(false);
});

test("keeps unknown stock visibly different from a zero observation", async () => {
  let resolveStock!: (value: ReturnType<typeof observation>) => void;
  const loadStock = vi.fn(() => new Promise<ReturnType<typeof observation>>((resolve) => { resolveStock = resolve; }));
  renderWithApp(ShopifyLinkedStock, { props: { boxesPurchased: 0, packsPerBox: 10, sales: [], loadStock, t } });
  expect(value("configShopifyStockAvailable")).toContain("—");
  expect(value("configShopifyStockSealed")).toContain("0");
  resolveStock(observation(0));
  await waitFor(() => expect(value("configShopifyStockAvailable")).toContain("0"));
  expect(value("configShopifyStockDifference")).toContain("0");
});

test("announces a successful refresh and exposes expandable secondary details", async () => {
  const loadStock = vi.fn().mockResolvedValue(observation(3));
  renderWithApp(ShopifyLinkedStock, { props: { boxesPurchased: 3, packsPerBox: 10, sales: [], loadStock, t } });
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("configShopifyStockUpdated"));
  const disclosure = screen.getByRole("button", { name: "configShopifyStockDetails" });
  expect(disclosure.getAttribute("aria-expanded")).toBe("false");
  expect(screen.getByTestId("stock-value-configShopifyStockOnHand").closest(".shopify-stock-card__details")).toHaveStyle({ display: "none" });
  await fireEvent.click(disclosure);
  expect(disclosure.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByTestId("stock-value-configShopifyStockOnHand").textContent).toContain("4");
  expect(screen.getByTestId("stock-value-configShopifyStockCommitted").textContent).toContain("1");
});

test("exposes the primary quantities as a named stock summary group", async () => {
  renderWithApp(ShopifyLinkedStock, { props: { boxesPurchased: 0, packsPerBox: 10, sales: [], loadStock: vi.fn(async () => observation(0)), t } });
  expect(screen.getByRole("group", { name: "configShopifyStockSummary" })).toBeTruthy();
});
