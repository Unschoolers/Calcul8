import { inject, nextTick, type PropType } from "vue";
import type { WheelConfig } from "../../../../types/app.ts";
import { createWindowContextBridge } from "../../contextBridge.ts";
import { wheelComputeds } from "./wheelComputeds.ts";
import { wheelConfigMethods } from "../commands/wheelConfigMethods.ts";
import {
  createWheelWindowState, getWheelController, getWheelWindowLocalKeys,
  type WheelWindowThis
} from "./wheelControllerState.ts";
import { buildSlotsFromConfig } from "../services/wheelHelpers.ts";
import {
  WHEEL_COMPACT_LAYOUT_BREAKPOINT,
  isWheelCompactViewport,
  resolveWheelCanvasTargetSize,
  resolveWheelLayoutMode
} from "./wheelLayoutPolicy.ts";
import { wheelSessionMethods } from "../commands/wheelSessionMethods.ts";
import { wheelSpectatorMethods } from "../commands/wheelSpectatorMethods.ts";
import { wheelSpinMethods } from "../commands/wheelSpinMethods.ts";
import {
  buildMysteryGridCells,
  isMysteryGridConfig,
  mysteryGridMethods
} from "../commands/mysteryGridMethods.ts";

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

const WHEEL_AUTOSPIN_DELAY_MS = 650;
const WHEEL_CANVAS_REFRESH_RETRY_MS = 90;
const WHEEL_CANVAS_REFRESH_MAX_RETRIES = 12;

export const wheelWindowDefinition = {
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
      , wheelConfigSavedSnackbar: false
    };
  },
  computed: {
    ...wheelComputeds,
    wheelIsCompactLayout(this: WheelWindowThis): boolean {
      return resolveWheelLayoutMode(this.wheelViewportWidth as number) === "compact";
    },
    wheelCompactStageSummaryLabel(this: WheelWindowThis): string {
      return this.wheelMode === "live" ? "Margin" : "Margin";
    },
    wheelCompactStageSummaryValue(this: WheelWindowThis): string {
      return this.wheelMode === "live"
        ? (this.wheelSessionMarginDisplay as string)
        : (this.expectedMarginDisplay as string);
    },
    wheelCompactStageSummaryColor(this: WheelWindowThis): string {
      return this.wheelMode === "live"
        ? (this.wheelSessionMarginColor as string)
        : (this.expectedMarginColor as string);
    },
    wheelIsMysteryGrid(this: WheelWindowThis): boolean {
      return isMysteryGridConfig(this.wheelDisplayConfig as WheelConfig | null);
    },
    mysteryGridCells(this: WheelWindowThis) {
      return buildMysteryGridCells(this as unknown as Record<string, unknown>);
    }
  },
  provide(this: WheelWindowThis) {
    return {
      wheelCtx: this
    };
  },
  watch: {
    currentTab(this: WheelWindowThis, nextTab: string) {
      if (nextTab !== "wheel") return;
      this._wheelCanvasRefreshRetryCount = 0;
      this.refreshWheelCanvas();
    },
    wheelConfigs: {
      handler(this: WheelWindowThis) {
        if (this._wheelSkipConfigReload === true) {
          this._wheelSkipConfigReload = false;
          return;
        }
        this.loadWheelConfig();
      },
      deep: true
    },
    activeWheelConfigId(this: WheelWindowThis) {
      this.loadWheelConfig();
      this.ensureWheelEditorState();
    },
    wheelDisplaySlots: {
      handler(this: WheelWindowThis) {
        this.refreshWheelCanvas();
      },
      deep: true
    },
    wheelViewportWidth(this: WheelWindowThis) {
      this.normalizeWheelCompactInspectorState();
    },
    editingWheelConfig: {
      handler(this: WheelWindowThis) {
        this.queueWheelConfigSync();
      },
      deep: true
    },
    wheelPresentationMode(this: WheelWindowThis, presMode: boolean) {
      if (presMode) {
        this.wheelMobileInspectorOpen = false;
      }
      // Recalculate canvas size for the new mode, then redraw once CSS settles
      nextTick(() => {
        setTimeout(() => {
          const panel = (this.$refs as Record<string, unknown>).wheelSpinnerPanel as HTMLElement | null;
          const w = getWheelCanvasTargetSize(panel, presMode);
          if (w > 0) {
            this.wheelCanvasSize = w;
          }
          nextTick(() => {
            this.drawWheel((this.wheelCurrentAngle as number) || 0);
          });
        }, 60);
      });
      if (!presMode) {
        this.normalizeWheelCompactInspectorState();
      }
    },
    wheelSpectatorSessionId(this: WheelWindowThis) {
      this.syncWheelSpectatorCountPolling();
    },
    wheelSpectatorSessionStatus(this: WheelWindowThis) {
      this.syncWheelSpectatorCountPolling();
    }
  },
  methods: {
    ...wheelConfigMethods,
    ...wheelSpinMethods,
    ...wheelSessionMethods,
    ...wheelSpectatorMethods,
    ...mysteryGridMethods,
    showWheelConfigSaved(this: WheelWindowThis) {
      this.wheelConfigSavedSnackbar = true;
      setTimeout(() => {
        this.wheelConfigSavedSnackbar = false;
      }, 1800);
    },
    normalizeWheelCompactInspectorState(this: WheelWindowThis): void {
      const viewportWidth = (this.wheelViewportWidth as number) || getCurrentViewportWidth();
      const isCompact = isWheelCompactViewport(viewportWidth);
      if (!isCompact || this.wheelPresentationMode) {
        this.wheelMobileInspectorOpen = false;
      }
    },
    handleWheelModeChange(this: WheelWindowThis, nextMode: "config" | "live"): void {
      if (nextMode === this.wheelMode) return;
      this.stopWheelAutospin?.();
      if (nextMode === "live") {
        this.wheelRequestedMode = nextMode;
        this.wheelLiveConfirmDialog = true;
        return;
      }
      this.wheelMode = nextMode;
      this.wheelInspectorTab = "config";
    },
    confirmWheelModeChange(this: WheelWindowThis): void {
      const requestedMode = this.wheelRequestedMode as "config" | "live" | null;
      if (requestedMode) {
        if (requestedMode !== "config") {
          this.stopWheelAutospin?.();
        }
        this.wheelMode = requestedMode;
        this.wheelInspectorTab = requestedMode === "live" ? "session" : "config";
      }
      this.wheelRequestedMode = null;
      this.wheelLiveConfirmDialog = false;
    },
    cancelWheelModeChange(this: WheelWindowThis): void {
      this.wheelRequestedMode = null;
      this.wheelLiveConfirmDialog = false;
    },
    isWheelMobileViewport(this: WheelWindowThis): boolean {
      return isWheelCompactViewport((this.wheelViewportWidth as number) || getCurrentViewportWidth());
    },
    openWheelInspector(this: WheelWindowThis, tab: "config" | "session" | "history"): void {
      this.wheelInspectorTab = tab;
      if (this.isWheelMobileViewport()) {
        this.wheelMobileInspectorOpen = true;
        return;
      }
      nextTick(() => {
        const panel = getWheelInspectorScrollTarget((this.$refs as Record<string, unknown>).wheelInspectorPanel);
        panel?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    closeWheelInspector(this: WheelWindowThis): void {
      this.wheelMobileInspectorOpen = false;
      if (this.wheelEndSessionReviewActive) {
        this.wheelEndSessionReviewActive = false;
        nextTick(() => {
          this.wheelConfirmAction = "end";
          this.wheelConfirmDialog = true;
        });
      }
    },
    openWheelManageDialog(this: WheelWindowThis): void {
      const editing = this.editingWheelConfig as WheelConfig | null;
      this.wheelManageName = editing?.name || "";
      this.wheelManageDialog = true;
    },
    closeWheelManageDialog(this: WheelWindowThis): void {
      this.wheelManageDialog = false;
    },
    applyWheelManageDialog(this: WheelWindowThis): void {
      const editing = this.editingWheelConfig as WheelConfig | null;
      if (editing) {
        const nextName = String(this.wheelManageName || "").trim();
        if (nextName) {
          editing.name = nextName;
        }
      }
      this.wheelManageDialog = false;
    },
    ensureWheelEditorState(this: WheelWindowThis): void {
      const activeConfig = this.activeWheelConfig as WheelConfig | null;
      if (!activeConfig) return;

      const controller = getWheelController(this);
      let repaired = false;

      const editing = this.editingWheelConfig as WheelConfig | null;
      if (!editing || editing.id !== activeConfig.id) {
        this.editingWheelConfig =
          JSON.parse(JSON.stringify(activeConfig)) as WheelConfig;
        repaired = true;
      }

      if (!Array.isArray(controller.activeSlots) || controller.activeSlots.length === 0) {
        controller.activeSlots = buildSlotsFromConfig(activeConfig);
        repaired = true;
      }

      if (!Array.isArray(controller.previewSlots) || controller.previewSlots.length === 0) {
        controller.previewSlots = [...controller.activeSlots];
        repaired = true;
      }

      if (
        (!Array.isArray(this.wheelSpinCounts)
          || (this.wheelSpinCounts as number[]).length === 0)
        && controller.activeSlots.length > 0
        && !Number(this.wheelTotalSpins || 0)
      ) {
        this.wheelSpinCounts = new Array(controller.activeSlots.length).fill(0);
        repaired = true;
      }

      if (
        (!Array.isArray(controller.previewSpinCounts) || controller.previewSpinCounts.length === 0)
        && controller.previewSlots.length > 0
        && !Number(controller.previewTotalSpins || 0)
      ) {
        controller.previewSpinCounts = new Array(controller.previewSlots.length).fill(0);
        repaired = true;
      }

      if (repaired) {
        nextTick(() => {
          this.drawWheel((this.wheelCurrentAngle as number) || 0);
        });
      }
    },
    getWindowComponentContext(this: WheelWindowThis): Record<string, unknown> {
      return this;
    },
    focusWheelInspector(this: WheelWindowThis, tab: "config" | "session" | "history"): void {
      this.wheelInspectorTab = tab;
      if (isWheelCompactViewport((this.wheelViewportWidth as number) || getCurrentViewportWidth())) {
        this.wheelMobileInspectorOpen = true;
        return;
      }
      nextTick(() => {
        const panel = getWheelInspectorScrollTarget((this.$refs as Record<string, unknown>).wheelInspectorPanel);
        panel?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    refreshWheelCanvas(this: WheelWindowThis): void {
      this.wheelViewportWidth = getCurrentViewportWidth();
      this.normalizeWheelCompactInspectorState();
      nextTick(() => {
        const retryRefresh = () => {
          const retryCount = Number(this._wheelCanvasRefreshRetryCount || 0);
          if (retryCount >= WHEEL_CANVAS_REFRESH_MAX_RETRIES) return;
          this._wheelCanvasRefreshRetryCount = retryCount + 1;
          if (this._wheelCanvasRefreshTimeoutId != null) {
            window.clearTimeout(this._wheelCanvasRefreshTimeoutId);
          }
          this._wheelCanvasRefreshTimeoutId = window.setTimeout(() => {
            this._wheelCanvasRefreshTimeoutId = undefined;
            this.refreshWheelCanvas();
          }, WHEEL_CANVAS_REFRESH_RETRY_MS);
        };
        const run = () => {
          const panel = (this.$refs as Record<string, unknown>).wheelSpinnerPanel as HTMLElement | null;
          const canvas = (this.$refs as Record<string, unknown>).wheelCanvas as HTMLCanvasElement | null;
          if (this.wheelIsMysteryGrid) {
            this._wheelCanvasRefreshRetryCount = 0;
            if (this._wheelCanvasRefreshTimeoutId != null) {
              window.clearTimeout(this._wheelCanvasRefreshTimeoutId);
              this._wheelCanvasRefreshTimeoutId = undefined;
            }
            return;
          }
          if (!panel || !canvas) {
            retryRefresh();
            return;
          }
          const panelWidth = panel.clientWidth;
          if (panelWidth <= 0 || canvas.offsetParent == null) {
            retryRefresh();
            return;
          }
          this._wheelCanvasRefreshRetryCount = 0;
          if (this._wheelCanvasRefreshTimeoutId != null) {
            window.clearTimeout(this._wheelCanvasRefreshTimeoutId);
            this._wheelCanvasRefreshTimeoutId = undefined;
          }
          const targetWidth = getWheelCanvasTargetSize(
            panel,
            Boolean(this.wheelPresentationMode)
          );
          if (targetWidth > 0) {
            this.wheelCanvasSize = targetWidth;
          }
          nextTick(() => {
            this.drawWheel((this.wheelCurrentAngle as number) || 0);
          });
        };
        window.requestAnimationFrame(run);
      });
    },
    runWheelPrimarySpin(this: WheelWindowThis): void {
      if (this.wheelIsMysteryGrid) {
        this.revealMysteryGridRandomCell(this.wheelMode !== "config");
        return;
      }
      if (this.wheelMode === "config") {
        this.testSpinWheel();
        return;
      }
      this.spinWheel();
    },
    toggleWheelAutospin(this: WheelWindowThis): void {
      if (this.wheelAutospinEnabled) {
        this.stopWheelAutospin();
        return;
      }
      this.startWheelAutospin();
    },
    toggleWheelSound(this: WheelWindowThis): void {
      this.wheelSoundEnabled = !this.wheelSoundEnabled;
    },
    toggleWheelReducedMotion(this: WheelWindowThis): void {
      this.wheelReducedMotion = !this.wheelReducedMotion;
    },
    startWheelAutospin(this: WheelWindowThis): void {
      const slots = ((this.wheelDisplaySlots || []) as unknown[]);
      if (this.wheelMode !== "config" || slots.length === 0) return;
      this.wheelAutospinEnabled = true;
      if (!this.wheelSpinning && !this.wheelChaseDialog) {
        this.scheduleNextWheelAutospin(0);
      }
    },
    stopWheelAutospin(this: WheelWindowThis): void {
      this.wheelAutospinEnabled = false;
      const timeoutId = this._wheelAutospinTimeoutId as number | undefined;
      if (timeoutId != null) {
        clearTimeout(timeoutId);
        this._wheelAutospinTimeoutId = undefined;
      }
    },
    scheduleNextWheelAutospin(this: WheelWindowThis, delayMs = WHEEL_AUTOSPIN_DELAY_MS): void {
      const existingTimeoutId = this._wheelAutospinTimeoutId as number | undefined;
      if (existingTimeoutId != null) {
        clearTimeout(existingTimeoutId);
        this._wheelAutospinTimeoutId = undefined;
      }

      const slots = ((this.wheelDisplaySlots || []) as unknown[]);
      if (!this.wheelAutospinEnabled) return;
      if (this.wheelMode !== "config"
        || this.wheelChaseDialog
        || this.wheelEndingSession
        || slots.length === 0) {
        this.stopWheelAutospin();
        return;
      }

      this._wheelAutospinTimeoutId = globalThis.setTimeout(() => {
        this._wheelAutospinTimeoutId = undefined;
        const currentSlots = ((this.wheelDisplaySlots || []) as unknown[]);
        if (!this.wheelAutospinEnabled) return;
        if (this.wheelMode !== "config"
          || this.wheelChaseDialog
          || currentSlots.length === 0) {
          this.stopWheelAutospin();
          return;
        }
        if (this.wheelSpinning || this.wheelGridRevealAnimating) {
          return;
        }
        if (this.wheelIsMysteryGrid) {
          void this.runMysteryGridAutoPreviewAnimation();
          return;
        }
        void this.runWheelAutoPreviewAnimation();
      }, Math.max(0, delayMs)) as unknown as number;
    },
    triggerWheelCelebration(this: WheelWindowThis, payload: { label: string; color: string; image?: string; emoji?: string; preview?: boolean }): void {
      const timeoutId = this._wheelCelebrationTimeoutId as number | undefined;
      if (timeoutId != null) {
        clearTimeout(timeoutId);
      }
      this.wheelCelebrationLabel = payload.label;
      this.wheelCelebrationColor = payload.color;
      this.wheelCelebrationImage = payload.image || "";
      this.wheelCelebrationEmoji = payload.emoji || "";
      this.wheelCelebrationPreview = payload.preview === true;
      this.wheelCelebrationNonce = ((this.wheelCelebrationNonce as number) || 0) + 1;
      this.wheelCelebrationVisible = false;
      nextTick(() => {
        this.wheelCelebrationVisible = true;
        this._wheelCelebrationTimeoutId = window.setTimeout(() => {
          this.wheelCelebrationVisible = false;
          this._wheelCelebrationTimeoutId = undefined;
        }, 3200);
      });
    }
  },
  mounted(this: WheelWindowThis) {
    const configs = (this.wheelConfigs || []) as WheelConfig[];
    if (configs.length > 0 && (this.activeWheelConfigId as number | null) != null) {
      this.loadWheelConfig();
      this.ensureWheelEditorState();
    }

    // Resize canvas for container
    nextTick(() => {
      this.wheelViewportWidth = getCurrentViewportWidth();
      this.normalizeWheelCompactInspectorState();
      const panel = (this.$refs as Record<string, unknown>).wheelSpinnerPanel as HTMLElement | null;
      const availableWidth = getWheelCanvasTargetSize(
        panel,
        Boolean(this.wheelPresentationMode)
      );
      if (availableWidth > 0) {
        this.wheelCanvasSize = availableWidth;
      }
      this.drawWheel(this.wheelCurrentAngle || 0);
      this.wheelConfigReady = true;
      if (this.currentTab === "wheel") {
        this.refreshWheelCanvas();
      }
      this.syncWheelSpectatorCountPolling();

      // Watch the spinner panel for size changes (window resize, layout shifts)
      if (panel) {
        const ro = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          const presMode = this.wheelPresentationMode as boolean;
          const panelWidth = panel?.clientWidth ?? entry.contentRect.width;
          const w = Math.min(
            getWheelCanvasTargetSize(
              { clientWidth: panelWidth } as HTMLElement,
              presMode
            ),
            entry.contentRect.width
          );
          if (w > 0 && w !== this.wheelCanvasSize) {
            this.wheelCanvasSize = w;
            nextTick(() => this.drawWheel(this.wheelCurrentAngle || 0));
          }
        });
        ro.observe(panel);
        this._wheelResizeObserver = ro;
      }

      const handleViewportResize = () => {
        this.wheelViewportWidth = getCurrentViewportWidth();
        this.normalizeWheelCompactInspectorState();
      };
      window.addEventListener("resize", handleViewportResize);
      this._wheelViewportResizeHandler = handleViewportResize;
    });
  },
  beforeUnmount(this: WheelWindowThis) {
    const ro = this._wheelResizeObserver as ResizeObserver | undefined;
    if (ro) {
      ro.disconnect();
      this._wheelResizeObserver = undefined;
    }
    const resizeHandler = this._wheelViewportResizeHandler as (() => void) | undefined;
    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
      this._wheelViewportResizeHandler = undefined;
    }
    const celebrationTimeoutId = this._wheelCelebrationTimeoutId as number | undefined;
    if (celebrationTimeoutId != null) {
      clearTimeout(celebrationTimeoutId);
      this._wheelCelebrationTimeoutId = undefined;
    }
    const highlightTimeoutId = this._wheelHighlightTimeoutId as number | undefined;
    if (highlightTimeoutId != null) {
      clearTimeout(highlightTimeoutId);
      this._wheelHighlightTimeoutId = undefined;
    }
    const autospinTimeoutId = this._wheelAutospinTimeoutId as number | undefined;
    if (autospinTimeoutId != null) {
      clearTimeout(autospinTimeoutId);
      this._wheelAutospinTimeoutId = undefined;
    }
    const draftTimeoutId = this._wheelDraftSaveTimeoutId as number | undefined;
    if (draftTimeoutId != null) {
      clearTimeout(draftTimeoutId);
      this._wheelDraftSaveTimeoutId = undefined;
    }
    const canvasRefreshTimeoutId = this._wheelCanvasRefreshTimeoutId as number | undefined;
    if (canvasRefreshTimeoutId != null) {
      clearTimeout(canvasRefreshTimeoutId);
      this._wheelCanvasRefreshTimeoutId = undefined;
    }
    this.stopWheelSpectatorCountPolling();
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx) as Record<string, unknown>;
    return createWindowContextBridge(source, {
      blockedKeys: getWheelWindowLocalKeys()
    });
  }
};
