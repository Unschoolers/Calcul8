import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const uiMethodsDir = join(repoRoot, "src", "app-core", "methods", "ui");

describe("frontend UI method domain layout", () => {
  it("keeps implementation files grouped under domain folders", () => {
    const entries = readdirSync(uiMethodsDir);
    const rootFiles = entries.filter((entry) => statSync(join(uiMethodsDir, entry)).isFile());
    const folders = entries.filter((entry) => statSync(join(uiMethodsDir, entry)).isDirectory()).sort();

    expect(rootFiles).toEqual([]);
    expect(folders).toEqual([
      "auth",
      "buyers",
      "common",
      "entitlements",
      "spectator",
      "sync",
      "whatnot",
      "workspace"
    ]);
  });
});
