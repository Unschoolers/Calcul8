import { createHmac } from "node:crypto";
import type { ApiConfig } from "../../types";

export function createSessionCsrfToken(sessionId: string, config: ApiConfig): string {
  const secret = String(config.cosmosKey || "").trim() || "whatfees-dev-csrf-secret";
  return createHmac("sha256", secret)
    .update(`csrf:${sessionId}`)
    .digest("base64url");
}
