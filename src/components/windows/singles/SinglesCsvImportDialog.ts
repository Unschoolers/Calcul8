import template from "./SinglesCsvImportDialog.html?raw";
import { inject, type PropType } from "vue";
import { createWindowContextBridge } from "../contextBridge.ts";
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
      type: Object as PropType<Record<string, unknown> | null>,
      required: false,
      default: (): null => null
    }
  },
  setup(props: { ctx: Record<string, unknown> | null }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx ?? {}) as Record<string, unknown>;
    return createWindowContextBridge(source);
  },
  template
};
