import { Capacitor } from "@capacitor/core";

export type AppRuntime = "web" | "android";

export function getAppRuntime(): AppRuntime {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
    ? "android"
    : "web";
}
