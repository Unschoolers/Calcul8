import assert from "node:assert/strict";
import { test } from "vitest";
import { HttpError } from "../../lib/auth";
import {
  assertMigrationAdminAccess,
  resolveMigrationActor
} from "./adminAuth";

function createRequest(headers: Record<string, string> = {}) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    headers: {
      get(name: string) {
        return normalized.get(name.toLowerCase()) ?? null;
      }
    }
  };
}

test("assertMigrationAdminAccess allows dev requests without configured key", () => {
  assert.doesNotThrow(() => {
    assertMigrationAdminAccess(createRequest() as never, "", "dev");
  });
});

test("assertMigrationAdminAccess requires configured key in production", () => {
  assert.throws(
    () => assertMigrationAdminAccess(createRequest() as never, "", "prod"),
    (error: unknown) => error instanceof HttpError
      && error.status === 500
      && error.message === "MIGRATIONS_ADMIN_KEY must be configured in production."
  );
});

test("assertMigrationAdminAccess rejects missing or incorrect keys", () => {
  assert.throws(
    () => assertMigrationAdminAccess(createRequest() as never, "secret", "prod"),
    (error: unknown) => error instanceof HttpError
      && error.status === 403
      && error.message === "Forbidden."
  );

  assert.throws(
    () => assertMigrationAdminAccess(createRequest({ "x-migration-key": "wrong" }) as never, "secret", "prod"),
    (error: unknown) => error instanceof HttpError
      && error.status === 403
      && error.message === "Forbidden."
  );
});

test("assertMigrationAdminAccess accepts the matching key", () => {
  assert.doesNotThrow(() => {
    assertMigrationAdminAccess(createRequest({ "x-migration-key": "secret" }) as never, "secret", "prod");
  });
});

test("resolveMigrationActor falls back and trims long admin ids", () => {
  assert.equal(resolveMigrationActor(createRequest() as never), "migration-admin");
  assert.equal(
    resolveMigrationActor(createRequest({ "x-admin-id": "x".repeat(200) }) as never),
    "x".repeat(128)
  );
});
