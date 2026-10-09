import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import type { GameController } from "../coordinator/gameControllerState.ts";
import { setupTypedGameContext } from "../coordinator/gameContext.ts";
import {
  buildWheelSessionViewModel,
  type WheelSessionViewModel
} from "../services/wheelSessionViewModel.ts";

type PanelContext = { game: GameController };

export const WheelSessionPanel = {
  name: "WheelSessionPanel",
  methods: {
    t(this: PanelContext, key: string, params?: Record<string, string | number | null | undefined>): string {
      const view = this.game.view;
      return typeof view.t === "function"
        ? view.t(key, params)
        : translateAppMessage(String(view.preferredLanguage ?? ""), key, params);
    },
    openWheelResetDialog(this: PanelContext): void {
      this.game.commands.requestWheelReset();
    },
    requestWheelSessionEnd(this: PanelContext): void {
      this.game.commands.requestWheelSessionEnd();
    }
  },
  computed: {
    wheelSessionPanelModel(this: PanelContext): WheelSessionViewModel {
      return buildWheelSessionViewModel(this.game.view);
    },
    wheelSessionPanelMode(this: PanelContext): string {
      return String(this.game.view.wheelMode || "config");
    },
    wheelSessionPanelEndingSession(this: PanelContext): boolean {
      return Boolean(this.game.view.wheelEndingSession);
    },
    wheelSessionPanelPendingIssueCount(this: PanelContext): number {
      const issues = this.game.session.wheelPendingInventoryIssues;
      return Array.isArray(issues) ? issues.length : 0;
    }
  },
  setup: setupTypedGameContext
};
