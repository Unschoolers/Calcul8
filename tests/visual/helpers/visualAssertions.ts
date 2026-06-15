import { expect, type Page } from "@playwright/test";

export async function waitForVisualAppReady(page: Page): Promise<void> {
  await page.locator("body.app-ready").waitFor({ state: "attached" });
  await expect(page.locator("#startup-splash")).toBeHidden();
  await expect(page.locator(".app-shell-bottom-nav")).toBeVisible();
}

export async function expectNoPageOverflow(page: Page): Promise<void> {
  const offenders = await page.evaluate(() => {
    const tolerance = 2;
    const viewportLeft = 0;
    const viewportRight = window.innerWidth;
    const viewportTop = 0;
    const viewportBottom = window.innerHeight;

    function isVisibleElement(element: Element, rect: DOMRect): boolean {
      const style = window.getComputedStyle(element);
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity || "1") > 0
        && rect.width > 0
        && rect.height > 0
        && rect.bottom > viewportTop
        && rect.top < viewportBottom;
    }

    function hasClippingAncestor(element: Element, rect: DOMRect): boolean {
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        const clipsHorizontal = ["auto", "clip", "hidden", "scroll"].includes(style.overflowX);
        if (clipsHorizontal) {
          const parentRect = parent.getBoundingClientRect();
          const parentInsideViewport = parentRect.left >= viewportLeft - tolerance
            && parentRect.right <= viewportRight + tolerance;
          const clippedByParent = rect.left < parentRect.left - tolerance
            || rect.right > parentRect.right + tolerance;
          if (parentInsideViewport && clippedByParent) return true;
        }
        parent = parent.parentElement;
      }
      return false;
    }

    return Array.from(document.body.querySelectorAll("*"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { element, rect };
      })
      .filter(({ element, rect }) => {
        if (!isVisibleElement(element, rect)) return false;
        const horizontallyOutside = rect.left < viewportLeft - tolerance
          || rect.right > viewportRight + tolerance;
        if (!horizontallyOutside) return false;
        return !hasClippingAncestor(element, rect);
      })
      .slice(0, 10)
      .map(({ element, rect }) => ({
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === "string" ? element.className : "",
        text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width)
      }));
  });

  expect(offenders, `Visible horizontal overflow offenders: ${JSON.stringify(offenders, null, 2)}`).toEqual([]);
}
