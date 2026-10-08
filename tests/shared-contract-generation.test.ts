import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import ts from "typescript";

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
    const additionalArtifacts = ["apps/api/src/shared/scope-keys.cjs", "apps/realtime/src/shared/workspace-realtime-rooms.cjs"];
    for (const relative of additionalArtifacts) {
      const file = path.join(root, relative);
      writeFileSync(file, readFileSync(file, "utf8") + "\n// stale service artifact\n");
    }
    rmSync(path.join(root, "shared/sync-contracts.d.cts"));
    const stale = spawnSync(process.execPath, [script, "--root", root, "--check"], { encoding: "utf8" });
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /apps\/api\/src\/shared\/sync-contracts\.cjs/u);
    assert.match(stale.stderr, /shared\/sync-contracts\.d\.cts/u);
    for (const relative of additionalArtifacts) assert.ok(stale.stderr.includes(relative));
    assert.equal(readFileSync(artifact, "utf8"), generated + "\n// stale edit\n", "checking must not overwrite edits");
    run();
    assert.equal(readFileSync(artifact, "utf8"), generated);
    run("--check");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);


for (const owner of [
  { contract: "scope-keys", entry: "apps/api/src/lib/scopeKeys.ts", method: "buildEntitlementScopeKey", args: ["user", " alice "], from: "`user:", to: "`canonical-user:", expected: "canonical-user:alice" },
  { contract: "workspace-realtime-rooms", entry: "apps/realtime/src/workspace-realtime-rooms.ts", method: "buildGamePublicSessionRealtimeRoom", args: [" ABC123 "], from: "`wheel-public:", to: "`canonical-public:", expected: "canonical-public:abc123" }
]) {
  test(`${owner.entry} follows regenerated canonical contract changes`, () => {
    const root = mkdtempSync(path.join(tmpdir(), "shared-owner-"));
    try {
      cpSync(fileURLToPath(new URL("../shared/contracts", import.meta.url)), path.join(root, "shared/contracts"), { recursive: true });
      const canonical = path.join(root, "shared/contracts", `${owner.contract}.ts`);
      writeFileSync(canonical, readFileSync(canonical, "utf8").replace(owner.from, owner.to));
      execFileSync(process.execPath, [script, "--root", root], { encoding: "utf8" });
      const entrySource = readFileSync(fileURLToPath(new URL(`../${owner.entry}`, import.meta.url)), "utf8");
      const entry = path.join(root, owner.entry.replace(/\.ts$/u, ".cjs"));
      mkdirSync(path.dirname(entry), { recursive: true });
      writeFileSync(entry, ts.transpileModule(entrySource, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 }
      }).outputText);
      const service = createRequire(import.meta.url)(entry) as Record<string, (...args: unknown[]) => unknown>;
      assert.equal(service[owner.method]?.(...owner.args), owner.expected);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30000);
}
