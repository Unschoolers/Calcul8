import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DEFAULT_COUNT = 20;
const MAX_COUNT = 100;
const DEFAULT_TIMEOUT_MS = 15_000;
const MUTATION_PREFIX = "runtime-validation";

function requiredString(env, name) {
  const value = String(env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function positiveInteger(raw, fallback, max, name) {
  if (raw == null || String(raw).trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer from 1 through ${max}.`);
  }
  return value;
}

function normalizeLoopbackBase(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("RUNTIME_VALIDATION_API_BASE must be a local http(s) API URL.");
  }
  const host = url.hostname.toLowerCase();
  if (!(["127.0.0.1", "localhost", "[::1]"].includes(host)) || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("RUNTIME_VALIDATION_API_BASE must use a loopback host (localhost, 127.0.0.1, or ::1).");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("RUNTIME_VALIDATION_API_BASE cannot include credentials, query, or fragment data.");
  }
  return url.toString().replace(/\/$/, "");
}

export function resolveSalesValidationConfig({ env = process.env } = {}) {
  if (String(env.RUNTIME_VALIDATION_TARGET ?? "").trim().toLowerCase() !== "nonproduction") {
    throw new Error("Set RUNTIME_VALIDATION_TARGET=nonproduction to confirm this run targets an isolated nonproduction Cosmos database.");
  }
  const apiBase = normalizeLoopbackBase(requiredString(env, "RUNTIME_VALIDATION_API_BASE"));
  const fixtureFile = String(env.RUNTIME_VALIDATION_FIXTURES_FILE ?? "").trim();
  const hasFixtureFile = Boolean(fixtureFile);
  let fixtures;
  if (fixtureFile) {
    let rows;
    try { rows = JSON.parse(readFileSync(fixtureFile, "utf8")); }
    catch { throw new Error("RUNTIME_VALIDATION_FIXTURES_FILE must point to a readable JSON array of nonproduction fixture credentials."); }
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_COUNT) {
      throw new Error(`RUNTIME_VALIDATION_FIXTURES_FILE must contain 1 through ${MAX_COUNT} user fixtures.`);
    }
    fixtures = rows.map((row, index) => {
      const cookie = String(row?.cookie ?? "").trim();
      const csrfToken = String(row?.csrfToken ?? "").trim();
      const lotId = String(row?.lotId ?? "").trim();
      if (!cookie || !csrfToken || !/^[A-Za-z0-9:_-]{1,128}$/.test(lotId)
        || /[\r\n]/.test(cookie) || /[\r\n]/.test(csrfToken)) {
        throw new Error(`Fixture entry ${index + 1} requires a session cookie, CSRF token, and simple lot identifier.`);
      }
      return { cookie, csrfToken, lotId };
    });
  } else {
    const cookie = requiredString(env, "RUNTIME_VALIDATION_SESSION_COOKIE");
    const csrfToken = requiredString(env, "RUNTIME_VALIDATION_CSRF_TOKEN");
    const lotId = requiredString(env, "RUNTIME_VALIDATION_LOT_ID");
    if (!/^[A-Za-z0-9:_-]{1,128}$/.test(lotId)) throw new Error("RUNTIME_VALIDATION_LOT_ID must be a simple lot identifier.");
    if (/[\r\n]/.test(cookie) || /[\r\n]/.test(csrfToken)) throw new Error("Session and CSRF values cannot contain line breaks.");
    fixtures = [{ cookie, csrfToken, lotId }];
  }
  const count = positiveInteger(env.RUNTIME_VALIDATION_COUNT, hasFixtureFile ? fixtures.length : DEFAULT_COUNT, MAX_COUNT, "RUNTIME_VALIDATION_COUNT");
  if (hasFixtureFile && count !== fixtures.length) {
    throw new Error("With a fixture file, RUNTIME_VALIDATION_COUNT must equal the fixture count (one request per user).");
  }
  return {
    apiBase,
    ...fixtures[0],
    fixtures,
    count,
    timeoutMs: positiveInteger(env.RUNTIME_VALIDATION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 60_000, "RUNTIME_VALIDATION_TIMEOUT_MS")
  };
}

function routeUrl(apiBase, lotId) {
  return `${apiBase}/api/lots/${encodeURIComponent(lotId)}/sales`;
}

async function requestJson(fetchImpl, url, { method = "GET", headers, body, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method,
      headers,
      redirect: "error",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal
    });
    let data = null;
    try { data = await response.json(); } catch { /* Status is reported without leaking response payloads. */ }
    return { status: response.status, ok: response.ok, data };
  } finally {
    clearTimeout(timeout);
  }
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

export async function runSalesValidation({ config, fetchImpl = globalThis.fetch, idPrefix = `${MUTATION_PREFIX}-${randomUUID()}` }) {
  if (!config || typeof fetchImpl !== "function") throw new Error("A validated config and fetch implementation are required.");
  const headers = {
    "content-type": "application/json",
    cookie: config.cookie,
    "x-csrf-token": config.csrfToken
  };
  const attempts = Array.from({ length: config.count }, (_, index) => ({
    id: `${idPrefix}-${index + 1}`,
    mutationId: `${idPrefix}-mutation-${index + 1}`,
    fixture: config.fixtures?.[index] ?? config
  }));
  const startedAt = Date.now();
  const durations = [];
  let created = 0;
  let verified = 0;
  let cleaned = 0;
  let failed = 0;
  let cleanupFailed = 0;
  let verificationStatus = 0;
  await Promise.all(attempts.map(async ({ id, mutationId, fixture }) => {
    const started = Date.now();
    try {
      const fixtureUrl = routeUrl(config.apiBase, fixture.lotId);
      const fixtureHeaders = { ...headers, cookie: fixture.cookie, "x-csrf-token": fixture.csrfToken };
      const result = await requestJson(fetchImpl, fixtureUrl, {
        method: "POST",
        headers: fixtureHeaders,
        timeoutMs: config.timeoutMs,
        body: {
          sale: { id, type: "wheel", quantity: 0, packsCount: 0, price: 0, date: new Date().toISOString().slice(0, 10) },
          mutationId
        }
      });
      durations.push(Date.now() - started);
      if (!result.ok || result.data?.ok !== true || String(result.data?.sale?.id) !== id) {
        return { id, ok: false };
      }
      created += 1;
      return { id, ok: true };
    } catch {
      durations.push(Date.now() - started);
      return { id, ok: false };
    }
  }));

  const grouped = new Map();
  for (const attempt of attempts) {
    const fixture = attempt.fixture;
    const key = `${fixture.cookie}\u0000${fixture.lotId}`;
    const group = grouped.get(key) ?? { fixture, attempts: [] };
    group.attempts.push(attempt);
    grouped.set(key, group);
  }
  const listedById = new Map();
  for (const { fixture, attempts: groupAttempts } of grouped.values()) {
    try {
      const list = await requestJson(fetchImpl, routeUrl(config.apiBase, fixture.lotId), {
        headers: { ...headers, cookie: fixture.cookie, "x-csrf-token": fixture.csrfToken },
        timeoutMs: config.timeoutMs
      });
      verificationStatus = list.status;
      const listedIds = list.ok && Array.isArray(list.data?.sales)
        ? new Set(list.data.sales.map((sale) => String(sale?.id ?? "")))
        : new Set();
      for (const { id } of groupAttempts) listedById.set(id, listedIds.has(id));
    } catch {
      for (const { id } of groupAttempts) listedById.set(id, false);
    }
  }
  verified = attempts.filter(({ id }) => listedById.get(id)).length;
  failed = attempts.length - verified;

  // Re-read before cleanup so a response lost after commit is still recoverable.
  for (const { fixture, attempts: groupAttempts } of grouped.values()) {
    let currentById = new Map();
    try {
      const list = await requestJson(fetchImpl, routeUrl(config.apiBase, fixture.lotId), {
        headers: { ...headers, cookie: fixture.cookie, "x-csrf-token": fixture.csrfToken },
        timeoutMs: config.timeoutMs
      });
      if (!list.ok || !Array.isArray(list.data?.sales)) {
        cleanupFailed += groupAttempts.length;
        continue;
      }
      currentById = new Map(list.data.sales.map((sale) => [String(sale?.id ?? ""), sale]));
    } catch {
      cleanupFailed += groupAttempts.length;
      continue;
    }
    const fixtureHeaders = { ...headers, cookie: fixture.cookie, "x-csrf-token": fixture.csrfToken };
    for (const { id } of groupAttempts) {
      const sale = currentById.get(id);
      if (!sale) continue;
      try {
        const fixtureUrl = routeUrl(config.apiBase, fixture.lotId);
        const result = await requestJson(fetchImpl, `${fixtureUrl}/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: fixtureHeaders,
          timeoutMs: config.timeoutMs,
          body: { mutationId: `${id}-cleanup`, ...(Number.isSafeInteger(sale.version) ? { baseVersion: sale.version } : {}) }
        });
        if (result.ok && result.data?.ok === true) cleaned += 1;
        else cleanupFailed += 1;
      } catch {
        cleanupFailed += 1;
      }
    }
  }

  return {
    requested: config.count,
    created,
    verified,
    cleaned,
    failed,
    cleanupFailed,
    verificationStatus,
    elapsedMs: Date.now() - startedAt,
    requestLatencyMs: { p50: percentile(durations, 0.5), p95: percentile(durations, 0.95), max: Math.max(0, ...durations) }
  };
}

async function main() {
  const config = resolveSalesValidationConfig();
  const summary = await runSalesValidation({ config });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.failed || summary.cleanupFailed || summary.created !== config.count || summary.verified !== config.count || summary.cleaned !== summary.created) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message ?? "Validation could not start.")}\n`);
    process.exitCode = 1;
  });
}
