import { describe, expect, it } from "vitest";
import { ExternalError } from "./errors";
import {
  getProtectedResourceMetadataUri,
  validateExternalAccessConfiguration
} from "./configuration";
import type { ExternalAccessConfiguration } from "./contracts";

const validInput: ExternalAccessConfiguration = {
  issuer: "https://issuer.example.test/",
  jwksUri: "https://issuer.example.test/.well-known/jwks.json",
  resources: {
    rest: "https://api.example.test/api/v1",
    mcp: "https://api.example.test/api/mcp"
  },
  clientIds: ["client-one", "client-two"]
};

describe("external access configuration", () => {
  it("accepts canonical configured URIs and returns a deeply frozen copy", () => {
    const input = structuredClone(validInput) as {
      issuer: string;
      jwksUri: string;
      resources: { rest: string; mcp: string };
      clientIds: string[];
    };
    const config = validateExternalAccessConfiguration(input);

    expect(config).toEqual(validInput);
    expect(config).not.toBe(input);
    expect(config.resources).not.toBe(input.resources);
    expect(config.clientIds).not.toBe(input.clientIds);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.resources)).toBe(true);
    expect(Object.isFrozen(config.clientIds)).toBe(true);
    expect(() => (config.clientIds as string[]).push("other")).toThrow(TypeError);
    input.resources.rest = "https://attacker.example.test/";
    input.clientIds[0] = "mutated";
    expect(config.resources.rest).toBe("https://api.example.test/api/v1");
    expect(config.clientIds[0]).toBe("client-one");
  });

  it.each([
    ["relative issuer", { ...validInput, issuer: "/issuer" }],
    ["HTTP issuer", { ...validInput, issuer: "http://issuer.example.test/" }],
    ["issuer userinfo", { ...validInput, issuer: "https://user:pass@issuer.example.test/" }],
    ["issuer query", { ...validInput, issuer: "https://issuer.example.test/?tenant=1" }],
    ["issuer trailing query marker", { ...validInput, issuer: "https://issuer.example.test/?" }],
    ["issuer trailing fragment marker", { ...validInput, issuer: "https://issuer.example.test/#" }],
    ["JWKS trailing query marker", { ...validInput, jwksUri: "https://issuer.example.test/keys?" }],
    ["JWKS trailing fragment marker", { ...validInput, jwksUri: "https://issuer.example.test/keys#" }],
    ["REST trailing query marker", { ...validInput, resources: { ...validInput.resources, rest: "https://api.example.test/api/v1?" } }],
    ["REST trailing fragment marker", { ...validInput, resources: { ...validInput.resources, rest: "https://api.example.test/api/v1#" } }],
    ["MCP trailing query marker", { ...validInput, resources: { ...validInput.resources, mcp: "https://api.example.test/api/mcp?" } }],
    ["MCP trailing fragment marker", { ...validInput, resources: { ...validInput.resources, mcp: "https://api.example.test/api/mcp#" } }],
    ["noncanonical issuer", { ...validInput, issuer: "https://ISSUER.example.test/" }],
    ["backslash in JWKS URI", { ...validInput, jwksUri: "https://issuer.example.test\\evil" }],
    ["JWKS fragment", { ...validInput, jwksUri: "https://issuer.example.test/keys#fragment" }],
    ["resource query", { ...validInput, resources: { ...validInput.resources, rest: "https://api.example.test/api/v1?x=1" } }],
    ["resource fragment", { ...validInput, resources: { ...validInput.resources, mcp: "https://api.example.test/api/mcp#x" } }],
    ["noncanonical resource", { ...validInput, resources: { ...validInput.resources, rest: "https://API.example.test/api/v1" } }],
    ["oversized URI", { ...validInput, jwksUri: `https://issuer.example.test/${"x".repeat(2_050)}` }],
    ["equal resources", { ...validInput, resources: { rest: validInput.resources.rest, mcp: validInput.resources.rest } }],
    ["empty client allowlist", { ...validInput, clientIds: [] }],
    ["duplicate clients", { ...validInput, clientIds: ["same", "same"] }],
    ["whitespace in client id", { ...validInput, clientIds: ["bad client"] }],
    ["control in client id", { ...validInput, clientIds: ["bad\nclient"] }],
    ["oversized client id", { ...validInput, clientIds: ["x".repeat(257)] }],
    ["too many clients", { ...validInput, clientIds: Array.from({ length: 65 }, (_, i) => `client-${i}`) }]
  ])("rejects %s with a fixed internal error", (_label, input) => {
    try {
      validateExternalAccessConfiguration(input as ExternalAccessConfiguration);
      throw new Error("expected invalid configuration to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ExternalError);
      expect((error as ExternalError).code).toBe("internal_error");
      expect((error as Error).message).toBe("The request could not be completed.");
      expect((error as Error).message).not.toContain("issuer.example.test");
    }
  });

  it("rejects non-object and malformed runtime values without leaking details", () => {
    expect(() => validateExternalAccessConfiguration(null as never)).toThrowError(
      expect.objectContaining({ code: "internal_error" })
    );
    expect(() => validateExternalAccessConfiguration({ ...validInput, resources: null } as never))
      .toThrowError(expect.objectContaining({ code: "internal_error" }));
  });

  it("derives origin-bound well-known metadata URLs for REST and MCP paths", () => {
    const config = validateExternalAccessConfiguration(validInput);
    expect(getProtectedResourceMetadataUri(config, "rest"))
      .toBe("https://api.example.test/.well-known/oauth-protected-resource/api/v1");
    expect(getProtectedResourceMetadataUri(config, "mcp"))
      .toBe("https://api.example.test/.well-known/oauth-protected-resource/api/mcp");

    const rootConfig = validateExternalAccessConfiguration({
      ...validInput,
      resources: { rest: "https://api.example.test/", mcp: "https://mcp.example.test/" }
    });
    expect(getProtectedResourceMetadataUri(rootConfig, "rest"))
      .toBe("https://api.example.test/.well-known/oauth-protected-resource");
  });

  it("rejects invalid resource kinds rather than concatenating caller input", () => {
    const config = validateExternalAccessConfiguration(validInput);
    expect(() => getProtectedResourceMetadataUri(config, "other/../../evil" as never))
      .toThrowError(expect.objectContaining({ code: "internal_error" }));
  });
});
