import template from "./PortfolioWindow.html?raw";
import "./PortfolioWindow.css";
import { createWindowContextBridge } from "./bridge.ts";

export const PortfolioWindow = {
  name: "PortfolioWindow",
  setup() {
    return createWindowContextBridge();
  },
  template
};
