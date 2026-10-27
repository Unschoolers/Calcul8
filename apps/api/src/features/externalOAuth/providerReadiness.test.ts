import { describe, expect, it } from "vitest";
import type { ExternalAccessConfiguration } from "../../lib/externalAccess/contracts";
import { assessExternalOAuthProvider } from "./providerReadiness";

const config: ExternalAccessConfiguration = {
  issuer: "https://issuer.example.test/",
  jwksUri: "https://issuer.example.test/.well-known/jwks.json",
  resources: { rest: "https://api.example.test/rest", mcp: "https://api.example.test/mcp" },
  clientIds: ["private-client"]
};
const metadata = () => ({
  issuer: config.issuer, jwks_uri: config.jwksUri,
  authorization_endpoint: "https://issuer.example.test/authorize",
  token_endpoint: "https://issuer.example.test/token",
  revocation_endpoint: "https://issuer.example.test/revoke",
  code_challenge_methods_supported: ["S256"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  response_types_supported: ["code"], token_endpoint_auth_methods_supported: ["none"],
  authorization_response_iss_parameter_supported: true,
  id_token_signing_alg_values_supported: ["RS256"], scopes_supported: ["openid"]
});
const ids = ["issuer_exact", "jwks_exact", "authorization_endpoint", "token_endpoint", "revocation_endpoint", "pkce_s256", "authorization_code", "refresh_token", "response_code", "public_client_none", "issuer_response_parameter", "id_token_rs256", "openid_scope"];
const failed = (input: unknown) => assessExternalOAuthProvider(config, input).checks.filter(c => !c.passed).map(c => c.id);

describe("provider metadata assessment", () => {
  it("returns fixed immutable checks for consistent metadata without granting activation", () => {
    const result = assessExternalOAuthProvider(config, metadata());
    expect(result).toEqual({ status: "metadata_consistent", activationReady: false, checks: ids.map(id => ({ id, passed: true })) });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.checks)).toBe(true);
    expect(result.checks.every(Object.isFrozen)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("issuer.example");
    expect(JSON.stringify(result)).not.toContain("private-client");
  });
  it("requires exact issuer and JWKS", () => {
    const input = { ...metadata(), issuer: "https://other.test/", jwks_uri: "https://other.test/keys" };
    expect(failed(input)).toEqual(["issuer_exact", "jwks_exact"]);
    expect(assessExternalOAuthProvider(config, input)).toMatchObject({ status: "metadata_incompatible", activationReady: false });
  });
  it("rejects unsafe or noncanonical endpoints including empty query and fragment", () => {
    for (const uri of ["http://issuer.example.test/token", "https://other.test/token", "https://user@issuer.example.test/token", "https://issuer.example.test/token?", "https://issuer.example.test/token#", "https://issuer.example.test/\\token", "https://issuer.example.test/\ntoken", "https://issuer.example.test/" + "a".repeat(2048)]) {
      expect(failed({ ...metadata(), token_endpoint: uri })).toEqual(["token_endpoint"]);
    }
  });
  it("requires each capability and rejects malformed or oversized lists", () => {
    const fields: [string, string[], string][] = [
      ["code_challenge_methods_supported", ["S256"], "pkce_s256"], ["response_types_supported", ["code"], "response_code"],
      ["token_endpoint_auth_methods_supported", ["none"], "public_client_none"], ["id_token_signing_alg_values_supported", ["RS256"], "id_token_rs256"], ["scopes_supported", ["openid"], "openid_scope"]
    ];
    for (const [field, valid, id] of fields) {
      for (const bad of [[], [valid[0], 1], [valid[0], "x".repeat(257)], [valid[0], "\n"], Array(129).fill(valid[0])]) {
        expect(failed({ ...metadata(), [field]: bad })).toContain(id);
      }
    }
    expect(failed({ ...metadata(), grant_types_supported: [] })).toEqual(["authorization_code", "refresh_token"]);
    expect(failed({ ...metadata(), authorization_response_iss_parameter_supported: false })).toEqual(["issuer_response_parameter"]);
  });
  it("does not execute accessors or custom array methods", () => {
    let calls = 0;
    const value = metadata();
    Object.defineProperty(value, "issuer", { get() { calls++; throw Error("secret"); } });
    const list = ["S256"];
    Object.defineProperty(list, "0", { get() { calls++; throw Error("secret"); } });
    Object.defineProperty(list, "includes", { value() { calls++; throw Error("secret"); } });
    value.code_challenge_methods_supported = list;
    expect(failed(value)).toEqual(["issuer_exact", "pkce_s256"]);
    expect(calls).toBe(0);
    expect(failed(Object.create({ issuer: config.issuer }))).toEqual(ids);
    expect(failed(null)).toEqual(ids);
  });
  it("uses the existing fixed error for invalid configuration", () => {
    expect(() => assessExternalOAuthProvider({ ...config, issuer: "http://bad" }, metadata())).toThrow("The request could not be completed.");
  });
});
