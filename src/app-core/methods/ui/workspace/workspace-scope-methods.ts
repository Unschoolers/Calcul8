import type { AppContext, AppMethodState } from "../../../context-app.ts";
import { createSyncPayload } from "../sync/sync-payload.ts";
import { runCloudSyncPush } from "../sync/sync-service.ts";
import { resolveApiBaseUrl } from "../common/shared.ts";
import { loadWorkspaceMembers } from "./workspace-members.ts";
import {
  applyWorkspaceScope,
  normalizeWorkspaceSummaries,
  type WorkspaceCreateResponse,
  type WorkspaceListResponse
} from "./workspace-ui-helpers.ts";
import { fetchWorkspaceJson, getGoogleIdToken } from "./workspace-api.ts";

export const uiWorkspaceScopeMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "refreshWorkspaces"
  | "switchToPersonalWorkspace"
  | "switchToWorkspace"
  | "createWorkspace"
  | "handleWorkspaceAccessLost"
> = {
  async refreshWorkspaces(): Promise<boolean> {
    const googleIdToken = getGoogleIdToken();
    if (!googleIdToken) {
      this.availableWorkspaces = [];
      return false;
    }

    this.isWorkspaceLoading = true;
    try {
      const result = await fetchWorkspaceJson(this, "/workspaces/me", { method: "GET" }, "Failed to load workspaces.");
      if (!result.ok) return false;

      const body = result.body as WorkspaceListResponse;
      this.availableWorkspaces = normalizeWorkspaceSummaries(body.workspaces);

      if (
        this.activeScopeType === "workspace" &&
        (!this.activeWorkspaceId ||
          !this.availableWorkspaces.some((workspace) => workspace.workspaceId === this.activeWorkspaceId))
      ) {
        await applyWorkspaceScope(this, "personal", null, {
          pullFromCloud: false,
          getGoogleIdToken
        });
      } else if (this.activeScopeType === "workspace" && this.activeWorkspaceId) {
        void loadWorkspaceMembers(this, {
          setLoadingState: false,
          expireAuthOn401: false
        });
      }
      return true;
    } finally {
      this.isWorkspaceLoading = false;
    }
  },

  async switchToPersonalWorkspace(): Promise<void> {
    this.isWorkspaceLoading = true;
    try {
      await applyWorkspaceScope(this, "personal", null, { getGoogleIdToken });
    } finally {
      this.isWorkspaceLoading = false;
    }
  },

  async switchToWorkspace(workspaceId: string): Promise<void> {
    const normalizedWorkspaceId = String(workspaceId || "").trim();
    if (!normalizedWorkspaceId) return;

    if (!this.availableWorkspaces.some((workspace) => workspace.workspaceId === normalizedWorkspaceId)) {
      await this.refreshWorkspaces();
      if (!this.availableWorkspaces.some((workspace) => workspace.workspaceId === normalizedWorkspaceId)) {
        this.notify("That workspace is no longer available.", "warning");
        return;
      }
    }

    this.isWorkspaceLoading = true;
    try {
      await applyWorkspaceScope(this, "workspace", normalizedWorkspaceId, { getGoogleIdToken });
      await loadWorkspaceMembers(this, {
        setLoadingState: false,
        expireAuthOn401: false
      });
    } finally {
      this.isWorkspaceLoading = false;
    }
  },

  async createWorkspace(): Promise<void> {
    if (this.activeScopeType !== "personal") {
      this.notify("Create shared workspaces from Personal mode for now.", "warning");
      return;
    }

    const name = String(this.newWorkspaceName || "").trim();
    if (!name) {
      this.notify("Enter a workspace name.", "warning");
      return;
    }

    const baseUrl = resolveApiBaseUrl();
    const googleIdToken = getGoogleIdToken();
    if (!baseUrl) {
      this.notify("Workspace features are unavailable until the API base URL is configured.", "warning");
      return;
    }
    if (!googleIdToken) {
      this.notify("Sign in with Google first.", "warning");
      return;
    }

    this.isCreatingWorkspace = true;
    try {
      const createResult = await fetchWorkspaceJson(
        this,
        "/workspaces",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name
          })
        },
        "Failed to create workspace."
      );
      if (!createResult.ok) return;

      const createBody = createResult.body as WorkspaceCreateResponse;
      const createdWorkspaceId = String(createBody.workspace?.workspaceId ?? "").trim();
      if (!createdWorkspaceId) {
        this.notify("Workspace created, but no workspace ID was returned.", "warning");
        return;
      }
      const seedPayload = createSyncPayload({
        lots: this.lots,
        currentLotId: this.currentLotId,
        sales: this.sales,
        loadSalesForLotId: this.loadSalesForLotId,
        wheelConfigs: this.wheelConfigs,
        activeWheelConfigId: this.activeWheelConfigId,
        workspaceId: createdWorkspaceId
      });

      await runCloudSyncPush(
        this,
        true,
        {
          resolveApiBaseUrl: () => baseUrl,
          createSyncPayload: () => seedPayload,
          hasStorageItem: () => true
        },
        {
          scopeOverride: {
            scopeType: "workspace",
            workspaceId: createdWorkspaceId
          },
          treatConflictAsSuccess: true
        }
      );

      this.newWorkspaceName = "";
      this.showCreateWorkspaceModal = false;

      await this.refreshWorkspaces();
      await this.switchToWorkspace(createdWorkspaceId);
      this.notify("Workspace created", "success");
    } finally {
      this.isCreatingWorkspace = false;
    }
  },

  async handleWorkspaceAccessLost(workspaceId?: string): Promise<void> {
    const lostWorkspaceId = String(workspaceId ?? this.activeWorkspaceId ?? "").trim();
    const refreshResult = await this.refreshWorkspaces();

    if (!lostWorkspaceId) return;
    if (refreshResult !== false && this.availableWorkspaces.some((workspace) => workspace.workspaceId === lostWorkspaceId)) {
      return;
    }

    this.availableWorkspaces = this.availableWorkspaces.filter((workspace) => workspace.workspaceId !== lostWorkspaceId);

    if (this.activeScopeType === "workspace" && this.activeWorkspaceId === lostWorkspaceId) {
      await applyWorkspaceScope(this, "personal", null, { getGoogleIdToken });
    }

    this.notify("You no longer have access to that workspace. Switched back to Personal.", "warning");
  }
};
