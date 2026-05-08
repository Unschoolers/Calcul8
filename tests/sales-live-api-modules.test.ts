import assert from "node:assert/strict";
import { test, vi } from "vitest";

const {
  hasAuthSignalMock,
  resolveApiBaseUrlMock
} = vi.hoisted(() => ({
  hasAuthSignalMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn()
}));

vi.mock("../src/app-core/auth/index.ts", () => ({
  hasAuthSignal: hasAuthSignalMock
}));

vi.mock("../src/app-core/methods/ui/common/shared.ts", () => ({
  fetchAuthenticatedApiResponse: vi.fn(),
  resolveApiBaseUrl: resolveApiBaseUrlMock
}));

import {
  canUseAuthoritativeSalesLiveApi,
  createMutationId,
  SalesLiveApiError
} from "../src/app-core/methods/entity-api-shared.ts";
import {
  fetchAuthoritativeSales,
  normalizeSale
} from "../src/app-core/methods/lot-sales-api.ts";
import {
  fetchAuthoritativeLivePricing,
  normalizeLivePricing
} from "../src/app-core/methods/lot-live-pricing-api.ts";
import {
  fetchWorkspaceRealtimeSubscribeToken
} from "../src/app-core/methods/workspace-realtime-api.ts";

test("entity API modules expose their own sales, live-pricing, realtime, and shared boundaries", () => {
  resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");
  hasAuthSignalMock.mockReturnValue(true);

  assert.equal(canUseAuthoritativeSalesLiveApi(), true);
  assert.equal(typeof createMutationId, "function");
  assert.equal(typeof SalesLiveApiError, "function");
  assert.equal(typeof fetchAuthoritativeSales, "function");
  assert.equal(typeof normalizeSale, "function");
  assert.equal(typeof fetchAuthoritativeLivePricing, "function");
  assert.equal(typeof normalizeLivePricing, "function");
  assert.equal(typeof fetchWorkspaceRealtimeSubscribeToken, "function");
});
