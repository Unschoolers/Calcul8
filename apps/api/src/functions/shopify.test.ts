import assert from "node:assert/strict";
import { test, vi } from "vitest";

const http = vi.fn();
vi.mock("@azure/functions", () => ({ app: { http } }));

test("Shopify connection routes include authenticated management and an OAuth callback", async () => {
  await import("./shopify");
  const routes = http.mock.calls.map(([name, options]) => ({ name, route: options.route, methods: options.methods }));
  assert.ok(routes.some(route => route.route === "integrations/shopify/connect/start" && route.methods.includes("POST")));
  assert.ok(routes.some(route => route.route === "integrations/shopify/connect/callback" && route.methods.includes("GET")));
  assert.ok(routes.some(route => route.route === "integrations/shopify/status" && route.methods.includes("POST")));
  assert.ok(routes.some(route => route.route === "integrations/shopify/disconnect" && route.methods.includes("POST")));
  assert.ok(routes.some(route => route.route === "integrations/shopify/products/stock" && route.methods.includes("POST")));
});
