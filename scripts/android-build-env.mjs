import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function uniquePaths(candidates) {
  return [...new Set(
    candidates
      .filter((candidate) => typeof candidate === "string" && candidate.trim())
      .map((candidate) => path.resolve(candidate))
  )];
}

function findJava21Homes(root) {
  if (!root || !fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^jdk-?21/i.test(entry.name))
    .map((entry) => path.join(root, entry.name));
}

function isJava21Home(javaHome, platform) {
  if (!javaHome) return false;
  const executable = path.join(javaHome, "bin", platform === "win32" ? "java.exe" : "java");
  if (!fs.existsSync(executable)) return false;
  const result = spawnSync(executable, ["-version"], {
    encoding: "utf8",
    shell: false
  });
  return result.status === 0
    && /version "21(?:\.|")/.test(`${result.stdout}\n${result.stderr}`);
}

export function resolveAndroidBuildEnvironment(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const sourceEnvironment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;
  const sdkCandidates = [
    sourceEnvironment.ANDROID_HOME,
    sourceEnvironment.ANDROID_SDK_ROOT,
    path.join(root, ".android-sdk"),
    sourceEnvironment.LOCALAPPDATA
      ? path.join(sourceEnvironment.LOCALAPPDATA, "Android", "Sdk")
      : ""
  ];
  const sdkPath = uniquePaths(sdkCandidates).find((candidate) =>
    fs.existsSync(path.join(candidate, "platforms", "android-36", "android.jar"))
  );
  if (!sdkPath) {
    throw new Error(
      "Android SDK Platform 36 was not found. Set ANDROID_HOME or install it in .android-sdk."
    );
  }

  const programFiles = sourceEnvironment.ProgramFiles ?? sourceEnvironment.PROGRAMFILES;
  const javaRoots = programFiles
    ? [
      path.join(programFiles, "Amazon Corretto"),
      path.join(programFiles, "Eclipse Adoptium"),
      path.join(programFiles, "Microsoft")
    ]
    : [];
  const javaCandidates = uniquePaths([
    sourceEnvironment.JAVA_HOME_21_X64,
    sourceEnvironment.JAVA_HOME_21_ARM64,
    sourceEnvironment.JAVA_HOME,
    ...javaRoots.flatMap(findJava21Homes)
  ]);
  const javaHome = javaCandidates.find((candidate) => isJava21Home(candidate, platform));
  if (!javaHome) {
    throw new Error(
      "Java 21 was not found. Install JDK 21 or set JAVA_HOME to its installation directory."
    );
  }

  const pathKey = Object.keys(sourceEnvironment)
    .find((key) => key.toLowerCase() === "path") ?? "PATH";
  const executablePath = path.join(javaHome, "bin");
  return {
    sdkPath,
    javaHome,
    environment: {
      ...sourceEnvironment,
      ANDROID_HOME: sdkPath,
      ANDROID_SDK_ROOT: sdkPath,
      JAVA_HOME: javaHome,
      [pathKey]: `${executablePath}${path.delimiter}${sourceEnvironment[pathKey] ?? ""}`
    }
  };
}
