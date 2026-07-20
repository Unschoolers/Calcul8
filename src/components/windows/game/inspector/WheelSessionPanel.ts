import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import { gameContextProp, getGameContextSource, setupGameContext } from "../../shared/contextBridge.ts";
import {
  buildWheelSessionViewModel,
  type WheelSessionViewModel
} from "../services/wheelSessionViewModel.ts";

type PanelContext = Record<string, unknown>;

export const WheelSessionPanel = {
  name: "WheelSessionPanel",
  props: {
    ctx: gameContextProp
  },
  methods: {
    t(this: PanelContext, key: string, params?: Record<string, string | number | null | undefined>): string {
      const source = getGameContextSource(this);
      return typeof source.t === "function"
        ? (source.t as (translationKey: string, values?: typeof params) => string)(key, params)
        : translateAppMessage(String(source.preferredLanguage ?? ""), key, params);
    },
    openWheelResetDialog(this: PanelContext): void {
      if (typeof this.requestWheelReset === "function") {
        (this.requestWheelReset as () => void)();
      } else {
        this.wheelConfirmAction = "reset";
        this.wheelConfirmDialog = true;
      }
    },
    requestWheelSessionEnd(this: PanelContext): void {
      if (typeof this.requestWheelSessionEnd === "function") {
        (this.requestWheelSessionEnd as () => void)();
      }
    }
  },
  computed: {
    wheelSessionPanelModel(this: PanelContext): WheelSessionViewModel {
      return buildWheelSessionViewModel(this);
    },
    wheelSessionPanelMode(this: PanelContext): string {
      return String(this.wheelMode || "config");
    },
    wheelSessionPanelEndingSession(this: PanelContext): boolean {
      return Boolean(this.wheelEndingSession);
    },
    wheelSessionPanelPendingIssueCount(this: PanelContext): number {
      const issues = this.wheelPendingInventoryIssues;
      return Array.isArray(issues) ? issues.length : 0;
    }
  },
  setup: setupGameContext
};
