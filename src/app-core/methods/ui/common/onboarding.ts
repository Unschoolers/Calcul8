import { driver, type DriveStep, type Driver } from "driver.js";
import type { LotType } from "../../../../types/app.ts";
import type {
  OnboardingContext,
  OnboardingMethodImplementation
} from "../../../context/shell.ts";
import {
  normalizePersistedOnboardingStatus,
  shouldOfferFirstRunOnboarding
} from "../../../onboarding-state.ts";
import { STORAGE_KEYS } from "../../../storageKeys.ts";

const TOUR_TARGETS = {
  onboardingCard: "guided-onboarding-card",
  newLotCard: "guided-onboarding-new-lot-card",
  bulkPurchase: "guided-onboarding-bulk-purchase",
  bulkSummary: "guided-onboarding-bulk-summary",
  singlesPurchasing: "guided-onboarding-singles-purchasing",
  singlesAddFab: "guided-onboarding-singles-add-fab"
} as const;

let activeDriver: Driver | null = null;
let isDestroyingDriver = false;

function readPersistedOnboardingStatus(): "pending" | "completed" | "dismissed" {
  try {
    return normalizePersistedOnboardingStatus(localStorage.getItem(STORAGE_KEYS.ONBOARDING_STATUS));
  } catch {
    return "pending";
  }
}

function writePersistedOnboardingStatus(status: "pending" | "completed" | "dismissed"): void {
  try {
    if (status === "pending") {
      localStorage.removeItem(STORAGE_KEYS.ONBOARDING_STATUS);
      return;
    }
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_STATUS, status);
  } catch {
    // Ignore storage failures.
  }
}

function shouldOfferGuidedOnboarding(
  context: Pick<OnboardingContext, "isGoogleSignedIn" | "activeScopeType" | "lots">
): boolean {
  return shouldOfferFirstRunOnboarding({
    isGoogleSignedIn: context.isGoogleSignedIn,
    activeScopeType: context.activeScopeType,
    lotsCount: context.lots?.length ?? 0,
    onboardingStatus: readPersistedOnboardingStatus()
  });
}

function destroyDriver(): void {
  if (!activeDriver) return;
  isDestroyingDriver = true;
  try {
    activeDriver.destroy();
  } catch {
    // Ignore teardown failures from stale DOM during rerenders.
  } finally {
    activeDriver = null;
    isDestroyingDriver = false;
  }
}

function resetGuidedOnboardingRuntimeState(
  context: OnboardingContext,
  status: "idle" | "available" | "completed" | "dismissed"
): void {
  context.guidedOnboardingStatus = status;
  context.guidedOnboardingLotType = null;
  context.guidedOnboardingTargetLotId = null;
}

function getTourTargetSelector(target: string): string {
  return `[data-driver-target="${target}"], #${target}`;
}

function getElement(target: string): Element | undefined {
  if (typeof document === "undefined") return undefined;
  return document.querySelector(getTourTargetSelector(target)) || undefined;
}

function waitForElement(
  target: string,
  onReady: () => void,
  attempts = 0
): void {
  if (getElement(target)) {
    onReady();
    return;
  }

  if (attempts >= 24) {
    onReady();
    return;
  }

  window.setTimeout(() => {
    waitForElement(target, onReady, attempts + 1);
  }, 60);
}

function completeGuidedOnboarding(context: OnboardingContext): void {
  writePersistedOnboardingStatus("completed");
  resetGuidedOnboardingRuntimeState(context, "completed");
}

function buildDriverSteps(context: OnboardingContext, lotType: LotType): DriveStep[] {
  if (lotType === "singles") {
    return [
      {
        element: TOUR_TARGETS.singlesPurchasing,
        popover: {
          title: context.t("onboardingTourSinglesPurchasingTitle"),
          description: context.t("onboardingTourSinglesPurchasingBody")
        }
      },
      {
        element: TOUR_TARGETS.singlesAddFab,
        popover: {
          title: context.t("onboardingTourSinglesAddTitle"),
          description: context.t("onboardingTourSinglesAddBody"),
          doneBtnText: context.t("commonDone")
        }
      }
    ].filter((step) => getElement(String(step.element)));
  }

  return [
    {
      element: TOUR_TARGETS.bulkPurchase,
      popover: {
        title: context.t("onboardingTourBulkConfigTitle"),
        description: context.t("onboardingTourBulkConfigBody")
      }
    },
    {
      element: TOUR_TARGETS.bulkSummary,
      popover: {
        title: context.t("onboardingTourBulkSummaryTitle"),
        description: context.t("onboardingTourBulkSummaryBody"),
        doneBtnText: context.t("commonDone")
      }
    }
  ].filter((step) => getElement(String(step.element)));
}

function startConfiguredDriver(
  context: OnboardingContext,
  steps: DriveStep[],
  onComplete?: () => void
): void {
  destroyDriver();

  if (steps.length === 0) {
    onComplete?.();
    return;
  }

  activeDriver = driver({
    steps,
    allowClose: true,
    animate: true,
    overlayOpacity: 0.46,
    showProgress: true,
    nextBtnText: context.t("commonNext"),
    prevBtnText: context.t("commonBack"),
    doneBtnText: context.t("commonDone"),
    onCloseClick: () => {
      context.dismissGuidedOnboarding();
    },
    onDestroyed: () => {
      activeDriver = null;
      if (isDestroyingDriver || context.guidedOnboardingStatus !== "running") {
        return;
      }
      if (!onComplete) {
        resetGuidedOnboardingRuntimeState(
          context,
          shouldOfferGuidedOnboarding(context) ? "available" : "idle"
        );
        return;
      }
      onComplete?.();
    }
  });
  activeDriver.drive();
}

function startPostCreateTour(context: OnboardingContext, lotType: LotType): void {
  const targetToWaitFor = lotType === "singles"
    ? TOUR_TARGETS.singlesPurchasing
    : TOUR_TARGETS.bulkPurchase;

  waitForElement(targetToWaitFor, () => {
    const steps = buildDriverSteps(context, lotType);
    startConfiguredDriver(context, steps, () => {
      completeGuidedOnboarding(context);
    });
  });
}

export const uiOnboardingMethods = {
  syncGuidedOnboarding(): void {
    if (this.guidedOnboardingStatus === "running") {
      return;
    }

    const persistedStatus = readPersistedOnboardingStatus();
    if (persistedStatus === "completed") {
      resetGuidedOnboardingRuntimeState(this, "completed");
      destroyDriver();
      return;
    }

    if (persistedStatus === "dismissed") {
      resetGuidedOnboardingRuntimeState(this, "dismissed");
      destroyDriver();
      return;
    }

    if (shouldOfferGuidedOnboarding(this)) {
      resetGuidedOnboardingRuntimeState(this, "available");
      return;
    }

    resetGuidedOnboardingRuntimeState(this, "idle");
    destroyDriver();
  },

  startGuidedOnboarding(lotType: LotType): void {
    if (!shouldOfferGuidedOnboarding(this)) {
      this.syncGuidedOnboarding();
      return;
    }

    this.guidedOnboardingStatus = "running";
    this.guidedOnboardingLotType = lotType === "singles" ? "singles" : "bulk";
    this.guidedOnboardingTargetLotId = null;
    this.currentTab = "config";
    this.newLotType = this.guidedOnboardingLotType;
    this.showNewLotModal = true;

    waitForElement(TOUR_TARGETS.newLotCard, () => {
      if (this.guidedOnboardingStatus !== "running" || this.guidedOnboardingTargetLotId) {
        return;
      }
      if (!getElement(TOUR_TARGETS.newLotCard)) {
        resetGuidedOnboardingRuntimeState(this, "available");
        return;
      }
      startConfiguredDriver(this, [
        {
          element: TOUR_TARGETS.newLotCard,
          popover: {
            title: this.t("onboardingTourCreateLotTitle"),
            description: this.t("onboardingTourCreateLotBody"),
            showButtons: ["close"]
          }
        }
      ]);
    });
  },

  dismissGuidedOnboarding(): void {
    writePersistedOnboardingStatus("dismissed");
    resetGuidedOnboardingRuntimeState(this, "dismissed");
    destroyDriver();
  },

  stopGuidedOnboarding(): void {
    destroyDriver();
    if (this.guidedOnboardingStatus === "running") {
      resetGuidedOnboardingRuntimeState(this, shouldOfferGuidedOnboarding(this) ? "available" : "idle");
      return;
    }
    this.guidedOnboardingLotType = null;
    this.guidedOnboardingTargetLotId = null;
  },

  handleGuidedOnboardingLotCreated(lotType: LotType, lotId: number): void {
    if (this.guidedOnboardingStatus !== "running") return;
    if (this.guidedOnboardingLotType !== lotType) return;

    this.guidedOnboardingTargetLotId = lotId;
    this.currentTab = "config";
    destroyDriver();
    void this.$nextTick(() => {
      if (this.guidedOnboardingStatus !== "running" || this.guidedOnboardingTargetLotId !== lotId) {
        return;
      }
      startPostCreateTour(this, lotType);
    });
  }
} satisfies OnboardingMethodImplementation;

