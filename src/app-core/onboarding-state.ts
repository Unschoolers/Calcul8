import type { WorkspaceScopeType } from "../types/app.ts";

export type OnboardingStatus = "pending" | "completed" | "dismissed";

const ONBOARDING_STATUSES = new Set<OnboardingStatus>(["pending", "completed", "dismissed"]);

export function normalizePersistedOnboardingStatus(value: unknown): OnboardingStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (ONBOARDING_STATUSES.has(normalized as OnboardingStatus)) {
    return normalized as OnboardingStatus;
  }
  return "pending";
}

export function shouldOfferFirstRunOnboarding(params: {
  isGoogleSignedIn: boolean;
  activeScopeType: WorkspaceScopeType;
  lotsCount: number;
  onboardingStatus?: unknown;
}): boolean {
  return params.isGoogleSignedIn
    && params.activeScopeType === "personal"
    && Number(params.lotsCount) === 0
    && normalizePersistedOnboardingStatus(params.onboardingStatus) === "pending";
}
