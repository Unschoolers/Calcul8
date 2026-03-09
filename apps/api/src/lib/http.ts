import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import type { ApiConfig } from "../types";
import { consumeAuthResponseHeaders, HttpError } from "./auth";
import { checkGlobalRateLimit } from "./rateLimit";

function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes("*")) return true;
  return allowedOrigins.includes(origin);
}

function buildCorsHeaders(request: HttpRequest, config: ApiConfig): HeadersInit {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  if (!isAllowedOrigin(origin, config.allowedOrigins)) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-csrf-token, x-user-id, x-migration-key, x-admin-id",
    "Access-Control-Expose-Headers": "x-csrf-token",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

export function handleCorsPreflight(request: HttpRequest, config: ApiConfig): HttpResponseInit {
  return {
    status: 204,
    headers: buildCorsHeaders(request, config)
  };
}

export function maybeHandleCorsPreflight(
  request: HttpRequest,
  config: ApiConfig
): HttpResponseInit | null {
  if (request.method !== "OPTIONS") return null;
  return handleCorsPreflight(request, config);
}

export function maybeHandleGlobalRateLimit(
  request: HttpRequest,
  config: ApiConfig
): HttpResponseInit | null {
  if (process.env.NODE_ENV === "test") return null;

  const decision = checkGlobalRateLimit(request);
  if (decision.allowed) return null;

  return jsonResponse(
    request,
    config,
    429,
    {
      error: "Too many requests. Please retry shortly."
    },
    {
      "Retry-After": String(decision.retryAfterSeconds ?? 1),
      "X-RateLimit-Limit": String(decision.limit),
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Window-Seconds": String(decision.windowSeconds)
    }
  );
}

export function jsonResponse(
  request: HttpRequest,
  config: ApiConfig,
  status: number,
  payload: unknown,
  extraHeaders?: Record<string, string>
): HttpResponseInit {
  const authHeaders = typeof consumeAuthResponseHeaders === "function"
    ? consumeAuthResponseHeaders(request)
    : {};

  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...buildCorsHeaders(request, config),
      ...authHeaders,
      ...(extraHeaders ?? {})
    },
    jsonBody: payload
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export function errorResponse(
  request: HttpRequest,
  config: ApiConfig,
  error: unknown,
  fallbackMessage = "Request failed"
): HttpResponseInit {
  if (error instanceof HttpError) {
    return jsonResponse(request, config, error.status, {
      error: error.message
    });
  }

  return jsonResponse(request, config, 500, {
    error: fallbackMessage,
    details: getErrorMessage(error)
  });
}
