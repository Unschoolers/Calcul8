import commonEn from "./locales/en/common.json";
import authEn from "./locales/en/auth.json";
import shellEn from "./locales/en/shell.json";
import lotsEn from "./locales/en/lots.json";
import onboardingEn from "./locales/en/onboarding.json";
import configEn from "./locales/en/config.json";
import singlesEn from "./locales/en/singles.json";
import liveEn from "./locales/en/live.json";
import salesEn from "./locales/en/sales.json";
import portfolioEn from "./locales/en/portfolio.json";
import wheelEn from "./locales/en/wheel.json";
import whatnotEn from "./locales/en/whatnot.json";
import miscEn from "./locales/en/misc.json";
import commonFr from "./locales/fr/common.json";
import authFr from "./locales/fr/auth.json";
import shellFr from "./locales/fr/shell.json";
import lotsFr from "./locales/fr/lots.json";
import onboardingFr from "./locales/fr/onboarding.json";
import configFr from "./locales/fr/config.json";
import singlesFr from "./locales/fr/singles.json";
import liveFr from "./locales/fr/live.json";
import salesFr from "./locales/fr/sales.json";
import portfolioFr from "./locales/fr/portfolio.json";
import wheelFr from "./locales/fr/wheel.json";
import whatnotFr from "./locales/fr/whatnot.json";
import miscFr from "./locales/fr/misc.json";

export const SUPPORTED_APP_LOCALES = ["en", "fr-CA"] as const;

export type SupportedAppLocale = (typeof SUPPORTED_APP_LOCALES)[number];
export type AppLanguagePreference = SupportedAppLocale | "";
export type AppTranslationKey = string;

type TranslationParams = Record<string, string | number | null | undefined>;
type TranslationCatalog = Record<string, string>;

const EN_TRANSLATIONS: TranslationCatalog = {
  ...commonEn,
  ...authEn,
  ...shellEn,
  ...lotsEn,
  ...onboardingEn,
  ...configEn,
  ...singlesEn,
  ...liveEn,
  ...salesEn,
  ...portfolioEn,
  ...wheelEn,
  ...whatnotEn,
  ...miscEn
};

const FR_TRANSLATIONS: TranslationCatalog = {
  ...commonFr,
  ...authFr,
  ...shellFr,
  ...lotsFr,
  ...onboardingFr,
  ...configFr,
  ...singlesFr,
  ...liveFr,
  ...salesFr,
  ...portfolioFr,
  ...wheelFr,
  ...whatnotFr,
  ...miscFr
};

export const APP_TRANSLATIONS: Record<SupportedAppLocale, TranslationCatalog> = {
  en: EN_TRANSLATIONS,
  "fr-CA": FR_TRANSLATIONS
};

function normalizeLocaleTag(value: string | null | undefined): string {
  const raw = String(value ?? "").trim().replace(/_/g, "-");
  if (!raw) return "";

  const lower = raw.toLowerCase();
  if (lower.startsWith("fr")) return "fr-CA";
  if (lower.startsWith("en")) return "en";
  return raw;
}

export function normalizeLanguagePreference(value: string | null | undefined): AppLanguagePreference {
  const normalized = normalizeLocaleTag(value);
  return normalized === "en" || normalized === "fr-CA" ? normalized : "";
}

export function resolveAppTranslationLocale(
  preferredLanguage: AppLanguagePreference | string | null | undefined
): SupportedAppLocale {
  return normalizeLanguagePreference(preferredLanguage) === "fr-CA" ? "fr-CA" : "en";
}

export function getBrowserLocale(): string {
  if (typeof navigator === "undefined") return "";
  const candidates = Array.isArray(navigator.languages) && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];
  for (const candidate of candidates) {
    const normalized = normalizeLocaleTag(candidate);
    if (normalized) return normalized;
  }
  return "";
}

export function resolveAppFormattingLocale(
  preferredLanguage: AppLanguagePreference | string | null | undefined
): string {
  const normalizedPreference = normalizeLanguagePreference(preferredLanguage);
  if (normalizedPreference) return normalizedPreference;

  const browserLocale = getBrowserLocale();
  if (browserLocale) return browserLocale;
  return "en-US";
}

function interpolateMessage(message: string, params?: TranslationParams): string {
  if (!params) return message;
  return message.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = params[key];
    return value == null ? "" : String(value);
  });
}

export function translateAppMessage(
  preferredLanguage: AppLanguagePreference | string | null | undefined,
  key: AppTranslationKey,
  params?: TranslationParams
): string {
  const locale = resolveAppTranslationLocale(preferredLanguage);
  const template = APP_TRANSLATIONS[locale][key] ?? APP_TRANSLATIONS.en[key] ?? key;
  return interpolateMessage(template, params);
}

function parseLocalDate(value: string): Date | null {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const date = new Date(Number(slashMatch[3]), Number(slashMatch[1]) - 1, Number(slashMatch[2]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatLocalizedDate(
  dateStr: string,
  preferredLanguage: AppLanguagePreference | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric"
  }
): string {
  const date = parseLocalDate(dateStr);
  if (!date) return String(dateStr || "");
  return new Intl.DateTimeFormat(resolveAppFormattingLocale(preferredLanguage), options).format(date);
}

export function formatLocalizedCompactDate(
  dateStr: string,
  preferredLanguage: AppLanguagePreference | string | null | undefined
): string {
  return formatLocalizedDate(dateStr, preferredLanguage, {
    month: "short",
    day: "numeric"
  });
}

export function formatLocalizedNumber(
  value: number | null | undefined,
  preferredLanguage: AppLanguagePreference | string | null | undefined,
  decimals = 2
): string {
  if (value == null || Number.isNaN(value)) return "0";
  return new Intl.NumberFormat(resolveAppFormattingLocale(preferredLanguage), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(Number(value));
}

export function compareLocalizedText(
  left: string,
  right: string,
  preferredLanguage: AppLanguagePreference | string | null | undefined,
  options: Intl.CollatorOptions = {
    numeric: true,
    sensitivity: "base"
  }
): number {
  return left.localeCompare(right, resolveAppFormattingLocale(preferredLanguage), options);
}
