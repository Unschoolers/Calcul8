import type { HttpRequest } from "@azure/functions";
import type { ApiConfig } from "../types";
import { CSRF_HEADER_NAME, hasBearerAuthHeader, parseSessionIdFromCookie } from "./auth/cookies";

export type UaFamily =
  | "ios_chrome"
  | "ios_safari"
  | "android_chrome"
  | "desktop_chrome"
  | "desktop_safari"
  | "desktop_edge"
  | "desktop_firefox"
  | "unknown";

export type TelemetryCategory = "auth" | "api";
export type AuthMethod = "session" | "bearer" | "none";
export type AuthResult = "success" | "401" | "403";
export type WorkspaceScope = "personal" | "workspace" | "unknown";
export type TelemetryLogLevel = "info" | "warn" | "error";

type TelemetryLogFn = (message: string, ...optionalParams: unknown[]) => void;

export interface TelemetryLogger {
  log?: TelemetryLogFn;
  info?: TelemetryLogFn;
  warn?: TelemetryLogFn;
  error?: TelemetryLogFn;
}

interface TelemetryDimensionsInput {
  category: TelemetryCategory;
  route: string;
  request: HttpRequest;
  config: ApiConfig;
  authMethod?: AuthMethod;
  authResult?: AuthResult;
  workspaceScope?: WorkspaceScope;
  outcome?: string;
}

interface TelemetryLogInput extends Omit<TelemetryDimensionsInput, "category"> {
  logger?: TelemetryLogger | null;
  level?: TelemetryLogLevel;
}

function getHeader(request: HttpRequest, name: string): string {
  return String(request.headers.get(name) || "").trim();
}

function isIosUserAgent(userAgent: string): boolean {
  return /iPad|iPhone|iPod/i.test(userAgent);
}

export function classifyUserAgent(userAgent: string): UaFamily {
  const normalized = String(userAgent || "");
  if (!normalized) return "unknown";

  if (isIosUserAgent(normalized) && /CriOS/i.test(normalized)) {
    return "ios_chrome";
  }

  if (isIosUserAgent(normalized) && /Safari/i.test(normalized) && !/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(normalized)) {
    return "ios_safari";
  }

  if (/Android/i.test(normalized) && /Chrome/i.test(normalized)) {
    return "android_chrome";
  }

  if (/Edg\//i.test(normalized)) {
    return "desktop_edge";
  }

  if (/Firefox\//i.test(normalized)) {
    return "desktop_firefox";
  }

  if (/Chrome\//i.test(normalized)) {
    return "desktop_chrome";
  }

  if (/Macintosh/i.test(normalized) && /Safari\//i.test(normalized) && !/(Chrome|Chromium|Edg|Firefox)/i.test(normalized)) {
    return "desktop_safari";
  }

  return "unknown";
}

export function buildTelemetryDimensions(input: TelemetryDimensionsInput): Record<string, string> {
  const hasSessionCookie = !!parseSessionIdFromCookie(input.request, input.config);
  const hasBearerHeader = hasBearerAuthHeader(input.request);
  const hasCsrfHeader = getHeader(input.request, CSRF_HEADER_NAME).length > 0;
  const userAgent = getHeader(input.request, "user-agent");

  const dimensions: Record<string, string> = {
    category: input.category,
    route: input.route,
    ua_family: classifyUserAgent(userAgent),
    has_session_cookie: hasSessionCookie ? "true" : "false",
    has_bearer_header: hasBearerHeader ? "true" : "false",
    has_csrf_header: hasCsrfHeader ? "true" : "false",
    workspace_scope: input.workspaceScope ?? "unknown"
  };

  if (input.authMethod) {
    dimensions.auth_method = input.authMethod;
  }
  if (input.authResult) {
    dimensions.auth_result = input.authResult;
  }
  if (input.outcome) {
    dimensions.outcome = input.outcome;
  }

  return dimensions;
}

function getLoggerMethod(
  logger: TelemetryLogger | null | undefined,
  level: TelemetryLogLevel
): TelemetryLogFn | null {
  if (!logger) return null;
  if (level === "warn") return logger.warn ?? null;
  if (level === "error") return logger.error ?? null;
  return logger.info ?? logger.log ?? null;
}

function safeLogTelemetry(
  logger: TelemetryLogger | null | undefined,
  level: TelemetryLogLevel,
  message: string,
  dimensions: Record<string, string>
): void {
  try {
    const logFn = getLoggerMethod(logger, level);
    if (!logFn) return;
    logFn(message, dimensions);
  } catch {
    // Never let diagnostic logging affect request handling.
  }
}

export function logAuthTelemetry(input: TelemetryLogInput): void {
  safeLogTelemetry(
    input.logger,
    input.level ?? "info",
    "auth.telemetry",
    buildTelemetryDimensions({
      category: "auth",
      route: input.route,
      request: input.request,
      config: input.config,
      authMethod: input.authMethod,
      authResult: input.authResult,
      workspaceScope: input.workspaceScope,
      outcome: input.outcome
    })
  );
}

export function logApiTelemetry(input: TelemetryLogInput): void {
  safeLogTelemetry(
    input.logger,
    input.level ?? "warn",
    "api.telemetry",
    buildTelemetryDimensions({
      category: "api",
      route: input.route,
      request: input.request,
      config: input.config,
      authMethod: input.authMethod,
      authResult: input.authResult,
      workspaceScope: input.workspaceScope,
      outcome: input.outcome
    })
  );
}
