import type { HttpRequest } from "@azure/functions";
import { HttpError } from "../auth";

export function assertMigrationAdminAccess(
  request: HttpRequest,
  configuredKey: string,
  apiEnv: "dev" | "prod"
): void {
  if (!configuredKey) {
    if (apiEnv === "prod") {
      throw new HttpError(500, "MIGRATIONS_ADMIN_KEY must be configured in production.");
    }
    return;
  }

  const providedKey = (request.headers.get("x-migration-key") ?? "").trim();
  if (!providedKey || providedKey !== configuredKey) {
    throw new HttpError(403, "Forbidden.");
  }
}

