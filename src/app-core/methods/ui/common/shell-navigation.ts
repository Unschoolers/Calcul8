import type { AppTab } from "../../../../types/app.ts";
import type { ShellNavigationMethodImplementation } from "../../../context/shell.ts";

const TAB_ORDER: AppTab[] = ["config", "live", "sales", "wheel", "portfolio"];
const TAB_SWIPE_THRESHOLD_PX = 56;
const TAB_SWIPE_AXIS_RATIO = 1.2;
const TAB_SWIPE_CLICK_SUPPRESSION_MS = 500;

type SwipeTouchState = {
  startX: number;
  startY: number;
  ignored: boolean;
  horizontalSwipe: boolean;
  target: EventTarget | null;
};

type SuppressedTabClick = {
  target: EventTarget | null;
  until: number;
};

const swipeStateByContext = new WeakMap<object, SwipeTouchState>();
const suppressedTabClickByContext = new WeakMap<object, SuppressedTabClick>();

function readTouchPoint(touchList: TouchList | undefined): { x: number; y: number } | null {
  const touch = touchList?.[0];
  if (!touch) return null;
  return { x: touch.clientX, y: touch.clientY };
}

export function isTabSwipeIgnoredTarget(target: EventTarget | null): boolean {
  const element = target as { closest?: (selectors: string) => unknown } | null;
  if (!element || typeof element.closest !== "function") return false;
  return Boolean(element.closest("[data-swipe-ignore]"));
}

function isSameOrNestedTarget(target: EventTarget | null, original: EventTarget | null): boolean {
  if (!target || !original) return false;
  if (target === original) return true;

  const targetNode = target as Node | null;
  const originalNode = original as Node | null;
  if (!(targetNode instanceof Node) || !(originalNode instanceof Node)) return false;
  return targetNode.contains(originalNode) || originalNode.contains(targetNode);
}

export function isDominantHorizontalTabSwipe(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): boolean {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  return Math.abs(deltaX) >= TAB_SWIPE_THRESHOLD_PX
    && Math.abs(deltaX) > Math.abs(deltaY) * TAB_SWIPE_AXIS_RATIO;
}

export function resolveTabSwipeTarget(
  currentTab: AppTab,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): AppTab | null {
  if (!isDominantHorizontalTabSwipe(startX, startY, endX, endY)) return null;

  const currentIndex = TAB_ORDER.indexOf(currentTab);
  if (currentIndex < 0) return null;
  const deltaX = endX - startX;
  const direction = deltaX < 0 ? 1 : -1;
  const targetIndex = currentIndex + direction;
  return TAB_ORDER[targetIndex] ?? null;
}

export const uiShellNavigationMethods = {
  selectPrimaryTab(tab) {
    if (tab !== "config" && !this.hasLotSelected) {
      this.notify(this.t("shellSelectLotFirstNotice"), "warning");
      return;
    }

    this.currentTab = tab;
  },

  onTabTouchStart(event: TouchEvent): void {
    const point = readTouchPoint(event.touches);
    if (!point) return;
    swipeStateByContext.set(this, {
      startX: point.x,
      startY: point.y,
      ignored: isTabSwipeIgnoredTarget(event.target),
      horizontalSwipe: false,
      target: event.target
    });
  },

  onTabTouchMove(event: TouchEvent): void {
    const state = swipeStateByContext.get(this);
    if (!state || state.ignored) return;

    const point = readTouchPoint(event.touches);
    if (!point) return;
    if (!isDominantHorizontalTabSwipe(state.startX, state.startY, point.x, point.y)) return;

    state.horizontalSwipe = true;
    event.preventDefault();
  },

  onTabTouchEnd(event: TouchEvent): void {
    const state = swipeStateByContext.get(this);
    swipeStateByContext.delete(this);
    if (!state || state.ignored) return;

    const point = readTouchPoint(event.changedTouches);
    if (!point) return;
    const isSwipe = state.horizontalSwipe || isDominantHorizontalTabSwipe(
      state.startX,
      state.startY,
      point.x,
      point.y
    );
    if (!isSwipe) return;

    suppressedTabClickByContext.set(
      this,
      {
        target: state.target,
        until: Date.now() + TAB_SWIPE_CLICK_SUPPRESSION_MS
      }
    );
    const targetTab = resolveTabSwipeTarget(
      this.currentTab,
      state.startX,
      state.startY,
      point.x,
      point.y
    );
    if (targetTab) this.selectPrimaryTab(targetTab);
  },

  onTabTouchCancel(): void {
    swipeStateByContext.delete(this);
  },

  onTabClickCapture(event: MouseEvent): void {
    const suppressedClick = suppressedTabClickByContext.get(this);
    if (!suppressedClick) return;
    if (Date.now() > suppressedClick.until) {
      suppressedTabClickByContext.delete(this);
      return;
    }
    if (!isSameOrNestedTarget(event.target, suppressedClick.target)) return;

    suppressedTabClickByContext.delete(this);

    event.preventDefault();
    event.stopPropagation();
  }
} satisfies ShellNavigationMethodImplementation;

