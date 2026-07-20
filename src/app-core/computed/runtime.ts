import type { RuntimeComputedObject } from "../context/runtime.ts";

export const runtimeComputed: RuntimeComputedObject = {
  isDark(): boolean {
    return this.$vuetify.theme.global.name === "unionArenaDark";
  }
};
