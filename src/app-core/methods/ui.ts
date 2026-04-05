import type { AppContext, AppMethodState } from "../context-app.ts";
import { uiAccountMethods } from "./ui/account.ts";
import { uiBaseMethods } from "./ui/base.ts";
import { uiEntitlementMethods } from "./ui/entitlements.ts";
import { uiOnboardingMethods } from "./ui/onboarding.ts";
import { uiSyncMethods } from "./ui/sync.ts";
import { uiWhatnotMethods } from "./ui/whatnot.ts";
import { uiWorkspaceMethods } from "./ui/workspaces.ts";

export const uiMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "t"
  | "setPreferredLanguage"
  | "syncGuidedOnboarding"
  | "startGuidedOnboarding"
  | "dismissGuidedOnboarding"
  | "stopGuidedOnboarding"
  | "handleGuidedOnboardingLotCreated"
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
  | "renderGoogleSignInButton"
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
  | "discardWhatnotReviewBatch"
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
  ...uiOnboardingMethods,
  ...uiAccountMethods,
  ...uiEntitlementMethods,
  ...uiWhatnotMethods,
  ...uiSyncMethods,
  ...uiWorkspaceMethods
};

