import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { getConfig } from "../lib/config";
import { errorResponse, handleCorsPreflight, jsonResponse } from "../lib/http";
import { verifyPlayEntitlementRequest } from "./entitlementsVerifyPlay";

function resolveProvider(request: HttpRequest): string {
  const raw = (request.params?.provider ?? "").trim().toLowerCase();
  return raw;
}

export async function entitlementsVerify(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();

  if (request.method === "OPTIONS") {
    return handleCorsPreflight(request, config);
  }

  try {
    const provider = resolveProvider(request);

    if (provider === "play") {
      return verifyPlayEntitlementRequest(request, context, config);
    }

    return jsonResponse(request, config, 501, {
      error: `Purchase provider '${provider || "unknown"}' is not supported.`,
      supportedProviders: ["play"]
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

