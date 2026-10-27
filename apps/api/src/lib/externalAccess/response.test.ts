import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ExternalAccessConfiguration,
  type ExternalResourceKind,
  type ExternalScope
} from "./contracts";
import { EXTERNAL_ERROR_CATALOG, ExternalError } from "./errors";
import { createExternalErrorResponse } from "./response";

const configuration: ExternalAccessConfiguration = {
  issuer: "https://issuer.example.test/",
  jwksUri: "https://issuer.example.test/.well-known/jwks.json",
  resources: {
    rest: "https://api.example.test/v1",
    mcp: "https://api.example.test/mcp"
  },
  clientIds: ["test-client"]
};

function responseFor(code: keyof typeof EXTERNAL_ERROR_CATALOG, options?: {
  configuration: ExternalAccessConfiguration;
  resourceKind: ExternalResourceKind;
  requiredScopes?: readonly ExternalScope[];
}) {
  return createExternalErrorResponse(new ExternalError(code), options);
}

function errorBody(response: ReturnType<typeof createExternalErrorResponse>) {
  return response.jsonBody as {
    error: { code: string; message: string; correlationId: string };
  };
}

describe("createExternalErrorResponse", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps each catalog error to a fixed safe envelope and status", () => {
    for (const [code, entry] of Object.entries(EXTERNAL_ERROR_CATALOG)) {
      const response = createExternalErrorResponse(new ExternalError(code as keyof typeof EXTERNAL_ERROR_CATALOG));

      expect(response.status).toBe(entry.status);
      expect(errorBody(response).error).toMatchObject({ code, message: entry.message });
      expect(errorBody(response).error.correlationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(Object.keys(errorBody(response))).toEqual(["error"]);
      expect(Object.keys(errorBody(response).error).sort()).toEqual(["code", "correlationId", "message"]);
      expect(response.headers).toMatchObject({
        "cache-control": "no-store",
        "content-type": "application/json"
      });
    }
  });

  it("uses fixed internal_error for unknown errors without serializing secrets", () => {
    const secret = "bearer=super-secret; sub=private-user; grant=internal-grant";
    const response = createExternalErrorResponse(Object.assign(new Error(secret), {
      code: "invalid_token",
      status: 401,
      details: { token: secret },
      cause: new Error(secret)
    }));

    expect(response.status).toBe(500);
    expect(response.jsonBody).toEqual({
      error: {
        code: "internal_error",
        message: EXTERNAL_ERROR_CATALOG.internal_error.message,
        correlationId: expect.any(String)
      }
    });
    expect(JSON.stringify(response)).not.toContain(secret);
    expect(JSON.stringify(response)).not.toContain("details");
    expect(JSON.stringify(response)).not.toContain("cause");
  });

  it("creates a fresh correlation UUID for every response", () => {
    const first = createExternalErrorResponse(new Error("private"));
    const second = createExternalErrorResponse(new Error("private"));

    expect(errorBody(first).error.correlationId).not.toBe(errorBody(second).error.correlationId);
  });

  it("does not make network requests or claim provider behavior", () => {
    const fetchMock = vi.fn(() => { throw new Error("network access is forbidden in this unit"); });
    vi.stubGlobal("fetch", fetchMock);
    const response = responseFor("invalid_token", { configuration, resourceKind: "mcp" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(response)).not.toMatch(/auth0|entra|provider|issuer|jwks/i);
  });

  it("returns only a bare Bearer challenge when authentication is required without options", () => {
    const response = responseFor("authentication_required");

    expect(response.headers).toMatchObject({ "www-authenticate": "Bearer" });
  });

  it("includes the configured MCP metadata URL with a missing-credentials challenge", () => {
    const response = responseFor("authentication_required", { configuration, resourceKind: "mcp" });

    expect(response.headers).toMatchObject({
      "www-authenticate": 'Bearer resource_metadata="https://api.example.test/.well-known/oauth-protected-resource/mcp"'
    });
  });

  it.each([
    ["invalid_request", 400, 'Bearer error="invalid_request"'],
    ["invalid_token", 401, 'Bearer error="invalid_token"']
  ] as const)("uses the fixed Bearer challenge for %s", (code, status, challenge) => {
    const response = responseFor(code);

    expect(response.status).toBe(status);
    expect(response.headers).toMatchObject({ "www-authenticate": challenge });
  });

  it("includes only validated read scopes in the insufficient_scope challenge", () => {
    const response = responseFor("insufficient_scope", {
      configuration,
      resourceKind: "rest",
      requiredScopes: ["lots:read", "sales:read"]
    });

    expect(response.status).toBe(403);
    expect(response.headers).toMatchObject({
      "www-authenticate": 'Bearer error="insufficient_scope", scope="lots:read sales:read"'
    });
  });

  it("copies validated scopes instead of trusting a caller supplied join method", () => {
    const requiredScopes = ["lots:read"] as unknown as ExternalScope[] & { join: () => string };
    requiredScopes.join = () => 'lots:read", injected="yes';
    const response = responseFor("insufficient_scope", {
      configuration,
      resourceKind: "rest",
      requiredScopes
    });

    expect(response.headers).toMatchObject({
      "www-authenticate": 'Bearer error="insufficient_scope", scope="lots:read"'
    });
  });

  it("rejects arrays whose custom iterator hides an invalid indexed scope", () => {
    const requiredScopes = ["lots:write"] as unknown as ExternalScope[] & {
      [Symbol.iterator]: () => Iterator<string>;
    };
    Object.defineProperty(requiredScopes, Symbol.iterator, {
      value: function* (): Generator<string> { yield "lots:read"; }
    });
    const response = responseFor("insufficient_scope", {
      configuration,
      resourceKind: "rest",
      requiredScopes
    });

    expect(response.status).toBe(500);
    expect(errorBody(response).error.code).toBe("internal_error");
    expect(response.headers).not.toHaveProperty("www-authenticate");
  });

  it("advertises the exact configured MCP protected-resource metadata URL", () => {
    const response = responseFor("invalid_token", { configuration, resourceKind: "mcp" });

    expect(response.headers).toMatchObject({
      "www-authenticate": 'Bearer error="invalid_token", resource_metadata="https://api.example.test/.well-known/oauth-protected-resource/mcp"'
    });
  });

  it("omits resource_metadata for REST challenges", () => {
    const response = responseFor("invalid_token", { configuration, resourceKind: "rest" });

    expect(response.headers).toMatchObject({ "www-authenticate": 'Bearer error="invalid_token"' });
    expect(new Headers(response.headers).get("www-authenticate")).toBe('Bearer error="invalid_token"');
  });

  it("does not challenge unrelated forbidden errors", () => {
    const response = responseFor("forbidden", { configuration, resourceKind: "mcp" });

    expect(response.status).toBe(403);
    expect(response.headers).not.toHaveProperty("www-authenticate");
  });

  it.each([
    ["invalid scope", { requiredScopes: ["lots:write"] }],
    ["duplicate scope", { requiredScopes: ["lots:read", "lots:read"] }],
    ["non-array scope", { requiredScopes: "lots:read" }],
    ["wrong resource kind", { resourceKind: "hostile\r\nInjected: yes" }]
  ] as const)("falls back to safe internal_error for %s", (_label, override) => {
    const response = createExternalErrorResponse(new ExternalError("invalid_token"), {
      configuration,
      resourceKind: "mcp",
      ...override
    } as never);

    expect(response.status).toBe(500);
    expect(errorBody(response).error.code).toBe("internal_error");
    expect(response.headers).not.toHaveProperty("www-authenticate");
  });

  it("rejects incomplete options without adding a challenge", () => {
    const response = createExternalErrorResponse(new ExternalError("invalid_token"), {
      resourceKind: "mcp"
    } as never);

    expect(response.status).toBe(500);
    expect(errorBody(response).error.code).toBe("internal_error");
    expect(response.headers).not.toHaveProperty("www-authenticate");
  });

  it("rejects invalid configuration without adding a caller controlled challenge", () => {
    const badConfiguration = {
      ...configuration,
      issuer: "https://issuer.example.test/\r\nWWW-Authenticate: Bearer"
    } as ExternalAccessConfiguration;
    const response = createExternalErrorResponse(new ExternalError("invalid_token"), {
      configuration: badConfiguration,
      resourceKind: "mcp"
    });

    expect(response.status).toBe(500);
    expect(errorBody(response).error.code).toBe("internal_error");
    expect(response.headers).not.toHaveProperty("www-authenticate");
  });

  it("does not trust a fake ExternalError or a throwing code getter", () => {
    const fake = Object.create(ExternalError.prototype) as ExternalError;
    Object.defineProperty(fake, "code", { get: () => { throw new Error("secret getter"); } });
    const response = createExternalErrorResponse(fake);

    expect(response.status).toBe(500);
    expect(errorBody(response).error.code).toBe("internal_error");

    const incompleteFake = Object.create(ExternalError.prototype) as ExternalError;
    Object.defineProperties(incompleteFake, {
      code: { value: "invalid_token" },
      status: { value: 401 }
    });
    Object.freeze(incompleteFake);
    const forged = createExternalErrorResponse(incompleteFake);
    expect(forged.status).toBe(500);
    expect(errorBody(forged).error.code).toBe("internal_error");
  });
});
