import { expect, test } from "@playwright/test";
import { seedVisualSmokeState } from "./helpers/visualSmokeState.ts";
import { expectNoPageOverflow, waitForVisualAppReady } from "./helpers/visualAssertions.ts";

for (const theme of ["unionArenaLight", "unionArenaDark"] as const) {
  test(`${theme}: optional lot image uploads, survives reload, and can be removed @visual-smoke`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await seedVisualSmokeState(page, { language: "en", theme });
    await page.goto("/nologin");
    await waitForVisualAppReady(page);
    const mobile = testInfo.project.name === "mobile-smoke";
    if (mobile) {
      await page.locator(".mobile-lot-switcher__trigger").click();
      await page.getByRole("button", { name: "Add inventory", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Add inventory", exact: true }).click();
    }
    const create = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Create", exact: true }) });
    await create.getByRole("textbox", { name: "Inventory name" }).fill("Lot image browser check");
    await create.getByRole("button", { name: "Grouped", exact: true }).click();
    await create.getByRole("combobox", { name: "Whatnot category" }).locator("xpath=ancestor::div[contains(@class, 'v-field')][1]").click();
    await page.getByRole("option", { name: "Trading card games" }).click();
    await create.locator('input[type="file"]').setInputFiles("public/icons/icon-512.png");
    await expect(create.locator(".lot-image-editor__preview img")).toBeVisible({ timeout: 15_000 });
    await expect(create.getByRole("button", { name: "Create", exact: true })).toBeEnabled();
    await expectNoPageOverflow(page);
    await create.getByRole("button", { name: "Create", exact: true }).click();
    const current = page.locator(mobile ? ".mobile-lot-switcher__trigger" : ".lot-selector-selection");
    await expect(current).toContainText("Lot image browser check");
    await expect(current.locator("img")).toBeVisible();
    const storedImage = await current.locator("img").getAttribute("src");
    expect(storedImage).toMatch(/^data:image\/jpeg;base64,/);
    expect(await current.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    // The seed helper runs on navigation. Preserve the user's saved data on this reload.
    const saved = await page.evaluate(() => ({ lots: localStorage.getItem("whatfees_presets"), id: localStorage.getItem("whatfees_last_lot_id") }));
    await page.addInitScript(value => { localStorage.setItem("whatfees_presets", value.lots!); localStorage.setItem("whatfees_last_lot_id", value.id!); }, saved);
    await page.reload(); await waitForVisualAppReady(page);
    await expect(current.locator("img")).toHaveAttribute("src", storedImage!);
    if (mobile) {
      await current.click();
      const row = page.getByRole("option", { name: /Lot image browser check/ });
      await expect(row.locator("img")).toBeVisible();
      await expectNoPageOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`${theme}-selector.png`), animations: "disabled" });
      await page.getByRole("button", { name: "Edit inventory", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Edit inventory", exact: true }).click();
    }
    const edit = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Save", exact: true }) });
    await expect(edit.getByRole("button", { name: "Replace image", exact: true })).toBeVisible();
    await expectNoPageOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`${theme}-edit.png`), animations: "disabled" });
    await edit.getByRole("button", { name: "Remove image", exact: true }).click();
    await edit.getByRole("button", { name: "Save", exact: true }).click();
    await expect(current.locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => {
      const lots = JSON.parse(localStorage.getItem("whatfees_presets")!);
      return lots.find((lot: { name: string }) => lot.name === "Lot image browser check").image;
    })).toBeUndefined();
    expect(errors).toEqual([]);
  });
}
