import fs from "node:fs";
import path from "node:path";
import JavaScriptObfuscator from "javascript-obfuscator";

const distAssetsDir = path.resolve("dist", "assets");

if (!fs.existsSync(distAssetsDir)) {
  console.error("dist/assets not found. Run build first.");
  process.exit(1);
}

const files = fs
  .readdirSync(distAssetsDir)
  .filter((file) => file.endsWith(".js"));

const skipChunkPrefixes = [
  "vendor-",
  "vuetify-",
  "chartjs-"
];

function shouldSkipObfuscation(file) {
  return skipChunkPrefixes.some((prefix) => file.startsWith(prefix));
}

for (const file of files) {
  if (shouldSkipObfuscation(file)) {
    console.log(`Skipped ${file}`);
    continue;
  }

  const fullPath = path.join(distAssetsDir, file);
  const source = fs.readFileSync(fullPath, "utf8");
  const result = JavaScriptObfuscator.obfuscate(source, {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    renameGlobals: false,
    stringArray: true,
    stringArrayThreshold: 0.75,
    sourceMap: false
  });
  fs.writeFileSync(fullPath, result.getObfuscatedCode(), "utf8");
  console.log(`Obfuscated ${file}`);
}
