import { fireEvent, screen } from "@testing-library/vue";
import { expect, test, vi } from "vitest";
import { defineComponent, provide, reactive } from "vue";
import { appOptions } from "../../src/app.ts";
import { appMethods } from "../../src/app-core/methods/index.ts";
import { createInitialState } from "../../src/app-core/state.ts";
import {
  beginShopifyBindingsRequest,
  isCurrentShopifyBindingsRequest,
  resetIntegrationScopeState
} from "../../src/app-core/feature-state/integration-state.ts";
import { featureStatePortsKey, useFeatureStatePorts, type FeatureStatePorts } from "../../src/app-core/feature-state/feature-state-ports.ts";
import { resetActiveSales } from "../../src/app-core/feature-state/sales-state.ts";
import { getWheelController, resetGameSessionOwner } from "../../src/components/windows/game/services/gameSessionState.ts";
import { renderWithApp } from "./render.ts";

test("mounted sales state aliases share one reactive owner and reset with chart disposal", async () => {
  const state = reactive(createInitialState());
  const destroy = vi.fn();
  state.salesChart = { destroy } as never;
  const Harness = defineComponent({
    setup() {
      return { state };
    },
    template: `
      <button aria-label="record sale" @click="recordSale()">record</button>
      <button aria-label="reset sales" @click="reset()">reset</button>
    `,
    methods: {
      recordSale() {
        this.state.sales.push({ id: "sale-1" } as never);
      },
      reset() {
        resetActiveSales(this.state);
      }
    }
  });

  renderWithApp(Harness);
  await fireEvent.click(screen.getByRole("button", { name: "record sale" }));
  expect(state.sales).toHaveLength(1);
  expect(state.salesFeatureState?.sales).toBe(state.sales);
  await fireEvent.click(screen.getByRole("button", { name: "reset sales" }));
  expect(state.sales).toEqual([]);
  expect(state.salesFeatureState?.sales).toBe(state.sales);
  expect(state.salesChart).toBeNull();
  expect(destroy).toHaveBeenCalledOnce();
});

test("mounted Whatnot scope reset clears transient integration state through its owner", async () => {
  const state = reactive(createInitialState());
  state.whatnotCsvRawInput = "pending csv";
  state.whatnotCsvRows = [["sale"]];
  state.whatnotReviewBatchId = "batch-1";
  state.showWhatnotReviewDialog = true;
  const request = {};
  beginShopifyBindingsRequest(state, request);
  const Harness = defineComponent({
    setup() {
      return { state };
    },
    template: `<button aria-label="change scope" @click="resetScope()">change</button>`,
    methods: {
      resetScope() {
        resetIntegrationScopeState(this.state);
      }
    }
  });

  renderWithApp(Harness);
  await fireEvent.click(screen.getByRole("button", { name: "change scope" }));
  expect(state.integrationFeatureState?.whatnotCsvRawInput).toBe("");
  expect(state.whatnotCsvRows).toEqual([]);
  expect(state.whatnotReviewBatchId).toBeNull();
  expect(state.showWhatnotReviewDialog).toBe(false);
  expect(isCurrentShopifyBindingsRequest(state, request)).toBe(false);
});

test("the composition root injects feature owners and mounted writes stay shared with compatibility fields", async () => {
  const state = reactive(createInitialState());
  Object.assign(state, appMethods);
  const injected = appOptions.provide.call(state as never);
  const featureStatePorts = injected[featureStatePortsKey] as FeatureStatePorts;
  const Child = defineComponent({
    setup() {
      const owners = useFeatureStatePorts();
      return { salesOwner: owners.sales, gameSessionOwner: owners.gameSession };
    },
    template: `
      <button aria-label="record through owner" @click="recordSale()">record</button>
      <button aria-label="update game owner" @click="recordSpin()">spin</button>
    `,
    methods: {
      recordSale() {
        this.salesOwner.sales.push({ id: 999 } as never);
      },
      recordSpin() {
        this.gameSessionOwner.wheelTotalSpins = 4;
      }
    }
  });
  const Harness = defineComponent({
    components: { Child },
    setup() {
      provide(featureStatePortsKey, featureStatePorts);
      return { state };
    },
    template: `<Child />`
  });

  renderWithApp(Harness);
  await fireEvent.click(screen.getByRole("button", { name: "record through owner" }));
  await fireEvent.click(screen.getByRole("button", { name: "update game owner" }));
  expect(state.sales.map((sale) => sale.id)).toEqual([999]);
  expect(state.wheelTotalSpins).toBe(4);
  expect(state.salesFeatureState?.sales).toBe(state.sales);
  expect(featureStatePorts.integrations).toBe(state.integrationFeatureState);
  expect(featureStatePorts.gameSession).toBe(state.gameSessionFeatureState);
});

test("mounted production game resets operate on the injected owner and preserve preview/live isolation", async () => {
  const state = reactive(createInitialState());
  const owner = state.gameSessionFeatureState!;
  const events: string[] = [];
  const Harness = defineComponent({
    setup() {
      return { state };
    },
    template: `
      <button aria-label="reset preview" @click="resetPreview()">preview</button>
      <button aria-label="reset live" @click="resetLive()">live</button>
    `,
    methods: {
      resetPreview() {
        return resetGameSessionOwner(this.state as never, "preview", [], {
          persist: () => { events.push("persist:preview"); },
          publish: () => { events.push("publish:preview"); }
        }, false);
      },
      resetLive() {
        return resetGameSessionOwner(this.state as never, "live", [], {
          persist: () => { events.push("persist:live"); },
          publish: () => { events.push("publish:live"); }
        }, false);
      }
    }
  });

  owner.wheelTotalSpins = 7;
  owner.wheelSpinCounts = [7];
  owner.wheelPreviewTotalSpins = 3;
  owner.wheelPreviewSpinCounts = [3];
  renderWithApp(Harness);

  await fireEvent.click(screen.getByRole("button", { name: "reset preview" }));
  expect(getWheelController(state)).toBe(owner);
  expect(state.wheelPreviewTotalSpins).toBe(0);
  expect(state.wheelPreviewSpinCounts).toEqual([]);
  expect(state.wheelTotalSpins).toBe(7);
  expect(state.gameSessionFeatureState?.wheelTotalSpins).toBe(7);
  expect(events).toEqual(["persist:preview"]);

  await fireEvent.click(screen.getByRole("button", { name: "reset live" }));
  expect(state.wheelTotalSpins).toBe(0);
  expect(state.gameSessionFeatureState?.wheelTotalSpins).toBe(0);
  expect(state.wheelSpinCounts).toEqual([]);
  expect(events).toEqual(["persist:preview", "persist:live", "publish:live"]);
});
