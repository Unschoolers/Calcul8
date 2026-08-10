import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { expectNoPageOverflow, waitForVisualAppReady } from "./helpers/visualAssertions.ts";
import { seedVisualSmokeState } from "./helpers/visualSmokeState.ts";

type SmokeTab = "config" | "live" | "sales" | "wheel" | "portfolio";

const smokeTabs: SmokeTab[] = ["config", "live", "sales", "wheel", "portfolio"];
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

async function openSmokeTab(page: Page, tab: SmokeTab): Promise<void> {
  const button = page.locator(".app-shell-bottom-nav .v-btn").nth(tabIndexes[tab]);
  await button.click();
  await expect(button).toHaveClass(/v-btn--active/);
  await waitForTabTransitionToSettle(page);
}

function seedOptionsForProject(testInfo: TestInfo): Parameters<typeof seedVisualSmokeState>[1] {
  if (testInfo.project.name === "mobile-smoke") {
    return {
      language: "fr",
      theme: "unionArenaDark"
    };
  }

  return {
    language: "en",
    theme: "unionArenaLight"
  };
}

test.describe("@visual-smoke real app screens", () => {
  test("context action dock stays in the shell layer while tabs transition", async ({ page }, testInfo) => {
    test.slow();
    await seedVisualSmokeState(page, seedOptionsForProject(testInfo));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/nologin", { waitUntil: "domcontentloaded" });
    await waitForVisualAppReady(page);
    await openSmokeTab(page, "portfolio");

    const portfolioFabBounds = await page.locator(".app-shell-action-zone > .app-context-action").boundingBox();
    expect(portfolioFabBounds).not.toBeNull();

    const liveTab = page.locator(".app-shell-bottom-nav .v-btn").nth(tabIndexes.live);
    await liveTab.click();
    const dock = page.locator(".app-shell-action-zone > .app-context-action-dock");
    await expect(dock).toBeVisible();
    await expect(dock).toHaveCount(1);

    const positions = await dock.evaluate((element) => new Promise<Array<{ x: number; y: number }>>((resolve) => {
      const samples: Array<{ x: number; y: number }> = [];
      const sample = () => {
        const bounds = element.getBoundingClientRect();
        samples.push({ x: bounds.x, y: bounds.y });
        if (samples.length >= 8) resolve(samples);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));
    const xPositions = positions.map(({ x }) => x);
    const yPositions = positions.map(({ y }) => y);
    expect(Math.max(...xPositions) - Math.min(...xPositions)).toBeLessThanOrEqual(1);
    expect(Math.max(...yPositions) - Math.min(...yPositions)).toBeLessThanOrEqual(1);

    const livePrimaryBounds = await dock.locator(".app-context-action-dock__primary").boundingBox();
    expect(livePrimaryBounds).not.toBeNull();
    expect(Math.abs(
      (livePrimaryBounds!.x + livePrimaryBounds!.width)
      - (portfolioFabBounds!.x + portfolioFabBounds!.width)
    )).toBeLessThanOrEqual(1);
  });

  test("top-level seeded shell tabs do not overflow and write local screenshots", async ({ page }, testInfo) => {
    await seedVisualSmokeState(page, seedOptionsForProject(testInfo));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/nologin");
    await waitForVisualAppReady(page);

    for (const tab of smokeTabs) {
      await openSmokeTab(page, tab);
      if (tab === "wheel" && testInfo.project.name === "mobile-smoke") {
        await expect(page.getByRole("button", { name: "Session", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Commandes du jeu" }).click();
        await expect(page.getByText("Historique", { exact: true })).toBeVisible();
        await expect(page.getByText("Construction", { exact: true })).toBeVisible();
      }
      await expectNoPageOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`${tab}.png`),
        animations: "disabled",
        caret: "hide",
        fullPage: true,
        mask: [page.locator("canvas")]
      });
    }
  });

  test("portfolio performance sheet stays readable at mobile width", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-smoke", "This targeted smoke state is mobile-only.");

    await seedVisualSmokeState(page, seedOptionsForProject(testInfo));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/nologin");
    await waitForVisualAppReady(page);
    await openSmokeTab(page, "portfolio");

    const performanceSheet = page.locator(".portfolio-performance-card");
    await expect(performanceSheet).toBeVisible();
    await performanceSheet.locator(".portfolio-performance-mode-toggle .v-btn").nth(1).click();
    await expect(performanceSheet.locator(".portfolio-customer-performance .portfolio-performance-grid__row").first()).toBeVisible();
    await performanceSheet.scrollIntoViewIfNeeded();
    await expectNoPageOverflow(page);
    await performanceSheet.screenshot({
      path: testInfo.outputPath("portfolio-performance-sheet-mobile.png"),
      animations: "disabled",
      caret: "hide"
    });
  });
});
