import { fireEvent, screen } from "@testing-library/vue";
import { defineComponent, reactive, ref } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { confirmAwaitingReceiptConsumption } from "../../src/app-core/methods/sales-preorder-confirmation.ts";
import { uiBaseMethods } from "../../src/app-core/methods/ui/common/base.ts";
import AppDialogShell from "../../src/components/ui/AppDialogShell.vue";
import { renderWithApp } from "./render.ts";

function setupConfirmationDialog() {
  const cancelAction = vi.fn();
  const state = reactive({
    confirmDialog: false,
    confirmTitle: "",
    confirmText: "",
    confirmColor: "warning" as const,
    confirmActionLabel: null as string | null,
    confirmAction: null as (() => void) | null,
    confirmCancelAction: null as (() => void) | null,
    cancelConfirmAction() {
      uiBaseMethods.cancelConfirmAction.call(state as never);
    }
  });
  const askConfirmation = (payload: { title: string; text: string }, action: () => void, onCancel?: () => void) => {
    uiBaseMethods.askConfirmation.call(state as never, payload, action, onCancel);
  };
  const pending = confirmAwaitingReceiptConsumption({
    askConfirmation,
    getLots: () => [{ id: 1, expectedReceiptDate: "2026-11-12" }] as never,
    isCurrentScope: () => true,
    language: "en"
  }, { lotIds: [1] }).then((accepted) => {
    if (!accepted) cancelAction();
    return accepted;
  });
  const onDialogModel = (open: boolean) => {
    uiBaseMethods.handleConfirmDialogModelValue.call(state as never, open);
  };
  const dialogRef = ref<unknown>(null);
  const Harness = defineComponent({
    components: { AppDialogShell },
    setup: () => ({ state, onDialogModel, dialogRef }),
    template: `<app-dialog-shell ref="dialogRef" :model-value="state.confirmDialog" :title="state.confirmTitle" @update:model-value="onDialogModel">
      <p>{{ state.confirmText }}</p>
      <template #actions><button @click="state.cancelConfirmAction">Cancel</button></template>
    </app-dialog-shell>`
  });
  return { cancelAction, pending, state, Harness, dialogRef };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("preorder confirmation dialog dismissal", () => {
  test("Escape resolves the awaited confirmation as canceled", async () => {
    const { cancelAction, pending, state, Harness } = setupConfirmationDialog();
    renderWithApp(Harness);

    await fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });

    expect(await pending).toBe(false);
    expect(state.confirmDialog).toBe(false);
    expect(cancelAction).toHaveBeenCalledOnce();
  });

  test("the dialog's outside-close update resolves the awaited confirmation as canceled", async () => {
    const { cancelAction, pending, state, Harness, dialogRef } = setupConfirmationDialog();
    renderWithApp(Harness);
    await screen.findByRole("dialog");
    (dialogRef.value as { updateModelValue(open: boolean): void }).updateModelValue(false);

    expect(state.confirmDialog).toBe(false);
    expect(await pending).toBe(false);
    expect(state.confirmDialog).toBe(false);
    expect(cancelAction).toHaveBeenCalledOnce();
  });
});
