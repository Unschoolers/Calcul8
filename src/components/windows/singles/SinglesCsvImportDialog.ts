import { useSinglesConfigPorts } from "./singlesConfigPorts.ts";
import { singlesImportComputed, singlesImportMethods } from "./useSinglesImport.ts";

export const SinglesCsvImportDialog = {
  name: "SinglesCsvImportDialog",
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
