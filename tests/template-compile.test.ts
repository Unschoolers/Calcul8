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

function collectFilesByExtension(dir: string, extension: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesByExtension(fullPath, extension));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(fullPath);
    }
  }
  return files;
}

function assertTemplateCompiles(label: string, template: string): void {
  const result = compile(template, { mode: "function" });
  assert.doesNotThrow(() => new Function(result.code), `${label} should compile into a render function`);
}

test("index.html keeps an empty app mount point", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /<div id="app" v-cloak><\/div>/, "index.html should provide an empty mount point");
});

test("all external html templates compile", () => {
  const htmlFiles = collectHtmlFiles(SRC_ROOT);
  assert.ok(htmlFiles.length > 0, "should find component html templates");
  for (const filePath of htmlFiles) {
    const template = fs.readFileSync(filePath, "utf8");
    assertTemplateCompiles(path.relative(ROOT, filePath), template);
  }
});

test("no raw runtime template imports remain in src", () => {
  const tsFiles = collectFilesByExtension(SRC_ROOT, ".ts");
  const filesWithRawTemplates = tsFiles.filter((filePath) => (
    fs.readFileSync(filePath, "utf8").includes(".html?raw")
  ));
  assert.deepEqual(filesWithRawTemplates, [], "expected all html templates to move off runtime ?raw imports");
});

test("vite config no longer aliases Vue to the compiler build", () => {
  const viteConfig = fs.readFileSync(path.join(ROOT, "vite.config.ts"), "utf8");
  assert.ok(
    !viteConfig.includes("vue/dist/vue.esm-bundler.js"),
    "vite config should not force the runtime compiler build"
  );
});
