import type { GameController } from "../coordinator/gameControllerState.ts";
import { setupTypedGameContext } from "../coordinator/gameContext.ts";
import { buildMysteryGridCells, type MysteryGridCell } from "../commands/mysteryGridMethods.ts";

type MysteryGridSurfaceThis = {
  game: GameController;
  mysteryGridCells: MysteryGridCell[];
  localGridSelectorAnimating: boolean;
  localGridHighlightCellIndex: number;
};

export const MysteryGridSurface = {
  name: "MysteryGridSurface",
  data() {
    return {
      localGridSelectorAnimating: false,
      localGridHighlightCellIndex: -1
    };
  },
  computed: {
    mysteryGridCells(this: MysteryGridSurfaceThis): MysteryGridCell[] {
      return buildMysteryGridCells(this.game.view);
    },
    wheelSpinning(this: MysteryGridSurfaceThis): boolean {
      return this.game.view.wheelSpinning === true;
    },
    wheelGridRevealAnimating(this: MysteryGridSurfaceThis): boolean {
      return this.game.view.wheelGridRevealAnimating === true;
    },
    wheelEndingSession(this: MysteryGridSurfaceThis): boolean {
      return this.game.view.wheelEndingSession === true;
    },
    wheelChaseDialog(this: MysteryGridSurfaceThis): boolean {
      return this.game.view.wheelChaseDialog === true;
    },
    mysteryGridSurfaceStyle(this: MysteryGridSurfaceThis): Record<string, string> {
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
    isMysteryGridCellHighlighted(this: MysteryGridSurfaceThis, cell: MysteryGridCell): boolean {
      if (cell.revealed) return false;
      const isLocalAnimation = this.localGridSelectorAnimating === true;
      const source = this.game.view;
      const highlightIndex = isLocalAnimation
        ? this.localGridHighlightCellIndex
        : Math.floor(Number(source.wheelGridHighlightCellIndex));
      const isAnimating = isLocalAnimation || source.wheelGridRevealAnimating === true;
      return isAnimating && highlightIndex === cell.index;
    }
  },
  setup: setupTypedGameContext
};

