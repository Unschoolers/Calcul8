import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const {
  fetchWithRetryMock,
  handleExpiredAuthMock,
  resolveApiBaseUrlMock,
  requestCloudSyncPushMock,
  createSyncPayloadMock
} = vi.hoisted(() => ({
  fetchWithRetryMock: vi.fn(),
  handleExpiredAuthMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn(),
  requestCloudSyncPushMock: vi.fn(),
  createSyncPayloadMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/shared.ts", () => ({
  GOOGLE_TOKEN_KEY: "whatfees_google_token",
  fetchWithRetry: fetchWithRetryMock,
  handleExpiredAuth: handleExpiredAuthMock,
  resolveApiBaseUrl: resolveApiBaseUrlMock
}));

vi.mock("../src/app-core/methods/ui/sync-network.ts", () => ({
  requestCloudSyncPush: requestCloudSyncPushMock
}));

vi.mock("../src/app-core/methods/ui/sync-payload.ts", () => ({
  createSyncPayload: createSyncPayloadMock
}));

import { uiWorkspaceMethods } from "../src/app-core/methods/ui/workspaces.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function createMockStorage(seed: Record<string, string> = {}): MockStorage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem(key: string): string | null {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, String(value));
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    clear(): void {
      map.clear();
    }
  };
}

function createResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });
}

function createContext() {
  const ctx = {
    lots: [{ id: 1, name: "Lot 1" }],
    sales: [],
    singlesPurchases: [],
    currentLotId: 1,
    currentTab: "config",
    lastSyncedPayloadHash: null as string | null,
    activeScopeType: "personal" as "personal" | "workspace",
    activeWorkspaceId: null as string | null,
    availableWorkspaces: [] as Array<{ workspaceId: string; name: string; role: "owner" | "member"; status: "active" }>,
    workspaceMembers: [] as Array<{ userId: string; workspaceId: string; role: "owner" | "member"; status: "active" | "removed" | "disabled"; updatedAt: string }>,
    pendingWorkspaceInviteToken: "",
    pendingWorkspaceInviteWorkspaceId: null as string | null,
    pendingWorkspaceInviteWorkspaceName: "",
    showWorkspaceJoinDialog: false,
    showCreateWorkspaceModal: false,
    showWorkspaceMembersModal: false,
    showLeaveWorkspaceModal: false,
    newWorkspaceName: "",
    leaveWorkspaceTransferMemberUserId: "",
    leaveWorkspaceDeleteConfirmation: false,
    isWorkspaceLoading: false,
    isCreatingWorkspace: false,
    isWorkspaceMembersLoading: false,
    isCreatingWorkspaceJoinLink: false,
    isResolvingWorkspaceInvite: false,
    isAcceptingWorkspaceInvite: false,
    isLeavingWorkspace: false,
    isCurrentWorkspaceOwner: false,
    notify: vi.fn(),
    pullCloudSync: vi.fn(async () => undefined),
    loadLotsFromStorage: vi.fn(),
    loadLot: vi.fn(),
    clearLiveSinglesSelection: vi.fn(),
    loadSalesForLotId: vi.fn(() => []),
    refreshWorkspaces: vi.fn(),
    switchToWorkspace: vi.fn(async () => undefined),
    openWorkspaceMembersModal: vi.fn(async () => undefined)
  } as Record<string, unknown>;

  for (const [name, method] of Object.entries(uiWorkspaceMethods as Record<string, unknown>)) {
    if (typeof method === "function") {
      ctx[name] = (method as (...args: unknown[]) => unknown).bind(ctx);
    }
  }

  return ctx;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");
  requestCloudSyncPushMock.mockResolvedValue(createResponse({ version: 1 }));
  createSyncPayloadMock.mockReturnValue({ lots: [], salesByLot: {}, workspaceId: "ws_1" });

  const historyReplaceState = vi.fn();
  vi.stubGlobal("window", {
    location: {
      href: "https://app.example.test/join?invite=abc123",
      origin: "https://app.example.test"
    },
    history: {
      state: null,
      replaceState: historyReplaceState
    },
    prompt: vi.fn()
  });
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: vi.fn(async () => undefined)
    }
  });
  vi.stubGlobal("localStorage", createMockStorage({
    whatfees_google_token: "token-123",
    whatfees_active_scope_type: "personal",
    whatfees_last_lot_id: "1"
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("refreshWorkspaces clears list when no Google token is available", async () => {
  vi.stubGlobal("localStorage", createMockStorage());
  const ctx = createContext();
  ctx.availableWorkspaces = [{
    workspaceId: "ws_old",
    name: "Old",
    role: "member",
    status: "active"
  }];

  await uiWorkspaceMethods.refreshWorkspaces.call(ctx);

  assert.deepEqual(ctx.availableWorkspaces, []);
  assert.equal(fetchWithRetryMock.mock.calls.length, 0);
});

test("refreshWorkspaces normalizes and sorts workspaces and falls back to personal when active workspace disappears", async () => {
  const ctx = createContext();
  ctx.activeScopeType = "workspace";
  ctx.activeWorkspaceId = "missing";
  fetchWithRetryMock.mockResolvedValue(createResponse({
    workspaces: [
      { workspaceId: "ws_b", name: "Beta", role: "member", status: "active" },
      { workspaceId: "ws_a", name: "Alpha", role: "owner", status: "active" },
      { workspaceId: "", name: "Bad", role: "owner", status: "active" }
    ]
  }));

  await uiWorkspaceMethods.refreshWorkspaces.call(ctx);

  assert.deepEqual(ctx.availableWorkspaces.map((workspace: { workspaceId: string }) => workspace.workspaceId), ["ws_a", "ws_b"]);
  assert.equal(ctx.activeScopeType, "personal");
  assert.equal(ctx.activeWorkspaceId, null);
  assert.equal(ctx.pullCloudSync.mock.calls.length, 0);
});

test("switchToWorkspace refreshes once and warns if workspace remains unavailable", async () => {
  const ctx = createContext();
  ctx.availableWorkspaces = [];
  ctx.refreshWorkspaces = vi.fn(async () => {
    ctx.availableWorkspaces = [];
  });

  await uiWorkspaceMethods.switchToWorkspace.call(ctx, "ws_missing");

  assert.equal(ctx.refreshWorkspaces.mock.calls.length, 1);
  assert.deepEqual(ctx.notify.mock.calls.at(-1), ["That workspace is no longer available.", "warning"]);
});

test("createWorkspace creates, seeds, refreshes, and switches to the new workspace", async () => {
  const ctx = createContext();
  ctx.newWorkspaceName = "Team Alpha";
  ctx.refreshWorkspaces = vi.fn(async () => undefined);
  ctx.switchToWorkspace = vi.fn(async () => undefined);
  fetchWithRetryMock.mockResolvedValue(createResponse({
    workspace: {
      workspaceId: "ws_created"
    }
  }));

  await uiWorkspaceMethods.createWorkspace.call(ctx);

  assert.equal(fetchWithRetryMock.mock.calls.length, 1);
  const createInit = fetchWithRetryMock.mock.calls[0]?.[1] as { body?: string };
  assert.deepEqual(JSON.parse(String(createInit.body)), { name: "Team Alpha" });
  assert.equal(createSyncPayloadMock.mock.calls.length, 1);
  assert.equal(requestCloudSyncPushMock.mock.calls.length, 1);
  assert.equal(ctx.refreshWorkspaces.mock.calls.length, 1);
  assert.equal(ctx.switchToWorkspace.mock.calls.length, 1);
  assert.equal(ctx.switchToWorkspace.mock.calls[0]?.[0], "ws_created");
  assert.equal(ctx.newWorkspaceName, "");
  assert.equal(ctx.showCreateWorkspaceModal, false);
});

test("openWorkspaceMembersModal loads normalized members and opens the modal", async () => {
  const ctx = createContext();
  ctx.activeWorkspaceId = "ws_team";
  fetchWithRetryMock.mockResolvedValue(createResponse({
    memberships: [
      { userId: "owner-1", workspaceId: "ws_team", role: "owner", status: "active", updatedAt: "2026-03-17T00:00:00Z" },
      { userId: "member-1", workspaceId: "ws_team", role: "member", status: "active", updatedAt: "2026-03-17T00:00:00Z" },
      { userId: "", workspaceId: "ws_team", role: "member", status: "active", updatedAt: "2026-03-17T00:00:00Z" }
    ]
  }));

  await uiWorkspaceMethods.openWorkspaceMembersModal.call(ctx);

  assert.equal(ctx.workspaceMembers.length, 2);
  assert.equal(ctx.leaveWorkspaceTransferMemberUserId, "member-1");
  assert.equal(ctx.showWorkspaceMembersModal, true);
});

test("createWorkspaceJoinLink copies the absolute invite URL", async () => {
  const ctx = createContext();
  ctx.activeWorkspaceId = "ws_team";
  fetchWithRetryMock.mockResolvedValue(createResponse({
    inviteUrl: "/join?invite=share-token"
  }));

  await uiWorkspaceMethods.createWorkspaceJoinLink.call(ctx);

  const writeText = navigator.clipboard?.writeText as ReturnType<typeof vi.fn>;
  assert.equal(writeText.mock.calls.length, 1);
  assert.equal(writeText.mock.calls[0]?.[0], "https://app.example.test/join?invite=share-token");
  assert.deepEqual(ctx.notify.mock.calls.at(-1), ["Invite link copied", "success"]);
});

test("previewPendingWorkspaceInvite resets pending state when preview request fails", async () => {
  const ctx = createContext();
  ctx.pendingWorkspaceInviteToken = "invite-token";
  fetchWithRetryMock.mockResolvedValue(createResponse({
    error: "bad"
  }, { status: 400 }));

  await uiWorkspaceMethods.previewPendingWorkspaceInvite.call(ctx);

  assert.equal(ctx.pendingWorkspaceInviteToken, "");
  assert.equal(ctx.pendingWorkspaceInviteWorkspaceId, null);
  assert.equal(ctx.showWorkspaceJoinDialog, false);
});

test("acceptPendingWorkspaceInvite refreshes and switches to the joined workspace", async () => {
  const ctx = createContext();
  ctx.pendingWorkspaceInviteToken = "invite-token";
  ctx.refreshWorkspaces = vi.fn(async () => undefined);
  ctx.switchToWorkspace = vi.fn(async () => undefined);
  fetchWithRetryMock.mockResolvedValue(createResponse({
    workspaceId: "ws_joined",
    workspaceName: "Joined Team"
  }));

  await uiWorkspaceMethods.acceptPendingWorkspaceInvite.call(ctx);

  assert.equal(ctx.refreshWorkspaces.mock.calls.length, 1);
  assert.equal(ctx.switchToWorkspace.mock.calls[0]?.[0], "ws_joined");
  assert.deepEqual(ctx.notify.mock.calls.at(-1), ["Joined Joined Team", "success"]);
  assert.equal(ctx.pendingWorkspaceInviteToken, "");
});

test("leaveCurrentWorkspace requires transfer selection for owner with remaining members", async () => {
  const ctx = createContext();
  ctx.activeWorkspaceId = "ws_team";
  ctx.activeScopeType = "workspace";
  ctx.isCurrentWorkspaceOwner = true;
  ctx.workspaceMembers = [
    { userId: "member-1", workspaceId: "ws_team", role: "member", status: "active", updatedAt: "2026-03-17T00:00:00Z" }
  ];

  await uiWorkspaceMethods.leaveCurrentWorkspace.call(ctx);

  assert.equal(fetchWithRetryMock.mock.calls.length, 0);
  assert.deepEqual(ctx.notify.mock.calls.at(-1), ["Choose a new owner before leaving.", "warning"]);
});

test("removeWorkspaceMember removes member locally after success", async () => {
  const ctx = createContext();
  ctx.activeWorkspaceId = "ws_team";
  ctx.workspaceMembers = [
    { userId: "owner-1", workspaceId: "ws_team", role: "owner", status: "active", updatedAt: "2026-03-17T00:00:00Z" },
    { userId: "member-1", workspaceId: "ws_team", role: "member", status: "active", updatedAt: "2026-03-17T00:00:00Z" }
  ];
  fetchWithRetryMock.mockResolvedValue(createResponse({ ok: true }));

  await uiWorkspaceMethods.removeWorkspaceMember.call(ctx, "member-1");

  assert.deepEqual(ctx.workspaceMembers.map((member: { userId: string }) => member.userId), ["owner-1"]);
  assert.deepEqual(ctx.notify.mock.calls.at(-1), ["Member removed", "success"]);
});

test("handleWorkspaceAccessLost refreshes and falls back to personal when current workspace disappeared", async () => {
  const ctx = createContext();
  ctx.activeScopeType = "workspace";
  ctx.activeWorkspaceId = "ws_lost";
  ctx.refreshWorkspaces = vi.fn(async () => {
    ctx.availableWorkspaces = [];
  });

  await uiWorkspaceMethods.handleWorkspaceAccessLost.call(ctx, "ws_lost");

  assert.equal(ctx.activeScopeType, "personal");
  assert.equal(ctx.activeWorkspaceId, null);
  assert.deepEqual(
    ctx.notify.mock.calls.at(-1),
    ["You no longer have access to that workspace. Switched back to Personal.", "warning"]
  );
});
