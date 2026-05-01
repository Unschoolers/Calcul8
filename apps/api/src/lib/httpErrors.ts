import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { HttpError } from "./auth";
import { errorResponse } from "./http";
import { logApiTelemetry } from "./telemetry";
import type { ApiConfig } from "../types";

type WorkspaceScope = "personal" | "workspace" | "unknown";

interface HandleApiFunctionErrorInput {
  request: HttpRequest;
  context: InvocationContext;
  config: ApiConfig;
  route: string;
  workspaceScope: WorkspaceScope;
  error: unknown;
  failureMessage: string;
  logMessage: string;
  warnStatuses?: readonly number[];
  normalizeError?: (error: unknown) => unknown;
  shouldLogError?: (args: {
    originalError: unknown;
    handledError: unknown;
    status: number | null;
  }) => boolean;
}

const DEFAULT_WARN_STATUSES = [401, 403, 409] as const;

export function readHttpErrorStatus(error: unknown): number | null {
  if (!(error instanceof HttpError)) {
    return typeof error === "object" && error && "status" in error
      ? Number((error as { status?: unknown }).status)
      : null;
  }

  return error.status;
}

export function handleApiFunctionError(input: HandleApiFunctionErrorInput): HttpResponseInit {
  const handledError = input.normalizeError ? input.normalizeError(input.error) : input.error;
  const status = readHttpErrorStatus(handledError);
  const warnStatuses = input.warnStatuses ?? DEFAULT_WARN_STATUSES;

  if (status !== null && warnStatuses.includes(status)) {
    logApiTelemetry({
      logger: input.context,
      level: "warn",
      request: input.request,
      config: input.config,
      route: input.route,
      workspaceScope: input.workspaceScope,
      outcome: `http_${status}`
    });
  }

  const shouldLogError = input.shouldLogError
    ? input.shouldLogError({
      originalError: input.error,
      handledError,
      status
    })
    : true;

  if (shouldLogError) {
    input.context.error(input.logMessage, input.error);
  }

  return errorResponse(input.request, input.config, handledError, input.failureMessage);
}
