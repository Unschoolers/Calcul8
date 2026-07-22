import { useConfigWindowPorts } from "./configWindowPorts.ts";

export const AdminSyncImportCard = {
  name: "AdminSyncImportCard",
  setup() {
    return useConfigWindowPorts();
  }
};
