import { useShellPorts } from "./shellPorts.ts";
import "./AppShellTopBar.css";

export const AppShellTopBar = {
  name: "AppShellTopBar",
  setup() {
    return useShellPorts();
  }
};
