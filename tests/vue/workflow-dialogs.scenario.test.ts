import { fireEvent, screen } from "@testing-library/vue";
import { describe, expect, test, vi } from "vitest";
import AuthGateCard from "../../src/components/shell/AuthGateCard.vue";
import AutoCalculateModal from "../../src/components/modals/AutoCalculateModal.vue";
import SaleEditorModal from "../../src/components/shell/SaleEditorModal.vue";
import WorkspaceModals from "../../src/components/shell/WorkspaceModals.vue";
import WheelCreateGameDialog from "../../src/components/windows/game/dialogs/WheelCreateGameDialog.vue";
import WhatnotCsvImportDialog from "../../src/components/windows/whatnot/WhatnotCsvImportDialog.vue";
import { commerceDialogPortsKey } from "../../src/components/modals/commerceDialogPorts.ts";
import { shellPortsKey } from "../../src/components/shell/shellPorts.ts";
import { workspaceDialogPortsKey } from "../../src/components/shell/workspaceDialogPorts.ts";
import { whatnotDialogPortsKey } from "../../src/components/windows/whatnot/whatnotDialogPorts.ts";
import { renderWithApp } from "./render.ts";

function renderWithCapabilities(
  component: Parameters<typeof renderWithApp>[0],
  key: symbol,
  capabilities: Record<string, unknown>
) {
  return renderWithApp(component, {
    global: { provide: { [key]: capabilities } }
  });
}

function translate(key: string): string {
  return ({
    authContinueWithGoogleAction: "Continue with Google",
    authGoogleFallbackHint: "Use Google to continue.",
    authGoogleFallbackAction: "Continue with Google",
    priceCalculatorTitle: "Profit calculator",
    configTargetProfitLabel: "Target profit",
    priceCalculatorRoundHint: "Rounded to the nearest cent",
    priceCalculatorProNotice: "A Pro subscription is required.",
    priceCalculatorUnlockProAction: "Unlock Pro",
    commonCancel: "Cancel",
    commonApply: "Apply",
    shellCreateWorkspaceTitle: "Create workspace",
    shellCreateWorkspaceBody: "Create a shared workspace.",
    shellWorkspaceNameLabel: "Workspace name",
    shellCreateWorkspaceConfirmAction: "Create workspace",
    wheelCreateGameTitle: "Create a game",
    wheelGameTypeWheelLabel: "Wheel",
    wheelCreateWheelBody: "Spin a wheel.",
    wheelGameTypeGridLabel: "Grid",
    wheelCreateGridBody: "Reveal a grid.",
    bracketBattleGameLabel: "Bracket",
    bracketBattleCreateBody: "Run a bracket.",
    whatnotCsvTitle: "Import Whatnot CSV",
    whatnotCsvCloseAction: "Close import",
    whatnotCsvIntro: "Upload a Whatnot report.",
    whatnotCsvUploadLabel: "CSV file",
    whatnotCsvUploadHint: "Choose a CSV file.",
    whatnotCsvReadyTitle: "Ready to import",
    whatnotCsvPreflightWillImport: "2 of 3 rows will import.",
    whatnotCsvPreflightDateAndPrice: "Date and price detected.",
    whatnotCsvPreflightRowsLabel: "Rows",
    whatnotCsvPreflightGrossLabel: "Gross",
    whatnotCsvPreflightFeesLabel: "Fees",
    whatnotCsvPreflightNetLabel: "Net",
    whatnotCsvPreflightBuyerPaidLabel: "Buyer paid",
    whatnotCsvPreflightReadyRows: "2 ready",
    whatnotCsvPreflightSkippedRows: "1 skipped",
    whatnotCsvAdvancedMappingTitle: "Advanced mapping",
    whatnotCsvAdvancedMappingHelp: "Map your fields.",
    whatnotCsvPreviewLabel: "Preview",
    whatnotCsvPreviewRowLabel: "Row 1",
    whatnotCsvPreviewFieldsLabel: "fields",
    whatnotPrepareReviewAction: "Prepare review",
    saleEditorAddTitle: "Add sale",
    saleEditorBulkSubtitle: "Record a bulk sale.",
    saleEditorSectionDetailsLabel: "Details",
    saleEditorTypeItemLabel: "Pack",
    saleEditorTypeBoxLabel: "Box",
    saleEditorTypeRandomHitLabel: "Random hit",
    saleEditorTypeLabel: "Type",
    saleEditorQuantityLabel: "Quantity",
    saleEditorPricePerItemLabel: "Price",
    saleEditorSectionNotesLabel: "Notes",
    salesCustomerLabel: "Customer",
    saleEditorBuyerShippingLabel: "Buyer shipping",
    saleEditorDateLabel: "Date",
    saleEditorNotesLabel: "Notes",
    saleEditorAddAction: "Add sale"
  } as Record<string, string>)[key] ?? key;
}

describe("workflow dialog scenarios", () => {
  test("starts native Google sign-in from the primary Android action", async () => {
    const promptGoogleSignIn = vi.fn();
    renderWithCapabilities(AuthGateCard, shellPortsKey, {
      authGateTitle: "Welcome", authGateSubtitle: "Sign in to continue",
      showNativeGoogleSignInAction: true, showGoogleSignInFallback: false,
      t: translate, promptGoogleSignIn
    });

    await fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(promptGoogleSignIn).toHaveBeenCalledOnce();
    expect(screen.queryByText("Use Google to continue.")).toBeNull();
  });

  test("starts Google fallback sign-in from the authentication gate", async () => {
    const promptGoogleSignIn = vi.fn();
    renderWithCapabilities(AuthGateCard, shellPortsKey, {
      authGateTitle: "Welcome", authGateSubtitle: "Sign in to continue",
      showNativeGoogleSignInAction: false, showGoogleSignInFallback: true,
      t: translate, promptGoogleSignIn
    });

    await fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(promptGoogleSignIn).toHaveBeenCalledOnce();
  });

  test("does not show the fallback action while Google sign-in is available", () => {
    renderWithCapabilities(AuthGateCard, shellPortsKey, {
      authGateTitle: "Welcome", authGateSubtitle: "Sign in to continue",
      showNativeGoogleSignInAction: false, showGoogleSignInFallback: false,
      t: translate, promptGoogleSignIn: vi.fn()
    });
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
  });

  test("keeps protected profit calculation disabled while offering an upgrade", () => {
    renderWithCapabilities(AutoCalculateModal, commerceDialogPortsKey, {
      showProfitCalculator: true, targetProfitPercent: 15, canUsePaidActions: false, hasLotSelected: true, hasProAccess: false,
      isVerifyingPurchase: false, showManualPurchaseVerify: false, t: translate, startProPurchase: vi.fn(), calculateOptimalPrices: vi.fn()
    });

    expect(screen.getByRole("button", { name: "Unlock Pro" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  test("starts the upgrade flow when a locked calculator user asks to unlock", async () => {
    const startProPurchase = vi.fn();
    renderWithCapabilities(AutoCalculateModal, commerceDialogPortsKey, {
      showProfitCalculator: true, targetProfitPercent: 15, canUsePaidActions: false, hasLotSelected: true, hasProAccess: false,
      isVerifyingPurchase: false, showManualPurchaseVerify: false, t: translate, startProPurchase, calculateOptimalPrices: vi.fn()
    });
    await fireEvent.click(screen.getByRole("button", { name: "Unlock Pro" }));
    expect(startProPurchase).toHaveBeenCalledOnce();
  });

  test("applies a permitted profit calculation", async () => {
    const calculateOptimalPrices = vi.fn();
    renderWithCapabilities(AutoCalculateModal, commerceDialogPortsKey, {
      showProfitCalculator: true, targetProfitPercent: 15, canUsePaidActions: true, hasLotSelected: true, hasProAccess: true,
      isVerifyingPurchase: false, showManualPurchaseVerify: false, t: translate, startProPurchase: vi.fn(), calculateOptimalPrices
    });
    await fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(calculateOptimalPrices).toHaveBeenCalledOnce();
  });

  test("cancels workspace creation without calling the create boundary", async () => {
    const createWorkspace = vi.fn();
    const ctx = {
      showCreateWorkspaceModal: true, newWorkspaceName: "Team", isCreatingWorkspace: false, activeScopeType: "personal", t: translate, createWorkspace,
      showWorkspaceMembersModal: false, showLeaveWorkspaceModal: false, isCurrentWorkspaceOwner: false, isLeavingWorkspace: false,
      leaveCurrentWorkspace: vi.fn(), workspaceMembers: [], isWorkspaceMembersLoading: false, currentWorkspaceName: "", isCreatingWorkspaceJoinLink: false,
      createWorkspaceJoinLink: vi.fn(), openLeaveWorkspaceModal: vi.fn(), getWorkspaceMemberPresenceState: () => "offline",
      getWorkspaceMemberPresenceLabel: () => "Offline", formatDate: () => "", removeWorkspaceMember: vi.fn(),
      leaveWorkspaceTransferMemberUserId: null, leaveWorkspaceDeleteConfirmation: false, showWorkspaceJoinDialog: false,
      pendingWorkspaceInviteTargetName: "", isAcceptingWorkspaceInvite: false, dismissPendingWorkspaceInvite: vi.fn(), acceptPendingWorkspaceInvite: vi.fn()
    };
    renderWithCapabilities(WorkspaceModals, workspaceDialogPortsKey, ctx);

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(ctx.showCreateWorkspaceModal).toBe(false);
    expect(createWorkspace).not.toHaveBeenCalled();
  });

  test("does not allow workspace creation while already in a shared workspace", () => {
    const ctx = workspaceContext("workspace");
    renderWithCapabilities(WorkspaceModals, workspaceDialogPortsKey, ctx);
    expect(screen.getByRole("button", { name: "Create workspace" })).toBeDisabled();
  });

  test("creates a wheel game from the game-type chooser", async () => {
    const createNewGameConfig = vi.fn();
    renderWithApp(WheelCreateGameDialog, { props: { ctx: { wheelCreateDialog: true, t: translate, createNewGameConfig, closeWheelCreateDialog: vi.fn() } } });

    await fireEvent.click(screen.getByRole("button", { name: /Wheel/ }));

    expect(createNewGameConfig).toHaveBeenCalledWith("wheel");
  });

  test("creates a grid game from the game-type chooser", async () => {
    const createNewGameConfig = vi.fn();
    renderWithApp(WheelCreateGameDialog, { props: { ctx: { wheelCreateDialog: true, t: translate, createNewGameConfig, closeWheelCreateDialog: vi.fn() } } });
    await fireEvent.click(screen.getByRole("button", { name: /Grid/ }));
    expect(createNewGameConfig).toHaveBeenCalledWith("grid");
  });

  test("creates a bracket game from the game-type chooser", async () => {
    const createNewGameConfig = vi.fn();
    renderWithApp(WheelCreateGameDialog, { props: { ctx: { wheelCreateDialog: true, t: translate, createNewGameConfig, closeWheelCreateDialog: vi.fn() } } });
    await fireEvent.click(screen.getByRole("button", { name: /Bracket/ }));
    expect(createNewGameConfig).toHaveBeenCalledWith("bracket");
  });

  test("renders a ready Whatnot preflight and enables review preparation", () => {
    renderWithCapabilities(WhatnotCsvImportDialog, whatnotDialogPortsKey, whatnotContext(true));

    expect(screen.getByText("Ready to import")).toBeVisible();
    expect(screen.getByRole("button", { name: "Prepare review" })).toBeEnabled();
  });

  test("prepares a ready Whatnot import for review", async () => {
    const ctx = whatnotContext(true);
    renderWithCapabilities(WhatnotCsvImportDialog, whatnotDialogPortsKey, ctx);
    await fireEvent.click(screen.getByRole("button", { name: "Prepare review" }));
    expect(ctx.confirmWhatnotCsvImport).toHaveBeenCalledOnce();
  });

  test("keeps incomplete Whatnot mapping disabled and lets the seller close the dialog", async () => {
    const ctx = whatnotContext(false);
    renderWithCapabilities(WhatnotCsvImportDialog, whatnotDialogPortsKey, ctx);

    expect(screen.getByRole("button", { name: "Prepare review" })).toBeDisabled();
    await fireEvent.click(screen.getByRole("button", { name: "Close import" }));
    expect(ctx.closeWhatnotCsvDialog).toHaveBeenCalledOnce();
  });

  test("cancels a sale editor without saving the current draft", async () => {
    const cancelSale = vi.fn();
    const saveSale = vi.fn();
    renderWithCapabilities(SaleEditorModal, commerceDialogPortsKey, {
      showAddSaleModal: true, editingSale: null, currentLotType: "pack", hasLotSelected: true, hasProAccess: true, canUsePaidActions: true,
      newSale: { type: "pack", quantity: 1, price: 20, customer: "", buyerShipping: 0, date: "2026-07-15", memo: "" },
      t: translate, cancelSale, saveSale, onNewSaleTypeChange: vi.fn(), formatCurrency: (value: number) => value.toFixed(2)
    });

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(cancelSale).toHaveBeenCalledOnce();
    expect(saveSale).not.toHaveBeenCalled();
  });

  test("does not allow a locked seller to save a sale", () => {
    renderWithCapabilities(SaleEditorModal, commerceDialogPortsKey, {
      showAddSaleModal: true, editingSale: null, currentLotType: "pack", hasLotSelected: true, hasProAccess: false, canUsePaidActions: false,
      newSale: { type: "pack", quantity: 1, price: 20, customer: "", buyerShipping: 0, date: "2026-07-15", memo: "" },
      t: translate, cancelSale: vi.fn(), saveSale: vi.fn(), startProPurchase: vi.fn(), isVerifyingPurchase: false, showManualPurchaseVerify: false,
      onNewSaleTypeChange: vi.fn(), formatCurrency: (value: number) => value.toFixed(2)
    });
    expect(screen.getByRole("button", { name: "Add sale" })).toBeDisabled();
  });
});

function workspaceContext(activeScopeType: "personal" | "workspace") {
  return {
    showCreateWorkspaceModal: true, newWorkspaceName: "Team", isCreatingWorkspace: false, activeScopeType, t: translate, createWorkspace: vi.fn(),
    showWorkspaceMembersModal: false, showLeaveWorkspaceModal: false, isCurrentWorkspaceOwner: false, isLeavingWorkspace: false,
    leaveCurrentWorkspace: vi.fn(), workspaceMembers: [], isWorkspaceMembersLoading: false, currentWorkspaceName: "", isCreatingWorkspaceJoinLink: false,
    createWorkspaceJoinLink: vi.fn(), openLeaveWorkspaceModal: vi.fn(), getWorkspaceMemberPresenceState: () => "offline",
    getWorkspaceMemberPresenceLabel: () => "Offline", formatDate: () => "", removeWorkspaceMember: vi.fn(),
    leaveWorkspaceTransferMemberUserId: null, leaveWorkspaceDeleteConfirmation: false, showWorkspaceJoinDialog: false,
    pendingWorkspaceInviteTargetName: "", isAcceptingWorkspaceInvite: false, dismissPendingWorkspaceInvite: vi.fn(), acceptPendingWorkspaceInvite: vi.fn()
  };
}

function whatnotContext(ready: boolean) {
  return {
    showWhatnotCsvImportDialog: true,
    whatnotCsvHeaders: ["Order ID"],
    whatnotCsvPresetReady: ready,
    whatnotCsvWeeklyPreflight: { detected: true, importableRows: 2, totalRows: 3, grossAmount: 30, feeAmount: 3, netAmount: 27, buyerPaidAmount: 35, skippedRows: 1, issueCount: 0 },
    whatnotCsvRequiredMappedCount: ready ? 4 : 2,
    whatnotCsvOptionalMappedCount: 1,
    whatnotCsvDetectedDateHeader: "Order date",
    whatnotCsvDetectedPriceHeader: "Sale total",
    whatnotCsvRequiredMappingsComplete: ready,
    whatnotCsvColumnOptions: [],
    whatnotCsvRows: [],
    whatnotCsvPreviewColumns: [],
    t: translate,
    formatCurrency: (value: number) => value.toFixed(2),
    loadWhatnotCsvFile: vi.fn(),
    closeWhatnotCsvDialog: vi.fn(),
    confirmWhatnotCsvImport: vi.fn()
  };
}
