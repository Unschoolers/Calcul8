import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "vitest";

const scanner = resolve("scripts/security-scan.mjs");

function scanFixture(file: string, content: string, tracked = false) {
  const root = mkdtempSync(join(tmpdir(), "whatfees-security-scan-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    if (tracked) execFileSync("git", ["add", "--", file], { cwd: root });
    return spawnSync(process.execPath, [scanner], { cwd: root, encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test.each([
  "apps/api/test/provider-readiness-cli.test.mjs",
  "apps/api/src/config.test.ts"
])("accepts generic dummy credentials in %s", (file) => {
  const result = scanFixture(file, 'const fixture = { secret: "private-value" };');
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
});

test.each([
  "apps/api/src/config.ts",
  "apps/api/src/config.test.mjs.backup"
])("rejects generic credential assignments outside test files: %s", (file) => {
  const result = scanFixture(file, 'const config = { secret: "private-value" };');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("[Generic assignment (token/secret/password)] " + file);
});

test.each([
  "apps/api/test/provider-readiness-cli.test.mjs",
  "apps/api/src/config.test.ts"
])("still rejects recognizable credential patterns in %s", (file) => {
  const syntheticToken = "gh" + "p_" + "A".repeat(36);
  const result = scanFixture(file, JSON.stringify({ token: syntheticToken }));
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("[GitHub classic token] " + file);
});

test("still rejects private key blocks in Node runtime tests", () => {
  const file = "apps/api/test/config.test.mjs";
  const result = scanFixture(file, "-----BEGIN " + "PRIVATE KEY-----");
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("[Private key block] " + file);
});

test("still rejects tracked signing artifacts", () => {
  const result = scanFixture("release.jks", "synthetic signing artifact", true);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Generated release or signing artifacts must not be tracked:");
  expect(result.stderr).toContain("release.jks");
});
