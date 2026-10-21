import { expect, test } from "@playwright/test";
import { expectNoPageOverflow, waitForVisualAppReady } from "./helpers/visualAssertions.ts";
import { seedVisualSmokeState } from "./helpers/visualSmokeState.ts";

for (const theme of ["unionArenaLight", "unionArenaDark"] as const) {
  test(`@visual-smoke account badges remain visible and open the menu in ${theme}`, async ({ page }) => {
    await seedVisualSmokeState(page, { language: "en", theme });
    await page.goto("/nologin", { waitUntil: "domcontentloaded" });
    await waitForVisualAppReady(page);
    await page.evaluate(() => {
      const root = document.querySelector("#app") as HTMLElement & {
        __vue_app__: { _instance: { proxy: { $data: { hasProAccess: boolean; syncStatus: string } } } };
      };
      root.__vue_app__._instance.proxy.$data.hasProAccess = true;
      root.__vue_app__._instance.proxy.$data.syncStatus = "success";
    });

    const badges = page.locator(".account-menu-pro-badge, .account-menu-sync-badge--success");
    await expect(badges).toHaveCount(2);
    // Hit-test inside each badge's perimeter: bounding boxes alone cannot detect
    // a badge being cut off by its parent's rounded overflow boundary.
    const clippedPoints = await badges.evaluateAll((elements) => elements.flatMap((badge) => {
      const rect = badge.getBoundingClientRect();
      const radiusX = rect.width / 2 - 2.5;
      const radiusY = rect.height / 2 - 2.5;
      return Array.from({ length: 8 }, (_, index) => {
        const angle = index * Math.PI / 4;
        const x = rect.left + rect.width / 2 + Math.cos(angle) * radiusX;
        const y = rect.top + rect.height / 2 + Math.sin(angle) * radiusY;
        const hit = document.elementFromPoint(x, y);
        return badge.contains(hit) ? [] : [{ badge: badge.className, x, y, hit: hit?.className }];
      }).flat();
    }));
    expect(clippedPoints, "Every sampled badge edge should remain exposed").toEqual([]);
    await expectNoPageOverflow(page);

    const trigger = page.locator(".account-menu-activator");
    // Make each decorative state layer hit-testable briefly to verify its
    // rounded paint boundary, whether clipped by the button or rounded itself.
    const squareStateLayers = await trigger.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return Array.from(button.querySelectorAll<HTMLElement>(".v-btn__overlay, .v-btn__underlay"))
        .filter((layer) => {
          const previous = layer.style.pointerEvents;
          try {
            layer.style.pointerEvents = "auto";
            return layer.contains(document.elementFromPoint(rect.right - 1, rect.top + 1));
          } finally {
            layer.style.pointerEvents = previous;
          }
        }).map((layer) => layer.className);
    });
    expect(squareStateLayers, "Account button state layers should keep their round boundary").toEqual([]);
    for (const badge of await badges.all()) {
      await badge.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
    }
  });
}
