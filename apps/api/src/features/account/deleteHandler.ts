import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { clearSessionCookie, resolveUserId } from "../../lib/auth";
import { getConfig } from "../../lib/config";
import { revokeAllRefreshSessionsForUser, revokeAllSessionsForUser } from "../../lib/cosmos/sessionRepository";
import { deleteAllEntitlementDataForUser } from "../../lib/cosmos/entitlementRepository";
import { deleteAllSyncData } from "../../lib/cosmos/syncSnapshotRepository";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../../lib/http";
import { eraseAccountData } from "./accountErasureService";

export async function accountDelete(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = await maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const userId = await resolveUserId(request, config);

    await Promise.all([
      deleteAllEntitlementDataForUser(config, userId),
      deleteAllSyncData(config, userId),
      eraseAccountData(config, userId)
    ]);
    // Keep the authenticated session available until erasure succeeds so a
    // transient storage failure can be retried by the account owner.
    await Promise.all([
      revokeAllSessionsForUser(config, userId),
      revokeAllRefreshSessionsForUser(config, userId)
    ]);
    await clearSessionCookie(request, config);

    const deletedAt = new Date().toISOString();
    return jsonResponse(request, config, 200, {
      ok: true,
      userId,
      deletedAt
    });
  } catch (error) {
    context.error("POST /account/delete failed", error);
    return errorResponse(request, config, error, "Failed to delete account data.");
  }
}
