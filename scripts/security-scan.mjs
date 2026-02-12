import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "android",
  ".bubblewrap"
]);

const IGNORE_FILES = new Set([
  "package-lock.json"
]);

const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1 MB

const DETECTORS = [
  { name: "Private key block", regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
  { name: "GitHub classic token", regex: /\bghp_[A-Za-z0-9]{20,}\b/g },
  { name: "GitHub fine-grained token", regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "AWS access key id", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "Google API key", regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { name: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "Generic assignment (token/secret/password)", regex: /\b(?:api[_-]?key|token|secret|password|client[_-]?secret)\s*[:=]\s*["'][^"']{8,}["']/gi }
];

function isLikelyText(buffer) {
  // If a NUL byte exists, treat as binary.
  return !buffer.includes(0);
}

function walk(dir, results) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".DS_Store")) continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(ROOT, fullPath).replaceAll("\\", "/");

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walk(fullPath, results);
      continue;
    }

    if (IGNORE_FILES.has(entry.name)) continue;

    const stat = fs.statSync(fullPath);
    if (stat.size > MAX_FILE_SIZE_BYTES) continue;

    const buffer = fs.readFileSync(fullPath);
    if (!isLikelyText(buffer)) continue;
    const content = buffer.toString("utf8");

    for (const detector of DETECTORS) {
      detector.regex.lastIndex = 0;
      if (detector.regex.test(content)) {
        results.push({ file: relPath, detector: detector.name });
      }
    }
  }
}

const findings = [];
walk(ROOT, findings);

if (findings.length > 0) {
  console.error("Potential secret exposures found:");
  for (const finding of findings) {
    console.error(`- [${finding.detector}] ${finding.file}`);
  }
  process.exit(1);
}

console.log("Security scan passed: no obvious secrets detected.");
