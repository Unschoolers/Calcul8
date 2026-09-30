import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../../lib/auth";
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import { createShopifyStore, deleteShopifyConnection, getShopifyConnection } from "../../lib/cosmos/shopifyRepository";
import { getShopifySyncStatus } from "../../lib/cosmos/shopifySyncStatusRepository";
import { resolveShopifyScope, parseBody, workspaceIdFrom } from "./requestHelpers";
import { beginShopifyConnection, completeShopifyConnection } from "./connectionService";
import { withShopifyLotLease } from "./lotLease";
import { pauseShopifyScope } from "./pauseService";

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
      const processed = await withShopifyLotLease(config, scope.partitionKey, 0, async assertCurrent => {
        await pauseShopifyScope(config, scope.partitionKey);
        await assertCurrent();
        await deleteShopifyConnection(config, scope.partitionKey);
      });
      if (!processed) throw new HttpError(409, "A Shopify link is being saved; retry disconnect shortly");
      return jsonResponse(request, config, 200, { connected: false });
    }
  });
}
