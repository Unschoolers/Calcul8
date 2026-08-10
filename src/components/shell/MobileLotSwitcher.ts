import { filterLotOptionItems, type LotOptionItem } from "../../app-core/shared/lot-option-items.ts";
import { useShellPorts, type ShellPorts } from "./shellPorts.ts";
import "./MobileLotSwitcher.css";

type MobileLotSwitcherState = {
  isOpen: boolean;
  searchQuery: string;
};

type MobileLotSwitcherContext = ShellPorts & MobileLotSwitcherState & {
  selectedLotItem: LotOptionItem | null;
  visibleLotItems: LotOptionItem[];
  closeLotSwitcher(): void;
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
    openLotSwitcher(this: MobileLotSwitcherContext): void {
      this.searchQuery = "";
      this.isOpen = true;
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
  setup() {
    return useShellPorts();
  }
};
