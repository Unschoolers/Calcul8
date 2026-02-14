import assert from "node:assert/strict";
import test from "node:test";
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
      ALLOWED_ORIGINS: undefined,
      GOOGLE_PLAY_PRO_PRODUCT_IDS: undefined
    },
    () => {
      const config = getConfig();
      assert.equal(config.apiEnv, "dev");
      assert.equal(config.authBypassDev, true);
      assert.equal(config.cosmosDatabaseId, "calcul8tr");
      assert.equal(config.entitlementsContainerId, "entitlements");
      assert.equal(config.syncContainerId, "sync_data");
      assert.deepEqual(config.allowedOrigins, []);
      assert.deepEqual(config.googlePlayProProductIds, []);
    }
  );
});

test("config parses prod and explicit false auth bypass", () => {
  withEnv(
    {
      ...requiredBaseEnv(),
      API_ENV: "prod",
      AUTH_BYPASS_DEV: "false"
    },
    () => {
      const config = getConfig();
      assert.equal(config.apiEnv, "prod");
      assert.equal(config.authBypassDev, false);
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
