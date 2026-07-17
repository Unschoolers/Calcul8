import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vitest";

const scriptPath = path.resolve("scripts/obfuscate.mjs");

function writeAsset(root: string, fileName: string, source: string): string {
  const filePath = path.join(root, "dist", "assets", fileName);
  writeFileSync(filePath, source, "utf8");
  return filePath;
}

// This is an end-to-end CLI check. Loading javascript-obfuscator in the child
// process can exceed Vitest's default timeout when CI workers contend for CPU.
test("release obfuscation skips third-party chunks but obfuscates app chunks", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "whatfees-obfuscate-"));
  const assetsDir = path.join(tempRoot, "dist", "assets");
  mkdirSync(assetsDir, { recursive: true });

  const vendorSource = "function vendorChunk(){return 'stable vendor code';} console.log(vendorChunk());";
  const vuetifySource = "function vuetifyChunk(){return 'stable vuetify code';} console.log(vuetifyChunk());";
  const chartJsSource = "function chartJsChunk(){return 'stable chartjs code';} console.log(chartJsChunk());";
  const appSource = "function appOwnedChunk(){const privateValue = 'alpha'; return privateValue.repeat(2);} console.log(appOwnedChunk());";

  const vendorPath = writeAsset(tempRoot, "vendor-test.js", vendorSource);
  const vuetifyPath = writeAsset(tempRoot, "vuetify-test.js", vuetifySource);
  const chartJsPath = writeAsset(tempRoot, "chartjs-test.js", chartJsSource);
  const appPath = writeAsset(tempRoot, "app-core-test.js", appSource);

  try {
    const output = execFileSync(process.execPath, [scriptPath], {
      cwd: tempRoot,
      encoding: "utf8"
    });

    assert.equal(readFileSync(vendorPath, "utf8"), vendorSource);
    assert.equal(readFileSync(vuetifyPath, "utf8"), vuetifySource);
    assert.equal(readFileSync(chartJsPath, "utf8"), chartJsSource);
    assert.notEqual(readFileSync(appPath, "utf8"), appSource);
    assert.match(output, /Skipped vendor-test\.js/);
    assert.match(output, /Skipped vuetify-test\.js/);
    assert.match(output, /Skipped chartjs-test\.js/);
    assert.match(output, /Obfuscated app-core-test\.js/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}, 15_000);
