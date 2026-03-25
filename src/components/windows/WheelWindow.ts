import { inject, nextTick, type PropType } from "vue";
import type { WheelConfig } from "../../types/app.ts";
import { createWindowContextBridge } from "./contextBridge.ts";
import { wheelComputeds } from "./wheelComputeds.ts";
import { wheelConfigMethods } from "./wheelConfigMethods.ts";
import { buildSlotsFromConfig, type WheelSlot } from "./wheelHelpers.ts";
import { wheelSessionMethods } from "./wheelSessionMethods.ts";
import { wheelSpinMethods } from "./wheelSpinMethods.ts";
import "./WheelWindow.css";
import template from "./WheelWindow.html?raw";

// Re-export pure functions so existing imports keep working
export {
    buildSlotsFromConfig,
    createDefaultTier,
    createDefaultWheelConfig,
    createWheelSale,
    easeOutQuart,
    seedToIndex
} from "./wheelHelpers.ts";


export const WheelWindow = {
  name: "WheelWindow",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  data() {
    return {
      editingWheelConfig: null as WheelConfig | null,
      activeWheelSlots: [] as WheelSlot[],
      wheelLastResultColor: "rgb(var(--v-theme-primary))",
      wheelCanvasSize: 360,
      wheelEndingSession: false,
      wheelPresentationMode: false,
      wheelSpinSeed: "" as string,
      wheelSpinHash: "" as string,
      wheelShowSeed: false,
      wheelConfirmDialog: false,
      wheelConfirmAction: "" as "reset" | "apply" | "",
      wheelConfigReady: false,
      wheelChaseDialog: false,
      wheelChaseReplacementSinglesId: null as number | null,
      wheelChasePendingTierId: "" as string,
      wheelSessionCostAdjustment: 0,
      wheelChaseTallyHistory: [] as Array<{ tierId: string; label: string; color: string; count: number }>
    };
  },
  computed: {
    ...wheelComputeds
  },
  watch: {
    activeWheelConfigId(this: Record<string, unknown>) {
      const vm = this as Record<string, unknown> & { loadWheelConfig: () => void };
      vm.loadWheelConfig();
    },
    wheelPresentationMode(this: Record<string, unknown>, presMode: boolean) {
      // Recalculate canvas size for the new mode, then redraw once CSS settles
      nextTick(() => {
        setTimeout(() => {
          const panel = (this.$refs as Record<string, unknown>).wheelSpinnerPanel as HTMLElement | null;
          const max = presMode ? 600 : 360;
          const w = panel ? Math.min(panel.clientWidth, max) : max;
          if (w > 0) {
            (this as Record<string, unknown>).wheelCanvasSize = w;
          }
          nextTick(() => {
            const vm = this as Record<string, unknown> & { drawWheel: (offset?: number) => void };
            vm.drawWheel((this.wheelCurrentAngle as number) || 0);
          });
        }, 60);
      });
    }
  },
  methods: {
    ...wheelConfigMethods,
    ...wheelSpinMethods,
    ...wheelSessionMethods
  },
  mounted(this: Record<string, unknown>) {
    // If wheel configs were loaded from storage, initialize the editing state
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    const activeId = this.activeWheelConfigId as number | null;
    if (configs.length > 0 && activeId != null) {
      const config = configs.find((c) => c.id === activeId);
      if (config) {
        (this as Record<string, unknown>).editingWheelConfig = JSON.parse(JSON.stringify(config)) as WheelConfig;
        (this as Record<string, unknown>).activeWheelSlots = buildSlotsFromConfig(config);
        // Try to restore session state from localStorage, otherwise init fresh
        const restored = (this as Record<string, unknown> & { loadWheelFromSession: () => boolean }).loadWheelFromSession();
        if (!restored) {
          const slots = (this as Record<string, unknown>).activeWheelSlots as WheelSlot[];
          this.wheelSpinCounts = new Array(slots.length).fill(0);
        }
      }
    }

    // Resize canvas for container
    nextTick(() => {
      const panel = (this.$refs as Record<string, unknown>).wheelSpinnerPanel as HTMLElement | null;
      const maxDefault = (this as Record<string, unknown>).wheelPresentationMode ? 600 : 360;
      const availableWidth = panel ? Math.min(panel.clientWidth, maxDefault) : maxDefault;
      if (availableWidth > 0) {
        (this as Record<string, unknown>).wheelCanvasSize = availableWidth;
      }
      const vm = this as Record<string, unknown> & { drawWheel: (offset?: number) => void };
      vm.drawWheel((this as Record<string, unknown>).wheelCurrentAngle as number || 0);
      (this as Record<string, unknown>).wheelConfigReady = true;

      // Watch the spinner panel for size changes (window resize, layout shifts)
      if (panel) {
        const ro = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          const presMode = (this as Record<string, unknown>).wheelPresentationMode as boolean;
          const max = presMode ? 600 : 360;
          const w = Math.min(entry.contentRect.width, max);
          if (w > 0 && w !== (this as Record<string, unknown>).wheelCanvasSize) {
            (this as Record<string, unknown>).wheelCanvasSize = w;
            nextTick(() => vm.drawWheel(((this as Record<string, unknown>).wheelCurrentAngle as number) || 0));
          }
        });
        ro.observe(panel);
        (this as Record<string, unknown>)._wheelResizeObserver = ro;
      }
    });
  },
  beforeUnmount(this: Record<string, unknown>) {
    const ro = (this as Record<string, unknown>)._wheelResizeObserver as ResizeObserver | undefined;
    if (ro) {
      ro.disconnect();
      (this as Record<string, unknown>)._wheelResizeObserver = undefined;
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx) as Record<string, unknown>;
    return createWindowContextBridge(source);
  },
  template
};

