import type { HttpRequest } from "@azure/functions";
import { HttpError } from "../lib/auth";

export function requireRouteParam(request: HttpRequest, key: string): string {
  const value = String(request.params?.[key] ?? "").trim();
  if (!value) {
    throw new HttpError(400, `Route param '${key}' is required.`);
  }
  return value;
}

export async function readRequestJsonOrNull(request: HttpRequest): Promise<unknown | null> {
  if (typeof request.json !== "function") return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function readRequestJsonOrThrow(
  request: HttpRequest,
  invalidJsonMessage = "Invalid JSON body."
): Promise<unknown | null> {
  if (typeof request.json !== "function") return null;
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, invalidJsonMessage);
  }
}

export function requireRequestBodyRecord(
  raw: unknown,
  invalidBodyMessage = "Request body must be an object."
): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new HttpError(400, invalidBodyMessage);
  }

  return raw as Record<string, unknown>;
}
