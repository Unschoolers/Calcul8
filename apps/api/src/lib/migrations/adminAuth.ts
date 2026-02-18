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

export function resolveMigrationActor(request: HttpRequest): string {
  const raw = (request.headers.get("x-admin-id") ?? "").trim();
  if (!raw) return "migration-admin";
  return raw.slice(0, 128);
}
