import AppDialogShell from "../../ui/AppDialogShell.vue";
import AppFormLayout from "../../ui/AppFormLayout.vue";
import { useSinglesConfigPorts } from "./singlesConfigPorts.ts";
import { singlesImportComputed, singlesImportMethods } from "./useSinglesImport.ts";

export const SinglesCsvImportDialog = {
  name: "SinglesCsvImportDialog",
  components: { AppDialogShell, AppFormLayout },
  computed: {
    ...singlesImportComputed
  },
  methods: {
    ...singlesImportMethods
  },
  setup() {
    return useSinglesConfigPorts();
  }
};
