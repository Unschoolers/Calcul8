import type { WorkspaceApiContext } from "../../../context/workspace.ts";
import { fetchAuthenticatedApiResponse, handleExpiredAuth, isApiRequestAborted, resolveApiBaseUrl } from "../common/shared.ts";
import { getStoredGoogleIdToken, hasAuthSignal } from "../../../auth/index.ts";
import { bootstrapServerSessionStatus } from "../auth/auth-session.ts";
import { parseWorkspaceApiError } from "./workspace-ui-helpers.ts";

export function getGoogleIdToken(): string {
  const token = getStoredGoogleIdToken();
  if (token) return token;
  return hasAuthSignal() ? "session" : "";
}

export async function fetchWorkspaceJson(
  app: WorkspaceApiContext,
  path: string,
  init: RequestInit,
  fallbackMessage: string,
  options: { errorMessagesByCode?: Readonly<Record<string, string>>; retryUnsafeMethods?: boolean } = {}
): Promise<{ ok: true; response: Response; body: unknown } | { ok: false; handled: true }> {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) {
    app.notify("Workspace features are unavailable until the API base URL is configured.", "warning");
    return { ok: false, handled: true };
  }

  if (!hasAuthSignal()) {
    app.notify("Sign in with Google first.", "warning");
    return { ok: false, handled: true };
  }

  let response: Response;
  try {
    response = await fetchAuthenticatedApiResponse(app, path, init, {
      expireAuthOn401: false,
      retryUnsafeMethods: options.retryUnsafeMethods
    });
  } catch (error) {
    if (isApiRequestAborted(error)) return { ok: false, handled: true };
    const message = error instanceof Error ? error.message : "";
    const isOfflineFailure =
      message.includes("Failed to fetch")
      || message.includes("NetworkError")
      || message.includes("Load failed")
      || message.includes("fetch");
    app.notify(
      isOfflineFailure
        ? "You're offline. Workspace data will refresh when the connection returns."
        : fallbackMessage,
      "warning"
    );
    return { ok: false, handled: true };
  }

  if (response.status === 401) {
    const bootstrapToken = getStoredGoogleIdToken();
    if (bootstrapToken) {
      const bootstrapResult = await bootstrapServerSessionStatus(app, baseUrl);
      if (init.signal?.aborted) return { ok: false, handled: true };
      if (bootstrapResult.ok) {
        try {
          response = await fetchAuthenticatedApiResponse(app, path, init, {
            expireAuthOn401: false,
            retryUnsafeMethods: options.retryUnsafeMethods
          });
        } catch (error) {
          if (isApiRequestAborted(error)) return { ok: false, handled: true };
          throw error;
        }
        if (response.status !== 401) {
          return await parseWorkspaceJsonResponse(response);
        }
      }

      if (!bootstrapResult.authExpired) {
        return { ok: false, handled: true };
      }
    }

    handleExpiredAuth(app);
    app.notify("Your sign-in expired. Please sign in again.", "warning");
    return { ok: false, handled: true };
  }

  if (!response.ok) {
    app.notify(await parseWorkspaceApiError(response, fallbackMessage, options.errorMessagesByCode), "error");
    return { ok: false, handled: true };
  }

  return await parseWorkspaceJsonResponse(response);
}

async function parseWorkspaceJsonResponse(response: Response): Promise<{ ok: true; response: Response; body: unknown }> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    ok: true,
    response,
    body
  };
}
