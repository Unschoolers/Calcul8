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
import {
  buyerProfilePortsKey,
  createBuyerProfilePorts,
  type BuyerProfilePorts
} from "./components/customers/buyerProfilePorts.ts";
import {
  createPortfolioWindowPorts,
  portfolioWindowPortsKey,
  type PortfolioWindowPorts
} from "./components/windows/portfolio/portfolioWindowPorts.ts";
import {
  configWindowPortsKey,
  createConfigWindowPorts,
  type ConfigWindowPorts
} from "./components/windows/config/configWindowPorts.ts";
import {
  createSinglesConfigPorts,
  singlesConfigPortsKey,
  type SinglesConfigPorts
} from "./components/windows/singles/singlesConfigPorts.ts";
import {
  createGameCoordinatorPorts,
  gameCoordinatorPortsKey,
  type GameCoordinatorPorts
} from "./components/windows/game/coordinator/gameCoordinatorPorts.ts";
import {
  createLiveWindowPorts,
  liveWindowPortsKey,
  type LiveWindowSource
} from "./components/windows/live/liveWindowPorts.ts";
import {
  createSalesWindowPorts,
  salesWindowPortsKey,
  type SalesWindowPorts
} from "./components/windows/sales/salesWindowPorts.ts";
import {
  createShellPorts,
  shellPortsKey,
  type ShellPortSource
} from "./components/shell/shellPorts.ts";
import {
  commerceDialogPortsKey,
  createCommerceDialogPorts,
  type CommerceDialogPorts
} from "./components/modals/commerceDialogPorts.ts";
import {
  createWorkspaceDialogPorts,
  workspaceDialogPortsKey,
  type WorkspaceDialogPorts
} from "./components/shell/workspaceDialogPorts.ts";
import {
  createWhatnotDialogPorts,
  whatnotDialogPortsKey,
  type WhatnotDialogPorts
} from "./components/windows/whatnot/whatnotDialogPorts.ts";

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
  provide(this: BuyerProfilePorts & CommerceDialogPorts & ConfigWindowPorts & GameCoordinatorPorts & LiveWindowSource & PortfolioWindowPorts & SalesWindowPorts & ShellPortSource & SinglesConfigPorts & WhatnotDialogPorts & WorkspaceDialogPorts) {
    return {
      [buyerProfilePortsKey]: createBuyerProfilePorts(this),
      [commerceDialogPortsKey]: createCommerceDialogPorts(this),
      [configWindowPortsKey]: createConfigWindowPorts(this),
      [gameCoordinatorPortsKey]: createGameCoordinatorPorts(this),
      [liveWindowPortsKey]: createLiveWindowPorts(this),
      [portfolioWindowPortsKey]: createPortfolioWindowPorts(this),
      [salesWindowPortsKey]: createSalesWindowPorts(this),
      [shellPortsKey]: createShellPorts(this),
      [singlesConfigPortsKey]: createSinglesConfigPorts(this),
      [whatnotDialogPortsKey]: createWhatnotDialogPorts(this),
      [workspaceDialogPortsKey]: createWorkspaceDialogPorts(this)
    };
  },
  mounted: appLifecycle.mounted,
  beforeUnmount: appLifecycle.beforeUnmount,
  watch: { ...appWatch },
  computed: { ...appComputed },
  methods: { ...appMethods }
};
