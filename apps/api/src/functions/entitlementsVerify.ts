import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { getConfig } from "../lib/config";
import { errorResponse, jsonResponse, maybeHandleCorsPreflight } from "../lib/http";
import { verifyPlayEntitlementRequest } from "./entitlementsVerifyPlay";

function resolveProvider(request: HttpRequest): string {
  return (request.params?.provider ?? "").trim().toLowerCase();
}

const SUPPORTED_PURCHASE_PROVIDERS = ["play"] as const;

export async function entitlementsVerify(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const preflightResponse = maybeHandleCorsPreflight(request, config);
  if (preflightResponse) return preflightResponse;

  try {
    const provider = resolveProvider(request);

    if (provider === "play") {
      return verifyPlayEntitlementRequest(request, context, config);
    }

    return jsonResponse(request, config, 501, {
      error: `Purchase provider '${provider || "unknown"}' is not supported.`,
      supportedProviders: SUPPORTED_PURCHASE_PROVIDERS
    });
  } catch (error) {
    context.error("POST /entitlements/verify/{provider} failed", error);
    return errorResponse(request, config, error, "Failed to verify purchase.");
  }
}

app.http("entitlementsVerify", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "entitlements/verify/{provider}",
  handler: entitlementsVerify
});
