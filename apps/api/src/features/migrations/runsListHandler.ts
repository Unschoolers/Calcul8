import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError } from "../../lib/auth";
import { listMigrationRuns } from "../../lib/cosmos/migrationRepository";
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import { assertMigrationAdminAccess, resolveMigrationActor } from "../../lib/migrations/adminAuth";

function getQueryParam(request: HttpRequest, key: string): string | null {
  if (request.query && typeof request.query.get === "function") {
    return request.query.get(key);
  }

  if (!request.url) return null;
  try {
    return new URL(request.url).searchParams.get(key);
  } catch {
    return null;
  }
}

function parseLimit(rawLimit: string | null): number {
  if (!rawLimit) return 20;
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, "Query param 'limit' must be a number.");
  }
  const intLimit = Math.floor(parsed);
  if (intLimit < 1 || intLimit > 100) {
    throw new HttpError(400, "Query param 'limit' must be between 1 and 100.");
  }
  return intLimit;
}

export async function migrationRunsList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "GET /migrations/runs failed",
    fallbackErrorMessage: "Failed to list migration runs.",
    operation: async ({ config }) => {
    assertMigrationAdminAccess(request, config.migrationsAdminKey, config.apiEnv);
    const requestedBy = resolveMigrationActor(request);
    const migrationId = (getQueryParam(request, "migrationId") ?? "").trim() || undefined;
    const limit = parseLimit(getQueryParam(request, "limit"));

    const runs = await listMigrationRuns(config, { migrationId, limit });
    return jsonResponse(request, config, 200, {
      ok: true,
      requestedBy,
      migrationId: migrationId ?? null,
      limit,
      count: runs.length,
      runs
    });
    }
  });
}
