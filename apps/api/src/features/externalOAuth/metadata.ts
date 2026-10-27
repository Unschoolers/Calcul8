import {
  EXTERNAL_READ_SCOPES,
  type ExternalAccessConfiguration,
  type ExternalResourceKind,
  type ExternalScope
} from "../../lib/externalAccess/contracts";
import { validateExternalAccessConfiguration } from "../../lib/externalAccess/configuration";
import { ExternalError } from "../../lib/externalAccess/errors";

export interface ProtectedResourceMetadata {
  readonly resource: string;
  readonly authorization_servers: readonly string[];
  readonly scopes_supported: readonly ExternalScope[];
  readonly bearer_methods_supported: readonly ["header"];
  readonly resource_signing_alg_values_supported: readonly ["RS256"];
}

/** Create an immutable RFC 9728 resource document for one configured API resource. */
export function createProtectedResourceMetadata(
  config: ExternalAccessConfiguration,
  kind: ExternalResourceKind
): ProtectedResourceMetadata {
  const validated = validateExternalAccessConfiguration(config);
  if (kind !== "rest" && kind !== "mcp") {
    throw new ExternalError("internal_error");
  }

  return Object.freeze({
    resource: validated.resources[kind],
    authorization_servers: Object.freeze([validated.issuer]),
    scopes_supported: Object.freeze([...EXTERNAL_READ_SCOPES]),
    bearer_methods_supported: Object.freeze(["header"] as const),
    resource_signing_alg_values_supported: Object.freeze(["RS256"] as const)
  });
}
