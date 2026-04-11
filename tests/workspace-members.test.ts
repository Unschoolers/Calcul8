import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const {
  fetchAuthenticatedApiResponseMock,
  getStoredGoogleIdTokenMock,
  resolveApiBaseUrlMock
} = vi.hoisted(() => ({
  fetchAuthenticatedApiResponseMock: vi.fn(),
  getStoredGoogleIdTokenMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn()
}));

vi.mock("../src/app-core/auth/index.ts", () => ({
  getStoredGoogleIdToken: getStoredGoogleIdTokenMock
}));

vi.mock("../src/app-core/methods/ui/shared.ts", () => ({
  fetchAuthenticatedApiResponse: fetchAuthenticatedApiResponseMock,
  resolveApiBaseUrl: resolveApiBaseUrlMock
}));

import {
  formatRelativeLastSeen,
  getTransferCandidates,
  getWorkspaceMemberPresenceStateFromApp,
  loadWorkspaceMembers,
  normalizeWorkspaceMember,
  normalizeWorkspaceMembers,
  upsertWorkspaceMembersState
} from "../src/app-core/methods/ui/workspace-members.ts";

function createApp(overrides: Record<string, unknown> = {}) {
  return {
    activeWorkspaceId: "ws_team",
    workspaceMembers: [],
    isWorkspaceMembersLoading: false,
    leaveWorkspaceTransferMemberUserId: "",
    workspacePresenceByUserId: {},
    workspaceRealtimeStatus: "idle",
    googleProfileUserId: "",
    notify: vi.fn(),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");
  getStoredGoogleIdTokenMock.mockReturnValue("google-token");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-11T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

test("normalizeWorkspaceMember trims fields and defaults status to active", () => {
  assert.deepEqual(normalizeWorkspaceMember({
    userId: " user-1 ",
    workspaceId: " ws_team ",
    role: "member",
    updatedAt: " 2026-04-11T10:00:00.000Z ",
    displayName: "  Jordan Lee ",
    photoUrl: "  https://example.test/photo.png  "
  }), {
    userId: "user-1",
    workspaceId: "ws_team",
    role: "member",
    status: "active",
    updatedAt: "2026-04-11T10:00:00.000Z",
    displayName: "Jordan Lee",
    photoUrl: "https://example.test/photo.png"
  });

  assert.equal(normalizeWorkspaceMember({ userId: "", workspaceId: "ws_team", role: "owner", updatedAt: "2026-04-11" }), null);
});

test("normalizeWorkspaceMembers filters invalid rows and transfer candidates prefer active members", () => {
  const members = normalizeWorkspaceMembers([
    { userId: "owner-1", workspaceId: "ws_team", role: "owner", updatedAt: "2026-04-11T10:00:00.000Z" },
    { userId: "member-1", workspaceId: "ws_team", role: "member", updatedAt: "2026-04-11T10:01:00.000Z" },
    { userId: "member-2", workspaceId: "ws_team", role: "member", status: "removed", updatedAt: "2026-04-11T10:02:00.000Z" },
    { nope: true }
  ]);

  assert.equal(members.length, 3);
  assert.deepEqual(getTransferCandidates({ workspaceMembers: members } as never).map((member) => member.userId), ["member-1"]);
});

test("upsertWorkspaceMembersState stores members and chooses the first active transfer candidate", () => {
  const app = createApp();
  const members = normalizeWorkspaceMembers([
    { userId: "owner-1", workspaceId: "ws_team", role: "owner", updatedAt: "2026-04-11T10:00:00.000Z" },
    { userId: "member-1", workspaceId: "ws_team", role: "member", updatedAt: "2026-04-11T10:01:00.000Z" },
    { userId: "member-2", workspaceId: "ws_team", role: "member", updatedAt: "2026-04-11T10:02:00.000Z" }
  ]);

  upsertWorkspaceMembersState(app as never, members);

  assert.equal(app.workspaceMembers.length, 3);
  assert.equal(app.leaveWorkspaceTransferMemberUserId, "member-1");
});

test("loadWorkspaceMembers normalizes rows, resets state, and clears loading flags", async () => {
  fetchAuthenticatedApiResponseMock.mockResolvedValue(new Response(JSON.stringify({
    memberships: [
      { userId: "owner-1", workspaceId: "ws_team", role: "owner", updatedAt: "2026-04-11T10:00:00.000Z" },
      { userId: "member-1", workspaceId: "ws_team", role: "member", updatedAt: "2026-04-11T10:01:00.000Z" },
      { userId: "", workspaceId: "ws_team", role: "member", updatedAt: "2026-04-11T10:02:00.000Z" }
    ]
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  }));

  const app = createApp({
    workspaceMembers: [{ userId: "stale", workspaceId: "ws_team", role: "member", status: "active", updatedAt: "2026-04-11T09:00:00.000Z" }]
  });

  const loaded = await loadWorkspaceMembers(app as never, {
    resetBeforeLoad: true,
    setLoadingState: true,
    expireAuthOn401: true
  });

  assert.equal(loaded, true);
  assert.equal(app.isWorkspaceMembersLoading, false);
  assert.deepEqual(app.workspaceMembers.map((member: { userId: string }) => member.userId), ["owner-1", "member-1"]);
  assert.equal(app.leaveWorkspaceTransferMemberUserId, "member-1");
  assert.equal(fetchAuthenticatedApiResponseMock.mock.calls[0]?.[1], "/workspaces/ws_team/members");
  assert.deepEqual(fetchAuthenticatedApiResponseMock.mock.calls[0]?.[3], { expireAuthOn401: true });
});

test("loadWorkspaceMembers surfaces auth and API failures without throwing", async () => {
  const noApiApp = createApp();
  resolveApiBaseUrlMock.mockReturnValue("");
  assert.equal(await loadWorkspaceMembers(noApiApp as never), false);
  assert.deepEqual(noApiApp.notify.mock.calls.at(-1), ["Workspace features are unavailable until the API base URL is configured.", "warning"]);

  resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");
  getStoredGoogleIdTokenMock.mockReturnValue("");
  const noTokenApp = createApp();
  assert.equal(await loadWorkspaceMembers(noTokenApp as never), false);
  assert.deepEqual(noTokenApp.notify.mock.calls.at(-1), ["Sign in with Google first.", "warning"]);

  getStoredGoogleIdTokenMock.mockReturnValue("google-token");
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: "nope" }), { status: 401 }));
  const expiredApp = createApp();
  assert.equal(await loadWorkspaceMembers(expiredApp as never, { setLoadingState: true }), false);
  assert.equal(expiredApp.isWorkspaceMembersLoading, false);
  assert.deepEqual(expiredApp.notify.mock.calls.at(-1), ["Your sign-in expired. Please sign in again.", "warning"]);

  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Members failed" }), { status: 500 }));
  const failedApp = createApp();
  assert.equal(await loadWorkspaceMembers(failedApp as never), false);
  assert.deepEqual(failedApp.notify.mock.calls.at(-1), ["Members failed", "error"]);
});

test("getWorkspaceMemberPresenceStateFromApp resolves online, recent, and offline states", () => {
  assert.equal(getWorkspaceMemberPresenceStateFromApp({
    workspacePresenceByUserId: {},
    workspaceRealtimeStatus: "connected",
    googleProfileUserId: "self-1"
  } as never, { userId: "self-1" }), "online");

  assert.equal(getWorkspaceMemberPresenceStateFromApp({
    workspacePresenceByUserId: {
      "user-2": {
        isOnline: false,
        lastSeenAt: "2026-04-11T11:55:00.000Z"
      }
    },
    workspaceRealtimeStatus: "connected",
    googleProfileUserId: "self-1"
  } as never, { userId: "user-2" }), "recent");

  assert.equal(getWorkspaceMemberPresenceStateFromApp({
    workspacePresenceByUserId: {
      "user-3": {
        isOnline: false,
        lastSeenAt: "2026-04-11T11:30:00.000Z"
      }
    },
    workspaceRealtimeStatus: "connected",
    googleProfileUserId: "self-1"
  } as never, { userId: "user-3" }), "offline");
});

test("formatRelativeLastSeen renders expected time buckets", () => {
  assert.equal(formatRelativeLastSeen(undefined), "Offline");
  assert.equal(formatRelativeLastSeen("2026-04-11T11:59:45.000Z"), "Active just now");
  assert.equal(formatRelativeLastSeen("2026-04-11T11:48:00.000Z"), "Active 12m ago");
  assert.equal(formatRelativeLastSeen("2026-04-11T09:00:00.000Z"), "Active 3h ago");
  assert.equal(formatRelativeLastSeen("2026-04-08T12:00:00.000Z"), "Active 3d ago");
});