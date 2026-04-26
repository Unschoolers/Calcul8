import { inject, type PropType } from "vue";
import { createNestedWindowContextBridge } from "../../contextBridge.ts";

export const MysteryGridSurface = {
  name: "MysteryGridSurface",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  computed: {
    mysteryGridSurfaceStyle(this: Record<string, unknown>): Record<string, string> {
      const cells = Array.isArray(this.mysteryGridCells) ? this.mysteryGridCells : [];
      const cellCount = Math.max(1, cells.length);
      const columns = Math.ceil(Math.sqrt(cellCount));
      return {
        "--mystery-grid-columns": String(columns)
      };
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedWheelCtx = inject<Record<string, unknown> | null>("wheelCtx", null);
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedWheelCtx ?? props.ctx ?? injectedCtx) as Record<string, unknown>;
    return createNestedWindowContextBridge(source);
  }
};
