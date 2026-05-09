import { type PropType } from "vue";

import { createGameStageOverlayController } from "./gameStageOverlayController.ts";
import { createGameStageOverlayScene } from "./gameStageOverlayScene.ts";
import type { GameStageOverlayCommand } from "./gameStageOverlayTypes.ts";

type GameStageOverlayControllerHandle = ReturnType<typeof createGameStageOverlayController>;

type GameStageOverlayShellThis = {
  enabled: boolean;
  command: GameStageOverlayCommand | null;
  overlayController: GameStageOverlayControllerHandle | null;
  overlayMounted: boolean;
  $refs: Record<string, unknown>;
  $emit: (event: "mounted-change", mounted: boolean) => void;
  ensureOverlayMounted(): void;
  teardownOverlay(): void;
};

export const GameStageOverlayShell = {
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
    enabled(this: GameStageOverlayShellThis, enabled: boolean) {
      if (enabled) {
        this.ensureOverlayMounted();
        return;
      }
      this.teardownOverlay();
    },
    command(this: GameStageOverlayShellThis, command: GameStageOverlayCommand | null) {
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
    ensureOverlayMounted(this: GameStageOverlayShellThis): void {
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
    teardownOverlay(this: GameStageOverlayShellThis): void {
      const controller = this.overlayController;
      this.overlayController = null;
      controller?.unmount();

      if (this.overlayMounted) {
        this.overlayMounted = false;
      }
      this.$emit("mounted-change", false);
    }
  },
  mounted(this: GameStageOverlayShellThis) {
    if (this.enabled) {
      this.ensureOverlayMounted();
    }
  },
  beforeUnmount(this: GameStageOverlayShellThis) {
    this.teardownOverlay();
  }
};
