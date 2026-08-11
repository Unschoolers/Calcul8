import { defineComponent } from "vue";
import AppDialogShell from "../ui/AppDialogShell.vue";
import AppFormLayout from "../ui/AppFormLayout.vue";
import { useCommerceDialogPorts } from "./commerceDialogPorts.ts";

export const AutoCalculateModal = defineComponent({
  name: "AutoCalculateModal",
  components: { AppDialogShell, AppFormLayout },
  setup() {
    return useCommerceDialogPorts();
  }
});
