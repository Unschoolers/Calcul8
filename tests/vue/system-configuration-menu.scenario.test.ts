import { fireEvent, screen } from "@testing-library/vue";
import { defineComponent, Fragment, h, nextTick, provide, reactive } from "vue";
import { expect, test } from "vitest";
import { createInitialState } from "../../src/app-core/state.ts";
import AppShellTopBar from "../../src/components/shell/AppShellTopBar.vue";
import SystemConfigurationDialog from "../../src/components/shell/SystemConfigurationDialog.vue";
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
