import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../lib/auth";
import { getConfig } from "../lib/config";
import {
  deleteSaleDocument,
  EntityVersionConflictError,
  getLotLivePricing,
  hasWorkspaceMembership,
  listSalesForLot,
  upsertLotLivePricing,
  upsertSaleDocument
} from "../lib/cosmos";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../lib/http";
import { parseOptionalWorkspaceId } from "../lib/syncScope";
import { assertSyncScopeAccess, resolveSyncScope } from "../lib/syncScopeResolution";

function getQueryParam(request: HttpRequest, key: string): string | null {
  if (request.query && typeof request.query.get === "function") {
    return request.query.get(key);
  }

  if (!request.url) return null;
  try {
    return new URL(request.url).searchParams.get(key);
  } catch {
    return null;
  }
}

function parseLotIdFromParams(request: HttpRequest): string {
  const lotId = String(request.params?.lotId ?? "").trim();
  if (!lotId) {
    throw new HttpError(400, "Route param 'lotId' is required.");
  }
  return lotId;
}

function parseSaleIdFromParams(request: HttpRequest): string {
  const saleId = String(request.params?.saleId ?? "").trim();
  if (!saleId) {
    throw new HttpError(400, "Route param 'saleId' is required.");
  }
  return saleId;
}

function parseOptionalBaseVersion(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, "Field 'baseVersion' must be a non-negative number when provided.");
  }
  return Math.floor(parsed);
}

function parseMutationId(value: unknown): string {
  const mutationId = String(value ?? "").trim();
  if (!mutationId) {
    throw new HttpError(400, "Field 'mutationId' is required.");
  }
  return mutationId;
}

function parseWorkspaceIdFromRequest(request: HttpRequest, rawBody: unknown): string | undefined {
  if (typeof rawBody === "object" && rawBody !== null && !Array.isArray(rawBody)) {
    const candidate = rawBody as { workspaceId?: unknown };
    return parseOptionalWorkspaceId(candidate.workspaceId);
  }
  return parseOptionalWorkspaceId(getQueryParam(request, "workspaceId"));
}

async function readJsonBody(request: HttpRequest): Promise<unknown | null> {
  if (typeof request.json !== "function") return null;
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

function sanitizeSalePayload(rawSale: unknown): Record<string, unknown> {
  if (typeof rawSale !== "object" || rawSale === null || Array.isArray(rawSale)) {
    throw new HttpError(400, "Field 'sale' is required and must be an object.");
  }

  const sale = { ...(rawSale as Record<string, unknown>) };
  const saleId = sale.id;
  if (!(typeof saleId === "number" || typeof saleId === "string")) {
    throw new HttpError(400, "Field 'sale.id' is required.");
  }

  delete sale.version;
  delete sale.updatedAt;
  delete sale.updatedBy;
  delete sale.mutationId;
  delete sale.deletedAt;
  return sale;
}

function parseSaleUpsertBody(rawBody: unknown): {
  sale: Record<string, unknown>;
  workspaceId?: string;
  baseVersion?: number;
  mutationId: string;
} {
  if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
    throw new HttpError(400, "Request body must be an object.");
  }

  const body = rawBody as {
    sale?: unknown;
    workspaceId?: unknown;
    baseVersion?: unknown;
    mutationId?: unknown;
  };

  return {
    sale: sanitizeSalePayload(body.sale),
    workspaceId: parseOptionalWorkspaceId(body.workspaceId),
    baseVersion: parseOptionalBaseVersion(body.baseVersion),
    mutationId: parseMutationId(body.mutationId)
  };
}

function parseSaleDeleteBody(rawBody: unknown): {
  workspaceId?: string;
  baseVersion?: number;
  mutationId: string;
} {
  if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
    throw new HttpError(400, "Request body must be an object.");
  }

  const body = rawBody as {
    workspaceId?: unknown;
    baseVersion?: unknown;
    mutationId?: unknown;
  };

  return {
    workspaceId: parseOptionalWorkspaceId(body.workspaceId),
    baseVersion: parseOptionalBaseVersion(body.baseVersion),
    mutationId: parseMutationId(body.mutationId)
  };
}

function parseLivePricingBody(rawBody: unknown): {
  workspaceId?: string;
  baseVersion?: number;
  mutationId: string;
  livePackPrice: number;
  liveBoxPriceSell: number;
  liveSpotPrice: number;
} {
  if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
    throw new HttpError(400, "Request body must be an object.");
  }

  const body = rawBody as {
    workspaceId?: unknown;
    baseVersion?: unknown;
    mutationId?: unknown;
    livePackPrice?: unknown;
    liveBoxPriceSell?: unknown;
    liveSpotPrice?: unknown;
  };

  return {
    workspaceId: parseOptionalWorkspaceId(body.workspaceId),
    baseVersion: parseOptionalBaseVersion(body.baseVersion),
    mutationId: parseMutationId(body.mutationId),
    livePackPrice: Number(body.livePackPrice) || 0,
    liveBoxPriceSell: Number(body.liveBoxPriceSell) || 0,
    liveSpotPrice: Number(body.liveSpotPrice) || 0
  };
}

function toSaleResponse(document: {
  sale: unknown;
  version: number;
  updatedAt: string;
  updatedBy: string;
  mutationId: string;
}): Record<string, unknown> {
  if (typeof document.sale !== "object" || document.sale === null || Array.isArray(document.sale)) {
    return {
      version: document.version,
      updatedAt: document.updatedAt,
      updatedBy: document.updatedBy,
      mutationId: document.mutationId
    };
  }

  return {
    ...(document.sale as Record<string, unknown>),
    version: document.version,
    updatedAt: document.updatedAt,
    updatedBy: document.updatedBy,
    mutationId: document.mutationId
  };
}

function handleEntityError(
  request: HttpRequest,
  context: InvocationContext,
  error: unknown,
  fallbackMessage: string
): HttpResponseInit {
  const config = getConfig();
  if (error instanceof EntityVersionConflictError) {
    return errorResponse(request, config, new HttpError(409, error.message), fallbackMessage);
  }
  context.error(fallbackMessage, error);
  return errorResponse(request, config, error, fallbackMessage);
}

export async function lotSalesList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config);
    const workspaceId = parseWorkspaceIdFromRequest(request, null);
    const syncScope = resolveSyncScope(actorUserId, workspaceId);
    await assertSyncScopeAccess(
      syncScope,
      (userId, nextWorkspaceId) => hasWorkspaceMembership(config, userId, nextWorkspaceId)
    );
    const lotId = parseLotIdFromParams(request);
    const sales = await listSalesForLot(config, syncScope.partitionKey, lotId);

    return jsonResponse(request, config, 200, {
      lotId,
      sales: sales.map((document) => toSaleResponse(document))
    });
  } catch (error) {
    return handleEntityError(request, context, error, "Failed to load lot sales.");
  }
}

export async function lotSalesUpsert(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config);
    const body = parseSaleUpsertBody(await readJsonBody(request));
    const syncScope = resolveSyncScope(actorUserId, body.workspaceId);
    await assertSyncScopeAccess(
      syncScope,
      (userId, nextWorkspaceId) => hasWorkspaceMembership(config, userId, nextWorkspaceId)
    );

    const lotId = parseLotIdFromParams(request);
    const saleId = String(body.sale.id ?? "").trim();
    const sale = await upsertSaleDocument(config, {
      scopeKey: syncScope.partitionKey,
      lotId,
      saleId,
      sale: body.sale,
      updatedBy: actorUserId,
      mutationId: body.mutationId,
      baseVersion: body.baseVersion
    });

    return jsonResponse(request, config, 200, {
      ok: true,
      lotId,
      sale: toSaleResponse(sale)
    });
  } catch (error) {
    return handleEntityError(request, context, error, "Failed to save sale.");
  }
}

export async function lotSalesDelete(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config);
    const body = parseSaleDeleteBody(await readJsonBody(request));
    const syncScope = resolveSyncScope(actorUserId, body.workspaceId);
    await assertSyncScopeAccess(
      syncScope,
      (userId, nextWorkspaceId) => hasWorkspaceMembership(config, userId, nextWorkspaceId)
    );

    const lotId = parseLotIdFromParams(request);
    const saleId = parseSaleIdFromParams(request);
    const deleted = await deleteSaleDocument(config, {
      scopeKey: syncScope.partitionKey,
      lotId,
      saleId,
      updatedBy: actorUserId,
      mutationId: body.mutationId,
      baseVersion: body.baseVersion
    });

    if (!deleted) {
      throw new HttpError(404, "Sale was not found.");
    }

    return jsonResponse(request, config, 200, {
      ok: true,
      lotId,
      saleId
    });
  } catch (error) {
    return handleEntityError(request, context, error, "Failed to delete sale.");
  }
}

async function lotSalesRoute(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  switch (request.method) {
    case "GET":
    case "OPTIONS":
      return lotSalesList(request, context);
    case "POST":
      return lotSalesUpsert(request, context);
    default:
      return errorResponse(request, getConfig(), new HttpError(405, "Method not allowed."), "Method not allowed.");
  }
}

export async function lotLivePricingGet(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config);
    const workspaceId = parseWorkspaceIdFromRequest(request, null);
    const syncScope = resolveSyncScope(actorUserId, workspaceId);
    await assertSyncScopeAccess(
      syncScope,
      (userId, nextWorkspaceId) => hasWorkspaceMembership(config, userId, nextWorkspaceId)
    );

    const lotId = parseLotIdFromParams(request);
    const livePricing = await getLotLivePricing(config, syncScope.partitionKey, lotId);
    return jsonResponse(request, config, 200, {
      lotId,
      livePricing: livePricing
        ? {
          livePackPrice: livePricing.livePackPrice,
          liveBoxPriceSell: livePricing.liveBoxPriceSell,
          liveSpotPrice: livePricing.liveSpotPrice,
          version: livePricing.version,
          updatedAt: livePricing.updatedAt,
          updatedBy: livePricing.updatedBy,
          mutationId: livePricing.mutationId
        }
        : null
    });
  } catch (error) {
    return handleEntityError(request, context, error, "Failed to load live pricing.");
  }
}

export async function lotLivePricingSave(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config);
    const body = parseLivePricingBody(await readJsonBody(request));
    const syncScope = resolveSyncScope(actorUserId, body.workspaceId);
    await assertSyncScopeAccess(
      syncScope,
      (userId, nextWorkspaceId) => hasWorkspaceMembership(config, userId, nextWorkspaceId)
    );

    const lotId = parseLotIdFromParams(request);
    const livePricing = await upsertLotLivePricing(config, {
      scopeKey: syncScope.partitionKey,
      lotId,
      livePackPrice: body.livePackPrice,
      liveBoxPriceSell: body.liveBoxPriceSell,
      liveSpotPrice: body.liveSpotPrice,
      updatedBy: actorUserId,
      mutationId: body.mutationId,
      baseVersion: body.baseVersion
    });

    return jsonResponse(request, config, 200, {
      ok: true,
      lotId,
      livePricing: {
        livePackPrice: livePricing.livePackPrice,
        liveBoxPriceSell: livePricing.liveBoxPriceSell,
        liveSpotPrice: livePricing.liveSpotPrice,
        version: livePricing.version,
        updatedAt: livePricing.updatedAt,
        updatedBy: livePricing.updatedBy,
        mutationId: livePricing.mutationId
      }
    });
  } catch (error) {
    return handleEntityError(request, context, error, "Failed to save live pricing.");
  }
}

async function lotLivePricingRoute(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  switch (request.method) {
    case "GET":
    case "OPTIONS":
      return lotLivePricingGet(request, context);
    case "POST":
      return lotLivePricingSave(request, context);
    default:
      return errorResponse(request, getConfig(), new HttpError(405, "Method not allowed."), "Method not allowed.");
  }
}

app.http("lotSalesRoute", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "lots/{lotId}/sales",
  handler: lotSalesRoute
});

app.http("lotSalesDelete", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "lots/{lotId}/sales/{saleId}",
  handler: lotSalesDelete
});

app.http("lotLivePricingRoute", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "lots/{lotId}/live-pricing",
  handler: lotLivePricingRoute
});
