import { nextTick } from "vue";
import { filterLotOptionItems, type LotOptionItem } from "../../app-core/shared/lot-option-items.ts";
import { useShellPorts, type ShellPorts } from "./shellPorts.ts";
import "./MobileLotSwitcher.css";

type MobileLotSwitcherState = {
  isOpen: boolean;
  searchQuery: string;
};

type MobileLotSwitcherContext = ShellPorts & MobileLotSwitcherState & {
  $refs: Record<string, unknown>;
  selectedLotItem: LotOptionItem | null;
  visibleLotItems: LotOptionItem[];
  closeLotSwitcher(): void;
  focusLotSearch(): void;
  restoreLotSwitcherFocus(): void;
};

export const MobileLotSwitcher = {
  name: "MobileLotSwitcher",
  data(): MobileLotSwitcherState {
    return { isOpen: false, searchQuery: "" };
  },
  computed: {
    selectedLotItem(this: MobileLotSwitcherContext): LotOptionItem | null {
      return this.lotItems.find((item) => item.value === this.currentLotId) ?? null;
    },
    visibleLotItems(this: MobileLotSwitcherContext): LotOptionItem[] {
      return filterLotOptionItems(this.lotItems, this.searchQuery, this.preferredLanguage);
    },
    showLotSearch(this: MobileLotSwitcherContext): boolean {
      return this.lotItems.length >= 6;
    },
    lotSummarySubtitle(this: MobileLotSwitcherContext): string {
      const lotSubtitle = this.selectedLotItem?.subtitle ?? this.t("shellNoLotTitle");
      return this.activeScopeType === "workspace"
        ? `${this.currentWorkspaceName} · ${lotSubtitle}`
        : lotSubtitle;
    },
    lotSwitcherAriaLabel(this: MobileLotSwitcherContext): string {
      return this.t("shellOpenLotSwitcherAction", {
        lot: this.selectedLotItem?.title ?? this.t("shellNoLotTitle")
      });
    }
  },
  methods: {
    focusLotSearch(this: MobileLotSwitcherContext): void {
      void nextTick(() => {
        const field = this.$refs.lotSearchInput as { $el?: Element } | Element | undefined;
        const root = field instanceof Element ? field : field?.$el;
        root?.querySelector("input")?.focus();
      });
    },
    restoreLotSwitcherFocus(this: MobileLotSwitcherContext): void {
      void nextTick(() => {
        const trigger = this.$refs.lotSwitcherTrigger;
        if (trigger instanceof HTMLButtonElement) trigger.focus();
      });
    },
    openLotSwitcher(this: MobileLotSwitcherContext): void {
      this.searchQuery = "";
      this.isOpen = true;
      this.focusLotSearch();
    },
    closeLotSwitcher(this: MobileLotSwitcherContext): void {
      this.isOpen = false;
      this.searchQuery = "";
    },
    chooseLot(this: MobileLotSwitcherContext, lotId: number): void {
      this.selectLot(lotId);
      this.closeLotSwitcher();
    },
    createLot(this: MobileLotSwitcherContext): void {
      this.closeLotSwitcher();
      this.showNewLotModal = true;
    },
    editCurrentLot(this: MobileLotSwitcherContext): void {
      this.closeLotSwitcher();
      this.openRenameLotModal();
    }
  },
  watch: {
    isOpen(this: MobileLotSwitcherContext, isOpen: boolean): void {
      if (isOpen) return;
      this.restoreLotSwitcherFocus();
    }
  },
  setup() {
    return useShellPorts();
  }
};
