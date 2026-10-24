import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const {
  fetchAuthenticatedApiResponseMock,
  hasAuthSignalMock,
  resolveApiBaseUrlMock
} = vi.hoisted(() => ({
  fetchAuthenticatedApiResponseMock: vi.fn(),
  hasAuthSignalMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn()
}));

vi.mock("../src/app-core/auth/index.ts", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/app-core/auth/index.ts")>(),
  hasAuthSignal: hasAuthSignalMock
}));

vi.mock("../src/app-core/methods/ui/common/shared.ts", () => ({
  fetchAuthenticatedApiResponse: fetchAuthenticatedApiResponseMock,
  resolveApiBaseUrl: resolveApiBaseUrlMock,
  isApiNetworkFailure: (error: unknown) => error instanceof TypeError,
  isApiRequestAborted: (error: unknown) => error instanceof DOMException && error.name === "AbortError"
}));

import {
  formatRelativeLastSeen,
  getTransferCandidates,
  getWorkspaceMemberPresenceStateFromApp,
  loadWorkspaceMembers,
  normalizeWorkspaceMember,
  normalizeWorkspaceMembers,
  upsertWorkspaceMembersState
} from "../src/app-core/methods/ui/workspace/workspace-members.ts";
import { uiWorkspaceMembershipMethods } from "../src/app-core/methods/ui/workspace/workspace-membership-methods.ts";

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
  hasAuthSignalMock.mockReturnValue(true);
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
  resolveApiBaseUrlMock.mockReturnValue("");
  const noApiEnApp = createApp();
  assert.equal(await loadWorkspaceMembers(noApiEnApp as never), false);
  assert.deepEqual(noApiEnApp.notify.mock.calls.at(-1), ["Workspace features are unavailable until the API base URL is configured.", "warning"]);
  const noApiApp = createApp({ preferredLanguage: "fr-CA" });
  assert.equal(await loadWorkspaceMembers(noApiApp as never), false);
  assert.deepEqual(noApiApp.notify.mock.calls.at(-1), ["Les fonctions d’espace partagé ne sont pas disponibles tant que l’URL de l’API n’est pas configurée.", "warning"]);

  resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");
  hasAuthSignalMock.mockReturnValue(false);
  const noTokenEnApp = createApp();
  assert.equal(await loadWorkspaceMembers(noTokenEnApp as never), false);
  assert.deepEqual(noTokenEnApp.notify.mock.calls.at(-1), ["Sign in with Google first.", "warning"]);
  const noTokenApp = createApp({ preferredLanguage: "fr-CA" });
  assert.equal(await loadWorkspaceMembers(noTokenApp as never), false);
  assert.deepEqual(noTokenApp.notify.mock.calls.at(-1), ["Connectez-vous d’abord avec Google.", "warning"]);

  hasAuthSignalMock.mockReturnValue(true);
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: "nope" }), { status: 401 }));
  const expiredEnApp = createApp();
  assert.equal(await loadWorkspaceMembers(expiredEnApp as never, { setLoadingState: true }), false);
  assert.deepEqual(expiredEnApp.notify.mock.calls.at(-1), ["Your sign-in expired. Please sign in again.", "warning"]);

  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: "nope" }), { status: 401 }));
  const expiredApp = createApp({ preferredLanguage: "fr-CA" });
  assert.equal(await loadWorkspaceMembers(expiredApp as never, { setLoadingState: true }), false);
  assert.equal(expiredApp.isWorkspaceMembersLoading, false);
  assert.deepEqual(expiredApp.notify.mock.calls.at(-1), ["Votre session a expiré. Veuillez vous reconnecter.", "warning"]);

  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Members failed" }), { status: 500 }));
  const failedApp = createApp();
  assert.equal(await loadWorkspaceMembers(failedApp as never), false);
  assert.deepEqual(failedApp.notify.mock.calls.at(-1), ["Members failed", "error"]);
});

test("loadWorkspaceMembers preserves fetch rejection behavior", async () => {
  fetchAuthenticatedApiResponseMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await assert.rejects(loadWorkspaceMembers(createApp({ preferredLanguage: "fr-CA" }) as never), TypeError);

  const arbitrary = new Error("unexpected parser failure");
  fetchAuthenticatedApiResponseMock.mockRejectedValueOnce(arbitrary);
  await assert.rejects(loadWorkspaceMembers(createApp({ preferredLanguage: "fr-CA" }) as never), (error: unknown) => error === arbitrary);
});

test("loadWorkspaceMembers silently returns when its response body is aborted", async () => {
  const response = new Response("{}");
  Object.defineProperty(response, "json", { value: async () => { throw new DOMException("Aborted", "AbortError"); } });
  fetchAuthenticatedApiResponseMock.mockResolvedValueOnce(response);
  const app = createApp({ preferredLanguage: "fr-CA" });

  assert.equal(await loadWorkspaceMembers(app as never, { setLoadingState: true }), false);
  assert.equal(app.notify.mock.calls.length, 0);
  assert.equal(app.isWorkspaceMembersLoading, false);
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

test("workspace presence labels use the preferred language and keep the existing time buckets", () => {
  const app = createApp({
    preferredLanguage: "fr-CA",
    workspaceRealtimeStatus: "connected",
    workspacePresenceByUserId: {
      "user-2": { isOnline: false, lastSeenAt: "2026-04-11T11:55:00.000Z" },
      "user-3": { isOnline: false, lastSeenAt: "2026-04-11T09:00:00.000Z" }
    }
  });

  assert.equal(uiWorkspaceMembershipMethods.getWorkspaceMemberPresenceLabel.call(app as never, { userId: "user-1" }), "Hors ligne");
  assert.equal(uiWorkspaceMembershipMethods.getWorkspaceMemberPresenceLabel.call(app as never, { userId: "user-2" }), "Actif il y a 5 min");
  assert.equal(uiWorkspaceMembershipMethods.getWorkspaceMemberPresenceLabel.call(app as never, { userId: "user-3" }), "Hors ligne");
  assert.equal(formatRelativeLastSeen("2026-04-11T09:00:00.000Z", "fr-CA"), "Actif il y a 3 h");
  assert.equal(formatRelativeLastSeen("2026-04-08T12:00:00.000Z", "fr-CA"), "Actif il y a 3 j");

  const defaultLanguageApp = createApp({ workspaceRealtimeStatus: "connected" });
  assert.equal(uiWorkspaceMembershipMethods.getWorkspaceMemberPresenceLabel.call(defaultLanguageApp as never, { userId: "user-1" }), "Offline");
  assert.equal(formatRelativeLastSeen("2026-04-11T11:59:45.000Z", "en"), "Active just now");
});
