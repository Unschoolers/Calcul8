import {
  getBrowserLocale,
  normalizeLanguagePreference,
  translateAppMessage,
  type AppLanguagePreference,
  type AppTranslationKey
} from "../app-core/i18n/index.ts";

export type SpectatorLanguage = AppLanguagePreference;

export type SpectatorTranslationParams = Record<string, string | number | null | undefined>;

export function resolveSpectatorLanguage(value: string | null | undefined): SpectatorLanguage {
  return normalizeLanguagePreference(value) || "en";
}

export function getDefaultSpectatorLanguage(): SpectatorLanguage {
  return resolveSpectatorLanguage(getBrowserLocale());
}

export function translateSpectatorMessage(
  language: string | null | undefined,
  key: AppTranslationKey,
  params?: SpectatorTranslationParams
): string {
  return translateAppMessage(resolveSpectatorLanguage(language), key, params);
}
