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

function getWheelCanvasTargetSize(panel: HTMLElement | null, presentationMode: boolean): number {
  const maxSize = presentationMode ? 720 : 520;
  if (!panel) return maxSize;

  // Leave room for the pointer, shadows, and small-screen padding so the wheel
  // does not get clipped against the viewport edge on mobile.
  const horizontalInset = presentationMode ? 40 : 28;
  const availableWidth = Math.max(220, panel.clientWidth - horizontalInset);
  return Math.min(availableWidth, maxSize);
}


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
      appliedWheelConfigSnapshot: null as WheelConfig | null,
      activeWheelSlots: [] as WheelSlot[],
      wheelPreviewSlots: [] as WheelSlot[],
      wheelMode: "config" as "config" | "live",
      wheelCelebrationVisible: false,
      wheelCelebrationLabel: "" as string,
      wheelCelebrationColor: "#f0a500",
      wheelCelebrationImage: "" as string,
      wheelCelebrationPreview: false,
      wheelCelebrationNonce: 0,
      wheelInventoryWarning: "" as string,
      wheelLastResultColor: "rgb(var(--v-theme-primary))",
      wheelCanvasSize: 360,
      wheelEndingSession: false,
      wheelPresentationMode: false,
      wheelPreviewSpinCounts: [] as number[],
      wheelPreviewTotalSpins: 0,
      wheelSpinSeed: "" as string,
      wheelSpinHash: "" as string,
      wheelShowSeed: false,
      wheelConfirmDialog: false,
      wheelConfirmAction: "" as "reset" | "apply" | "",
      wheelLiveConfirmDialog: false,
      wheelRequestedMode: null as "config" | "live" | null,
      wheelPendingMenuOpen: false,
      wheelConfigReady: false,
      wheelChaseDialog: false,
      wheelChasePreviewMode: false,
      wheelChaseReplacementSinglesId: null as number | null,
      wheelChasePendingTierId: "" as string,
      wheelFairnessHistoryOpen: false,
      wheelSessionCostAdjustment: 0,
      wheelPreviewFairnessHistory: [] as Array<{
        spinNumber: number;
        label: string;
        color: string;
        hash: string;
        seed: string;
        timestamp: number;
      }>,
      wheelFairnessHistory: [] as Array<{
        spinNumber: number;
        label: string;
        color: string;
        hash: string;
        seed: string;
        timestamp: number;
      }>,
      wheelPreviewChaseTallyHistory: [] as Array<{ tierId: string; label: string; color: string; count: number }>,
      wheelChaseTallyHistory: [] as Array<{ tierId: string; label: string; color: string; count: number }>,
      wheelHighlightedSlotIndex: -1
    };
  },
  computed: {
    ...wheelComputeds
  },
  watch: {
    currentTab(this: Record<string, unknown>, nextTab: string) {
      if (nextTab !== "wheel") return;
      const vm = this as Record<string, unknown> & { refreshWheelCanvas: () => void };
      vm.refreshWheelCanvas();
    },
    wheelConfigs: {
      handler(this: Record<string, unknown>) {
        if ((this as Record<string, unknown>)._wheelSkipConfigReload === true) {
          (this as Record<string, unknown>)._wheelSkipConfigReload = false;
          return;
        }
        const vm = this as Record<string, unknown> & { loadWheelConfig: () => void };
        vm.loadWheelConfig();
      },
      deep: true
    },
    activeWheelConfigId(this: Record<string, unknown>) {
      const vm = this as Record<string, unknown> & { loadWheelConfig: () => void };
      vm.loadWheelConfig();
    },
    wheelDisplaySlots: {
      handler(this: Record<string, unknown>) {
        const vm = this as Record<string, unknown> & { refreshWheelCanvas: () => void };
        vm.refreshWheelCanvas();
      },
      deep: true
    },
    editingWheelConfig: {
      handler(this: Record<string, unknown>) {
        const vm = this as Record<string, unknown> & { queueWheelDraftAutosave: () => void };
        vm.queueWheelDraftAutosave();
      },
      deep: true
    },
    wheelPresentationMode(this: Record<string, unknown>, presMode: boolean) {
      // Recalculate canvas size for the new mode, then redraw once CSS settles
      nextTick(() => {
        setTimeout(() => {
          const panel = (this.$refs as Record<string, unknown>).wheelSpinnerPanel as HTMLElement | null;
          const w = getWheelCanvasTargetSize(panel, presMode);
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
    ...wheelSessionMethods,
    handleWheelModeChange(this: Record<string, unknown>, nextMode: "config" | "live"): void {
      if (nextMode === (this as Record<string, unknown>).wheelMode) return;
      if (nextMode === "live") {
        (this as Record<string, unknown>).wheelRequestedMode = nextMode;
        (this as Record<string, unknown>).wheelLiveConfirmDialog = true;
        return;
      }
      (this as Record<string, unknown>).wheelMode = nextMode;
    },
    confirmWheelModeChange(this: Record<string, unknown>): void {
      const requestedMode = (this as Record<string, unknown>).wheelRequestedMode as "config" | "live" | null;
      if (requestedMode) {
        (this as Record<string, unknown>).wheelMode = requestedMode;
      }
      (this as Record<string, unknown>).wheelRequestedMode = null;
      (this as Record<string, unknown>).wheelLiveConfirmDialog = false;
    },
    cancelWheelModeChange(this: Record<string, unknown>): void {
      (this as Record<string, unknown>).wheelRequestedMode = null;
      (this as Record<string, unknown>).wheelLiveConfirmDialog = false;
    },
    refreshWheelCanvas(this: Record<string, unknown>): void {
      nextTick(() => {
        const run = () => {
          const panel = (this.$refs as Record<string, unknown>).wheelSpinnerPanel as HTMLElement | null;
          const canvas = (this.$refs as Record<string, unknown>).wheelCanvas as HTMLCanvasElement | null;
          if (!panel || !canvas) return;
          const panelWidth = panel.clientWidth;
          if (panelWidth <= 0 || canvas.offsetParent == null) {
            window.setTimeout(() => {
              const vm = this as Record<string, unknown> & { refreshWheelCanvas: () => void };
              vm.refreshWheelCanvas();
            }, 90);
            return;
          }
          const targetWidth = getWheelCanvasTargetSize(
            panel,
            Boolean((this as Record<string, unknown>).wheelPresentationMode)
          );
          if (targetWidth > 0) {
            (this as Record<string, unknown>).wheelCanvasSize = targetWidth;
          }
          nextTick(() => {
            const vm = this as Record<string, unknown> & { drawWheel: (offset?: number) => void };
            vm.drawWheel(((this as Record<string, unknown>).wheelCurrentAngle as number) || 0);
          });
        };
        window.requestAnimationFrame(run);
      });
    },
    runWheelPrimarySpin(this: Record<string, unknown>): void {
      if ((this as Record<string, unknown>).wheelMode === "config") {
        ((this as Record<string, unknown>) as Record<string, unknown> & { testSpinWheel: () => void }).testSpinWheel();
        return;
      }
      ((this as Record<string, unknown>) as Record<string, unknown> & { spinWheel: () => void }).spinWheel();
    },
    triggerWheelCelebration(this: Record<string, unknown>, payload: { label: string; color: string; image?: string; preview?: boolean }): void {
      const timeoutId = (this as Record<string, unknown>)._wheelCelebrationTimeoutId as number | undefined;
      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
      (this as Record<string, unknown>).wheelCelebrationLabel = payload.label;
      (this as Record<string, unknown>).wheelCelebrationColor = payload.color;
      (this as Record<string, unknown>).wheelCelebrationImage = payload.image || "";
      (this as Record<string, unknown>).wheelCelebrationPreview = payload.preview === true;
      (this as Record<string, unknown>).wheelCelebrationNonce = (((this as Record<string, unknown>).wheelCelebrationNonce as number) || 0) + 1;
      (this as Record<string, unknown>).wheelCelebrationVisible = false;
      nextTick(() => {
        (this as Record<string, unknown>).wheelCelebrationVisible = true;
        (this as Record<string, unknown>)._wheelCelebrationTimeoutId = window.setTimeout(() => {
          (this as Record<string, unknown>).wheelCelebrationVisible = false;
          (this as Record<string, unknown>)._wheelCelebrationTimeoutId = undefined;
        }, 3200);
      });
    }
  },
  mounted(this: Record<string, unknown>) {
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    if (configs.length > 0 && (this.activeWheelConfigId as number | null) != null) {
      (this as Record<string, unknown> & { loadWheelConfig: () => void }).loadWheelConfig();
    }

    // Resize canvas for container
    nextTick(() => {
      const panel = (this.$refs as Record<string, unknown>).wheelSpinnerPanel as HTMLElement | null;
      const availableWidth = getWheelCanvasTargetSize(
        panel,
        Boolean((this as Record<string, unknown>).wheelPresentationMode)
      );
      if (availableWidth > 0) {
        (this as Record<string, unknown>).wheelCanvasSize = availableWidth;
      }
      const vm = this as Record<string, unknown> & { drawWheel: (offset?: number) => void };
      vm.drawWheel((this as Record<string, unknown>).wheelCurrentAngle as number || 0);
      (this as Record<string, unknown>).wheelConfigReady = true;
      if ((this as Record<string, unknown>).currentTab === "wheel") {
        const refreshVm = this as Record<string, unknown> & { refreshWheelCanvas: () => void };
        refreshVm.refreshWheelCanvas();
      }

      // Watch the spinner panel for size changes (window resize, layout shifts)
      if (panel) {
        const ro = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          const presMode = (this as Record<string, unknown>).wheelPresentationMode as boolean;
          const panelWidth = panel?.clientWidth ?? entry.contentRect.width;
          const w = Math.min(
            getWheelCanvasTargetSize(
              { clientWidth: panelWidth } as HTMLElement,
              presMode
            ),
            entry.contentRect.width
          );
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
    const celebrationTimeoutId = (this as Record<string, unknown>)._wheelCelebrationTimeoutId as number | undefined;
    if (celebrationTimeoutId != null) {
      clearTimeout(celebrationTimeoutId);
      (this as Record<string, unknown>)._wheelCelebrationTimeoutId = undefined;
    }
    const highlightTimeoutId = (this as Record<string, unknown>)._wheelHighlightTimeoutId as number | undefined;
    if (highlightTimeoutId != null) {
      clearTimeout(highlightTimeoutId);
      (this as Record<string, unknown>)._wheelHighlightTimeoutId = undefined;
    }
    const draftTimeoutId = (this as Record<string, unknown>)._wheelDraftSaveTimeoutId as number | undefined;
    if (draftTimeoutId != null) {
      clearTimeout(draftTimeoutId);
      (this as Record<string, unknown>)._wheelDraftSaveTimeoutId = undefined;
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx) as Record<string, unknown>;
    return createWindowContextBridge(source);
  },
  template
};

