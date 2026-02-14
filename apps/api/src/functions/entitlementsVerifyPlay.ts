import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import { upsertEntitlement } from "../lib/cosmos";
import { verifyPlayProductPurchase } from "../lib/googlePlay";
import { errorResponse, handleCorsPreflight, jsonResponse } from "../lib/http";

interface VerifyPlayPurchaseBody {
  purchaseToken: string;
  productId?: string;
  packageName?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseVerifyBody(request: HttpRequest): Promise<VerifyPlayPurchaseBody> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }

  if (!isRecord(payload)) {
    throw new HttpError(400, "Request body must be an object.");
  }

  const purchaseTokenValue = payload.purchaseToken;
  const productIdValue = payload.productId;
  const packageNameValue = payload.packageName;

  if (typeof purchaseTokenValue !== "string" || purchaseTokenValue.trim().length === 0) {
    throw new HttpError(400, "Field 'purchaseToken' is required.");
  }

  if (productIdValue != null && typeof productIdValue !== "string") {
    throw new HttpError(400, "Field 'productId' must be a string when provided.");
  }

  if (packageNameValue != null && typeof packageNameValue !== "string") {
    throw new HttpError(400, "Field 'packageName' must be a string when provided.");
  }

  return {
    purchaseToken: purchaseTokenValue.trim(),
    productId: typeof productIdValue === "string" ? productIdValue.trim() : undefined,
    packageName: typeof packageNameValue === "string" ? packageNameValue.trim() : undefined
  };
}

function resolvePackageName(requestPackageName: string | undefined, configuredPackageName: string): string {
  const packageName = (requestPackageName ?? "").trim() || configuredPackageName.trim();
  if (!packageName) {
    throw new HttpError(500, "Missing Google Play package configuration.");
  }
  return packageName;
}

function resolveProductId(requestProductId: string | undefined, configuredProductIds: string[]): string {
  const productId = (requestProductId ?? "").trim() || configuredProductIds[0] || "";
  if (!productId) {
    throw new HttpError(500, "Missing Google Play product configuration.");
  }
  if (configuredProductIds.length > 0 && !configuredProductIds.includes(productId)) {
    throw new HttpError(400, "Field 'productId' is not allowed.");
  }
  return productId;
}

export async function entitlementsVerifyPlay(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();

  if (request.method === "OPTIONS") {
    return handleCorsPreflight(request, config);
  }

  try {
    const userId = await resolveUserId(request, config);
    const body = await parseVerifyBody(request);
    const packageName = resolvePackageName(body.packageName, config.googlePlayPackageName);
    const productId = resolveProductId(body.productId, config.googlePlayProProductIds);
    const verification = await verifyPlayProductPurchase(config, {
      packageName,
      productId,
      purchaseToken: body.purchaseToken
    });

    if (!verification.isValid) {
      throw new HttpError(402, "Google Play purchase is not valid.");
    }

    const updatedAt = new Date().toISOString();
    await upsertEntitlement(config, {
      id: `entitlement:${userId}`,
      userId,
      hasProAccess: true,
      purchaseSource: "google_play",
      updatedAt
    });

    return jsonResponse(request, config, 200, {
      ok: true,
      userId,
      hasProAccess: true,
      purchaseSource: "google_play",
      updatedAt,
      verification: {
        packageName,
        productId,
        orderId: verification.orderId,
        purchaseState: verification.purchaseState,
        acknowledgementState: verification.acknowledgementState,
        consumptionState: verification.consumptionState,
        purchaseTimeMillis: verification.purchaseTimeMillis
      }
    });
  } catch (error) {
    context.error("POST /entitlements/verify-play failed", error);
    return errorResponse(request, config, error, "Failed to verify Google Play purchase.");
  }
}

app.http("entitlementsVerifyPlay", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "entitlements/verify-play",
  handler: entitlementsVerifyPlay
});
