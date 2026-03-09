import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import {
  createPurchaseVerificationResult,
  getPlayPurchaseByTokenHash,
  getPurchaseVerificationResult,
  upsertEntitlement,
  upsertPlayPurchase
} from "../lib/cosmos";
import { acknowledgePlayProductPurchase, verifyPlayProductPurchase } from "../lib/googlePlay";
import { errorResponse, jsonResponse, maybeHandleCorsPreflight, maybeHandleGlobalRateLimit } from "../lib/http";
import { assertPurchaseNotLinkedToDifferentUser, hashPurchaseToken, shouldAcknowledgePurchase } from "../lib/playEntitlements";
import { buildLegacyUserEntitlementDocumentId } from "../lib/scopeKeys";
import type { ApiConfig } from "../types";

interface VerifyPlayPurchaseBody {
  purchaseToken: string;
  productId?: string;
  packageName?: string;
  idempotencyKey: string;
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
  const idempotencyKeyValue = payload.idempotencyKey;

  if (typeof purchaseTokenValue !== "string" || purchaseTokenValue.trim().length === 0) {
    throw new HttpError(400, "Field 'purchaseToken' is required.");
  }

  if (productIdValue != null && typeof productIdValue !== "string") {
    throw new HttpError(400, "Field 'productId' must be a string when provided.");
  }

  if (packageNameValue != null && typeof packageNameValue !== "string") {
    throw new HttpError(400, "Field 'packageName' must be a string when provided.");
  }

  if (typeof idempotencyKeyValue !== "string" || idempotencyKeyValue.trim().length === 0) {
    throw new HttpError(400, "Field 'idempotencyKey' is required.");
  }

  const idempotencyKey = idempotencyKeyValue.trim();
  if (!/^[A-Za-z0-9:_-]{8,120}$/.test(idempotencyKey)) {
    throw new HttpError(400, "Field 'idempotencyKey' has an invalid format.");
  }

  return {
    purchaseToken: purchaseTokenValue.trim(),
    productId: typeof productIdValue === "string" ? productIdValue.trim() : undefined,
    packageName: typeof packageNameValue === "string" ? packageNameValue.trim() : undefined,
    idempotencyKey
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

export async function verifyPlayEntitlementRequest(
  request: HttpRequest,
  context: InvocationContext,
  config: ApiConfig,
  routeLabel = "/entitlements/verify/play"
): Promise<HttpResponseInit> {
  try {
    const userId = await resolveUserId(request, config);
    const body = await parseVerifyBody(request);
    const existingVerificationResult = await getPurchaseVerificationResult(config, {
      userId,
      provider: "play",
      idempotencyKey: body.idempotencyKey
    });
    if (existingVerificationResult) {
      context.info("Replaying idempotent Play verification response", {
        route: routeLabel,
        userId,
        provider: "play"
      });
      return jsonResponse(
        request,
        config,
        existingVerificationResult.responseStatus,
        existingVerificationResult.responseBody
      );
    }

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
        message: "Purchase is pending. Complete payment and check again shortly."
      });
    }

    if (!verification.isValid) {
      context.warn("Google Play purchase invalid", {
        route: routeLabel,
        packageName,
        allowedProductIds,
        purchaseState: verification.purchaseState,
        returnedProductIds: verification.productIds
      });
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
    const successPayload: Record<string, unknown> = {
      ok: true,
      userId,
      hasProAccess: true,
      purchaseSource: "google_play",
      updatedAt
    };
    await Promise.all([
      upsertEntitlement(config, {
        id: buildLegacyUserEntitlementDocumentId(userId),
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
    await createPurchaseVerificationResult(config, {
      userId,
      provider: "play",
      idempotencyKey: body.idempotencyKey,
      responseStatus: 200,
      responseBody: successPayload,
      createdAt: updatedAt
    });

    return jsonResponse(request, config, 200, successPayload);
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status >= 500) {
        context.error(`POST ${routeLabel} failed`, {
          status: error.status,
          message: error.message
        });
      } else {
        context.warn(`POST ${routeLabel} rejected`, {
          status: error.status,
          message: error.message
        });
      }
    } else {
      context.error(`POST ${routeLabel} failed`, error);
    }
    return errorResponse(request, config, error, "Failed to verify Google Play purchase.");
  }
}

export async function entitlementsVerifyPlay(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const preflightResponse = maybeHandleCorsPreflight(request, config);
  if (preflightResponse) return preflightResponse;

  const rateLimitResponse = maybeHandleGlobalRateLimit(request, config);
  if (rateLimitResponse) return rateLimitResponse;

  return verifyPlayEntitlementRequest(request, context, config, "/entitlements/verify-play");
}

app.http("entitlementsVerifyPlay", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "entitlements/verify-play",
  handler: entitlementsVerifyPlay
});
