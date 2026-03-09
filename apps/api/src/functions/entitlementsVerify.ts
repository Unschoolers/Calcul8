import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { getConfig } from "../lib/config";
import { errorResponse, jsonResponse, maybeHandleCorsPreflight, maybeHandleGlobalRateLimit } from "../lib/http";
import { getSupportedPurchaseProviders, resolvePurchaseVerifier } from "./purchaseVerifiers";

function resolveProvider(request: HttpRequest): string {
  return (request.params?.provider ?? "").trim().toLowerCase();
}

export async function entitlementsVerify(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const preflightResponse = maybeHandleCorsPreflight(request, config);
  if (preflightResponse) return preflightResponse;

  const rateLimitResponse = maybeHandleGlobalRateLimit(request, config);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const provider = resolveProvider(request);
    const verifier = resolvePurchaseVerifier(provider);

    if (verifier) {
      return verifier(request, context, config, "/entitlements/verify/{provider}");
    }

    return jsonResponse(request, config, 501, {
      error: `Purchase provider '${provider || "unknown"}' is not supported.`,
      supportedProviders: getSupportedPurchaseProviders()
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
