import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import type { ApiConfig } from "../types";

vi.mock("@azure/functions", () => ({
  app: {
    http: vi.fn()
  }
}));

const {
  getConfigMock,
  createWorkspaceWithOwnerMock,
  getWorkspaceByIdMock,
  hasWorkspaceMembershipMock,
  getWorkspaceMembershipMock,
  listWorkspaceMembershipsMock,
  upsertWorkspaceMembershipMock,
  deactivateWorkspaceMembershipMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  createWorkspaceWithOwnerMock: vi.fn(),
  getWorkspaceByIdMock: vi.fn(),
  hasWorkspaceMembershipMock: vi.fn(),
  getWorkspaceMembershipMock: vi.fn(),
  listWorkspaceMembershipsMock: vi.fn(),
  upsertWorkspaceMembershipMock: vi.fn(),
  deactivateWorkspaceMembershipMock: vi.fn()
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/cosmos", () => ({
  createWorkspaceWithOwner: createWorkspaceWithOwnerMock,
  getWorkspaceById: getWorkspaceByIdMock,
  hasWorkspaceMembership: hasWorkspaceMembershipMock,
  getWorkspaceMembership: getWorkspaceMembershipMock,
  listWorkspaceMemberships: listWorkspaceMembershipsMock,
  upsertWorkspaceMembership: upsertWorkspaceMembershipMock,
  deactivateWorkspaceMembership: deactivateWorkspaceMembershipMock
}));

import {
  workspacesCreate,
  workspaceMembersAdd,
  workspaceMembersList,
  workspaceMembersRemove
} from "./workspaces";

function createConfig(): ApiConfig {
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
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs"
  };
}

function createRequest(
  method: string,
  headers: Record<string, string> = {},
  body?: unknown,
  params: Record<string, string> = {}
) {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    normalized.set(key.toLowerCase(), value);
  }

  const request: {
    method: string;
    params: Record<string, string>;
    headers: { get(name: string): string | null };
    json?: () => Promise<unknown>;
  } = {
    method,
    params,
    headers: {
      get(name: string) {
        return normalized.get(name.toLowerCase()) ?? null;
      }
    }
  };

  if (body !== undefined) {
    request.json = async () => body;
  }

  return request;
}

function createContext() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createConfig());
  hasWorkspaceMembershipMock.mockResolvedValue(true);
  getWorkspaceMembershipMock.mockResolvedValue({
    userId: "owner-user",
    workspaceId: "team-42",
    role: "owner",
    status: "active",
    updatedAt: "2026-02-25T00:00:00.000Z"
  });
  listWorkspaceMembershipsMock.mockResolvedValue([]);
  upsertWorkspaceMembershipMock.mockResolvedValue({
    userId: "member-user",
    workspaceId: "team-42",
    role: "member",
    status: "active",
    updatedAt: "2026-02-25T00:00:00.000Z"
  });
  deactivateWorkspaceMembershipMock.mockResolvedValue(true);
  getWorkspaceByIdMock.mockResolvedValue(null);

  globalThis.fetch = (async (input: unknown) => {
    const raw = String(input);
    const tokenMatch = /[?&]id_token=([^&]+)/.exec(raw);
    const decodedToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : "unknown-user";
    return {
      ok: true,
      json: async () => ({
        sub: decodedToken
      })
    } as Response;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("workspacesCreate creates a new workspace with owner membership", async () => {
  const request = createRequest(
    "POST",
    { authorization: "Bearer owner-user" },
    { workspaceId: "team-42", name: "Team 42" }
  );
  const context = createContext();

  const response = await workspacesCreate(request as never, context as never);

  assert.equal(response.status, 201);
  assert.equal(createWorkspaceWithOwnerMock.mock.calls.length, 1);
  assert.equal(createWorkspaceWithOwnerMock.mock.calls[0]?.[1]?.workspaceId, "team-42");
  assert.equal(createWorkspaceWithOwnerMock.mock.calls[0]?.[1]?.ownerUserId, "owner-user");
});

test("workspacesCreate returns 409 when workspace already exists", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42"
  });
  const request = createRequest(
    "POST",
    { authorization: "Bearer owner-user" },
    { workspaceId: "team-42", name: "Team 42" }
  );
  const context = createContext();

  const response = await workspacesCreate(request as never, context as never);
  assert.equal(response.status, 409);
  assert.equal(createWorkspaceWithOwnerMock.mock.calls.length, 0);
});

test("workspaceMembersList rejects non-members", async () => {
  hasWorkspaceMembershipMock.mockResolvedValue(false);
  const request = createRequest(
    "GET",
    { authorization: "Bearer other-user" },
    undefined,
    { workspaceId: "team-42" }
  );
  const context = createContext();

  const response = await workspaceMembersList(request as never, context as never);
  assert.equal(response.status, 403);
  assert.equal(listWorkspaceMembershipsMock.mock.calls.length, 0);
});

test("workspaceMembersList returns members for authorized user", async () => {
  listWorkspaceMembershipsMock.mockResolvedValue([
    { userId: "owner-user", workspaceId: "team-42", role: "owner", status: "active", updatedAt: "2026-02-25T00:00:00.000Z" },
    { userId: "member-user", workspaceId: "team-42", role: "member", status: "active", updatedAt: "2026-02-25T00:00:00.000Z" }
  ]);
  const request = createRequest(
    "GET",
    { authorization: "Bearer owner-user" },
    undefined,
    { workspaceId: "team-42" }
  );
  const context = createContext();

  const response = await workspaceMembersList(request as never, context as never);
  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { count: number }).count, 2);
});

test("workspaceMembersAdd requires owner/admin membership", async () => {
  getWorkspaceMembershipMock.mockResolvedValue({
    userId: "basic-user",
    workspaceId: "team-42",
    role: "member",
    status: "active"
  });
  const request = createRequest(
    "POST",
    { authorization: "Bearer basic-user" },
    { userId: "new-user", role: "member" },
    { workspaceId: "team-42" }
  );
  const context = createContext();

  const response = await workspaceMembersAdd(request as never, context as never);
  assert.equal(response.status, 403);
  assert.equal(upsertWorkspaceMembershipMock.mock.calls.length, 0);
});

test("workspaceMembersAdd upserts member when caller is owner/admin", async () => {
  const request = createRequest(
    "POST",
    { authorization: "Bearer owner-user" },
    { userId: "new-user", role: "member" },
    { workspaceId: "team-42" }
  );
  const context = createContext();

  const response = await workspaceMembersAdd(request as never, context as never);
  assert.equal(response.status, 200);
  assert.equal(upsertWorkspaceMembershipMock.mock.calls.length, 1);
  assert.equal(upsertWorkspaceMembershipMock.mock.calls[0]?.[1]?.workspaceId, "team-42");
  assert.equal(upsertWorkspaceMembershipMock.mock.calls[0]?.[1]?.userId, "new-user");
});

test("workspaceMembersRemove rejects removing owner membership", async () => {
  getWorkspaceMembershipMock
    .mockResolvedValueOnce({
      userId: "owner-user",
      workspaceId: "team-42",
      role: "owner",
      status: "active"
    })
    .mockResolvedValueOnce({
      userId: "owner-user",
      workspaceId: "team-42",
      role: "owner",
      status: "active"
    });

  const request = createRequest(
    "DELETE",
    { authorization: "Bearer owner-user" },
    undefined,
    { workspaceId: "team-42", memberUserId: "owner-user" }
  );
  const context = createContext();

  const response = await workspaceMembersRemove(request as never, context as never);
  assert.equal(response.status, 400);
  assert.equal(deactivateWorkspaceMembershipMock.mock.calls.length, 0);
});

test("workspaceMembersRemove deactivates target member", async () => {
  getWorkspaceMembershipMock
    .mockResolvedValueOnce({
      userId: "owner-user",
      workspaceId: "team-42",
      role: "owner",
      status: "active"
    })
    .mockResolvedValueOnce({
      userId: "member-user",
      workspaceId: "team-42",
      role: "member",
      status: "active"
    });

  const request = createRequest(
    "DELETE",
    { authorization: "Bearer owner-user" },
    undefined,
    { workspaceId: "team-42", memberUserId: "member-user" }
  );
  const context = createContext();

  const response = await workspaceMembersRemove(request as never, context as never);
  assert.equal(response.status, 200);
  assert.equal(deactivateWorkspaceMembershipMock.mock.calls.length, 1);
  assert.equal(deactivateWorkspaceMembershipMock.mock.calls[0]?.[1], "member-user");
  assert.equal(deactivateWorkspaceMembershipMock.mock.calls[0]?.[2], "team-42");
});

