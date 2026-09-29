import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../../lib/auth";
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import { createShopifyStore, deleteShopifyConnection, getShopifyConnection } from "../../lib/cosmos/shopifyRepository";
import { getShopifySyncStatus } from "../../lib/cosmos/shopifySyncStatusRepository";
import { resolveWhatnotScope } from "../whatnot/serviceCore";
import { beginShopifyConnection, completeShopifyConnection } from "./connectionService";
import { pauseShopifyScope } from "./pauseService";
import type { ApiConfig } from "../../types";

async function resolveShopifyScope(config: ApiConfig, actor: string, workspaceId?: string, owner = false) {
  try { return await resolveWhatnotScope(config, actor, workspaceId, owner); }
  catch (error) {
    if (error instanceof HttpError && error.status === 403 && error.message.includes("Whatnot integration")) {
      throw new HttpError(403, "Only a workspace owner can manage the Shopify integration");
    }
    throw error;
  }
}

async function parseBody(request: HttpRequest): Promise<Record<string, unknown>> {
  let body: unknown;
  try { body = await request.json(); }
  catch { throw new HttpError(400, "Invalid Shopify JSON request"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Invalid Shopify request");
  return body as Record<string, unknown>;
}

function workspaceIdFrom(body: Record<string, unknown>): string | undefined {
  return typeof body.workspaceId === "string" && body.workspaceId.trim() ? body.workspaceId.trim() : undefined;
}

export async function shopifyConnectStart(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, { errorLogMessage: "Shopify connect start failed", fallbackErrorMessage: "Could not connect Shopify",
    operation: async ({ config }) => {
      const actorUserId = await resolveUserId(request, config);
      const body = await parseBody(request);
      if (typeof body.shop !== "string" || typeof body.appReturnUrl !== "string") throw new HttpError(400, "Shop and return URL are required");
      const targetScope = await resolveShopifyScope(config, actorUserId, workspaceIdFrom(body), true);
      const currentShop = await getShopifyConnection(config, targetScope.partitionKey);
      if (currentShop && currentShop.shop !== body.shop.trim().toLowerCase()) {
        throw new HttpError(409, "Disconnect the current Shopify store before connecting another store");
      }
      const authorizeUrl = await beginShopifyConnection(config, createShopifyStore(config),
        (actor, workspaceId, owner) => resolveShopifyScope(config, actor, workspaceId, owner),
        { actorUserId, shop: body.shop, workspaceId: workspaceIdFrom(body), appReturnUrl: body.appReturnUrl });
      return jsonResponse(request, config, 200, { authorizeUrl });
    }
  });
}

export async function shopifyConnectCallback(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, { errorLogMessage: "Shopify OAuth callback failed", fallbackErrorMessage: "Could not finish connecting Shopify",
    operation: async ({ config }) => {
      const { redirectUrl } = await completeShopifyConnection(config, createShopifyStore(config),
        (actor, workspaceId, owner) => resolveShopifyScope(config, actor, workspaceId, owner),
        new URL(request.url).searchParams);
      return { status: 302, headers: { Location: redirectUrl } };
    }
  });
}

export async function shopifyStatus(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, { errorLogMessage: "Shopify status failed", fallbackErrorMessage: "Could not load Shopify status",
    operation: async ({ config }) => {
      const actorUserId = await resolveUserId(request, config);
      const body = await parseBody(request);
      const scope = await resolveShopifyScope(config, actorUserId, workspaceIdFrom(body));
      const connection = await getShopifyConnection(config, scope.partitionKey);
      const latestStatus = connection ? await getShopifySyncStatus(config, scope.partitionKey) : null;
      const syncStatus = latestStatus?.shop === connection?.shop ? latestStatus : null;
      return jsonResponse(request, config, 200, { configured: Boolean(config.shopifyClientId && config.shopifyClientSecret && config.shopifyRedirectUri && config.shopifyTokenEncryptionSecret),
        connected: Boolean(connection), shop: connection?.shop ?? null, scopes: connection?.scopes ?? [], lastConnectedAt: connection?.updatedAt ?? null,
        lastSyncedAt: syncStatus?.lastSyncedAt ?? null, syncError: syncStatus?.lastError ?? null });
    }
  });
}

export async function shopifyDisconnect(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, { errorLogMessage: "Shopify disconnect failed", fallbackErrorMessage: "Could not disconnect Shopify",
    operation: async ({ config }) => {
      const actorUserId = await resolveUserId(request, config);
      const body = await parseBody(request);
      const scope = await resolveShopifyScope(config, actorUserId, workspaceIdFrom(body), true);
      await pauseShopifyScope(config, scope.partitionKey);
      await deleteShopifyConnection(config, scope.partitionKey);
      return jsonResponse(request, config, 200, { connected: false });
    }
  });
}
