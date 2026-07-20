import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { resolveUserId } from "../../lib/auth";
import { getEntitlement, listPlayPurchasesForUser } from "../../lib/cosmos/entitlementRepository";
import { getEffectiveSyncSnapshot } from "../../lib/cosmos/syncSnapshotRepository";
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import { listBuyerProfilesForActor } from "../buyerProfiles/services";

export async function accountExport(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /account/export failed",
    fallbackErrorMessage: "Failed to export account data.",
    operation: async ({ config }) => {
    const userId = await resolveUserId(request, config);
    const [entitlement, syncSnapshot, playPurchases, buyerProfiles] = await Promise.all([
      getEntitlement(config, userId),
      getEffectiveSyncSnapshot(config, userId),
      listPlayPurchasesForUser(config, userId),
      listBuyerProfilesForActor(config, userId)
    ]);

    const exportedAt = new Date().toISOString();
    return jsonResponse(request, config, 200, {
      userId,
      exportedAt,
      entitlement: entitlement ?? null,
      playPurchases,
      buyerProfiles,
      syncSnapshot: syncSnapshot ?? null
    });
    }
  });
}
