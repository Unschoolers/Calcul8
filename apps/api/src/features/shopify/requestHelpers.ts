import type { HttpRequest } from "@azure/functions";
import { HttpError } from "../../lib/auth";
import { resolveScopeAuthorization } from "../../lib/scopeAuthorization";
import type { ApiConfig } from "../../types";

export async function resolveShopifyScope(config: ApiConfig, actor: string, workspaceId?: string, owner = false) {
  const authorization = await resolveScopeAuthorization(config, actor, workspaceId, owner);
  if (!authorization.allowed) {
    const message = authorization.denialCode === "workspace_owner_required"
      ? "Only a workspace owner can manage the Shopify integration"
      : "User is not a member of this workspace.";
    throw new HttpError(403, message, authorization.denialCode);
  }
  return { ...authorization.scope, connectionScopeKey: authorization.connectionScopeKey };
}

export async function parseBody(request: HttpRequest): Promise<Record<string, unknown>> {
  let body: unknown;
  try { body = await request.json(); }
  catch { throw new HttpError(400, "Invalid Shopify JSON request"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Invalid Shopify request");
  return body as Record<string, unknown>;
}

export function workspaceIdFrom(body: Record<string, unknown>): string | undefined {
  return typeof body.workspaceId === "string" && body.workspaceId.trim() ? body.workspaceId.trim() : undefined;
}
