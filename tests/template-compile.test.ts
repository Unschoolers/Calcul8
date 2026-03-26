import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { compile } from "@vue/compiler-dom";

const ROOT = "f:/Sources/Calcul8";
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
  assert.doesNotThrow(() => new Function(result.code), `${label} should compile into a runtime render function`);
}

function extractIndexAppTemplate(): string {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const start = html.indexOf('<div id="app"');
  const end = html.indexOf('<script src="https://js.stripe.com/v3/"></script>');
  assert.notEqual(start, -1, "index.html should contain the app root");
  assert.notEqual(end, -1, "index.html should contain the Stripe script marker");
  return html.slice(start, end).trim();
}

test("root app template in index.html compiles for the runtime compiler", () => {
  assertTemplateCompiles("index.html#app", extractIndexAppTemplate());
});

test("all raw html component templates compile for the runtime compiler", () => {
  const htmlFiles = collectHtmlFiles(SRC_ROOT);
  assert.ok(htmlFiles.length > 0, "should find component html templates");
  for (const filePath of htmlFiles) {
    const template = fs.readFileSync(filePath, "utf8");
    assertTemplateCompiles(path.relative(ROOT, filePath), template);
  }
});
