import { fireEvent, screen, type RenderOptions } from "@testing-library/vue";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { nextTick, reactive, type Component } from "vue";
import AuthGateCard from "../../src/components/shell/AuthGateCard.vue";
import AutoCalculateModal from "../../src/components/modals/AutoCalculateModal.vue";
import SaleEditorModal from "../../src/components/shell/SaleEditorModal.vue";
import PortfolioReportModal from "../../src/components/shell/PortfolioReportModal.vue";
import PortfolioWindow from "../../src/components/windows/portfolio/PortfolioWindow.vue";
import { createPortfolioWindowPorts, portfolioWindowPortsKey } from "../../src/components/windows/portfolio/portfolioWindowPorts.ts";
import { buyerProfilePortsKey } from "../../src/components/customers/buyerProfilePorts.ts";
import SystemConfigurationDialog from "../../src/components/shell/SystemConfigurationDialog.vue";
import ConfigWindow from "../../src/components/windows/config/ConfigWindow.vue";
import { createInitialState } from "../../src/app-core/state.ts";
import { configLotMethods } from "../../src/app-core/methods/config-lots.ts";
import WorkspaceModals from "../../src/components/shell/WorkspaceModals.vue";
import WheelCreateGameDialog from "../../src/components/windows/game/dialogs/WheelCreateGameDialog.vue";
import WhatnotCsvImportDialog from "../../src/components/windows/whatnot/WhatnotCsvImportDialog.vue";
import { commerceDialogPortsKey } from "../../src/components/modals/commerceDialogPorts.ts";
import { shellPortsKey } from "../../src/components/shell/shellPorts.ts";
import { createWorkspaceDialogPorts, workspaceDialogPortsKey } from "../../src/components/shell/workspaceDialogPorts.ts";
import { createConfigWindowPorts, configWindowPortsKey } from "../../src/components/windows/config/configWindowPorts.ts";
import { whatnotDialogPortsKey } from "../../src/components/windows/whatnot/whatnotDialogPorts.ts";
import { renderWithApp } from "./render.ts";
import { makeLot } from "../helpers/fixtures.ts";
import { translateAppMessage } from "../../src/app-core/i18n/index.ts";
import { vuetify } from "../../src/vuetify.ts";

let originalPortfolioReportViewportWidth: number | undefined;
afterEach(() => {
  if (originalPortfolioReportViewportWidth == null) return;
  window.innerWidth = originalPortfolioReportViewportWidth;
  window.dispatchEvent(new Event("resize"));
  vuetify.display.update();
  originalPortfolioReportViewportWidth = undefined;
});

function renderWithCapabilities(
  component: Parameters<typeof renderWithApp>[0],
  key: symbol,
  capabilities: Record<string, unknown>,
  options: RenderOptions<Component> = {}
) {
  return renderWithApp(component, {
    ...options,
    global: {
      ...options.global,
      provide: { ...options.global?.provide, [key]: capabilities }
    }
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
    shellCreateWorkspaceAccessHint: "You’ll be its first member and owner. Anyone you invite can access the copied data after they accept and join.",
    shellWorkspaceNameLabel: "Workspace name",
    shellCreateWorkspaceConfirmAction: "Create workspace",
    shellSharedWorkspaceTitle: "Shared workspace",
    shellLeaveWorkspaceTitle: "Leave shared workspace",
    shellLeaveWorkspaceOwnerBody: "Choose a new owner or delete this workspace.",
    shellLeaveWorkspaceMemberBody: "Leave this shared workspace.",
    shellLeaveWorkspaceAction: "Leave workspace",
    shellLeaveWorkspaceDeleteConfirm: "Supprimer définitivement cet espace de travail partagé",
    configSellingTitle: "Selling",
    configSystemConfigurationTitle: "System configuration",
    configSystemConfigurationHelp: "Default seller assumptions stay separate from lot overrides.",
    configSystemDefaultsTitle: "System defaults",
    configSystemDefaultsHelp: "These defaults apply to new lots.",
    configSystemDefaultsAutosaveHelp: "Changes are saved automatically as you edit. They take effect immediately for new lots and current lots that use system defaults.",
    portfolioAmountsCurrencyLabel: "All monetary amounts in CAD",
    configSellingTaxesLabel: "Selling taxes",
    configAverageBuyerShippingLabel: "Average buyer shipping",
    configFeeProfileLabel: "Fee profile",
    configFeeProfileWhatnot: "Whatnot",
    configFeeProfileNoFees: "No fees",
    configLotOverridesTitle: "Lot overrides",
    configLotOverridesHelp: "Override defaults for this lot.",
    configUseSystemPricingDefaultsLabel: "Use system pricing defaults",
    configWhatnotVerticalLabel: "Whatnot category",
    configWhatnotVerticalLegacyHint: "Choose a category to estimate commission.",
    configWhatnotVerticalUnclassified: "Unclassified",
    configWhatnotVerticalSports: "Sports",
    configWhatnotVerticalTcg: "Trading card games",
    configWhatnotVerticalFashion: "Fashion",
    configWhatnotVerticalOtherCollectibles: "Other collectibles",
    configWhatnotVerticalCoins: "Coins",
    configWhatnotVerticalOther: "Other",
    configMarketplaceSkuLabel: "Importer depuis l’identifiant utilisateur",
    configMarketplaceSkuPlaceholder: "External SKU",
    commonClose: "Close",
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
    saleEditorAddAction: "Add sale",
    portfolioReportTitle: "Portfolio report",
    portfolioReportCloseAction: "Close report",
    portfolioReportGeneratedOnLabel: "Generated on",
    portfolioReportCopyAction: "Copy report",
    portfolioReportSaveAction: "Print report"
  } as Record<string, string>)[key] ?? key;
}

describe("workflow dialog scenarios", () => {
  test("root dialogs delegate to AppDialogShell with their current state", () => {
    const template = readFileSync("src/App.html", "utf8");
    for (const model of [
      "showNewLotModal",
      "showRenameLotModal",
      "showVerifyPurchaseModal",
      "showStripeCheckoutModal",
      "confirmDialog"
    ]) {
      expect(template).toMatch(new RegExp(`<app-dialog-shell[^>]*(?:v-model|:model-value)="${model}(?:\\s|")`));
    }
    expect(template).not.toMatch(/<v-dialog\b/);
  });

  test("migrated compact dialog controls preserve a 44px interaction target", () => {
    const rootTemplate = readFileSync("src/App.html", "utf8");
    const appStyles = readFileSync("src/styles/app.css", "utf8");
    const designTokens = readFileSync("src/styles/design-tokens.css", "utf8");
    const systemTemplate = readFileSync("src/components/shell/SystemConfigurationDialog.html", "utf8");
    const systemStyles = readFileSync("src/components/shell/SystemConfigurationDialog.css", "utf8");
    const saleTemplate = readFileSync("src/components/shell/SaleEditorModal.html", "utf8");
    const saleStyles = readFileSync("src/components/shell/SaleEditorModal.css", "utf8");

    expect(designTokens).toMatch(/--app-action-size-min:\s*44px;/);
    expect(designTokens).toMatch(/--app-touch-target-min:\s*var\(--app-action-size-min\);/);
    expect(rootTemplate.match(/app-responsive-segment-toggle/g) ?? []).toHaveLength(3);
    expect(appStyles).toMatch(/\.segment-toggle\.app-responsive-segment-toggle \.v-btn\s*\{[^}]*min-height:\s*var\(--app-touch-target-min\)\s*!important;[^}]*height:\s*auto\s*!important;/s);
    expect(systemTemplate.match(/class="app-touch-target" value="(?:CAD|USD)"/g) ?? []).toHaveLength(4);
    expect(systemStyles).toMatch(/\.config-system-dialog \.pill-toggle \.v-btn\s*\{[^}]*min-height:\s*var\(--app-touch-target-min\)\s*!important;[^}]*height:\s*auto\s*!important;/s);
    expect(saleTemplate).toMatch(/class="[^"]*sale-editor-singles-line-delete[^"]*app-touch-target[^"]*"/);
    expect(saleStyles).toMatch(/\.sale-editor-singles-line-delete\s*\{[^}]*min-width:\s*var\(--app-touch-target-min\)\s*!important;[^}]*min-height:\s*var\(--app-touch-target-min\)\s*!important;/s);
  });

  test("root segments and portfolio report actions expose narrow-screen wrapping contracts", () => {
    const rootTemplate = readFileSync("src/App.html", "utf8");
    const appStyles = readFileSync("src/styles/app.css", "utf8");
    const reportTemplate = readFileSync("src/components/shell/PortfolioReportModal.html", "utf8");
    const reportStyles = readFileSync("src/components/shell/PortfolioReportModal.css", "utf8");

    expect(rootTemplate.match(/app-responsive-segment-toggle/g) ?? []).toHaveLength(3);
    expect(appStyles).toMatch(/\.app-responsive-segment-toggle\s*\{[^}]*flex-wrap:\s*wrap;[^}]*height:\s*auto\s*!important;/s);
    expect(appStyles).toMatch(/@media \(max-width:\s*360px\)[\s\S]*\.app-responsive-segment-toggle \.v-btn\s*\{[^}]*flex:\s*1 1 100%;/);
    expect(reportTemplate).toMatch(/class="portfolio-report-secondary-actions"/);
    expect(reportTemplate).toMatch(/t\('portfolioAmountsCurrencyLabel'\)/);
    expect(reportStyles).toMatch(/\.portfolio-report-secondary-actions\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/s);
    expect(reportStyles).toMatch(/@media \(max-width:\s*360px\)[\s\S]*\.portfolio-report-secondary-actions > \*\s*\{[^}]*flex:\s*1 1 100%;/);
  });

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

  test("creates a named workspace through the shared form actions", async () => {
    const ctx = workspaceContext("personal");
    renderWithCapabilities(WorkspaceModals, workspaceDialogPortsKey, ctx);

    expect(screen.getByRole("dialog", { name: "Create workspace" })).toBeVisible();
    expect(screen.getByLabelText("Workspace name")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create workspace" }).closest(".app-form-actions")).not.toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));

    expect(ctx.createWorkspace).toHaveBeenCalledOnce();
  });

  test("explains who can access copied data when creating a shared workspace", () => {
    renderWithCapabilities(WorkspaceModals, workspaceDialogPortsKey, workspaceContext("personal"));

    expect(screen.getByText("You’ll be its first member and owner. Anyone you invite can access the copied data after they accept and join.")).toBeVisible();
  });

  test("renders the approved French workspace copy in the real creation dialog", () => {
    const ctx = workspaceContext("personal");
    ctx.t = (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateAppMessage("fr-CA", key, params);

    renderWithCapabilities(WorkspaceModals, workspaceDialogPortsKey, ctx);

    expect(screen.getByRole("dialog", { name: "Créer un espace partagé" })).toBeVisible();
    expect(screen.getByText("Ce nouvel espace partagé reprend une copie de vos inventaires, de vos jeux et de vos paramètres de vente. Les ventes ne sont pas copiées.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Créer l’espace partagé" })).toBeVisible();
  });

  test.each(["en", undefined] as const)("renders the existing English workspace copy with the real translator (%s)", (language) => {
    const ctx = workspaceContext("personal");
    ctx.t = (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateAppMessage(language, key, params);

    renderWithCapabilities(WorkspaceModals, workspaceDialogPortsKey, ctx);

    expect(screen.getByRole("dialog", { name: "Create shared workspace" })).toBeVisible();
    expect(screen.getByText("This starts a new shared workspace and copies your current Personal data into it.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create workspace" })).toBeVisible();
  });

  test("keeps creation disabled outside Personal scope with the real French translator", () => {
    const ctx = workspaceContext("workspace");
    ctx.t = (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateAppMessage("fr-CA", key, params);

    renderWithCapabilities(WorkspaceModals, workspaceDialogPortsKey, ctx);

    expect(screen.getByRole("button", { name: "Créer l’espace partagé" })).toBeDisabled();
  });

  test("renders the owner invite action and member list with French labels", async () => {
    const ctx = workspaceContext("workspace");
    Object.assign(ctx, {
      showCreateWorkspaceModal: false,
      showWorkspaceMembersModal: true,
      isCurrentWorkspaceOwner: true,
      currentWorkspaceName: "Équipe de Zoé",
      workspaceMembers: [
        { userId: "owner-12345678", workspaceId: "ws_team", role: "owner", status: "active", updatedAt: "2026-04-11T12:00:00.000Z" },
        { userId: "member-12345678", workspaceId: "ws_team", role: "member", status: "active", updatedAt: "2026-04-11T12:00:00.000Z" }
      ],
      t: (key: string, params?: Record<string, string | number | null | undefined>) =>
        translateAppMessage("fr-CA", key, params)
    });

    renderWithCapabilities(WorkspaceModals, workspaceDialogPortsKey, ctx);

    const invite = screen.getByRole("button", { name: "Créer un lien d’invitation" });
    expect(invite).toBeVisible();
    expect(invite).toHaveTextContent("Inviter");
    expect(screen.getByText("Propriétaire")).toBeVisible();
    expect(screen.getByText("Membre")).toBeVisible();
    expect(screen.getByText("Équipe de Zoé")).toBeVisible();
    await fireEvent.click(invite);
    expect(ctx.createWorkspaceJoinLink).toHaveBeenCalledOnce();
  });

  test("renders a named French join prompt without translating the workspace name", () => {
    const ctx = workspaceContext("personal");
    Object.assign(ctx, {
      showCreateWorkspaceModal: false,
      showWorkspaceJoinDialog: true,
      pendingWorkspaceInviteTargetName: "Équipe de Zoé",
      t: (key: string, params?: Record<string, string | number | null | undefined>) =>
        translateAppMessage("fr-CA", key, params)
    });

    renderWithCapabilities(WorkspaceModals, workspaceDialogPortsKey, ctx);

    expect(screen.getByRole("dialog", { name: "Rejoindre l’espace partagé" })).toBeVisible();
    expect(screen.getByText("Rejoindre l’espace partagé « Équipe de Zoé » ?")).toBeVisible();
    expect(screen.getByText("Cet espace partagé sera ajouté à côté de votre espace Personnel.")).toBeVisible();
  });

  test("explains the active-member transfer choice to an owner", () => {
    const ctx = workspaceContext("workspace");
    Object.assign(ctx, {
      showCreateWorkspaceModal: false,
      showLeaveWorkspaceModal: true,
      isCurrentWorkspaceOwner: true,
      workspaceMembers: [
        { userId: "owner-12345678", workspaceId: "ws_team", role: "owner", status: "active", updatedAt: "2026-04-11T12:00:00.000Z" },
        { userId: "member-12345678", workspaceId: "ws_team", role: "member", status: "active", updatedAt: "2026-04-11T12:00:00.000Z" }
      ],
      t: (key: string, params?: Record<string, string | number | null | undefined>) =>
        translateAppMessage("fr-CA", key, params)
    });

    renderWithCapabilities(WorkspaceModals, workspaceDialogPortsKey, ctx);

    expect(screen.getByText("S’il reste un autre membre actif, transférez-lui la propriété avant de quitter. Si vous êtes le dernier membre, confirmez la suppression de l’espace partagé.")).toBeVisible();
    expect(screen.getByLabelText("Nouveau propriétaire")).toBeVisible();
    expect(screen.queryByLabelText("Je comprends que l’espace partagé sera supprimé pour tous ses membres.")).toBeNull();
  });

  test("shows the existing deletion confirmation only to the sole owner", () => {
    const ctx = workspaceContext("workspace");
    Object.assign(ctx, {
      showCreateWorkspaceModal: false,
      showLeaveWorkspaceModal: true,
      isCurrentWorkspaceOwner: true,
      workspaceMembers: [
        { userId: "owner-12345678", workspaceId: "ws_team", role: "owner", status: "active", updatedAt: "2026-04-11T12:00:00.000Z" }
      ],
      t: (key: string, params?: Record<string, string | number | null | undefined>) =>
        translateAppMessage("fr-CA", key, params)
    });

    renderWithCapabilities(WorkspaceModals, workspaceDialogPortsKey, ctx);

    expect(screen.getByLabelText("Je comprends que l’espace partagé sera supprimé pour tous ses membres.")).toBeVisible();
    expect(screen.queryByLabelText("Nouveau propriétaire")).toBeNull();
  });

  test("explains that a member returns to their separate Personal scope", () => {
    const ctx = workspaceContext("workspace");
    Object.assign(ctx, {
      showCreateWorkspaceModal: false,
      showLeaveWorkspaceModal: true,
      isCurrentWorkspaceOwner: false,
      t: (key: string, params?: Record<string, string | number | null | undefined>) =>
        translateAppMessage("fr-CA", key, params)
    });

    renderWithCapabilities(WorkspaceModals, workspaceDialogPortsKey, ctx);

    expect(screen.getByText("Vous perdrez l’accès à cet espace partagé et reviendrez à votre espace Personnel.")).toBeVisible();
    expect(screen.queryByLabelText("Je comprends que l’espace partagé sera supprimé pour tous ses membres.")).toBeNull();
  });

  test("keeps destructive workspace copy visible in the owner confirmation", () => {
    const ctx = workspaceContext("workspace");
    ctx.showCreateWorkspaceModal = false;
    ctx.showLeaveWorkspaceModal = true;
    ctx.isCurrentWorkspaceOwner = true;
    renderWithCapabilities(WorkspaceModals, workspaceDialogPortsKey, ctx);

    expect(screen.getByText("Supprimer définitivement cet espace de travail partagé")).toBeVisible();
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

  test("keeps a long French Whatnot validation message readable", async () => {
    renderWithCapabilities(WhatnotCsvImportDialog, whatnotDialogPortsKey, whatnotContext(false));

    const dialog = await screen.findByRole("dialog", { name: "Import Whatnot CSV" });
    expect(dialog.querySelector(".app-dialog-content")).not.toBeNull();
    expect(screen.getByText("Map your fields.")).toHaveClass("app-text-wrap");
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

  test("renders the French sale editor labels through the real translator", () => {
    const ctx = saleEditorContext();
    ctx.t = (key: string) => translateAppMessage("fr-CA", key);
    renderWithCapabilities(SaleEditorModal, commerceDialogPortsKey, ctx);

    expect(screen.getAllByText("Acheteur").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Quantité").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Frais de livraison payés par l’acheteur").length).toBeGreaterThan(0);
  });

  test("sale image errors hide the line thumbnail column and only the menu thumbnail", async () => {
    const base = saleEditorContext();
    const ctx = {
      ...base,
      currentLotType: "singles",
      newSale: {
        ...base.newSale,
        singlesItems: [{ lineId: "line-1", singlesPurchaseEntryId: 7, quantity: 1, price: 12 }]
      },
      singlesSaleCardOptions: [{ value: 7, title: "Card", item: "Card", image: "broken-card.png", quantity: 1, costBasis: 2 }],
      getSinglesSaleLineMaxQuantity: () => 1,
      onSinglesSaleLineCardSelectionChange: vi.fn(),
      saleEditorLineProfitPreviews: [],
      saleEditorProfitPreview: null,
      addSinglesSaleLine: vi.fn(),
      onSinglesSaleLinePriceChange: vi.fn()
    };
    renderWithCapabilities(SaleEditorModal, commerceDialogPortsKey, ctx);

    const lineColumn = document.querySelector<HTMLElement>(".sale-editor-line-thumb-col");
    const lineImage = document.querySelector<HTMLImageElement>(".sale-editor-line-thumb");
    expect(lineColumn).not.toBeNull();
    expect(lineImage).not.toBeNull();
    await fireEvent.error(lineImage!);
    expect(lineColumn!.style.display).toBe("none");

    const itemPicker = screen.getByRole("combobox", { name: "saleEditorItemOptionalLabel" });
    await fireEvent.mouseDown(itemPicker);
    await screen.findAllByText("Card");
    const menuImage = document.querySelector<HTMLImageElement>(".sale-editor-dropdown-thumb");
    expect(menuImage).not.toBeNull();
    await fireEvent.error(menuImage!);
    expect(menuImage!.hidden).toBe(true);
  });

  test("selects a sale type and saves through the shared form actions", async () => {
    const ctx = saleEditorContext();
    renderWithCapabilities(SaleEditorModal, commerceDialogPortsKey, ctx);

    expect(screen.getByRole("dialog", { name: "Add sale" })).toBeVisible();
    expect(screen.getByLabelText("Type")).toBeVisible();
    const typeInput = screen.getByLabelText("Type");
    await fireEvent.mouseDown(typeInput);
    await fireEvent.click(await screen.findByText("Box"));
    expect(ctx.onNewSaleTypeChange).toHaveBeenCalledWith("box");

    const saveButton = screen.getByRole("button", { name: "Add sale" });
    expect(saveButton.closest(".app-form-actions")).not.toBeNull();
    await fireEvent.click(saveButton);
    expect(ctx.saveSale).toHaveBeenCalledOnce();
  });

test("SystemConfigurationDialog no longer owns lot SKU or Shopify controls", () => {
  const systemTemplate = readFileSync("src/components/shell/SystemConfigurationDialog.html", "utf8");
  const editTemplate = readFileSync("src/App.html", "utf8");
  const pickerTemplate = readFileSync("src/components/windows/shopify/ShopifyProductPicker.vue", "utf8");
  expect(systemTemplate).not.toMatch(/configMarketplaceSkuLabel|configShopifyPublishLabel|shopifyEnabled/);
  expect(editTemplate).toMatch(/v-model="renameLotExternalSku"/);
  expect(editTemplate).toMatch(/<shopify-lot-integration[\s\S]*?:state="\{ listing: shopifyEditListing[\s\S]*?@query-change="onShopifyEditQueryChange"/);
  expect(pickerTemplate).toMatch(/t\('configShopifySectionTitle'\)/);
  expect(pickerTemplate).toMatch(/t\('configShopifyPickerOpen'\)/);
});


test("closes system configuration without changing its labeled inputs", async () => {
    const ctx = systemConfigurationContext();
    renderWithCapabilities(SystemConfigurationDialog, workspaceDialogPortsKey, ctx);

    expect(screen.getByRole("dialog", { name: "System configuration" })).toBeVisible();
    expect(screen.getByText("Changes are saved automatically as you edit. They take effect immediately for new lots and current lots that use system defaults.")).toBeVisible();
    expect(screen.getAllByLabelText("Selling taxes")).toHaveLength(2);
    await fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(ctx.showSystemConfigurationDialog).toBe(false);
  });

  test("bulk lot setup displays fee status without exposing the category editor", async () => {
    const categorizedLot = makeLot({ id: 81, usesSystemPricingDefaults: true, whatnotVertical: "coins" });
    const state = reactive({
      ...createInitialState(),
      ...systemConfigurationContext(),
      currentLotId: categorizedLot.id,
      lots: [categorizedLot],
      currentLotUsesSystemPricingDefaults: true,
      whatnotVertical: "coins",
      saveLotsToStorage: vi.fn(),
      getCurrentSetup: configLotMethods.getCurrentSetup,
      autoSaveSetup: configLotMethods.autoSaveSetup,
      setCurrentLotWhatnotVertical: configLotMethods.setCurrentLotWhatnotVertical
    }) as unknown as ReturnType<typeof createInitialState> & Record<string, any>;
    state.whatnotFeeSummary = {
      currentTier: 1, previousPeriodGrossCad: 22_500, currentPeriodGrossCad: 4_000,
      nextThresholdCad: 10_000, isEstimate: true, missingLotIds: [81],
      periodStart: "2026-09-21", periodEndExclusive: "2026-10-19",
      previousPeriodStart: "2026-08-24", previousPeriodEndExclusive: "2026-09-21"
    };
    state.t = translate;
    state.formatCurrency = (value: number | null | undefined) => String(value ?? 0);
    state.formatDate = () => "2026-09-24";
    state.currentWorkspaceName = "Personal";
    state.onPurchaseConfigChange = vi.fn();
    state.updatePurchaseCostInput = vi.fn();
    state.requestPurchaseUiMode = vi.fn();
    renderWithApp(ConfigWindow, {
      global: {
        provide: { [configWindowPortsKey as symbol]: createConfigWindowPorts(state as never) },
        stubs: { AdminSyncImportCard: true }
      }
    });

    expect(screen.getByText("configWhatnotFeeStatusTitle")).toBeVisible();
    expect(screen.getByText("configWhatnotFeeStatusProgress", { exact: false })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Whatnot category" })).toBeNull();
  });

  test("closes and prints the portfolio report through its preserved actions", async () => {
    const closeContext = portfolioReportContext();
    const closeRender = renderWithCapabilities(PortfolioReportModal, commerceDialogPortsKey, closeContext);
    expect(screen.getByRole("dialog", { name: "Portfolio report" })).toBeVisible();
    await fireEvent.click(screen.getAllByRole("button", { name: "Close report" })[0]);
    expect(closeContext.showPortfolioReportModal).toBe(false);
    closeRender.unmount();

    const printContext = portfolioReportContext();
    renderWithCapabilities(PortfolioReportModal, commerceDialogPortsKey, printContext);
    await fireEvent.click(screen.getByRole("button", { name: "Print report" }));
    expect(printContext.savePortfolioReportTable).toHaveBeenCalledOnce();
  });

  test("renders Portfolio report row values and types in French and English on desktop", async () => {
    await setPortfolioReportViewport(1440);
    expect(vuetify.display.lgAndUp.value).toBe(true);

    for (const locale of ["fr-CA", "en"] as const) {
      const context = portfolioReportFixture(locale);
      const rendered = renderWithCapabilities(PortfolioReportModal, commerceDialogPortsKey, context);
      const table = document.querySelector<HTMLTableElement>("table.portfolio-report-table");
      expect(table).not.toBeNull();
      const headerCells = [...table!.querySelectorAll<HTMLTableCellElement>("thead th")];
      const rows = [...table!.querySelectorAll<HTMLTableRowElement>("tbody tr")];
      const lotA = rows.find((row) => row.cells[0]?.textContent?.trim() === "Lot A");
      const lotB = rows.find((row) => row.cells[0]?.textContent?.trim() === "Lot B");
      expect(lotA).toBeDefined();
      expect(lotB).toBeDefined();

      const typeIndex = headerCells.findIndex((cell) => cell.textContent?.trim() === "Type");
      expect(typeIndex).toBeGreaterThanOrEqual(0);
      expect(lotA!.cells[typeIndex]?.textContent?.trim()).toBe(locale === "fr-CA" ? "Groupé" : "Bulk");
      expect(lotB!.cells[typeIndex]?.textContent?.trim()).toBe(locale === "fr-CA" ? "Individuel" : "Singles");

      expectTableMetric(lotA!, headerCells, locale === "fr-CA" ? "Revenu net des ventes" : "Sold revenue", "$30.00");
      expectTableMetric(lotA!, headerCells, locale === "fr-CA" ? "Coût des items vendus" : "Sold cost", "$14.00");
      expectTableMetric(lotA!, headerCells, locale === "fr-CA" ? "Profit des ventes réalisées" : "Realized profit", "+$16.00");
      expectTableMetric(lotA!, headerCells, locale === "fr-CA" ? "Solde de récupération" : "Investment recovery balance", "+$6.00");
      expect(context.allLotPerformance[0]?.realizedCost).toBe(14);
      expect(context.allLotPerformance[0]?.totalProfit).toBe(6);
      rendered.unmount();
    }
  });

  test("renders the French Portfolio report metrics in the Lot A mobile card", async () => {
    await setPortfolioReportViewport(375);
    expect(vuetify.display.lgAndUp.value).toBe(false);
    const rendered = renderWithCapabilities(PortfolioReportModal, commerceDialogPortsKey, portfolioReportFixture("fr-CA"));
    expect(document.querySelector("table.portfolio-report-table")).toBeNull();
    const card = document.querySelector<HTMLElement>(".portfolio-report-card");
    expect(card).not.toBeNull();
    expect(card!.querySelector(".portfolio-report-card-title")?.textContent).toContain("Lot A");
    expectCardMetric(card!, "Revenu net des ventes", "$30.00");
    expectCardMetric(card!, "Coût des items vendus", "$14.00");
    expectCardMetric(card!, "Profit des ventes réalisées", "+$16.00");
    expectCardMetric(card!, "Solde de récupération", "+$6.00");
    rendered.unmount();
  });

  test("renders the attribution note only in a shared Portfolio and localizes the drilldown editor column", async () => {
    const makePortfolioPorts = (activeScopeType: "personal" | "workspace") => createPortfolioWindowPorts(reactive({
      activeScopeType,
      activeWorkspaceId: activeScopeType === "workspace" ? "workspace-1" : null,
      currentLotId: 1,
      googleAvatarLoadFailed: [],
      lots: [makeLot({ id: 1, name: "Lot A" })],
      portfolioChartView: "sales",
      portfolioSection: "analytics",
      portfolioDashboardPreset: "all",
      portfolioLotFilterIds: [],
      portfolioLotTypeFilter: "both",
      portfolioReceiptFilter: "all",
      portfolioReceiptSummary: {
        received: { lotCount: 1, totalCost: 8 },
        awaiting: { lotCount: 0, totalCost: 0 },
        nextExpectedReceiptDate: null,
        realizedProfit: 4,
        capitalToRecover: 4
      },
      portfolioSalesGrouping: "person",
      portfolioSalesByUserMetric: "count",
      portfolioSalesByUserPeriod: "all",
      preferredLanguage: "fr-CA",
      salesByLotId: new Map([[1, [{ id: 1, type: "pack", quantity: 1, packsCount: 1, price: 12,
        buyerShipping: 0, date: "2026-10-20", customer: "Buyer Fred" }]]]),
      workspaceMembers: [],
      googleProfilePicture: null,
      allLotPerformance: [{ lotId: 1, lotName: "Lot A", lotType: "Bulk", salesCount: 1, totalRevenue: 12, totalCost: 8,
        totalProfit: 4, realizedCost: 8, realizedProfit: 4, realizedMarginPercent: 33.3, soldPacks: 1, totalPacks: 2,
        lastSaleDate: "2026-10-20", forecastProfitAverage: null, forecastRevenueAverage: null, forecastScenarioCount: 0 }],
      averagePortfolioForecastScenario: null,
      hasPortfolioData: true,
      hasPortfolioSalesByUserData: true,
      portfolioLotFilterItems: [],
      portfolioSalesByUserChartData: { weeks: [{ key: "2026-10-19", label: "Oct 19" }],
        series: [{ key: "self", label: "Vous", values: [1], total: 1, color: "#F7B500" }] },
      portfolioSalesByUserDrilldownRows: [{ weekKey: "2026-10-19", weekLabel: "Oct 19", saleId: 1, lotId: 1,
        lotName: "Lot A", itemLabel: "Paquet", date: "2026-10-20", dateLabel: "2026-10-20", sellerKey: "self",
        sellerLabel: "Vous", quantity: 1, revenue: 12, profit: 4 }],
      portfolioTotals: { lotCount: 1, profitableLotCount: 1, totalSalesCount: 1, totalRevenue: 12, totalCost: 8, totalProfit: 4 },
      togglePortfolioChartView: vi.fn(),
      formatDate: (value: string) => value,
      t: (key: string) => translateAppMessage("fr-CA", key),
      formatCurrency: (value: number | null | undefined) => String(value ?? 0),
      getBuyerProfile: () => null,
      getWorkspaceMemberPresenceState: () => "offline"
    } as never));

    const shared = renderWithCapabilities(PortfolioWindow, portfolioWindowPortsKey, makePortfolioPorts("workspace"), {
      global: { provide: { [buyerProfilePortsKey as symbol]: {
        buyerProfilesByKey: {}, buyerProfileSaveStates: {}, getBuyerProfile: () => null,
        saveBuyerProfile: vi.fn(), resolveBuyerProfileConflict: vi.fn()
      } } }
    });
    expect(screen.getByText("Les ventes sont attribuées au dernier utilisateur qui les a modifiées.")).toBeVisible();
    await fireEvent.click(screen.getByRole("button", { name: /Voir les ventes pour/ }));
    expect(screen.getAllByText("Dernière modification par").length).toBeGreaterThan(0);
    await fireEvent.click(screen.getByRole("button", { name: "Fermer le détail des ventes" }));
    expect(document.querySelector(".portfolio-sales-by-user-card")).toBeVisible();
    await fireEvent.click(screen.getByRole("button", { name: "Détails" }));
    await fireEvent.click(screen.getByRole("button", { name: "Performance des acheteurs" }));
    expect(screen.getByRole("textbox", { name: "Rechercher des acheteurs" })).toBeVisible();
    expect(screen.getAllByText("Acheteur").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dernier achat").length).toBeGreaterThan(0);
    shared.unmount();

    renderWithCapabilities(PortfolioWindow, portfolioWindowPortsKey, makePortfolioPorts("personal"), {
      global: { provide: { [buyerProfilePortsKey as symbol]: {
        buyerProfilesByKey: {}, buyerProfileSaveStates: {}, getBuyerProfile: () => null,
        saveBuyerProfile: vi.fn(), resolveBuyerProfileConflict: vi.fn()
      } } }
    });
    expect(screen.queryByText("Les ventes sont attribuées au dernier utilisateur qui les a modifiées.")).toBeNull();
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

function saleEditorContext() {
  return {
    showAddSaleModal: true, editingSale: null, currentLotType: "pack", hasLotSelected: true, hasProAccess: true, canUsePaidActions: true,
    newSale: { type: "pack", quantity: 1, price: 20, customer: "", buyerShipping: 0, date: "2026-07-15", memo: "" },
    t: translate, cancelSale: vi.fn(), saveSale: vi.fn(), onNewSaleTypeChange: vi.fn(), formatCurrency: (value: number) => value.toFixed(2)
  };
}

function systemConfigurationContext() {
  return {
    ...workspaceContext("personal"),
    showCreateWorkspaceModal: false,
    showSystemConfigurationDialog: true,
    systemPricingDefaults: { sellingCurrency: "CAD", targetProfitPercent: 20, sellingTaxPercent: 13, sellingShippingPerOrder: 5, feeProfilePreset: "whatnot", spotsPerBox: 10 },
    hasProAccess: true,
    externalSku: "",
    sellingCurrency: "CAD",
    targetProfitPercent: 20,
    sellingTaxPercent: 13,
    sellingShippingPerOrder: 5,
    feeProfilePreset: "whatnot",
    spotsPerBox: 10,
    currentLotType: "singles",
    whatnotVertical: null,
    currentLotUsesSystemPricingDefaults: false,
    hasLotSelected: true,
    onSystemPricingDefaultsChange: vi.fn(),
    setSystemFeeProfilePreset: vi.fn(),
    setCurrentLotSystemPricingDefaultsMode: vi.fn(),
    setCurrentLotWhatnotVertical: vi.fn(),
    onPurchaseConfigChange: vi.fn(),
    setFeeProfilePreset: vi.fn(),
    accessProFeature: vi.fn()
  };
}

function portfolioReportContext() {
  return {
    showPortfolioReportModal: true,
    portfolioReportExpandedLotIds: [],
    allLotPerformance: [],
    hasPortfolioData: true,
    togglePortfolioReportLot: vi.fn(),
    copyPortfolioReportTable: vi.fn(),
    savePortfolioReportTable: vi.fn(),
    formatCurrency: (value: number) => value.toFixed(2),
    formatDate: () => "August 11, 2026",
    t: translate
  };
}

function portfolioReportFixture(locale: "fr-CA" | "en") {
  return {
    ...portfolioReportContext(),
    portfolioReportExpandedLotIds: [1],
    allLotPerformance: [{
      lotId: 1, lotName: "Lot A", lotType: "Bulk", salesCount: 2, soldPacks: 3, totalPacks: 8,
      totalRevenue: 30, realizedCost: 14, realizedProfit: 16, totalProfit: 6,
      realizedMarginPercent: 53.3, forecastProfitAverage: 9, lastSaleDate: "2026-10-20"
    }, {
      lotId: 2, lotName: "Lot B", lotType: "Singles", salesCount: 1, soldPacks: 1, totalPacks: 4,
      totalRevenue: 20, realizedCost: 12, realizedProfit: 8, totalProfit: 3,
      realizedMarginPercent: 40, forecastProfitAverage: 7, lastSaleDate: "2026-10-19"
    }],
    t: (key: string) => translateAppMessage(locale, key)
  };
}

async function setPortfolioReportViewport(width: number) {
  if (originalPortfolioReportViewportWidth == null) originalPortfolioReportViewportWidth = window.innerWidth;
  window.innerWidth = width;
  window.dispatchEvent(new Event("resize"));
  vuetify.display.update();
  await nextTick();
}

function normalizedText(element: Element | null | undefined) {
  return element?.textContent?.replace(/\s+/g, " ").trim();
}

function expectTableMetric(row: HTMLTableRowElement, headers: HTMLTableCellElement[], label: string, expected: string) {
  const columnIndex = headers.findIndex((cell) => normalizedText(cell) === label);
  expect(columnIndex, `missing report column ${label}`).toBeGreaterThanOrEqual(0);
  expect(normalizedText(row.cells[columnIndex])).toBe(expected);
}

function expectCardMetric(card: HTMLElement, label: string, expected: string) {
  const metric = [...card.querySelectorAll<HTMLElement>(".portfolio-report-card-metric")]
    .find((candidate) => normalizedText(candidate.querySelector(".portfolio-report-card-label")) === label);
  expect(metric, `missing report card metric ${label}`).toBeDefined();
  expect(normalizedText(metric!.querySelector(".portfolio-report-card-value"))).toBe(expected);
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
    whatnotCsvSellerAccountId: "",
    whatnotCsvMapOrderId: null,
    whatnotCsvMapTitle: null,
    whatnotCsvMapQuantity: null,
    whatnotCsvMapPrice: null,
    whatnotCsvMapDate: null,
    whatnotCsvMapExternalSaleId: null,
    whatnotCsvMapOrderItemId: null,
    whatnotCsvMapSellerAccountId: null,
    whatnotCsvMapSku: null,
    whatnotCsvMapBuyerName: null,
    whatnotCsvMapListingTitle: null,
    whatnotCsvMapOrderPlacedAt: null,
    whatnotCsvMapOriginalItemPrice: null,
    whatnotCsvMapBuyerShipping: null,
    whatnotCsvMapOrderStatus: null,
    t: translate,
    formatCurrency: (value: number) => value.toFixed(2),
    loadWhatnotCsvFile: vi.fn(),
    closeWhatnotCsvDialog: vi.fn(),
    confirmWhatnotCsvImport: vi.fn()
  };
}
