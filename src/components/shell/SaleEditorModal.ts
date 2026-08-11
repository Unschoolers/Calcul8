import {
  resolveVuetifySlotNumber,
  resolveVuetifySlotString
} from "../../app-core/shared/vuetify-slot-items.ts";
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
    resolveVuetifySlotString
  },
  setup() {
    return useCommerceDialogPorts();
  }
};
