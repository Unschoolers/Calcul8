import { inject, nextTick, type PropType } from "vue";
import type { WheelConfig } from "../../types/app.ts";
import { createWindowContextBridge } from "./contextBridge.ts";
import { wheelComputeds } from "./wheelComputeds.ts";
import { wheelConfigMethods } from "./wheelConfigMethods.ts";
import type { WheelSlot } from "./wheelHelpers.ts";
import { wheelSessionMethods } from "./wheelSessionMethods.ts";
import { wheelSpinMethods } from "./wheelSpinMethods.ts";
import { createWheelWindowState, getWheelWindowLocalKeys } from "./wheelControllerState.ts";
import {
  WHEEL_COMPACT_LAYOUT_BREAKPOINT,
  isWheelCompactViewport,
  resolveWheelCanvasTargetSize,
  resolveWheelLayoutMode
} from "./wheelLayoutPolicy.ts";

function getWheelCanvasTargetSize(panel: HTMLElement | null, presentationMode: boolean): number {
  return resolveWheelCanvasTargetSize({
    panelWidth: panel?.clientWidth,
    viewportWidth: typeof window !== "undefined" ? window.innerWidth : null,
    viewportHeight: typeof window !== "undefined" ? window.innerHeight : null,
    presentationMode
  });
}

function getWheelInspectorScrollTarget(source: unknown): { scrollIntoView: (options?: ScrollIntoViewOptions) => void } | null {
  if (source && typeof source === "object") {
    const directTarget = source as {
      scrollIntoView?: ((options?: ScrollIntoViewOptions) => void) | unknown;
      $el?: unknown;
    };
    if (typeof directTarget.scrollIntoView === "function") {
      return directTarget as { scrollIntoView: (options?: ScrollIntoViewOptions) => void };
    }
    if (directTarget.$el && typeof (directTarget.$el as { scrollIntoView?: unknown }).scrollIntoView === "function") {
      return directTarget.$el as { scrollIntoView: (options?: ScrollIntoViewOptions) => void };
    }
  }
  return null;
}

function getCurrentViewportWidth(): number {
  return typeof window !== "undefined" ? window.innerWidth : WHEEL_COMPACT_LAYOUT_BREAKPOINT + 1;
}

export const wheelWindowDefinition: any = {
  name: "WheelWindow",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  data() {
    return {
      ...createWheelWindowState(),
      wheelViewportWidth: getCurrentViewportWidth()
    };
  },
  computed: {
    ...wheelComputeds,
    wheelIsCompactLayout(this: Record<string, unknown>): boolean {
      return resolveWheelLayoutMode((this as Record<string, unknown>).wheelViewportWidth as number) === "compact";
    },
    wheelCompactStageSummaryLabel(this: Record<string, unknown>): string {
      return (this as Record<string, unknown>).wheelMode === "live" ? "Margin" : "Margin";
    },
    wheelCompactStageSummaryValue(this: Record<string, unknown>): string {
      return (this as Record<string, unknown>).wheelMode === "live"
        ? ((this as Record<string, unknown>).wheelSessionMarginDisplay as string)
        : ((this as Record<string, unknown>).expectedMarginDisplay as string);
    },
    wheelCompactStageSummaryColor(this: Record<string, unknown>): string {
      return (this as Record<string, unknown>).wheelMode === "live"
        ? ((this as Record<string, unknown>).wheelSessionMarginColor as string)
        : ((this as Record<string, unknown>).expectedMarginColor as string);
    }
  },
  provide(this: Record<string, unknown>) {
    return {
      wheelCtx: this
    };
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
    wheelViewportWidth(this: Record<string, unknown>) {
      const vm = this as Record<string, unknown> & { normalizeWheelCompactInspectorState: () => void };
      vm.normalizeWheelCompactInspectorState();
    },
    editingWheelConfig: {
      handler(this: Record<string, unknown>) {
        const vm = this as Record<string, unknown> & { queueWheelDraftAutosave: () => void };
        vm.queueWheelDraftAutosave();
      },
      deep: true
    },
    wheelPresentationMode(this: Record<string, unknown>, presMode: boolean) {
      if (presMode) {
        (this as Record<string, unknown>).wheelMobileInspectorOpen = false;
      }
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
      if (!presMode) {
        const vm = this as Record<string, unknown> & { normalizeWheelCompactInspectorState: () => void };
        vm.normalizeWheelCompactInspectorState();
      }
    }
  },
  methods: {
    ...wheelConfigMethods,
    ...wheelSpinMethods,
    ...wheelSessionMethods,
    normalizeWheelCompactInspectorState(this: Record<string, unknown>): void {
      const viewportWidth = ((this as Record<string, unknown>).wheelViewportWidth as number) || getCurrentViewportWidth();
      const isCompact = isWheelCompactViewport(viewportWidth);
      if (!isCompact || (this as Record<string, unknown>).wheelPresentationMode) {
        (this as Record<string, unknown>).wheelMobileInspectorOpen = false;
      }
    },
    handleWheelModeChange(this: Record<string, unknown>, nextMode: "config" | "live"): void {
      if (nextMode === (this as Record<string, unknown>).wheelMode) return;
      if (nextMode === "live") {
        (this as Record<string, unknown>).wheelRequestedMode = nextMode;
        (this as Record<string, unknown>).wheelLiveConfirmDialog = true;
        return;
      }
      (this as Record<string, unknown>).wheelMode = nextMode;
      (this as Record<string, unknown>).wheelInspectorTab = "config";
    },
    confirmWheelModeChange(this: Record<string, unknown>): void {
      const requestedMode = (this as Record<string, unknown>).wheelRequestedMode as "config" | "live" | null;
      if (requestedMode) {
        (this as Record<string, unknown>).wheelMode = requestedMode;
        (this as Record<string, unknown>).wheelInspectorTab = requestedMode === "live" ? "session" : "config";
      }
      (this as Record<string, unknown>).wheelRequestedMode = null;
      (this as Record<string, unknown>).wheelLiveConfirmDialog = false;
    },
    cancelWheelModeChange(this: Record<string, unknown>): void {
      (this as Record<string, unknown>).wheelRequestedMode = null;
      (this as Record<string, unknown>).wheelLiveConfirmDialog = false;
    },
    isWheelMobileViewport(): boolean {
      return isWheelCompactViewport(((this as Record<string, unknown>).wheelViewportWidth as number) || getCurrentViewportWidth());
    },
    openWheelInspector(this: Record<string, unknown>, tab: "config" | "session" | "history"): void {
      (this as Record<string, unknown>).wheelInspectorTab = tab;
      if (((this as Record<string, unknown>) as Record<string, unknown> & { isWheelMobileViewport: () => boolean }).isWheelMobileViewport()) {
        (this as Record<string, unknown>).wheelMobileInspectorOpen = true;
        return;
      }
      nextTick(() => {
        const panel = getWheelInspectorScrollTarget((this.$refs as Record<string, unknown>).wheelInspectorPanel);
        panel?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    closeWheelInspector(this: Record<string, unknown>): void {
      (this as Record<string, unknown>).wheelMobileInspectorOpen = false;
      if ((this as Record<string, unknown>).wheelEndSessionReviewActive) {
        (this as Record<string, unknown>).wheelEndSessionReviewActive = false;
        nextTick(() => {
          (this as Record<string, unknown>).wheelConfirmAction = "end";
          (this as Record<string, unknown>).wheelConfirmDialog = true;
        });
      }
    },
    openWheelManageDialog(this: Record<string, unknown>): void {
      const editing = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
      (this as Record<string, unknown>).wheelManageName = editing?.name || "";
      (this as Record<string, unknown>).wheelManageDialog = true;
    },
    closeWheelManageDialog(this: Record<string, unknown>): void {
      (this as Record<string, unknown>).wheelManageDialog = false;
    },
    applyWheelManageDialog(this: Record<string, unknown>): void {
      const editing = (this as Record<string, unknown>).editingWheelConfig as WheelConfig | null;
      if (editing) {
        const nextName = String((this as Record<string, unknown>).wheelManageName || "").trim();
        if (nextName) {
          editing.name = nextName;
        }
      }
      (this as Record<string, unknown>).wheelManageDialog = false;
    },
    getWindowComponentContext(this: Record<string, unknown>): Record<string, unknown> {
      return this as Record<string, unknown>;
    },
    focusWheelInspector(this: Record<string, unknown>, tab: "config" | "session" | "history"): void {
      (this as Record<string, unknown>).wheelInspectorTab = tab;
      if (isWheelCompactViewport(((this as Record<string, unknown>).wheelViewportWidth as number) || getCurrentViewportWidth())) {
        (this as Record<string, unknown>).wheelMobileInspectorOpen = true;
        return;
      }
      nextTick(() => {
        const panel = getWheelInspectorScrollTarget((this.$refs as Record<string, unknown>).wheelInspectorPanel);
        panel?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    refreshWheelCanvas(this: Record<string, unknown>): void {
      (this as Record<string, unknown>).wheelViewportWidth = getCurrentViewportWidth();
      const vm = this as Record<string, unknown> & { normalizeWheelCompactInspectorState: () => void };
      vm.normalizeWheelCompactInspectorState();
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
    triggerWheelCelebration(this: Record<string, unknown>, payload: { label: string; color: string; image?: string; emoji?: string; preview?: boolean }): void {
      const timeoutId = (this as Record<string, unknown>)._wheelCelebrationTimeoutId as number | undefined;
      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
      (this as Record<string, unknown>).wheelCelebrationLabel = payload.label;
      (this as Record<string, unknown>).wheelCelebrationColor = payload.color;
      (this as Record<string, unknown>).wheelCelebrationImage = payload.image || "";
      (this as Record<string, unknown>).wheelCelebrationEmoji = payload.emoji || "";
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
      (this as Record<string, unknown>).wheelViewportWidth = getCurrentViewportWidth();
      const normalizeVm = this as Record<string, unknown> & { normalizeWheelCompactInspectorState: () => void };
      normalizeVm.normalizeWheelCompactInspectorState();
      const panel = (this.$refs as Record<string, unknown>).wheelSpinnerPanel as HTMLElement | null;
      const availableWidth = getWheelCanvasTargetSize(
        panel,
        Boolean((this as Record<string, unknown>).wheelPresentationMode)
      );
      if (availableWidth > 0) {
        (this as Record<string, unknown>).wheelCanvasSize = availableWidth;
      }
      const drawVm = this as Record<string, unknown> & { drawWheel: (offset?: number) => void };
      drawVm.drawWheel((this as Record<string, unknown>).wheelCurrentAngle as number || 0);
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
            nextTick(() => drawVm.drawWheel(((this as Record<string, unknown>).wheelCurrentAngle as number) || 0));
          }
        });
        ro.observe(panel);
        (this as Record<string, unknown>)._wheelResizeObserver = ro;
      }

      const handleViewportResize = () => {
        (this as Record<string, unknown>).wheelViewportWidth = getCurrentViewportWidth();
        const resizeVm = this as Record<string, unknown> & { normalizeWheelCompactInspectorState: () => void };
        resizeVm.normalizeWheelCompactInspectorState();
      };
      window.addEventListener("resize", handleViewportResize);
      (this as Record<string, unknown>)._wheelViewportResizeHandler = handleViewportResize;
    });
  },
  beforeUnmount(this: Record<string, unknown>) {
    const ro = (this as Record<string, unknown>)._wheelResizeObserver as ResizeObserver | undefined;
    if (ro) {
      ro.disconnect();
      (this as Record<string, unknown>)._wheelResizeObserver = undefined;
    }
    const resizeHandler = (this as Record<string, unknown>)._wheelViewportResizeHandler as (() => void) | undefined;
    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
      (this as Record<string, unknown>)._wheelViewportResizeHandler = undefined;
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
    return createWindowContextBridge(source, {
      blockedKeys: getWheelWindowLocalKeys()
    });
  }
};
