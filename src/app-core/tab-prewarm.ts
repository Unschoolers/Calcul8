import type { AppTab } from "../types/app.ts";

export const TAB_PREWARM_INITIAL_DELAY_MS = 1200;
export const TAB_PREWARM_GAP_MS = 900;
export const TAB_PREWARM_IDLE_TIMEOUT_MS = 500;

const PREWARM_ORDER: AppTab[] = ["config", "live", "sales", "wheel", "portfolio"];

type IdleWindow = {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export type TabPrewarmContext = {
  currentTab: AppTab;
  currentLotId: number | null;
  prewarmedTabs: AppTab[];
};

type TabPrewarmSchedule = {
  timeoutId: number | null;
  idleCallbackId: number | null;
};

const schedules = new WeakMap<object, TabPrewarmSchedule>();

function getSchedule(context: object): TabPrewarmSchedule {
  const existing = schedules.get(context);
  if (existing) return existing;

  const created: TabPrewarmSchedule = {
    timeoutId: null,
    idleCallbackId: null
  };
  schedules.set(context, created);
  return created;
}

function resolveIdleWindow(): IdleWindow | null {
  if (typeof window === "undefined") return null;
  return window as unknown as IdleWindow;
}

function clearSchedule(context: object, schedule: TabPrewarmSchedule): void {
  if (schedule.timeoutId != null) {
    globalThis.clearTimeout(schedule.timeoutId);
    schedule.timeoutId = null;
  }

  const idleWindow = resolveIdleWindow();
  if (schedule.idleCallbackId != null && typeof idleWindow?.cancelIdleCallback === "function") {
    idleWindow.cancelIdleCallback(schedule.idleCallbackId);
  }
  schedule.idleCallbackId = null;
}

export function cancelTabPrewarm(context: object): void {
  const schedule = schedules.get(context);
  if (!schedule) return;
  clearSchedule(context, schedule);
  schedules.delete(context);
}

function queueNextPrewarm(context: TabPrewarmContext, delayMs: number): void {
  const schedule = getSchedule(context);
  clearSchedule(context, schedule);
  schedule.timeoutId = globalThis.setTimeout(() => {
    schedule.timeoutId = null;
    runNextPrewarm(context);
  }, Math.max(0, Math.floor(delayMs))) as unknown as number;
}

function runNextPrewarm(context: TabPrewarmContext): void {
  if (!context.currentLotId) return;

  const prewarmed = new Set(context.prewarmedTabs);
  const nextTab = PREWARM_ORDER.find((tab) => tab !== context.currentTab && !prewarmed.has(tab));
  if (!nextTab) return;

  const schedule = getSchedule(context);
  const warmTab = () => {
    schedule.idleCallbackId = null;
    if (!context.currentLotId) return;
    if (context.currentTab === nextTab) {
      queueNextPrewarm(context, TAB_PREWARM_GAP_MS);
      return;
    }

    if (!context.prewarmedTabs.includes(nextTab)) {
      context.prewarmedTabs = [...context.prewarmedTabs, nextTab];
    }
    queueNextPrewarm(context, TAB_PREWARM_GAP_MS);
  };

  const idleWindow = resolveIdleWindow();
  if (typeof idleWindow?.requestIdleCallback === "function") {
    schedule.idleCallbackId = idleWindow.requestIdleCallback(warmTab, {
      timeout: TAB_PREWARM_IDLE_TIMEOUT_MS
    });
    return;
  }

  schedule.timeoutId = globalThis.setTimeout(warmTab, 0) as unknown as number;
}

export function scheduleTabPrewarm(context: TabPrewarmContext): void {
  cancelTabPrewarm(context as object);
  if (!context.currentLotId) return;
  queueNextPrewarm(context, TAB_PREWARM_INITIAL_DELAY_MS);
}
