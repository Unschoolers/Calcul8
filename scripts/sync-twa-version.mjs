import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");
const twaManifestPath = path.join(rootDir, "twa-manifest.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

if (!fs.existsSync(packageJsonPath)) {
  throw new Error("package.json not found");
}

if (!fs.existsSync(twaManifestPath)) {
  process.exit(0);
}

const appPackage = readJson(packageJsonPath);
const twaManifest = readJson(twaManifestPath);

const nextVersion = String(appPackage.version ?? "").trim();
if (!nextVersion) {
  throw new Error("Root package.json has no valid version");
}

const currentCode = Number(twaManifest.appVersionCode);
const nextCode = Number.isFinite(currentCode) && currentCode > 0 ? currentCode + 1 : 1;

twaManifest.appVersionName = nextVersion;
twaManifest.appVersion = nextVersion;
twaManifest.appVersionCode = nextCode;

writeJson(twaManifestPath, twaManifest);

