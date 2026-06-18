import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

test("shared design tokens define operational, expressive, and semantic state colors", () => {
  const tokens = read("src/styles/design-tokens.css");

  for (const token of [
    "--app-operational-surface-bg",
    "--app-expressive-surface-bg",
    "--app-expressive-border",
    "--app-status-live-text",
    "--app-status-live-surface",
    "--app-status-live-stroke",
    "--app-status-inactive-text",
    "--app-status-inactive-surface",
    "--app-status-inactive-stroke",
    "--app-status-claimed-text",
    "--app-status-claimed-surface",
    "--app-status-claimed-stroke",
    "--app-status-selected-text",
    "--app-status-selected-surface",
    "--app-status-selected-stroke",
    "--app-status-disabled-text",
    "--app-status-disabled-surface",
    "--app-status-disabled-stroke",
    "--app-status-warning-text",
    "--app-status-warning-surface",
    "--app-status-warning-stroke",
    "--app-profit-positive-surface",
    "--app-profit-negative-surface"
  ]) {
    assert.match(tokens, new RegExp(`${token}:`), `${token} should be defined`);
  }
});

test("global UI classes expose product personality and reusable status chips", () => {
  const appStyles = read("src/styles/app.css");

  assert.match(appStyles, /\.app-operational-surface/);
  assert.match(appStyles, /\.app-expressive-surface/);

  for (const tone of ["live", "inactive", "claimed", "selected", "disabled", "warning", "error", "success"]) {
    assert.match(appStyles, new RegExp(`\\.app-status-chip--${tone}\\b`));
  }
});

test("game spectator controls use shared semantic status tokens instead of one-off colors", () => {
  const topbar = read("src/components/windows/game/stage/WheelStageTopbar.vue");
  const gameStyles = read("src/components/windows/game/styles/GameWindow.css");

  assert.match(topbar, /var\(--app-status-live-surface\)/);
  assert.match(topbar, /var\(--app-status-warning-surface\)/);
  assert.match(topbar, /var\(--app-status-inactive-surface\)/);
  assert.doesNotMatch(topbar, /rgba\(var\(--v-theme-success\)/);
  assert.doesNotMatch(topbar, /rgba\(var\(--v-theme-warning\)/);

  assert.match(gameStyles, /var\(--app-status-live-surface\)/);
  assert.match(gameStyles, /var\(--app-status-warning-surface\)/);
  assert.match(gameStyles, /var\(--app-status-inactive-surface\)/);
});

test("spectator styling has explicit light and dark theme mappings", () => {
  const spectatorStyles = read("src/styles/spectator.css");

  assert.match(spectatorStyles, /\.v-theme--unionArenaLight[\s\S]+--spectator-text:/);
  assert.match(spectatorStyles, /\.v-theme--unionArenaDark[\s\S]+--spectator-text:/);
  assert.match(spectatorStyles, /--spectator-card-bg:\s*var\(--app-expressive-surface-bg\)/);
  assert.match(spectatorStyles, /--spectator-border-default:\s*var\(--app-expressive-border\)/);
  assert.match(spectatorStyles, /--spectator-status-live-surface:\s*var\(--app-status-live-surface\)/);
  assert.match(spectatorStyles, /--spectator-status-ended-surface:\s*var\(--app-status-inactive-surface\)/);
});

test("dark theme hierarchy and desktop dashboard rhythm have explicit contracts", () => {
  const tokens = read("src/styles/design-tokens.css");
  const appStyles = read("src/styles/app.css");
  const liveStyles = read("src/components/windows/live/LiveWindow.css");
  const salesStyles = read("src/components/windows/sales/SalesWindow.css");
  const portfolioStyles = read("src/components/windows/portfolio/PortfolioWindow.css");

  for (const token of [
    "--app-text-subtle",
    "--app-bottom-nav-active-surface",
    "--app-bottom-nav-inactive-text",
    "--app-dashboard-desktop-gap",
    "--app-dashboard-card-max-width"
  ]) {
    assert.match(tokens, new RegExp(`${token}:`), `${token} should be defined`);
  }

  assert.match(tokens, /\.v-theme--unionArenaDark[\s\S]+--app-text-muted:/);
  assert.match(tokens, /\.v-theme--unionArenaDark[\s\S]+--app-bottom-nav-active-surface:/);

  assert.match(appStyles, /\.v-theme--unionArenaDark \.v-bottom-navigation/);
  assert.match(appStyles, /\.v-theme--unionArenaDark \.v-bottom-navigation \.v-btn:not\(\.v-btn--active\)/);
  assert.match(appStyles, /\.v-theme--unionArenaDark \.v-bottom-navigation \.v-btn\.v-btn--active/);

  assert.match(liveStyles, /--app-dashboard-card-max-width/);
  assert.match(liveStyles, /@media \(min-width: 1145px\)/);
  assert.match(salesStyles, /--app-dashboard-desktop-gap/);
  assert.match(salesStyles, /\.v-theme--unionArenaDark \.sales-section-card/);
  assert.match(portfolioStyles, /--app-dashboard-desktop-gap/);
  assert.match(portfolioStyles, /\.v-theme--unionArenaDark \.portfolio-section-card/);
});
