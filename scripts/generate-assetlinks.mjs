import fs from "node:fs";
import path from "node:path";

function readArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : "";
}

const packageName = readArg("package");
const fingerprint = readArg("fingerprint");

if (!packageName || !fingerprint) {
  console.error(
    "Usage: npm run assetlinks -- --package=com.example.app --fingerprint=AA:BB:...:ZZ"
  );
  process.exit(1);
}

const normalizedFingerprint = fingerprint.toUpperCase();
const sha256FingerprintPattern = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;
if (!sha256FingerprintPattern.test(normalizedFingerprint)) {
  console.error(
    "Invalid fingerprint. Expected SHA-256 format: AA:BB:CC:...:ZZ (32 bytes, colon-separated)."
  );
  process.exit(1);
}

const payload = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: packageName,
      sha256_cert_fingerprints: [normalizedFingerprint]
    }
  }
];

const outputDirs = [path.resolve("public", ".well-known")];

for (const outputDir of outputDirs) {
  const outputFile = path.join(outputDir, "assetlinks.json");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Generated ${outputFile}`);
}
