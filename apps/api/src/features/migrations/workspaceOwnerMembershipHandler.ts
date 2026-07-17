import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError } from "../../lib/auth";
import {
  auditWorkspaceOwnerMemberships,
  repairWorkspaceOwnerMembership
} from "../../lib/cosmos/workspaceRepository";
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import { readRequestJsonOrThrow, requireRequestBodyRecord } from "../../lib/httpRequest";
import { assertMigrationAdminAccess, resolveMigrationActor } from "../../lib/migrations/adminAuth";
import { logApiTelemetry } from "../../lib/telemetry";

function parseRequest(raw: unknown): { workspaceIds: string[]; applyRepairs: boolean } {
  const body = requireRequestBodyRecord(raw);
  if (!Array.isArray(body.workspaceIds)) {
    throw new HttpError(400, "Field 'workspaceIds' must be an array.");
  }
  const workspaceIds = Array.from(new Set(body.workspaceIds
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)));
  if (workspaceIds.length < 1 || workspaceIds.length > 100) {
    throw new HttpError(400, "Field 'workspaceIds' must contain between 1 and 100 unique ids.");
  }
  if (body.applyRepairs != null && typeof body.applyRepairs !== "boolean") {
    throw new HttpError(400, "Field 'applyRepairs' must be a boolean when provided.");
  }
  return { workspaceIds, applyRepairs: body.applyRepairs === true };
}

export async function workspaceOwnerMembershipRepair(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /migrations/workspace-owner-memberships failed",
    fallbackErrorMessage: "Failed to audit workspace owner memberships.",
    operation: async ({ config }) => {
    assertMigrationAdminAccess(request, config.migrationsAdminKey, config.apiEnv);
    const requestedBy = resolveMigrationActor(request);
    const payload = parseRequest(await readRequestJsonOrThrow(request));
    const findings = await auditWorkspaceOwnerMemberships(config, payload.workspaceIds);
    const repairedWorkspaceIds: string[] = [];
    if (payload.applyRepairs) {
      for (const finding of findings) {
        await repairWorkspaceOwnerMembership(config, finding.workspaceId, finding.ownerUserId);
        repairedWorkspaceIds.push(finding.workspaceId);
      }
    }
    logApiTelemetry({
      logger: context,
      level: findings.length > 0 ? "warn" : "info",
      request,
      config,
      route: "workspace_owner_membership_repair",
      workspaceScope: "workspace",
      outcome: payload.applyRepairs
        ? (findings.length === repairedWorkspaceIds.length ? "repair_succeeded" : "repair_incomplete")
        : (findings.length > 0 ? "audit_findings" : "audit_clean")
    });
    return jsonResponse(request, config, 200, {
      ok: true,
      requestedBy,
      mode: payload.applyRepairs ? "repair" : "audit",
      auditedCount: payload.workspaceIds.length,
      findings,
      repairedWorkspaceIds
    });
    }
  });
}
