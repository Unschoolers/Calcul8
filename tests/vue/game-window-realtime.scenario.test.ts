import { render } from "@testing-library/vue";
import { defineComponent, nextTick, reactive, type Component } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import { applyRealtimeMessage } from "../../src/app-core/methods/ui/workspace/workspace-realtime-events.ts";
import { getScopedWheelConfigSessionStorageKey } from "../../src/app-core/storageKeys.ts";
import { createInitialState } from "../../src/app-core/state.ts";
import { gameWindowDefinition } from "../../src/components/windows/game/coordinator/GameWindow.definition.ts";
import { buildSlotsFromConfig } from "../../src/components/windows/game/services/wheelSlots.ts";
import type { WheelConfig } from "../../src/types/app.ts";

vi.mock("../../src/app-core/methods/entity-api-shared.ts", () => ({
  canUseAuthoritativeSalesLiveApi: () => true
}));

const GameWindowWatcherHarness = defineComponent({
  props: gameWindowDefinition.props,
  data: gameWindowDefinition.data,
  watch: gameWindowDefinition.watch,
  methods: gameWindowDefinition.methods,
  setup: gameWindowDefinition.setup,
  template: "<div />"
} as never) as Component;

afterEach(() => vi.unstubAllGlobals());

function config(name: string): WheelConfig {
  return {
    id: 91,
    name,
    spinPrice: 10,
    targetMargin: 40,
    createdAt: "",
    tiers: [{
      id: "tier-1",
      label: "Prize",
      color: "#ff0000",
      slots: 1,
      costPerTier: 2,
      packsCount: 1,
      deductionType: "packs",
      sets: []
    }]
  };
}

test("mounted GameWindow watchers preserve an authoritative realtime session over stale local storage", async () => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key)
  });
  const oldConfig = config("Old wheel");
  const remoteConfig = config("Remote wheel");
  const remoteCounts = [3, ...new Array(99).fill(0)];
  const staleCounts = [9, ...new Array(99).fill(0)];
  const ctx = reactive({
    ...createInitialState(),
    activeScopeType: "workspace" as const,
    activeWorkspaceId: "team-42",
    currentTab: "wheel",
    currentLotId: 1,
    lots: [{ id: 1, name: "Bulk", lotType: "bulk" as const }],
    wheelConfigs: [oldConfig],
    activeWheelConfigId: 91,
    activeWheelSlots: buildSlotsFromConfig(oldConfig),
    wheelPreviewSlots: buildSlotsFromConfig(oldConfig),
    wheelSpinCounts: [1],
    wheelTotalSpins: 1,
    wheelSessionUpdatedAt: 100,
    loadSalesForLotId: vi.fn(() => []),
    getSalesStorageKey: vi.fn(() => "sales"),
    pullCloudSync: vi.fn(),
    hydrateBuyerProfiles: vi.fn(),
    handleWorkspaceAccessLost: vi.fn(),
    notify: vi.fn()
  });
  localStorage.setItem(
    getScopedWheelConfigSessionStorageKey({ scopeType: "workspace", workspaceId: "team-42" }, 91),
    JSON.stringify({ wheelSpinCounts: staleCounts, wheelPreviewSpinCounts: new Array(100).fill(0), wheelSessionUpdatedAt: 90 })
  );
  render(GameWindowWatcherHarness, { props: { ctx } });

  applyRealtimeMessage(ctx as never, "workspace:team-42:wheel", "wheel.session.updated", {
    wheelConfigs: [remoteConfig],
    activeWheelConfigId: 91,
    wheelSpinCounts: remoteCounts,
    wheelTotalSpins: 3,
    wheelSessionUpdatedAt: 200
  });
  await nextTick();
  await nextTick();

  expect(ctx.wheelConfigs[0]?.name).toBe("Remote wheel");
  expect(ctx.activeWheelConfigId).toBe(91);
  expect(ctx.wheelSpinCounts).toEqual(remoteCounts);
  expect(ctx.wheelTotalSpins).toBe(3);
});
