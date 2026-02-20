import type { AppContext, AppMethodState } from "../../context.ts";
import { initGoogleAutoLoginWithRetry } from "../../utils/googleAutoLogin.ts";
import { getPlayBillingService } from "../../utils/playBilling.ts";

export type UiEntitlementMethodKeys =
  | "initGoogleAutoLogin"
  | "promptGoogleSignIn"
  | "openVerifyPurchaseModal"
  | "startProPurchase"
  | "verifyProPurchase"
  | "startPlayPurchase"
  | "verifyPlayPurchase"
  | "debugLogEntitlement";

export type UiEntitlementMethodSubset<K extends UiEntitlementMethodKeys> =
  ThisType<AppContext> & Pick<AppMethodState, K>;

interface GoogleProfileClaims {
  name?: string;
  email?: string;
  picture?: string;
}

function decodeGoogleIdTokenClaims(idToken: string): GoogleProfileClaims | null {
  const parts = idToken.split(".");
  if (parts.length < 2) return null;

  const payloadPart = parts[1]?.replace(/-/g, "+").replace(/_/g, "/");
  if (!payloadPart) return null;

  const padded = payloadPart.padEnd(Math.ceil(payloadPart.length / 4) * 4, "=");
  try {
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as GoogleProfileClaims;
    }
    return null;
  } catch {
    return null;
  }
}

export function cacheGoogleProfileFromToken(idToken: string, cacheKey: string): void {
  const claims = decodeGoogleIdTokenClaims(idToken);
  if (!claims) return;

  const name = typeof claims.name === "string" ? claims.name.trim() : "";
  const email = typeof claims.email === "string" ? claims.email.trim() : "";
  const picture = typeof claims.picture === "string" ? claims.picture.trim() : "";

  if (!name && !email && !picture) return;

  let previous: GoogleProfileClaims | null = null;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      previous = JSON.parse(raw) as GoogleProfileClaims;
    }
  } catch {
    previous = null;
  }

  const merged: GoogleProfileClaims = {
    name: name || previous?.name || "",
    email: email || previous?.email || "",
    picture: picture || previous?.picture || ""
  };

  localStorage.setItem(cacheKey, JSON.stringify(merged));
}

export function formatPlayPurchaseError(error: unknown): string {
  if (error instanceof Error) {
    const message = `${error.name}${error.message ? `: ${error.message}` : ""}`.trim();
    return message || "Unknown purchase error.";
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    const message = (error as { message?: unknown }).message;
    const parts: string[] = [];
    if (typeof code === "string" && code.trim()) parts.push(`code=${code.trim()}`);
    if (typeof message === "string" && message.trim()) parts.push(message.trim());
    if (parts.length > 0) return parts.join(" | ");
  }
  return "Unknown purchase error.";
}

export function isAlreadyOwnedPurchaseError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      code?: unknown;
      responseCode?: unknown;
      reason?: unknown;
      details?: { responseCode?: unknown; reason?: unknown } | unknown;
      result?: { responseCode?: unknown; reason?: unknown } | unknown;
    };

    const rawCodes = [
      candidate.code,
      candidate.responseCode,
      (typeof candidate.details === "object" && candidate.details !== null
        ? (candidate.details as { responseCode?: unknown }).responseCode
        : undefined),
      (typeof candidate.result === "object" && candidate.result !== null
        ? (candidate.result as { responseCode?: unknown }).responseCode
        : undefined)
    ];

    for (const rawCode of rawCodes) {
      if (rawCode === 7) return true; // BillingResponseCode.ITEM_ALREADY_OWNED
      if (typeof rawCode === "string") {
        const normalized = rawCode.trim().toUpperCase();
        if (
          normalized === "ITEM_ALREADY_OWNED" ||
          normalized === "ALREADY_OWNED" ||
          normalized === "7"
        ) {
          return true;
        }
      }
    }

    const rawReasons = [
      candidate.reason,
      (typeof candidate.details === "object" && candidate.details !== null
        ? (candidate.details as { reason?: unknown }).reason
        : undefined),
      (typeof candidate.result === "object" && candidate.result !== null
        ? (candidate.result as { reason?: unknown }).reason
        : undefined)
    ];

    for (const rawReason of rawReasons) {
      if (typeof rawReason === "string") {
        const normalized = rawReason.trim().toUpperCase();
        if (normalized === "ITEM_ALREADY_OWNED" || normalized === "ALREADY_OWNED") {
          return true;
        }
      }
    }
  }

  const detail = formatPlayPurchaseError(error).toLowerCase();
  return detail.includes("already own")
    || detail.includes("already owned")
    || detail.includes("item already")
    || detail.includes("owned item");
}

export function applyTargetProfitAccessDefaults(app: AppContext): void {
  if (!app.hasLotSelected) return;

  if (!app.hasProAccess) {
    if (Number(app.targetProfitPercent) !== 0) {
      app.targetProfitPercent = 0;
      app.autoSaveSetup();
    }
    return;
  }

  const currentTarget = Number(app.targetProfitPercent);
  if (!Number.isFinite(currentTarget) || currentTarget <= 0) {
    app.targetProfitPercent = 15;
    app.autoSaveSetup();
  }
}

export async function hasPlayPurchaseSupport(): Promise<boolean> {
  if (typeof window.getDigitalGoodsService !== "function") {
    return false;
  }

  const service = await getPlayBillingService();
  return !!service;
}

export { initGoogleAutoLoginWithRetry };
