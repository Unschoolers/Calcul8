import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packagePath = path.join(root, "package.json");
const versionPath = path.join(root, "apps", "android", "version.properties");

const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const nextName = String(packageJson.version ?? "").trim();
if (!nextName) throw new Error("Root package.json has no valid version.");

const existing = fs.existsSync(versionPath)
  ? fs.readFileSync(versionPath, "utf8")
  : "";
const currentName = existing.match(/^VERSION_NAME=(.+)$/m)?.[1]?.trim() ?? "";
const currentCode = Number(existing.match(/^VERSION_CODE=(\d+)$/m)?.[1] ?? "0");
const nextCode = currentName === nextName && currentCode > 0
  ? currentCode
  : Math.max(0, currentCode) + 1;

fs.writeFileSync(
  versionPath,
  `VERSION_NAME=${nextName}\nVERSION_CODE=${nextCode}\n`,
  "utf8"
);
console.log(`Android version synced: ${nextName} (${nextCode})`);
