import { describe, expect, it } from "vitest";
import {
  EXTERNAL_READ_SCOPES,
  RESERVED_EXTERNAL_WRITE_SCOPES,
  type ExternalScope
} from "./contracts";
import { EXTERNAL_ERROR_CATALOG, ExternalError } from "./errors";

// @ts-expect-error Reserved write permissions are not external authorization scopes.
const reservedWriteScope: ExternalScope = "lots:write";
void reservedWriteScope;

describe("ExternalError", () => {
  it("exposes the complete fixed code, status, and message catalog", () => {
    expect(EXTERNAL_ERROR_CATALOG).toEqual({
      invalid_request: { status: 400, message: "The request is invalid." },
      authentication_required: { status: 401, message: "Authentication is required." },
      invalid_token: { status: 401, message: "The access token is invalid." },
      insufficient_scope: { status: 403, message: "Required permissions are missing." },
      forbidden: { status: 403, message: "Access is forbidden." },
      not_found: { status: 404, message: "The resource was not found." },
      conflict: { status: 409, message: "The resource has changed." },
      precondition_failed: { status: 412, message: "The precondition was not met." },
      unprocessable_entity: { status: 422, message: "The request cannot be processed." },
      rate_limited: { status: 429, message: "Too many requests." },
      internal_error: { status: 500, message: "The request could not be completed." },
      temporarily_unavailable: { status: 503, message: "The service is temporarily unavailable." }
    });
    expect(Object.isFrozen(EXTERNAL_ERROR_CATALOG)).toBe(true);
  });

  it("uses only fixed catalog messages and status codes", () => {
    const error = new ExternalError("invalid_token");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ExternalError");
    expect(error.code).toBe("invalid_token");
    expect(error.status).toBe(401);
    expect(error.message).toBe("The access token is invalid.");
    expect(Object.isFrozen(error)).toBe(true);
  });

  it("does not permit mutation of error fields", () => {
    const error = new ExternalError("forbidden");

    expect(() => Object.assign(error, { message: "secret", status: 200 })).toThrow();
    expect(error.message).toBe("Access is forbidden.");
    expect(error.status).toBe(403);
  });

  it("stores every own field as a data property", () => {
    const error = new ExternalError("invalid_token");

    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(error))) {
      expect(descriptor).toHaveProperty("value");
      expect(descriptor.get).toBeUndefined();
      expect(descriptor.set).toBeUndefined();
    }
  });

  it.each([
    ["unknown", "unknown"],
    ["inherited constructor", "constructor"],
    ["inherited toString", "toString"],
    ["coercible object", { toString: () => "invalid_token" }],
    ["null", null],
    ["number", 401]
  ])("rejects %s error codes without coercion", (_label, code) => {
    expect(() => new ExternalError(code as never)).toThrow(TypeError);
    try {
      new ExternalError(code as never);
    } catch (error) {
      expect((error as Error).message).not.toContain("invalid_token");
      expect((error as Error).message).not.toContain("object");
    }
  });
});

describe("external scope contracts", () => {
  it("exports frozen allowlists of read scopes and reserved write scopes", () => {
    expect(EXTERNAL_READ_SCOPES).toEqual([
      "account:read",
      "workspaces:read",
      "lots:read",
      "sales:read",
      "pricing:calculate"
    ]);
    expect(RESERVED_EXTERNAL_WRITE_SCOPES).toEqual(["lots:write", "sales:write"]);
    expect(Object.isFrozen(EXTERNAL_READ_SCOPES)).toBe(true);
    expect(Object.isFrozen(RESERVED_EXTERNAL_WRITE_SCOPES)).toBe(true);
    expect(() => (EXTERNAL_READ_SCOPES as unknown as string[]).push("admin"))
      .toThrow(TypeError);
  });
});
