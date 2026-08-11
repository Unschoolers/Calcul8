import { fireEvent, screen } from "@testing-library/vue";
import { describe, expect, test, vi } from "vitest";
import AppDialogShell from "../../src/components/ui/AppDialogShell.vue";
import { renderWithApp } from "./render.ts";

describe("AppDialogShell", () => {
  test("connects a visible title and description to the dialog", async () => {
    renderWithApp(AppDialogShell, {
      props: { modelValue: true, title: "Créer un espace", description: "Invitez votre équipe." },
      slots: { default: "<button>Premier champ</button>", actions: "<button>Confirmer</button>" }
    });

    expect(await screen.findByRole("dialog", { name: "Créer un espace" })).toHaveAccessibleDescription("Invitez votre équipe.");
  });

  test("restores focus to the opener after closing", async () => {
    const view = renderWithApp({
      components: { AppDialogShell },
      data: () => ({ open: false }),
      template: `<button @click="open = true">Open</button><app-dialog-shell v-model="open" title="Form"><button>Field</button></app-dialog-shell>`
    });

    await fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await view.rerender({});
    await fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });

    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  test("does not dismiss a persistent dialog with Escape", async () => {
    const update = vi.fn();
    renderWithApp(AppDialogShell, {
      props: { modelValue: true, title: "Paiement", persistent: true, "onUpdate:modelValue": update }
    });

    await fireEvent.keyDown(await screen.findByRole("dialog", { name: "Paiement" }), { key: "Escape" });

    expect(update).not.toHaveBeenCalledWith(false);
  });
});
