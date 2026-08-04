import { gameContextProp, getGameContextSource, setupGameContext, type WindowContext } from "../../shared/contextBridge.ts";
import type { MysteryGridCell } from "../commands/mysteryGridMethods.ts";

function getSurfaceSource(context: Record<string, unknown>): Record<string, unknown> {
  const explicitContext = context.ctx;
  return explicitContext && typeof explicitContext === "object"
    ? getGameContextSource(explicitContext as WindowContext)
    : context;
}

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
    wheelSpinning(this: Record<string, unknown>): boolean {
      return getSurfaceSource(this).wheelSpinning === true;
    },
    wheelGridRevealAnimating(this: Record<string, unknown>): boolean {
      return getSurfaceSource(this).wheelGridRevealAnimating === true;
    },
    wheelEndingSession(this: Record<string, unknown>): boolean {
      return getSurfaceSource(this).wheelEndingSession === true;
    },
    wheelChaseDialog(this: Record<string, unknown>): boolean {
      return getSurfaceSource(this).wheelChaseDialog === true;
    },
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
      ctx?: Record<string, unknown>;
    }, cell: MysteryGridCell): boolean {
      if (cell.revealed) return false;
      const isLocalAnimation = this.localGridSelectorAnimating === true;
      const source = getSurfaceSource(this);
      const highlightIndex = isLocalAnimation
        ? this.localGridHighlightCellIndex
        : Math.floor(Number(source.wheelGridHighlightCellIndex));
      const isAnimating = isLocalAnimation || source.wheelGridRevealAnimating === true;
      return isAnimating && highlightIndex === cell.index;
    }
  },
  setup: setupGameContext
};

