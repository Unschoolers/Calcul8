import { fireEvent, screen } from "@testing-library/vue";
import { defineComponent, Fragment, h, provide, reactive } from "vue";
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
