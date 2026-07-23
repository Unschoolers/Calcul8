import { spawnSync } from "node:child_process";

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
const result = spawnSync(command, commandArgs, {
  cwd: "apps/android",
  stdio: "inherit",
  shell: false
});

process.exit(result.status ?? 1);
