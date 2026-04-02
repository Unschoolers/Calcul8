import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import {
  APP_TRANSLATIONS,
  formatLocalizedCompactDate,
  normalizeLanguagePreference,
  resolveAppTranslationLocale,
  translateAppMessage,
  getBrowserLocale
} from "../src/app-core/i18n/index.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("normalizeLanguagePreference maps common locale tags to supported app languages", () => {
  assert.equal(normalizeLanguagePreference("fr"), "fr-CA");
  assert.equal(normalizeLanguagePreference("fr-CA"), "fr-CA");
  assert.equal(normalizeLanguagePreference("en-US"), "en");
  assert.equal(normalizeLanguagePreference("es-MX"), "");
});

test("resolveAppTranslationLocale falls back to English unless French is requested", () => {
  assert.equal(resolveAppTranslationLocale(undefined), "en");
  assert.equal(resolveAppTranslationLocale("fr"), "fr-CA");
  assert.equal(resolveAppTranslationLocale("en"), "en");
});

test("translateAppMessage returns the configured string and interpolates params", () => {
  assert.equal(translateAppMessage("en", "personalLabel"), "Personal");
  assert.equal(translateAppMessage("en", "onboardingIntroTitle"), "Let's get your first lot set up");
  assert.equal(translateAppMessage("fr-CA", "shellLanguageLabel"), "Langue de l'application");
  assert.equal(
    translateAppMessage("en", "whatnotConnectedSummary", { name: "A", pendingCountSuffix: " (2)" }),
    "A (2)"
  );
});

test("translation catalogs stay aligned across locales", () => {
  assert.deepEqual(
    Object.keys(APP_TRANSLATIONS["fr-CA"]).sort(),
    Object.keys(APP_TRANSLATIONS.en).sort()
  );
});

test("formatLocalizedCompactDate uses the requested locale", () => {
  assert.equal(formatLocalizedCompactDate("2026-03-09", "en"), "Mar 9");
  assert.equal(formatLocalizedCompactDate("not-a-date", "en"), "not-a-date");
});

test("getBrowserLocale uses the first available browser candidate", () => {
  vi.stubGlobal("navigator", {
    language: "en-US",
    languages: ["fr-CA", "en-US"]
  });

  assert.equal(getBrowserLocale(), "fr-CA");
});
