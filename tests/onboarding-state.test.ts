import assert from "node:assert/strict";
import { test } from "vitest";
import {
  normalizePersistedOnboardingStatus,
  shouldOfferFirstRunOnboarding
} from "../src/app-core/onboarding-state.ts";

test("normalizePersistedOnboardingStatus accepts supported statuses and defaults to pending", () => {
  assert.equal(normalizePersistedOnboardingStatus("pending"), "pending");
  assert.equal(normalizePersistedOnboardingStatus(" completed "), "completed");
  assert.equal(normalizePersistedOnboardingStatus("DISMISSED"), "dismissed");
  assert.equal(normalizePersistedOnboardingStatus("unknown"), "pending");
  assert.equal(normalizePersistedOnboardingStatus(null), "pending");
});

test("shouldOfferFirstRunOnboarding only offers onboarding to signed-in personal users with no lots", () => {
  assert.equal(
    shouldOfferFirstRunOnboarding({
      isGoogleSignedIn: true,
      activeScopeType: "personal",
      lotsCount: 0
    }),
    true
  );

  assert.equal(
    shouldOfferFirstRunOnboarding({
      isGoogleSignedIn: false,
      activeScopeType: "personal",
      lotsCount: 0
    }),
    false
  );

  assert.equal(
    shouldOfferFirstRunOnboarding({
      isGoogleSignedIn: true,
      activeScopeType: "workspace",
      lotsCount: 0
    }),
    false
  );

  assert.equal(
    shouldOfferFirstRunOnboarding({
      isGoogleSignedIn: true,
      activeScopeType: "personal",
      lotsCount: 1
    }),
    false
  );

  assert.equal(
    shouldOfferFirstRunOnboarding({
      isGoogleSignedIn: true,
      activeScopeType: "personal",
      lotsCount: 0,
      onboardingStatus: "dismissed"
    }),
    false
  );
});
