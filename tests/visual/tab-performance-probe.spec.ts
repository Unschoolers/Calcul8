import { expect, test, type Page } from "@playwright/test";
import { waitForVisualAppReady } from "./helpers/visualAssertions.ts";
import { seedVisualSmokeState } from "./helpers/visualSmokeState.ts";

type SmokeTab = "config" | "live" | "sales" | "wheel" | "portfolio";

const tabIndexes: Record<SmokeTab, number> = {
  config: 0,
  live: 1,
  sales: 2,
  wheel: 3,
  portfolio: 4
};

async function waitForTabTransitionToSettle(page: Page): Promise<void> {
  await page.waitForFunction(() => Array.from(document.querySelectorAll(".v-window-item--active"))
    .every((element) => !/\btransition-(enter|leave)-/.test(element.className)));
}

async function installLongTaskObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const entries: Array<{ duration: number; startTime: number }> = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        entries.push({ duration: entry.duration, startTime: entry.startTime });
      }
    });
    observer.observe({ type: "longtask", buffered: true });
    (window as Window & { __tabLongTasks?: typeof entries; __tabLongTaskObserver?: PerformanceObserver }).__tabLongTasks = entries;
    (window as Window & { __tabLongTasks?: typeof entries; __tabLongTaskObserver?: PerformanceObserver }).__tabLongTaskObserver = observer;
  });
}

test("probe first activation cost per tab", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-smoke", "Run the probe on desktop only.");
  test.slow();

  const results: Array<{ tab: SmokeTab; elapsedMs: number; longTaskMs: number; longTaskCount: number }> = [];
  for (const tab of Object.keys(tabIndexes) as SmokeTab[]) {
    await seedVisualSmokeState(page, { language: "en", theme: "unionArenaLight" });
    await page.goto("/nologin", { waitUntil: "domcontentloaded" });
    await waitForVisualAppReady(page);
    await installLongTaskObserver(page);

    const button = page.locator(".app-shell-bottom-nav .v-btn").nth(tabIndexes[tab]);
    const startedAt = await page.evaluate(() => performance.now());
    await button.click();
    await expect(button).toHaveClass(/v-btn--active/);
    await waitForTabTransitionToSettle(page);
    await page.waitForTimeout(50);
    const endedAt = await page.evaluate(() => performance.now());
    const longTasks = await page.evaluate(() => (
      (window as Window & { __tabLongTasks?: Array<{ duration: number; startTime: number }> }).__tabLongTasks ?? []
    ));
    const relevantLongTasks = longTasks.filter((entry) => entry.startTime >= startedAt && entry.startTime <= endedAt);
    results.push({
      tab,
      elapsedMs: Number((endedAt - startedAt).toFixed(1)),
      longTaskMs: Number(relevantLongTasks.reduce((sum, entry) => sum + entry.duration, 0).toFixed(1)),
      longTaskCount: relevantLongTasks.length
    });
  }

  console.log(`TAB_PERFORMANCE ${JSON.stringify(results)}`);
});
