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

export async function expectShopifyBindingMetadataContrast(page: Page): Promise<void> {
  await expect(page.locator(".shopify-binding-card__metadata dt")).toHaveCount(4);
  const ratios = await page.locator(".shopify-binding-card__metadata dt").evaluateAll((labels) => {
    const channels = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const composite = (front: number[], back: number[]) => front.slice(0, 3).map((channel, index) => {
      const alpha = front[3] ?? 1;
      return channel * alpha + back[index]! * (1 - alpha);
    });
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);

    return labels.map((label) => {
      const foreground = channels(getComputedStyle(label).color);
      let parent: Element | null = label.parentElement;
      let background = [255, 255, 255, 1];
      while (parent) {
        const color = channels(getComputedStyle(parent).backgroundColor);
        if (color.length >= 3 && (color[3] ?? 1) > 0) {
          background = color;
          break;
        }
        parent = parent.parentElement;
      }
      const back = background.length === 4 ? composite(background, [255, 255, 255]) : background;
      const front = foreground.length === 4 ? composite(foreground, back) : foreground;
      const light = Math.max(luminance(front), luminance(back));
      const dark = Math.min(luminance(front), luminance(back));
      return { text: label.textContent?.trim(), ratio: (light + 0.05) / (dark + 0.05) };
    });
  });

  expect(ratios).toHaveLength(4);
  expect(ratios.every(({ ratio }) => ratio >= 4.5), `Shopify binding metadata label contrast ratios: ${JSON.stringify(ratios)}`).toBe(true);
}
