import type { AppContext } from "../../context.ts";
import {
  fetchWithRetry,
  GOOGLE_TOKEN_KEY,
  handleExpiredAuth,
  resolveApiBaseUrl
} from "./shared.ts";

const STRIPE_RETURN_POLL_DELAYS_MS = [0, 800, 1400, 2200];

type StripeCheckoutReturnState = "none" | "success" | "cancel";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function parseStripeCheckoutReturn(): {
  state: StripeCheckoutReturnState;
  cleanedPath: string | null;
} {
  const currentWindow = (globalThis as { window?: Window }).window;
  const href = currentWindow?.location?.href || "";
  if (!href) {
    return {
      state: "none",
      cleanedPath: null
    };
  }

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return {
      state: "none",
      cleanedPath: null
    };
  }

  const checkoutStatus = String(url.searchParams.get("checkout") || "").trim().toLowerCase();
  const sessionId = String(url.searchParams.get("session_id") || "").trim();
  const isSuccess = checkoutStatus === "success" || !!sessionId;
  const isCancel = !isSuccess && (checkoutStatus === "cancel" || checkoutStatus === "canceled" || checkoutStatus === "cancelled");

  if (!isSuccess && !isCancel) {
    return {
      state: "none",
      cleanedPath: null
    };
  }

  const hasCheckoutParam = url.searchParams.has("checkout");
  const hasSessionParam = url.searchParams.has("session_id");
  if (hasCheckoutParam) {
    url.searchParams.delete("checkout");
  }
  if (hasSessionParam) {
    url.searchParams.delete("session_id");
  }

  const cleanedPath = (hasCheckoutParam || hasSessionParam)
    ? `${url.pathname}${url.search}${url.hash}`
    : null;

  return {
    state: isSuccess ? "success" : "cancel",
    cleanedPath
  };
}

function cleanStripeCheckoutReturnUrl(cleanedPath: string | null): void {
  if (!cleanedPath) return;
  const historyApi = (globalThis as { history?: History }).history;
  if (!historyApi || typeof historyApi.replaceState !== "function") return;
  historyApi.replaceState(null, "", cleanedPath);
}

async function startStripeCheckout(
  app: AppContext,
  baseUrl: string,
  googleIdToken: string
): Promise<string | null> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (googleIdToken.trim()) {
    headers.Authorization = `Bearer ${googleIdToken.trim()}`;
  }

  const response = await fetchWithRetry(`${baseUrl}/billing/checkout-session`, {
    method: "POST",
    headers,
    body: "{}"
  });

  if (response.status === 401) {
    handleExpiredAuth(app);
    app.notify("Your sign-in expired. Please sign in again.", "warning");
    return null;
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = typeof payload?.error === "string" && payload.error.trim()
      ? payload.error.trim()
      : `Could not start Stripe checkout (${response.status}).`;
    app.notify(message, "error");
    return null;
  }

  const checkoutUrl = typeof payload?.checkoutUrl === "string" ? payload.checkoutUrl.trim() : "";
  if (!checkoutUrl) {
    app.notify("Stripe checkout did not return a redirect URL.", "error");
    return null;
  }

  return checkoutUrl;
}

export async function runStripePurchaseFlow(app: AppContext): Promise<void> {
  if (app.isVerifyingPurchase) {
    return;
  }
  if (app.hasProAccess) {
    app.notify("Pro is already unlocked on this account.", "info");
    return;
  }

  const base = resolveApiBaseUrl();
  if (!base) {
    app.notify("Missing API configuration (VITE_API_BASE_URL).", "error");
    return;
  }

  const googleIdToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();

  app.isVerifyingPurchase = true;
  try {
    const checkoutUrl = await startStripeCheckout(app, base, googleIdToken);
    if (!checkoutUrl) return;
    app.notify("Redirecting to secure checkout...", "info");
    window.location.assign(checkoutUrl);
  } catch (error) {
    console.warn("[whatfees] Stripe checkout start failed", error);
    app.notify("Could not start Stripe checkout. Please try again.", "error");
  } finally {
    app.isVerifyingPurchase = false;
  }
}

export async function runStripeVerificationFlow(app: AppContext): Promise<void> {
  await app.debugLogEntitlement(true);
  if (app.hasProAccess) {
    app.notify("Purchase verified. Pro features unlocked.", "success");
  } else {
    app.notify("No completed Stripe purchase found yet. Try again in a few seconds.", "info");
  }
}

export async function handleStripeCheckoutReturn(app: AppContext): Promise<StripeCheckoutReturnState> {
  const parsed = parseStripeCheckoutReturn();
  if (parsed.state === "none") {
    return "none";
  }

  cleanStripeCheckoutReturnUrl(parsed.cleanedPath);

  if (parsed.state === "cancel") {
    app.notify("Checkout canceled. No charge was made.", "info");
    return "cancel";
  }

  for (let attempt = 0; attempt < STRIPE_RETURN_POLL_DELAYS_MS.length; attempt += 1) {
    const delayMs = STRIPE_RETURN_POLL_DELAYS_MS[attempt] || 0;
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    await app.debugLogEntitlement(true);
    if (app.hasProAccess) {
      app.notify("Purchase verified. Pro features unlocked.", "success");
      return "success";
    }
  }

  app.notify("Payment received. Pro unlock is still syncing. Please try Sync in a few seconds.", "info");
  return "success";
}
