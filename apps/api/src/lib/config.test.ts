import assert from "node:assert/strict";
import { test } from "vitest";
import { getConfig, resetConfigForTests } from "./config";

function withEnv(overrides: Record<string, string | undefined>, run: () => void): void {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
  }

  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetConfigForTests();
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetConfigForTests();
  }
}

function requiredBaseEnv(): Record<string, string> {
  return {
    COSMOSDB_ENDPOINT: "https://example.documents.azure.com:443/",
    COSMOSDB_KEY: "fake-key"
  };
}

test("config defaults to dev and sensible defaults", () => {
  withEnv(
    {
      ...requiredBaseEnv(),
      API_ENV: undefined,
      AUTH_BYPASS_DEV: undefined,
      COSMOSDB_DATABASE_ID: undefined,
      COSMOSDB_ENTITLEMENTS_CONTAINER_ID: undefined,
      COSMOSDB_SYNC_CONTAINER_ID: undefined,
      SYNC_IMPORT_SOURCE_COSMOSDB_ENDPOINT: undefined,
      SYNC_IMPORT_SOURCE_COSMOSDB_KEY: undefined,
      SYNC_IMPORT_SOURCE_COSMOSDB_DATABASE_ID: undefined,
      SYNC_IMPORT_SOURCE_COSMOSDB_SYNC_CONTAINER_ID: undefined,
      COSMOSDB_MIGRATION_RUNS_CONTAINER_ID: undefined,
      COSMOSDB_CARD_CATALOG_CONTAINER_ID: undefined,
      COSMOSDB_SESSIONS_CONTAINER_ID: undefined,
      SESSION_COOKIE_NAME: undefined,
      SESSION_IDLE_TTL_SECONDS: undefined,
      SESSION_ABSOLUTE_TTL_SECONDS: undefined,
      SESSION_TOUCH_INTERVAL_SECONDS: undefined,
      ALLOWED_ORIGINS: undefined,
      GOOGLE_PLAY_PRO_PRODUCT_IDS: undefined
    },
    () => {
      const config = getConfig();
      assert.equal(config.apiEnv, "dev");
      assert.equal(config.authBypassDev, true);
      assert.equal(config.cosmosDatabaseId, "whatfees");
      assert.equal(config.entitlementsContainerId, "entitlements");
      assert.equal(config.syncContainerId, "sync_data");
      assert.equal(config.syncImportSourceCosmosEndpoint, "https://example.documents.azure.com:443/");
      assert.equal(config.syncImportSourceCosmosKey, "fake-key");
      assert.equal(config.syncImportSourceCosmosDatabaseId, "whatfees");
      assert.equal(config.syncImportSourceSyncContainerId, "sync_data");
      assert.equal(config.migrationRunsContainerId, "migration_runs");
      assert.equal(config.cardCatalogContainerId, "card_catalog");
      assert.equal(config.sessionsContainerId, "sessions");
      assert.equal(config.sessionCookieName, "whatfees_session");
      assert.equal(config.sessionIdleTtlSeconds, 7 * 24 * 60 * 60);
      assert.equal(config.sessionAbsoluteTtlSeconds, 30 * 24 * 60 * 60);
      assert.equal(config.sessionTouchIntervalSeconds, 15 * 60);
      assert.equal(config.migrationsAdminKey, "");
      assert.equal(config.stripeSecretKey, "");
      assert.equal(config.stripeWebhookSecret, "");
      assert.equal(config.stripeOneTimePriceId, "");
      assert.equal(config.stripeSuccessUrl, "");
      assert.equal(config.stripeCancelUrl, "");
      assert.deepEqual(config.allowedOrigins, []);
      assert.deepEqual(config.googlePlayProProductIds, []);
    }
  );
});

test("config supports explicit source Cosmos override for sync import", () => {
  withEnv(
    {
      ...requiredBaseEnv(),
      COSMOSDB_DATABASE_ID: "whatfees-dev",
      COSMOSDB_SYNC_CONTAINER_ID: "sync_data_dev",
      SYNC_IMPORT_SOURCE_COSMOSDB_ENDPOINT: "https://prod.documents.azure.com:443/",
      SYNC_IMPORT_SOURCE_COSMOSDB_KEY: "prod-key",
      SYNC_IMPORT_SOURCE_COSMOSDB_DATABASE_ID: "whatfees-prod",
      SYNC_IMPORT_SOURCE_COSMOSDB_SYNC_CONTAINER_ID: "sync_data_prod"
    },
    () => {
      const config = getConfig();
      assert.equal(config.cosmosDatabaseId, "whatfees-dev");
      assert.equal(config.syncContainerId, "sync_data_dev");
      assert.equal(config.syncImportSourceCosmosEndpoint, "https://prod.documents.azure.com:443/");
      assert.equal(config.syncImportSourceCosmosKey, "prod-key");
      assert.equal(config.syncImportSourceCosmosDatabaseId, "whatfees-prod");
      assert.equal(config.syncImportSourceSyncContainerId, "sync_data_prod");
    }
  );
});

test("config parses prod and explicit false auth bypass", () => {
  withEnv(
    {
      ...requiredBaseEnv(),
      API_ENV: "prod",
      AUTH_BYPASS_DEV: "false",
      COSMOSDB_MIGRATION_RUNS_CONTAINER_ID: "migration_runs_custom",
      MIGRATIONS_ADMIN_KEY: "top-secret"
    },
    () => {
      const config = getConfig();
      assert.equal(config.apiEnv, "prod");
      assert.equal(config.authBypassDev, false);
      assert.equal(config.migrationRunsContainerId, "migration_runs_custom");
      assert.equal(config.migrationsAdminKey, "top-secret");
    }
  );
});

test("config parses comma-separated origins and product ids", () => {
  withEnv(
    {
      ...requiredBaseEnv(),
      ALLOWED_ORIGINS: "https://a.com, https://b.com ,,",
      GOOGLE_PLAY_PRO_PRODUCT_IDS: "pro_access, pro_plus ,"
    },
    () => {
      const config = getConfig();
      assert.deepEqual(config.allowedOrigins, ["https://a.com", "https://b.com"]);
      assert.deepEqual(config.googlePlayProProductIds, ["pro_access", "pro_plus"]);
    }
  );
});

test("config unescapes private key newlines", () => {
  withEnv(
    {
      ...requiredBaseEnv(),
      GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY: "line1\\nline2"
    },
    () => {
      const config = getConfig();
      assert.equal(config.googlePlayServiceAccountPrivateKey, "line1\nline2");
    }
  );
});

test("config parses custom session settings", () => {
  withEnv(
    {
      ...requiredBaseEnv(),
      COSMOSDB_SESSIONS_CONTAINER_ID: "sessions_custom",
      SESSION_COOKIE_NAME: "wf_sid",
      SESSION_IDLE_TTL_SECONDS: "7200",
      SESSION_ABSOLUTE_TTL_SECONDS: "2592000",
      SESSION_TOUCH_INTERVAL_SECONDS: "60"
    },
    () => {
      const config = getConfig();
      assert.equal(config.sessionsContainerId, "sessions_custom");
      assert.equal(config.sessionCookieName, "wf_sid");
      assert.equal(config.sessionIdleTtlSeconds, 7200);
      assert.equal(config.sessionAbsoluteTtlSeconds, 2592000);
      assert.equal(config.sessionTouchIntervalSeconds, 60);
    }
  );
});

test("config throws when required Cosmos variables are missing", () => {
  withEnv(
    {
      COSMOSDB_ENDPOINT: undefined,
      COSMOSDB_KEY: "fake-key"
    },
    () => {
      assert.throws(
        () => getConfig(),
        /Missing required environment variable: COSMOSDB_ENDPOINT/
      );
    }
  );
});

