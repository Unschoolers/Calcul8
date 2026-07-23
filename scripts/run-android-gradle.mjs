import { spawnSync } from "node:child_process";
import { resolveAndroidBuildEnvironment } from "./android-build-env.mjs";

const wrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const gradleArgs = process.argv.slice(2);
const unsafeArgument = gradleArgs.find((argument) => !/^[A-Za-z0-9_.:=/-]+$/.test(argument));
if (unsafeArgument) {
  console.error(`Refusing unsafe Gradle argument: ${unsafeArgument}`);
  process.exit(2);
}

const command = process.platform === "win32"
  ? (process.env.ComSpec || "cmd.exe")
  : wrapper;
const commandArgs = process.platform === "win32"
  ? ["/d", "/s", "/c", wrapper, ...gradleArgs]
  : gradleArgs;
let buildEnvironment;
try {
  buildEnvironment = resolveAndroidBuildEnvironment();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
console.log(`Android SDK: ${buildEnvironment.sdkPath}`);
console.log(`Java 21: ${buildEnvironment.javaHome}`);
const result = spawnSync(command, commandArgs, {
  cwd: "apps/android",
  stdio: "inherit",
  shell: false,
  env: buildEnvironment.environment
});

process.exit(result.status ?? 1);
