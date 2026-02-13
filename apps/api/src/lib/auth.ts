import type { HttpRequest } from "@azure/functions";
import type { ApiConfig } from "../types";

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

export function resolveUserId(request: HttpRequest, config: ApiConfig): string {
  const headerUserId = request.headers.get("x-user-id");
  if (headerUserId) {
    const userId = sanitizeUserId(headerUserId);
    if (userId.length > 0) return userId;
  }

  if (config.authBypassDev && config.apiEnv === "dev") {
    throw new HttpError(
      401,
      "Missing x-user-id. In dev mode, send x-user-id header until Google auth is wired."
    );
  }

  throw new HttpError(401, "Authentication is required.");
}
