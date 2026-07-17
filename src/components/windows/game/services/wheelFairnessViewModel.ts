import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import type { WheelFairnessEntry } from "../../../../types/app.ts";
import {
  getWheelCurrentProofState,
  getWheelDisplayFairnessHistoryEntries,
  getWheelLatestFairnessEntry
} from "../coordinator/gameComputedShared.ts";

type FairnessContext = Record<string, unknown>;

export type WheelFairnessViewModel = {
  entries: WheelFairnessEntry[];
  latestEntry: WheelFairnessEntry | null;
  summary: string;
  spinning: boolean;
  lastResult: string;
  lastResultClean: string;
  lastResultColor: string;
  spinHash: string;
  spinSeed: string;
  spinClientSeed: string;
  verificationUrl: string;
  icon: string;
  iconColor: string;
  title: string;
  summaryText: string;
  hasEntries: boolean;
};

export function buildWheelFairnessViewModel(context: FairnessContext): WheelFairnessViewModel {
  const language = String(context.preferredLanguage ?? "");
  const entries = getWheelDisplayFairnessHistoryEntries(context);
  const proof = getWheelCurrentProofState(context);
  const spinning = context.wheelSpinning === true;
  const lastResult = String(context.wheelLastResult || "");
  const verificationUrl = proof.spinVerificationUrl.trim();
  const count = entries.length;

  return {
    entries,
    latestEntry: getWheelLatestFairnessEntry(context),
    summary: count
      ? translateAppMessage(language, "wheelFairnessRecentSpins", {
        count,
        suffix: count === 1 ? "" : "s"
      })
      : translateAppMessage(language, "wheelNoSpinsYetLabel"),
    spinning,
    lastResult,
    lastResultClean: lastResult.replace(/^🎉\s*/, "").trim(),
    lastResultColor: proof.lastResultColor,
    spinHash: proof.spinHash,
    spinSeed: proof.spinSeed,
    spinClientSeed: proof.spinClientSeed,
    verificationUrl,
    icon: spinning ? "mdi-lock" : "mdi-shield-check",
    iconColor: spinning ? "warning" : "success",
    title: spinning
      ? translateAppMessage(language, "wheelFairnessResultLockedTitle")
      : translateAppMessage(
        language,
        verificationUrl ? "wheelFairnessServerVerifiedTitle" : "wheelFairnessLocalVerifiedTitle"
      ),
    summaryText: spinning
      ? translateAppMessage(language, "wheelFairnessCommittedSummary")
      : translateAppMessage(
        language,
        verificationUrl ? "wheelFairnessServerVerificationSummary" : "wheelFairnessLocalVerificationSummary"
      ),
    hasEntries: count > 0
  };
}
