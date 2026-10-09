import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import type { GameController } from "../coordinator/gameControllerState.ts";
import { setupTypedGameContext } from "../coordinator/gameContext.ts";
import {
  buildWheelFairnessViewModel,
  type WheelFairnessViewModel
} from "../services/wheelFairnessViewModel.ts";

type PanelContext = { game: GameController };

export const WheelHistoryPanel = {
  name: "WheelHistoryPanel",
  props: {
    latestOnly: { type: Boolean, default: false },
    presentation: { type: Boolean, default: false },
    showEmptyState: { type: Boolean, default: true }
  },
  methods: {
    t(this: PanelContext, key: string, params?: Record<string, string | number | null | undefined>): string {
      const view = this.game.view;
      return typeof view.t === "function"
        ? view.t(key, params)
        : translateAppMessage(String(view.preferredLanguage ?? ""), key, params);
    }
  },
  computed: {
    wheelHistoryPanelModel(this: PanelContext): WheelFairnessViewModel {
      return buildWheelFairnessViewModel(this.game.view);
    },
    wheelHistoryPanelHistoryOpen: {
      get(this: PanelContext): boolean {
        return this.game.session.wheelFairnessHistoryOpen;
      },
      set(this: PanelContext, value: boolean): void {
        this.game.session.wheelFairnessHistoryOpen = value;
      }
    }
  },
  setup: setupTypedGameContext
};
