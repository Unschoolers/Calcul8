import { expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ connection: vi.fn(), list: vi.fn(), pause: vi.fn() }));
vi.mock("../../lib/cosmos/shopifyRepository", () => ({ getShopifyConnection: mocks.connection }));
vi.mock("../../lib/cosmos/shopifyListingRepository", () => ({ createShopifyListingStore: () => ({ list: mocks.list }) }));
vi.mock("./adminClient", () => ({ createShopifyAdminClient: () => ({ pauseProduct: mocks.pause }) }));
import { pauseShopifyScope } from "./pauseService";
import type { ApiConfig } from "../../types";
test("disconnect leaves linked external products active and only pauses managed listings", async () => {
  mocks.connection.mockResolvedValue({ shop: "a.myshopify.com" });
  mocks.list.mockResolvedValue([{ shop: "a.myshopify.com", mode: "linked", productId: "linked" }, { shop: "a.myshopify.com", productId: "managed" },
    { shop: "a.myshopify.com", productId: "removed", lifecycle: "unlinked" }, { shop: "other.myshopify.com", productId: "other" }]);
  await pauseShopifyScope({} as ApiConfig, "u");
  expect(mocks.pause.mock.calls).toEqual([["managed"]]);
});
