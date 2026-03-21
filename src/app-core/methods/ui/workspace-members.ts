import type { AppContext } from "../../context.ts";
import type { WorkspaceMember } from "../../../types/app.ts";
import { buildAuthenticatedHeaders, getStoredGoogleIdToken } from "../../auth/index.ts";
import { fetchWithRetry, handleExpiredAuth, resolveApiBaseUrl } from "./shared.ts";

type WorkspaceApiError = {
  error?: unknown;
  message?: unknown;
};

type WorkspaceMembersResponse = {
  memberships?: unknown;
};

async function parseApiError(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const body = (await response.json()) as WorkspaceApiError;
    const errorMessage = typeof body.error === "string" ? body.error.trim() : "";
    if (errorMessage) return errorMessage;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (message) return message;
  } catch {
    // Ignore JSON parsing errors and use fallback message.
  }

  return fallbackMessage;
}

export function normalizeWorkspaceMember(value: unknown): WorkspaceMember | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    userId?: unknown;
    workspaceId?: unknown;
    role?: unknown;
    status?: unknown;
    updatedAt?: unknown;
    displayName?: unknown;
    photoUrl?: unknown;
  };
  const userId = String(candidate.userId ?? "").trim();
  const workspaceId = String(candidate.workspaceId ?? "").trim();
  const role = candidate.role === "owner" ? "owner" : candidate.role === "member" ? "member" : null;
  const status = candidate.status === "disabled" || candidate.status === "removed" ? candidate.status : "active";
  const updatedAt = String(candidate.updatedAt ?? "").trim();
  if (!userId || !workspaceId || !role || !updatedAt) {
    return null;
  }

  return {
    userId,
    workspaceId,
    role,
    status,
    updatedAt,
    displayName: typeof candidate.displayName === "string" && candidate.displayName.trim()
      ? candidate.displayName.trim()
      : undefined,
    photoUrl: typeof candidate.photoUrl === "string" && candidate.photoUrl.trim()
      ? candidate.photoUrl.trim()
      : undefined
  };
}

export function normalizeWorkspaceMembers(value: unknown): WorkspaceMember[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeWorkspaceMember(entry))
    .filter((entry): entry is WorkspaceMember => entry != null);
}

export function getTransferCandidates(
  app: Pick<AppContext, "workspaceMembers">
): WorkspaceMember[] {
  return app.workspaceMembers.filter(
    (member) => member.status === "active" && member.role === "member"
  );
}

export function upsertWorkspaceMembersState(
  app: Pick<AppContext, "workspaceMembers" | "leaveWorkspaceTransferMemberUserId">,
  members: WorkspaceMember[]
): void {
  app.workspaceMembers = members;
  app.leaveWorkspaceTransferMemberUserId = getTransferCandidates(app as AppContext)[0]?.userId ?? "";
}

export async function loadWorkspaceMembers(
  app: Pick<
    AppContext,
    | "activeWorkspaceId"
    | "workspaceMembers"
    | "isWorkspaceMembersLoading"
    | "leaveWorkspaceTransferMemberUserId"
    | "notify"
  >,
  options: {
    resetBeforeLoad?: boolean;
    setLoadingState?: boolean;
  } = {}
): Promise<boolean> {
  const activeWorkspaceId = String(app.activeWorkspaceId ?? "").trim();
  if (!activeWorkspaceId) {
    return false;
  }

  if (options.resetBeforeLoad) {
    app.workspaceMembers = [];
  }

  if (options.setLoadingState) {
    app.isWorkspaceMembersLoading = true;
  }

  try {
    const baseUrl = resolveApiBaseUrl();
    if (!baseUrl) {
      app.notify("Workspace features are unavailable until the API base URL is configured.", "warning");
      return false;
    }

    const googleIdToken = getStoredGoogleIdToken();
    if (!googleIdToken) {
      app.notify("Sign in with Google first.", "warning");
      return false;
    }

    const response = await fetchWithRetry(`${baseUrl}/workspaces/${encodeURIComponent(activeWorkspaceId)}/members`, {
      method: "GET",
      headers: buildAuthenticatedHeaders("session-preferred")
    });

    if (response.status === 401) {
      handleExpiredAuth(app as AppContext);
      app.notify("Your sign-in expired. Please sign in again.", "warning");
      return false;
    }

    if (!response.ok) {
      app.notify(await parseApiError(response, "Failed to load workspace members."), "error");
      return false;
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    upsertWorkspaceMembersState(app, normalizeWorkspaceMembers((body as WorkspaceMembersResponse | null)?.memberships));
    return true;
  } finally {
    if (options.setLoadingState) {
      app.isWorkspaceMembersLoading = false;
    }
  }
}

export function getWorkspaceMemberPresenceStateFromApp(
  app: Pick<AppContext, "workspacePresenceByUserId">,
  member: Pick<WorkspaceMember, "userId">
): "online" | "recent" | "offline" {
  const presence = app.workspacePresenceByUserId[String(member.userId || "").trim()];
  if (!presence) return "offline";
  if (presence.isOnline) return "online";

  const lastSeenAtMs = Date.parse(String(presence.lastSeenAt || ""));
  if (Number.isFinite(lastSeenAtMs) && (Date.now() - lastSeenAtMs) <= 10 * 60 * 1000) {
    return "recent";
  }

  return "offline";
}

export function formatRelativeLastSeen(lastSeenAt: string | undefined): string {
  const lastSeenAtMs = Date.parse(String(lastSeenAt || ""));
  if (!Number.isFinite(lastSeenAtMs)) {
    return "Offline";
  }

  const elapsedMs = Math.max(0, Date.now() - lastSeenAtMs);
  if (elapsedMs < 60_000) {
    return "Active just now";
  }

  const elapsedMinutes = Math.round(elapsedMs / 60_000);
  if (elapsedMinutes < 60) {
    return `Active ${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `Active ${elapsedHours}h ago`;
  }

  const elapsedDays = Math.round(elapsedHours / 24);
  return `Active ${elapsedDays}d ago`;
}
