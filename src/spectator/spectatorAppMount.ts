import {
  createApp,
  defineComponent,
  h,
  shallowRef
} from "vue";
import SpectatorApp from "./SpectatorApp.vue";
import type { SpectatorPageState } from "./spectatorTypes.ts";

export interface SpectatorAppController {
  setState(state: SpectatorPageState): void;
  getState(): SpectatorPageState;
}

export function mountSpectatorApp(
  target: Element | string,
  initialState: SpectatorPageState = { status: "loading" }
): SpectatorAppController {
  const state = shallowRef<SpectatorPageState>(initialState);
  const Root = defineComponent({
    name: "SpectatorRoot",
    setup: () => () => h(SpectatorApp, { state: state.value })
  });

  createApp(Root).mount(target);

  return {
    setState(nextState) {
      state.value = nextState;
    },
    getState() {
      return state.value;
    }
  };
}

