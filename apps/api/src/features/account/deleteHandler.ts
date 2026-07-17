import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { clearSessionCookie, resolveUserId } from "../../lib/auth";
import { revokeAllRefreshSessionsForUser, revokeAllSessionsForUser } from "../../lib/cosmos/sessionRepository";
import { deleteAllEntitlementDataForUser } from "../../lib/cosmos/entitlementRepository";
import { deleteAllSyncData } from "../../lib/cosmos/syncSnapshotRepository";
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import { eraseAccountData } from "./accountErasureService";

export async function accountDelete(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /account/delete failed",
    fallbackErrorMessage: "Failed to delete account data.",
    operation: async ({ config }) => {
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
    }
  });
}
