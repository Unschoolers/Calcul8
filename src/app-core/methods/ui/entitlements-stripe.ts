import type { AppContext } from "../../context.ts";
import {
  fetchWithRetry,
  GOOGLE_TOKEN_KEY,
  handleExpiredAuth,
  resolveApiBaseUrl
} from "./shared.ts";

const STRIPE_RETURN_POLL_DELAYS_MS = [0, 800, 1400, 2200];
const STRIPE_EMBEDDED_CHECKOUT_MOUNT_ID = "stripe-embedded-checkout";

type StripeCheckoutReturnState = "none" | "success" | "cancel";

interface StripeCheckoutPayload {
  checkoutUrl: string | null;
  clientSecret: string | null;
}

interface StripeEmbeddedCheckout {
  mount(target: string): void;
  destroy?: () => void;
  unmount?: () => void;
}

interface StripeEmbeddedCheckoutInstance {
  initEmbeddedCheckout(options: {
    fetchClientSecret: () => Promise<string>;
    onComplete?: () => void | Promise<void>;
  }): Promise<StripeEmbeddedCheckout>;
}

type StripeFactory = (publishableKey: string) => StripeEmbeddedCheckoutInstance;

declare global {
  interface Window {
    Stripe?: StripeFactory;
  }
}

let activeEmbeddedCheckout: StripeEmbeddedCheckout | null = null;
let activeEmbeddedCheckoutVersion = 0;

export type StripeVerificationApp = Pick<AppContext, "hasProAccess" | "notify" | "debugLogEntitlement">;
export type StripeCheckoutApp = Pick<AppContext, "showStripeCheckoutModal" | "stripeCheckoutClientSecret" | "notify">;
export type StripePurchaseApp =
  & StripeVerificationApp
  & StripeCheckoutApp
  & Pick<AppContext, "isVerifyingPurchase" | "googleAuthEpoch" | "$nextTick">;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function resolveStripePublishableKey(): string {
  return String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "").trim();
}

function readCheckoutPayload(payload: Record<string, unknown> | null): StripeCheckoutPayload {
  const checkoutUrl = typeof payload?.checkoutUrl === "string" && payload.checkoutUrl.trim()
    ? payload.checkoutUrl.trim()
    : null;
  const clientSecret = typeof payload?.clientSecret === "string" && payload.clientSecret.trim()
    ? payload.clientSecret.trim()
    : null;

  return {
    checkoutUrl,
    clientSecret
  };
}

async function teardownEmbeddedCheckout(): Promise<void> {
  if (!activeEmbeddedCheckout) return;

  try {
    if (typeof activeEmbeddedCheckout.destroy === "function") {
      activeEmbeddedCheckout.destroy();
    } else if (typeof activeEmbeddedCheckout.unmount === "function") {
      activeEmbeddedCheckout.unmount();
    }
  } catch (error) {
    console.warn("[whatfees] Failed to teardown embedded checkout", error);
  } finally {
    activeEmbeddedCheckout = null;
  }
}

async function mountEmbeddedCheckout(app: StripePurchaseApp, clientSecret: string): Promise<boolean> {
  const currentWindow = (globalThis as { window?: Window }).window;
  const stripeFactory = currentWindow?.Stripe;
  const publishableKey = resolveStripePublishableKey();

  if (!publishableKey || typeof stripeFactory !== "function") {
    return false;
  }

  const currentDocument = (globalThis as { document?: Document }).document;
  const mountTarget = currentDocument?.getElementById(STRIPE_EMBEDDED_CHECKOUT_MOUNT_ID);
  if (!mountTarget) {
    return false;
  }

  await teardownEmbeddedCheckout();
  mountTarget.innerHTML = "";

  const version = ++activeEmbeddedCheckoutVersion;
  const stripe = stripeFactory(publishableKey);
  if (!stripe || typeof stripe.initEmbeddedCheckout !== "function") {
    return false;
  }

  const embeddedCheckout = await stripe.initEmbeddedCheckout({
    fetchClientSecret: async () => clientSecret,
    onComplete: () => {
      void (async () => {
        if (version !== activeEmbeddedCheckoutVersion) return;
        await teardownEmbeddedCheckout();
        app.showStripeCheckoutModal = false;
        app.stripeCheckoutClientSecret = "";
        await runStripeVerificationFlow(app);
      })();
    }
  });

  if (version !== activeEmbeddedCheckoutVersion || !app.showStripeCheckoutModal) {
    await teardownEmbeddedCheckout();
    return false;
  }

  activeEmbeddedCheckout = embeddedCheckout;
  embeddedCheckout.mount(`#${STRIPE_EMBEDDED_CHECKOUT_MOUNT_ID}`);
  return true;
}

async function refreshStripeEntitlement(app: StripeVerificationApp): Promise<boolean> {
  for (let attempt = 0; attempt < STRIPE_RETURN_POLL_DELAYS_MS.length; attempt += 1) {
    const delayMs = STRIPE_RETURN_POLL_DELAYS_MS[attempt] || 0;
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    await app.debugLogEntitlement(true);
    if (app.hasProAccess) {
      return true;
    }
  }

  return false;
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
  app: StripePurchaseApp,
  baseUrl: string,
  googleIdToken: string,
  uiMode: "embedded" | "hosted" = "embedded"
): Promise<StripeCheckoutPayload | null> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (googleIdToken.trim()) {
    headers.Authorization = `Bearer ${googleIdToken.trim()}`;
  }

  const response = await fetchWithRetry(`${baseUrl}/billing/checkout-session`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      uiMode
    })
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

  const checkoutPayload = readCheckoutPayload(payload);
  if (!checkoutPayload.clientSecret && !checkoutPayload.checkoutUrl) {
    app.notify("Stripe checkout did not return a usable session.", "error");
    return null;
  }

  return checkoutPayload;
}

export async function runStripePurchaseFlow(app: StripePurchaseApp): Promise<void> {
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
    const checkoutPayload = await startStripeCheckout(app, base, googleIdToken, "embedded");
    if (!checkoutPayload) return;

    const publishableKey = resolveStripePublishableKey();
    const hasEmbeddedInputs = !!publishableKey && !!checkoutPayload.clientSecret;
    if (hasEmbeddedInputs) {
      app.stripeCheckoutClientSecret = checkoutPayload.clientSecret || "";
      app.showStripeCheckoutModal = true;
      await app.$nextTick(() => undefined);
      const mounted = await mountEmbeddedCheckout(app, app.stripeCheckoutClientSecret);
      if (mounted) {
        return;
      }

      app.showStripeCheckoutModal = false;
      app.stripeCheckoutClientSecret = "";
      console.warn("[whatfees] Embedded checkout unavailable, falling back to redirect checkout");
    }

    let redirectUrl = checkoutPayload.checkoutUrl || "";
    if (!redirectUrl) {
      const hostedPayload = await startStripeCheckout(app, base, googleIdToken, "hosted");
      redirectUrl = hostedPayload?.checkoutUrl || "";
    }

    if (!redirectUrl) {
      app.notify("Stripe checkout is unavailable right now. Please try again.", "error");
      return;
    }

    app.notify("Redirecting to secure checkout...", "info");
    window.location.assign(redirectUrl);
  } catch (error) {
    console.warn("[whatfees] Stripe checkout start failed", error);
    app.notify("Could not start Stripe checkout. Please try again.", "error");
  } finally {
    app.isVerifyingPurchase = false;
  }
}

export async function runStripeVerificationFlow(app: StripeVerificationApp): Promise<void> {
  const hasAccess = await refreshStripeEntitlement(app);
  if (hasAccess) {
    app.notify("Purchase verified. Pro features unlocked.", "success");
  } else {
    app.notify("No completed Stripe purchase found yet. Try again in a few seconds.", "info");
  }
}

export async function closeStripeEmbeddedCheckout(
  app: StripeCheckoutApp,
  options: {
    notifyCanceled?: boolean;
  } = {}
): Promise<void> {
  const { notifyCanceled = false } = options;
  activeEmbeddedCheckoutVersion += 1;
  await teardownEmbeddedCheckout();
  app.showStripeCheckoutModal = false;
  app.stripeCheckoutClientSecret = "";
  if (notifyCanceled) {
    app.notify("Checkout canceled. No charge was made.", "info");
  }
}

export async function handleStripeCheckoutReturn(app: StripeVerificationApp): Promise<StripeCheckoutReturnState> {
  const parsed = parseStripeCheckoutReturn();
  if (parsed.state === "none") {
    return "none";
  }

  cleanStripeCheckoutReturnUrl(parsed.cleanedPath);

  if (parsed.state === "cancel") {
    app.notify("Checkout canceled. No charge was made.", "info");
    return "cancel";
  }

  const hasAccess = await refreshStripeEntitlement(app);
  if (hasAccess) {
    app.notify("Purchase verified. Pro features unlocked.", "success");
    return "success";
  }

  app.notify("Payment received. Pro unlock is still syncing. Please try Sync in a few seconds.", "info");
  return "success";
}
