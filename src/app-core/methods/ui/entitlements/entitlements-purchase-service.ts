import {
  closeStripeEmbeddedCheckout,
  runStripePurchaseFlow,
  runStripeVerificationFlow
} from "./entitlements-stripe.ts";
import type {
  PlayPurchaseContext,
  PurchaseRoutingContext,
  StripeCheckoutContext,
  StripePurchaseContext,
  StripeVerificationContext
} from "../../../context/entitlements.ts";
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
type PurchaseServiceDeps = PurchaseProviderDeps & {
  startPlayPurchase: (app: PlayPurchaseContext) => Promise<void>;
  verifyPlayPurchase: (app: PlayPurchaseContext) => Promise<void>;
  runStripePurchaseFlow: (app: StripePurchaseContext) => Promise<void>;
  runStripeVerificationFlow: (app: StripeVerificationContext) => Promise<void>;
  closeStripeEmbeddedCheckout: (app: StripeCheckoutContext, options?: { notifyCanceled?: boolean }) => Promise<void>;
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
  app: PurchaseRoutingContext,
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
  app: PurchaseRoutingContext,
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
  app: StripeCheckoutContext,
  deps: Partial<PurchaseServiceDeps> = {}
): Promise<void> {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies PurchaseServiceDeps;
  await resolvedDeps.closeStripeEmbeddedCheckout(app, { notifyCanceled: true });
}

export async function startPlayPurchaseFlow(
  app: PlayPurchaseContext,
  deps: Partial<PlayPurchaseDeps> = {}
): Promise<void> {
  await startPlayPurchaseFlowInternal(app, deps);
}

export async function verifyPlayPurchaseFlow(
  app: PlayPurchaseContext,
  deps: Partial<PlayPurchaseDeps> = {}
): Promise<void> {
  await verifyPlayPurchaseFlowInternal(app, deps);
}

