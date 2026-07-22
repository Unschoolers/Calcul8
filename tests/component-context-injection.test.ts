import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";

const read = (path: string): string => readFileSync(path, "utf8");

describe("typed component capability injection", () => {
  test("configuration components do not receive or discover the aggregate root context", () => {
    const appTemplate = read("src/App.html");
    const configTemplate = read("src/components/windows/config/ConfigWindow.html");
    const singlesTemplate = read("src/components/windows/singles/SinglesConfigWindow.html");
    const configWindow = read("src/components/windows/config/ConfigWindow.ts");
    const adminCard = read("src/components/windows/config/AdminSyncImportCard.ts");

    assert.doesNotMatch(appTemplate, /<config-window[^>]*:ctx=/);
    assert.doesNotMatch(configTemplate, /<admin-sync-import-card[^>]*:ctx=/);
    assert.doesNotMatch(singlesTemplate, /<admin-sync-import-card[^>]*:ctx=/);
    for (const source of [configWindow, adminCard]) {
      assert.doesNotMatch(source, /inject<Record<string, unknown>/);
      assert.doesNotMatch(source, /createWindowContextBridge/);
      assert.doesNotMatch(source, /\bctx:\s*\{/);
      assert.match(source, /useConfigWindowPorts\(\)/);
    }
  });

  test("singles components use typed domain capabilities instead of the aggregate root context", () => {
    const appTemplate = read("src/App.html");
    const singlesTemplate = read("src/components/windows/singles/SinglesConfigWindow.html");
    const singlesWindow = read("src/components/windows/singles/SinglesConfigWindow.definition.ts");
    const purchasingCard = read("src/components/windows/singles/SinglesPurchasingCard.ts");
    const csvDialog = read("src/components/windows/singles/SinglesCsvImportDialog.ts");

    assert.doesNotMatch(appTemplate, /<singles-config-window[^>]*:ctx=/);
    assert.match(singlesTemplate, /<singles-csv-import-dialog\s+:ctx="getWindowComponentContext\(\)"/);
    assert.match(singlesWindow, /useSinglesConfigPorts\(\)/);
    for (const source of [singlesWindow, purchasingCard, csvDialog]) {
      assert.doesNotMatch(source, /inject<Record<string, unknown>/);
      assert.doesNotMatch(source, /createWindowContextBridge/);
      assert.doesNotMatch(source, /PropType<Record<string, unknown>/);
    }
  });

  test("the game coordinator receives only its typed root capabilities", () => {
    const appTemplate = read("src/App.html");
    const gameWindow = read("src/components/windows/game/coordinator/GameWindow.definition.ts");

    assert.doesNotMatch(appTemplate, /<game-window[^>]*:ctx=/);
    assert.match(gameWindow, /useGameCoordinatorPorts\(\)/);
    assert.doesNotMatch(gameWindow, /inject<Record<string, unknown>/);
    assert.doesNotMatch(gameWindow, /createWindowContextBridge/);
    assert.doesNotMatch(gameWindow, /PropType<Record<string, unknown>/);
  });

  test("live pricing components use the live capability port", () => {
    const appTemplate = read("src/App.html");
    const liveTemplate = read("src/components/windows/live/LiveWindow.html");
    const liveWindow = read("src/components/windows/live/LiveWindow.definition.ts");
    const singlesPanel = read("src/components/windows/live/LiveSinglesPanel.ts");
    const priceCard = read("src/components/live-price/LivePriceCard.ts");

    assert.doesNotMatch(appTemplate, /<live-window[^>]*:ctx=/);
    assert.doesNotMatch(liveTemplate, /<live-price-card[^>]*:ctx=/);
    for (const source of [liveWindow, singlesPanel]) {
      assert.match(source, /useLiveWindowPorts\(\)/);
      assert.doesNotMatch(source, /createWindowContextBridge/);
      assert.doesNotMatch(source, /inject<Record<string, unknown>/);
    }
    assert.doesNotMatch(priceCard, /this\.\$root|\bctx:/);
  });

  test("the sales window receives only its typed domain capabilities", () => {
    const appTemplate = read("src/App.html");
    const salesWindow = read("src/components/windows/sales/SalesWindow.definition.ts");

    assert.doesNotMatch(appTemplate, /<sales-window[^>]*:ctx=/);
    assert.match(salesWindow, /useSalesWindowPorts\(\)/);
    assert.doesNotMatch(salesWindow, /createWindowContextBridge/);
    assert.doesNotMatch(salesWindow, /inject<Record<string, unknown>/);
    assert.doesNotMatch(salesWindow, /PropType<Record<string, unknown>/);
  });
});
