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
  assert.match(template, /v-else[\s\S]*<auth-gate-card :ctx="this"><\/auth-gate-card>/);
});

test("contextual shell actions use shared slots instead of per-tab bottom offsets", () => {
  const template = read("src/App.html");
  const styles = read("src/styles/app.css");
  const tokens = read("src/styles/design-tokens.css");

  for (const requiredClass of [
    "app-context-action",
    "app-context-action--slot-1",
    "app-context-action--slot-2",
    "app-context-action--slot-3",
    "app-context-action-rail",
    "app-context-action-badge-wrap"
  ]) {
    assert.match(template, new RegExp(requiredClass), `template missing ${requiredClass}`);
    assert.match(styles, new RegExp(`\\.${requiredClass}`), `styles missing ${requiredClass}`);
  }

  for (const token of [
    "--app-context-action-inline-offset",
    "--app-context-action-bottom-1",
    "--app-context-action-bottom-2",
    "--app-context-action-bottom-3",
    "--app-shell-content-bottom-padding",
    "--app-shell-snackbar-bottom"
  ]) {
    assert.match(tokens, new RegExp(token), `missing token ${token}`);
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
