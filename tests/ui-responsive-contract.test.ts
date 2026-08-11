import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { test } from "vitest";

const sourceRoot = "src";

function collectSourceFiles(root: string, extensions: ReadonlySet<string>): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path, extensions);
    return extensions.has(extname(entry.name)) ? [path.replaceAll("\\", "/")] : [];
  });
}

test("only AppDialogShell owns v-dialog", () => {
  const offenders = collectSourceFiles(sourceRoot, new Set([".html", ".vue"]))
    .filter((path) => /<v-dialog\b/.test(readFileSync(path, "utf8")))
    .map((path) => relative(".", path).replaceAll("\\", "/"));
  assert.deepEqual(offenders, ["src/components/ui/AppDialogShell.html"]);
});

test("only intentional mobile editors own v-bottom-sheet", () => {
  const owners = collectSourceFiles(sourceRoot, new Set([".html", ".vue"]))
    .filter((path) => /<v-bottom-sheet\b/.test(readFileSync(path, "utf8")))
    .map((path) => relative(".", path).replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(owners, [
    "src/components/shell/MobileLotSwitcher.html",
    "src/components/windows/singles/SinglesConfigWindow.html"
  ]);
});

test("responsive layout tokens distinguish navigation and action clearance", () => {
  const tokens = readFileSync("src/styles/design-tokens.css", "utf8");
  for (const name of [
    "--app-shell-content-clearance-nav",
    "--app-shell-content-clearance-actions",
    "--app-sticky-content-top",
    "--app-form-mobile-inline-padding",
    "--app-touch-target-min"
  ]) assert.match(tokens, new RegExp(name));
});

test("feature styles do not encode shell chrome measurements", () => {
  const guarded = [
    "src/components/windows/game/styles/wheel-stage.css",
    "src/components/windows/game/styles/wheel-mobile.css",
    "src/components/windows/singles/SinglesConfigWindow.css",
    "src/components/windows/live/LiveSinglesPanel.css"
  ].map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(guarded, /calc\((?:72px|108px|7rem|2\.7rem|8\.5rem)\s*\+/);
});
