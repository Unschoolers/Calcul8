import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import { gameContextProp, getGameContextSource, setupGameContext } from "../../shared/contextBridge.ts";
import {
    buildWheelSessionViewModel,
    type WheelSessionViewModel
} from "../services/wheelSessionViewModel.ts";

type PanelContext = Record<string, unknown>;

function getPanelSource(context: PanelContext): PanelContext {
  const explicitContext = context.ctx;
  return explicitContext && typeof explicitContext === "object"
    ? getGameContextSource(explicitContext as PanelContext)
    : context;
}

export const WheelSessionPanel = {
  name: "WheelSessionPanel",
  props: {
    ctx: gameContextProp
  },
  methods: {
    t(this: PanelContext, key: string, params?: Record<string, string | number | null | undefined>): string {
      const source = getPanelSource(this);
      return typeof source.t === "function"
        ? (source.t as (translationKey: string, values?: typeof params) => string)(key, params)
        : translateAppMessage(String(source.preferredLanguage ?? ""), key, params);
    },
    openWheelResetDialog(this: PanelContext): void {
      const source = getPanelSource(this);
      if (typeof source.requestWheelReset === "function") {
        (source.requestWheelReset as () => void)();
      } else {
        source.wheelConfirmAction = "reset";
        source.wheelConfirmDialog = true;
      }
    },
    requestWheelSessionEnd(this: PanelContext): void {
      const source = getPanelSource(this);
      if (typeof source.requestWheelSessionEnd === "function") {
        (source.requestWheelSessionEnd as () => void)();
      }
    }
  },
  computed: {
    wheelSessionPanelModel(this: PanelContext): WheelSessionViewModel {
      return buildWheelSessionViewModel(getPanelSource(this));
    },
    wheelSessionPanelMode(this: PanelContext): string {
      return String(getPanelSource(this).wheelMode || "config");
    },
    wheelSessionPanelEndingSession(this: PanelContext): boolean {
      return Boolean(getPanelSource(this).wheelEndingSession);
    },
    wheelSessionPanelPendingIssueCount(this: PanelContext): number {
      const issues = getPanelSource(this).wheelPendingInventoryIssues;
      return Array.isArray(issues) ? issues.length : 0;
    }
  },
  setup: setupGameContext
};
