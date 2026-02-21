import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const { getCurrentInstanceMock } = vi.hoisted(() => ({
  getCurrentInstanceMock: vi.fn()
}));

vi.mock("vue", () => ({
  getCurrentInstance: getCurrentInstanceMock
}));

import {
  createWindowContextBridge,
  resolveWindowContext
} from "../src/components/windows/contextBridge.ts";

type AppCtxLike = Record<string, unknown>;

function createAppLikeContext(overrides: AppCtxLike = {}): AppCtxLike {
  return {
    currentTab: "config",
    boxesPurchased: 1,
    sellingCurrency: "CAD",
    lots: [],
    sales: [],
    formatCurrency: (value: number) => `$${value.toFixed(2)}`,
    onPurchaseConfigChange: () => {},
    ...overrides
  };
}

beforeEach(() => {
  getCurrentInstanceMock.mockReset();
});

test("resolveWindowContext returns direct app-like context", () => {
  const ctx = createAppLikeContext();
  const resolved = resolveWindowContext(ctx);
  assert.equal(resolved, ctx);
});

test("resolveWindowContext falls back to $root and then internal ctx", () => {
  const root = createAppLikeContext({ currentTab: "sales" });
  const internal = createAppLikeContext({ currentTab: "live" });

  const fromRoot = resolveWindowContext({ $root: root });
  const fromInternal = resolveWindowContext({ $: { ctx: internal } });

  assert.equal(fromRoot, root);
  assert.equal(fromInternal, internal);
});

test("resolveWindowContext falls back to Vue current instance root", () => {
  const fallbackRoot = createAppLikeContext({ currentTab: "portfolio" });
  getCurrentInstanceMock.mockReturnValue({
    proxy: {
      $root: fallbackRoot
    }
  });

  const resolved = resolveWindowContext({ random: true });
  assert.equal(resolved, fallbackRoot);
});

test("createWindowContextBridge proxies reads/writes and binds methods", () => {
  const source = createAppLikeContext({
    valueOnSource: "source-only",
    callCount: 0,
    bump(this: AppCtxLike) {
      this.callCount = Number(this.callCount ?? 0) + 1;
      return this.currentTab;
    }
  });
  const internal = {
    internalOnly: 10
  };
  source.$ = { ctx: internal };

  const bridge = createWindowContextBridge(source);

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
  assert.equal(keys.includes("currentTab"), true);
  assert.equal(keys.includes("internalOnly"), true);
});
