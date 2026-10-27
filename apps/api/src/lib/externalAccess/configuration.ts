import { ExternalError } from "./errors";
import type { ExternalAccessConfiguration, ExternalResourceKind } from "./contracts";

const MAX_CONFIGURED_URI_LENGTH = 2_048;
const MAX_CLIENT_IDS = 64;
const MAX_CLIENT_ID_LENGTH = 256;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const WHITESPACE = /\s/;

function failConfiguration(): never {
  throw new ExternalError("internal_error");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateCanonicalHttpsUri(value: unknown): string {
  if (typeof value !== "string"
    || value.length === 0
    || value.length > MAX_CONFIGURED_URI_LENGTH
    || CONTROL_CHARACTERS.test(value)
    || value.includes("\\")
    || value.includes("?")
    || value.includes("#")) {
    return failConfiguration();
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:"
      || parsed.username !== ""
      || parsed.password !== ""
      || parsed.search !== ""
      || parsed.hash !== ""
      || parsed.href !== value) {
      return failConfiguration();
    }
    return value;
  } catch {
    return failConfiguration();
  }
}

/** Validate untrusted runtime configuration and return an immutable defensive copy. */
export function validateExternalAccessConfiguration(
  input: ExternalAccessConfiguration
): ExternalAccessConfiguration {
  try {
    if (!isRecord(input)) return failConfiguration();

    const issuer = validateCanonicalHttpsUri(input.issuer);
    const jwksUri = validateCanonicalHttpsUri(input.jwksUri);
    if (!isRecord(input.resources)) return failConfiguration();
    const rest = validateCanonicalHttpsUri(input.resources.rest);
    const mcp = validateCanonicalHttpsUri(input.resources.mcp);
    if (rest === mcp) return failConfiguration();

    const rawClientIds = input.clientIds;
    if (!Array.isArray(rawClientIds)
      || rawClientIds.length === 0
      || rawClientIds.length > MAX_CLIENT_IDS) {
      return failConfiguration();
    }

    const clientIds: string[] = [];
    const seenClientIds = new Set<string>();
    for (const clientId of rawClientIds) {
      if (typeof clientId !== "string"
        || clientId.length === 0
        || clientId.length > MAX_CLIENT_ID_LENGTH
        || CONTROL_CHARACTERS.test(clientId)
        || WHITESPACE.test(clientId)
        || seenClientIds.has(clientId)) {
        return failConfiguration();
      }
      seenClientIds.add(clientId);
      clientIds.push(clientId);
    }

    const resources = Object.freeze({ rest, mcp });
    return Object.freeze({
      issuer,
      jwksUri,
      resources,
      clientIds: Object.freeze(clientIds)
    });
  } catch {
    return failConfiguration();
  }
}

/** Derive the RFC 9728 path-bound metadata URL for a configured resource. */
export function getProtectedResourceMetadataUri(
  config: ExternalAccessConfiguration,
  kind: ExternalResourceKind
): string {
  try {
    if (kind !== "rest" && kind !== "mcp") return failConfiguration();
    const validated = validateExternalAccessConfiguration(config);
    const resourceUrl = new URL(validated.resources[kind]);
    const resourcePath = resourceUrl.pathname === "/" ? "" : resourceUrl.pathname;
    return `${resourceUrl.origin}/.well-known/oauth-protected-resource${resourcePath}`;
  } catch {
    return failConfiguration();
  }
}
