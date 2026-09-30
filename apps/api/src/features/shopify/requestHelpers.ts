import type { HttpRequest } from "@azure/functions";
import { HttpError } from "../../lib/auth";
import { resolveWhatnotScope } from "../whatnot/serviceCore";
import type { ApiConfig } from "../../types";

export async function resolveShopifyScope(config: ApiConfig, actor: string, workspaceId?: string, owner = false) {
  try { return await resolveWhatnotScope(config, actor, workspaceId, owner); }
  catch (error) {
    if (error instanceof HttpError && error.status === 403 && error.message.includes("Whatnot integration")) {
      throw new HttpError(403, "Only a workspace owner can manage the Shopify integration");
    }
    throw error;
  }
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

