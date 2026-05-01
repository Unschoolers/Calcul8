import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, vi } from "vitest";

import { getScopedActiveWheelConfigStorageKey } from "../src/app-core/storageKeys.ts";
import { WheelWindow } from "../src/components/windows/wheel/WheelWindow.ts";
import type { WheelConfig } from "../src/types/app.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function withMockedLocalStorage(run: (data: Map<string, string>) => void): void {
  const original = (globalThis as { localStorage?: MockStorage }).localStorage;
  const data = new Map<string, string>();
  const storage: MockStorage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, String(value));
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    })
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage
  });

  try {
    run(data);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: original
    });
  }
}

function wheelConfig(id: number, name: string): WheelConfig {
  return {
    id,
    name,
    spinPrice: 10,
    targetMargin: 40,
    createdAt: "",
    tiers: []
  };
}

test("wheel stage owns game selection and editor actions instead of the inspector builder", () => {
  const stageTemplate = readFileSync("src/components/windows/wheel/stage/WheelStageTopbar.html", "utf8");
  const inspectorTemplate = readFileSync("src/components/windows/wheel/inspector/WheelInspector.html", "utf8");

  assert.match(stageTemplate, /wheel-stage-game-toolbar/);
  assert.match(stageTemplate, /v-model="activeWheelConfigId"/);
  assert.match(stageTemplate, /openWheelCreateDialog/);
  assert.match(stageTemplate, /openWheelManageDialog/);
  assert.doesNotMatch(inspectorTemplate, /wheel-active-config-toolbar/);
});

test("wheel stage keeps desktop controls visible and collapses them behind one compact menu", () => {
  const stageTemplate = readFileSync("src/components/windows/wheel/stage/WheelStageTopbar.html", "utf8");
  const stageStyles = readFileSync("src/components/windows/wheel/stage/WheelStageTopbar.vue", "utf8");

  assert.match(stageTemplate, /wheel-stage-game-menu/);
  assert.match(stageTemplate, /mdi-dots-vertical/);
  assert.match(stageTemplate, /wheel-stage-game-action/);
  assert.match(stageTemplate, /wheel-effects-controls/);
  assert.match(stageTemplate, /toggleWheelSound/);
  assert.match(stageTemplate, /toggleWheelReducedMotion/);
  assert.match(stageTemplate, /wheelPresentationMode = !wheelPresentationMode/);
  assert.match(stageStyles, /\.wheel-stage-more-action\s*\{[^}]*display: none;/s);
  assert.match(stageStyles, /@container \(max-width: 440px\)[\s\S]*\.wheel-stage-more-action\s*\{[^}]*display: inline-flex;/);
  assert.match(stageStyles, /@container \(max-width: 440px\)[\s\S]*\.wheel-stage-game-action,[\s\S]*\.wheel-stage-utility-controls\s*\{[^}]*display: none;/);
  assert.doesNotMatch(stageStyles, /\.wheel-stage-topbar\s*\{[^}]*overflow: hidden;/s);
});

test("persistLastWheelConfigSelection stores the active game id in the current scope", () => {
  withMockedLocalStorage((data) => {
    const vm: Record<string, unknown> = {
      activeScopeType: "workspace",
      activeWorkspaceId: "team-42",
      activeWheelConfigId: 92
    };

    WheelWindow.methods!.persistLastWheelConfigSelection.call(vm as never);

    assert.equal(
      data.get(getScopedActiveWheelConfigStorageKey({ scopeType: "workspace", workspaceId: "team-42" })),
      "92"
    );
    assert.equal(
      data.has(getScopedActiveWheelConfigStorageKey({ scopeType: "personal", workspaceId: null })),
      false
    );
  });
});

test("restoreLastWheelConfigSelection selects a saved game only when it exists in the current scope", () => {
  withMockedLocalStorage((data) => {
    data.set(getScopedActiveWheelConfigStorageKey({ scopeType: "personal", workspaceId: null }), "91");
    data.set(getScopedActiveWheelConfigStorageKey({ scopeType: "workspace", workspaceId: "team-42" }), "92");
    const vm: Record<string, unknown> = {
      activeScopeType: "workspace",
      activeWorkspaceId: "team-42",
      activeWheelConfigId: 91,
      wheelConfigs: [wheelConfig(91, "Personal Wheel"), wheelConfig(92, "Workspace Wheel")]
    };

    WheelWindow.methods!.restoreLastWheelConfigSelection.call(vm as never);

    assert.equal(vm.activeWheelConfigId, 92);
  });
});

test("restoreLastWheelConfigSelection falls back to the first game and replaces stale storage", () => {
  withMockedLocalStorage((data) => {
    const key = getScopedActiveWheelConfigStorageKey({ scopeType: "personal", workspaceId: null });
    data.set(key, "999");
    const vm: Record<string, unknown> = {
      activeScopeType: "personal",
      activeWorkspaceId: null,
      activeWheelConfigId: null,
      wheelConfigs: [wheelConfig(91, "First Wheel"), wheelConfig(92, "Second Wheel")]
    };

    WheelWindow.methods!.restoreLastWheelConfigSelection.call(vm as never);

    assert.equal(vm.activeWheelConfigId, 91);
    assert.equal(data.get(key), "91");
  });
});
