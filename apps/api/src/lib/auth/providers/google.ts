import type { ApiConfig } from "../../../types";
import { fetchWithRetry } from "../../retry";
import type { BearerAuthIdentity, BearerAuthProvider } from "./types";

interface GoogleTokenInfoResponse {
  aud?: string;
  sub?: string;
  name?: string;
  picture?: string;
}

function sanitizeUserId(rawUserId: string): string {
  return rawUserId.replace(/[^A-Za-z0-9._:@-]/g, "").trim();
}

async function verifyGoogleIdToken(idToken: string, config: ApiConfig): Promise<BearerAuthIdentity | null> {
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

  const displayName = typeof payload.name === "string" ? payload.name.trim() : "";
  const photoUrl = typeof payload.picture === "string" ? payload.picture.trim() : "";

  return {
    userId: tokenSub,
    displayName: displayName || undefined,
    photoUrl: photoUrl || undefined
  };
}

export const googleBearerAuthProvider: BearerAuthProvider = {
  name: "google",
  resolveIdentityFromBearerToken: verifyGoogleIdToken
};
