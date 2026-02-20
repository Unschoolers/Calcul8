export const STORAGE_KEYS = {
  LAST_TAB: "whatfees_last_tab",
  PORTFOLIO_FILTER_IDS: "whatfees_portfolio_filter_ids",
  PURCHASE_UI_MODE: "whatfees_purchase_ui_mode",
  LAST_LOT_ID: "whatfees_last_lot_id",
  PRESETS: "whatfees_presets",
  EXCHANGE_RATE_CACHE: "whatfees_exchange_rate_usd_cad_v1",
  ENTITLEMENT_CACHE: "whatfees_entitlement_cache_v1",
  PRO_ACCESS: "whatfees_pro_access",
  GOOGLE_ID_TOKEN: "whatfees_google_id_token",
  GOOGLE_PROFILE_CACHE: "whatfees_google_profile_cache_v1",
  DEBUG_USER_ID: "whatfees_debug_user_id",
  SYNC_CLIENT_VERSION: "whatfees_sync_client_version",
  API_BASE_URL: "whatfees_api_base_url"
} as const;

const LEGACY_STORAGE_KEYS = {
  LAST_LOT_ID: "rtyh_last_preset_id",
  PRESETS: "rtyh_presets",
  ENTITLEMENT_CACHE: "rtyh_entitlement_cache_v1",
  PRO_ACCESS: "rtyh_pro_access",
  GOOGLE_ID_TOKEN: "rtyh_google_id_token",
  GOOGLE_PROFILE_CACHE: "rtyh_google_profile_cache_v1",
  DEBUG_USER_ID: "rtyh_debug_user_id",
  SYNC_CLIENT_VERSION: "rtyh_sync_client_version"
} as const;

const SALES_PREFIX = "whatfees_sales_";
const LEGACY_SALES_PREFIX = "rtyh_sales_";

function parseJsonLoose(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isStructuredEmpty(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null") return true;

  const parsed = parseJsonLoose(trimmed);
  if (parsed === undefined) return false;
  if (Array.isArray(parsed)) return parsed.length === 0;
  if (typeof parsed === "object" && parsed !== null) return Object.keys(parsed).length === 0;
  return false;
}

function shouldPromoteLegacyValue(existing: string, legacy: string): boolean {
  if (existing === legacy) return false;
  return isStructuredEmpty(existing) && !isStructuredEmpty(legacy);
}

function migrateValue(fromKey: string, toKey: string): void {
  if (fromKey === toKey) return;
  try {
    const existing = localStorage.getItem(toKey);
    const legacy = localStorage.getItem(fromKey);
    if (legacy === null) return;

    if (existing === null) {
      localStorage.setItem(toKey, legacy);
      if (localStorage.getItem(toKey) === legacy) {
        localStorage.removeItem(fromKey);
      }
      return;
    }

    if (shouldPromoteLegacyValue(existing, legacy)) {
      localStorage.setItem(toKey, legacy);
      if (localStorage.getItem(toKey) === legacy) {
        localStorage.removeItem(fromKey);
      }
      return;
    }

    if (existing === legacy) {
      localStorage.removeItem(fromKey);
    }
  } catch {
    // Ignore storage failures.
  }
}

export function migrateLegacyStorageKeys(): void {
  migrateValue(LEGACY_STORAGE_KEYS.LAST_LOT_ID, STORAGE_KEYS.LAST_LOT_ID);
  migrateValue(LEGACY_STORAGE_KEYS.PRESETS, STORAGE_KEYS.PRESETS);
  migrateValue(LEGACY_STORAGE_KEYS.ENTITLEMENT_CACHE, STORAGE_KEYS.ENTITLEMENT_CACHE);
  migrateValue(LEGACY_STORAGE_KEYS.PRO_ACCESS, STORAGE_KEYS.PRO_ACCESS);
  migrateValue(LEGACY_STORAGE_KEYS.GOOGLE_ID_TOKEN, STORAGE_KEYS.GOOGLE_ID_TOKEN);
  migrateValue(LEGACY_STORAGE_KEYS.GOOGLE_PROFILE_CACHE, STORAGE_KEYS.GOOGLE_PROFILE_CACHE);
  migrateValue(LEGACY_STORAGE_KEYS.DEBUG_USER_ID, STORAGE_KEYS.DEBUG_USER_ID);
  migrateValue(LEGACY_STORAGE_KEYS.SYNC_CLIENT_VERSION, STORAGE_KEYS.SYNC_CLIENT_VERSION);
  migrateAllLegacySalesKeys();
}

export function getSalesStorageKey(lotId: number): string {
  return `${SALES_PREFIX}${lotId}`;
}

export function getLegacySalesStorageKey(lotId: number): string {
  return `${LEGACY_SALES_PREFIX}${lotId}`;
}

export function migrateLegacySalesKey(lotId: number): void {
  migrateValue(getLegacySalesStorageKey(lotId), getSalesStorageKey(lotId));
}

function migrateAllLegacySalesKeys(): void {
  try {
    const keys: string[] = [];

    if (typeof localStorage.length === "number" && typeof localStorage.key === "function") {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (typeof key === "string") keys.push(key);
      }
    } else {
      keys.push(...Object.keys(localStorage));
    }

    for (const key of keys) {
      if (!key.startsWith(LEGACY_SALES_PREFIX)) continue;
      const suffix = key.slice(LEGACY_SALES_PREFIX.length);
      if (!suffix) continue;
      migrateValue(key, `${SALES_PREFIX}${suffix}`);
    }
  } catch {
    // Ignore storage failures.
  }
}

export function readStorageWithLegacy(newKey: string, legacyKey?: string): string | null {
  try {
    const current = localStorage.getItem(newKey);
    if (!legacyKey) return current;
    const legacy = localStorage.getItem(legacyKey);
    if (legacy === null) return current;

    if (current !== null) {
      if (shouldPromoteLegacyValue(current, legacy)) {
        localStorage.setItem(newKey, legacy);
        return legacy;
      }
      return current;
    }

    localStorage.setItem(newKey, legacy);
    return legacy;
  } catch {
    return null;
  }
}

export function removeStorageWithLegacy(newKey: string, legacyKey?: string): void {
  try {
    localStorage.removeItem(newKey);
    if (legacyKey) {
      localStorage.removeItem(legacyKey);
    }
  } catch {
    // Ignore storage failures.
  }
}

export function getLegacyStorageKeys(): typeof LEGACY_STORAGE_KEYS {
  return LEGACY_STORAGE_KEYS;
}
