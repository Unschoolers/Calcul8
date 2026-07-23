import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

test("Capacitor Android is source controlled and targets API 36", async () => {
  const config = await readFile("capacitor.config.ts", "utf8");
  const variables = await readFile("apps/android/variables.gradle", "utf8");

  assert.match(config, /appId:\s*["']io\.whatfees["']/);
  assert.match(config, /webDir:\s*["']dist["']/);
  assert.match(config, /path:\s*["']apps\/android["']/);
  assert.match(config, /hostname:\s*["']app\.whatfees\.ca["']/);
  assert.match(config, /androidScheme:\s*["']https["']/);
  assert.doesNotMatch(config, /server:\s*\{[^}]*url:/s);
  assert.match(variables, /minSdkVersion\s*=\s*24/);
  assert.match(variables, /compileSdkVersion\s*=\s*36/);
  assert.match(variables, /targetSdkVersion\s*=\s*36/);
});

test("Android pins Google Play Billing 8.3.0", async () => {
  const appGradle = await readFile("apps/android/app/build.gradle", "utf8");
  assert.match(appGradle, /com\.android\.billingclient:billing:8\.3\.0/);
  assert.doesNotMatch(appGradle, /com\.google\.androidbrowserhelper:billing/);
});
