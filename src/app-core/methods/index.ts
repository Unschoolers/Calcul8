import type { AppMethodState } from "../context.ts";
import { configMethods } from "./config.ts";
import { pwaMethods } from "./pwa.ts";
import { salesMethods } from "./sales.ts";
import { uiMethods } from "./ui.ts";

export const appMethods: AppMethodState = {
  ...uiMethods,
  ...configMethods,
  ...salesMethods,
  ...pwaMethods
};
