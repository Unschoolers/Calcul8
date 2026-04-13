import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("index.html keeps a stable root manifest link for production installability", () => {
  const indexHtml = readRepoFile("index.html");

  assert.match(indexHtml, /<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"/i);
  assert.doesNotMatch(indexHtml, /href="[^"]*assets\/[^"]*\.webmanifest"/i);
});

test("service worker precache only includes stable root install assets", () => {
  const swSource = readRepoFile("public/sw.js");

  assert.match(swSource, /const CORE_ASSETS = \[[\s\S]*"\.\/"[\s\S]*"\.\/index\.html"[\s\S]*"\.\/manifest\.webmanifest"[\s\S]*\];/);
  assert.doesNotMatch(swSource, /icons\/icon-192\.png|icons\/icon-512\.png|icons\/apple-touch-icon\.png/);
});

test("service worker treats explicit app-update refreshes as fresh navigations with cached fallback", () => {
  const swSource = readRepoFile("public/sw.js");

  assert.match(swSource, /function isUpdateRefreshRequest\(url\)\s*\{\s*return url\.searchParams\.has\("app-updated"\);?\s*\}/);
  assert.match(swSource, /const FRESH_FETCH_TIMEOUT_MS = 8000;/);
  assert.match(swSource, /const cachedPage = await cache\.match\("\.\/index\.html"\);/);
  assert.match(swSource, /if \(isUpdateRefreshRequest\(url\)\) \{[\s\S]*fetchFresh\(request\)[\s\S]*return cachedPage \?\? response \?\? createOfflineResponse\(\);[\s\S]*return cachedPage \?\? createOfflineResponse\(\);[\s\S]*\}/);
});

test("service worker activation claims clients without forcing window navigations", () => {
  const swSource = readRepoFile("public/sw.js");

  assert.match(swSource, /if \(event\.data === "SKIP_WAITING"\) \{\s*self\.skipWaiting\(\);\s*\}/);
  assert.match(swSource, /const staleKeys = keys\.filter\(\(key\) => key !== CACHE_NAME\);/);
  assert.match(swSource, /await self\.clients\.claim\(\);/);
  assert.doesNotMatch(swSource, /client\.navigate\(refreshUrl\)/);
});
