import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "vitest";

const securityScanPath = path.resolve("scripts/security-scan.mjs");

function runGit(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function withTemporaryGitRepository(
  run: (repositoryPath: string) => Promise<void>
): Promise<void> {
  const repositoryPath = await mkdtemp(path.join(tmpdir(), "whatfees-artifact-hygiene-"));
  try {
    runGit(repositoryPath, ["init", "--quiet"]);
    await run(repositoryPath);
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
}

test("play release runs the full release preflight unless explicitly skipped", async () => {
  const script = await readFile("scripts/release-google-play.ps1", "utf8");

  assert.match(script, /Write-Step "Running npm run verify:all"/);
  assert.match(script, /Invoke-Checked "npm" @\("run", "verify:all"\)/);
  assert.match(script, /Skipping full release preflight by request\./);
});

test("ci change detector covers every shipping entry point and shared contract surface", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");

  assert.match(workflow, /index\.html\|spectator\.html\|package\.json\|package-lock\.json/);
  assert.match(workflow, /shared\/\*\|apps\/api\/package\.json\|apps\/api\/package-lock\.json\|apps\/realtime\/package\.json\|apps\/realtime\/package-lock\.json/);
  assert.match(workflow, /apps\/api\/\*\|shared\/\*\|apps\/api\/package\.json\|apps\/api\/package-lock\.json\|package\.json\|package-lock\.json/);
  assert.match(workflow, /apps\/realtime\/\*\|shared\/\*\|apps\/realtime\/package\.json\|apps\/realtime\/package-lock\.json\|package\.json\|package-lock\.json/);
});

test("production deploy path filters include shared contracts and package locks", async () => {
  const apiWorkflow = await readFile(".github/workflows/deploy-api-prod.yml", "utf8");
  assert.match(apiWorkflow, /"apps\/api\/\*\*"/);
  assert.match(apiWorkflow, /"shared\/\*\*"/);
  assert.match(apiWorkflow, /"package\.json"/);
  assert.match(apiWorkflow, /"package-lock\.json"/);
  assert.match(apiWorkflow, /"apps\/api\/package-lock\.json"/);

  const realtimeWorkflow = await readFile(".github/workflows/deploy-realtime-prod.yml", "utf8");
  assert.match(realtimeWorkflow, /"apps\/realtime\/\*\*"/);
  assert.match(realtimeWorkflow, /"shared\/\*\*"/);
  assert.match(realtimeWorkflow, /"package-lock\.json"/);
  assert.match(realtimeWorkflow, /"apps\/realtime\/package-lock\.json"/);

  const pagesWorkflow = await readFile(".github/workflows/deploy-pages.yml", "utf8");
  assert.match(pagesWorkflow, /"index\.html"/);
  assert.match(pagesWorkflow, /"spectator\.html"/);
  assert.match(pagesWorkflow, /"shared\/\*\*"/);
  assert.match(pagesWorkflow, /"scripts\/\*\*"/);
});

test("security scan rejects staged generated release and signing artifacts", async () => {
  await withTemporaryGitRepository(async (repositoryPath) => {
    const forbiddenPaths = [
      "app-release.apk",
      "app-release.aab",
      "app-release.apk.idsig",
      "upload.jks",
      "upload.keystore",
      "upload.p12",
      "upload.pem",
      "upload.key",
      "keystore.properties",
      "play-credentials.json",
      "service-account-production.json"
    ];

    for (const relativePath of forbiddenPaths) {
      await writeFile(path.join(repositoryPath, relativePath), "generated release material");
    }
    runGit(repositoryPath, ["add", "--force", "--", ...forbiddenPaths]);

    const result = spawnSync(process.execPath, [securityScanPath], {
      cwd: repositoryPath,
      encoding: "utf8"
    });

    assert.notEqual(result.status, 0);
    for (const relativePath of forbiddenPaths) {
      assert.match(result.stderr, new RegExp(relativePath.replaceAll(".", "\\.")));
    }
  });
});

test("security scan allows the tracked Digital Asset Links source file", async () => {
  await withTemporaryGitRepository(async (repositoryPath) => {
    const assetLinksDirectory = path.join(repositoryPath, "public", ".well-known");
    await mkdir(assetLinksDirectory, { recursive: true });
    await writeFile(path.join(assetLinksDirectory, "assetlinks.json"), "[]");
    runGit(repositoryPath, ["add", "--force", "--", "public/.well-known/assetlinks.json"]);

    const result = spawnSync(process.execPath, [securityScanPath], {
      cwd: repositoryPath,
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});
