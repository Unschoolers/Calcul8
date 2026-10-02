import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { expectNoPageOverflow, expectShopifyBindingMetadataContrast } from "./helpers/visualAssertions.ts";

const widths = [320, 390, 412, 1366];
const locales = ["en", "fr-CA"] as const;
const themes = ["unionArenaLight", "unionArenaDark"] as const;
const catalogs = Object.fromEntries(["en", "fr"].map((locale) => [
  locale,
  {
    ...JSON.parse(readFileSync(new URL(`../../src/app-core/i18n/locales/${locale}/common.json`, import.meta.url), "utf8")),
    ...JSON.parse(readFileSync(new URL(`../../src/app-core/i18n/locales/${locale}/config.json`, import.meta.url), "utf8")),
    ...JSON.parse(readFileSync(new URL(`../../src/app-core/i18n/locales/${locale}/lots.json`, import.meta.url), "utf8"))
  }
])) as Record<string, Record<string, string>>;
const msg = (locale: string, key: string) => catalogs[locale.startsWith("fr") ? "fr" : "en"][key] ?? catalogs.en[key] ?? key;
const evidence = "docs/superpowers/evidence/2026-10-01-shopify-production-polish";

test.describe("Shopify polish browser evidence", () => {
  for (const width of widths) {
    for (const locale of locales) {
      for (const theme of themes) {
        test(`${width}px ${locale} ${theme} linked binding and stock stay readable`, async ({ page }) => {
          const pageErrors: string[] = [];
          page.on("pageerror", (error) => pageErrors.push(`${error.name}: ${error.message}`));
          await page.setViewportSize({ width, height: width === 1366 ? 900 : 780 });
          await page.goto(`/tests/visual/fixtures/shopify.html?scenario=linked&locale=${locale}&theme=${theme}`);
          await expect(page.getByTestId("shopify-binding-details")).toBeVisible();
          await expectShopifyBindingMetadataContrast(page);
          await expect(page.getByTestId("shopify-product-status")).toHaveText(msg(locale, "configShopifyProductStatusActive"));
          await expect(page.getByRole("group", { name: msg(locale, "configShopifyStockTitle") })).toBeVisible();
          await expect(page.getByTestId("stock-value-configShopifyStockAvailable")).toHaveText("7");
          await expect(page.getByTestId("stock-value-configShopifyStockSealed")).toHaveText("8");
          await expect(page.locator(".app-sticky-action-footer")).toBeInViewport();
          await expect(page.getByRole("textbox").first()).not.toBeFocused();
          await expectNoPageOverflow(page);
          expect(pageErrors).toEqual([]);

          if (width === 320 && locale === "fr-CA" && theme === "unionArenaLight") {
            await page.locator(".shopify-stock-card").scrollIntoViewIfNeeded();
            await page.screenshot({ path: `${evidence}/linked-stock-320-fr-light.png`, animations: "disabled", caret: "hide" });
          }
        });
      }
    }
  }

  test("empty-search creation closes the picker and returns focus to its visible parent trigger", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(`${error.name}: ${error.message}`));
    await page.setViewportSize({ width: 320, height: 420 });
    await page.goto("/tests/visual/fixtures/shopify.html?scenario=picker&locale=en&theme=unionArenaLight");
    const createTrigger = page.getByRole("button", { name: msg("en", "configShopifyCreateDraft"), exact: true }).first();
    await page.getByRole("button", { name: msg("en", "configShopifyPickerOpen"), exact: true }).click();
    const search = page.getByRole("textbox", { name: msg("en", "configShopifySearchLabel") });
    await expect(search).not.toBeFocused();
    await expect(page.locator(".app-dialog-overlay:visible")).toHaveCount(2);
    await search.fill("no-match");
    await expect(page.getByText(msg("en", "configShopifyNoResults"))).toBeVisible();
    await page.getByRole("button", { name: msg("en", "configShopifyCreateDraft"), exact: true }).last().click();

    await expect(page.locator(".app-dialog-overlay:visible")).toHaveCount(2);
    await expect(page.locator(".shopify-draft-dialog__heading")).toBeFocused();
    await page.screenshot({ path: `${evidence}/draft-preview-320-en-light.png`, animations: "disabled", caret: "hide" });
    await page.getByRole("button", { name: msg("en", "commonClose"), exact: true }).last().click();
    await expect(page.locator(".app-dialog-overlay:visible")).toHaveCount(1);
    await expect(createTrigger).toBeFocused();
    await expect(createTrigger).toBeInViewport();
    expect(pageErrors).toEqual([]);
  });

  test("creating immediately shows the linked binding and localized success", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(`${error.name}: ${error.message}`));
    await page.setViewportSize({ width: 390, height: 520 });
    await page.goto("/tests/visual/fixtures/shopify.html?scenario=create&locale=fr-CA&theme=unionArenaDark");
    await page.getByRole("button", { name: msg("fr-CA", "configShopifyCreateDraft"), exact: true }).click();
    await expect(page.locator(".app-dialog-overlay:visible")).toHaveCount(2);
    await expect(page.locator(".shopify-draft-dialog__heading")).toBeFocused();
    await expect(page.getByRole("button", { name: msg("fr-CA", "shopifyDraftCreate"), exact: true })).toBeEnabled();
    await page.getByRole("button", { name: msg("fr-CA", "shopifyDraftCreate"), exact: true }).click();
    await expect(page.getByTestId("shopify-binding-details")).toBeVisible();
    const successStatus = page.getByRole("status").filter({ hasText: msg("fr-CA", "configShopifyDraftCreated") });
    await expect(successStatus).toBeVisible();
    await successStatus.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${evidence}/draft-created-390-fr-dark.png`, animations: "disabled", caret: "hide" });
    expect(pageErrors).toEqual([]);
  });

  test("long unbroken product title wraps at 320px with enlarged text and reduced height", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(`${error.name}: ${error.message}`));
    await page.setViewportSize({ width: 320, height: 420 });
    await page.goto("/tests/visual/fixtures/shopify.html?scenario=picker&locale=fr-CA&theme=unionArenaLight&longTitle=1");
    await page.addStyleTag({ content: "html { font-size: 125% !important; }" });
    await page.getByRole("button", { name: msg("fr-CA", "configShopifyPickerOpen"), exact: true }).click();
    const search = page.getByRole("textbox", { name: msg("fr-CA", "configShopifySearchLabel") });
    await expect(search).not.toBeFocused();
    const pickerTitle = page.locator(".app-dialog-overlay:visible").last().locator(".app-dialog-title .flex-grow-1");
    const pickerTitleBounds = await pickerTitle.boundingBox();
    expect(pickerTitleBounds).not.toBeNull();
    expect(pickerTitleBounds!.x).toBeGreaterThanOrEqual(0);
    expect(pickerTitleBounds!.x + pickerTitleBounds!.width).toBeLessThanOrEqual(320);
    await expect.poll(() => pickerTitle.evaluate((element) => (element as HTMLElement).scrollWidth <= (element as HTMLElement).clientWidth)).toBe(true);
    await search.fill("ab");
    await expect(page.getByText(/A product title with an intentionally unbroken/)).toBeVisible();
    const resultTitle = page.locator(".shopify-product-picker-result-title").first();
    await resultTitle.scrollIntoViewIfNeeded();
    await resultTitle.evaluate((element) => { element.closest<HTMLElement>(".app-dialog-content")!.scrollTop += 8; });
    const titleFitsScrollPane = await resultTitle.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const pane = element.closest(".app-dialog-content")!.getBoundingClientRect();
      return rect.top >= pane.top + 2 && rect.bottom <= pane.bottom - 6;
    });
    expect(titleFitsScrollPane).toBe(true);
    await expect(page.getByRole("button", { name: msg("fr-CA", "configShopifyUseProduct"), exact: true })).toBeDisabled();
    await expectNoPageOverflow(page);
    await page.screenshot({ path: `${evidence}/long-title-search-320-fr-light.png`, animations: "disabled", caret: "hide" });
    const visibleFooters = page.locator(".app-sticky-action-footer");
    await expect(visibleFooters).toHaveCount(2);
    await expect(visibleFooters.nth(0)).toBeInViewport();
    await expect(visibleFooters.nth(1)).toBeInViewport();
    await page.goto("/tests/visual/fixtures/shopify.html?scenario=linked&locale=fr-CA&theme=unionArenaLight&longTitle=1");
    await page.addStyleTag({ content: "html { font-size: 125% !important; }" });
    await expect(page.getByTestId("shopify-binding-details")).toBeVisible();
    const title = page.locator(".shopify-binding-card__title");
    await expect(title).toHaveText(/A product title with an intentionally unbroken/);
    await title.scrollIntoViewIfNeeded();
    const bindingTitleFitsCard = await title.evaluate((element) => (element as HTMLElement).scrollWidth <= (element as HTMLElement).clientWidth);
    expect(bindingTitleFitsCard).toBe(true);
    await expectShopifyBindingMetadataContrast(page);
    await expectNoPageOverflow(page);
    await expect(page.locator(".app-sticky-action-footer")).toBeInViewport();
    expect(pageErrors).toEqual([]);
  });
});
