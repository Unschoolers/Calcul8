import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createHash } from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { DEV, createPkceAttempt } from "../../scripts/check-external-oauth-login.mjs";

const NOW = 2_000_000_000_000;
let pair;
let jwks;
before(async () => {
  pair = await generateKeyPair("RS256");
  jwks = { keys: [{ ...await exportJWK(pair.publicKey), kid: "probe-oracle", alg: "RS256", use: "sig" }] };
});
function fixture(overrides = {}) {
  const calls = [];
  let request;
  const attempt = createPkceAttempt({ now: () => NOW, fetchImpl: async (url, init) => {
    calls.push({ url: String(url), init });
    assert.equal(init.redirect, "error");
    if (String(url) === DEV.jwksUri) return Response.json(jwks);
    assert.equal(String(url), `${DEV.issuer}oauth/token`);
    assert.equal(init.method, "POST");
    const body = new URLSearchParams(init.body);
    assert.equal(body.get("grant_type"), "authorization_code");
    assert.equal(body.get("client_id"), DEV.clientId);
    assert.equal(body.get("redirect_uri"), DEV.callbackUrl);
    assert.equal(body.get("code"), "oracle-code");
    assert.equal(body.has("client_secret"), false);
    assert.equal(createHash("sha256").update(body.get("code_verifier")).digest("base64url"), request.searchParams.get("code_challenge"));
    const idToken = await new SignJWT({ sub: "oracle-subject", nonce: request.searchParams.get("nonce"), ...overrides })
      .setProtectedHeader({ alg: "RS256", kid: "probe-oracle", typ: "JWT" })
      .setIssuer(overrides.iss ?? DEV.issuer).setAudience(overrides.aud ?? DEV.clientId)
      .setIssuedAt(NOW / 1000 - 1).setExpirationTime(overrides.exp ?? NOW / 1000 + 120).sign(pair.privateKey);
    return Response.json({ id_token: idToken, access_token: String(12345), token_type: "Bearer" });
  } });
  request = new URL(attempt.authorizationUrl);
  const callback = new URL(DEV.callbackUrl);
  callback.search = new URLSearchParams({ code: "oracle-code", state: request.searchParams.get("state"), iss: DEV.issuer }).toString();
  return { attempt, calls, request, callback };
}
const rejects = (action) => assert.rejects(action, error => error.message === "OAuth login check failed." && !Object.hasOwn(error, "cause"));

test("independent: binds code/S256 to actual dev client without API or refresh authority", () => {
  const { attempt, request } = fixture();
  assert.ok(Object.isFrozen(DEV) && Object.isFrozen(attempt));
  assert.equal(request.origin + request.pathname, `${DEV.issuer}authorize`);
  assert.equal(request.searchParams.get("client_id"), "iJ91FR4M6AIgD8P68qPQ8Zpo3BgO8Qhe");
  assert.equal(request.searchParams.get("redirect_uri"), "http://127.0.0.1:8787/callback");
  for (const [key, value] of Object.entries({ response_type: "code", response_mode: "query", scope: "openid", code_challenge_method: "S256" })) assert.equal(request.searchParams.get(key), value);
  for (const key of ["state", "nonce", "code_challenge"]) assert.match(request.searchParams.get(key), /^[A-Za-z0-9_-]{43}$/);
  for (const key of ["code_verifier", "client_secret", "audience", "resource"]) assert.equal(request.searchParams.has(key), false);
  assert.notEqual(createPkceAttempt().authorizationUrl, attempt.authorizationUrl);
});

test("independent: signed identity result is fixed, frozen and has no API authority", async () => {
  const { attempt, callback, calls } = fixture();
  const result = await attempt.finish(callback.href);
  assert.deepEqual(result, { status: "pkce_login_verified", activationReady: false });
  assert.ok(Object.isFrozen(result));
  assert.equal(calls.length, 2);
  await rejects(() => attempt.finish(callback.href));
  assert.equal(calls.length, 2);
});

test("independent: wrong state/issuer, duplicate code, fragment and wrong path never reach network", async () => {
  for (const mutate of [u => u.searchParams.set("state", "wrong"), u => u.searchParams.set("iss", "https://other.example/"), u => u.searchParams.append("code", "duplicate"), u => {u.hash="fragment";}, u => {u.pathname="/other";}]) {
    const { attempt, callback, calls } = fixture();
    mutate(callback);
    await rejects(() => attempt.finish(callback.href));
    assert.equal(calls.length, 0);
  }
});

test("independent: wrong signed issuer/audience/nonce and expired identity fail closed", async () => {
  for (const claims of [{ iss: "https://other.example/" }, { aud: "other-client" }, { aud: [DEV.clientId, "other"] }, { nonce: "wrong" }, { exp: NOW / 1000 - 60 }]) {
    const { attempt, callback } = fixture(claims);
    await rejects(() => attempt.finish(callback.href));
    await rejects(() => attempt.finish(callback.href));
  }
});

test("independent: concurrent completion consumes exactly one code exchange", async () => {
  const { attempt, callback, calls } = fixture();
  const results = await Promise.allSettled([attempt.finish(callback.href), attempt.finish(callback.href)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(calls.filter(c => c.url.endsWith("oauth/token")).length, 1);
});
