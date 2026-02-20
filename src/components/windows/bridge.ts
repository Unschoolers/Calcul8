import { getCurrentInstance, inject } from "vue";

const APP_CONTEXT_KEY = "appCtx";

export function createWindowContextBridge(): Record<string, unknown> {
  const instance = getCurrentInstance();
  const parentProxy = instance?.parent?.proxy as unknown as Record<string, unknown> | null | undefined;
  if (parentProxy) {
    return parentProxy;
  }
  return inject<Record<string, unknown>>(APP_CONTEXT_KEY) ?? {};
}
