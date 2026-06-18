import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, vi } from "vitest";
import { LivePriceCard } from "../src/components/live-price/LivePriceCard.ts";

type CardCtx = {
  modelValue: number;
  units: number;
  remainingUnits?: number | null;
  profitBasis: number | null;
  forecastProfit?: number | null;
  forecastPercent?: number | null;
  avgPriceNeeded?: number | null;
  neededProfit?: number | null;
  neededPercent?: number | null;
  targetProfitPercent?: number | null;
  estimateProfitAtPrice?: ((price: number) => number | null) | null;
  estimatePercentAtPrice?: ((price: number) => number | null) | null;
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
    targetProfitPercent: 15,
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

test("selectScenarioPrice emits update:modelValue with the scenario price", () => {
  const context = createContext({ modelValue: 12 });
  const selectScenarioPrice = getMethod<(this: CardCtx, offset: number) => void>("selectScenarioPrice");

  selectScenarioPrice.call(context, 4);
  selectScenarioPrice.call(context, -20);

  assert.deepEqual(context.$emit.mock.calls, [["update:modelValue", 16]]);
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

test("displayProfitAtPrice and displayProfitPercentAtPrice prefer forecast estimators when provided", () => {
  const context = createContext({
    estimateProfitAtPrice: (price) => price * 2,
    estimatePercentAtPrice: (price) => price / 2,
    calculateProfit: (_units, pricePerUnit) => pricePerUnit - 10
  });

  const displayProfitAtPrice = getMethod<(this: CardCtx, price: number) => number>("displayProfitAtPrice");
  const displayProfitPercentAtPrice = getMethod<(this: CardCtx, price: number) => number>("displayProfitPercentAtPrice");

  assert.equal(displayProfitAtPrice.call(context, 11), 22);
  assert.equal(displayProfitPercentAtPrice.call(context, 20), 10);
});

test("desktop scenario grid exposes paired price sensitivity offsets from five down to one", () => {
  const context = createContext({ modelValue: 10 });
  const scenarioOffsets = getMethod<(this: CardCtx) => number[]>("scenarioOffsets");
  const scenarioDeltaLabel = getMethod<(this: CardCtx, offset: number) => string>("scenarioDeltaLabel");
  const scenarioTileClass = getMethod<(this: CardCtx, offset: number) => Record<string, boolean>>("scenarioTileClass");
  const scenarioTileStyle = getMethod<(this: CardCtx, offset: number) => Record<string, string>>("scenarioTileStyle");

  assert.deepEqual(scenarioOffsets.call(context), [-5, 1, -4, 2, -3, 3, -2, 4, -1, 5]);
  assert.equal(scenarioDeltaLabel.call(context, -5), "-$5");
  assert.equal(scenarioDeltaLabel.call(context, 5), "+$5");
  assert.deepEqual(scenarioTileClass.call(context, -5), { "live-pricing-card__scenario-tile--desktop-extra": true });
  assert.deepEqual(scenarioTileClass.call(context, 1), { "live-pricing-card__scenario-tile--desktop-extra": false });
  assert.deepEqual(scenarioTileStyle.call(context, -5), {
    "--live-scenario-border-rgb": "var(--v-theme-error)",
    "--live-scenario-border-alpha": "0.460",
    "--live-scenario-progress-percent": "0.0%"
  });
  assert.deepEqual(scenarioTileStyle.call(context, 1), {
    "--live-scenario-border-rgb": "var(--v-theme-success)",
    "--live-scenario-border-alpha": "0.347",
    "--live-scenario-progress-percent": "83.3%"
  });
});

test("scenario tile progress uses target profit percent from the price calculator", () => {
  const context = createContext({
    modelValue: 10,
    targetProfitPercent: 15,
    estimatePercentAtPrice: (price) => (price - 10) * 3
  });
  const scenarioTileStyle = getMethod<(this: CardCtx, offset: number) => Record<string, string>>("scenarioTileStyle");

  assert.deepEqual(scenarioTileStyle.call(context, -5), {
    "--live-scenario-border-rgb": "var(--v-theme-error)",
    "--live-scenario-border-alpha": "0.460",
    "--live-scenario-progress-percent": "0.0%"
  });
  assert.deepEqual(scenarioTileStyle.call(context, 1), {
    "--live-scenario-border-rgb": "var(--v-theme-success)",
    "--live-scenario-border-alpha": "0.188",
    "--live-scenario-progress-percent": "60.0%"
  });
  assert.deepEqual(scenarioTileStyle.call(context, 5), {
    "--live-scenario-border-rgb": "var(--v-theme-success)",
    "--live-scenario-border-alpha": "0.460",
    "--live-scenario-progress-percent": "100.0%"
  });
});

test("desktop scenario grid omits impossible negative prices", () => {
  const context = createContext({ modelValue: 2 });
  const scenarioOffsets = getMethod<(this: CardCtx) => number[]>("scenarioOffsets");

  assert.deepEqual(scenarioOffsets.call(context), [-2, 1, -1, 2, 3, 4, 5]);
});

test("LivePriceCard template and CSS keep extra scenario tiles desktop-only", () => {
  const template = readFileSync("src/components/live-price/LivePriceCard.html", "utf8");
  const styles = readFileSync("src/components/windows/live/LiveWindow.css", "utf8");

  assert.match(template, /v-for="offset in scenarioOffsets\(\)"/);
  assert.match(template, /<button[\s\S]*type="button"[\s\S]*@click="selectScenarioPrice\(offset\)"/);
  assert.match(template, /:class="scenarioTileClass\(offset\)"/);
  assert.match(template, /:style="scenarioTileStyle\(offset\)"/);
  assert.match(template, /scenarioDeltaLabel\(offset\)/);
  assert.match(template, /displayProfitAtPrice\(modelValue \+ offset\)/);
  assert.match(template, /live-pricing-card__scenario-main/);
  assert.match(template, /live-pricing-card__scenario-detail/);
  assert.ok(
    template.indexOf("live-pricing-card__scenario-price") < template.indexOf("live-pricing-card__scenario-percent"),
    "scenario price should render before percentage"
  );
  assert.ok(
    template.indexOf("live-pricing-card__scenario-percent") < template.indexOf("live-pricing-card__scenario-profit"),
    "scenario percentage should render before profit dollars"
  );
  assert.match(styles, /\.live-pricing-card__scenario-price\s*{[\s\S]*font-size:\s*1\.04rem/);
  assert.match(styles, /\.live-pricing-card__scenario-percent\s*{[\s\S]*font-size:\s*0\.82rem/);
  assert.match(styles, /\.live-pricing-card__scenario-detail\s*{[\s\S]*font-size:\s*0\.76rem/);
  assert.match(styles, /\.live-pricing-card__scenario-chip\s*{[\s\S]*background:\s*rgba\(var\(--v-theme-surface\),\s*0\.86\)/);
  assert.match(styles, /\.live-pricing-card__scenario-chip\s*{[\s\S]*border:\s*var\(--app-stroke-hairline\) solid rgba\(var\(--v-theme-on-surface\),\s*0\.18\)/);
  assert.match(styles, /--live-scenario-progress-percent/);
  assert.match(styles, /\.live-pricing-card__scenario-tile\s*{[\s\S]*background:\s*rgba\(var\(--v-theme-surface\),\s*0\.44\)/);
  assert.doesNotMatch(styles, /\.live-pricing-card__scenario-tile\s*{[\s\S]*linear-gradient\(135deg/);
  assert.match(styles, /\.live-pricing-card__scenario-tile\s*{[\s\S]*cursor:\s*pointer/);
  assert.match(styles, /\.live-pricing-card__scenario-tile:focus-visible\s*{/);
  assert.match(styles, /\.live-pricing-card__scenario-tile::before[\s\S]*linear-gradient\(90deg/);
  assert.match(styles, /\.live-pricing-card__scenario-tile::after[\s\S]*left:\s*var\(--live-scenario-progress-percent\)/);
  assert.match(styles, /\.live-pricing-card__scenario-tile--desktop-extra\s*{[\s\S]*display:\s*none/);
  assert.match(styles, /@media \(min-width:\s*1145px\)[\s\S]*\.live-pricing-card__scenario-detail\s*{[\s\S]*min-height:\s*1\.25rem[\s\S]*opacity:\s*0[\s\S]*transition:\s*opacity/);
  assert.doesNotMatch(styles, /\.live-pricing-card__scenario-detail\s*{[\s\S]*max-height/);
  assert.match(styles, /\.live-pricing-card__scenario-tile:hover \.live-pricing-card__scenario-detail[\s\S]*opacity:\s*1/);
  assert.match(styles, /\.live-pricing-card__scenario-tile:focus-visible \.live-pricing-card__scenario-detail[\s\S]*opacity:\s*1/);
  assert.match(styles, /@media \(min-width:\s*1145px\)[\s\S]*\.live-pricing-card__scenario-tile--desktop-extra\s*{[\s\S]*display:\s*flex/);
  assert.match(styles, /\.live-pricing-card__decision-tile--success\s*{[\s\S]*display:\s*flex[\s\S]*align-items:\s*center/);
  assert.match(styles, /\.live-pricing-card__decision-tile--success\s*{[\s\S]*padding:\s*0\.65rem 0\.75rem/);
  assert.doesNotMatch(styles, /@media \(min-width:\s*1145px\)[\s\S]*\.live-pricing-card__target-summary\s*{[\s\S]*min-height:\s*118px/);
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

test("currentPriceGap compares the visible price against the needed average price", () => {
  const context = createContext({
    modelValue: 97,
    avgPriceNeeded: 92
  } as Partial<CardCtx> & { avgPriceNeeded: number });

  const currentPriceGap = getMethod<(this: CardCtx & { avgPriceNeeded?: number | null }) => number | null>("currentPriceGap");

  assert.equal(currentPriceGap.call(context as CardCtx & { avgPriceNeeded?: number | null }), 5);
});

test("shouldShowTargetDecision only returns true when there is meaningful drift from target", () => {
  const context = createContext({
    modelValue: 97,
    avgPriceNeeded: 92,
    remainingUnits: 3
  } as Partial<CardCtx> & { avgPriceNeeded: number });

  const shouldShowTargetDecision = getMethod<(this: CardCtx & { avgPriceNeeded?: number | null }) => boolean>("shouldShowTargetDecision");

  assert.equal(shouldShowTargetDecision.call(context as CardCtx & { avgPriceNeeded?: number | null }), true);

  context.modelValue = 92;
  assert.equal(shouldShowTargetDecision.call(context as CardCtx & { avgPriceNeeded?: number | null }), false);

  context.modelValue = 92.004;
  assert.equal(shouldShowTargetDecision.call(context as CardCtx & { avgPriceNeeded?: number | null }), false);

  context.modelValue = 97;
  context.remainingUnits = 0;
  assert.equal(shouldShowTargetDecision.call(context as CardCtx & { avgPriceNeeded?: number | null }), false);
});

test("translate falls back when the i18n layer returns the raw key", () => {
  const context = createContext({
    ctx: {
      t: (key: string) => key
    }
  } as Partial<CardCtx> & { ctx: { t: (key: string) => string } });

  const translate = getMethod<(this: CardCtx & { ctx?: { t: (key: string) => string } }, key: string, fallback: string) => string>("translate");

  assert.equal(
    translate.call(context as CardCtx & { ctx?: { t: (key: string) => string } }, "missingKey", "Fallback copy"),
    "Fallback copy"
  );
});
