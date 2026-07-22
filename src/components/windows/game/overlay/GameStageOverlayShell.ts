import { defineComponent, type PropType } from "vue";

import { createGameStageOverlayController } from "./gameStageOverlayController.ts";
import { createGameStageOverlayScene } from "./gameStageOverlayScene.ts";
import type { GameStageOverlayCommand } from "./gameStageOverlayTypes.ts";

type GameStageOverlayControllerHandle = ReturnType<typeof createGameStageOverlayController>;

export const GameStageOverlayShell = defineComponent({
  name: "GameStageOverlayShell",
  props: {
    enabled: {
      type: Boolean,
      required: true
    },
    command: {
      type: Object as PropType<GameStageOverlayCommand | null>,
      default: null
    }
  },
  emits: ["mounted-change"],
  data() {
    return {
      overlayController: null as GameStageOverlayControllerHandle | null,
      overlayMounted: false
    };
  },
  watch: {
    enabled(enabled: boolean) {
      if (enabled) {
        this.ensureOverlayMounted();
        return;
      }
      this.teardownOverlay();
    },
    command(command: GameStageOverlayCommand | null) {
      if (!command) {
        return;
      }
      if (!this.overlayController) {
        if (this.enabled) {
          this.ensureOverlayMounted();
        }
        return;
      }
      this.overlayController.dispatch(command);
    }
  },
  methods: {
    ensureOverlayMounted(): void {
      if (!this.enabled || this.overlayController) {
        return;
      }

      const canvasHost = this.$refs.canvasHost as HTMLElement | undefined;
      if (!canvasHost) {
        return;
      }

      const scene = createGameStageOverlayScene(canvasHost);
      const controller = createGameStageOverlayController({ scene });
      this.overlayController = controller;
      controller.mount();

      if (!this.overlayMounted) {
        this.overlayMounted = true;
        this.$emit("mounted-change", true);
      }

      if (this.command) {
        controller.dispatch(this.command);
      }
    },
    teardownOverlay(): void {
      const controller = this.overlayController;
      this.overlayController = null;
      controller?.unmount();

      if (this.overlayMounted) {
        this.overlayMounted = false;
      }
      this.$emit("mounted-change", false);
    }
  },
  mounted() {
    if (this.enabled) {
      this.ensureOverlayMounted();
    }
  },
  beforeUnmount() {
    this.teardownOverlay();
  }
});
