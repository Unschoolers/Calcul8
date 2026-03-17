import type { AppComputedObject } from "./context.ts";
import { authProfileComputed } from "./computed/auth-profile.ts";
import { singlesComputed } from "./computed/singles.ts";
import { forecastComputed } from "./computed/forecast.ts";
import { portfolioComputed } from "./computed/portfolio.ts";

export const appComputed: AppComputedObject = {
  ...authProfileComputed,
  isWorkspaceScopeActive() {
    return this.activeScopeType === "workspace" && !!this.activeWorkspaceId;
  },
  currentWorkspaceSummary() {
    if (this.activeScopeType !== "workspace" || !this.activeWorkspaceId) {
      return null;
    }

    return this.availableWorkspaces.find((workspace) => workspace.workspaceId === this.activeWorkspaceId) ?? null;
  },
  currentWorkspaceName() {
    if (this.currentWorkspaceSummary) {
      return this.currentWorkspaceSummary.name;
    }

    return "Personal";
  },
  isCurrentWorkspaceOwner() {
    return this.currentWorkspaceSummary?.role === "owner";
  },
  ...singlesComputed,
  ...forecastComputed,
  ...portfolioComputed
};
