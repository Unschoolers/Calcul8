import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { setActiveWorkspaceScope } from "../src/app-core/workspace-scope.ts";
import { markWorkspaceRealtimeDataChanged } from "../src/app-core/methods/ui/workspace/workspace-realtime-state.ts";

const { fetchPricing, savePricing } = vi.hoisted(() => ({
  fetchPricing: vi.fn(),
  savePricing: vi.fn()
}));

vi.mock("../src/app-core/methods/entity-api-shared.ts", () => ({
  canUseAuthoritativeSalesLiveApi: () => true,
  SalesLiveApiError: class SalesLiveApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
  }
}));
vi.mock("../src/app-core/methods/lot-live-pricing-api.ts", () => ({
  fetchAuthoritativeLivePricing: fetchPricing,
  saveAuthoritativeLivePricing: savePricing
}));

import {
  hydrateAuthoritativeLivePricingForLot,
  queueAuthoritativeLivePricingSave
} from "../src/app-core/methods/config-live-pricing.ts";

function createContext() {
  return {
    activeScopeType: "personal" as "personal" | "workspace",
    activeWorkspaceId: null as string | null,
    googleAuthEpoch: 1,
    lotHydrationRevision: 7,
    currentLotId: 7,
    liveSpotPrice: 11,
    liveBoxPriceSell: 22,
    livePackPrice: 33,
    currentLivePricingVersion: 4,
    livePricingHydrationStatus: "hydrated" as "hydrated" | "idle" | "loading" | "missing" | "error",
    livePricingHydratedLotId: 7 as number | null,
    notify: vi.fn()
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => vi.useRealTimers());

test("a queued save from an earlier A-B-A lot visit is discarded before dispatch", async () => {
  const context = createContext();
  queueAuthoritativeLivePricingSave(context, 7);
  context.currentLotId = 8;
  context.lotHydrationRevision += 1;
  context.currentLotId = 7;
  context.lotHydrationRevision += 1;

  await vi.advanceTimersByTimeAsync(500);

  assert.equal(savePricing.mock.calls.length, 0);
});

test("a queued save is discarded after real workspace A-B-A scope changes", async () => {
  const context = createContext();
  setActiveWorkspaceScope(context, "workspace", "alpha");
  queueAuthoritativeLivePricingSave(context, 7);
  const lotRevision = context.lotHydrationRevision;
  setActiveWorkspaceScope(context, "workspace", "beta");
  setActiveWorkspaceScope(context, "workspace", "alpha");

  await vi.advanceTimersByTimeAsync(500);

  assert.equal(context.currentLotId, 7);
  assert.equal(context.googleAuthEpoch, 1);
  assert.equal(context.lotHydrationRevision, lotRevision);
  assert.equal(savePricing.mock.calls.length, 0);
});

test("hydration from an earlier A-B-A lot visit cannot apply its response", async () => {
  const context = createContext();
  context.livePricingHydrationStatus = "idle";
  context.livePricingHydratedLotId = null;
  let resolveFetch: (value: unknown) => void = () => { throw new Error("fetch was not started"); };
  fetchPricing.mockReturnValue(new Promise(resolve => { resolveFetch = resolve; }));
  const pending = hydrateAuthoritativeLivePricingForLot(context, 7);
  assert.equal(fetchPricing.mock.calls.length, 1);

  context.currentLotId = 8;
  context.lotHydrationRevision += 1;
  context.livePricingHydrationStatus = "idle";
  context.livePricingHydratedLotId = null;
  context.currentLotId = 7;
  context.lotHydrationRevision += 1;
  context.liveSpotPrice = 77;
  context.liveBoxPriceSell = 88;
  context.livePackPrice = 99;
  resolveFetch({ liveSpotPrice: 1, liveBoxPriceSell: 2, livePackPrice: 3, version: 5 });
  await pending;

  assert.equal(context.liveSpotPrice, 77);
  assert.equal(context.liveBoxPriceSell, 88);
  assert.equal(context.livePackPrice, 99);
});

test("hydration from an earlier real workspace A-B-A scope cannot apply", async () => {
  const context = createContext();
  context.livePricingHydrationStatus = "idle";
  context.livePricingHydratedLotId = null;
  setActiveWorkspaceScope(context, "workspace", "alpha");
  let resolveFetch: (value: unknown) => void = () => { throw new Error("fetch was not started"); };
  fetchPricing.mockReturnValue(new Promise(resolve => { resolveFetch = resolve; }));
  const pending = hydrateAuthoritativeLivePricingForLot(context, 7);
  const lotRevision = context.lotHydrationRevision;
  setActiveWorkspaceScope(context, "workspace", "beta");
  setActiveWorkspaceScope(context, "workspace", "alpha");
  context.liveSpotPrice = 77;
  context.liveBoxPriceSell = 88;
  context.livePackPrice = 99;
  resolveFetch({ liveSpotPrice: 1, liveBoxPriceSell: 2, livePackPrice: 3, version: 5 });
  await pending;

  assert.equal(context.currentLotId, 7);
  assert.equal(context.lotHydrationRevision, lotRevision);
  assert.equal(context.liveSpotPrice, 77);
  assert.equal(context.liveBoxPriceSell, 88);
  assert.equal(context.livePackPrice, 99);
});

test("hydration cannot overwrite a realtime pricing update from the same lot visit", async () => {
  const context = createContext();
  context.livePricingHydrationStatus = "idle";
  context.livePricingHydratedLotId = null;
  let resolveFetch: (value: unknown) => void = () => { throw new Error("fetch was not started"); };
  fetchPricing.mockReturnValue(new Promise(resolve => { resolveFetch = resolve; }));
  const pending = hydrateAuthoritativeLivePricingForLot(context, 7);

  context.liveSpotPrice = 70;
  context.liveBoxPriceSell = 80;
  context.livePackPrice = 90;
  context.currentLivePricingVersion = 9;
  markWorkspaceRealtimeDataChanged(context);
  resolveFetch({ liveSpotPrice: 1, liveBoxPriceSell: 2, livePackPrice: 3, version: 5 });
  await pending;

  assert.equal(context.liveSpotPrice, 70);
  assert.equal(context.liveBoxPriceSell, 80);
  assert.equal(context.livePackPrice, 90);
  assert.equal(context.currentLivePricingVersion, 9);
  assert.equal(context.livePricingHydrationStatus, "idle");
});

test("a realtime sale event does not cancel a queued local pricing save", async () => {
  const context = createContext();
  context.livePricingHydrationStatus = "hydrated";
  context.livePackPrice = 44;
  savePricing.mockResolvedValue({ liveSpotPrice: 11, liveBoxPriceSell: 22, livePackPrice: 44, version: 5 });
  queueAuthoritativeLivePricingSave(context, 7);
  markWorkspaceRealtimeDataChanged(context);

  await vi.advanceTimersByTimeAsync(500);

  assert.equal(savePricing.mock.calls.length, 1);
  assert.equal(savePricing.mock.calls[0]?.[2].livePackPrice, 44);
});

test("an in-flight save cannot apply after real workspace A-B-A scope changes", async () => {
  const context = createContext();
  setActiveWorkspaceScope(context, "workspace", "alpha");
  let resolveSave: (value: unknown) => void = () => { throw new Error("save was not started"); };
  savePricing.mockReturnValue(new Promise(resolve => { resolveSave = resolve; }));
  queueAuthoritativeLivePricingSave(context, 7);
  await vi.advanceTimersByTimeAsync(500);
  const lotRevision = context.lotHydrationRevision;
  setActiveWorkspaceScope(context, "workspace", "beta");
  setActiveWorkspaceScope(context, "workspace", "alpha");
  resolveSave({ liveSpotPrice: 11, liveBoxPriceSell: 22, livePackPrice: 33, version: 5 });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(context.currentLotId, 7);
  assert.equal(context.googleAuthEpoch, 1);
  assert.equal(context.lotHydrationRevision, lotRevision);
  assert.equal(context.currentLivePricingVersion, 4);
  assert.equal((context.notify as ReturnType<typeof vi.fn>).mock.calls.length, 0);
});

test("a stale conflict does not dispatch its recovery GET", async () => {
  const context = createContext();
  let rejectSave: (error: unknown) => void = () => { throw new Error("save was not started"); };
  savePricing.mockReturnValue(new Promise((_resolve, reject) => { rejectSave = reject; }));
  queueAuthoritativeLivePricingSave(context, 7);
  await vi.advanceTimersByTimeAsync(500);

  context.googleAuthEpoch += 1;
  rejectSave(new (await import("../src/app-core/methods/entity-api-shared.ts")).SalesLiveApiError(409, "conflict"));
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(fetchPricing.mock.calls.length, 0);
  assert.equal(context.livePricingHydratedLotId, 7);
});

test("a conflict retries the original prices once and leaves a newer queued edit intact", async () => {
  const context = createContext();
  let rejectFirst: (error: unknown) => void = () => { throw new Error("save was not started"); };
  savePricing
    .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectFirst = reject; }))
    .mockResolvedValueOnce({ liveSpotPrice: 11, liveBoxPriceSell: 22, livePackPrice: 33, version: 6 })
    .mockResolvedValueOnce({ liveSpotPrice: 55, liveBoxPriceSell: 66, livePackPrice: 77, version: 7 });
  fetchPricing.mockResolvedValue({ liveSpotPrice: 1, liveBoxPriceSell: 2, livePackPrice: 3, version: 5 });
  queueAuthoritativeLivePricingSave(context, 7);
  await vi.advanceTimersByTimeAsync(500);
  context.liveSpotPrice = 55;
  context.liveBoxPriceSell = 66;
  context.livePackPrice = 77;
  queueAuthoritativeLivePricingSave(context, 7);
  rejectFirst(new (await import("../src/app-core/methods/entity-api-shared.ts")).SalesLiveApiError(409, "conflict"));
  await vi.runAllTimersAsync();

  assert.equal(savePricing.mock.calls.length, 3);
  assert.deepEqual(savePricing.mock.calls.map(([, , pricing]) => pricing), [
    { liveSpotPrice: 11, liveBoxPriceSell: 22, livePackPrice: 33, currentLivePricingVersion: 4 },
    { liveSpotPrice: 11, liveBoxPriceSell: 22, livePackPrice: 33, currentLivePricingVersion: 5 },
    { liveSpotPrice: 55, liveBoxPriceSell: 66, livePackPrice: 77, currentLivePricingVersion: 6 }
  ]);
});

test("an unresolved retry conflict notifies once and keeps the newer edit queued", async () => {
  const context = createContext();
  const { SalesLiveApiError } = await import("../src/app-core/methods/entity-api-shared.ts");
  let rejectFirst: (error: unknown) => void = () => { throw new Error("save was not started"); };
  savePricing
    .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectFirst = reject; }))
    .mockRejectedValueOnce(new SalesLiveApiError(409, "second conflict"));
  fetchPricing.mockResolvedValue({ liveSpotPrice: 1, liveBoxPriceSell: 2, livePackPrice: 3, version: 5 });
  queueAuthoritativeLivePricingSave(context, 7);
  await vi.advanceTimersByTimeAsync(500);
  context.liveSpotPrice = 55;
  context.liveBoxPriceSell = 66;
  context.livePackPrice = 77;
  queueAuthoritativeLivePricingSave(context, 7);
  rejectFirst(new SalesLiveApiError(409, "first conflict"));
  await vi.runAllTimersAsync();

  assert.equal(savePricing.mock.calls.length, 2);
  assert.deepEqual((context.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1), [
    "Live pricing changed in the cloud. Please review and save again.",
    "warning"
  ]);
});
