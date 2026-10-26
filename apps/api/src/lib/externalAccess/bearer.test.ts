import { describe, expect, it } from "vitest";
import { parseExternalBearerToken } from "./bearer";
import { ExternalError } from "./errors";

describe("malformed unsupported schemes", () => {
  it.each(["Bearerx x ", "Bearerx x y", "Bearerx x Bearer y", "Bearerx x, Bearer y", "Basic x Bearer y"])(
    "rejects the whole malformed credential: %s", (header) => {
      expect(() => parseExternalBearerToken(header)).toThrowError(new ExternalError("invalid_request"));
    }
  );
});
