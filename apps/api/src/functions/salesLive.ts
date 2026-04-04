import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../lib/auth";
import {
  EntityVersionConflictError,
} from "../lib/cosmos/salesRepository";
import { hasWorkspaceMembership } from "../lib/cosmos/workspaceRepository";
import { getConfig } from "../lib/config";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../lib/http";
import { publishWorkspaceLotRealtimeEventBestEffort } from "../lib/realtime";
import { parseOptionalWorkspaceId } from "../lib/syncScope";
import { assertSyncScopeAccess, resolveSyncScope } from "../lib/syncScopeResolution";
import { logApiTelemetry } from "../lib/telemetry";
import { readRequestJsonOrThrow, requireRequestBodyRecord, requireRouteParam } from "./request-function-helpers";
import {
  deleteLotSaleForActor,
  getLotLivePricingForActor,
  listLotSalesForActor,
  mintLotRealtimeTokenForActor,
  mintWorkspaceRealtimeTokenForActor,
  saveLotLivePricingForActor,
  toSaleResponse,
  upsertLotSaleForActor
} from "./sales-live-services";

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

function getWorkspaceScope(workspaceId?: string): "personal" | "workspace" {
  return workspaceId ? "workspace" : "personal";
}

function sanitizeSalePayload(rawSale: unknown): Record<string, unknown> {
  const sale = { ...requireRequestBodyRecord(rawSale, "Field 'sale' is required and must be an object.") };
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
  const body = requireRequestBodyRecord(rawBody) as {
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
  const body = requireRequestBodyRecord(rawBody) as {
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
  const body = requireRequestBodyRecord(rawBody) as {
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

function handleEntityError(
  request: HttpRequest,
  context: InvocationContext,
  error: unknown,
  fallbackMessage: string,
  route: string,
  workspaceId?: string
): HttpResponseInit {
  const config = getConfig();
  if (error instanceof EntityVersionConflictError) {
    logApiTelemetry({
      logger: context,
      level: "warn",
      request,
      config,
      route,
      workspaceScope: getWorkspaceScope(workspaceId),
      outcome: "http_409"
    });
    return errorResponse(request, config, new HttpError(409, error.message), fallbackMessage);
  }
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) : null;
  if (status === 401 || status === 403 || status === 409) {
    logApiTelemetry({
      logger: context,
      level: "warn",
      request,
      config,
      route,
      workspaceScope: getWorkspaceScope(workspaceId),
      outcome: `http_${status}`
    });
  }
  context.error(fallbackMessage, error);
  return errorResponse(request, config, error, fallbackMessage);
}

export async function lotSalesList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const workspaceId = parseWorkspaceIdFromRequest(request, null);
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "lot_sales_list",
        workspaceScope: getWorkspaceScope(workspaceId)
      }
    });
    const syncScope = resolveSyncScope(actorUserId, workspaceId);
    await assertSyncScopeAccess(
      syncScope,
      (userId, nextWorkspaceId) => hasWorkspaceMembership(config, userId, nextWorkspaceId)
    );
    const lotId = requireRouteParam(request, "lotId");
    const responseBody = await listLotSalesForActor(config, actorUserId, workspaceId, lotId);
    return jsonResponse(request, config, 200, responseBody);
  } catch (error) {
    return handleEntityError(request, context, error, "Failed to load lot sales.", "lot_sales_list", workspaceId);
  }
}

export async function lotSalesUpsert(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  let workspaceId: string | undefined;
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "lot_sales_upsert",
        workspaceScope: "unknown"
      }
    });
    const body = parseSaleUpsertBody(await readRequestJsonOrThrow(request));
    workspaceId = body.workspaceId;
    const lotId = requireRouteParam(request, "lotId");
    const result = await upsertLotSaleForActor(config, actorUserId, {
      workspaceId: body.workspaceId,
      lotId,
      sale: body.sale,
      baseVersion: body.baseVersion,
      mutationId: body.mutationId
    });

    publishWorkspaceLotRealtimeEventBestEffort(config, {
      workspaceId: body.workspaceId,
      lotId,
      eventType: "sale.upserted",
      data: {
        lotId,
        sale: result.sale
      },
      logger: context
    });

    return jsonResponse(request, config, 200, {
      ok: true,
      lotId: result.lotId,
      sale: result.sale
    });
  } catch (error) {
    return handleEntityError(request, context, error, "Failed to save sale.", "lot_sales_upsert", workspaceId);
  }
}

export async function lotSalesDelete(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  let workspaceId: string | undefined;
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "lot_sales_delete",
        workspaceScope: "unknown"
      }
    });
    const body = parseSaleDeleteBody(await readRequestJsonOrThrow(request));
    workspaceId = body.workspaceId;
    const lotId = requireRouteParam(request, "lotId");
    const saleId = requireRouteParam(request, "saleId");
    const result = await deleteLotSaleForActor(config, actorUserId, {
      workspaceId: body.workspaceId,
      lotId,
      saleId,
      baseVersion: body.baseVersion,
      mutationId: body.mutationId
    });

    publishWorkspaceLotRealtimeEventBestEffort(config, {
      workspaceId: body.workspaceId,
      lotId,
      eventType: "sale.deleted",
      data: {
        lotId,
        saleId: result.saleId
      },
      logger: context
    });

    return jsonResponse(request, config, 200, {
      ok: true,
      lotId: result.lotId,
      saleId: result.saleId
    });
  } catch (error) {
    return handleEntityError(request, context, error, "Failed to delete sale.", "lot_sales_delete", workspaceId);
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
  const workspaceId = parseWorkspaceIdFromRequest(request, null);
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "lot_live_pricing_get",
        workspaceScope: getWorkspaceScope(workspaceId)
      }
    });
    const syncScope = resolveSyncScope(actorUserId, workspaceId);
    await assertSyncScopeAccess(
      syncScope,
      (userId, nextWorkspaceId) => hasWorkspaceMembership(config, userId, nextWorkspaceId)
    );

    const lotId = requireRouteParam(request, "lotId");
    const responseBody = await getLotLivePricingForActor(config, actorUserId, workspaceId, lotId);
    return jsonResponse(request, config, 200, responseBody);
  } catch (error) {
    return handleEntityError(request, context, error, "Failed to load live pricing.", "lot_live_pricing_get", workspaceId);
  }
}

export async function lotLivePricingSave(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  let workspaceId: string | undefined;
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "lot_live_pricing_save",
        workspaceScope: "unknown"
      }
    });
    const body = parseLivePricingBody(await readRequestJsonOrThrow(request));
    workspaceId = body.workspaceId;
    const lotId = requireRouteParam(request, "lotId");
    const result = await saveLotLivePricingForActor(config, actorUserId, {
      workspaceId: body.workspaceId,
      lotId,
      baseVersion: body.baseVersion,
      mutationId: body.mutationId,
      livePackPrice: body.livePackPrice,
      liveBoxPriceSell: body.liveBoxPriceSell,
      liveSpotPrice: body.liveSpotPrice
    });

    publishWorkspaceLotRealtimeEventBestEffort(config, {
      workspaceId: body.workspaceId,
      lotId,
      eventType: "livePricing.updated",
      data: {
        lotId,
        livePricing: result.livePricing
      },
      logger: context
    });

    return jsonResponse(request, config, 200, {
      ok: true,
      lotId: result.lotId,
      livePricing: result.livePricing
    });
  } catch (error) {
    return handleEntityError(request, context, error, "Failed to save live pricing.", "lot_live_pricing_save", workspaceId);
  }
}

export async function lotRealtimeTokenGet(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const workspaceId = parseWorkspaceIdFromRequest(request, null);
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "lot_realtime_token_get",
        workspaceScope: "workspace"
      }
    });
    const lotId = requireRouteParam(request, "lotId");
    const responseBody = await mintLotRealtimeTokenForActor(config, actorUserId, workspaceId, lotId);
    return jsonResponse(request, config, 200, responseBody);
  } catch (error) {
    return handleEntityError(
      request,
      context,
      error,
      "Failed to mint realtime subscribe token.",
      "lot_realtime_token_get",
      workspaceId
    );
  }
}

export async function workspaceRealtimeTokenGet(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const actorUserId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "workspace_realtime_token_get",
        workspaceScope: "workspace"
      }
    });
    const workspaceId = requireRouteParam(request, "workspaceId");
    const responseBody = await mintWorkspaceRealtimeTokenForActor(config, actorUserId, workspaceId);
    return jsonResponse(request, config, 200, responseBody);
  } catch (error) {
    return handleEntityError(
      request,
      context,
      error,
      "Failed to mint workspace realtime subscribe token.",
      "workspace_realtime_token_get"
    );
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

app.http("lotRealtimeTokenRoute", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "lots/{lotId}/realtime-token",
  handler: lotRealtimeTokenGet
});

app.http("workspaceRealtimeTokenRoute", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "workspaces/{workspaceId}/realtime-token",
  handler: workspaceRealtimeTokenGet
});
