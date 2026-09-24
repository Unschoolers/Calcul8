import AppDialogShell from "../ui/AppDialogShell.vue";
import AppFormLayout from "../ui/AppFormLayout.vue";
import { computed } from "vue";
import { useWorkspaceDialogPorts } from "./workspaceDialogPorts.ts";
import { resolveEffectiveWhatnotFeeInput } from "../../app-core/shared/whatnot-fee-summary.ts";
import "./SystemConfigurationDialog.css";

export const SystemConfigurationDialog = {
  name: "SystemConfigurationDialog",
  components: {
    AppDialogShell,
    AppFormLayout
  },
  setup() {
    const ports = useWorkspaceDialogPorts();
    const whatnotFeeStatus = computed(() => {
      if (!ports.hasLotSelected || ports.feeProfilePreset !== "whatnot" || !ports.whatnotVertical) return null;
      const summary = ports.whatnotFeeSummary;
      if (!summary?.periodStart) return null;
      const effective = resolveEffectiveWhatnotFeeInput({
        feeProfilePreset: ports.feeProfilePreset,
        whatnotVertical: ports.whatnotVertical,
        platformFeePercent: ports.platformFeePercent,
        additionalFeePercent: ports.additionalFeePercent,
        additionalFeeAppliesTo: ports.additionalFeeAppliesTo,
        fixedFeePerOrder: ports.fixedFeePerOrder
      }, summary);
      const threshold = summary.nextThresholdCad;
      return {
        rate: effective?.platformFeePercent ?? ports.platformFeePercent,
        tier: summary.currentTier === 0
          ? ports.t("configWhatnotFeeStatusStandard")
          : ports.t("configWhatnotFeeStatusTier", { tier: summary.currentTier }),
        previousGross: summary.previousPeriodGrossCad,
        currentGross: summary.currentPeriodGrossCad,
        nextThreshold: threshold,
        progress: threshold ? Math.min(100, summary.currentPeriodGrossCad / threshold * 100) : 100,
        periodStart: summary.periodStart,
        periodEnd: summary.periodEndExclusive ? addDays(summary.periodEndExclusive, -1) : null,
        previousStart: summary.previousPeriodStart,
        previousEnd: summary.previousPeriodEndExclusive ? addDays(summary.previousPeriodEndExclusive, -1) : null,
        incomplete: summary.missingLotIds.length > 0
      };
    });
    Object.defineProperty(ports, "whatnotFeeStatus", {
      configurable: true,
      enumerable: true,
      get: () => whatnotFeeStatus.value
    });
    return ports;
  }
};

function addDays(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
