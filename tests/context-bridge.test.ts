import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const { getCurrentInstanceMock } = vi.hoisted(() => ({
  getCurrentInstanceMock: vi.fn()
}));

vi.mock("vue", () => ({
  getCurrentInstance: getCurrentInstanceMock
}));

import {
  createNestedWindowContextBridge
} from "../src/components/windows/shared/contextBridge.ts";

type AppCtxLike = Record<string, unknown>;

beforeEach(() => {
  getCurrentInstanceMock.mockReset();
});

test("nested game context bridge proxies reads, writes, and bound methods", () => {
  const source: AppCtxLike = {
    currentTab: "config",
    valueOnSource: "source-only",
    callCount: 0,
    bump(this: AppCtxLike) {
      this.callCount = Number(this.callCount ?? 0) + 1;
      return this.currentTab;
    }
  };
  const internal = {
    internalOnly: 10
  };
  source.$ = { ctx: internal };

  const bridge = createNestedWindowContextBridge(source);

  assert.equal(bridge.valueOnSource, "source-only");
  assert.equal(bridge.internalOnly, 10);
  assert.equal("currentTab" in bridge, true);
  assert.equal("internalOnly" in bridge, true);

  bridge.internalOnly = 15;
  bridge.currentTab = "live";

  assert.equal((source as AppCtxLike).currentTab, "live");
  assert.equal(internal.internalOnly, 15);

  const methodResult = (bridge.bump as () => string)();
  assert.equal(methodResult, "live");
  assert.equal((source as AppCtxLike).callCount, 1);

  const keys = Reflect.ownKeys(bridge);
  assert.equal(Array.isArray(keys), true);
});
