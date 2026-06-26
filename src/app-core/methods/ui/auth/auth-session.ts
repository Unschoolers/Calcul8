import type { AppContext } from "../../../context-app.ts";
import {
  buildAuthenticatedHeaders,
  clearStoredCsrfToken,
  clearStoredSessionUserId,
  hasAuthSignal,
  setStoredSessionUserId
} from "../../../auth/index.ts";
import { fetchWithRetry } from "../common/api-client.ts";

interface AuthMeResponse {
  userId?: unknown;
}

export interface ServerSessionBootstrapResult {
  ok: boolean;
  authExpired: boolean;
}

function normalizeUserId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function bootstrapServerSessionStatus(
  app: Pick<AppContext, "googleAuthEpoch">,
  baseUrl: string
): Promise<ServerSessionBootstrapResult> {
  const normalizedBaseUrl = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!normalizedBaseUrl) {
    clearStoredSessionUserId();
    clearStoredCsrfToken();
    return { ok: false, authExpired: false };
  }

  const hadAuthSignal = hasAuthSignal();

  try {
    const requestUrl = `${normalizedBaseUrl}/auth/me`;
    const response = await fetchWithRetry(requestUrl, {
      method: "GET",
      headers: buildAuthenticatedHeaders("bearer-required", {}, requestUrl)
    });

    if (response.status === 401) {
      clearStoredSessionUserId();
      clearStoredCsrfToken();
      return { ok: false, authExpired: true };
    }

    if (!response.ok) {
      return { ok: false, authExpired: false };
    }

    let payload: AuthMeResponse | null = null;
    try {
      payload = await response.json() as AuthMeResponse;
    } catch {
      payload = null;
    }

    const userId = normalizeUserId(payload?.userId);
    if (!userId) {
      clearStoredSessionUserId();
      return { ok: false, authExpired: false };
    }

    setStoredSessionUserId(userId);
    if (!hadAuthSignal) {
      app.googleAuthEpoch += 1;
    }
    return { ok: true, authExpired: false };
  } catch {
    return { ok: false, authExpired: false };
  }
}

export async function bootstrapServerSession(
  app: Pick<AppContext, "googleAuthEpoch">,
  baseUrl: string
): Promise<boolean> {
  const result = await bootstrapServerSessionStatus(app, baseUrl);
  return result.ok;
}
