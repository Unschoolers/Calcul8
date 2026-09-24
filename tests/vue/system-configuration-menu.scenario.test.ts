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

test("System Configuration explains the selected Whatnot lot's rate and period progress", async () => {
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

  expect(await screen.findByText("configWhatnotFeeStatusTitle")).toBeVisible();
  expect(document.body.textContent).toContain("7.5");
  expect(screen.getByText("configWhatnotFeeStatusPreviousGross", { exact: false })).toBeVisible();
  expect(screen.getByText("configWhatnotFeeStatusProgress", { exact: false })).toBeVisible();
  expect(screen.getByText("configWhatnotFeeStatusIncomplete", { exact: false })).toBeVisible();

  (state.setCurrentLotWhatnotVertical as (vertical: string) => void)("fashion");
  await nextTick();
  expect(document.body.textContent).toContain("6.5");
  expect(screen.getByRole("dialog", { name: "configSystemConfigurationTitle" })).toBeVisible();
  state.feeProfilePreset = "none";
  await nextTick();
  expect(screen.queryByText("configWhatnotFeeStatusTitle")).toBeNull();
  state.feeProfilePreset = "whatnot";
  await nextTick();
  expect(screen.getByText("configWhatnotFeeStatusTitle")).toBeVisible();
});
