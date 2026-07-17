import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../../lib/auth";
import { errorResponse, executeHttpHandler, jsonResponse } from "../../lib/http";
import { parseOptionalWorkspaceId } from "../../lib/syncScope";
import { logApiTelemetry } from "../../lib/telemetry";
import {
  readRequestJsonOrNull,
  readRequestJsonOrThrow,
  requireRequestBodyRecord
} from "../../lib/httpRequest";
import type { WhatnotImportDecisionKind, WhatnotMappedSaleType, WhatnotReviewImportAction } from "../../types";
import {
  confirmWhatnotImportBatchForActor,
  createWhatnotImportBatchFromRowsForActor,
  createWhatnotConnectUrlForActor,
  discardWhatnotImportBatchForActor,
  disconnectWhatnotForActor,
  getWhatnotReviewBatchForActor,
  getWhatnotStatusForActor,
  handleWhatnotOAuthCallback,
  syncWhatnotOrdersForActor
} from "./services";

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

async function parseWorkspaceIdFromBody(request: HttpRequest): Promise<string | undefined> {
  const rawBody = await readRequestJsonOrNull(request);
  if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
    return parseOptionalWorkspaceId((rawBody as { workspaceId?: unknown }).workspaceId);
  }
  return parseOptionalWorkspaceId(getQueryParam(request, "workspaceId"));
}

async function parseReviewLookupFromRequest(request: HttpRequest): Promise<{
  workspaceId?: string;
  batchId?: string;
}> {
  const rawBody = await readRequestJsonOrNull(request);
  if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
    const body = rawBody as { workspaceId?: unknown; batchId?: unknown };
    return {
      workspaceId: parseOptionalWorkspaceId(body.workspaceId),
      batchId: String(body.batchId ?? "").trim() || undefined
    };
  }
  return {
    workspaceId: parseOptionalWorkspaceId(getQueryParam(request, "workspaceId")),
    batchId: String(getQueryParam(request, "batchId") ?? "").trim() || undefined
  };
}

async function parseWhatnotConnectStartBody(request: HttpRequest): Promise<{
  workspaceId?: string;
  appReturnUrl?: string;
}> {
  const rawBody = await readRequestJsonOrNull(request);
  if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
    const body = rawBody as { workspaceId?: unknown; appReturnUrl?: unknown };
    return {
      workspaceId: parseOptionalWorkspaceId(body.workspaceId),
      appReturnUrl: String(body.appReturnUrl ?? "").trim() || undefined
    };
  }
  return {
    workspaceId: parseOptionalWorkspaceId(getQueryParam(request, "workspaceId")),
    appReturnUrl: String(getQueryParam(request, "appReturnUrl") ?? "").trim() || undefined
  };
}

function parseConfirmBody(rawBody: unknown): {
  batchId: string;
  workspaceId?: string;
  decisions: Array<{
    rowId: string;
    lotId?: string;
    saleType?: "pack" | "box" | "rtyh";
    packsCount?: number;
    skip?: boolean;
    selectedImportAction?: WhatnotReviewImportAction;
    targetKind?: WhatnotImportDecisionKind;
    targetSaleId?: string;
  }>;
} {
  const body = requireRequestBodyRecord(rawBody);
  const batchId = String(body.batchId ?? "").trim();
  if (!batchId) {
    throw new HttpError(400, "Field 'batchId' is required.");
  }

  const decisions = Array.isArray(body.decisions)
    ? body.decisions.map((rawDecision) => {
      if (!rawDecision || typeof rawDecision !== "object" || Array.isArray(rawDecision)) {
        throw new HttpError(400, "Field 'decisions' must contain objects.");
      }
      const decision = rawDecision as Record<string, unknown>;
      const rowId = String(decision.rowId ?? "").trim();
      if (!rowId) {
        throw new HttpError(400, "Each decision requires a 'rowId'.");
      }
      const saleTypeRaw = String(decision.saleType ?? "").trim();
      const saleType: WhatnotMappedSaleType | undefined =
        saleTypeRaw === "pack" || saleTypeRaw === "box" || saleTypeRaw === "rtyh"
          ? saleTypeRaw
          : undefined;
      const targetKindRaw = String(decision.targetKind ?? "").trim();
      const targetKind: WhatnotImportDecisionKind | undefined =
        targetKindRaw === "new" || targetKindRaw === "whatnot_mapping" || targetKindRaw === "manual_candidate"
          ? targetKindRaw
          : undefined;
      const selectedImportActionRaw = String(decision.selectedImportAction ?? "").trim();
      const selectedImportAction: WhatnotReviewImportAction | undefined =
        selectedImportActionRaw === "create"
          || selectedImportActionRaw === "update_existing"
          || selectedImportActionRaw === "split_group"
          || selectedImportActionRaw === "skip"
          ? selectedImportActionRaw
          : undefined;
      return {
        rowId,
        lotId: decision.lotId == null ? undefined : String(decision.lotId).trim(),
        saleType,
        packsCount: decision.packsCount == null ? undefined : Number(decision.packsCount),
        skip: decision.skip === true,
        selectedImportAction,
        targetKind,
        targetSaleId: decision.targetSaleId == null ? undefined : String(decision.targetSaleId).trim() || undefined
      };
    })
    : [];

  return {
    batchId,
    workspaceId: parseOptionalWorkspaceId(body.workspaceId),
    decisions
  };
}

function parseImportRowsBody(rawBody: unknown): {
  workspaceId?: string;
  externalAccountId?: string;
  rows: Array<{
    externalSaleId?: string;
    externalOrderId: string;
    externalOrderItemId: string;
    externalAccountId?: string;
    title: string;
    sku?: string;
    productCategory?: string;
    buyerName?: string;
    quantity?: number;
    price: number;
    originalItemPrice?: number;
    buyerShipping?: number;
    date: string;
    orderPlacedAt?: string;
    orderPlacedAtRaw?: string;
    orderStatus?: string;
    listingId?: string;
    listingTitle?: string;
    productId?: string;
    variantId?: string;
  }>;
} {
  const body = requireRequestBodyRecord(rawBody);
  const rows = Array.isArray(body.rows)
    ? body.rows.map((rawRow) => {
      const row = requireRequestBodyRecord(rawRow, "Field 'rows' must contain objects.");
      const externalOrderId = String(row.externalOrderId ?? "").trim();
      const externalOrderItemId = String(row.externalOrderItemId ?? "").trim();
      const title = String(row.title ?? "").trim();
      const date = String(row.date ?? "").trim();
      if (!externalOrderId) {
        throw new HttpError(400, "Each import row requires 'externalOrderId'.");
      }
      if (!externalOrderItemId) {
        throw new HttpError(400, "Each import row requires 'externalOrderItemId'.");
      }
      if (!title) {
        throw new HttpError(400, "Each import row requires 'title'.");
      }
      if (!date) {
        throw new HttpError(400, "Each import row requires 'date'.");
      }
      return {
        externalSaleId: String(row.externalSaleId ?? "").trim() || undefined,
        externalOrderId,
        externalOrderItemId,
        externalAccountId: String(row.externalAccountId ?? row.sellerId ?? "").trim() || undefined,
        title,
        sku: String(row.sku ?? "").trim() || undefined,
        productCategory: String(row.productCategory ?? "").trim() || undefined,
        buyerName: String(row.buyerName ?? "").trim() || undefined,
        quantity: row.quantity == null ? undefined : Number(row.quantity),
        price: Number(row.price),
        originalItemPrice: row.originalItemPrice == null ? undefined : Number(row.originalItemPrice),
        buyerShipping: row.buyerShipping == null ? undefined : Number(row.buyerShipping),
        date,
        orderPlacedAt: String(row.orderPlacedAt ?? "").trim() || undefined,
        orderPlacedAtRaw: String(row.orderPlacedAtRaw ?? "").trim() || undefined,
        orderStatus: String(row.orderStatus ?? "").trim() || undefined,
        listingId: String(row.listingId ?? "").trim() || undefined,
        listingTitle: String(row.listingTitle ?? "").trim() || undefined,
        productId: String(row.productId ?? "").trim() || undefined,
        variantId: String(row.variantId ?? "").trim() || undefined
      };
    })
    : [];

  if (rows.length === 0) {
    throw new HttpError(400, "Field 'rows' must contain at least one import row.");
  }

  return {
    workspaceId: parseOptionalWorkspaceId(body.workspaceId),
    externalAccountId: String(body.externalAccountId ?? "").trim() || undefined,
    rows
  };
}

export async function whatnotStatus(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "GET /integrations/whatnot/status failed",
    fallbackErrorMessage: "Failed to load Whatnot status.",
    operation: async ({ config }) => {
    const actorUserId = await resolveUserId(request, config);
    const workspaceId = await parseWorkspaceIdFromBody(request);
    const status = await getWhatnotStatusForActor(config, actorUserId, workspaceId);
    return jsonResponse(request, config, 200, status);
    }
  });
}

export async function whatnotConnectStart(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /integrations/whatnot/connect/start failed",
    fallbackErrorMessage: "Failed to start Whatnot connection.",
    operation: async ({ config }) => {
    const actorUserId = await resolveUserId(request, config);
    const { workspaceId, appReturnUrl } = await parseWhatnotConnectStartBody(request);
    const authorizeUrl = await createWhatnotConnectUrlForActor(config, actorUserId, workspaceId, appReturnUrl);
    return jsonResponse(request, config, 200, { authorizeUrl });
    }
  });
}

export async function whatnotConnectCallback(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "GET /integrations/whatnot/connect/callback failed",
    fallbackErrorMessage: "Failed to complete Whatnot connection.",
    operation: async ({ config }) => {
    const result = await handleWhatnotOAuthCallback(config, {
      code: getQueryParam(request, "code") ?? undefined,
      state: getQueryParam(request, "state") ?? undefined,
      error: getQueryParam(request, "error") ?? undefined,
      errorDescription: getQueryParam(request, "error_description") ?? undefined
    });
    return {
      status: 302,
      headers: {
        Location: result.redirectUrl
      }
    };
    }
  });
}

export async function whatnotDisconnect(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /integrations/whatnot/disconnect failed",
    fallbackErrorMessage: "Failed to disconnect Whatnot.",
    operation: async ({ config }) => {
    const actorUserId = await resolveUserId(request, config);
    const workspaceId = await parseWorkspaceIdFromBody(request);
    await disconnectWhatnotForActor(config, actorUserId, workspaceId);
    return jsonResponse(request, config, 200, { ok: true });
    }
  });
}

export async function whatnotSync(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /integrations/whatnot/sync failed",
    fallbackErrorMessage: "Failed to sync Whatnot orders.",
    operation: async ({ config }) => {
    const actorUserId = await resolveUserId(request, config);
    const workspaceId = await parseWorkspaceIdFromBody(request);
    const batch = await syncWhatnotOrdersForActor(config, actorUserId, workspaceId);
    return jsonResponse(request, config, 200, {
      batchId: batch.batchId,
      pendingReviewCount: batch.rows.length,
      rows: batch.rows
    });
    }
  });
}

export async function whatnotImport(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /integrations/whatnot/import failed",
    fallbackErrorMessage: "Failed to stage Whatnot import rows.",
    operation: async ({ config }) => {
    const actorUserId = await resolveUserId(request, config);
    const body = parseImportRowsBody(await readRequestJsonOrThrow(request));
    const batch = await createWhatnotImportBatchFromRowsForActor(config, actorUserId, body);
    return jsonResponse(request, config, 200, {
      batchId: batch.batchId,
      pendingReviewCount: batch.rows.length,
      rows: batch.rows
    });
    }
  });
}

export async function whatnotReviewGet(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "GET /integrations/whatnot/review failed",
    fallbackErrorMessage: "Failed to load Whatnot review batch.",
    operation: async ({ config }) => {
    const actorUserId = await resolveUserId(request, config);
    const { workspaceId, batchId } = await parseReviewLookupFromRequest(request);
    const batch = await getWhatnotReviewBatchForActor(config, actorUserId, workspaceId, batchId);
    return jsonResponse(request, config, 200, {
      batchId: batch?.batchId ?? null,
      rows: batch?.rows ?? [],
      confirmationDecisions: batch?.confirmationDecisions ?? null
    });
    }
  });
}

export async function whatnotReviewConfirm(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /integrations/whatnot/review/confirm failed",
    fallbackErrorMessage: "Failed to confirm Whatnot import.",
    operation: async ({ config }) => {
    const actorUserId = await resolveUserId(request, config);
    const body = parseConfirmBody(await readRequestJsonOrNull(request));
    const result = await confirmWhatnotImportBatchForActor(config, actorUserId, body);
    return jsonResponse(request, config, 200, {
      ok: true,
      ...result
    });
    },
    handleError: (error, { config }) => {
      if (error instanceof HttpError && error.code) {
        logApiTelemetry({
          logger: context,
          level: "warn",
          request,
          config,
          route: "whatnot_review_confirm",
          workspaceScope: "unknown",
          outcome: error.code.toLowerCase()
        });
      }
      context.error("POST /integrations/whatnot/review/confirm failed", error);
      return errorResponse(request, config, error, "Failed to confirm Whatnot import.");
    }
  });
}

export async function whatnotReviewDiscard(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /integrations/whatnot/review/discard failed",
    fallbackErrorMessage: "Failed to discard Whatnot review batch.",
    operation: async ({ config }) => {
    const actorUserId = await resolveUserId(request, config);
    const { workspaceId, batchId } = await parseReviewLookupFromRequest(request);
    const result = await discardWhatnotImportBatchForActor(config, actorUserId, {
      workspaceId,
      batchId
    });
    return jsonResponse(request, config, 200, {
      ok: true,
      ...result
    });
    }
  });
}
