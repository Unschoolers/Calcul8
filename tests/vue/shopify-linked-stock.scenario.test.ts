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
const row = (key: string) => screen.getByText(key).closest("tr")!.textContent;

test("Shopify receipts, imported box sales, and opened boxes move independent inventory counts", async () => {
  let stock = 10;
  const state = reactive({ sales: [] as { type: string; quantity: number; packsCount: number; externalProvider?: string }[] });
  const loadStock = vi.fn(async () => observation(stock));
  const Harness = defineComponent({ setup: () => () => h(ShopifyLinkedStock, {
    boxesPurchased: 10, packsPerBox: 10, sales: state.sales, loadStock, t
  }) });
  renderWithApp(Harness);
  await waitFor(() => expect(row("configShopifyStockAvailable")).toContain("10"));
  expect(row("configShopifyStockSealed")).toContain("10");

  stock = 12; // Shopify receives two boxes; WhatFees purchase history stays unchanged.
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyStockRefresh" }));
  await waitFor(() => expect(row("configShopifyStockAvailable")).toContain("12"));
  expect(row("configShopifyStockSealed")).toContain("10");
  expect(row("configShopifyStockDifference")).toContain("+2");

  stock = 11;
  state.sales.push({ type: "box", quantity: 1, packsCount: 0, externalProvider: "shopify" });
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyStockRefresh" }));
  await waitFor(() => expect(row("configShopifyStockAvailable")).toContain("11"));
  expect(row("configShopifyStockSealed")).toContain("9");
  expect(row("configShopifyStockDifference")).toContain("+2"); // Current Shopify availability is not deducted again.

  state.sales.push({ type: "pack", quantity: 1, packsCount: 1 });
  await waitFor(() => expect(row("configShopifyStockSealed")).toContain("8"));
  expect(row("configShopifyStockOpened")).toContain("1");
  expect(row("configShopifyStockLoosePacks")).toContain("9");
  expect(row("configShopifyStockAvailable")).toContain("11");
  expect(row("configShopifyStockDifference")).toContain("+3");
});

test("failed refresh preserves the previous observation and exposes a stale state", async () => {
  const loadStock = vi.fn().mockResolvedValueOnce(observation(4)).mockRejectedValueOnce(new Error("offline"));
  renderWithApp(ShopifyLinkedStock, { props: { boxesPurchased: 4, packsPerBox: 10, sales: [], loadStock, t } });
  await waitFor(() => expect(row("configShopifyStockAvailable")).toContain("4"));
  await fireEvent.click(screen.getByRole("button", { name: "configShopifyStockRefresh" }));
  await waitFor(() => expect(screen.getByText("configShopifyStockStale")).toBeTruthy());
  expect(row("configShopifyStockAvailable")).toContain("4");
  expect(screen.getByRole("button", { name: "configShopifyStockRefresh" }).hasAttribute("disabled")).toBe(false);
});
