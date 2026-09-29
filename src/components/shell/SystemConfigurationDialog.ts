import { computed } from "vue";
import AppDialogShell from "../ui/AppDialogShell.vue";
import AppFormLayout from "../ui/AppFormLayout.vue";
import { useWorkspaceDialogPorts } from "./workspaceDialogPorts.ts";
import { calculateSealedBoxInventory, deriveBoxOpeningEvents, type BoxOpeningEvent } from "../../domain/box-inventory.ts";
import { formatLocalizedDate } from "../../app-core/i18n/index.ts";
import "./SystemConfigurationDialog.css";

export const SystemConfigurationDialog = {
  name: "SystemConfigurationDialog",
  components: { AppDialogShell, AppFormLayout },
  setup() {
    const ports = useWorkspaceDialogPorts();
    const lot = () => ({ boxesPurchased: ports.boxesPurchased, packsPerBox: ports.packsPerBox });
    const sealedInventory = computed(() => calculateSealedBoxInventory(lot(), ports.sales));
    const boxOpeningEvents = computed(() => deriveBoxOpeningEvents(lot(), ports.sales));
    const formatBoxOpeningAt = (event: BoxOpeningEvent): string => {
      if (!event.openedAt) return ports.t("configShopifyTimeUnknown");
      const formatted = formatLocalizedDate(event.openedAt, ports.preferredLanguage,
        event.precision === "instant"
          ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
          : { month: "short", day: "numeric", year: "numeric" });
      return event.precision === "date" ? `${formatted} (${ports.t("configShopifyDayOnly")})` : formatted;
    };
    return Object.assign(ports, { sealedInventory, boxOpeningEvents, formatBoxOpeningAt });
  }
};
