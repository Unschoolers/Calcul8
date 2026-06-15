import { inject, type PropType } from "vue";
import { AppErrorState } from "../ui/AppErrorState.ts";
import { createWindowContextBridge } from "../windows/shared/contextBridge.ts";
import { resolveLotSelectorDisplayItem } from "./lotSelectorDisplay.ts";
import "./LotSelectorOnboardingBlock.css";

const lotSelectorHelpers = {
  resolveLotSelectorDisplayItem
};

export function createLotSelectorContextBridge(source: Record<string, unknown>): Record<string, unknown> {
  const bridge = createWindowContextBridge(source);

  return new Proxy(lotSelectorHelpers, {
    has(target, key: string | symbol) {
      return Reflect.has(target, key) || Reflect.has(bridge, key);
    },
    getOwnPropertyDescriptor(target, key: string | symbol) {
      return Reflect.getOwnPropertyDescriptor(target, key) ?? Reflect.getOwnPropertyDescriptor(bridge, key);
    },
    get(target, key: string | symbol, receiver) {
      if (Reflect.has(target, key)) {
        return Reflect.get(target, key, receiver);
      }
      return Reflect.get(bridge, key);
    },
    set(_target, key: string | symbol, value: unknown) {
      return Reflect.set(bridge, key, value);
    }
  });
}

export const LotSelectorOnboardingBlock = {
  name: "LotSelectorOnboardingBlock",
  components: {
    AppErrorState
  },
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx) as Record<string, unknown>;
    return createLotSelectorContextBridge(source);
  }
};
