export const STORAGE_KEYS = {
  LAST_TAB: "whatfees_last_tab",
  THEME: "whatfees_theme",
  ONBOARDING_STATUS: "whatfees_onboarding_status_v1",
  LIVE_SINGLES_MODE: "whatfees_live_singles_mode",
  PORTFOLIO_FILTER_IDS: "whatfees_portfolio_filter_ids",
  PORTFOLIO_FILTER_TYPE: "whatfees_portfolio_filter_type",
  PORTFOLIO_DASHBOARD_PRESET: "whatfees_portfolio_dashboard_preset",
  PURCHASE_UI_MODE: "whatfees_purchase_ui_mode",
  ACTIVE_SCOPE_TYPE: "whatfees_active_scope_type",
  ACTIVE_WORKSPACE_ID: "whatfees_active_workspace_id",
  LANGUAGE: "whatfees_language",
  LAST_LOT_ID: "whatfees_last_lot_id",
  PRESETS: "whatfees_presets",
  SYSTEM_PRICING_DEFAULTS: "whatfees_system_pricing_defaults_v1",
  EXCHANGE_RATE_CACHE: "whatfees_exchange_rate_usd_cad_v1",
  ENTITLEMENT_CACHE: "whatfees_entitlement_cache_v1",
  PRO_ACCESS: "whatfees_pro_access",
  GOOGLE_ID_TOKEN: "whatfees_google_id_token",
  GOOGLE_PROFILE_CACHE: "whatfees_google_profile_cache_v1",
  GOOGLE_AUTO_SIGNIN_DISABLED: "whatfees_google_auto_signin_disabled_v1",
  CSRF_TOKEN: "whatfees_csrf_token_v1",
  DEBUG_USER_ID: "whatfees_debug_user_id",
  SYNC_CLIENT_VERSION: "whatfees_sync_client_version",
  LAST_SYNCED_PAYLOAD_HASH: "whatfees_last_synced_payload_hash",
  API_BASE_URL: "whatfees_api_base_url",
  WHEEL_CONFIGS: "whatfees_wheel_configs",
  ACTIVE_WHEEL_CONFIG: "whatfees_active_wheel_config",
  WHEEL_SESSION: "whatfees_wheel_session",
  BRACKET_BATTLE_SESSION: "whatfees_bracket_battle_session"
} as const;

const SALES_PREFIX = "whatfees_sales_";
const SALES_STATUS_PREFIX = "whatfees_sales_status_";
const SALES_SYNC_META_PREFIX = "whatfees_sales_sync_meta_";
const WORKSPACE_SCOPE_SEGMENT = "__ws__";

export type AppStorageScope = {
  scopeType: "personal" | "workspace";
  workspaceId?: string | null;
};

function normalizeWorkspaceScopeId(workspaceId: string | null | undefined): string {
  return encodeURIComponent(String(workspaceId || "").trim());
}

function isWorkspaceScope(scope: AppStorageScope): boolean {
  return scope.scopeType === "workspace" && !!normalizeWorkspaceScopeId(scope.workspaceId);
}

function buildScopedStorageKey(baseKey: string, scope: AppStorageScope): string {
  if (!isWorkspaceScope(scope)) return baseKey;
  return `${baseKey}${WORKSPACE_SCOPE_SEGMENT}${normalizeWorkspaceScopeId(scope.workspaceId)}`;
}

export function getSalesStorageKey(lotId: number, scope: AppStorageScope = { scopeType: "personal" }): string {
  if (!isWorkspaceScope(scope)) {
    return `${SALES_PREFIX}${lotId}`;
  }
  return `${SALES_PREFIX}${normalizeWorkspaceScopeId(scope.workspaceId)}__${lotId}`;
}

export function getSalesCacheStatusKey(lotId: number, scope: AppStorageScope = { scopeType: "personal" }): string {
  if (!isWorkspaceScope(scope)) {
    return `${SALES_STATUS_PREFIX}${lotId}`;
  }
  return `${SALES_STATUS_PREFIX}${normalizeWorkspaceScopeId(scope.workspaceId)}__${lotId}`;
}

export function getSalesSyncMetaKey(lotId: number, scope: AppStorageScope = { scopeType: "personal" }): string {
  if (!isWorkspaceScope(scope)) {
    return `${SALES_SYNC_META_PREFIX}${lotId}`;
  }
  return `${SALES_SYNC_META_PREFIX}${normalizeWorkspaceScopeId(scope.workspaceId)}__${lotId}`;
}

export function clearScopedSalesStorage(scope: AppStorageScope = { scopeType: "personal" }): void {
  const workspacePrefix = `${SALES_PREFIX}${normalizeWorkspaceScopeId(scope.workspaceId)}__`;
  const workspaceStatusPrefix = `${SALES_STATUS_PREFIX}${normalizeWorkspaceScopeId(scope.workspaceId)}__`;
  const workspaceSyncMetaPrefix = `${SALES_SYNC_META_PREFIX}${normalizeWorkspaceScopeId(scope.workspaceId)}__`;
  try {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (typeof key === "string") {
        keys.push(key);
      }
    }
    for (const key of keys) {
      if (isWorkspaceScope(scope)) {
        if (
          key.startsWith(workspacePrefix)
          || key.startsWith(workspaceStatusPrefix)
          || key.startsWith(workspaceSyncMetaPrefix)
        ) {
          localStorage.removeItem(key);
        }
        continue;
      }

      if (
        (key.startsWith(SALES_PREFIX) && !key.slice(SALES_PREFIX.length).includes("__"))
        || (key.startsWith(SALES_STATUS_PREFIX) && !key.slice(SALES_STATUS_PREFIX.length).includes("__"))
        || (key.startsWith(SALES_SYNC_META_PREFIX) && !key.slice(SALES_SYNC_META_PREFIX.length).includes("__"))
      ) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage enumeration failures.
  }
}

export function clearScopedSyncDataStorage(scope: AppStorageScope = { scopeType: "personal" }): void {
  const keys = [
    getScopedPresetsStorageKey(scope),
    getScopedSystemPricingDefaultsStorageKey(scope),
    getScopedWheelConfigsStorageKey(scope),
    getScopedActiveWheelConfigStorageKey(scope),
    getScopedLastLotStorageKey(scope),
    getScopedSyncClientVersionKey(scope),
    getScopedLastSyncedPayloadHashKey(scope)
  ];

  try {
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures; the subsequent forced pull still refreshes memory.
  }

  clearScopedSalesStorage(scope);
}

export function getScopedPresetsStorageKey(scope: AppStorageScope): string {
  return buildScopedStorageKey(STORAGE_KEYS.PRESETS, scope);
}

export function getScopedSystemPricingDefaultsStorageKey(scope: AppStorageScope): string {
  return buildScopedStorageKey(STORAGE_KEYS.SYSTEM_PRICING_DEFAULTS, scope);
}

export function getScopedWheelConfigsStorageKey(scope: AppStorageScope): string {
  return buildScopedStorageKey(STORAGE_KEYS.WHEEL_CONFIGS, scope);
}

export function getScopedActiveWheelConfigStorageKey(scope: AppStorageScope): string {
  return buildScopedStorageKey(STORAGE_KEYS.ACTIVE_WHEEL_CONFIG, scope);
}

export function getScopedWheelSessionStorageKey(scope: AppStorageScope): string {
  return buildScopedStorageKey(STORAGE_KEYS.WHEEL_SESSION, scope);
}

export function getScopedBracketBattleSessionStorageKey(scope: AppStorageScope): string {
  return buildScopedStorageKey(STORAGE_KEYS.BRACKET_BATTLE_SESSION, scope);
}

export function getScopedWheelConfigSessionStorageKey(
  scope: AppStorageScope,
  wheelConfigId: number | null | undefined
): string {
  const normalizedConfigId = Number.isFinite(Number(wheelConfigId)) && Number(wheelConfigId) > 0
    ? String(Math.floor(Number(wheelConfigId)))
    : "none";
  return `${getScopedWheelSessionStorageKey(scope)}__cfg__${normalizedConfigId}`;
}

export function getScopedWheelConfigDraftStorageKey(
  scope: AppStorageScope,
  wheelConfigId: number | null | undefined
): string {
  const normalizedConfigId = Number.isFinite(Number(wheelConfigId)) && Number(wheelConfigId) > 0
    ? String(Math.floor(Number(wheelConfigId)))
    : "none";
  return `${getScopedWheelConfigsStorageKey(scope)}__draft__${normalizedConfigId}`;
}

export function getScopedLastLotStorageKey(scope: AppStorageScope): string {
  return buildScopedStorageKey(STORAGE_KEYS.LAST_LOT_ID, scope);
}

export function getScopedSyncClientVersionKey(scope: AppStorageScope): string {
  return buildScopedStorageKey(STORAGE_KEYS.SYNC_CLIENT_VERSION, scope);
}

export function getScopedLastSyncedPayloadHashKey(scope: AppStorageScope): string {
  return buildScopedStorageKey(STORAGE_KEYS.LAST_SYNCED_PAYLOAD_HASH, scope);
}

export function readStorage(newKey: string): string | null {
  try {
    return localStorage.getItem(newKey);
  } catch {
    return null;
  }
}

export function removeStorage(newKey: string): void {
  try {
    localStorage.removeItem(newKey);
  } catch {
    // Ignore storage failures.
  }
}
