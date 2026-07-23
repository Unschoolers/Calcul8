import { getAppRuntime } from "../runtime.ts";
import type { PlayBillingPort } from "./types.ts";
import { createNativePlayBillingPort } from "./nativePlayBilling.ts";
import { createWebPlayBillingPort } from "./webPlayBilling.ts";

export async function resolvePlayBillingPort(): Promise<PlayBillingPort | null> {
  if (getAppRuntime() === "android") {
    return createNativePlayBillingPort();
  }
  return createWebPlayBillingPort();
}
