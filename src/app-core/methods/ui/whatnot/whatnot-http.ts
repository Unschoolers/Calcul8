import type {
  WhatnotConnectionContext,
  WhatnotHttpContext,
  WhatnotScopeContext
} from "../../../context/whatnot.ts";
import { fetchAuthenticatedApiResponse, handleExpiredAuth, resolveApiBaseUrl } from "../common/shared.ts";

export function canManageWhatnot(
  app: Pick<WhatnotConnectionContext, "activeScopeType" | "isCurrentWorkspaceOwner">
): boolean {
  return app.activeScopeType === "personal" || app.isCurrentWorkspaceOwner;
}

export function buildWhatnotScopeBody(app: WhatnotScopeContext): Record<string, string> {
  return {
    ...(app.activeScopeType === "workspace" && app.activeWorkspaceId
      ? { workspaceId: app.activeWorkspaceId }
      : {}),
    appReturnUrl: window.location.origin
  };
}

export async function fetchWhatnotJson(
  app: WhatnotHttpContext,
  path: string,
  init: RequestInit,
  fallbackMessage: string,
  options: {
    expireAuthOn401?: boolean;
    errorMessagesByCode?: Readonly<Record<string, string>>;
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
    const errorBody = body as { code?: unknown; error?: unknown } | null;
    const errorCode = String(errorBody?.code ?? "").trim();
    const message = String(
      (errorCode ? options.errorMessagesByCode?.[errorCode] : undefined)
      ?? errorBody?.error
      ?? fallbackMessage
    ).trim() || fallbackMessage;
    app.notify(message, "error");
    return { ok: false };
  }

  return { ok: true, body };
}
