import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig, SyncMetaDocument, SyncPresetDocument } from "../../types";

const { getContainersMock, isNotFoundErrorMock, withCosmosRetryMock } = vi.hoisted(() => ({
  getContainersMock: vi.fn(),
  isNotFoundErrorMock: vi.fn((error: unknown) => (error as { statusCode?: number })?.statusCode === 404),
  withCosmosRetryMock: vi.fn(async <T>(operation: () => Promise<T>) => operation())
}));

vi.mock("./core", () => ({
  getContainers: getContainersMock,
  isNotFoundError: isNotFoundErrorMock,
  withCosmosRetry: withCosmosRetryMock
}));

import {
  cleanupExpiredSupersededPresetSets,
  finishSupersessionRetention
} from "./syncSnapshotIncrementalRepository";

const NOW = Date.parse("2026-10-17T12:00:00.000Z");
const OLD = new Date(NOW - 25 * 60 * 60 * 1000).toISOString();
const FRESH = new Date(NOW - 23 * 60 * 60 * 1000).toISOString();

function config(): ApiConfig {
  return {
    apiEnv: "dev",
    authBypassDev: true,
    migrationsAdminKey: "",
    googleClientId: "",
    googlePlayPackageName: "io.whatfees",
    googlePlayProProductIds: ["pro_access"],
    googlePlayServiceAccountEmail: "",
    googlePlayServiceAccountPrivateKey: "",
    allowedOrigins: [],
    cosmosEndpoint: "https://example.documents.azure.com:443/",
    cosmosKey: "key",
    cosmosDatabaseId: "whatfees",
    migrationCosmosDatabaseId: "whatfees",
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs"
  };
}

function preset(presetSetId: string | undefined, supersededAt: string | undefined, id: string): SyncPresetDocument {
  return {
    id,
    docType: "sync_preset",
    userId: "user-1",
    presetId: id,
    ...(presetSetId === undefined ? {} : { presetSetId }),
    ...(supersededAt === undefined ? {} : { supersededAt }),
    preset: { id },
    sales: [],
    version: 2,
    updatedAt: "2026-10-17T00:00:00.000Z"
  };
}

function meta(presetSetId: string, etag = "meta-etag"): SyncMetaDocument {
  return {
    id: "sync:meta:user-1",
    docType: "sync_meta",
    userId: "user-1",
    version: 9,
    presetSetId,
    updatedAt: "2026-10-17T00:00:00.000Z",
    _etag: etag
  } as SyncMetaDocument;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

test("retention discovers active expired markers and removes only expired inactive marked exact sets", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const discovered = [
    preset("active-expired", OLD, "active-doc"),
    preset("old-expired", OLD, "old-doc"),
    preset("fresh", FRESH, "fresh-doc"),
    preset("unmarked", undefined, "unmarked-doc"),
    preset(undefined, OLD, "legacy-doc")
  ];
  const deleted: string[] = [];
  const query = vi.fn((spec: { query: string; parameters: Array<{ name: string; value: unknown }> }) => {
    const target = spec.parameters.find((parameter) => parameter.name === "@presetSetId")?.value;
    const rows = target === undefined
      ? discovered
      : discovered.filter((document) => document.presetSetId === target);
    return { fetchAll: vi.fn().mockResolvedValue({ resources: rows }) };
  });
  const read = vi.fn().mockResolvedValue({ resource: meta("active-expired") });
  const container = {
    items: { query },
    item: vi.fn((id: string) => ({
      read,
      delete: vi.fn(async () => { deleted.push(id); return {}; })
    }))
  };
  getContainersMock.mockReturnValue({ syncSnapshots: container });

  await cleanupExpiredSupersededPresetSets(config(), "user-1");

  assert.deepEqual(deleted, ["old-doc"]);
  assert.equal(query.mock.calls.length, 2);
  assert.match(query.mock.calls[0]?.[0].query ?? "", /c\.docType = @docType/);
  assert.equal(query.mock.calls[0]?.[0].parameters.some((parameter) => parameter.name === "@supersededAt"), false);
  assert.equal(discovered.some((document) => document.presetSetId === "active-expired" && document.supersededAt === OLD), true);
  assert.equal(query.mock.calls[0]?.[0].parameters.some((parameter) => parameter.name === "@presetSetId"), false);
  assert.deepEqual(
    discovered.filter((document) => ["active-doc", "fresh-doc", "unmarked-doc", "legacy-doc"].includes(document.id)).map((document) => document.id),
    ["active-doc", "fresh-doc", "unmarked-doc", "legacy-doc"]
  );
});

test("retention awaits cleanup and logs a cleanup rejection without failing the committed write", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const document = { ...preset("old-set", undefined, "old-doc"), _etag: "preset-etag" } as SyncPresetDocument;
  let releaseQuery!: (value: { resources: SyncPresetDocument[] }) => void;
  const queryResult = new Promise<{ resources: SyncPresetDocument[] }>((resolve) => { releaseQuery = resolve; });
  const query = vi.fn(() => ({ fetchAll: vi.fn(() => queryResult) }));
  const replace = vi.fn().mockResolvedValue({ resource: null });
  const read = vi.fn().mockResolvedValue({ resource: meta("new-set") });
  const container = {
    items: { query },
    item: vi.fn(() => ({ read, replace, delete: vi.fn().mockResolvedValue({}) }))
  };
  getContainersMock.mockReturnValue({ syncSnapshots: container });
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  let settled = false;

  const finished = finishSupersessionRetention(config(), "user-1", [document]).then(() => { settled = true; });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false);
  releaseQuery({ resources: [] });
  await finished;
  assert.equal(settled, true);
  assert.equal(replace.mock.calls.length, 1);
  assert.equal((replace.mock.calls[0]?.[0] as SyncPresetDocument).supersededAt, new Date(NOW).toISOString());
  query.mockImplementation(() => ({ fetchAll: vi.fn().mockRejectedValue(new Error("cleanup query failed")) }));
  await assert.doesNotReject(() => finishSupersessionRetention(config(), "user-1", []));
  assert.equal(warning.mock.calls.some((call) => String(call[0]).includes("Unable to clean up expired")), true);
  warning.mockRestore();
});
