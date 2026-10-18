import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

test("the app shell keeps contextual actions in one shell-owned teleport target", () => {
  const appTemplate = readFileSync("src/App.html", "utf8");
  const dockTemplate = readFileSync("src/components/shell/ContextActionDock.html", "utf8");
  const liveTemplate = readFileSync("src/components/windows/live/LiveWindow.html", "utf8");
  const gameTemplate = readFileSync("src/components/windows/game/coordinator/GameWindow.html", "utf8");

  assert.match(appTemplate, /class="app-shell-action-zone"/);
  assert.match(dockTemplate, /<teleport defer to="\.app-shell-action-zone">/);
  assert.match(liveTemplate, /<context-action-dock/);
  assert.match(gameTemplate, /<context-action-dock/);
});

test("portfolio window and buyer host receive narrow feature ports", () => {
  const appTemplate = readFileSync("src/App.html", "utf8");
  const portfolioTemplate = readFileSync("src/components/windows/portfolio/PortfolioWindow.html", "utf8");
  const portfolioDefinition = readFileSync("src/components/windows/portfolio/PortfolioWindow.definition.ts", "utf8");
  const buyerHost = readFileSync("src/components/customers/BuyerQuickViewHost.ts", "utf8");
  const compositionRoot = readFileSync("src/app.ts", "utf8");

  assert.doesNotMatch(appTemplate, /<portfolio-window[^>]*:ctx=/);
  assert.doesNotMatch(portfolioTemplate, /<buyer-quick-view-host[^>]*:ctx=/);
  assert.doesNotMatch(portfolioDefinition, /PropType<Record<string, unknown>>|inject<Record<string, unknown>|createWindowContextBridge/);
  assert.doesNotMatch(buyerHost, /BuyerProfileHostContext = Record<string, unknown>/);
  assert.match(portfolioDefinition, /usePortfolioWindowPorts\(\)/);
  assert.match(buyerHost, /useBuyerProfilePorts\(\)/);
  assert.match(compositionRoot, /portfolioWindowPortsKey/);
  assert.match(compositionRoot, /buyerProfilePortsKey/);
});
