import { appComputed } from "./app-core/computed.ts";
import { appLifecycle } from "./app-core/lifecycle.ts";
import { appMethods } from "./app-core/methods/index.ts";
import { createInitialState } from "./app-core/state.ts";
import { appWatch } from "./app-core/watch.ts";
import LivePriceCard from "./components/live-price/LivePriceCard.vue";
import AutoCalculateModal from "./components/modals/AutoCalculateModal.vue";
import AuthGateCard from "./components/shell/AuthGateCard.vue";
import AppShellTopBar from "./components/shell/AppShellTopBar.vue";
import LotSelectorOnboardingBlock from "./components/shell/LotSelectorOnboardingBlock.vue";
import PortfolioReportModal from "./components/shell/PortfolioReportModal.vue";
import SaleEditorModal from "./components/shell/SaleEditorModal.vue";
import SystemConfigurationDialog from "./components/shell/SystemConfigurationDialog.vue";
import WorkspaceModals from "./components/shell/WorkspaceModals.vue";
import ConfigWindow from "./components/windows/config/ConfigWindow.vue";
import LiveWindow from "./components/windows/live/LiveWindow.vue";
import PortfolioWindow from "./components/windows/portfolio/PortfolioWindow.vue";
import SalesWindow from "./components/windows/sales/SalesWindow.vue";
import SinglesConfigWindow from "./components/windows/singles/SinglesConfigWindow.vue";
import GameWindow from "./components/windows/game/GameWindow.vue";
import WhatnotCsvImportDialog from "./components/windows/whatnot/WhatnotCsvImportDialog.vue";
import WhatnotReviewDialog from "./components/windows/whatnot/WhatnotReviewDialog.vue";

export const appOptions = {
  components: {
    LivePriceCard,
    AutoCalculateModal,
    AuthGateCard,
    AppShellTopBar,
    LotSelectorOnboardingBlock,
    PortfolioReportModal,
    SaleEditorModal,
    SystemConfigurationDialog,
    WorkspaceModals,
    ConfigWindow,
    SinglesConfigWindow,
    LiveWindow,
    SalesWindow,
    PortfolioWindow,
    GameWindow,
    WhatnotCsvImportDialog,
    WhatnotReviewDialog
  },
  data: createInitialState,
  provide() {
    return {
      appCtx: this
    };
  },
  mounted: appLifecycle.mounted,
  beforeUnmount: appLifecycle.beforeUnmount,
  watch: { ...appWatch },
  computed: { ...appComputed },
  methods: { ...appMethods }
};
