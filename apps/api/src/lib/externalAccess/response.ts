import { randomUUID } from "node:crypto";
import type { HttpResponseInit } from "@azure/functions";
import { EXTERNAL_READ_SCOPES,
  type ExternalAccessConfiguration,
  type ExternalResourceKind,
  type ExternalScope
} from "./contracts";
import { EXTERNAL_ERROR_CATALOG, ExternalError, type ExternalErrorCode } from "./errors";
import { getProtectedResourceMetadataUri, validateExternalAccessConfiguration } from "./configuration";

export interface ExternalErrorResponseOptions {
  readonly configuration: ExternalAccessConfiguration;
  readonly resourceKind: ExternalResourceKind;
  readonly requiredScopes?: readonly ExternalScope[];
}

interface PublicChallengeOptions {
  readonly scope?: string;
  readonly metadataUri?: string;
}

interface PublicChallenge {
  readonly value: string;
}

const BASE_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-type": "application/json"
});

function getTrustedErrorCode(error: unknown): ExternalErrorCode | undefined {
  try {
    if (!(error instanceof ExternalError) || Object.getPrototypeOf(error) !== ExternalError.prototype) {
      return undefined;
    }

    const code = Object.getOwnPropertyDescriptor(error, "code");
    if (!code || !("value" in code) || typeof code.value !== "string"
      || !Object.prototype.hasOwnProperty.call(EXTERNAL_ERROR_CATALOG, code.value)) {
      return undefined;
    }

    // Verify the fixed own data properties instead of reading potentially
    // hostile getters on an object that merely inherits from this prototype.
    const entry = EXTERNAL_ERROR_CATALOG[code.value as ExternalErrorCode];
    const status = Object.getOwnPropertyDescriptor(error, "status");
    const message = Object.getOwnPropertyDescriptor(error, "message");
    const name = Object.getOwnPropertyDescriptor(error, "name");
    if (!Object.isFrozen(error)
      || !status || !("value" in status) || status.value !== entry.status
      || !message || !("value" in message) || message.value !== entry.message
      || !name || !("value" in name) || name.value !== "ExternalError") {
      return undefined;
    }
    return code.value as ExternalErrorCode;
  } catch {
    return undefined;
  }
}

function validateOptions(options: unknown): PublicChallengeOptions | undefined {
  if (options === undefined) return undefined;

  try {
    if (typeof options !== "object" || options === null || Array.isArray(options)) {
      throw new TypeError("Invalid response options.");
    }

    const candidate = options as Partial<ExternalErrorResponseOptions>;
    if (candidate.resourceKind !== "rest" && candidate.resourceKind !== "mcp") {
      throw new TypeError("Invalid resource kind.");
    }

    const configuration = validateExternalAccessConfiguration(candidate.configuration as ExternalAccessConfiguration);
    const scopes = candidate.requiredScopes;
    let validatedScopes: string[] | undefined;
    if (scopes !== undefined) {
      if (!Array.isArray(scopes)) throw new TypeError("Invalid required scopes.");
      const lengthDescriptor = Object.getOwnPropertyDescriptor(scopes, "length");
      if (!lengthDescriptor || !("value" in lengthDescriptor)
        || !Number.isSafeInteger(lengthDescriptor.value)
        || lengthDescriptor.value < 0) {
        throw new TypeError("Invalid required scopes.");
      }
      const seen = new Set<string>();
      validatedScopes = [];
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const scopeDescriptor = Object.getOwnPropertyDescriptor(scopes, String(index));
        if (!scopeDescriptor || !("value" in scopeDescriptor)) {
          throw new TypeError("Invalid required scopes.");
        }
        const scope: unknown = scopeDescriptor.value;
        if (typeof scope !== "string"
          || !(EXTERNAL_READ_SCOPES as readonly string[]).includes(scope)
          || seen.has(scope)) {
          throw new TypeError("Invalid required scopes.");
        }
        seen.add(scope);
        validatedScopes.push(scope);
      }
    }

    let metadataUri: string | undefined;
    if (candidate.resourceKind === "mcp") {
      metadataUri = getProtectedResourceMetadataUri(configuration, "mcp");
      if (typeof metadataUri !== "string"
        || metadataUri.length === 0
        || /[\u0000-\u001f\u007f]/.test(metadataUri)) {
        throw new TypeError("Invalid metadata URI.");
      }
    }

    return {
      ...(validatedScopes && validatedScopes.length > 0 ? { scope: validatedScopes.join(" ") } : {}),
      ...(metadataUri ? { metadataUri } : {})
    };
  } catch {
    throw new TypeError("Invalid response options.");
  }
}

function quoteAuthValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function createResponse(code: ExternalErrorCode, challenge?: PublicChallenge): HttpResponseInit {
  const entry = EXTERNAL_ERROR_CATALOG[code];
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (challenge) headers["www-authenticate"] = challenge.value;

  return {
    status: entry.status,
    headers,
    jsonBody: {
      error: {
        code,
        message: entry.message,
        correlationId: randomUUID()
      }
    }
  };
}

/** Convert internal failures to a fixed, safe OAuth response envelope. */
export function createExternalErrorResponse(
  error: unknown,
  options?: ExternalErrorResponseOptions
): HttpResponseInit {
  let challengeOptions: PublicChallengeOptions | undefined;
  try {
    challengeOptions = validateOptions(options);
  } catch {
    return createResponse("internal_error");
  }

  const code = getTrustedErrorCode(error) ?? "internal_error";
  let challenge: PublicChallenge | undefined;
  if (code === "authentication_required"
    || code === "invalid_request"
    || code === "invalid_token"
    || code === "insufficient_scope") {
    const parameters = [
      ...(code === "authentication_required" ? [] : [`error="${code}"`]),
      ...(code === "insufficient_scope" && challengeOptions?.scope
        ? [`scope="${quoteAuthValue(challengeOptions.scope)}"`]
        : []),
      ...(challengeOptions?.metadataUri
        ? [`resource_metadata="${quoteAuthValue(challengeOptions.metadataUri)}"`]
        : [])
    ];
    challenge = { value: `Bearer${parameters.length > 0 ? ` ${parameters.join(", ")}` : ""}` };
  }

  return createResponse(code, challenge);
}
