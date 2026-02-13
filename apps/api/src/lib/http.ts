import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import type { ApiConfig } from "../types";
import { HttpError } from "./auth";

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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

export function jsonResponse(
  request: HttpRequest,
  config: ApiConfig,
  status: number,
  payload: unknown
): HttpResponseInit {
  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...buildCorsHeaders(request, config)
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
