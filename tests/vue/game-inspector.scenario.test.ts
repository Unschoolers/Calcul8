import { fireEvent, screen } from "@testing-library/vue";
import { describe, expect, test, vi } from "vitest";
import { defineComponent, h, nextTick, provide, reactive } from "vue";
import WheelInspector from "../../src/components/windows/game/inspector/WheelInspector.vue";
import WheelSessionPanel from "../../src/components/windows/game/inspector/WheelSessionPanel.vue";
import { createWheelControllerState } from "../../src/components/windows/game/services/gameSessionState.ts";
import MysteryGridSurface from "../../src/components/windows/game/stage/MysteryGridSurface.vue";
import { renderWithApp } from "./render.ts";

describe("game inspector scenarios", () => {
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

  test("clicking a Mystery Grid tile does not emit a WheelSessionPanel render warning", async () => {
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
          h(WheelSessionPanel, { ctx: context })
        ]);
      },
    });

    const rendered = renderWithApp(Harness, {
      global: {
        config: {
          warnHandler: (message: string) => warnings.push(message)
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