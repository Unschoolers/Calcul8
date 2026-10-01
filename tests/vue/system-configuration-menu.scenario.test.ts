import { fireEvent, screen } from "@testing-library/vue";
import { defineComponent, Fragment, h, nextTick, provide, reactive } from "vue";
import { expect, test, vi } from "vitest";
import { createInitialState } from "../../src/app-core/state.ts";
import AppShellTopBar from "../../src/components/shell/AppShellTopBar.vue";
import SystemConfigurationDialog from "../../src/components/shell/SystemConfigurationDialog.vue";
import ShopifyConnectDialog from "../../src/components/windows/shopify/ShopifyConnectDialog.vue";
import { uiShopifyMethods } from "../../src/app-core/methods/ui/shopify/shopify.ts";
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
  const state = Object.assign(createShellState(), { showShopifyConnectDialog: true, shopifyConnectionStatus: "connecting" as const });
  const Harness = defineComponent({ setup() { provide(shellPortsKey, createShellPorts(state as never)); return () => h(ShopifyConnectDialog); } });
  renderWithApp(Harness);
  const cancel = screen.getByRole("button", { name: "shellShopifyCancel" });
  expect(cancel).toBeDisabled();
  expect(screen.getByLabelText("shellShopifyDomainLabel")).toBeDisabled();
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
