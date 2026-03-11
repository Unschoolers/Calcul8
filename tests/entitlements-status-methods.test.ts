import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const {
  syncEntitlementStatusMock
} = vi.hoisted(() => ({
  syncEntitlementStatusMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/entitlements-status-service.ts", () => ({
  syncEntitlementStatus: syncEntitlementStatusMock
}));

import { uiEntitlementStatusMethods } from "../src/app-core/methods/ui/entitlements-status.ts";

beforeEach(() => {
  vi.clearAllMocks();
});

test("debugLogEntitlement delegates to syncEntitlementStatus with default forceRefresh", async () => {
  const context = { id: "ctx" };

  await uiEntitlementStatusMethods.debugLogEntitlement.call(context as never);

  assert.deepEqual(syncEntitlementStatusMock.mock.calls[0], [context, false]);
});

test("debugLogEntitlement forwards explicit forceRefresh value", async () => {
  const context = { id: "ctx" };

  await uiEntitlementStatusMethods.debugLogEntitlement.call(context as never, true);

  assert.deepEqual(syncEntitlementStatusMock.mock.calls[0], [context, true]);
});
