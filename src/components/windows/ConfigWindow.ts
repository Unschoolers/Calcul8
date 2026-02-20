import template from "./ConfigWindow.html?raw";
import "./ConfigWindow.css";
import { createWindowContextBridge } from "./bridge.ts";

export const ConfigWindow = {
  name: "ConfigWindow",
  setup() {
    return createWindowContextBridge();
  },
  template
};
