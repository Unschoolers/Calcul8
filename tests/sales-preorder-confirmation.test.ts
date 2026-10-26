import { describe, expect, it, vi } from "vitest";
import { confirmAwaitingReceiptConsumption } from "../src/app-core/methods/sales-preorder-confirmation.ts";
import { clearGamePreorderConfirmations, confirmGamePreorderConsumption } from "../src/components/windows/game/services/gamePreorderConfirmation.ts";

function createPort() {
  let accept: (() => void) | undefined;
  let cancel: (() => void) | undefined;
  const askConfirmation = vi.fn((_payload: { title: string; text: string; color?: string }, action: () => void, onCancel?: () => void) => {
    accept = action;
    cancel = onCancel;
  });
  return {
    askConfirmation,
    accept: () => accept?.(),
    cancel: () => cancel?.()
  };
}

describe("confirmAwaitingReceiptConsumption", () => {
  it("does not prompt when no affected lot is awaiting receipt", async () => {
    const port = createPort();
    const result = await confirmAwaitingReceiptConsumption({
      askConfirmation: port.askConfirmation,
      getLots: () => [{ id: 1 }],
      isCurrentScope: () => true,
      language: "en"
    }, { lotIds: [1] });

    expect(result).toBe(true);
    expect(port.askConfirmation).not.toHaveBeenCalled();
  });

  it("waits for acceptance and preserves the pending receipt", async () => {
    const port = createPort();
    const lot = { id: 1, expectedReceiptDate: "2026-11-12" };
    const pending = confirmAwaitingReceiptConsumption({
      askConfirmation: port.askConfirmation,
      getLots: () => [lot],
      isCurrentScope: () => true,
      language: "fr"
    }, { lotIds: [1] });

    expect(port.askConfirmation).toHaveBeenCalledOnce();
    expect(await Promise.race([pending, Promise.resolve("pending")])).toBe("pending");
    port.accept();
    expect(await pending).toBe(true);
    expect(lot.expectedReceiptDate).toBe("2026-11-12");
  });

  it.each([
    ["en", "November 12, 2026", "December 1, 2026"],
    ["fr-CA", "12 novembre 2026", "1 décembre 2026"]
  ])("lists only affected awaiting lot names and localized dates in %s", async (language, firstDate, secondDate) => {
    const port = createPort();
    const pending = confirmAwaitingReceiptConsumption({
      askConfirmation: port.askConfirmation,
      getLots: () => [
        { id: 1, name: "First preorder", expectedReceiptDate: "2026-11-12" },
        { id: 2, name: "Second preorder", expectedReceiptDate: "2026-12-01" },
        { id: 3, name: "Received lot" },
        { id: 4, name: "Unaffected preorder", expectedReceiptDate: "2026-11-12" }
      ],
      isCurrentScope: () => true,
      language
    }, { lotIds: [1, 1, 2, 3] });
    const text = port.askConfirmation.mock.calls[0]![0].text;
    expect(text).toContain(`First preorder — ${firstDate}`);
    expect(text).toContain(`Second preorder — ${secondDate}`);
    expect(text.match(/First preorder/g)).toHaveLength(1);
    expect(text).not.toContain("Received lot");
    expect(text).not.toContain("Unaffected preorder");
    port.cancel();
    expect(await pending).toBe(false);
  });

  it("returns false on cancellation, source changes, or scope changes", async () => {
    const port = createPort();
    let current = true;
    const lot = { id: 1, expectedReceiptDate: "2026-11-12" };
    const pending = confirmAwaitingReceiptConsumption({
      askConfirmation: port.askConfirmation,
      getLots: () => [lot],
      isCurrentScope: () => current,
      language: "en"
    }, { lotIds: [1] });
    lot.expectedReceiptDate = "2026-11-13";
    port.accept();
    expect(await pending).toBe(false);

    const next = confirmAwaitingReceiptConsumption({
      askConfirmation: port.askConfirmation,
      getLots: () => [lot],
      isCurrentScope: () => current,
      language: "en"
    }, { lotIds: [1] });
    current = false;
    port.accept();
    expect(await next).toBe(false);

    current = true;
    const cancelled = confirmAwaitingReceiptConsumption({
      askConfirmation: port.askConfirmation,
      getLots: () => [lot],
      isCurrentScope: () => current,
      language: "en"
    }, { lotIds: [1] });
    port.cancel();
    expect(await cancelled).toBe(false);
  });
});

describe("confirmGamePreorderConsumption", () => {
  it("remembers acceptance only for the same session and source snapshot", async () => {
    let accept: (() => void) | undefined;
    let prompts = 0;
    const context = {
      activeScopeType: "personal" as const,
      activeWorkspaceId: null,
      googleAuthEpoch: 0,
      preferredLanguage: "en",
      lots: [{ id: 12, expectedReceiptDate: "2026-11-12" }],
      askConfirmation: vi.fn((_payload, action: () => void) => {
        prompts += 1;
        accept = action;
      })
    };
    const config = { id: 4, tiers: [{ id: "tier-a", boundLotId: 12, packsCount: 1 }] };
    const params = { lotIds: [12], sessionKey: "wheel:4", configSnapshot: config };

    const first = confirmGamePreorderConsumption(context, params);
    accept?.();
    expect(await first).toBe(true);
    expect(await confirmGamePreorderConsumption(context, params)).toBe(true);
    expect(prompts).toBe(1);

    config.tiers[0]!.packsCount = 2;
    const changedConfig = confirmGamePreorderConsumption(context, params);
    expect(prompts).toBe(2);
    accept?.();
    expect(await changedConfig).toBe(true);

    config.tiers[0]!.packsCount = 1;
    const restoredConfig = confirmGamePreorderConsumption(context, params);
    expect(prompts).toBe(3);
    accept?.();
    expect(await restoredConfig).toBe(true);

    context.lots[0]!.expectedReceiptDate = "2026-11-13";
    const changedSource = confirmGamePreorderConsumption(context, params);
    expect(prompts).toBe(4);
    accept?.();
    expect(await changedSource).toBe(true);

    context.lots[0]!.expectedReceiptDate = "2026-11-12";
    const restoredSource = confirmGamePreorderConsumption(context, params);
    expect(prompts).toBe(5);
    accept?.();
    expect(await restoredSource).toBe(true);

    const changedSession = confirmGamePreorderConsumption(context, { ...params, sessionKey: "wheel:5" });
    expect(prompts).toBe(6);
    accept?.();
    expect(await changedSession).toBe(true);
  });

  it("resolves a pending approval as canceled when a game reset invalidates it", async () => {
    let accept: (() => void) | undefined;
    const context = {
      activeScopeType: "personal" as const,
      activeWorkspaceId: null,
      googleAuthEpoch: 0,
      lots: [{ id: 12, expectedReceiptDate: "2026-11-12" }],
      askConfirmation: vi.fn((_payload, action: () => void) => { accept = action; })
    };
    const pending = confirmGamePreorderConsumption(context, { lotIds: [12], sessionKey: "wheel:reset" });
    clearGamePreorderConfirmations(context);

    expect(await pending).toBe(false);
    accept?.();
    expect(context.askConfirmation).toHaveBeenCalledOnce();
  });
});
