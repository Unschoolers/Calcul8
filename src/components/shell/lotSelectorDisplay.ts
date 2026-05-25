import {
  resolveVuetifySlotString
} from "../../app-core/shared/vuetify-slot-items.ts";

export type LotSelectorDisplayItem = {
  title: string;
  subtitle: string;
  symbolIcon: string;
  completionIcon: string;
  groupLabel: string;
  lotType: string;
};

const EMPTY_LOT_SELECTOR_DISPLAY_ITEM: LotSelectorDisplayItem = {
  title: "",
  subtitle: "",
  symbolIcon: "",
  completionIcon: "",
  groupLabel: "",
  lotType: ""
};

export function resolveLotSelectorDisplayItem(item: unknown): LotSelectorDisplayItem {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { ...EMPTY_LOT_SELECTOR_DISPLAY_ITEM };
  }

  return {
    title: resolveVuetifySlotString(item, ["title"]),
    subtitle: resolveVuetifySlotString(item, ["subtitle"]),
    symbolIcon: resolveVuetifySlotString(item, ["symbolIcon"]),
    completionIcon: resolveVuetifySlotString(item, ["completionIcon"]),
    groupLabel: resolveVuetifySlotString(item, ["groupLabel"]),
    lotType: resolveVuetifySlotString(item, ["lotType"])
  };
}
