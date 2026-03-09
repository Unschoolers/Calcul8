import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError } from "../lib/auth";
import { getConfig } from "../lib/config";
import { errorResponse, jsonResponse, maybeHandleCorsPreflight, maybeHandleGlobalRateLimit } from "../lib/http";
import { assertMigrationAdminAccess, resolveMigrationActor } from "../lib/migrations/adminAuth";
import { getMigrationById } from "../lib/migrations/registry";
import { runMigration } from "../lib/migrations/runner";

interface MigrationRunRequestBody {
  migrationId: string;
  dryRun: boolean;
  note: string;
}

function parseMigrationRunRequestBody(raw: unknown): MigrationRunRequestBody {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new HttpError(400, "Request body must be an object.");
  }

  const payload = raw as {
    migrationId?: unknown;
    dryRun?: unknown;
    note?: unknown;
  };

  if (typeof payload.migrationId !== "string" || payload.migrationId.trim().length === 0) {
    throw new HttpError(400, "Field 'migrationId' is required.");
  }

  if (payload.dryRun != null && typeof payload.dryRun !== "boolean") {
    throw new HttpError(400, "Field 'dryRun' must be a boolean when provided.");
  }

  if (payload.note != null && typeof payload.note !== "string") {
    throw new HttpError(400, "Field 'note' must be a string when provided.");
  }

  return {
    migrationId: payload.migrationId.trim(),
    dryRun: payload.dryRun !== false,
    note: typeof payload.note === "string" && payload.note.trim().length > 0
      ? payload.note.trim()
      : "manual run"
  };
}

export async function migrationRun(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const preflightResponse = maybeHandleCorsPreflight(request, config);
  if (preflightResponse) return preflightResponse;

  const rateLimitResponse = maybeHandleGlobalRateLimit(request, config);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    assertMigrationAdminAccess(request, config.migrationsAdminKey, config.apiEnv);
    const actor = resolveMigrationActor(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body.");
    }

    const payload = parseMigrationRunRequestBody(body);
    const migration = getMigrationById(payload.migrationId);
    if (!migration) {
      throw new HttpError(404, `Migration '${payload.migrationId}' not found.`);
    }

    const run = await runMigration({
      migration,
      config,
      dryRun: payload.dryRun,
      triggeredByUserId: actor,
      note: payload.note
    });

    return jsonResponse(request, config, 200, {
      ok: true,
      migration: {
        id: migration.id,
        description: migration.description
      },
      run
    });
  } catch (error) {
    context.error("POST /migrations/run failed", error);
    return errorResponse(request, config, error, "Failed to run migration.");
  }
}

app.http("migrationRun", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "migrations/run",
  handler: migrationRun
});
