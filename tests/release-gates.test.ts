import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

test("play release runs the full release preflight unless explicitly skipped", async () => {
  const script = await readFile("scripts/release-google-play.ps1", "utf8");

  assert.match(script, /Write-Step "Running npm run verify:all"/);
  assert.match(script, /Invoke-Checked "npm" @\("run", "verify:all"\)/);
  assert.match(script, /Skipping full release preflight by request\./);
});

test("ci change detector covers every shipping entry point and shared contract surface", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");

  assert.match(workflow, /index\.html\|spectator\.html\|package\.json\|package-lock\.json/);
  assert.match(workflow, /shared\/\*\|apps\/api\/package\.json\|apps\/api\/package-lock\.json\|apps\/realtime\/package\.json\|apps\/realtime\/package-lock\.json/);
  assert.match(workflow, /apps\/api\/\*\|shared\/\*\|apps\/api\/package\.json\|apps\/api\/package-lock\.json\|package\.json\|package-lock\.json/);
  assert.match(workflow, /apps\/realtime\/\*\|shared\/\*\|apps\/realtime\/package\.json\|apps\/realtime\/package-lock\.json\|package\.json\|package-lock\.json/);
});

test("production deploy path filters include shared contracts and package locks", async () => {
  const apiWorkflow = await readFile(".github/workflows/deploy-api-prod.yml", "utf8");
  assert.match(apiWorkflow, /"apps\/api\/\*\*"/);
  assert.match(apiWorkflow, /"shared\/\*\*"/);
  assert.match(apiWorkflow, /"package\.json"/);
  assert.match(apiWorkflow, /"package-lock\.json"/);
  assert.match(apiWorkflow, /"apps\/api\/package-lock\.json"/);

  const realtimeWorkflow = await readFile(".github/workflows/deploy-realtime-prod.yml", "utf8");
  assert.match(realtimeWorkflow, /"apps\/realtime\/\*\*"/);
  assert.match(realtimeWorkflow, /"shared\/\*\*"/);
  assert.match(realtimeWorkflow, /"package-lock\.json"/);
  assert.match(realtimeWorkflow, /"apps\/realtime\/package-lock\.json"/);

  const pagesWorkflow = await readFile(".github/workflows/deploy-pages.yml", "utf8");
  assert.match(pagesWorkflow, /"index\.html"/);
  assert.match(pagesWorkflow, /"spectator\.html"/);
  assert.match(pagesWorkflow, /"shared\/\*\*"/);
  assert.match(pagesWorkflow, /"scripts\/\*\*"/);
});
