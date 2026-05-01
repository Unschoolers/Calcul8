import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { resolveUserId } from "../../lib/auth";
import { getConfig } from "../../lib/config";
import { getEntitlement, listPlayPurchasesForUser } from "../../lib/cosmos/entitlementRepository";
import { getEffectiveSyncSnapshot } from "../../lib/cosmos/syncSnapshotRepository";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../../lib/http";

export async function accountExport(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const userId = await resolveUserId(request, config);
    const [entitlement, syncSnapshot, playPurchases] = await Promise.all([
      getEntitlement(config, userId),
      getEffectiveSyncSnapshot(config, userId),
      listPlayPurchasesForUser(config, userId)
    ]);

    const exportedAt = new Date().toISOString();
    return jsonResponse(request, config, 200, {
      userId,
      exportedAt,
      entitlement: entitlement ?? null,
      playPurchases,
      syncSnapshot: syncSnapshot ?? null
    });
  } catch (error) {
    context.error("POST /account/export failed", error);
    return errorResponse(request, config, error, "Failed to export account data.");
  }
}