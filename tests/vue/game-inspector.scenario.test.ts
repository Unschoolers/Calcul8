import { fireEvent, screen } from "@testing-library/vue";
import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";
import { defineComponent, h, nextTick, provide, reactive } from "vue";
import WheelHistoryPanel from "../../src/components/windows/game/inspector/WheelHistoryPanel.vue";
import WheelInspector from "../../src/components/windows/game/inspector/WheelInspector.vue";
import WheelSessionPanel from "../../src/components/windows/game/inspector/WheelSessionPanel.vue";
import { createWheelControllerState } from "../../src/components/windows/game/services/gameSessionState.ts";
import MysteryGridSurface from "../../src/components/windows/game/stage/MysteryGridSurface.vue";
import { renderWithApp } from "./render.ts";

describe("game inspector scenarios", () => {
  test("Game overlays use the shared dialog shell", () => {
    const paths = [
      "src/components/windows/game/coordinator/GameWindow.html",
      "src/components/windows/game/dialogs/WheelCreateGameDialog.html",
      "src/components/windows/game/dialogs/GameSpectatorDialog.html",
      "src/components/windows/game/bracket/BracketBattlePanel.html",
      "src/components/windows/game/inspector/WheelTierCard.html"
    ];

    for (const path of paths) {
      const template = readFileSync(path, "utf8");
      expect(template).not.toMatch(/<v-dialog\b/);
      expect(template).toMatch(/<app-(?:dialog-shell|confirm-dialog)\b/);
    }
  });

  test("renders the Mystery Grid builder and keeps its primary control interactive", async () => {
    const addTier = vi.fn();
    const config = {
      id: 7,
      name: "Mystery Grid",
      gameType: "grid",
      outcomeCount: 9,
      spinPrice: 5,
      targetMargin: 20,
      createdAt: "",
      tiers: [{
        id: "tier-1",
        label: "Prize",
        color: "#f0a500",
        slots: 9,
        chancePercent: 100,
        costPerTier: 2,
        packsCount: 1,
        deductionType: "packs",
        boundLotId: 1,
        sets: []
      }]
    };
    const context = {
      wheelMobileInspectorOpen: false,
      wheelIsCompactLayout: false,
      wheelInspectorTab: "config",
      wheelInspectorPanelMeta: {
        icon: "mdi-grid",
        title: "Mystery Grid Builder",
        subtitle: "Configure the grid"
      },
      wheelInspectorTabItems: [
        { id: "config", icon: "mdi-tune", label: "Builder" },
        { id: "session", icon: "mdi-chart-box-outline", label: "Session" },
        { id: "history", icon: "mdi-history", label: "History" }
      ],
      wheelDisplayConfig: config,
      editingWheelConfig: config,
      preferredLanguage: "en",
      currentLotId: 1,
      sales: [],
      salesByLotId: new Map(),
      singlesSoldCountByPurchaseId: {},
      lots: [{ id: 1, name: "Bulk lot", lotType: "bulk", boxesPurchased: 1, packsPerBox: 9 }],
      loadSalesForLotId: () => [],
      getSalesCacheEntry: () => ({ sales: [], status: "loaded" }),
      wheelMode: "config",
      t: (key: string) => ({
        wheelInspectorGridConfigTitle: "Mystery Grid Builder",
        wheelInspectorGridConfigSubtitle: "Configure the grid",
        wheelInspectorSpinPriceLabel: "Price per play ($)",
        wheelInspectorOutcomeCountLabel: "Grid cells",
        wheelInspectorWheelTiersTitle: "Grid tiers",
        wheelOddsSubtitle: "Set the odds",
        wheelInspectorTierCountLabel: "1 tier",
        wheelInspectorAddTierAction: "Add tier"
      }[key] || key),
      addTier,
      focusWheelInspector: vi.fn((tab: string) => {
        context.wheelInspectorTab = tab;
      }),
      closeWheelInspector: vi.fn()
    };

    renderWithApp(WheelInspector, {
      props: { ctx: context },
      global: {
        provide: { gameCtx: context },
        stubs: {
          WheelTierCard: { template: "<div data-testid=\"wheel-tier-card\">{{ tier.label }}</div>", props: ["tier"] },
          WheelSessionPanel: { template: "<div />" },
          WheelHistoryPanel: { template: "<div />" },
          BracketBattleBuilder: { template: "<div />" }
        }
      }
    });

    expect(screen.getByText("Mystery Grid Builder")).toBeVisible();
    expect(screen.getByTestId("wheel-tier-card")).toHaveTextContent("Prize");

    await fireEvent.click(screen.getByRole("button", { name: "Add tier" }));

    expect(addTier).toHaveBeenCalledOnce();
    await fireEvent.click(screen.getByRole("button", { name: "Session" }));
    expect(context.focusWheelInspector).toHaveBeenCalledWith("session");
    expect(context.wheelInspectorTab).toBe("session");
  });

  test("clicking a Mystery Grid tile does not emit an inspector render warning", async () => {
    const config = {
      id: 8,
      name: "Mystery Grid",
      gameType: "grid",
      outcomeCount: 9,
      spinPrice: 5,
      targetMargin: 20,
      createdAt: "",
      tiers: [{
        id: "tier-1",
        label: "Prize",
        color: "#f0a500",
        slots: 9,
        chancePercent: 100,
        costPerTier: 2,
        packsCount: 1,
        deductionType: "packs",
        boundLotId: 1,
        sets: []
      }]
    };
    const context = reactive({
      ...createWheelControllerState(),
      wheelMode: "config" as const,
      wheelDisplayConfig: config,
      editingWheelConfig: config,
      wheelTotalSpins: 1,
      wheelSpinCounts: [1],
      wheelLastResult: "Prize",
      wheelLastResultColor: "#f0a500",
      wheelFairnessHistory: [{
        spinNumber: 1,
        label: "Prize",
        color: "#f0a500",
        hash: "hash-1",
        seed: "seed-1",
        timestamp: 1
      }],
      wheelSpinHash: "hash-1",
      wheelSpinSeed: "seed-1",
      mysteryGridCells: Array.from({ length: 9 }, (_unused, index) => ({
        index,
        label: "",
        color: "",
        revealed: false,
        reveal: null
      })),
      preferredLanguage: "en",
      lots: [],
      sales: [],
      salesByLotId: new Map(),
      singlesSoldCountByPurchaseId: {},
      getSalesCacheEntry: vi.fn(),
      loadSalesForLotId: vi.fn(() => []),
      wheelEndingSession: false,
      wheelChaseDialog: false,
      requestWheelReset: vi.fn(),
      requestWheelSessionEnd: vi.fn(),
      t: (key: string) => key,
      revealMysteryGridCell: vi.fn(async (cellIndex: number) => {
        context.mysteryGridCells = context.mysteryGridCells.map((cell) => (
          cell.index === cellIndex
            ? { ...cell, label: "Prize", color: "#f0a500", revealed: true }
            : cell
        ));
        context.wheelPreviewGridReveals = [{
          cellIndex,
          slotIndex: cellIndex,
          label: "Prize",
          color: "#f0a500",
          tier: "tier-1",
          spinNumber: 1,
          timestamp: Date.now()
        }];
      })
    });
    const warnings: string[] = [];
    const Harness = defineComponent({
      setup() {
        provide("gameCtx", context);
        return () => h("div", [
          h(MysteryGridSurface, { ctx: context }),
          h(WheelSessionPanel, { ctx: context }),
          h(WheelHistoryPanel, { ctx: context })
        ]);
      },
    });

    const rendered = renderWithApp(Harness, {
      global: {
        config: {
          warnHandler: (message: string, _instance: unknown, trace: string) => warnings.push(`${message}\n${trace}`)
        }
      }
    });
    warnings.length = 0;

    expect(rendered.container.querySelectorAll("[data-mystery-grid-cell-index]")).toHaveLength(9);
    await fireEvent.click(rendered.container.querySelector("[data-mystery-grid-cell-index=\"0\"]")!);
    await nextTick();

    expect(warnings).toEqual([]);
  });

});
