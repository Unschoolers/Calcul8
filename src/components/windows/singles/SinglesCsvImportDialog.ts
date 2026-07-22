import { type PropType } from "vue";
import type { SinglesWindowThis } from "./SinglesConfigWindow.definition.ts";
import { singlesImportComputed, singlesImportMethods } from "./useSinglesImport.ts";

export const SinglesCsvImportDialog = {
  name: "SinglesCsvImportDialog",
  computed: {
    ...singlesImportComputed
  },
  methods: {
    ...singlesImportMethods
  },
  props: {
    ctx: {
      type: Object as PropType<SinglesWindowThis>,
      required: true
    }
  },
  setup(props: { ctx: SinglesWindowThis }) {
    return props.ctx;
  }
};
