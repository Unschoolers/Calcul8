import { translateAppMessage } from "../../../../app-core/i18n/index.ts";

type InspectorTab = "config" | "session" | "history";
type InspectorPanelMeta = { icon: string; titleKey: string; subtitleKey: string };
type CompactAction = {
  id: "history" | "session" | "builder" | "end";
  icon: string;
  color: string;
  titleKey: string;
  actionType: "inspector" | "end";
  targetTab?: InspectorTab;
  mode?: "config" | "live";
};

const INSPECTOR_PANEL_META: Record<InspectorTab | "grid", InspectorPanelMeta> = {
  config: { icon: "mdi-cog-outline", titleKey: "wheelInspectorConfigTitle", subtitleKey: "wheelInspectorConfigSubtitle" },
  grid: { icon: "mdi-grid", titleKey: "wheelInspectorGridConfigTitle", subtitleKey: "wheelInspectorGridConfigSubtitle" },
  session: { icon: "mdi-chart-box-outline", titleKey: "wheelInspectorSessionTitle", subtitleKey: "wheelInspectorSessionSubtitle" },
  history: { icon: "mdi-history", titleKey: "wheelInspectorHistoryTitle", subtitleKey: "wheelInspectorHistorySubtitle" }
};

const INSPECTOR_TABS: Array<{ id: InspectorTab; icon: string; labelKey: string }> = [
  { id: "config", icon: "mdi-tune", labelKey: "wheelInspectorBuilderTabLabel" },
  { id: "session", icon: "mdi-chart-box-outline", labelKey: "wheelInspectorSessionTabLabel" },
  { id: "history", icon: "mdi-history", labelKey: "wheelInspectorHistoryTabLabel" }
];

const COMPACT_ACTIONS: CompactAction[] = [
  { id: "history", icon: "mdi-history", color: "surface", titleKey: "wheelInspectorHistoryTabLabel", actionType: "inspector", targetTab: "history" },
  { id: "session", icon: "mdi-chart-box-outline", color: "secondary", titleKey: "wheelInspectorSessionTabLabel", actionType: "inspector", targetTab: "session" },
  { id: "builder", icon: "mdi-tune", color: "secondary", titleKey: "wheelInspectorBuilderTabLabel", actionType: "inspector", targetTab: "config", mode: "config" },
  { id: "end", icon: "mdi-flag-checkered", color: "error", titleKey: "wheelEndSessionAction", actionType: "end", mode: "live" }
];

function translate(language: string, key: string): string {
  return translateAppMessage(language, key);
}

export const wheelInspectorComputeds = {
  wheelInspectorPanelMeta(this: Record<string, unknown>): { icon: string; title: string; subtitle: string } {
    const language = String(this.preferredLanguage ?? "");
    const tab = String(this.wheelInspectorTab || "config") as InspectorTab;
    const config = this.wheelDisplayConfig as { gameType?: string } | null;
    const meta = tab === "config" && config?.gameType === "grid"
      ? INSPECTOR_PANEL_META.grid
      : INSPECTOR_PANEL_META[tab] ?? INSPECTOR_PANEL_META.config;
    return {
      icon: meta.icon,
      title: translate(language, meta.titleKey),
      subtitle: translate(language, meta.subtitleKey)
    };
  },

  wheelInspectorTabItems(this: Record<string, unknown>): Array<{ id: InspectorTab; icon: string; label: string }> {
    const language = String(this.preferredLanguage ?? "");
    const mode = String(this.wheelMode || "config");
    return INSPECTOR_TABS
      .filter((item) => item.id !== "config" || mode === "config")
      .map((item) => ({ id: item.id, icon: item.icon, label: translate(language, item.labelKey) }));
  },

  wheelCompactFabActions(this: Record<string, unknown>) {
    const language = String(this.preferredLanguage ?? "");
    const mode = String(this.wheelMode || "config") as "config" | "live";
    const hasLotSelected = Boolean(this.hasLotSelected);
    return COMPACT_ACTIONS
      .filter((action) => !action.mode || action.mode === mode)
      .map((action) => ({
        id: action.id,
        icon: action.icon,
        color: action.color,
        title: translate(language, action.titleKey),
        actionType: action.actionType,
        targetTab: action.targetTab,
        disabled: !hasLotSelected || (action.id === "end" && Boolean(this.wheelEndingSession))
      }));
  }
};
