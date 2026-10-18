import {
  resolveVuetifySlotNumber,
  resolveVuetifySlotString
} from "../../app-core/shared/vuetify-slot-items.ts";
import type { SinglesSaleCardOption } from "../../types/app.ts";
import AppDialogShell from "../ui/AppDialogShell.vue";
import AppFormLayout from "../ui/AppFormLayout.vue";
import { useCommerceDialogPorts } from "../modals/commerceDialogPorts.ts";
import "./SaleEditorModal.css";

export const SaleEditorModal = {
  name: "SaleEditorModal",
  components: {
    AppDialogShell,
    AppFormLayout
  },
  methods: {
    resolveVuetifySlotNumber,
    resolveVuetifySlotString,
    findSinglesSaleCardOption(this: { singlesSaleCardOptions: SinglesSaleCardOption[] }, entryId: number | null | undefined): SinglesSaleCardOption | undefined {
      return this.singlesSaleCardOptions.find(option => option.value === entryId);
    },
    hideSaleLineImage(event: Event): void {
      const image = event.currentTarget;
      if (!(image instanceof HTMLImageElement)) return;
      const column = image.closest<HTMLElement>(".sale-editor-line-thumb-col");
      if (column) column.style.display = "none";
    },
    hideSaleItemImage(event: Event): void {
      if (event.currentTarget instanceof HTMLImageElement) event.currentTarget.hidden = true;
    }
  },
  setup() {
    return useCommerceDialogPorts();
  }
};
