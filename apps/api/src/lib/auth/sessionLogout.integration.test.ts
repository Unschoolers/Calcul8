import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, test, vi } from "vitest";
import type { HttpRequest } from "@azure/functions";
import type { ApiConfig, RefreshSessionDocument, SessionDocument } from "../../types";

const { rows, events, hooks } = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  events: [] as string[],
  hooks: {
    missFamilyQueryOnce: false,
    rejectFamilyReplaceCount: 0,
    staleSessionReadOnce: false,
    failDeleteIdOnce: "",
    rotateBeforeDeleteForIdOnce: ""
  }
}));

function notFound(): Error & { statusCode: number } {
  return Object.assign(new Error("Not found"), { statusCode: 404 });
}

function getContainers() {
  const sessions = {
    items: {
      create: async <T extends { id: string }>(value: T) => {
        if (rows.has(value.id)) throw Object.assign(new Error("Conflict"), { statusCode: 409 });
        const saved = { ...value, _etag: `e${Date.now()}-${Math.random()}` };
        rows.set(value.id, saved);
        return { resource: saved };
      },
      upsert: async <T extends { id: string }>(value: T) => {
        const saved = { ...value, _etag: `e${Date.now()}-${Math.random()}` };
        rows.set(value.id, saved);
        return { resource: saved };
      },
      query: <T>(spec: { query: string; parameters: Array<{ name: string; value: unknown }> }) => ({
        fetchAll: async () => {
          if (spec.query.includes("previousSessionId") && hooks.missFamilyQueryOnce) {
            hooks.missFamilyQueryOnce = false;
            return { resources: [] as T[] };
          }
          const args = new Map(spec.parameters.map(({ name, value }) => [name, value]));
          const resources = [...rows.values()].filter((row) => {
            if (row.docType !== args.get("@docType")) return false;
            if (args.has("@userId") && row.userId !== args.get("@userId")) return false;
            if (args.has("@refreshFamilyId") && row.refreshFamilyId !== args.get("@refreshFamilyId")) return false;
            const sessionId = args.get("@sessionId");
            if (typeof sessionId === "string" && row.sessionId !== sessionId && row.previousSessionId !== sessionId) return false;
            return true;
          });
          return { resources: resources as T[] };
        }
      })
    },
    item: (id: string) => ({
      read: async <T>() => {
        const resource = rows.get(id);
        if (!resource) throw notFound();
        if (id === "access-old" && hooks.staleSessionReadOnce) {
          hooks.staleSessionReadOnce = false;
          const stale = { ...resource, refreshFamilyId: undefined };
          return { resource: stale as T };
        }
        return { resource: { ...resource } as T };
      },
      replace: async <T extends { id: string }>(value: T, options?: { accessCondition?: { condition?: string } }) => {
        const existing = rows.get(id);
        if (!existing) throw notFound();
        if (options?.accessCondition?.condition !== existing._etag) {
          throw Object.assign(new Error("Precondition failed"), { statusCode: 412 });
        }
        if (id === "family-1" && hooks.rejectFamilyReplaceCount > 0) {
          hooks.rejectFamilyReplaceCount -= 1;
          rows.set(id, { ...existing, lastUsedAt: new Date().toISOString(), _etag: `raced-${hooks.rejectFamilyReplaceCount}` });
          throw Object.assign(new Error("Concurrent replacement"), { statusCode: 412 });
        }
        const saved = { ...value, _etag: `e${Date.now()}-${Math.random()}` };
        rows.set(id, saved);
        events.push(`replace:${id}:${(saved as Record<string, unknown>).docType}`);
        return { resource: saved };
      },
      delete: async (options?: { accessCondition?: { condition?: string } }) => {
        if (!rows.has(id)) throw notFound();
        if (hooks.rotateBeforeDeleteForIdOnce === id) {
          hooks.rotateBeforeDeleteForIdOnce = "";
          await linkSessionToRefreshFamily(config(), { sessionId: id, refreshFamilyId: "family-1", userId: "owner-1" });
          await seed(session("access-race-successor", { refreshFamilyId: "family-1" }));
          await rotateRefreshSession(config(), {
            refreshSessionId: "family-1", expectedTokenHash: createHash("sha256").update(SECRET).digest("hex"),
            tokenHash: NEXT_SECRET_HASH, sessionId: "access-race-successor", lastUsedAt: new Date().toISOString()
          });
        }
        if (hooks.failDeleteIdOnce === id) {
          hooks.failDeleteIdOnce = "";
          throw new Error("Injected delete failure");
        }
        if (options?.accessCondition?.condition !== undefined && options.accessCondition.condition !== rows.get(id)?._etag) {
          throw Object.assign(new Error("Precondition failed"), { statusCode: 412 });
        }
        events.push(`delete:${id}`);
        rows.delete(id);
      }
    })
  };
  return { sessions };
}

vi.mock("../cosmos/core", () => ({
  getContainers,
  isConflictError: (error: unknown) => (error as { statusCode?: number })?.statusCode === 409,
  isNotFoundError: (error: unknown) => (error as { statusCode?: number })?.statusCode === 404,
  isPreconditionFailedError: (error: unknown) => (error as { statusCode?: number })?.statusCode === 412,
  withCosmosRetry: <T>(operation: () => Promise<T>) => operation()
}));

import { consumeAuthResponseCookies, refreshSessionFromRequest, resolveUserId, revokeSessionFromRequest } from "./index";
import { authLogout, authLogoutAll } from "../../features/auth/handlers";
import { resetConfigForTests } from "../config";
import { createSessionCsrfToken } from "./csrf";
import {
  linkSessionToRefreshFamily,
  rotateRefreshSession
} from "../cosmos/sessionRepository";

const SECRET = "refresh-secret-for-integration-tests";
const NEXT_SECRET_HASH = createHash("sha256").update("new-refresh-secret").digest("hex");

function config(): ApiConfig {
  return {
    apiEnv: "dev", authBypassDev: true, migrationsAdminKey: "", googleClientId: "test-client.apps.googleusercontent.com",
    googlePlayPackageName: "io.whatfees", googlePlayProProductIds: [],
    googlePlayServiceAccountEmail: "", googlePlayServiceAccountPrivateKey: "", allowedOrigins: [],
    cosmosEndpoint: "https://example.documents.azure.com:443/", cosmosKey: "key",
    cosmosDatabaseId: "test", migrationCosmosDatabaseId: "test", entitlementsContainerId: "entitlements",
    syncContainerId: "sync", migrationRunsContainerId: "runs", sessionsContainerId: "sessions",
    sessionCookieName: "whatfees_session", refreshCookieName: "whatfees_refresh"
  };
}

test("concurrent bearer bootstraps keep independent refresh families and logout stays family-scoped", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ aud: "test-client.apps.googleusercontent.com", sub: "owner-1" })
  }) as Response) as typeof fetch;

  try {
    const requestA = request("", { authorization: "Bearer same-google-token" });
    const requestB = request("", { authorization: "Bearer same-google-token" });
    const [userA, userB] = await Promise.all([
      resolveUserId(requestA, config(), { allowBearerAuth: true }),
      resolveUserId(requestB, config(), { allowBearerAuth: true })
    ]);
    assert.equal(userA, "owner-1");
    assert.equal(userB, "owner-1");

    const cookiesA = consumeAuthResponseCookies(requestA);
    const cookiesB = consumeAuthResponseCookies(requestB);
    const accessA = cookiesA.find((cookie) => cookie.name === "whatfees_session")?.value;
    const accessB = cookiesB.find((cookie) => cookie.name === "whatfees_session")?.value;
    const refreshA = cookiesA.find((cookie) => cookie.name === "whatfees_refresh")?.value;
    const refreshB = cookiesB.find((cookie) => cookie.name === "whatfees_refresh")?.value;
    assert.ok(accessA && accessB && refreshA && refreshB);
    assert.notEqual(accessA, accessB);
    assert.notEqual(refreshA.split(".")[0], refreshB.split(".")[0]);
    assert.equal(rows.get(accessA)?.refreshFamilyId, refreshA.split(".")[0]);
    assert.equal(rows.get(accessB)?.refreshFamilyId, refreshB.split(".")[0]);

    const refreshRequest = request(`whatfees_refresh=${refreshA}`);
    await refreshSessionFromRequest(refreshRequest, config());
    const successorId = consumeAuthResponseCookies(refreshRequest).find((cookie) => cookie.name === "whatfees_session")?.value;
    assert.ok(successorId);
    assert.equal(rows.get(successorId)?.refreshFamilyId, refreshA.split(".")[0]);
    assert.equal(await revokeSessionFromRequest(request(`whatfees_session=${accessA}`), config(), "owner-1"), true);

    assert.equal(rows.has(accessA), false);
    assert.equal(rows.has(successorId), false);
    assert.ok(rows.get(refreshA.split(".")[0])?.revokedAt);
    assert.equal(rows.has(accessB), true);
    assert.equal(rows.get(accessB)?.refreshFamilyId, refreshB.split(".")[0]);
    assert.equal(rows.get(refreshB.split(".")[0])?.revokedAt, null);
    assert.equal(await resolveUserId(request(`whatfees_session=${accessB}`, {
      "x-csrf-token": createSessionCsrfToken(accessB, config())
    }), config()), "owner-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function request(cookie: string, extraHeaders: Record<string, string> = {}): HttpRequest {
  const headers = new Map<string, string>([["cookie", cookie], ...Object.entries(extraHeaders).map(([key, value]) => [key.toLowerCase(), value])]);
  return {
    method: "POST",
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null }
  } as unknown as HttpRequest;
}

function session(id: string, overrides: Partial<SessionDocument> = {}): SessionDocument {
  const now = Date.now();
  return {
    id, docType: "session", userId: "owner-1", createdAt: new Date(now - 1000).toISOString(),
    lastSeenAt: new Date(now - 1000).toISOString(), idleExpiresAt: new Date(now + 600_000).toISOString(),
    absoluteExpiresAt: new Date(now + 1_200_000).toISOString(), ...overrides
  };
}

function family(overrides: Partial<RefreshSessionDocument> = {}): RefreshSessionDocument {
  const now = Date.now();
  return {
    id: "family-1", docType: "refresh_session", userId: "owner-1",
    tokenHash: createHash("sha256").update(SECRET).digest("hex"),
    sessionId: "access-old", previousSessionId: null,
    createdAt: new Date(now - 1000).toISOString(), lastUsedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 86_400_000).toISOString(), revokedAt: null, ...overrides
  };
}

async function seed(value: { id: string }): Promise<void> {
  rows.set(value.id, { ...value, _etag: `etag-${value.id}` });
}

beforeEach(() => {
  rows.clear(); events.length = 0; hooks.missFamilyQueryOnce = false;
  hooks.rejectFamilyReplaceCount = 0; hooks.staleSessionReadOnce = false;
  hooks.failDeleteIdOnce = ""; hooks.rotateBeforeDeleteForIdOnce = "";
});

test("legacy access-only logout wins before refresh rotation through the stable family link", async () => {
  await seed(session("access-old"));
  await seed(family());
  await linkSessionToRefreshFamily(config(), { sessionId: "access-old", refreshFamilyId: "family-1", userId: "owner-1" });

  assert.equal(await revokeSessionFromRequest(request("whatfees_session=access-old"), config(), "owner-1"), true);
  await assert.rejects(() => rotateRefreshSession(config(), {
    refreshSessionId: "family-1", expectedTokenHash: createHash("sha256").update(SECRET).digest("hex"),
    tokenHash: NEXT_SECRET_HASH, sessionId: "access-new", lastUsedAt: new Date().toISOString()
  }), /already rotated/);
  assert.equal(rows.has("family-1"), true);
  assert.equal((rows.get("family-1")?.revokedAt as string).length > 0, true);
});

test("legacy access-only logout after rotation revokes family and removes old and successor access rows", async () => {
  await seed(session("access-old"));
  await seed(session("access-new", { refreshFamilyId: "family-1" }));
  await seed(family());
  await linkSessionToRefreshFamily(config(), { sessionId: "access-old", refreshFamilyId: "family-1", userId: "owner-1" });
  await rotateRefreshSession(config(), {
    refreshSessionId: "family-1", expectedTokenHash: createHash("sha256").update(SECRET).digest("hex"),
    tokenHash: NEXT_SECRET_HASH, sessionId: "access-new", lastUsedAt: new Date().toISOString()
  });

  assert.equal(await revokeSessionFromRequest(request("whatfees_session=access-old"), config(), "owner-1"), true);
  assert.equal(rows.has("access-old"), false);
  assert.equal(rows.has("access-new"), false);
  const revoked = rows.get("family-1");
  assert.ok(revoked?.revokedAt);
  assert.equal(revoked?.sessionId, null);
  assert.equal(revoked?.previousSessionId, null);
  await assert.rejects(() => resolveUserId(request("whatfees_session=access-old"), config()), /Authentication is required/);
  await assert.rejects(() => resolveUserId(request("whatfees_session=access-new"), config()), /Authentication is required/);
});

test("access-only logout removes every surviving session in a family after multiple rotations", async () => {
  const thirdTokenHash = createHash("sha256").update("third-refresh-secret").digest("hex");
  await seed(session("access-old"));
  await seed(session("access-middle", { refreshFamilyId: "family-1" }));
  await seed(session("access-new", { refreshFamilyId: "family-1" }));
  await seed(family());
  await linkSessionToRefreshFamily(config(), { sessionId: "access-old", refreshFamilyId: "family-1", userId: "owner-1" });
  await rotateRefreshSession(config(), {
    refreshSessionId: "family-1", expectedTokenHash: createHash("sha256").update(SECRET).digest("hex"),
    tokenHash: NEXT_SECRET_HASH, sessionId: "access-middle", lastUsedAt: new Date().toISOString()
  });
  await rotateRefreshSession(config(), {
    refreshSessionId: "family-1", expectedTokenHash: NEXT_SECRET_HASH,
    tokenHash: thirdTokenHash, sessionId: "access-new", lastUsedAt: new Date().toISOString()
  });

  assert.equal(await revokeSessionFromRequest(request("whatfees_session=access-old"), config(), "owner-1"), true);
  assert.equal(rows.has("access-old"), false);
  assert.equal(rows.has("access-middle"), false);
  assert.equal(rows.has("access-new"), false);
});

test("access-only logout rereads its old session when the family query misses after rotation", async () => {
  await seed(session("access-old"));
  await seed(session("access-new"));
  await seed(family());
  await linkSessionToRefreshFamily(config(), { sessionId: "access-old", refreshFamilyId: "family-1", userId: "owner-1" });
  await rotateRefreshSession(config(), {
    refreshSessionId: "family-1", expectedTokenHash: createHash("sha256").update(SECRET).digest("hex"),
    tokenHash: NEXT_SECRET_HASH, sessionId: "access-new", lastUsedAt: new Date().toISOString()
  });
  hooks.missFamilyQueryOnce = true;
  hooks.staleSessionReadOnce = true;

  assert.equal(await revokeSessionFromRequest(request("whatfees_session=access-old"), config(), "owner-1"), true);
  assert.equal(rows.has("access-new"), false);
  assert.ok(rows.get("family-1")?.revokedAt);
});

test("refresh-cookie-only logout accepts the immediate previous secret and checks verified owner", async () => {
  const previousHash = createHash("sha256").update(SECRET).digest("hex");
  await seed(session("access-new", { refreshFamilyId: "family-1" }));
  await seed(family({ tokenHash: NEXT_SECRET_HASH, previousTokenHash: previousHash, sessionId: "access-new" }));

  assert.equal(await revokeSessionFromRequest(request(`whatfees_refresh=family-1.${SECRET}`), config()), true);
  assert.equal(rows.has("access-new"), false);

  await seed(session("access-new", { refreshFamilyId: "family-1" }));
  await seed(family({ tokenHash: NEXT_SECRET_HASH, previousTokenHash: previousHash, sessionId: "access-new" }));
  assert.equal(await revokeSessionFromRequest(request(`whatfees_refresh=family-1.${SECRET}`), config(), "another-owner"), false);
  assert.equal((rows.get("family-1")?.revokedAt as string | null), null);
});

test("invalid refresh secret cannot revoke a family without a verified access owner", async () => {
  await seed(session("access-new", { refreshFamilyId: "family-1" }));
  await seed(family({ sessionId: "access-new" }));

  assert.equal(await revokeSessionFromRequest(request("whatfees_refresh=family-1.wrong-secret"), config()), false);
  assert.equal((rows.get("family-1")?.revokedAt as string | null), null);
  assert.equal(rows.has("access-new"), true);
});

test("a corrupt family association cannot delete another user's access session", async () => {
  await seed(session("foreign-access", { userId: "owner-2", refreshFamilyId: "other-family" }));
  await seed(family({ sessionId: "foreign-access" }));

  await assert.rejects(
    () => revokeSessionFromRequest(request(`whatfees_refresh=family-1.${SECRET}`), config()),
    /owned by another user/
  );
  assert.equal(rows.has("foreign-access"), true);
  assert.ok(rows.get("family-1")?.revokedAt);
  assert.equal(rows.get("family-1")?.sessionId, "foreign-access");
});

test("authLogout handles refresh-cookie-only, expired-old-access, and deleted-old-access sessions", async () => {
  const previousEnv = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries({
    API_ENV: "dev", COSMOSDB_ENDPOINT: "https://example.documents.azure.com:443/", COSMOSDB_KEY: "key",
    COSMOSDB_DATABASE_ID: "test", AUTH_BYPASS_DEV: "true"
  })) {
    previousEnv.set(name, process.env[name]);
    process.env[name] = value;
  }
  resetConfigForTests();
  try {
    for (const oldState of ["no-cookie", "expired", "deleted"] as const) {
      rows.clear(); events.length = 0;
      await seed(session("access-new", { refreshFamilyId: "family-1" }));
      if (oldState !== "deleted") {
        await seed(session("access-old", {
          refreshFamilyId: "family-1",
          idleExpiresAt: oldState === "expired" ? new Date(Date.now() - 1000).toISOString() : new Date(Date.now() + 500_000).toISOString()
        }));
      }
      await seed(family({ sessionId: "access-new", previousSessionId: "access-old" }));
      const accessCookie = oldState === "no-cookie" ? "" : "; whatfees_session=access-old";
      const req = request(`whatfees_refresh=family-1.${SECRET}${accessCookie}`);
      const response = await authLogout(req, { error: () => undefined } as never);
      assert.equal(response.status, 200, oldState);
      assert.equal(rows.has("access-new"), false, oldState);
      assert.equal(rows.has("access-old"), false, oldState);
      assert.ok(rows.get("family-1")?.revokedAt, oldState);
      assert.equal(rows.get("family-1")?.sessionId, null, oldState);
    }
  } finally {
    for (const [name, value] of previousEnv) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    resetConfigForTests();
  }
});

test("authLogout uses a verified legacy access session without a refresh cookie before rotation", async () => {
  const previousEnv = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries({
    API_ENV: "dev", COSMOSDB_ENDPOINT: "https://example.documents.azure.com:443/", COSMOSDB_KEY: "key",
    COSMOSDB_DATABASE_ID: "test", AUTH_BYPASS_DEV: "true"
  })) {
    previousEnv.set(name, process.env[name]); process.env[name] = value;
  }
  resetConfigForTests();
  try {
    await seed(session("access-old"));
    await seed(family());
    const csrf = createSessionCsrfToken("access-old", config());
    const response = await authLogout(request("whatfees_session=access-old", { "x-csrf-token": csrf }), { error: () => undefined } as never);
    assert.equal(response.status, 200);
    assert.equal(rows.has("access-old"), false);
    assert.ok(rows.get("family-1")?.revokedAt);
  } finally {
    for (const [name, value] of previousEnv) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    resetConfigForTests();
  }
});

test("authLogout preserves CSRF enforcement for a valid session", async () => {
  const previousEnv = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries({
    API_ENV: "dev", COSMOSDB_ENDPOINT: "https://example.documents.azure.com:443/", COSMOSDB_KEY: "key",
    COSMOSDB_DATABASE_ID: "test", AUTH_BYPASS_DEV: "true"
  })) {
    previousEnv.set(name, process.env[name]); process.env[name] = value;
  }
  resetConfigForTests();
  try {
    await seed(session("access-old"));
    await seed(family());
    const response = await authLogout(request("whatfees_session=access-old; whatfees_refresh=family-1." + SECRET), { error: () => undefined } as never);
    assert.equal(response.status, 403);
    assert.equal(rows.has("access-old"), true);
    assert.equal(rows.get("family-1")?.revokedAt, null);
  } finally {
    for (const [name, value] of previousEnv) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    resetConfigForTests();
  }
});

test("authLogout conditional legacy cleanup catches rotation between reread and delete", async () => {
  const previousEnv = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries({
    API_ENV: "dev", COSMOSDB_ENDPOINT: "https://example.documents.azure.com:443/", COSMOSDB_KEY: "key",
    COSMOSDB_DATABASE_ID: "test", AUTH_BYPASS_DEV: "true"
  })) {
    previousEnv.set(name, process.env[name]); process.env[name] = value;
  }
  resetConfigForTests();
  try {
    await seed(session("access-old"));
    await seed(family());
    hooks.missFamilyQueryOnce = true;
    hooks.rotateBeforeDeleteForIdOnce = "access-old";
    const csrf = createSessionCsrfToken("access-old", config());
    const response = await authLogout(request("whatfees_session=access-old", { "x-csrf-token": csrf }), { error: () => undefined } as never);
    assert.equal(response.status, 200);
    assert.equal(rows.has("access-old"), false);
    assert.equal(rows.has("access-race-successor"), false);
    assert.ok(rows.get("family-1")?.revokedAt);
  } finally {
    for (const [name, value] of previousEnv) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    resetConfigForTests();
  }
});

test("authLogout retains cookies after a confirmed revoke but failed session delete for retry", async () => {
  const previousEnv = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries({
    API_ENV: "dev", COSMOSDB_ENDPOINT: "https://example.documents.azure.com:443/", COSMOSDB_KEY: "key",
    COSMOSDB_DATABASE_ID: "test", AUTH_BYPASS_DEV: "true"
  })) {
    previousEnv.set(name, process.env[name]); process.env[name] = value;
  }
  resetConfigForTests();
  try {
    await seed(session("access-old"));
    await seed(family());
    hooks.failDeleteIdOnce = "access-old";
    const cookie = `whatfees_refresh=family-1.${SECRET}`;
    const failed = await authLogout(request(cookie), { error: () => undefined } as never);
    assert.equal(failed.status, 500);
    assert.equal((failed.cookies ?? []).some((responseCookie) => responseCookie.maxAge === 0), false);
    assert.ok(rows.get("family-1")?.revokedAt);
    assert.equal(rows.get("family-1")?.sessionId, "access-old");

    const retried = await authLogout(request(cookie), { error: () => undefined } as never);
    assert.equal(retried.status, 200);
    assert.equal(rows.has("access-old"), false);
    assert.equal(rows.get("family-1")?.sessionId, null);
  } finally {
    for (const [name, value] of previousEnv) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    resetConfigForTests();
  }
});

test("authLogoutAll revokes refresh families before deleting sessions and clears links afterward", async () => {
  const previousEnv = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries({
    API_ENV: "dev", COSMOSDB_ENDPOINT: "https://example.documents.azure.com:443/", COSMOSDB_KEY: "key",
    COSMOSDB_DATABASE_ID: "test", AUTH_BYPASS_DEV: "true"
  })) {
    previousEnv.set(name, process.env[name]);
    process.env[name] = value;
  }
  resetConfigForTests();
  try {
    const configForCsrf = config();
    await seed(session("access-current", { refreshFamilyId: "family-1" }));
    await seed(family({ sessionId: "access-current" }));
    const csrf = createSessionCsrfToken("access-current", configForCsrf);
    const req = {
      method: "POST",
      headers: { get: (name: string) => ({
        cookie: "whatfees_session=access-current",
        "x-csrf-token": csrf
      } as Record<string, string>)[name.toLowerCase()] ?? null }
    } as unknown as HttpRequest;
    const response = await authLogoutAll(req, { error: () => undefined } as never);
    assert.equal(response.status, 200);
    const familyRevokeIndex = events.findIndex((event) => event === "replace:family-1:refresh_session");
    const accessDeleteIndex = events.findIndex((event) => event === "delete:access-current");
    const familyCleanupIndex = events.lastIndexOf("replace:family-1:refresh_session");
    assert.ok(familyRevokeIndex >= 0 && familyRevokeIndex < accessDeleteIndex);
    assert.ok(familyCleanupIndex > accessDeleteIndex);
    assert.equal(rows.get("family-1")?.sessionId, null);
  } finally {
    for (const [name, value] of previousEnv) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    resetConfigForTests();
  }
});

test("conditional family revoke rereads and retries an ETag conflict", async () => {
  await seed(session("access-current"));
  await seed(family());
  hooks.rejectFamilyReplaceCount = 1;

  assert.equal(await revokeSessionFromRequest(request(`whatfees_refresh=family-1.${SECRET}`), config()), true);
  assert.equal(hooks.rejectFamilyReplaceCount, 0);
  assert.equal(rows.has("access-old"), false);
  assert.equal(rows.get("family-1")?.sessionId, null);
});

test("failed access deletion keeps the revoked family association for a successful retry", async () => {
  await seed(session("access-old"));
  await seed(family());
  hooks.failDeleteIdOnce = "access-old";

  await assert.rejects(
    () => revokeSessionFromRequest(request(`whatfees_refresh=family-1.${SECRET}`), config()),
    /Injected delete failure/
  );
  assert.ok(rows.get("family-1")?.revokedAt);
  assert.equal(rows.get("family-1")?.sessionId, "access-old");

  assert.equal(await revokeSessionFromRequest(request(`whatfees_refresh=family-1.${SECRET}`), config()), true);
  assert.equal(rows.has("access-old"), false);
  assert.equal(rows.get("family-1")?.sessionId, null);
});

test("exhausted family ETag retries throw instead of reporting logout success", async () => {
  await seed(session("access-old"));
  await seed(family());
  hooks.rejectFamilyReplaceCount = 3;

  await assert.rejects(
    () => revokeSessionFromRequest(request(`whatfees_refresh=family-1.${SECRET}`), config()),
    /concurrent updates/
  );
  assert.equal(rows.get("family-1")?.revokedAt, null);
  assert.equal(rows.has("access-old"), true);
});
