import { createHash } from "node:crypto";
import { HttpError } from "./auth";
import type { PlayPurchaseDocument } from "../types";

export function hashPurchaseToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function assertPurchaseNotLinkedToDifferentUser(
  existingPurchase: PlayPurchaseDocument | null,
  userId: string
): void {
  if (existingPurchase && existingPurchase.userId !== userId) {
    throw new HttpError(409, "This purchase is already linked to a different account.");
  }
}

export function shouldAcknowledgePurchase(acknowledgementState: number | null): boolean {
  return acknowledgementState !== 1;
}

