import type { AppContext } from "../../../context-app.ts";
import { fetchAuthenticatedApiResponse, handleExpiredAuth, resolveApiBaseUrl } from "../common/shared.ts";
import type { WhatnotApp } from "./whatnot-types.ts";

export function canManageWhatnot(app: Pick<AppContext, "activeScopeType" | "isCurrentWorkspaceOwner">): boolean {
  return app.activeScopeType === "personal" || app.isCurrentWorkspaceOwner;
}

export function buildWhatnotScopeBody(app: Pick<AppContext, "activeScopeType" | "activeWorkspaceId">): Record<string, string> {
  return {
    ...(app.activeScopeType === "workspace" && app.activeWorkspaceId
      ? { workspaceId: app.activeWorkspaceId }
      : {}),
    appReturnUrl: window.location.origin
  };
}

export async function fetchWhatnotJson(
  app: WhatnotApp,
  path: string,
  init: RequestInit,
  fallbackMessage: string,
  options: {
    expireAuthOn401?: boolean;
  } = {}
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) {
    app.notify("Whatnot integration is unavailable until the API base URL is configured.", "warning");
    return { ok: false };
  }

  const response = await fetchAuthenticatedApiResponse(app, path, init, options);

  if (response.status === 401) {
    if (options.expireAuthOn401 !== false) {
      handleExpiredAuth(app);
    }
    app.notify("Your sign-in expired. Please sign in again.", "warning");
    return { ok: false };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = String((body as { error?: unknown } | null)?.error ?? fallbackMessage).trim() || fallbackMessage;
    app.notify(message, "error");
    return { ok: false };
  }

  return { ok: true, body };
}
