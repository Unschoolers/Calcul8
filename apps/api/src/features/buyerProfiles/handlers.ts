import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../../lib/auth";
import { BuyerProfileVersionConflictError } from "../../lib/cosmos/buyerProfileRepository";
import { getConfig } from "../../lib/config";
import { errorResponse, executeHttpHandler, jsonResponse } from "../../lib/http";
import { readRequestJsonOrThrow, requireRequestBodyRecord } from "../../lib/httpRequest";
import { publishWorkspacePresenceRealtimeEventBestEffort } from "../../lib/realtime";
import { parseOptionalWorkspaceId } from "../../lib/syncScope";
import {
  deleteBuyerProfileForActor,
  listBuyerProfilesForActor,
  saveBuyerProfileForActor
} from "./services";

const MAX_USERNAME_LENGTH = 100;
const MAX_PREFERRED_NAME_LENGTH = 80;
const MAX_TAG_COUNT = 10;
const MAX_TAG_LENGTH = 32;
const MAX_MUTATION_ID_LENGTH = 200;

function cleanWhitespace(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function getQueryParam(request: HttpRequest, key: string): string | null {
  if (request.query && typeof request.query.get === "function") {
    return request.query.get(key);
  }
  try {
    return new URL(request.url).searchParams.get(key);
  } catch {
    return null;
  }
}

function parseWorkspaceIdFromQuery(request: HttpRequest): string | undefined {
  return parseOptionalWorkspaceId(getQueryParam(request, "workspaceId"));
}

function assertAllowedFields(body: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedFields = new Set(allowed);
  const unknownField = Object.keys(body).find((key) => !allowedFields.has(key));
  if (unknownField) {
    throw new HttpError(400, `Request contains unknown field '${unknownField}'.`);
  }
}

function parseUsername(value: unknown): string {
  const username = cleanWhitespace(value);
  if (!username) throw new HttpError(400, "Field 'username' is required.");
  if (username.length > MAX_USERNAME_LENGTH) {
    throw new HttpError(400, `Field 'username' cannot exceed ${MAX_USERNAME_LENGTH} characters.`);
  }
  return username;
}

function parsePreferredName(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") throw new HttpError(400, "Field 'preferredName' must be a string.");
  const preferredName = cleanWhitespace(value);
  if (preferredName.length > MAX_PREFERRED_NAME_LENGTH) {
    throw new HttpError(400, `Field 'preferredName' cannot exceed ${MAX_PREFERRED_NAME_LENGTH} characters.`);
  }
  return preferredName || undefined;
}

function parseTags(value: unknown): string[] {
  if (!Array.isArray(value)) throw new HttpError(400, "Field 'tags' must be an array.");
  if (value.length > MAX_TAG_COUNT) {
    throw new HttpError(400, `Buyer profiles cannot contain more than ${MAX_TAG_COUNT} tags.`);
  }
  return value.map((rawTag, index) => {
    if (typeof rawTag !== "string") {
      throw new HttpError(400, `Field 'tags[${index}]' must be a string.`);
    }
    const tag = cleanWhitespace(rawTag);
    if (!tag) throw new HttpError(400, `Field 'tags[${index}]' cannot be empty.`);
    if (tag.length > MAX_TAG_LENGTH) {
      throw new HttpError(400, `Field 'tags[${index}]' cannot exceed ${MAX_TAG_LENGTH} characters.`);
    }
    return tag;
  });
}

function parseBaseVersion(value: unknown): number {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 0) {
    throw new HttpError(400, "Field 'baseVersion' must be a non-negative integer.");
  }
  return version;
}

function parseMutationId(value: unknown): string {
  const mutationId = cleanWhitespace(value);
  if (!mutationId) throw new HttpError(400, "Field 'mutationId' is required.");
  if (mutationId.length > MAX_MUTATION_ID_LENGTH) {
    throw new HttpError(400, `Field 'mutationId' cannot exceed ${MAX_MUTATION_ID_LENGTH} characters.`);
  }
  return mutationId;
}

function parseUpsertBody(rawBody: unknown) {
  const body = requireRequestBodyRecord(rawBody);
  assertAllowedFields(body, ["workspaceId", "username", "preferredName", "tags", "baseVersion", "mutationId"]);
  return {
    workspaceId: parseOptionalWorkspaceId(body.workspaceId),
    username: parseUsername(body.username),
    preferredName: parsePreferredName(body.preferredName),
    tags: parseTags(body.tags),
    baseVersion: parseBaseVersion(body.baseVersion),
    mutationId: parseMutationId(body.mutationId)
  };
}

function parseDeleteBody(rawBody: unknown) {
  const body = requireRequestBodyRecord(rawBody);
  assertAllowedFields(body, ["workspaceId", "username", "baseVersion", "mutationId"]);
  return {
    workspaceId: parseOptionalWorkspaceId(body.workspaceId),
    username: parseUsername(body.username),
    baseVersion: parseBaseVersion(body.baseVersion),
    mutationId: parseMutationId(body.mutationId)
  };
}

function handleBuyerProfileError(
  request: HttpRequest,
  context: InvocationContext,
  error: unknown
): HttpResponseInit {
  const config = getConfig();
  if (error instanceof BuyerProfileVersionConflictError) {
    return errorResponse(
      request,
      config,
      new HttpError(409, error.message, "BUYER_PROFILE_CONFLICT"),
      "Buyer profile changed since it was last loaded."
    );
  }
  context.error("Buyer profile request failed.", error);
  return errorResponse(request, config, error, "Buyer profile request failed.");
}

async function buyerProfilesList(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "Failed to list buyer profiles.",
    fallbackErrorMessage: "Failed to list buyer profiles.",
    operation: async ({ config }) => {
      const actorUserId = await resolveUserId(request, config, {
        telemetry: { logger: context, route: "buyer_profiles_list", workspaceScope: "unknown" }
      });
      const workspaceId = parseWorkspaceIdFromQuery(request);
      const profiles = await listBuyerProfilesForActor(config, actorUserId, workspaceId);
      return jsonResponse(request, config, 200, { profiles });
    },
    handleError: (error) => handleBuyerProfileError(request, context, error)
  });
}

async function buyerProfilesSave(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "Failed to save buyer profile.",
    fallbackErrorMessage: "Failed to save buyer profile.",
    operation: async ({ config }) => {
      const actorUserId = await resolveUserId(request, config, {
        telemetry: { logger: context, route: "buyer_profiles_save", workspaceScope: "unknown" }
      });
      const input = parseUpsertBody(await readRequestJsonOrThrow(request));
      const result = await saveBuyerProfileForActor(config, actorUserId, input);
      publishWorkspacePresenceRealtimeEventBestEffort(config, {
        workspaceId: input.workspaceId,
        eventType: "buyer.profile.changed",
        data: { profileId: result.profileId, version: result.profile.version, deleted: false },
        logger: context
      });
      return jsonResponse(request, config, 200, { ok: true, profile: result.profile });
    },
    handleError: (error) => handleBuyerProfileError(request, context, error)
  });
}

async function buyerProfilesDelete(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "Failed to delete buyer profile.",
    fallbackErrorMessage: "Failed to delete buyer profile.",
    operation: async ({ config }) => {
      const actorUserId = await resolveUserId(request, config, {
        telemetry: { logger: context, route: "buyer_profiles_delete", workspaceScope: "unknown" }
      });
      const input = parseDeleteBody(await readRequestJsonOrThrow(request));
      const result = await deleteBuyerProfileForActor(config, actorUserId, input);
      if (result.profileId) {
        publishWorkspacePresenceRealtimeEventBestEffort(config, {
          workspaceId: input.workspaceId,
          eventType: "buyer.profile.changed",
          data: { profileId: result.profileId, version: result.version, deleted: true },
          logger: context
        });
      }
      return jsonResponse(request, config, 200, { ok: true, version: result.version });
    },
    handleError: (error) => handleBuyerProfileError(request, context, error)
  });
}

export async function buyerProfilesRoute(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  switch (request.method) {
    case "GET":
    case "OPTIONS":
      return buyerProfilesList(request, context);
    case "PUT":
      return buyerProfilesSave(request, context);
    case "DELETE":
      return buyerProfilesDelete(request, context);
    default:
      return errorResponse(request, getConfig(), new HttpError(405, "Method not allowed."), "Method not allowed.");
  }
}
