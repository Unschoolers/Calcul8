import { inject } from "vue";

const APP_CONTEXT_KEY = "appCtx";

export function createWindowContextBridge(): Record<string, unknown> {
  return inject<Record<string, unknown>>(APP_CONTEXT_KEY) ?? {};
}
