import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveAndroidBuildEnvironment } from "./android-build-env.mjs";

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const root = path.resolve(rootIndex >= 0 ? args[rootIndex + 1] : process.cwd());
const skipDependencyInsight = args.includes("--skip-dependency-insight");
const androidRoot = path.join(root, "apps", "android");
const variablesPath = path.join(androidRoot, "variables.gradle");
const appGradlePath = path.join(androidRoot, "app", "build.gradle");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) fail(`Missing Android source file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function readInteger(source, name) {
  const value = Number(source.match(new RegExp(`${name}\\s*=\\s*(\\d+)`))?.[1] ?? "0");
  return Number.isInteger(value) ? value : 0;
}

const variables = readRequired(variablesPath);
const appGradle = readRequired(appGradlePath);
const compileSdk = readInteger(variables, "compileSdkVersion");
const targetSdk = readInteger(variables, "targetSdkVersion");
if (compileSdk < 36) fail("compileSdkVersion must be at least 36.");
if (targetSdk < 36) fail("targetSdkVersion must be at least 36.");

const billing = appGradle.match(
  /com\.android\.billingclient:billing:([0-9]+\.[0-9]+\.[0-9]+)/
)?.[1] ?? "";
if (!billing) fail("Google Play Billing must be declared directly.");
const [billingMajor] = billing.split(".").map(Number);
if (billingMajor < 8) fail("Google Play Billing must be at least 8.0.0.");
if (billing !== "8.3.0") fail(`Google Play Billing must be pinned to 8.3.0; found ${billing}.`);
if (/com\.google\.androidbrowserhelper:billing/.test(appGradle)) {
  fail("Android Browser Helper billing must not be present.");
}

if (!skipDependencyInsight) {
  let buildEnvironment;
  try {
    buildEnvironment = resolveAndroidBuildEnvironment({ root });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const wrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  const gradleArgs = [
    ":app:dependencyInsight",
    "--configuration",
    "releaseRuntimeClasspath",
    "--dependency",
    "com.android.billingclient:billing"
  ];
  const command = process.platform === "win32"
    ? (process.env.ComSpec || "cmd.exe")
    : wrapper;
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", wrapper, ...gradleArgs]
    : gradleArgs;
  const result = spawnSync(
    command,
    commandArgs,
    {
      cwd: androidRoot,
      encoding: "utf8",
      shell: false,
      env: buildEnvironment.environment
    }
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "Gradle dependency inspection failed.\n");
    process.exit(result.status ?? 1);
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (!/com\.android\.billingclient:billing:8\.3\.0/.test(output)) {
    fail("Resolved dependency graph does not contain Billing 8.3.0.");
  }
  if (/com\.google\.androidbrowserhelper:billing/.test(output)) {
    fail("Resolved dependency graph contains Android Browser Helper billing.");
  }
}

console.log(`Android compliance passed: targetSdk=${targetSdk} billing=${billing}`);
