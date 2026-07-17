import { type PropType } from "vue";
import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import {
  buildWheelSessionViewModel,
  type WheelSessionViewModel
} from "../services/wheelSessionViewModel.ts";

type PanelContext = Record<string, unknown>;

function getSource(vm: PanelContext): PanelContext {
  return vm.ctx && typeof vm.ctx === "object" ? vm.ctx as PanelContext : vm;
}

export const WheelSessionPanel = {
  name: "WheelSessionPanel",
  props: {
    ctx: {
      type: Object as PropType<PanelContext>,
      required: true
    }
  },
  methods: {
    t(this: PanelContext, key: string, params?: Record<string, string | number | null | undefined>): string {
      const source = getSource(this);
      return typeof source.t === "function"
        ? (source.t as (translationKey: string, values?: typeof params) => string)(key, params)
        : translateAppMessage(String(source.preferredLanguage ?? ""), key, params);
    },
    openWheelResetDialog(this: PanelContext): void {
      const source = getSource(this);
      if (typeof source.requestWheelReset === "function") {
        (source.requestWheelReset as () => void).call(source);
      } else {
        source.wheelConfirmAction = "reset";
        source.wheelConfirmDialog = true;
      }
    },
    requestWheelSessionEnd(this: PanelContext): void {
      const source = getSource(this);
      if (typeof source.requestWheelSessionEnd === "function") {
        (source.requestWheelSessionEnd as () => void).call(source);
      }
    }
  },
  computed: {
    wheelSessionPanelModel(this: PanelContext): WheelSessionViewModel {
      return buildWheelSessionViewModel(getSource(this));
    },
    wheelSessionPanelMode(this: PanelContext): string {
      return String(getSource(this).wheelMode || "config");
    },
    wheelSessionPanelEndingSession(this: PanelContext): boolean {
      return Boolean(getSource(this).wheelEndingSession);
    },
    wheelSessionPanelPendingIssueCount(this: PanelContext): number {
      const issues = getSource(this).wheelPendingInventoryIssues;
      return Array.isArray(issues) ? issues.length : 0;
    }
  }
};
