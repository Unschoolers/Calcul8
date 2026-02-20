import template from "./SalesWindow.html?raw";
import "./SalesWindow.css";
import { createWindowContextBridge } from "./bridge.ts";

export const SalesWindow = {
  name: "SalesWindow",
  setup() {
    return createWindowContextBridge();
  },
  template
};
