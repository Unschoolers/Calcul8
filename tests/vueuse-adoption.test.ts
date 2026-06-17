import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("VueUse enters the app through a shared wrapper and sales chart sizing uses it", () => {
  const packageJson = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert.match(packageJson.dependencies?.["@vueuse/core"] || "", /^\^/);

  const wrapperPath = "src/app-core/ui/vueuse.ts";
  assert.equal(existsSync(wrapperPath), true);

  const wrapperSource = read(wrapperPath);
  assert.match(wrapperSource, /from ["']@vueuse\/core["']/);
  assert.match(wrapperSource, /useResizeObserver/);

  const salesChartsSource = read("src/app-core/methods/sales-charts.ts");
  assert.match(salesChartsSource, /from ["']\.\.\/ui\/vueuse\.ts["']/);
  assert.match(salesChartsSource, /observeElementResize/);
});
