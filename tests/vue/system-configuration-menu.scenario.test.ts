import { fireEvent, screen, within } from "@testing-library/vue";
import { defineComponent, Fragment, h, nextTick, provide, reactive } from "vue";
import { expect, test, vi } from "vitest";
import { createInitialState } from "../../src/app-core/state.ts";
import AppShellTopBar from "../../src/components/shell/AppShellTopBar.vue";
import SystemConfigurationDialog from "../../src/components/shell/SystemConfigurationDialog.vue";
import WorkspaceModals from "../../src/components/shell/WorkspaceModals.vue";
import ShopifyConnectDialog from "../../src/components/windows/shopify/ShopifyConnectDialog.vue";
import { uiShopifyMethods } from "../../src/app-core/methods/ui/shopify/shopify.ts";
import { translateAppMessage } from "../../src/app-core/i18n/index.ts";
import { singlesComputed } from "../../src/app-core/computed/singles.ts";
import { appComputed } from "../../src/app-core/computed.ts";
import { configLotMethods } from "../../src/app-core/methods/config-lots.ts";
import { configPricingMethods } from "../../src/app-core/methods/config-pricing.ts";
import { createShellPorts, shellPortsKey } from "../../src/components/shell/shellPorts.ts";
import { createWorkspaceDialogPorts, workspaceDialogPortsKey } from "../../src/components/shell/workspaceDialogPorts.ts";
import { renderWithApp } from "./render.ts";

function createShellState() {
  return reactive({
    ...createInitialState(),
    activeScopeType: "personal" as const,
    availableWorkspaces: [],
    currentWorkspaceName: "Personal",
    activeWorkspaceVisibleMembers: [],
    lotItems: [],
    t: (key: string) => key
  });
}

function useRealPricingComputedState(state: ReturnType<typeof createShellState>) {
  Object.defineProperties(state, {
    hasLotSelected: {
      configurable: true,
      get: () => singlesComputed.hasLotSelected.call(state as never)
    },
    currentLotType: {
      configurable: true,
      get: () => singlesComputed.currentLotType.call(state as never)
    },
    currentLotUsesSystemPricingDefaults: {
      configurable: true,
      get: () => singlesComputed.currentLotUsesSystemPricingDefaults.call(state as never)
    }
  });
}

function useRealWorkspaceComputedState(state: ReturnType<typeof createShellState>) {
  Object.defineProperties(state, {
    currentWorkspaceName: { configurable: true, get: () => appComputed.currentWorkspaceName.call(state as never) },
    isWorkspaceScopeActive: { configurable: true, get: () => appComputed.isWorkspaceScopeActive.call(state as never) },
    isCurrentWorkspaceOwner: { configurable: true, get: () => appComputed.isCurrentWorkspaceOwner.call(state as never) },
    activeWorkspaceVisibleMembers: { configurable: true, get: () => appComputed.activeWorkspaceVisibleMembers.call(state as never) },
    activeWorkspaceOverflowMemberCount: { configurable: true, get: () => appComputed.activeWorkspaceOverflowMemberCount.call(state as never) },
    workspaceRealtimeTitle: { configurable: true, get: () => appComputed.workspaceRealtimeTitle.call(state as never) },
    workspaceRealtimeSubtitle: { configurable: true, get: () => appComputed.workspaceRealtimeSubtitle.call(state as never) },
    workspaceRealtimeIcon: { configurable: true, get: () => appComputed.workspaceRealtimeIcon.call(state as never) },
    workspaceRealtimeManualRefreshVisible: { configurable: true, get: () => appComputed.workspaceRealtimeManualRefreshVisible.call(state as never) },
    workspaceRealtimeManualRefreshLabel: { configurable: true, get: () => appComputed.workspaceRealtimeManualRefreshLabel.call(state as never) }
  });
}

test("choosing System Configuration from the account menu opens its dialog", async () => {
  const state = createShellState();
  const Harness = defineComponent({
    setup() {
      provide(shellPortsKey, createShellPorts(state as never));
      provide(workspaceDialogPortsKey, createWorkspaceDialogPorts(state as never));
      return () => h(Fragment, [h(AppShellTopBar), h(SystemConfigurationDialog)]);
    }
  });

  renderWithApp(Harness);
  await fireEvent.click(screen.getByRole("button", { name: "accountMenuLabel" }));
  expect(await screen.findByText("shellIntegrationsSectionLabel")).toBeVisible();
  expect(await screen.findByText("shellShopifyTitle")).toBeVisible();
  await fireEvent.click(await screen.findByText("configSystemConfigurationAction"));

  expect(state.showSystemConfigurationDialog).toBe(true);
  expect(await screen.findByRole("dialog", { name: "configSystemConfigurationTitle" })).toBeVisible();
});

test("French Personal menu exposes the approved shared workspace creation action", async () => {
  const state = createShellState() as ReturnType<typeof createShellState> & Record<string, unknown>;
  const openWorkspaceMembersModal = vi.fn();
  Object.assign(state, {
    preferredLanguage: "fr-CA",
    activeScopeType: "personal",
    activeWorkspaceId: null,
    availableWorkspaces: [],
    workspaceRealtimeStatus: "idle",
    t: (key: string, params?: Record<string, string | number | null | undefined>) => translateAppMessage("fr-CA", key, params),
    createWorkspace: vi.fn(),
    createWorkspaceJoinLink: vi.fn(),
    openWorkspaceMembersModal,
    openLeaveWorkspaceModal: vi.fn(),
    getWorkspaceMemberPresenceState: () => "offline",
    getWorkspaceMemberPresenceLabel: () => "Hors ligne",
    formatDate: () => "11 avr. 2026",
    workspaceMembers: [],
    showWorkspaceJoinDialog: false,
    isAcceptingWorkspaceInvite: false,
    dismissPendingWorkspaceInvite: vi.fn(),
    acceptPendingWorkspaceInvite: vi.fn(),
    leaveCurrentWorkspace: vi.fn(),
    removeWorkspaceMember: vi.fn(),
    leaveWorkspaceTransferMemberUserId: "",
    leaveWorkspaceDeleteConfirmation: false
  });
  useRealWorkspaceComputedState(state);
  const Harness = defineComponent({
    setup() {
      provide(shellPortsKey, createShellPorts(state as never));
      provide(workspaceDialogPortsKey, createWorkspaceDialogPorts(state as never));
      return () => h(Fragment, [h(AppShellTopBar), h(WorkspaceModals)]);
    }
  });

  renderWithApp(Harness);
  await fireEvent.click(screen.getByRole("button", { name: translateAppMessage("fr-CA", "accountMenuLabel") }));
  expect(await screen.findByText("Espaces")).toBeVisible();
  await fireEvent.click(await screen.findByText("Créer un espace partagé"));
  expect(await screen.findByRole("dialog", { name: "Créer un espace partagé" })).toBeVisible();
});

test("French shared menu renders management and realtime status from the real computed state", async () => {
  const state = createShellState() as ReturnType<typeof createShellState> & Record<string, unknown>;
  const openWorkspaceMembersModal = vi.fn();
  Object.assign(state, {
    preferredLanguage: "fr-CA",
    activeScopeType: "workspace",
    activeWorkspaceId: "ws_team",
    availableWorkspaces: [{ workspaceId: "ws_team", name: "Équipe de Zoé", role: "owner", status: "active" }],
    workspaceRealtimeStatus: "idle",
    t: (key: string, params?: Record<string, string | number | null | undefined>) => translateAppMessage("fr-CA", key, params),
    createWorkspace: vi.fn(),
    createWorkspaceJoinLink: vi.fn(),
    openWorkspaceMembersModal,
    openLeaveWorkspaceModal: vi.fn(),
    getWorkspaceMemberPresenceState: () => "offline",
    getWorkspaceMemberPresenceLabel: () => "Hors ligne",
    formatDate: () => "11 avr. 2026",
    workspaceMembers: [],
    showWorkspaceJoinDialog: false,
    isAcceptingWorkspaceInvite: false,
    dismissPendingWorkspaceInvite: vi.fn(),
    acceptPendingWorkspaceInvite: vi.fn(),
    leaveCurrentWorkspace: vi.fn(),
    removeWorkspaceMember: vi.fn(),
    leaveWorkspaceTransferMemberUserId: "",
    leaveWorkspaceDeleteConfirmation: false
  });
  useRealWorkspaceComputedState(state);
  const Harness = defineComponent({
    setup() {
      provide(shellPortsKey, createShellPorts(state as never));
      provide(workspaceDialogPortsKey, createWorkspaceDialogPorts(state as never));
      return () => h(Fragment, [h(AppShellTopBar), h(WorkspaceModals)]);
    }
  });

  renderWithApp(Harness);
  await fireEvent.click(screen.getByRole("button", { name: translateAppMessage("fr-CA", "accountMenuLabel") }));
  expect(await screen.findByText("Gérer l’espace partagé")).toBeVisible();
  expect(screen.getByText("Mises à jour en temps réel inactives")).toBeVisible();
  expect(screen.getByText("Les mises à jour en temps réel sont inactives.")).toBeVisible();
  Object.assign(state, { workspaceRealtimeStatus: "connected" });
  await nextTick();
  expect(screen.getByText("Espace partagé connecté en temps réel")).toBeVisible();
  expect(screen.getByText("Les mises à jour de l’espace partagé sont en temps réel.")).toBeVisible();
  Object.assign(state, { workspaceRealtimeStatus: "reconnecting" });
  await nextTick();
  expect(screen.getByText("Reconnexion en temps réel à l’espace partagé")).toBeVisible();
  await fireEvent.click(screen.getByText("Gérer l’espace partagé"));
  expect(openWorkspaceMembersModal).toHaveBeenCalledOnce();
});

test.each([
  ["bulk", "Pour les boîtes, le pourcentage est calculé sur le coût total du lot.", "Pour les items individuels, le pourcentage s’ajoute à la valeur de marché lorsqu’elle est positive, sinon au coût d’achat."],
  ["singles", "Pour les items individuels, le pourcentage s’ajoute à la valeur de marché lorsqu’elle est positive, sinon au coût d’achat.", "Pour les boîtes, le pourcentage est calculé sur le coût total du lot."]
] as const)("System Configuration shows French profit guidance for %s lots", async (lotType, specificHelp, otherHelp) => {
  const state = createShellState() as ReturnType<typeof createShellState> & Record<string, unknown>;
  Object.assign(state, {
    showSystemConfigurationDialog: true,
    preferredLanguage: "fr-CA",
    t: (key: string) => translateAppMessage("fr-CA", key),
    hasLotSelected: true,
    currentLotType: lotType,
    currentLotUsesSystemPricingDefaults: false,
    hasProAccess: true,
    systemPricingDefaults: { sellingCurrency: "CAD", targetProfitPercent: 20, sellingTaxPercent: 0, sellingShippingPerOrder: 0, feeProfilePreset: "none", spotsPerBox: 1 },
    targetProfitPercent: 20,
    sellingCurrency: "CAD",
    sellingTaxPercent: 0,
    sellingShippingPerOrder: 0,
    feeProfilePreset: "none",
    onSystemPricingDefaultsChange: vi.fn(),
    onPurchaseConfigChange: vi.fn(),
    setCurrentLotSystemPricingDefaultsMode(value: boolean) { this.currentLotUsesSystemPricingDefaults = value; }
  });
  const Harness = defineComponent({
    setup() {
      provide(workspaceDialogPortsKey, createWorkspaceDialogPorts(state as never));
      return () => h(SystemConfigurationDialog);
    }
  });

  renderWithApp(Harness);
  const dialog = screen.getByRole("dialog", { name: "Paramètres de vente" });
  expect(dialog).toBeVisible();
  expect(within(dialog).getByText("Les nouveaux lots utilisent ces paramètres par défaut. Pour un lot actuel, vous pouvez conserver les paramètres par défaut ou définir des paramètres propres à ce lot.")).toBeVisible();
  const defaultsSection = within(dialog).getByRole("heading", { name: "Paramètres par défaut" }).closest("section");
  const lotSection = within(dialog).getByRole("heading", { name: "Paramètres du lot" }).closest("section");
  expect(defaultsSection).not.toBeNull();
  expect(lotSection).not.toBeNull();
  expect(within(defaultsSection!).getByText("Ces paramètres s’appliquent aux nouveaux lots et aux lots actuels qui utilisent les paramètres par défaut.")).toBeVisible();
  expect(within(defaultsSection!).getByText("Les modifications sont enregistrées automatiquement pendant la saisie. Elles s’appliquent immédiatement aux nouveaux lots et aux lots actuels qui utilisent les paramètres par défaut.")).toBeVisible();
  expect(within(lotSection!).getByText("Le lot sélectionné utilise les paramètres par défaut ou ses propres paramètres.")).toBeVisible();
  expect(within(defaultsSection!).getByText("Pour les boîtes, le pourcentage est calculé sur le coût total du lot.")).toBeVisible();
  expect(within(defaultsSection!).getByText("Pour les items individuels, le pourcentage s’ajoute à la valeur de marché lorsqu’elle est positive, sinon au coût d’achat.")).toBeVisible();
  expect(within(lotSection!).getByText(specificHelp)).toBeVisible();
  expect(within(lotSection!).queryByText(otherHelp)).toBeNull();
  expect(screen.getAllByLabelText("Taux de taxe de vente (%)")).toHaveLength(2);
  expect(screen.getAllByLabelText("Livraison moyenne payée par l’acheteur, par commande")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Ouvrir le calculateur de prix" })).toBeVisible();
  if (lotType === "singles") {
    expect(screen.queryByLabelText("Nombre de spots par boîte (Random hit, RTYH)")).toBeNull();
  } else {
    expect(screen.getAllByLabelText("Nombre de spots par boîte (Random hit, RTYH)")).toHaveLength(2);
  }
});

test("no-lot computed state disables lot actions and shows no inherited-lot alert", () => {
  const state = createShellState() as ReturnType<typeof createShellState> & Record<string, unknown>;
  Object.assign(state, {
    showSystemConfigurationDialog: true,
    t: (key: string) => translateAppMessage("fr-CA", key),
    hasProAccess: false,
    systemPricingDefaults: { sellingCurrency: "CAD", targetProfitPercent: 0, sellingTaxPercent: 0, sellingShippingPerOrder: 0, feeProfilePreset: "none", spotsPerBox: 1 }
  });
  useRealPricingComputedState(state);
  const Harness = defineComponent({
    setup() {
      provide(workspaceDialogPortsKey, createWorkspaceDialogPorts(state as never));
      return () => h(SystemConfigurationDialog);
    }
  });

  renderWithApp(Harness);
  expect(state.currentLotUsesSystemPricingDefaults).toBe(false);
  expect(state.hasLotSelected).toBe(false);
  expect(screen.getByLabelText("Utiliser les paramètres par défaut")).toBeDisabled();
  expect(screen.getByRole("spinbutton", { name: "Profit cible" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Passez à Pro pour débloquer le calculateur de prix" })).toBeDisabled();
  expect(screen.getAllByRole("spinbutton", { name: "Taux de taxe de vente (%)" })).toHaveLength(2);
  expect(screen.queryByText("Ce lot utilise les paramètres par défaut. Modifiez ces paramètres pour tous les lots qui les utilisent, ou désactivez cette option pour personnaliser ce lot.")).toBeNull();
});

test("non-Pro custom lot retains the localized calculator upgrade name", () => {
  const state = createShellState() as ReturnType<typeof createShellState> & Record<string, unknown>;
  Object.assign(state, {
    showSystemConfigurationDialog: true,
    t: (key: string) => translateAppMessage("fr-CA", key),
    hasLotSelected: true,
    currentLotType: "singles",
    currentLotUsesSystemPricingDefaults: false,
    hasProAccess: false,
    systemPricingDefaults: { sellingCurrency: "CAD", targetProfitPercent: 0, sellingTaxPercent: 0, sellingShippingPerOrder: 0, feeProfilePreset: "none", spotsPerBox: 1 },
    targetProfitPercent: 0,
    sellingCurrency: "CAD",
    sellingTaxPercent: 0,
    sellingShippingPerOrder: 0,
    feeProfilePreset: "none"
  });
  const Harness = defineComponent({
    setup() {
      provide(workspaceDialogPortsKey, createWorkspaceDialogPorts(state as never));
      return () => h(SystemConfigurationDialog);
    }
  });

  renderWithApp(Harness);
  expect(screen.getByRole("button", { name: "Passez à Pro pour débloquer le calculateur de prix" })).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Profit cible" })).toHaveValue("Passez à Pro pour définir un profit cible");
});

test("French account menu labels and opens the sales settings dialog", async () => {
  const state = createShellState();
  state.preferredLanguage = "fr-CA";
  state.t = (key: string) => translateAppMessage("fr-CA", key);
  const Harness = defineComponent({
    setup() {
      provide(shellPortsKey, createShellPorts(state as never));
      provide(workspaceDialogPortsKey, createWorkspaceDialogPorts(state as never));
      return () => h(Fragment, [h(AppShellTopBar), h(SystemConfigurationDialog)]);
    }
  });

  renderWithApp(Harness);
  await fireEvent.click(screen.getByRole("button", { name: "Menu du compte" }));
  expect(await screen.findByText("Paramètres de vente par défaut et paramètres propres à chaque lot")).toBeVisible();
  await fireEvent.click(screen.getByText("Paramètres de vente", { selector: ".v-list-item-title" }));
  expect(await screen.findByRole("dialog", { name: "Paramètres de vente" })).toBeVisible();
});

test.each([
  ["explicit English", "en"],
  ["default English", undefined]
] as const)("real menu and dialog render English copy with %s translation preference", async (_caseName, language) => {
  const state = createShellState();
  Object.assign(state, { preferredLanguage: language });
  state.t = (key: string) => translateAppMessage(language, key);
  const Harness = defineComponent({
    setup() {
      provide(shellPortsKey, createShellPorts(state as never));
      provide(workspaceDialogPortsKey, createWorkspaceDialogPorts(state as never));
      return () => h(Fragment, [h(AppShellTopBar), h(SystemConfigurationDialog)]);
    }
  });

  renderWithApp(Harness);
  await fireEvent.click(screen.getByRole("button", { name: translateAppMessage(language, "accountMenuLabel") }));
  expect(await screen.findByText("Seller defaults, fees, and lot overrides")).toBeVisible();
  await fireEvent.click(screen.getByText("System configuration", { selector: ".v-list-item-title" }));

  const dialog = await screen.findByRole("dialog", { name: "System configuration" });
  expect(dialog).toBeVisible();
  expect(within(dialog).getByText("Default seller assumptions stay out of the first setup step. New lots use them automatically, and each lot can override them when needed.")).toBeVisible();
  const defaultsSection = within(dialog).getByRole("heading", { name: "System defaults" }).closest("section");
  expect(defaultsSection).not.toBeNull();
  expect(within(defaultsSection!).getByText("These defaults apply to new lots and every current lot that is not customized.")).toBeVisible();
  expect(within(defaultsSection!).getByText("Changes are saved automatically as you edit. They take effect immediately for new lots and current lots that use system defaults.")).toBeVisible();
  expect(within(defaultsSection!).getByText("For boxes, the percentage is calculated on the total lot cost.")).toBeVisible();
  expect(within(defaultsSection!).getByText("For individual items, the percentage is added to a positive market value, or to the purchase cost otherwise.")).toBeVisible();
});

test("real pricing methods preserve custom lot values and only update the selected lot", async () => {
  const defaults = {
    sellingCurrency: "CAD",
    targetProfitPercent: 20,
    sellingTaxPercent: 0,
    sellingShippingPerOrder: 0,
    feeProfilePreset: "none",
    platformFeePercent: 0,
    additionalFeePercent: 0,
    additionalFeeAppliesTo: "sale_only",
    fixedFeePerOrder: 0,
    spotsPerBox: 5
  };
  const selectedLot = { id: 1, name: "Inherited lot", usesSystemPricingDefaults: true, ...defaults };
  const otherLot = { id: 2, name: "Other lot", usesSystemPricingDefaults: false, ...defaults, sellingTaxPercent: 7.5, targetProfitPercent: 11 };
  const state = createShellState() as ReturnType<typeof createShellState> & Record<string, unknown>;
  Object.assign(state, {
    showSystemConfigurationDialog: true,
    t: (key: string) => translateAppMessage("fr-CA", key),
    preferredLanguage: "fr-CA",
    currentLotId: selectedLot.id,
    lots: [selectedLot, otherLot],
    systemPricingDefaults: { ...defaults },
    hasProAccess: true,
    totalCaseCost: 100,
    boxesPurchased: 1,
    totalSpots: 5,
    totalPacks: 5,
    targetProfitPercent: 20,
    sellingCurrency: "CAD",
    sellingTaxPercent: 0,
    sellingShippingPerOrder: 0,
    feeProfilePreset: "none",
    platformFeePercent: 0,
    additionalFeePercent: 0,
    additionalFeeAppliesTo: "sale_only",
    fixedFeePerOrder: 0,
    spotsPerBox: 5,
    purchaseDate: "2026-10-22",
    purchaseShippingCost: 0,
    purchaseTaxPercent: 0,
    costInputMode: "total",
    currency: "CAD",
    exchangeRate: 1,
    includeTax: false,
    whatnotVertical: "tcg",
    externalSku: "",
    shopifyEnabled: false,
    spotPrice: 1,
    boxPriceSell: 120,
    packPrice: 24,
    saveLotsToStorage: vi.fn(),
    syncLivePricesFromDefaults: vi.fn(),
    autoSaveSetup: configLotMethods.autoSaveSetup,
    getCurrentSetup: configLotMethods.getCurrentSetup,
    recalculateDefaultPrices: configPricingMethods.recalculateDefaultPrices,
    onPurchaseConfigChange: configPricingMethods.onPurchaseConfigChange,
    setCurrentLotSystemPricingDefaultsMode: configPricingMethods.setCurrentLotSystemPricingDefaultsMode
  });
  useRealPricingComputedState(state);
  const Harness = defineComponent({
    setup() {
      provide(workspaceDialogPortsKey, createWorkspaceDialogPorts(state as never));
      return () => h(SystemConfigurationDialog);
    }
  });

  renderWithApp(Harness);
  expect(state.currentLotUsesSystemPricingDefaults).toBe(true);
  expect(screen.getByText("Ce lot utilise les paramètres par défaut. Modifiez ces paramètres pour tous les lots qui les utilisent, ou désactivez cette option pour personnaliser ce lot.")).toBeVisible();
  await fireEvent.click(screen.getByLabelText("Utiliser les paramètres par défaut"));
  expect(state.currentLotUsesSystemPricingDefaults).toBe(false);
  expect((state.lots as typeof selectedLot[])[0]?.sellingTaxPercent).toBe(0);
  expect((state.lots as typeof selectedLot[])[1]?.sellingTaxPercent).toBe(7.5);
  const taxField = screen.getAllByRole("spinbutton", { name: "Taux de taxe de vente (%)" })[1]!;
  expect(taxField).toBeEnabled();
  await fireEvent.update(taxField, "1.25");
  expect(state.sellingTaxPercent).toBe(1.25);
  expect((state.lots as typeof selectedLot[])[0]?.sellingTaxPercent).toBe(1.25);
  expect((state.lots as typeof selectedLot[])[1]?.sellingTaxPercent).toBe(7.5);
  await fireEvent.click(screen.getByLabelText("Utiliser les paramètres par défaut"));
  expect(state.currentLotUsesSystemPricingDefaults).toBe(true);
  expect(state.sellingTaxPercent).toBe(0);
  expect((state.lots as typeof selectedLot[])[0]?.sellingTaxPercent).toBe(0);
  expect((state.lots as typeof selectedLot[])[1]?.sellingTaxPercent).toBe(7.5);
});

test("the account menu shows Shopify when integrations are unconfigured", async () => {
  const state = createShellState();
  state.whatnotConnectionStatus = "unconfigured";
  state.shopifyConnectionStatus = "unconfigured";
  const Harness = defineComponent({
    setup() {
      provide(shellPortsKey, createShellPorts(state as never));
      return () => h(AppShellTopBar);
    }
  });

  renderWithApp(Harness);
  await fireEvent.click(screen.getByRole("button", { name: "accountMenuLabel" }));
  expect(await screen.findByText("shellIntegrationsSectionLabel")).toBeInTheDocument();
  expect(await screen.findByText("shellShopifyTitle")).toBeInTheDocument();
  expect(await screen.findByText("shellShopifyUnavailable")).toBeInTheDocument();
});

test("System Configuration keeps Whatnot category editing in lot setup", async () => {
  const state = createShellState() as ReturnType<typeof createShellState> & Record<string, unknown>;
  Object.assign(state, {
    showSystemConfigurationDialog: true,
    hasLotSelected: true,
    whatnotVertical: "tcg",
    feeProfilePreset: "whatnot",
    setCurrentLotWhatnotVertical(vertical: string) { this.whatnotVertical = vertical; },
    whatnotFeeSummary: {
      currentTier: 2,
      previousPeriodGrossCad: 22_500,
      currentPeriodGrossCad: 4_000,
      nextThresholdCad: 10_000,
      isEstimate: true,
      missingLotIds: [2],
      periodStart: "2026-09-21",
      periodEndExclusive: "2026-10-19",
      previousPeriodStart: "2026-08-24",
      previousPeriodEndExclusive: "2026-09-21"
    }
  });
  state.t = (key: string, values?: Record<string, unknown>) => `${key} ${Object.values(values ?? {}).join(" ")}`;
  const Harness = defineComponent({
    setup() {
      provide(shellPortsKey, createShellPorts(state as never));
      provide(workspaceDialogPortsKey, createWorkspaceDialogPorts(state as never));
      return () => h(SystemConfigurationDialog);
    }
  });

  renderWithApp(Harness);

  expect(screen.queryByText("configWhatnotVerticalLabel")).toBeNull();
  expect(screen.queryByText("configWhatnotFeeStatusTitle")).toBeNull();
  expect(screen.getByRole("dialog", { name: "configSystemConfigurationTitle" })).toBeVisible();
});

test.each(["shellShopifyTitle", "shellConnectShopify"])("choosing %s opens the Shopify setup dialog", async (label) => {
  const state = Object.assign(createShellState(), {
    shopifyConnectionStatus: "disconnected" as const,
    openShopifyConnectDialog: uiShopifyMethods.openShopifyConnectDialog
  });
  const Harness = defineComponent({
    setup() {
      provide(shellPortsKey, createShellPorts(state as never));
      return () => h(Fragment, [h(AppShellTopBar), h(ShopifyConnectDialog)]);
    }
  });

  renderWithApp(Harness);
  await fireEvent.click(screen.getByRole("button", { name: "accountMenuLabel" }));
  await fireEvent.click(await screen.findByText(label));
  expect(state.showShopifyConnectDialog).toBe(true);
  expect(await screen.findByRole("dialog", { name: "shellConnectShopify" })).toBeVisible();
  expect(screen.getByLabelText("shellShopifyDomainLabel")).toBeVisible();
});

test("Shopify connect dialog cannot be dismissed while its request is pending", async () => {
  const state = Object.assign(createShellState(), {
    showShopifyConnectDialog: true,
    shopifyConnectionStatus: "connecting" as const,
    shopifyShopDraft: "my-store.myshopify.com"
  });
  const Harness = defineComponent({ setup() { provide(shellPortsKey, createShellPorts(state as never)); return () => h(ShopifyConnectDialog); } });
  renderWithApp(Harness);
  const cancel = screen.getByRole("button", { name: "shellShopifyCancel" });
  expect(cancel).toBeDisabled();
  expect(screen.getByLabelText("shellShopifyDomainLabel")).toBeDisabled();
  expect(screen.getByLabelText("shellShopifyDomainLabel")).toHaveValue("my-store.myshopify.com");
  expect(screen.getByRole("button", { name: "shellConnectShopify" })).toBeDisabled();
  await fireEvent.click(cancel);
  expect(state.showShopifyConnectDialog).toBe(true);
});

test("Shopify connection errors keep the entered domain and offer manual status retry", async () => {
  const refreshShopifyStatus = vi.fn();
  const state = Object.assign(createShellState(), {
    showShopifyConnectDialog: true, shopifyConnectionStatus: "error" as const,
    shopifyShopDraft: "my-store.myshopify.com", refreshShopifyStatus
  });
  const Harness = defineComponent({ setup() { provide(shellPortsKey, createShellPorts(state as never)); return () => h(ShopifyConnectDialog); } });
  renderWithApp(Harness);
  expect(await screen.findByText("shellShopifyError")).toBeVisible();
  expect(screen.getByLabelText("shellShopifyDomainLabel")).toHaveValue("my-store.myshopify.com");
  await fireEvent.click(screen.getByRole("button", { name: "shellShopifyRetry" }));
  expect(refreshShopifyStatus).toHaveBeenCalledOnce();
  expect(state.shopifyShopDraft).toBe("my-store.myshopify.com");
});
