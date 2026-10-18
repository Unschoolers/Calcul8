import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSalesValidationConfig, runSalesValidation } from "../../../scripts/validate-sales-runtime.mjs";

let server;
let baseUrl;
const requests = [];

before(async () => {
  server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
    requests.push({ method: request.method, url: request.url, cookie: request.headers.cookie, csrf: request.headers["x-csrf-token"], body });
    if (request.method === "POST") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, sale: { id: body.sale.id, version: 1 } }));
      return;
    }
    if (request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ lotId: "fixture-lot", sales: requests.filter((item) => item.method === "POST" && item.cookie === request.headers.cookie).map((item) => ({ id: item.body.sale.id, version: 1 })) }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
});

test("requires explicit nonproduction acknowledgement and loopback API target", () => {
  const base = {
    RUNTIME_VALIDATION_TARGET: "nonproduction",
    RUNTIME_VALIDATION_API_BASE: "http://127.0.0.1:7071",
    RUNTIME_VALIDATION_SESSION_COOKIE: "whatfees_session=test",
    RUNTIME_VALIDATION_CSRF_TOKEN: "csrf-test",
    RUNTIME_VALIDATION_LOT_ID: "fixture-lot"
  };
  assert.throws(() => resolveSalesValidationConfig({ env: { ...base, RUNTIME_VALIDATION_TARGET: "" } }), /nonproduction/);
  assert.throws(() => resolveSalesValidationConfig({ env: { ...base, RUNTIME_VALIDATION_API_BASE: "https://api.example.test" } }), /loopback/);
  assert.equal(resolveSalesValidationConfig({ env: base }).lotId, "fixture-lot");
});

test("defaults fixture-file runs to exactly one request per row", () => {
  const directory = mkdtempSync(join(tmpdir(), "whatfees-runtime-validation-"));
  const fixturesPath = join(directory, "fixtures.json");
  const environment = {
    RUNTIME_VALIDATION_TARGET: "nonproduction",
    RUNTIME_VALIDATION_API_BASE: "http://127.0.0.1:7071",
    RUNTIME_VALIDATION_FIXTURES_FILE: fixturesPath
  };
  writeFileSync(fixturesPath, JSON.stringify([
    { cookie: "session=user-a", csrfToken: "csrf-a", lotId: "fixture-a" }
  ]));
  try {
    const oneRowConfig = resolveSalesValidationConfig({ env: environment });
    assert.equal(oneRowConfig.count, 1);
    assert.throws(() => resolveSalesValidationConfig({ env: { ...environment, RUNTIME_VALIDATION_COUNT: "2" } }), /fixture count/);

    writeFileSync(fixturesPath, JSON.stringify([
      { cookie: "session=user-a", csrfToken: "csrf-a", lotId: "fixture-a" },
      { cookie: "session=user-b", csrfToken: "csrf-b", lotId: "fixture-b" }
    ]));
    const config = resolveSalesValidationConfig({ env: environment });
    assert.equal(config.count, 2);
    assert.equal(config.fixtures.length, 2);
    assert.throws(() => resolveSalesValidationConfig({ env: {
      ...environment,
      RUNTIME_VALIDATION_COUNT: "1"
    } }), /fixture count/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects a cross-origin redirect from the loopback API without sending a second request", async () => {
  let targetRequests = 0;
  const targetServer = createServer(async (request, response) => {
    targetRequests += 1;
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, sale: { id: body.sale?.id, version: 1 } }));
  });
  targetServer.listen(0, "127.0.0.1");
  await once(targetServer, "listening");
  const targetUrl = `http://127.0.0.1:${targetServer.address().port}`;
  const redirectServer = createServer((request, response) => {
    if (request.method === "POST") {
      response.writeHead(307, { location: `${targetUrl}${request.url}` });
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ lotId: "fixture-lot", sales: [] }));
  });
  redirectServer.listen(0, "127.0.0.1");
  await once(redirectServer, "listening");
  try {
    const summary = await runSalesValidation({
      config: {
        apiBase: `http://127.0.0.1:${redirectServer.address().port}`,
        cookie: "session=test",
        csrfToken: "csrf-test",
        lotId: "fixture-lot",
        count: 1,
        timeoutMs: 2_000
      },
      fetchImpl: globalThis.fetch,
      idPrefix: "runtime-validation-redirect-test"
    });
    assert.equal(summary.created, 0);
    assert.equal(targetRequests, 0);
  } finally {
    await Promise.all([
      new Promise((resolve) => redirectServer.close(resolve)),
      new Promise((resolve) => targetServer.close(resolve))
    ]);
  }
});

test("counts failed or malformed cleanup rereads and does not delete unlisted generated rows", async (t) => {
  for (const mode of ["http-error", "malformed-body"]) {
    await t.test(mode, async () => {
      let listReads = 0;
      let deleteRequests = 0;
      const idPrefix = `runtime-validation-cleanup-${mode}`;
      const id = `${idPrefix}-1`;
      const fetchImpl = async (_url, options) => {
        if (options.method === "POST") {
          return Response.json({ ok: true, sale: { id: JSON.parse(options.body).sale.id, version: 1 } });
        }
        if (options.method === "DELETE") {
          deleteRequests += 1;
          return Response.json({ ok: true });
        }
        listReads += 1;
        if (listReads === 1) return Response.json({ lotId: "fixture-lot", sales: [{ id, version: 1 }] });
        if (mode === "http-error") return new Response("", { status: 503 });
        return Response.json({ lotId: "fixture-lot", sales: { invalid: true } });
      };
      const summary = await runSalesValidation({
        config: {
          apiBase: "http://127.0.0.1:7071",
          cookie: "session=test",
          csrfToken: "csrf-test",
          lotId: "fixture-lot",
          count: 1,
          timeoutMs: 2_000
        },
        fetchImpl,
        idPrefix
      });
      assert.equal(summary.verified, 1);
      assert.equal(summary.cleaned, 0);
      assert.equal(summary.cleanupFailed, 1);
      assert.equal(deleteRequests, 0);
    });
  }
});

test("posts distinct fixture sales concurrently, verifies them, and tombstones only its own ids", async () => {
  requests.length = 0;
  const summary = await runSalesValidation({
    config: {
      apiBase: baseUrl,
      cookie: "whatfees_session=test",
      csrfToken: "csrf-test",
      lotId: "fixture-lot",
      count: 3,
      timeoutMs: 2_000
    },
    fetchImpl: globalThis.fetch,
    idPrefix: "runtime-validation-test"
  });
  assert.equal(summary.created, 3);
  assert.equal(summary.verified, 3);
  assert.equal(summary.cleaned, 3);
  assert.deepEqual(requests.map((request) => request.method).filter((method) => method === "DELETE").length, 3);
  for (const request of requests) {
    assert.equal(request.cookie, "whatfees_session=test");
    assert.equal(request.csrf, "csrf-test");
  }
  const createdIds = new Set(requests.filter((request) => request.method === "POST").map((request) => String(request.body.sale.id)));
  const deletedIds = new Set(requests.filter((request) => request.method === "DELETE").map((request) => decodeURIComponent(request.url.split("/").at(-1))));
  assert.deepEqual(deletedIds, createdIds);
});

test("runs one isolated request per supplied user and uses that user's session for verification and cleanup", async () => {
  requests.length = 0;
  const summary = await runSalesValidation({
    config: {
      apiBase: baseUrl,
      count: 2,
      timeoutMs: 2_000,
      fixtures: [
        { cookie: "session=user-a", csrfToken: "csrf-a", lotId: "fixture-a" },
        { cookie: "session=user-b", csrfToken: "csrf-b", lotId: "fixture-b" }
      ]
    },
    fetchImpl: globalThis.fetch,
    idPrefix: "runtime-validation-multi-user-test"
  });
  assert.deepEqual({ created: summary.created, verified: summary.verified, cleaned: summary.cleaned, failed: summary.failed }, {
    created: 2, verified: 2, cleaned: 2, failed: 0
  });
  const posts = requests.filter((request) => request.method === "POST");
  assert.deepEqual(new Set(posts.map((request) => request.cookie)), new Set(["session=user-a", "session=user-b"]));
  for (const request of requests) {
    const expectedCsrf = request.cookie === "session=user-a" ? "csrf-a" : "csrf-b";
    assert.equal(request.csrf, expectedCsrf);
    assert.match(request.url, /fixture-[ab]/);
  }
});
