import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import packageJson from "../package.json" with { type: "json" };

const rootDir = path.resolve(import.meta.dirname, "..");
const swPath = path.join(rootDir, "dist", "sw.js");
const appVersionPath = path.join(rootDir, "dist", "app-version.json");
const appVersion = String(packageJson.version ?? "").trim() || "0.0.0";
const sourceLine = 'const swVersion = new URL(self.location.href).searchParams.get("v") || "dev";';
const stampedLine = `const swVersion = ${JSON.stringify(appVersion)};`;

const swSource = await readFile(swPath, "utf8");
if (!swSource.includes(sourceLine)) {
  throw new Error(`Could not find service worker version placeholder in ${swPath}.`);
}

await writeFile(swPath, swSource.replace(sourceLine, stampedLine), "utf8");
await writeFile(appVersionPath, `${JSON.stringify({ version: appVersion }, null, 2)}\n`, "utf8");
