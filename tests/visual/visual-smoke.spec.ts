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
  test("@layout-regression sales-by-person header stays readable across viewport sizes", async ({ page }, testInfo) => {
    await seedVisualSmokeState(page, seedOptionsForProject(testInfo));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/nologin");
    await waitForVisualAppReady(page);
    await openSmokeTab(page, "portfolio");

    const card = page.locator(".portfolio-sales-by-user-card");
    await expect(card).toBeVisible();
    const widths = testInfo.project.name === "mobile-smoke" ? [360, 412, 600] : [1366];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 915 });
      await card.scrollIntoViewIfNeeded();
      await expect(async () => {
        const geometry = await card.evaluate(element => {
          const rect = (selector: string) => element.querySelector(selector)!.getBoundingClientRect();
          const title = element.querySelector(".portfolio-section-eyebrow")!;
          return {
            head: rect(".portfolio-chart-head").toJSON(),
            main: rect(".portfolio-section-head-main").toJSON(),
            copy: rect(".portfolio-section-head-copy").toJSON(),
            title: title.getBoundingClientRect().toJSON(),
            titleLineHeight: Number.parseFloat(getComputedStyle(title).lineHeight),
            toolbar: rect(".portfolio-sales-by-user-toolbar").toJSON()
          };
        });
        expect(geometry.title.height).toBeLessThanOrEqual(geometry.titleLineHeight * 3);
        if (width <= 600) {
          expect(geometry.copy.width).toBeGreaterThan(120);
          expect(geometry.main.bottom).toBeLessThanOrEqual(geometry.toolbar.top + 1);
        }
      }).toPass({ timeout: 2000 });
      await expectNoPageOverflow(page);
    }
    await card.screenshot({ path: testInfo.outputPath("sales-by-person-header.png"), animations: "disabled" });
  });

  test("@layout-regression add-sale action fits its icon and translated label above navigation", async ({ page }, testInfo) => {
    await seedVisualSmokeState(page, seedOptionsForProject(testInfo));
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (testInfo.project.name === "mobile-smoke") await page.setViewportSize({ width: 360, height: 915 });
    await page.goto("/nologin");
    await waitForVisualAppReady(page);
    await openSmokeTab(page, "sales");

    const action = page.locator(".app-context-action-wrap .v-fab .v-btn");
    await expect(action).toBeVisible();
    await expect(action).toHaveAccessibleName(testInfo.project.name === "mobile-smoke" ? "Ajouter une vente" : "Add sale");
    const bounds = await action.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(bounds!.height);
    await expect(action.locator(".mdi-cart-plus")).toBeVisible();
    const contentBounds = await action.locator(".v-btn__content").boundingBox();
    expect(contentBounds!.x).toBeGreaterThanOrEqual(bounds!.x);
    expect(contentBounds!.x + contentBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    const navigation = await page.locator(".app-shell-bottom-nav").boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(navigation!.y);
    await expectNoPageOverflow(page);
    await action.screenshot({ path: testInfo.outputPath("add-sale-action.png"), animations: "disabled" });
    await action.click();
    await expect(page.locator(".sales-speed-action").first()).toBeVisible();
  });

  test("auth startup resolves into a visible sign-in gate without exposing app actions", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const gate = page.locator(".auth-gate-card");
    await expect(gate).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#google-signin-button, .auth-gate-btn").first()).toBeVisible();
    await expect(page.locator(".app-shell-bottom-nav")).toHaveCount(0);
  });

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
        const inspector = page.locator(".wheel-inspector-panel");
        await page.locator(".app-context-action-dock__menu").getByText("Construction", { exact: true }).click();
        await expect(inspector).toHaveClass(/wheel-inspector-panel--mobile-open/);
        await expectNoPageOverflow(page);
        await page.locator(".wheel-inspector-mobile-close").click();
        await expect(inspector).not.toHaveClass(/wheel-inspector-panel--mobile-open/);
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

  test("portfolio performance sheet stays readable across viewport sizes", async ({ page }, testInfo) => {
    await seedVisualSmokeState(page, seedOptionsForProject(testInfo));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/nologin");
    await waitForVisualAppReady(page);
    await openSmokeTab(page, "portfolio");

    const performanceSheet = page.locator(".portfolio-performance-card");
    await expect(performanceSheet).toBeVisible();
    await performanceSheet.locator(".portfolio-performance-mode-toggle .v-btn").nth(1).click();
    const customerGrid = performanceSheet.locator(".portfolio-customer-performance");
    const customerRow = customerGrid.locator(".portfolio-performance-grid__row").first();
    await expect(customerRow).toBeVisible();
    const fontSize = await customerRow.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(12);
    const customerSort = customerGrid.locator(".portfolio-performance-grid__sort").first();
    if (testInfo.project.name === "mobile-smoke") {
      await customerSort.click();
      await expect(customerSort).toHaveClass(/is-active/);
    }
    await performanceSheet.scrollIntoViewIfNeeded();
    await expectNoPageOverflow(page);
    await performanceSheet.locator(".portfolio-performance-mode-toggle .v-btn").nth(0).click();
    await expect(performanceSheet.locator(".portfolio-lot-performance .portfolio-performance-grid__row").first()).toBeVisible();
    await expectNoPageOverflow(page);
    await performanceSheet.locator(".portfolio-performance-mode-toggle .v-btn").nth(1).click();
    await performanceSheet.screenshot({
      path: testInfo.outputPath(`portfolio-performance-sheet-${testInfo.project.name}.png`),
      animations: "disabled",
      caret: "hide"
    });
  });
});
