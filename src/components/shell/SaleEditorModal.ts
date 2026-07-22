import {
  resolveVuetifySlotNumber,
  resolveVuetifySlotString
} from "../../app-core/shared/vuetify-slot-items.ts";
import AppStickyActionFooter from "../ui/AppStickyActionFooter.vue";
import { useCommerceDialogPorts } from "../modals/commerceDialogPorts.ts";
import "./SaleEditorModal.css";

export const SaleEditorModal = {
  name: "SaleEditorModal",
  components: {
    AppStickyActionFooter
  },
  methods: {
    resolveVuetifySlotNumber,
    resolveVuetifySlotString
  },
  setup() {
    return useCommerceDialogPorts();
  }
};
