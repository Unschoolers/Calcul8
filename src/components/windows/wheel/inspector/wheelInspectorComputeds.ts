import { translateAppMessage } from "../../../../app-core/i18n/index.ts";

export const wheelInspectorComputeds = {
  wheelInspectorPanelMeta(this: Record<string, unknown>): { icon: string; title: string; subtitle: string } {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    const tab = String((this as Record<string, unknown>).wheelInspectorTab || "config");
    if (tab === "session") {
      return {
        icon: "mdi-chart-box-outline",
        title: translateAppMessage(preferredLanguage, "wheelInspectorSessionTitle"),
        subtitle: translateAppMessage(preferredLanguage, "wheelInspectorSessionSubtitle")
      };
    }
    if (tab === "history") {
      return {
        icon: "mdi-history",
        title: translateAppMessage(preferredLanguage, "wheelInspectorHistoryTitle"),
        subtitle: translateAppMessage(preferredLanguage, "wheelInspectorHistorySubtitle")
      };
    }
    const config = (this as Record<string, unknown>).wheelDisplayConfig as { gameType?: string } | null;
    if (config?.gameType === "grid") {
      return {
        icon: "mdi-grid",
        title: translateAppMessage(preferredLanguage, "wheelInspectorGridConfigTitle"),
        subtitle: translateAppMessage(preferredLanguage, "wheelInspectorGridConfigSubtitle")
      };
    }
    return {
      icon: "mdi-cog-outline",
      title: translateAppMessage(preferredLanguage, "wheelInspectorConfigTitle"),
      subtitle: translateAppMessage(preferredLanguage, "wheelInspectorConfigSubtitle")
    };
  },

  wheelInspectorTabItems(this: Record<string, unknown>): Array<{ id: "config" | "session" | "history"; icon: string; label: string }> {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    const mode = String((this as Record<string, unknown>).wheelMode || "config");
    const items: Array<{ id: "config" | "session" | "history"; icon: string; label: string }> = [];
    if (mode === "config") {
      items.push({
        id: "config",
        icon: "mdi-tune",
        label: translateAppMessage(preferredLanguage, "wheelInspectorBuilderTabLabel")
      });
    }
    items.push({
      id: "session",
      icon: "mdi-chart-box-outline",
      label: translateAppMessage(preferredLanguage, "wheelInspectorSessionTabLabel")
    });
    items.push({
      id: "history",
      icon: "mdi-history",
      label: translateAppMessage(preferredLanguage, "wheelInspectorHistoryTabLabel")
    });
    return items;
  },

  wheelCompactFabActions(this: Record<string, unknown>): Array<{
    id: "history" | "session" | "builder" | "end";
    icon: string;
    color: string;
    title: string;
    actionType: "inspector" | "end";
    targetTab?: "config" | "session" | "history";
    disabled: boolean;
  }> {
    const preferredLanguage = String((this as Record<string, unknown>).preferredLanguage ?? "");
    const mode = String((this as Record<string, unknown>).wheelMode || "config");
    const hasLotSelected = Boolean((this as Record<string, unknown>).hasLotSelected);
    const actions: Array<{
      id: "history" | "session" | "builder" | "end";
      icon: string;
      color: string;
      title: string;
      actionType: "inspector" | "end";
      targetTab?: "config" | "session" | "history";
      disabled: boolean;
    }> = [
      {
        id: "history",
        icon: "mdi-history",
        color: "surface",
        title: translateAppMessage(preferredLanguage, "wheelInspectorHistoryTabLabel"),
        actionType: "inspector",
        targetTab: "history",
        disabled: !hasLotSelected
      },
      {
        id: "session",
        icon: "mdi-chart-box-outline",
        color: "secondary",
        title: translateAppMessage(preferredLanguage, "wheelInspectorSessionTabLabel"),
        actionType: "inspector",
        targetTab: "session",
        disabled: !hasLotSelected
      }
    ];
    if (mode === "config") {
      actions.push({
        id: "builder",
        icon: "mdi-tune",
        color: "secondary",
        title: translateAppMessage(preferredLanguage, "wheelInspectorBuilderTabLabel"),
        actionType: "inspector",
        targetTab: "config",
        disabled: !hasLotSelected
      });
    } else {
      actions.push({
        id: "end",
        icon: "mdi-flag-checkered",
        color: "error",
        title: translateAppMessage(preferredLanguage, "wheelEndSessionAction"),
        actionType: "end",
        disabled: !hasLotSelected || Boolean((this as Record<string, unknown>).wheelEndingSession)
      });
    }
    return actions;
  }
};
