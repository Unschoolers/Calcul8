import { useShellPorts } from "./shellPorts.ts";
import "./AuthGateCard.css";

export const AuthGateCard = {
  name: "AuthGateCard",
  setup() {
    return useShellPorts();
  }
};
