import type { Lot, WheelConfig } from "../../../../types/app.ts";
import type { RuntimeMethodState } from "../../../../app-core/context/runtime.ts";
import { captureWorkspaceScopeGuard, resolveWorkspaceScopeContext } from "../../../../app-core/workspace-scope.ts";
import { confirmAwaitingReceiptConsumption } from "../../../../app-core/methods/sales-preorder-confirmation.ts";

type GamePreorderConfirmationContext = {
  lots: Lot[];
  activeScopeType: "personal" | "workspace";
  activeWorkspaceId: string | null;
  googleAuthEpoch: number;
  preferredLanguage?: string;
  askConfirmation: RuntimeMethodState["askConfirmation"];
};

type ApprovedSources = {
  key: string;
  lotIds: number[];
  receiptSnapshot: Array<[number, string | null]>;
};
const confirmedSnapshotByContext = new WeakMap<object, ApprovedSources>();
const pendingCancellationsByContext = new WeakMap<object, Set<() => void>>();
const confirmationRevisions = new WeakMap<object, number>();

function stringifySnapshot(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "undefined";
  } catch {
    return "[unserializable]";
  }
}

function getSourceSnapshot(context: GamePreorderConfirmationContext, lotIds: number[]): Array<[number, string | null]> {
  return [...new Set(lotIds)]
    .sort((left, right) => left - right)
    .map((id) => {
      const lot = context.lots.find((entry) => entry.id === id);
      return [id, lot ? String(lot.expectedReceiptDate ?? "") : null];
    });
}

function registerPendingCancellation(context: object, cancel: () => void): () => void {
  let pending = pendingCancellationsByContext.get(context);
  if (!pending) {
    pending = new Set();
    pendingCancellationsByContext.set(context, pending);
  }
  pending.add(cancel);
  return () => {
    const current = pendingCancellationsByContext.get(context);
    current?.delete(cancel);
    if (current?.size === 0) pendingCancellationsByContext.delete(context);
  };
}

export function getWheelPreorderSourceLotIds(config: WheelConfig | null | undefined): number[] {
  if (!config) return [];
  return [...new Set(config.tiers
    .filter((tier) => tier.deductionType !== "none" && (Number(tier.packsCount) || 0) > 0)
    .flatMap((tier) => [
      ...(Array.isArray(tier.boundLotIds) ? tier.boundLotIds : []),
      ...(tier.boundLotId == null ? [] : [tier.boundLotId])
    ])
    .map((id) => Math.floor(Number(id) || 0))
    .filter((id) => id > 0))];
}

export async function confirmGamePreorderConsumption(
  context: GamePreorderConfirmationContext,
  params: {
    lotIds: number[];
    sessionKey: string;
    configSnapshot?: unknown;
    isCurrentOperation?: () => boolean;
  }
): Promise<boolean> {
  const scopeGuard = captureWorkspaceScopeGuard(context);
  const revision = confirmationRevisions.get(context) ?? 0;
  const scope = resolveWorkspaceScopeContext(context);
  const configSnapshot = stringifySnapshot(params.configSnapshot);
  const sourceSnapshot = getSourceSnapshot(context, params.lotIds);
  const confirmationKey = stringifySnapshot([
    scope.scopeKey,
    context.googleAuthEpoch,
    params.sessionKey,
    configSnapshot,
    sourceSnapshot
  ]);
  const isCurrent = () => scopeGuard()
    && (confirmationRevisions.get(context) ?? 0) === revision
    && (!params.isCurrentOperation || params.isCurrentOperation())
    && stringifySnapshot(params.configSnapshot) === configSnapshot
    && stringifySnapshot(getSourceSnapshot(context, params.lotIds)) === stringifySnapshot(sourceSnapshot);

  if (confirmedSnapshotByContext.get(context)?.key === confirmationKey) {
    return isCurrent();
  }
  // Keep only the current approval so changing away and back cannot revive an old decision.
  confirmedSnapshotByContext.delete(context);

  const awaitingLotIds = sourceSnapshot
    .filter(([, receiptDate]) => receiptDate != null && receiptDate !== "")
    .map(([id]) => id);
  if (awaitingLotIds.length === 0) return isCurrent();

  const accepted = await confirmAwaitingReceiptConsumption({
    askConfirmation: context.askConfirmation.bind(context),
    getLots: () => context.lots,
    isCurrentScope: isCurrent,
    language: context.preferredLanguage,
    registerPendingCancellation: (cancel) => registerPendingCancellation(context, cancel)
  }, {
    lotIds: awaitingLotIds,
    titleKey: "wheelPreorderConfirmTitle",
    textKey: "wheelPreorderConfirmBody",
    confirmLabelKey: "wheelSpinButtonLabel"
  });
  if (!accepted || !isCurrent()) return false;
  confirmedSnapshotByContext.set(context, {
    key: confirmationKey,
    lotIds: [...params.lotIds],
    receiptSnapshot: sourceSnapshot
  });
  return true;
}

// Called synchronously for lot edits so an away-and-back receipt change cannot revive consent.
export function invalidateGamePreorderConfirmationIfSourceChanged(context: GamePreorderConfirmationContext): void {
  const approved = confirmedSnapshotByContext.get(context);
  if (approved && stringifySnapshot(getSourceSnapshot(context, approved.lotIds)) !== stringifySnapshot(approved.receiptSnapshot)) {
    clearGamePreorderConfirmations(context);
  }
}

export function clearGamePreorderConfirmations(context: object): void {
  confirmationRevisions.set(context, (confirmationRevisions.get(context) ?? 0) + 1);
  confirmedSnapshotByContext.delete(context);
  const pending = pendingCancellationsByContext.get(context);
  pendingCancellationsByContext.delete(context);
  for (const cancel of pending ?? []) cancel();
}
