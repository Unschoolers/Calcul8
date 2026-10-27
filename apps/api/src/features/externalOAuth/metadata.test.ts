import { describe, expect, it } from "vitest";
import { ExternalError } from "../../lib/externalAccess/errors";
import { createProtectedResourceMetadata } from "./metadata";
import { EXTERNAL_READ_SCOPES, type ExternalAccessConfiguration } from "../../lib/externalAccess/contracts";

const config: ExternalAccessConfiguration = {
  issuer: "https://issuer.example.test/",
  jwksUri: "https://issuer.example.test/.well-known/jwks.json",
  resources: {
    rest: "https://api.example.test/api/v1",
    mcp: "https://api.example.test/api/mcp"
  },
  clientIds: ["private-client"]
};

describe("protected resource metadata", () => {
  it("publishes only the configured read-only REST resource and issuer", () => {
    const metadata = createProtectedResourceMetadata(config, "rest");

    expect(metadata).toEqual({
      resource: "https://api.example.test/api/v1",
      authorization_servers: ["https://issuer.example.test/"],
      scopes_supported: [...EXTERNAL_READ_SCOPES],
      bearer_methods_supported: ["header"],
      resource_signing_alg_values_supported: ["RS256"]
    });
    expect(Object.keys(metadata).sort()).toEqual([
      "authorization_servers",
      "bearer_methods_supported",
      "resource",
      "resource_signing_alg_values_supported",
      "scopes_supported"
    ]);
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(Object.isFrozen(metadata.authorization_servers)).toBe(true);
    expect(Object.isFrozen(metadata.scopes_supported)).toBe(true);
    expect(Object.isFrozen(metadata.bearer_methods_supported)).toBe(true);
    expect(Object.isFrozen(metadata.resource_signing_alg_values_supported)).toBe(true);
  });

  it("binds MCP metadata to the distinct configured MCP endpoint", () => {
    expect(createProtectedResourceMetadata(config, "mcp").resource)
      .toBe("https://api.example.test/api/mcp");
    expect(createProtectedResourceMetadata(config, "mcp").resource)
      .not.toBe(createProtectedResourceMetadata(config, "rest").resource);
  });

  it("rejects an invalid runtime resource kind with a fixed internal error", () => {
    try {
      createProtectedResourceMetadata(config, "custom/../path" as never);
      throw new Error("expected invalid resource kind to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ExternalError);
      expect((error as ExternalError).code).toBe("internal_error");
      expect((error as Error).message).toBe("The request could not be completed.");
    }
  });

  it("returns independent copies and never exposes client IDs or JWKS URI", () => {
    const first = createProtectedResourceMetadata(config, "rest");
    const second = createProtectedResourceMetadata(config, "rest");
    expect(first).not.toBe(second);
    expect(first.scopes_supported).not.toBe(second.scopes_supported);
    expect(JSON.stringify(first)).not.toContain("private-client");
    expect(JSON.stringify(first)).not.toContain("jwks.json");
    expect(JSON.stringify(first)).not.toContain("write");
  });
});
