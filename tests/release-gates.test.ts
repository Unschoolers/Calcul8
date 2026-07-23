import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "vitest";

const securityScanPath = path.resolve("scripts/security-scan.mjs");
const androidCompliancePath = path.resolve("scripts/verify-android-compliance.mjs");

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

  assert.match(script, /Join-Path \$RepoRoot "\.android-sdk"/);
  assert.match(script, /platforms\/android-36\/android\.jar/);
  assert.match(script, /\$env:ANDROID_HOME = \$sdkPath/);
  assert.match(script, /\$env:ANDROID_SDK_ROOT = \$sdkPath/);
  assert.match(script, /Java 21/);
  assert.match(script, /Write-Step "Running npm run verify:all"/);
  assert.match(script, /Invoke-Checked "npm" @\("run", "verify:all"\)/);
  assert.match(script, /Invoke-Checked "npm" @\("version", "patch", "--no-git-tag-version"\)/);
  assert.match(script, /Skipping full release preflight by request\./);
});

test("play release builds the source-controlled Capacitor bundle", async () => {
  const script = await readFile("scripts/release-google-play.ps1", "utf8");

  assert.match(script, /sync-capacitor-version\.mjs/);
  assert.match(script, /verify-android-compliance\.mjs/);
  assert.match(script, /gradlew\.bat/);
  assert.match(script, /bundleRelease/);
  assert.match(script, /Missing Android signing propert/);
  assert.match(script, /Require-Command "jarsigner"/);
  assert.match(script, /function Assert-BundleSignature/);
  assert.match(script, /jarsigner -verify -strict \$Path/);
  assert.match(script, /\$verificationExitCode -eq 4/);
  assert.match(script, /signer certificate is self-signed/);
  assert.match(script, /Assert-BundleSignature \$bundlePath/);
  assert.doesNotMatch(script, /Get-BubblewrapCommand/);
  assert.doesNotMatch(script, /bubblewrap build/);
});

test("Android compliance guard rejects stale SDK and Billing versions", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "whatfees-android-compliance-"));
  try {
    const androidDir = path.join(fixture, "apps", "android");
    const appDir = path.join(androidDir, "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      path.join(androidDir, "variables.gradle"),
      "ext { compileSdkVersion = 36\\n targetSdkVersion = 35\\n }\\n"
    );
    await writeFile(
      path.join(appDir, "build.gradle"),
      'dependencies { implementation "com.android.billingclient:billing:7.1.1" }\\n'
    );

    const rejected = spawnSync(
      process.execPath,
      [androidCompliancePath, "--root", fixture, "--skip-dependency-insight"],
      { encoding: "utf8" }
    );
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /targetSdkVersion must be at least 36/);

    await writeFile(
      path.join(androidDir, "variables.gradle"),
      "ext { compileSdkVersion = 36\\n targetSdkVersion = 36\\n }\\n"
    );
    await writeFile(
      path.join(appDir, "build.gradle"),
      'dependencies { implementation "com.android.billingclient:billing:8.3.0" }\\n'
    );
    const accepted = spawnSync(
      process.execPath,
      [androidCompliancePath, "--root", fixture, "--skip-dependency-insight"],
      { encoding: "utf8" }
    );
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /targetSdk=36 billing=8\.3\.0/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("ci change detector covers every shipping entry point and shared contract surface", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");

  assert.match(workflow, /index\.html\|spectator\.html\|package\.json\|package-lock\.json/);
  assert.match(workflow, /shared\/\*\|apps\/api\/package\.json\|apps\/api\/package-lock\.json\|apps\/realtime\/package\.json\|apps\/realtime\/package-lock\.json/);
  assert.match(workflow, /apps\/api\/\*\|shared\/\*\|apps\/api\/package\.json\|apps\/api\/package-lock\.json\|package\.json\|package-lock\.json/);
  assert.match(workflow, /apps\/realtime\/\*\|shared\/\*\|apps\/realtime\/package\.json\|apps\/realtime\/package-lock\.json\|package\.json\|package-lock\.json/);
});

test("ci validates Android API and Billing declarations without building the app", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");

  assert.match(workflow, /android:\s*\$\{\{ steps\.filter\.outputs\.android \}\}/);
  assert.match(workflow, /apps\/android\/\*/);
  assert.match(
    workflow,
    /node scripts\/verify-android-compliance\.mjs --skip-dependency-insight/
  );
  assert.doesNotMatch(workflow, /android-actions\/setup-android/);
  assert.doesNotMatch(workflow, /npx cap sync android/);
  assert.doesNotMatch(workflow, /npm run verify:android/);
  assert.doesNotMatch(workflow, /npm run android:bundle/);
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

test("Google Play release guide documents the Capacitor compliance path", async () => {
  const releaseGuide = await readFile("docs/google-play-release.md", "utf8");

  assert.match(releaseGuide, /Capacitor 8\.4\.0/);
  assert.match(releaseGuide, /targetSdkVersion 36/);
  assert.match(releaseGuide, /Billing 8\.3\.0/);
  assert.match(releaseGuide, /npm run verify:android/);
  assert.doesNotMatch(releaseGuide, /bubblewrap build/);
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
