import type {
  BeforeInstallPromptEvent,
  CostInputMode
} from "../types/app.ts";

export type ThemeName = "unionArenaDark" | "unionArenaLight";

export interface PromptResult {
  outcome: "accepted" | "dismissed";
  platform: string;
}

export type BeforeInstallPromptHandler = (event: BeforeInstallPromptEvent) => void;

export interface ChangeCostModePayload {
  costInputMode: CostInputMode;
}





