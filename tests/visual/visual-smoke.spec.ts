import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { expectNoPageOverflow, waitForVisualAppReady } from "./helpers/visualAssertions.ts";
import { seedVisualSmokeState } from "./helpers/visualSmokeState.ts";

type SmokeTab = "config" | "live" | "sales" | "portfolio";

const smokeTabs: SmokeTab[] = ["config", "live", "sales", "portfolio"];
const tabIndexes: Record<SmokeTab, number> = {
  config: 0,
  live: 1,
  sales: 2,
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
  test("top-level seeded shell tabs do not overflow and write local screenshots", async ({ page }, testInfo) => {
    await seedVisualSmokeState(page, seedOptionsForProject(testInfo));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/nologin");
    await waitForVisualAppReady(page);

    for (const tab of smokeTabs) {
      await openSmokeTab(page, tab);
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
});
