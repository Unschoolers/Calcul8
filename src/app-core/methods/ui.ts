import type { AppContext, AppMethodState } from "../context.ts";
import { uiAccountMethods } from "./ui/account.ts";
import { uiBaseMethods } from "./ui/base.ts";
import { uiEntitlementMethods } from "./ui/entitlements.ts";
import { uiSyncMethods } from "./ui/sync.ts";
import { uiWhatnotMethods } from "./ui/whatnot.ts";
import { uiWorkspaceMethods } from "./ui/workspaces.ts";

export const uiMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "toggleTheme"
  | "notify"
  | "askConfirmation"
  | "runConfirmAction"
  | "cancelConfirmAction"
  | "formatCurrency"
  | "safeFixed"
  | "toggleChartView"
  | "togglePortfolioChartView"
  | "togglePortfolioReportLot"
  | "accessProFeature"
  | "requestPurchaseUiMode"
  | "calculateSaleProfit"
  | "getSaleProfitPreview"
  | "getSaleColor"
  | "getSaleIcon"
  | "formatDate"
  | "initGoogleAutoLogin"
  | "promptGoogleSignIn"
  | "openVerifyPurchaseModal"
  | "startProPurchase"
  | "verifyProPurchase"
  | "closeStripeCheckoutModal"
  | "startPlayPurchase"
  | "verifyPlayPurchase"
  | "pullCloudSync"
  | "startCloudSyncScheduler"
  | "stopCloudSyncScheduler"
  | "pushCloudSync"
  | "debugLogEntitlement"
  | "logoutCurrentSession"
  | "clearPersonalAccountData"
  | "refreshWhatnotStatus"
  | "connectWhatnot"
  | "disconnectWhatnot"
  | "syncWhatnotSales"
  | "openWhatnotCsvImportDialog"
  | "closeWhatnotCsvImportDialog"
  | "prepareWhatnotCsvImport"
  | "openWhatnotReviewDialog"
  | "closeWhatnotReviewDialog"
  | "confirmWhatnotImportBatch"
  | "refreshWorkspaces"
  | "switchToPersonalWorkspace"
  | "switchToWorkspace"
  | "createWorkspace"
  | "openWorkspaceMembersModal"
  | "createWorkspaceJoinLink"
  | "previewPendingWorkspaceInvite"
  | "acceptPendingWorkspaceInvite"
  | "dismissPendingWorkspaceInvite"
  | "openLeaveWorkspaceModal"
  | "leaveCurrentWorkspace"
  | "removeWorkspaceMember"
  | "handleWorkspaceAccessLost"
  | "getWorkspaceMemberPresenceState"
  | "getWorkspaceMemberPresenceLabel"
> = {
  ...uiBaseMethods,
  ...uiAccountMethods,
  ...uiEntitlementMethods,
  ...uiWhatnotMethods,
  ...uiSyncMethods,
  ...uiWorkspaceMethods
};
