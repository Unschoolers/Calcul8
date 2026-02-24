import type { HttpRequest } from "@azure/functions";
import type { ApiConfig } from "../types";
import { fetchWithRetry } from "./retry";

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function sanitizeUserId(rawUserId: string): string {
  // Keep only URL-safe characters to avoid key/path injection in storage IDs.
  return rawUserId.replace(/[^A-Za-z0-9._:@-]/g, "").trim();
}

interface GoogleTokenInfoResponse {
  aud?: string;
  sub?: string;
}

async function verifyGoogleIdToken(idToken: string, config: ApiConfig): Promise<string | null> {
  const response = await fetchWithRetry(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    {
      method: "GET"
    },
    {
      maxAttempts: 3,
      timeoutMs: 8_000
    }
  );
  if (!response.ok) return null;

  const payload = (await response.json()) as GoogleTokenInfoResponse;
  const tokenSub = sanitizeUserId(payload.sub ?? "");
  if (!tokenSub) return null;

  if (config.googleClientId && payload.aud !== config.googleClientId) {
    return null;
  }

  return tokenSub;
}

export async function resolveUserId(request: HttpRequest, config: ApiConfig): Promise<string> {
  const authHeader = request.headers.get("authorization") || "";
  const isBearer = authHeader.toLowerCase().startsWith("bearer ");
  if (isBearer) {
    const idToken = authHeader.slice(7).trim();
    if (idToken) {
      const userId = await verifyGoogleIdToken(idToken, config);
      if (userId) return userId;
      throw new HttpError(401, "Invalid Google ID token.");
    }
  }

  throw new HttpError(401, "Authentication is required.");
}
