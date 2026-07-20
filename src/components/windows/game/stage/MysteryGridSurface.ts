import type { MysteryGridCell } from "../commands/mysteryGridMethods.ts";
import { gameContextProp, setupGameContext } from "../../shared/contextBridge.ts";

export const MysteryGridSurface = {
  name: "MysteryGridSurface",
  props: {
    ctx: gameContextProp
  },
  data() {
    return {
      localGridSelectorAnimating: false,
      localGridHighlightCellIndex: -1
    };
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
  methods: {
    previewMysteryGridSelection(this: {
      localGridSelectorAnimating: boolean;
      localGridHighlightCellIndex: number;
    }, cellIndex: number): void {
      const nextIndex = Math.floor(Number(cellIndex));
      if (!Number.isFinite(nextIndex) || nextIndex < 0) return;
      this.localGridSelectorAnimating = true;
      this.localGridHighlightCellIndex = nextIndex;
    },
    clearMysteryGridSelectionPreview(this: {
      localGridSelectorAnimating: boolean;
      localGridHighlightCellIndex: number;
    }): void {
      this.localGridSelectorAnimating = false;
      this.localGridHighlightCellIndex = -1;
    },
    isMysteryGridCellHighlighted(this: Record<string, unknown> & {
      localGridSelectorAnimating: boolean;
      localGridHighlightCellIndex: number;
    }, cell: MysteryGridCell): boolean {
      if (cell.revealed) return false;
      const isLocalAnimation = this.localGridSelectorAnimating === true;
      const highlightIndex = isLocalAnimation
        ? this.localGridHighlightCellIndex
        : Math.floor(Number(this.wheelGridHighlightCellIndex));
      const isAnimating = isLocalAnimation || this.wheelGridRevealAnimating === true;
      return isAnimating && highlightIndex === cell.index;
    }
  },
  setup: setupGameContext
};

