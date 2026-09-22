import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

test("account menu shows the generated app version in a responsive footer", () => {
  const definition = readFileSync("src/components/shell/AppShellTopBar.ts", "utf8");
  const template = readFileSync("src/components/shell/AppShellTopBar.html", "utf8");
  const css = readFileSync("src/components/shell/AppShellTopBar.css", "utf8");
  const en = JSON.parse(readFileSync("src/app-core/i18n/locales/en/auth.json", "utf8")) as Record<string, string>;
  const fr = JSON.parse(readFileSync("src/app-core/i18n/locales/fr/auth.json", "utf8")) as Record<string, string>;

  assert.match(definition, /import\s*{\s*APP_VERSION\s*}\s*from\s*["']\.\.\/\.\.\/constants\.ts["']/);
  assert.match(definition, /appVersion:\s*APP_VERSION/);
  assert.match(template, /class="account-menu-version"/);
  assert.match(template, /accountMenuVersionLabel/);
  assert.match(template, /appVersion/);
  assert.match(css, /\.account-menu-version\s*{[\s\S]*justify-content:\s*center[\s\S]*max-width:\s*100%[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(css, /@media \(max-width:\s*640px\)[\s\S]*\.account-menu-version\s*{/);
  assert.equal(en.accountMenuVersionLabel, "Version {{version}}");
  assert.equal(fr.accountMenuVersionLabel, "Version {{version}}");
});
