import { fireEvent, screen } from "@testing-library/vue";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import AppDialogShell from "../../src/components/ui/AppDialogShell.vue";
import { renderWithApp } from "./render.ts";

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

function getDialogContent(name: string): HTMLElement {
  const dialog = screen.getByRole("dialog", { name });
  const content = dialog.querySelector<HTMLElement>(".app-dialog-overlay");
  if (!content) throw new Error(`Expected dialog content for ${name}.`);
  return content;
}

afterEach(() => {
  setViewportWidth(1024);
});

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

  test("uses fullscreen at the inclusive 600px boundary except for media previews", async () => {
    setViewportWidth(600);
    await nextTick();

    renderWithApp(AppDialogShell, { props: { modelValue: true, title: "Standard" } });
    renderWithApp(AppDialogShell, { props: { modelValue: true, title: "Report", variant: "report" } });
    renderWithApp(AppDialogShell, { props: { modelValue: true, title: "Checkout", variant: "checkout" } });
    renderWithApp(AppDialogShell, { props: { modelValue: true, title: "Media", variant: "media" } });

    expect(await screen.findByRole("dialog", { name: "Standard" })).toHaveClass("v-dialog--fullscreen");
    expect(await screen.findByRole("dialog", { name: "Report" })).toHaveClass("v-dialog--fullscreen");
    expect(await screen.findByRole("dialog", { name: "Checkout" })).toHaveClass("v-dialog--fullscreen");
    expect(await screen.findByRole("dialog", { name: "Media" })).not.toHaveClass("v-dialog--fullscreen");
  });

  test("uses variant defaults while preserving an explicit maximum width", async () => {
    renderWithApp(AppDialogShell, { props: { modelValue: true, title: "Standard" } });
    renderWithApp(AppDialogShell, { props: { modelValue: true, title: "Report", variant: "report" } });
    renderWithApp(AppDialogShell, { props: { modelValue: true, title: "Checkout", variant: "checkout" } });
    renderWithApp(AppDialogShell, {
      props: { modelValue: true, title: "Custom report", variant: "report", maxWidth: 840 }
    });

    await screen.findByRole("dialog", { name: "Custom report" });

    expect(getDialogContent("Standard")).toHaveStyle({ maxWidth: "560px" });
    expect(getDialogContent("Report")).toHaveStyle({ maxWidth: "980px" });
    expect(getDialogContent("Checkout")).toHaveStyle({ maxWidth: "720px" });
    expect(getDialogContent("Custom report")).toHaveStyle({ maxWidth: "840px" });
  });
});
