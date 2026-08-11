import AppFormLayout from "../../ui/AppFormLayout.vue";
import { useConfigWindowPorts } from "./configWindowPorts.ts";

export const AdminSyncImportCard = {
  name: "AdminSyncImportCard",
  components: { AppFormLayout },
  setup() {
    return useConfigWindowPorts();
  }
};
