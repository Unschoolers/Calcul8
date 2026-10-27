import type { ExternalAccessConfiguration } from "../../lib/externalAccess/contracts";
import { validateExternalAccessConfiguration } from "../../lib/externalAccess/configuration";

export interface ExternalOAuthProviderAssessment {
  readonly status: "metadata_consistent" | "metadata_incompatible";
  readonly activationReady: false;
  readonly checks: readonly { readonly id: string; readonly passed: boolean }[];
}

const CONTROL = /[\u0000-\u001f\u007f]/;

// Read only own data properties; never evaluate a metadata accessor.
function field(value: unknown, key: string): unknown {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function supports(value: unknown, required: string): boolean {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (typeof length !== "number" || length > 128) return false;
    let found = false;
    for (let index = 0; index < length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string"
        || descriptor.value.length > 256 || CONTROL.test(descriptor.value)) return false;
      if (descriptor.value === required) found = true;
    }
    return found;
  } catch {
    return false;
  }
}

function endpoint(value: unknown, issuerOrigin: string): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048
    || CONTROL.test(value) || value.includes("\\") || value.includes("?") || value.includes("#")) return false;
  try {
    const uri = new URL(value);
    return uri.protocol === "https:" && uri.origin === issuerOrigin && !uri.username && !uri.password
      && uri.href === value;
  } catch {
    return false;
  }
}

/** Assess advertised public metadata offline; this does not establish activation readiness. */
export function assessExternalOAuthProvider(
  configuration: ExternalAccessConfiguration,
  metadata: unknown
): ExternalOAuthProviderAssessment {
  const config = validateExternalAccessConfiguration(configuration);
  const origin = new URL(config.issuer).origin;
  const checks = [
    { id: "issuer_exact", passed: field(metadata, "issuer") === config.issuer },
    { id: "jwks_exact", passed: field(metadata, "jwks_uri") === config.jwksUri },
    { id: "authorization_endpoint", passed: endpoint(field(metadata, "authorization_endpoint"), origin) },
    { id: "token_endpoint", passed: endpoint(field(metadata, "token_endpoint"), origin) },
    { id: "revocation_endpoint", passed: endpoint(field(metadata, "revocation_endpoint"), origin) },
    { id: "pkce_s256", passed: supports(field(metadata, "code_challenge_methods_supported"), "S256") },
    { id: "authorization_code", passed: supports(field(metadata, "grant_types_supported"), "authorization_code") },
    { id: "refresh_token", passed: supports(field(metadata, "grant_types_supported"), "refresh_token") },
    { id: "response_code", passed: supports(field(metadata, "response_types_supported"), "code") },
    { id: "public_client_none", passed: supports(field(metadata, "token_endpoint_auth_methods_supported"), "none") },
    { id: "issuer_response_parameter", passed: field(metadata, "authorization_response_iss_parameter_supported") === true },
    { id: "id_token_rs256", passed: supports(field(metadata, "id_token_signing_alg_values_supported"), "RS256") },
    { id: "openid_scope", passed: supports(field(metadata, "scopes_supported"), "openid") }
  ];
  const status = checks.every(check => check.passed) ? "metadata_consistent" : "metadata_incompatible";
  return Object.freeze({ status, activationReady: false, checks: Object.freeze(checks.map(check => Object.freeze(check))) });
}
