import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import { getSupportedPurchaseProviders, resolvePurchaseVerifier } from "./purchaseVerifiers";

function resolveProvider(request: HttpRequest): string {
  return (request.params?.provider ?? "").trim().toLowerCase();
}

export async function entitlementsVerify(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /entitlements/verify/{provider} failed",
    fallbackErrorMessage: "Failed to verify purchase.",
    operation: async ({ config }) => {
    const provider = resolveProvider(request);
    const verifier = resolvePurchaseVerifier(provider);

    if (verifier) {
      return verifier(request, context, config, "/entitlements/verify/{provider}");
    }

    return jsonResponse(request, config, 501, {
      error: `Purchase provider '${provider || "unknown"}' is not supported.`,
      supportedProviders: getSupportedPurchaseProviders()
    });
    }
  });
}
