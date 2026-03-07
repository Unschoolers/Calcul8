import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { LivePriceCard } from "../src/components/LivePriceCard.ts";

type CardCtx = {
  modelValue: number;
  units: number;
  profitBasis: number | null;
  forecastProfit?: number | null;
  forecastPercent?: number | null;
  calculateProfit: ((units: number, pricePerUnit: number) => number) | null;
  safeFixed: ((value: number, decimals?: number) => string) | null;
  $emit: ReturnType<typeof vi.fn>;
  profitAt: (price: number) => number;
};

function getMethod<T extends (...args: never[]) => unknown>(name: string): T {
  return (LivePriceCard.methods as Record<string, unknown>)[name] as T;
}

function createContext(overrides: Partial<CardCtx> = {}): CardCtx {
  const context: CardCtx = {
    modelValue: 10,
    units: 1,
    profitBasis: 10,
    calculateProfit: (_units, pricePerUnit) => pricePerUnit - 10,
    safeFixed: (value, decimals = 2) => Number(value).toFixed(decimals),
    $emit: vi.fn(),
    profitAt: () => 0,
    ...overrides
  };

  for (const [name, method] of Object.entries(LivePriceCard.methods as Record<string, unknown>)) {
    if (typeof method === "function") {
      (context as Record<string, unknown>)[name] = (method as (...args: unknown[]) => unknown).bind(context);
    }
  }

  return context;
}

test("changePrice emits update:modelValue with adjusted value", () => {
  const context = createContext({ modelValue: 12 });
  getMethod<(this: CardCtx, delta: number) => void>("changePrice").call(context, -1);
  assert.deepEqual(context.$emit.mock.calls[0], ["update:modelValue", 11]);
});

test("profitAt and formatAt handle function and fallback branches", () => {
  const context = createContext({
    units: 2,
    calculateProfit: (units, pricePerUnit) => (pricePerUnit * units) - 5,
    safeFixed: null
  });

  const profitAt = getMethod<(this: CardCtx, price: number) => number>("profitAt");
  const formatAt = getMethod<(this: CardCtx, value: number, decimals?: number) => string>("formatAt");

  assert.equal(profitAt.call(context, 4), 3);
  assert.equal(formatAt.call(context, 3.456, 1), "3.5");

  context.calculateProfit = null;
  assert.equal(profitAt.call(context, 99), 0);
  assert.equal(formatAt.call(context, Number.NaN, 2), "0.00");
});

test("profitPercentAt handles positive basis and zero/invalid basis", () => {
  const context = createContext({
    profitBasis: 20,
    calculateProfit: (_units, pricePerUnit) => pricePerUnit - 10
  });

  const profitPercentAt = getMethod<(this: CardCtx, price: number) => number>("profitPercentAt");
  assert.equal(profitPercentAt.call(context, 14), 20);

  context.profitBasis = 0;
  assert.equal(profitPercentAt.call(context, 14), 100);

  context.calculateProfit = () => -5;
  assert.equal(profitPercentAt.call(context, 14), 0);
});

test("displayProfit and displayProfitPercent prefer explicit forecast values", () => {
  const context = createContext({
    modelValue: 85,
    calculateProfit: (_units, pricePerUnit) => pricePerUnit - 10,
    profitBasis: 100,
    forecastProfit: 136.33,
    forecastPercent: 12.8
  });

  const displayProfit = getMethod<(this: CardCtx) => number>("displayProfit");
  const displayProfitPercent = getMethod<(this: CardCtx) => number>("displayProfitPercent");
  assert.equal(displayProfit.call(context), 136.33);
  assert.equal(displayProfitPercent.call(context), 12.8);
});

test("needed display helpers and delta use needed values", () => {
  const context = createContext({
    modelValue: 85,
    forecastProfit: 174.88,
    forecastPercent: 16.5,
    avgPriceNeeded: 81,
    neededProfit: 120,
    neededPercent: 15
  });

  const neededDisplayProfit = getMethod<(this: CardCtx) => number | null>("neededDisplayProfit");
  const neededDisplayPercent = getMethod<(this: CardCtx) => number | null>("neededDisplayPercent");
  const deltaVsNeeded = getMethod<(this: CardCtx) => number | null>("deltaVsNeeded");

  assert.equal(neededDisplayProfit.call(context), 120);
  assert.equal(neededDisplayPercent.call(context), 15);
  assert.ok(Math.abs((deltaVsNeeded.call(context) || 0) - 54.88) < 0.000001);
});
