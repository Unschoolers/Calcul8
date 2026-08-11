import { fireEvent, screen } from "@testing-library/vue";
import { defineComponent } from "vue";
import { describe, expect, test, vi } from "vitest";
import AppConfirmDialog from "../../src/components/ui/AppConfirmDialog.vue";
import AppFormLayout from "../../src/components/ui/AppFormLayout.vue";
import { renderWithApp } from "./render.ts";

describe("AppFormLayout", () => {
  test("wraps long localized copy and stacks form actions", () => {
    const FormScenario = defineComponent({
      components: { AppFormLayout },
      template: `
        <app-form-layout :responsive="true" :sticky-actions="true">
          <label>Identifiant de synchronisation particulièrement long<input aria-label="Identifiant" /></label>
          <template #actions>
            <button>Importer depuis l’identifiant utilisateur</button>
            <button>Annuler</button>
          </template>
        </app-form-layout>
      `
    });

    renderWithApp(FormScenario);

    expect(screen.getByText(/Identifiant de synchronisation/).closest("label")).toHaveClass("app-text-wrap");
    expect(screen.getByRole("button", { name: /Importer/ }).closest(".app-form-actions")).toHaveClass("app-form-actions--sticky");
  });
});

describe("AppConfirmDialog", () => {
  test("keeps its existing cancel and confirm events", async () => {
    const cancel = vi.fn();
    const confirm = vi.fn();

    renderWithApp(AppConfirmDialog, {
      props: {
        modelValue: true,
        title: "Supprimer",
        cancelText: "Annuler",
        confirmText: "Supprimer",
        onCancel: cancel,
        onConfirm: confirm
      }
    });

    await fireEvent.click(screen.getByRole("button", { name: "Annuler" }));

    expect(cancel).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
  });

  test("uses the shared sticky action surface with touch-sized actions", async () => {
    renderWithApp(AppConfirmDialog, {
      props: { modelValue: true, title: "Supprimer", cancelText: "Annuler", confirmText: "Supprimer" }
    });

    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector(".app-sticky-action-footer.app-form-actions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler" })).toHaveClass("app-touch-target");
  });
});
