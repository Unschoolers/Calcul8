import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { parseExternalBearerToken } = require("../../dist/lib/externalAccess/bearer.js");
const { ExternalError } = require("../../dist/lib/externalAccess/errors.js");

// Independent acceptance oracle: syntax only, with no issuer or token validation.
const failures = Object.freeze({
  invalid_request: Object.freeze({ status: 400, message: "The request is invalid." }),
  authentication_required: Object.freeze({ status: 401, message: "Authentication is required." })
});
const allowedErrorKeys = new Set(["stack", "message", "name", "code", "status"]);

function expectFailure(authorization, code, privateMarkers = []) {
  let thrown;
  let returned = false;
  try {
    parseExternalBearerToken(authorization);
    returned = true;
  } catch (error) {
    thrown = error;
  }
  assert.equal(returned, false, "must throw synchronously");
  assert.ok(thrown instanceof ExternalError, "must use the shared ExternalError");
  const expected = failures[code];
  const descriptors = Object.getOwnPropertyDescriptors(thrown);
  for (const key of Reflect.ownKeys(descriptors)) {
    assert.ok(allowedErrorKeys.has(key), "error must contain only fixed public fields");
    const descriptor = descriptors[key];
    assert.ok(Object.hasOwn(descriptor, "value"), "error must not contain accessors");
    assert.ok(["string", "number"].includes(typeof descriptor.value), "error fields must be scalars");
  }
  assert.equal(thrown.name, "ExternalError");
  assert.equal(thrown.code, code);
  assert.equal(thrown.status, expected.status);
  assert.equal(thrown.message, expected.message);
  assert.equal("cause" in thrown, false);
  assert.equal("details" in thrown, false);
  assert.equal(typeof thrown.stack, "string");
  const surfaces = [
    thrown.stack,
    String(thrown),
    JSON.stringify(thrown),
    ...Reflect.ownKeys(descriptors).map((key) => String(descriptors[key].value))
  ];
  for (const marker of privateMarkers) {
    for (const surface of surfaces) {
      assert.equal(surface.includes(marker), false, "error must not disclose authorization bytes");
    }
  }
  return thrown;
}

test("returns the exact opaque token synchronously for ASCII case-insensitive Bearer", () => {
  for (const scheme of ["Bearer", "bearer", "BEARER", "bEaReR"]) {
    for (const separator of [" ", "  ", "       "]) {
      for (const token of ["opaque", "not-a-jwt", "a.b.c", "MiXeD_Bytes-123", "a", "0"]) {
        assert.equal(parseExternalBearerToken(`${scheme}${separator}${token}`), token);
      }
    }
  }
});

test("accepts every token alphabet character and only terminal equals padding", () => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~+/";
  for (const character of alphabet) {
    assert.equal(parseExternalBearerToken(`Bearer ${character}`), character);
    assert.equal(parseExternalBearerToken(`Bearer ${character}==`), `${character}==`);
  }
  for (const token of [alphabet, `${alphabet}=`, `${alphabet}==`, "opaque========"]) {
    assert.equal(parseExternalBearerToken(`Bearer ${token}`), token);
  }
});

test("accepts the inclusive total raw-header limit and rejects one code unit over", () => {
  const token = "x".repeat(8192 - "Bearer ".length);
  assert.equal(parseExternalBearerToken(`Bearer ${token}`), token);
  const spacedToken = "y".repeat(8192 - "Bearer    ".length);
  assert.equal(parseExternalBearerToken(`Bearer    ${spacedToken}`), spacedToken);
  expectFailure(`Bearer ${token}x`, "invalid_request");
  expectFailure(`Basic ${"z".repeat(8193 - "Basic ".length)}`, "invalid_request");
  expectFailure(" ".repeat(8193), "invalid_request");
});

test("missing credentials and ordinary unsupported schemes require authentication", () => {
  for (const value of [undefined, null, "", "Basic x", "Digest x", "Bearerx x"]) {
    expectFailure(value, "authentication_required");
  }
});

test("rejects missing Bearer separators, missing tokens, padding-only and middle padding", () => {
  for (const value of [
    "Bearer", "bearer", "BEARER", "Bearer ", "Bearer   ",
    "Bearer=token", "Bearer:token", "Bearer/token", "Bearer+token",
    "Bearer =", "Bearer ==", "Bearer =====", "Bearer =token", "Bearer token=middle",
    "Bearer token==middle", "Bearer a=b="
  ]) {
    expectFailure(value, "invalid_request");
  }
});

test("rejects every ASCII punctuation outside the token alphabet", () => {
  for (let code = 33; code <= 126; code += 1) {
    const character = String.fromCharCode(code);
    if (/[A-Za-z0-9._~+/=-]/u.test(character)) continue;
    expectFailure(`Bearer prefix${character}suffix`, "invalid_request");
  }
});

test("rejects duplicate credentials, commas and whitespace rather than trimming", () => {
  for (const value of [
    " Bearer token", "  Bearer token", " Basic x", "Basic x ", " ", "   ",
    "Bearer token ", "Bearer token  ", "Bearer token second",
    "Bearer token,Bearer second", "Bearer token, Bearer second", "Bearer token,",
    "Bearer token Bearer second", "Bearer token Basic second", "Bearer token;Bearer second",
    "Bearer,token", "Bearer ,token", "Basic x,Bearer token", "Basic x, Basic y"
  ]) {
    expectFailure(value, "invalid_request");
  }
});

test("rejects every ASCII control and DEL everywhere, including unsupported schemes", () => {
  for (const code of [...Array.from({ length: 32 }, (_, value) => value), 127]) {
    const character = String.fromCharCode(code);
    for (const value of [
      `${character}Bearer token`, `Bea${character}rer token`, `Bearer${character}token`,
      `Bearer ${character}token`, `Bearer to${character}ken`, `Bearer token${character}`,
      `Basic x${character}`, `Digest ${character}x`, `Bearerx x${character}`
    ]) {
      expectFailure(value, "invalid_request");
    }
  }
});

test("rejects terminal line endings and leading or trailing whitespace", () => {
  for (const whitespace of ["\n", "\r", "\r\n", "\t", "\v", "\f", "\u00a0", "\u2028", "\u2029", "\ufeff"]) {
    for (const value of [`Bearer token${whitespace}`, `${whitespace}Bearer token`, `Basic x${whitespace}`]) {
      expectFailure(value, "invalid_request");
    }
  }
});

test("rejects all non-ASCII code units before unsupported-scheme classification", () => {
  for (const character of ["\u0080", "\u0085", "é", "\u0130", "\u017f", "\u200b", "\uff22", "😀", "\ud800", "\udfff"]) {
    for (const value of [
      `${character}Bearer token`, `Bear${character}er token`, `Bearer ${character}`,
      `Bearer to${character}ken`, `Bearer token${character}`, `Basic ${character}`, `Bearerx x${character}`
    ]) {
      expectFailure(value, "invalid_request");
    }
  }
});

test("rejects every non-string category without invoking coercion or object access", () => {
  let touched = false;
  const forbidden = () => {
    touched = true;
    throw new Error("coercion must not run");
  };
  const objects = [
    {}, [], ["Bearer token"], new String("Bearer token"), new Number(1), new Boolean(true),
    new Date(0), /Bearer token/u, Promise.resolve("Bearer token"), Object.create(null),
    { toString: forbidden, valueOf: forbidden, [Symbol.toPrimitive]: forbidden },
    Object.defineProperty({}, Symbol.toPrimitive, { get: forbidden }),
    new Proxy({}, { get: forbidden, getPrototypeOf: forbidden, ownKeys: forbidden }),
    forbidden, class Unsupported {}
  ];
  for (const value of [false, true, 0, 1, -1, NaN, Infinity, 1n, Symbol("Bearer token"), ...objects]) {
    expectFailure(value, "invalid_request");
  }
  assert.equal(touched, false, "non-string values must never be inspected or coerced");
});

test("failure objects expose only fixed error scalars and never authorization material", () => {
  const marker = "private-opaque-token-7bd15f48";
  for (const value of [
    `Bearer ${marker},Bearer other`, `Bearer ${marker}\n`, `Bearer ${marker} middle`,
    `Bearer ${marker}=middle`, `Bearer ${marker}\u0080`, ` ${marker}`,
    `Bearer ${marker}${"x".repeat(8192)}`
  ]) {
    expectFailure(value, "invalid_request", [marker]);
  }
  expectFailure(`Basic ${marker}`, "authentication_required", [marker]);
});
