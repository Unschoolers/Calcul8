import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import { getPlayPurchaseByTokenHash, upsertEntitlement, upsertPlayPurchase } from "../lib/cosmos";
import { acknowledgePlayProductPurchase, verifyPlayProductPurchase } from "../lib/googlePlay";
import { errorResponse, handleCorsPreflight, jsonResponse } from "../lib/http";
import { assertPurchaseNotLinkedToDifferentUser, hashPurchaseToken, shouldAcknowledgePurchase } from "../lib/playEntitlements";

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

function resolveRequestedProductId(requestProductId: string | undefined, configuredProductIds: string[]): string {
  const productId = (requestProductId ?? "").trim();
  if (productId && configuredProductIds.length > 0 && !configuredProductIds.includes(productId)) {
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
    const requestedProductId = resolveRequestedProductId(body.productId, config.googlePlayProProductIds);
    const allowedProductIds = config.googlePlayProProductIds.length > 0
      ? config.googlePlayProProductIds
      : (requestedProductId ? [requestedProductId] : []);
    if (allowedProductIds.length === 0) {
      throw new HttpError(500, "Missing Google Play product configuration.");
    }
    const purchaseTokenHash = hashPurchaseToken(body.purchaseToken);

    const existingPurchase = await getPlayPurchaseByTokenHash(config, purchaseTokenHash);
    assertPurchaseNotLinkedToDifferentUser(existingPurchase, userId);

    const verification = await verifyPlayProductPurchase(config, {
      packageName,
      purchaseToken: body.purchaseToken,
      allowedProductIds
    });

    if (verification.purchaseState === 2) {
      return jsonResponse(request, config, 202, {
        ok: false,
        pending: true,
        userId,
        hasProAccess: false,
        message: "Purchase is pending. Complete payment and check again shortly.",
        verification: {
          packageName,
          productId: verification.productId,
          productIds: verification.productIds,
          orderId: verification.orderId,
          purchaseState: verification.purchaseState,
          acknowledgementState: verification.acknowledgementState,
          consumptionState: verification.consumptionState,
          purchaseTimeMillis: verification.purchaseTimeMillis
        }
      });
    }

    if (!verification.isValid) {
      throw new HttpError(402, "Google Play purchase is not valid.");
    }
    if (!verification.productId) {
      throw new HttpError(502, "Could not determine purchased product ID from Google Play response.");
    }

    let acknowledgementState = verification.acknowledgementState;
    if (shouldAcknowledgePurchase(acknowledgementState)) {
      await acknowledgePlayProductPurchase(config, {
        packageName,
        productId: verification.productId,
        purchaseToken: body.purchaseToken
      });
      acknowledgementState = 1;
    }

    const updatedAt = new Date().toISOString();
    await Promise.all([
      upsertEntitlement(config, {
        id: `entitlement:${userId}`,
        userId,
        hasProAccess: true,
        purchaseSource: "google_play",
        updatedAt
      }),
      upsertPlayPurchase(config, {
        id: `play_purchase:${purchaseTokenHash}`,
        docType: "play_purchase",
        userId,
        purchaseTokenHash,
        packageName,
        productId: verification.productId,
        orderId: verification.orderId,
        purchaseState: verification.purchaseState,
        acknowledgementState,
        consumptionState: verification.consumptionState,
        purchaseTimeMillis: verification.purchaseTimeMillis,
        updatedAt
      })
    ]);

    return jsonResponse(request, config, 200, {
      ok: true,
      userId,
      hasProAccess: true,
      purchaseSource: "google_play",
      updatedAt,
      verification: {
        packageName,
        productId: verification.productId,
        productIds: verification.productIds,
        orderId: verification.orderId,
        purchaseState: verification.purchaseState,
        acknowledgementState,
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
