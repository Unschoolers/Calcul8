import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const api = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(api, "scripts/check-external-oauth-provider.mjs");
const config = { issuer: "https://issuer.example.test/", jwksUri: "https://issuer.example.test/.well-known/jwks.json", resources: { rest: "https://api.example.test/api/v1", mcp: "https://api.example.test/api/mcp" }, clientIds: ["client-one"] };
const metadata = {
  issuer: config.issuer, jwks_uri: config.jwksUri,
  authorization_endpoint: "https://issuer.example.test/authorize", token_endpoint: "https://issuer.example.test/oauth/token", revocation_endpoint: "https://issuer.example.test/oauth/revoke",
  code_challenge_methods_supported: ["S256"], grant_types_supported: ["authorization_code", "refresh_token"], response_types_supported: ["code"], token_endpoint_auth_methods_supported: ["none"], authorization_response_iss_parameter_supported: true, id_token_signing_alg_values_supported: ["RS256"], scopes_supported: ["openid"]
};
const run = (args, entry = script) => spawnSync(process.execPath, [entry, ...args], { encoding: "utf8" });
const failure = (result) => {
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "OAuth provider check failed.\n");
};
function fixtures(fn) {
  const dir = mkdtempSync(join(tmpdir(), "oauth-readiness-"));
  const c = join(dir, "config.json");
  const m = join(dir, "metadata.json");
  writeFileSync(c, JSON.stringify(config));
  writeFileSync(m, JSON.stringify(metadata));
  try { fn({ dir, c, m, args: ["--config", c, "--metadata", m] }); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("reports consistent metadata without exposing inputs or claiming activation", () => fixtures(({ args }) => {
  const result = run(args);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "metadata_consistent");
  assert.equal(output.activationReady, false);
  assert.equal(output.checks.length, 13);
  assert.ok(output.checks.every((check) => check.passed === true));
  assert.doesNotMatch(result.stdout, /issuer\.example|client-one/);
}));

test("accepts a JSON document at the 64 KiB limit", () => fixtures(({ args, m }) => {
  const json = JSON.stringify(metadata);
  writeFileSync(m, json + " ".repeat(65536 - Buffer.byteLength(json)));
  assert.equal(run(args).status, 0);
}));

test("returns exit 1 and failed checks for incompatible metadata", () => fixtures(({ args, m }) => {
  writeFileSync(m, JSON.stringify({ ...metadata, issuer: "https://other.example/" }));
  const result = run(args);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "metadata_incompatible");
  assert.equal(output.activationReady, false);
  assert.deepEqual(output.checks.find((check) => check.id === "issuer_exact"), { id: "issuer_exact", passed: false });
}));

test("rejects malformed, oversized, non-regular and invalid configuration files safely", () => fixtures(({ dir, c, m, args }) => {
  writeFileSync(m, "secret malformed {");
  failure(run(args));
  writeFileSync(m, "x".repeat(65537));
  failure(run(args));
  writeFileSync(m, JSON.stringify(metadata));
  writeFileSync(c, "x".repeat(65537));
  failure(run(args));
  writeFileSync(c, JSON.stringify({ secret: "private-value" }));
  failure(run(args));
  failure(run(["--config", dir, "--metadata", m]));
  failure(run(["--config", join(dir, "secret-missing"), "--metadata", m]));
}));

test("rejects unknown, duplicate, and incomplete arguments safely", () => fixtures(({ args }) => {
  failure(run([...args, "--unknown", "secret"]));
  failure(run([...args, "--config", "secret"]));
  failure(run(["--config"]));
}));

test("reports a missing compiled dependency safely", () => fixtures(({ dir, args }) => {
  const isolated = join(dir, "api/scripts/check-external-oauth-provider.mjs");
  mkdirSync(dirname(isolated), { recursive: true });
  copyFileSync(script, isolated);
  failure(run(args, isolated));
}));
