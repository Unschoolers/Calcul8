import type { ApiConfig } from "../../../types";
import { fetchWithRetry } from "../../retry";
import type { BearerAuthProvider } from "./types";

interface GoogleTokenInfoResponse {
  aud?: string;
  sub?: string;
}

function sanitizeUserId(rawUserId: string): string {
  return rawUserId.replace(/[^A-Za-z0-9._:@-]/g, "").trim();
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

export const googleBearerAuthProvider: BearerAuthProvider = {
  name: "google",
  resolveUserIdFromBearerToken: verifyGoogleIdToken
};
