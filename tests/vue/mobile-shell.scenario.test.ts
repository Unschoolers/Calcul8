import { fireEvent, screen } from "@testing-library/vue";
import { defineComponent } from "vue";
import { describe, expect, test } from "vitest";
import MobileLotSwitcher from "../../src/components/shell/MobileLotSwitcher.vue";
import AppFormLayout from "../../src/components/ui/AppFormLayout.vue";
import { shellPortsKey } from "../../src/components/shell/shellPorts.ts";
import { renderWithApp } from "./render.ts";

const words: Record<string, string> = {
  personalLabel: "Personal",
  shellAddLotAction: "Add inventory",
  shellEditLotAction: "Edit inventory",
  shellLotLabel: "Current inventory",
  shellLotSearchLabel: "Search inventory",
  shellLotSwitcherEmptyTitle: "No matching inventory",
  shellLotSwitcherTitle: "Choose inventory",
  shellOpenLotSwitcherAction: "Current inventory: My Hero Academia",
  shellScopeLabel: "Workspace"
};

const t = (key: string): string => words[key] ?? key;

function lot(value: number, title: string, lotType: "bulk" | "singles" = "bulk") {
  return {
    title,
    value,
    subtitle: lotType === "singles" ? "Individual | 2026-06-03" : "Grouped | 2026-06-03",
    lotType,
    isComplete: false,
    symbolIcon: lotType === "singles" ? "mdi-cards-outline" : "mdi-cube-outline",
    completionIcon: null,
    groupLabel: value === 1 ? "Grouped inventory" : null
  };
}

function renderSwitcher(overrides: Record<string, unknown> = {}) {
  const capabilities: Record<string, unknown> = {
    activeScopeType: "personal",
    currentLotId: 1,
    currentWorkspaceName: "Personal",
    hasLotSelected: true,
    lotItems: [
      lot(1, "My Hero Academia"),
      lot(2, "Kaiju No. 8"),
      lot(3, "Union Arena"),
      lot(4, "Jujutsu Kaisen"),
      lot(5, "Bleach"),
      lot(6, "Pokémon", "singles")
    ],
    openRenameLotModal() {},
    preferredLanguage: "en",
    selectLot(value: number) {
      capabilities.currentLotId = value;
    },
    showNewLotModal: false,
    t,
    ...overrides
  };

  renderWithApp(MobileLotSwitcher, {
    global: { provide: { [shellPortsKey as symbol]: capabilities } }
  });
  return capabilities;
}

describe("mobile lot switcher", () => {
  test("keeps full French form actions and long workspace copy in wrapped form primitives", () => {
    const frenchImportAction = "Importer depuis l’identifiant utilisateur";
    const longWorkspaceName = "Atelier de cartes Montréal — espace de travail de synchronisation historique";
    const FormScenario = defineComponent({
      components: { AppFormLayout },
      template: `
        <app-form-layout>
          <label>${frenchImportAction}<input aria-label="Identifiant utilisateur" /></label>
          <template #helper>${longWorkspaceName}</template>
          <template #actions><button>${frenchImportAction}</button></template>
        </app-form-layout>
      `
    });

    renderWithApp(FormScenario);

    expect(screen.getByLabelText("Identifiant utilisateur").closest("label")).toHaveClass("app-text-wrap");
    expect(screen.getByText(longWorkspaceName).closest(".app-form-helper")).toHaveClass("app-text-wrap");
    expect(screen.getByRole("button", { name: frenchImportAction }).closest(".app-form-actions")).not.toBeNull();
  });

  test("shows the current lot without a permanent personal label", () => {
    renderSwitcher();

    expect(screen.getByRole("button", { name: "Current inventory: My Hero Academia" })).toHaveTextContent("My Hero Academia");
    expect(screen.queryByText("Personal")).not.toBeInTheDocument();
  });

  test("keeps shared-workspace context visible in the lot summary", () => {
    renderSwitcher({ activeScopeType: "workspace", currentWorkspaceName: "Card Studio Montréal" });

    expect(screen.getByRole("button", { name: "Current inventory: My Hero Academia" })).toHaveTextContent("Card Studio Montréal");
  });

  test("opens, filters, and selects from the lot sheet", async () => {
    const capabilities = renderSwitcher();

    await fireEvent.click(screen.getByRole("button", { name: "Current inventory: My Hero Academia" }));
    await fireEvent.update(screen.getByRole("searchbox", { name: "Search inventory" }), "Kaiju");
    await fireEvent.click(screen.getByRole("option", { name: /Kaiju No\. 8/ }));

    expect(capabilities.currentLotId).toBe(2);
    expect(screen.queryByRole("dialog", { name: "Choose inventory" })).not.toBeInTheDocument();
  });

  test("moves focus into the search form and restores it to the trigger when closed", async () => {
    renderSwitcher();

    const trigger = screen.getByRole("button", { name: "Current inventory: My Hero Academia" });
    await fireEvent.click(trigger);

    expect(screen.getByRole("searchbox", { name: "Search inventory" })).toHaveFocus();

    await fireEvent.click(screen.getByRole("button", { name: "commonClose" }));

    expect(trigger).toHaveFocus();
  });

  test("keeps search out of the way for a short lot list", async () => {
    renderSwitcher({ lotItems: [lot(1, "My Hero Academia"), lot(2, "Kaiju No. 8")] });

    await fireEvent.click(screen.getByRole("button", { name: "Current inventory: My Hero Academia" }));

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  test("routes create and edit through the existing lot capabilities", async () => {
    let editRequested = false;
    const capabilities = renderSwitcher({
      openRenameLotModal() {
        editRequested = true;
      }
    });

    await fireEvent.click(screen.getByRole("button", { name: "Current inventory: My Hero Academia" }));
    await fireEvent.click(screen.getByRole("button", { name: "Edit inventory" }));
    expect(editRequested).toBe(true);

    await fireEvent.click(screen.getByRole("button", { name: "Current inventory: My Hero Academia" }));
    await fireEvent.click(screen.getByRole("button", { name: "Add inventory" }));
    expect(capabilities.showNewLotModal).toBe(true);
  });
});
