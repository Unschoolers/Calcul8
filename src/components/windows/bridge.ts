import { inject } from "vue";

const APP_CONTEXT_KEY = "appCtx";

export function createWindowContextBridge(): Record<string, unknown> {
  const appCtx = inject<Record<string, unknown>>(APP_CONTEXT_KEY);
  if (!appCtx) {
    return {};
  }

  return new Proxy(
    {},
    {
      get(_target, key) {
        const value = (appCtx as Record<string | symbol, unknown>)[key as string | symbol];
        if (typeof value === "function") {
          return (value as (...args: unknown[]) => unknown).bind(appCtx);
        }
        return value;
      },
      set(_target, key, value) {
        (appCtx as Record<string | symbol, unknown>)[key as string | symbol] = value;
        return true;
      },
      has(_target, key) {
        return key in (appCtx as Record<string | symbol, unknown>);
      }
    }
  ) as Record<string, unknown>;
}
