import { defineComponent } from "vue";
import { useCommerceDialogPorts } from "./commerceDialogPorts.ts";

export const AutoCalculateModal = defineComponent({
  name: "AutoCalculateModal",
  setup() {
    return useCommerceDialogPorts();
  }
});
