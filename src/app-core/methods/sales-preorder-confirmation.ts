import type { Lot } from "../../types/app.ts";
import { isLotAwaitingReceipt } from "../../shared/lot-receipt.ts";
import { formatLocalizedDate, translateAppMessage } from "../i18n/index.ts";

type ConfirmationPayload = {
  title: string;
  text: string;
  color?: "primary" | "secondary" | "error" | "warning" | "success" | "info";
  confirmLabel?: string;
};

type ConfirmationPort = {
  askConfirmation(payload: ConfirmationPayload, action: () => void, onCancel?: () => void): void;
  getLots(): Lot[];
  isCurrentScope(): boolean;
  language?: string;
  registerPendingCancellation?(cancel: () => void): () => void;
};

type ConfirmationOptions = {
  lotIds: number[];
  saleCount?: number;
  titleKey?: "salesPreorderConfirmTitle" | "wheelPreorderConfirmTitle" | "whatnotPreorderConfirmTitle";
  textKey?: "salesPreorderConfirmBody" | "wheelPreorderConfirmBody" | "whatnotPreorderConfirmBody";
  confirmLabelKey?: "salesPreorderConfirmAction" | "wheelSpinButtonLabel" | "whatnotReviewImportReviewedSalesAction";
};

function getAwaitingSources(lots: Lot[], lotIds: number[]): Map<number, string> {
  const ids = new Set(lotIds);
  return new Map(lots
    .filter((lot) => ids.has(lot.id) && isLotAwaitingReceipt(lot))
    .map((lot) => [lot.id, String(lot.expectedReceiptDate)]));
}

function sourceSnapshotStillMatches(expected: Map<number, string>, lots: Lot[], lotIds: number[]): boolean {
  const current = getAwaitingSources(lots, lotIds);
  return current.size === expected.size
    && [...expected].every(([id, date]) => current.get(id) === date);
}

export function confirmAwaitingReceiptConsumption(
  port: ConfirmationPort,
  options: ConfirmationOptions
): Promise<boolean> {
  const sources = getAwaitingSources(port.getLots(), options.lotIds);
  if (sources.size === 0) return Promise.resolve(true);
  const sourceDetails = [...sources].map(([id, receiptDate]) => {
    const lot = port.getLots().find((entry) => entry.id === id);
    const date = formatLocalizedDate(receiptDate, port.language, { year: "numeric", month: "long", day: "numeric" });
    return `${lot?.name || `#${id}`} — ${date}`;
  }).join("; ");
  const body = translateAppMessage(port.language, options.textKey ?? "salesPreorderConfirmBody", {
    count: options.saleCount
  });

  return new Promise((resolve) => {
    let settled = false;
    let unregisterCancellation: () => void = () => undefined;
    const finish = (accepted: boolean) => {
      if (settled) return;
      settled = true;
      unregisterCancellation();
      resolve(accepted
        && port.isCurrentScope()
        && sourceSnapshotStillMatches(sources, port.getLots(), options.lotIds));
    };

    unregisterCancellation = port.registerPendingCancellation?.(() => finish(false)) ?? (() => undefined);
    if (settled) return;
    port.askConfirmation({
      title: translateAppMessage(port.language, options.titleKey ?? "salesPreorderConfirmTitle"),
      text: `${body} ${sourceDetails}`,
      color: "warning",
      ...(options.confirmLabelKey
        ? { confirmLabel: translateAppMessage(port.language, options.confirmLabelKey) }
        : {})
    }, () => finish(true), () => finish(false));
  });
}
