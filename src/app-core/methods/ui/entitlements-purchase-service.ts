import {
  closeStripeEmbeddedCheckout,
  runStripePurchaseFlow,
  runStripeVerificationFlow,
  type StripeCheckoutApp,
  type StripePurchaseApp,
  type StripeVerificationApp
} from "./entitlements-stripe.ts";
import {
  defaultPurchaseProviderDeps,
  notifyUnsupportedPurchaseProvider,
  resolveEffectivePurchaseProvider,
  type PurchaseProviderDeps
} from "./entitlements-purchase-provider.ts";
import {
  defaultPlayPurchaseDeps,
  startPlayPurchaseFlow as startPlayPurchaseFlowInternal,
  verifyPlayPurchaseFlow as verifyPlayPurchaseFlowInternal,
  type PlayPurchaseDeps
} from "./entitlements-purchase-play.ts";
import type {
  PlayPurchaseApp,
  PurchaseRoutingApp
} from "./entitlements-purchase-types.ts";

type PurchaseServiceDeps = PurchaseProviderDeps & {
  startPlayPurchase: (app: PlayPurchaseApp) => Promise<void>;
  verifyPlayPurchase: (app: PlayPurchaseApp) => Promise<void>;
  runStripePurchaseFlow: (app: StripePurchaseApp) => Promise<void>;
  runStripeVerificationFlow: (app: StripeVerificationApp) => Promise<void>;
  closeStripeEmbeddedCheckout: (app: StripeCheckoutApp, options?: { notifyCanceled?: boolean }) => Promise<void>;
};

const defaultDeps: PurchaseServiceDeps = {
  ...defaultPurchaseProviderDeps,
  startPlayPurchase: (app) => startPlayPurchaseFlowInternal(app),
  verifyPlayPurchase: (app) => verifyPlayPurchaseFlowInternal(app),
  runStripePurchaseFlow,
  runStripeVerificationFlow,
  closeStripeEmbeddedCheckout
};

export async function startProPurchaseFlow(
  app: PurchaseRoutingApp,
  deps: Partial<PurchaseServiceDeps> = {}
): Promise<void> {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies PurchaseServiceDeps;
  const provider = await resolveEffectivePurchaseProvider(resolvedDeps);

  if (provider === "play") {
    await resolvedDeps.startPlayPurchase(app);
    return;
  }

  if (provider === "stripe") {
    await resolvedDeps.runStripePurchaseFlow(app);
    return;
  }

  notifyUnsupportedPurchaseProvider(app, provider, "purchases", resolvedDeps);
}

export async function verifyProPurchaseFlow(
  app: PurchaseRoutingApp,
  deps: Partial<PurchaseServiceDeps> = {}
): Promise<void> {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies PurchaseServiceDeps;
  const provider = await resolveEffectivePurchaseProvider(resolvedDeps);

  if (provider === "play") {
    await resolvedDeps.verifyPlayPurchase(app);
    return;
  }

  if (provider === "stripe") {
    await resolvedDeps.runStripeVerificationFlow(app);
    return;
  }

  notifyUnsupportedPurchaseProvider(app, provider, "verification", resolvedDeps);
}

export async function closeStripeCheckoutFlow(
  app: StripeCheckoutApp,
  deps: Partial<PurchaseServiceDeps> = {}
): Promise<void> {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies PurchaseServiceDeps;
  await resolvedDeps.closeStripeEmbeddedCheckout(app, { notifyCanceled: true });
}

export async function startPlayPurchaseFlow(
  app: PlayPurchaseApp,
  deps: Partial<PlayPurchaseDeps> = {}
): Promise<void> {
  await startPlayPurchaseFlowInternal(app, deps);
}

export async function verifyPlayPurchaseFlow(
  app: PlayPurchaseApp,
  deps: Partial<PlayPurchaseDeps> = {}
): Promise<void> {
  await verifyPlayPurchaseFlowInternal(app, deps);
}

