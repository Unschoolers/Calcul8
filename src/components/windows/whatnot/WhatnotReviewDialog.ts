import template from "./WhatnotReviewDialog.html?raw";
import { inject, type PropType } from "vue";
import { createWindowContextBridge } from "../contextBridge.ts";

export const WhatnotReviewDialog = {
  name: "WhatnotReviewDialog",
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
