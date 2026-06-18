import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("visual smoke test harness", () => {
  it("keeps Playwright smoke coverage wired into the repo", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    assert.equal(pkg.scripts?.["test:visual"], "playwright test --grep @visual-smoke");
    assert.equal(pkg.scripts?.["test:visual:update"], undefined);
    assert.ok(pkg.devDependencies?.["@playwright/test"], "@playwright/test must be a dev dependency");

    for (const path of [
      "playwright.config.ts",
      "tests/visual/helpers/visualAssertions.ts",
      "tests/visual/helpers/visualSmokeState.ts",
      "tests/visual/visual-smoke.spec.ts",
      "docs/ui-visual-qa.md",
    ]) {
      assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
    }

    const config = read("playwright.config.ts");
    assert.match(config, /webServer/);
    assert.match(config, /mobile-smoke/);
    assert.match(config, /desktop-smoke/);
    assert.match(config, /reuseExistingServer/);

    const smokeSpec = read("tests/visual/visual-smoke.spec.ts");
    assert.match(smokeSpec, /@visual-smoke/);
    assert.match(smokeSpec, /page\.screenshot/);
    assert.match(smokeSpec, /expectNoPageOverflow/);

    const smokeState = read("tests/visual/helpers/visualSmokeState.ts");
    assert.match(smokeState, /Très Long Nom Mobile/);
    assert.match(smokeState, /currency:\s*"USD"/);
    assert.match(smokeState, /sellingCurrency:\s*"CAD"/);
    assert.match(smokeState, /Client Très Long/);

    const docs = read("docs/ui-visual-qa.md");
    assert.match(docs, /npm run test:visual/);
    assert.match(docs, /smoke/i);
  });
});
