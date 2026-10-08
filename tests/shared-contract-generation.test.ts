import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const script = fileURLToPath(new URL("../scripts/generate-shared-contracts.mjs", import.meta.url));

test("contract generation is deterministic and detects stale or missing runtime and declaration artifacts", () => {
  const root = mkdtempSync(path.join(tmpdir(), "shared-contracts-"));
  try {
    cpSync(fileURLToPath(new URL("../shared/contracts", import.meta.url)), path.join(root, "shared/contracts"), { recursive: true });
    const run = (...args: string[]) => execFileSync(process.execPath, [script, "--root", root, ...args], { encoding: "utf8" });
    run();
    const artifact = path.join(root, "apps/api/src/shared/sync-contracts.cjs");
    const generated = readFileSync(artifact, "utf8");
    const api = createRequire(import.meta.url)(artifact) as typeof import("../shared/sync-contracts");
    const normalized = api.normalizeSyncGameSessionDto({ wheelPendingInventoryIssues: [{
      pendingSaleLotId: 7, pendingSale: { id: 777, type: "wheel", mutationId: "retry-777" }
    }] }, 999);
    assert.deepEqual(normalized.wheelPendingInventoryIssues[0]?.pendingSale,
      { id: 777, type: "wheel", mutationId: "retry-777" });
    writeFileSync(artifact, generated + "\n// stale edit\n");
    rmSync(path.join(root, "shared/sync-contracts.d.cts"));
    const stale = spawnSync(process.execPath, [script, "--root", root, "--check"], { encoding: "utf8" });
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /apps\/api\/src\/shared\/sync-contracts\.cjs/u);
    assert.match(stale.stderr, /shared\/sync-contracts\.d\.cts/u);
    assert.equal(readFileSync(artifact, "utf8"), generated + "\n// stale edit\n", "checking must not overwrite edits");
    run();
    assert.equal(readFileSync(artifact, "utf8"), generated);
    run("--check");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);
