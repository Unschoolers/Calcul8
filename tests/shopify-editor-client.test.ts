import { expect, test, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../src/app-core/methods/ui/common/api-client.ts", () => ({
  fetchAuthenticatedApiResponse: request
}));

import { createShopifyEditorClient } from "../src/app-core/methods/ui/shopify/shopify-editor-client.ts";

test("Shopify editor endpoints share authenticated transport and preserve mutation retry policy", async () => {
  const context = {} as Parameters<typeof createShopifyEditorClient>[0];
  const client = createShopifyEditorClient(context);
  const init = { method: "POST", body: JSON.stringify({ mutationId: "stable-1" }) };
  request.mockResolvedValue(new Response(null, { status: 200 }));

  await client.post("binding", init, { retryUnsafeMethods: true });

  expect(request).toHaveBeenCalledWith(context, "/integrations/shopify/products/binding", init, { retryUnsafeMethods: true });
});
