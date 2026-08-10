import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

test("app shell exposes named mobile-first layout zones", () => {
  const template = read("src/App.html");

  for (const requiredZone of [
    "app-shell-root",
    "app-shell-content-zone",
    "app-shell-tab-zone",
    "app-shell-bottom-nav",
    "app-shell-action-zone",
    "app-shell-snackbar-zone"
  ]) {
    assert.match(template, new RegExp(requiredZone), `missing ${requiredZone}`);
  }

  assert.doesNotMatch(template, /interaction-disabled/);
  assert.doesNotMatch(template, /pointer-events:\s*none/);
});

test("auth shell waits for session bootstrap before showing the sign-in gate", () => {
  const template = read("src/App.html");

  assert.match(template, /v-if="isGoogleSignedIn"/);
  assert.match(template, /v-else-if="isAuthSessionResolving"/);
  assert.match(template, /authCheckingSessionTitle/);
  assert.match(template, /authCheckingSessionSubtitle/);
  assert.match(template, /v-else[\s\S]*<auth-gate-card><\/auth-gate-card>/);
});

test("auth startup renders the sign-in button before retrying auto-login", () => {
  const lifecycle = read("src/app-core/lifecycle.ts");

  assert.doesNotMatch(
    lifecycle,
    /this\.syncLivePricesFromDefaults\(\);\s*this\.initGoogleAutoLogin\(\);/,
    "startup must not open Google auto-login before server session bootstrap finishes"
  );
  assert.match(
    lifecycle,
    /this\.isAuthSessionResolving = false;[\s\S]*this\.\$nextTick\(\(\) => \{[\s\S]*this\.renderGoogleSignInButton\(\);[\s\S]*this\.initGoogleAutoLogin\(\);[\s\S]*\}\);/
  );
});

test("contextual shell exposes only one persistent action slot", () => {
  const template = read("src/App.html");
  const styles = read("src/styles/app.css");
  const tokens = read("src/styles/design-tokens.css");

  for (const requiredClass of [
    "app-context-action",
    "app-context-action-wrap",
    "app-context-action--slot-1",
    "app-context-action-badge-wrap"
  ]) {
    assert.match(template, new RegExp(requiredClass), `template missing ${requiredClass}`);
    assert.match(styles, new RegExp(`\\.${requiredClass}`), `styles missing ${requiredClass}`);
  }

  for (const token of [
    "--app-context-action-inline-offset",
    "--app-context-action-size",
    "--app-context-action-bottom-1",
    "--app-shell-content-bottom-padding",
    "--app-shell-snackbar-bottom"
  ]) {
    assert.match(tokens, new RegExp(token), `missing token ${token}`);
  }

  assert.match(tokens, /--app-bottom-nav-height:\s*4rem/);
  assert.match(tokens, /--app-context-action-size:\s*3\.5rem/);
  assert.match(tokens, /--app-shell-content-bottom-padding:[^;]*var\(--app-context-action-size\)/);

  for (const retiredToken of [
    "--app-context-action-bottom-2",
    "--app-context-action-bottom-3",
    "--app-fab-bottom-2",
    "--app-fab-bottom-3"
  ]) {
    assert.doesNotMatch(tokens, new RegExp(retiredToken), `tokens still define ${retiredToken}`);
  }

  for (const retiredClass of [
    "app-context-action--slot-2",
    "app-context-action--slot-3",
    "app-context-action-rail"
  ]) {
    assert.doesNotMatch(template, new RegExp(retiredClass), `template still uses ${retiredClass}`);
    assert.doesNotMatch(styles, new RegExp(`\\.${retiredClass}`), `styles still defines ${retiredClass}`);
  }

  for (const removedClass of [
    "fab-add-preset",
    "fab-calculate",
    "fab-live-reset",
    "fab-live-calc",
    "fab-live-clear",
    "fab-portfolio-report",
    "fab-overflow-sales",
    "fab-wheel-stack"
  ]) {
    assert.doesNotMatch(template, new RegExp(removedClass), `template still uses ${removedClass}`);
    assert.doesNotMatch(styles, new RegExp(`\\.${removedClass}`), `styles still defines ${removedClass}`);
  }
});

test("bottom navigation uses one active surface instead of a nested pill", () => {
  const template = read("src/App.html");
  const styles = read("src/styles/app.css");

  assert.match(template, /class="app-shell-bottom-nav" color="primary"/);
  assert.doesNotMatch(
    styles,
    /\.app-shell-bottom-nav \.v-btn\.v-btn--active \.v-btn__content\s*\{/,
    "active navigation must not combine the selected tab surface with an inner pill"
  );
});

test("no-lot blocking state uses the shared error state surface", () => {
  const script = read("src/components/shell/LotSelectorOnboardingBlock.ts");
  const template = read("src/components/shell/LotSelectorOnboardingBlock.html");
  const styles = read("src/components/shell/LotSelectorOnboardingBlock.css");

  assert.match(script, /AppErrorState/);
  assert.match(template, /<app-error-state/);
  assert.match(template, /app-shell-blocking-surface/);
  assert.doesNotMatch(template, /<v-alert[\s\S]+guided-onboarding-empty-state/);
  assert.doesNotMatch(template, /app-empty-state-alert/);
  assert.doesNotMatch(styles, /app-empty-state-alert/);
});

test("lot selector stays compact as the shared current-inventory strip", () => {
  const template = read("src/components/shell/LotSelectorOnboardingBlock.html");
  const styles = read("src/components/shell/LotSelectorOnboardingBlock.css");

  assert.match(template, /lot-selector-shell-card/);
  assert.match(styles, /@media \(min-width:\s*960px\)[\s\S]*\.lot-selector-shell-card \.v-card-text\s*{[\s\S]*padding:\s*0\.55rem\s+0\.75rem/);
  assert.match(styles, /@media \(min-width:\s*960px\)[\s\S]*\.lot-selector-actions \.v-btn\s*{[\s\S]*width:\s*42px/);
});
