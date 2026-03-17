import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";

const require = createRequire(import.meta.url);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const apiDistRoot = path.resolve(currentDir, "../api/dist");
const apiLocalSettingsPath = path.resolve(currentDir, "../api/local.settings.json");

function ensureBuiltModule(relativePath) {
  const fullPath = path.join(apiDistRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `Missing built API module '${relativePath}'. Run 'npm --prefix apps/api run build' first.`
    );
  }
  return require(fullPath);
}

function loadLocalSettingsEnv() {
  if (!fs.existsSync(apiLocalSettingsPath)) {
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(apiLocalSettingsPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to parse '${apiLocalSettingsPath}': ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const values = parsed?.Values;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return;
  }

  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] != null && String(process.env[key]).trim() !== "") {
      continue;
    }
    process.env[key] = value == null ? "" : String(value);
  }
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    migrationId: null,
    note: "data-migrator CLI run",
    assumeYes: false,
    force: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || "").trim();
    if (!arg) continue;
    if (arg === "--apply") {
      args.dryRun = false;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--yes") {
      args.assumeYes = true;
      continue;
    }
    if (arg === "--force") {
      args.force = true;
      continue;
    }
    if (arg === "--migration") {
      args.migrationId = String(argv[index + 1] || "").trim() || null;
      index += 1;
      continue;
    }
    if (arg === "--note") {
      args.note = String(argv[index + 1] || "").trim() || args.note;
      index += 1;
    }
  }

  return args;
}

async function confirmFallbackDatabase(databaseId, assumeYes) {
  if (assumeYes) return;

  if (!input.isTTY || !output.isTTY) {
    throw new Error(
      `MIGRATION_COSMOSDB_DATABASE_ID is not set. Refusing to fall back to COSMOSDB_DATABASE_ID='${databaseId}' in a non-interactive shell. Set MIGRATION_COSMOSDB_DATABASE_ID explicitly or rerun with --yes.`
    );
  }

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(
      `MIGRATION_COSMOSDB_DATABASE_ID is not set. Use COSMOSDB_DATABASE_ID='${databaseId}' as the migration target? [y/N] `
    );
    const normalized = String(answer || "").trim().toLowerCase();
    if (normalized !== "y" && normalized !== "yes") {
      throw new Error("Migration cancelled.");
    }
  } finally {
    rl.close();
  }
}

async function main() {
  loadLocalSettingsEnv();

  const { getConfig } = ensureBuiltModule("lib/config.js");
  const { MIGRATION_REGISTRY } = ensureBuiltModule("lib/migrations/registry.js");
  const { runMigration } = ensureBuiltModule("lib/migrations/runner.js");

  const args = parseArgs(process.argv.slice(2));
  const baseConfig = getConfig();
  const explicitMigrationDatabaseId = String(process.env.MIGRATION_COSMOSDB_DATABASE_ID || "").trim();
  const targetDatabaseId = explicitMigrationDatabaseId || String(baseConfig.cosmosDatabaseId || "").trim();

  if (!targetDatabaseId) {
    throw new Error("No Cosmos database id configured for migrations.");
  }

  if (!explicitMigrationDatabaseId) {
    await confirmFallbackDatabase(targetDatabaseId, args.assumeYes);
  }

  const config = {
    ...baseConfig,
    cosmosDatabaseId: targetDatabaseId
  };
  const migrations = args.migrationId
    ? MIGRATION_REGISTRY.filter((migration) => migration.id === args.migrationId)
    : MIGRATION_REGISTRY;

  if (migrations.length === 0) {
    throw new Error(args.migrationId
      ? `Migration '${args.migrationId}' not found.`
      : "No migrations registered.");
  }

  for (const migration of migrations) {
    const run = await runMigration({
      migration,
      config,
      dryRun: args.dryRun,
      force: args.force,
      triggeredByUserId: "data-migrator",
      note: args.note
    });

    console.log(JSON.stringify({
      ok: true,
      migrationId: migration.id,
      status: run.status,
      dryRun: run.dryRun,
      result: run.result ?? null
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
