import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { compile } from "@vue/compiler-dom";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TESTS_DIR, "..");
const SRC_ROOT = path.join(ROOT, "src");

function collectHtmlFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectHtmlFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(fullPath);
    }
  }
  return files;
}

function assertTemplateCompiles(label: string, template: string): void {
  const result = compile(template, { mode: "function" });
  assert.doesNotThrow(() => new Function(result.code), `${label} should compile into a render function`);
}

test("all external html templates compile", () => {
  const htmlFiles = collectHtmlFiles(SRC_ROOT);
  assert.ok(htmlFiles.length > 0, "should find component html templates");
  for (const filePath of htmlFiles) {
    const template = fs.readFileSync(filePath, "utf8");
    assertTemplateCompiles(path.relative(ROOT, filePath), template);
  }
});
