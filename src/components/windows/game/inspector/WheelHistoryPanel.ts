import { type PropType } from "vue";
import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import { getWheelController } from "../coordinator/gameControllerState.ts";
import {
  buildWheelFairnessViewModel,
  type WheelFairnessViewModel
} from "../services/wheelFairnessViewModel.ts";

type PanelContext = Record<string, unknown>;

function getSource(vm: PanelContext): PanelContext {
  return vm.ctx && typeof vm.ctx === "object" ? vm.ctx as PanelContext : vm;
}

export const WheelHistoryPanel = {
  name: "WheelHistoryPanel",
  props: {
    ctx: { type: Object as PropType<PanelContext>, required: true },
    latestOnly: { type: Boolean, default: false },
    presentation: { type: Boolean, default: false },
    showEmptyState: { type: Boolean, default: true }
  },
  methods: {
    t(this: PanelContext, key: string, params?: Record<string, string | number | null | undefined>): string {
      const source = getSource(this);
      return typeof source.t === "function"
        ? (source.t as (translationKey: string, values?: typeof params) => string)(key, params)
        : translateAppMessage(String(source.preferredLanguage ?? ""), key, params);
    }
  },
  computed: {
    wheelHistoryPanelModel(this: PanelContext): WheelFairnessViewModel {
      return buildWheelFairnessViewModel(getSource(this));
    },
    wheelHistoryPanelHistoryOpen: {
      get(this: PanelContext): boolean {
        return getWheelController(getSource(this)).fairnessHistoryOpen;
      },
      set(this: PanelContext, value: boolean): void {
        getWheelController(getSource(this)).fairnessHistoryOpen = value;
      }
    }
  }
};
