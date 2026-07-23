import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { createWebPlayBillingPort } from "../src/app-core/platform/play-billing/webPlayBilling.ts";
import { createNativePlayBillingPort } from "../src/app-core/platform/play-billing/nativePlayBilling.ts";

test("web billing adapts Digital Goods purchase and restore to one contract", async () => {
  const service = {
    purchase: vi.fn(async () => ({ itemId: "pro_access", purchaseToken: "new-token" })),
    listPurchases: vi.fn(async () => [
      { itemId: "pro_access", purchaseToken: "owned-token" }
    ])
  };
  const port = await createWebPlayBillingPort({
    getService: async () => service,
    supportsPaymentRequest: () => false
  });

  assert.ok(port);
  assert.equal(await port.isAvailable(), true);
  assert.deepEqual(await port.purchase("pro_access"), {
    productId: "pro_access",
    purchaseToken: "new-token",
    state: "purchased"
  });
  assert.deepEqual(await port.listPurchases(), [{
    productId: "pro_access",
    purchaseToken: "owned-token",
    state: "purchased"
  }]);
});

test("web billing maps browser cancellation to the shared error contract", async () => {
  const port = await createWebPlayBillingPort({
    getService: async () => ({
      purchase: async () => {
        throw new DOMException("Cancelled", "AbortError");
      }
    }),
    supportsPaymentRequest: () => false
  });

  assert.ok(port);
  await assert.rejects(
    () => port.purchase("pro_access"),
    (error: unknown) => error instanceof Error
      && error.name === "PlayBillingError"
      && "code" in error
      && error.code === "cancelled"
  );
});

test("native billing validates and normalizes plugin purchases", async () => {
  const port = createNativePlayBillingPort({
    isAvailable: vi.fn(async () => ({ available: true })),
    listPurchases: vi.fn(async () => ({
      purchases: [{
        productId: "pro_access",
        purchaseToken: "owned-token",
        state: "purchased"
      }]
    })),
    purchase: vi.fn(async () => ({
      purchase: {
        productId: "pro_access",
        purchaseToken: "new-token",
        state: "pending"
      }
    }))
  });

  assert.equal(await port.isAvailable(), true);
  assert.deepEqual(await port.listPurchases(), [{
    productId: "pro_access",
    purchaseToken: "owned-token",
    state: "purchased"
  }]);
  assert.deepEqual(await port.purchase("pro_access"), {
    productId: "pro_access",
    purchaseToken: "new-token",
    state: "pending"
  });
});

test("native billing preserves the duplicate-flow guard error", async () => {
  const port = createNativePlayBillingPort({
    isAvailable: vi.fn(async () => ({ available: true })),
    listPurchases: vi.fn(async () => ({ purchases: [] })),
    purchase: vi.fn(async () => {
      throw {
        code: "purchase_in_flight",
        message: "Another Google Play purchase is already active."
      };
    })
  });

  await assert.rejects(
    () => port.purchase("pro_access"),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "purchase_in_flight"
  );
});
