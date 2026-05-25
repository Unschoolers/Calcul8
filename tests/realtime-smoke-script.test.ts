import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, vi } from "vitest";

type SmokeModule = {
  resolveRealtimeSmokeConfig: (args: { env: Record<string, string | undefined>; argv?: string[] }) => Record<string, unknown>;
  runRealtimeSmoke: (config: Record<string, unknown>, deps: Record<string, unknown>) => Promise<Record<string, unknown>>;
  signRealtimeSmokeSubscribeToken: (payload: Record<string, unknown>, secret: string) => string;
};

class FakeWebSocket {
  static readonly OPEN = 1;
  static last: FakeWebSocket | null = null;

  readonly listeners = new Map<string, Array<(event: { data?: unknown }) => void>>();
  readonly sent: string[] = [];
  readonly url: string;
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.last = this;
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.emit("open");
      this.emit("message", { data: JSON.stringify({ type: "connected", clientId: "smoke-client" }) });
    });
  }

  addEventListener(name: string, listener: (event: { data?: unknown }) => void): void {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name: string, listener: (event: { data?: unknown }) => void): void {
    const listeners = this.listeners.get(name) ?? [];
    this.listeners.set(name, listeners.filter((candidate) => candidate !== listener));
  }

  send(payload: string): void {
    this.sent.push(payload);
    const message = JSON.parse(payload) as { rooms?: string[]; type?: string };
    if (message.type === "subscribe") {
      queueMicrotask(() => {
        this.emit("message", { data: JSON.stringify({ type: "subscribed", rooms: message.rooms }) });
      });
    }
  }

  close(): void {
    this.readyState = 3;
    this.emit("close");
  }

  emit(name: string, event: { data?: unknown } = {}): void {
    for (const listener of this.listeners.get(name) ?? []) {
      listener(event);
    }
  }
}

class RejectingSubscribeWebSocket extends FakeWebSocket {
  send(payload: string): void {
    this.sent.push(payload);
    const message = JSON.parse(payload) as { type?: string };
    if (message.type === "subscribe") {
      queueMicrotask(() => {
        this.emit("message", {
          data: JSON.stringify({ type: "error", message: "Subscribe request is not authorized." })
        });
      });
    }
  }
}

test("resolveRealtimeSmokeConfig requires realtime endpoints and secrets", async () => {
  const { resolveRealtimeSmokeConfig } = await importSmokeModule();

  assert.throws(
    () => resolveRealtimeSmokeConfig({ env: {} }),
    /REALTIME_SMOKE_BASE_URL/
  );

  assert.throws(
    () => resolveRealtimeSmokeConfig({ env: { REALTIME_SMOKE_BASE_URL: "https://ws.example.test" } }),
    /REALTIME_INTERNAL_API_KEY/
  );

  assert.throws(
    () => resolveRealtimeSmokeConfig({
      env: {
        REALTIME_SMOKE_BASE_URL: "https://ws.example.test",
        REALTIME_INTERNAL_API_KEY: "internal"
      }
    }),
    /REALTIME_TOKEN_SECRET/
  );

  const config = resolveRealtimeSmokeConfig({
    env: {
      REALTIME_SMOKE_BASE_URL: "https://ws.example.test/",
      REALTIME_INTERNAL_API_KEY: "internal",
      REALTIME_TOKEN_SECRET: "token-secret",
      REALTIME_SMOKE_ROOM: "smoke:fixed",
      REALTIME_SMOKE_ORIGIN: "https://app.whatfees.ca",
      REALTIME_SMOKE_TIMEOUT_MS: "2500"
    }
  });

  assert.equal(config.baseUrl, "https://ws.example.test");
  assert.equal(config.socketUrl, "wss://ws.example.test/socket");
  assert.equal(config.room, "smoke:fixed");
  assert.equal(config.origin, "https://app.whatfees.ca");
  assert.equal(config.timeoutMs, 2500);
});

test("signRealtimeSmokeSubscribeToken matches realtime gateway HMAC token format", async () => {
  const { signRealtimeSmokeSubscribeToken } = await importSmokeModule();
  const payload = {
    rooms: ["smoke:token"],
    userId: "smoke-runner",
    exp: 1_800_000_000
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const expectedSignature = createHmac("sha256", "token-secret")
    .update(encodedPayload)
    .digest("base64url");

  assert.equal(
    signRealtimeSmokeSubscribeToken(payload, "token-secret"),
    `${encodedPayload}.${expectedSignature}`
  );
});

test("runRealtimeSmoke subscribes, publishes, and waits for the delivered event", async () => {
  const { runRealtimeSmoke } = await importSmokeModule();
  const publishedBodies: Array<Record<string, unknown>> = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "https://ws.example.test/healthz") {
      return fakeResponse(200, healthyRealtimeBody());
    }

    if (url === "https://ws.example.test/internal/publish") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      publishedBodies.push(body);
      queueMicrotask(() => {
        FakeWebSocket.last?.emit("message", {
          data: JSON.stringify({
            type: "event",
            room: body.room,
            eventType: body.eventType,
            data: body.data
          })
        });
      });
      return fakeResponse(200, { ok: true, delivered: 1, rooms: [body.room] });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });

  const result = await runRealtimeSmoke({
    baseUrl: "https://ws.example.test",
    socketUrl: "wss://ws.example.test/socket",
    internalApiKey: "internal-key",
    tokenSecret: "token-secret",
    room: "smoke:run",
    eventType: "realtime.smoke",
    timeoutMs: 1500,
    origin: "https://app.whatfees.ca"
  }, {
    fetchImpl,
    WebSocketCtor: FakeWebSocket,
    now: () => 1_770_000_000_000
  });

  assert.equal(result.ok, true);
  assert.equal(result.room, "smoke:run");
  assert.equal(publishedBodies.length, 1);
  assert.deepEqual(publishedBodies[0], {
    room: "smoke:run",
    eventType: "realtime.smoke",
    data: {
      marker: "whatfees-realtime-smoke",
      room: "smoke:run"
    }
  });
  const publishHeaders = new Headers(fetchImpl.mock.calls[1]?.[1]?.headers);
  assert.equal(publishHeaders.get("x-realtime-key"), "internal-key");

  const sentSubscribe = JSON.parse(FakeWebSocket.last?.sent[0] ?? "{}") as {
    rooms?: string[];
    token?: string;
    type?: string;
  };
  assert.equal(sentSubscribe.type, "subscribe");
  assert.deepEqual(sentSubscribe.rooms, ["smoke:run"]);
  assert.equal(typeof sentSubscribe.token, "string");
});

test("runRealtimeSmoke fails fast when realtime health reports missing auth settings", async () => {
  const { runRealtimeSmoke } = await importSmokeModule();
  const fetchImpl = vi.fn(async (url: string) => {
    if (url === "https://ws.example.test/healthz") {
      return fakeResponse(200, {
        ...healthyRealtimeBody(),
        auth: {
          allowedOrigins: 1,
          allowUnauthenticatedSubscribe: false,
          hasInternalApiKey: true,
          hasTokenSecret: false
        }
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  await assert.rejects(
    () => runRealtimeSmoke({
      baseUrl: "https://ws.example.test",
      socketUrl: "wss://ws.example.test/socket",
      internalApiKey: "internal-key",
      tokenSecret: "token-secret",
      room: "smoke:run",
      eventType: "realtime.smoke",
      timeoutMs: 1500
    }, {
      fetchImpl,
      WebSocketCtor: FakeWebSocket,
      now: () => 1_770_000_000_000
    }),
    /REALTIME_TOKEN_SECRET/
  );
});

test("runRealtimeSmoke reports realtime gateway subscribe errors", async () => {
  const { runRealtimeSmoke } = await importSmokeModule();
  const fetchImpl = vi.fn(async (url: string) => {
    if (url === "https://ws.example.test/healthz") {
      return fakeResponse(200, healthyRealtimeBody());
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });

  await assert.rejects(
    () => runRealtimeSmoke({
      baseUrl: "https://ws.example.test",
      socketUrl: "wss://ws.example.test/socket",
      internalApiKey: "internal-key",
      tokenSecret: "wrong-token-secret",
      room: "smoke:run",
      eventType: "realtime.smoke",
      timeoutMs: 1500
    }, {
      fetchImpl,
      WebSocketCtor: RejectingSubscribeWebSocket,
      now: () => 1_770_000_000_000
    }),
    /Subscribe request is not authorized/
  );
});

test("deploy workflows validate and smoke realtime recovery wiring", async () => {
  const realtimeWorkflow = await readFile(".github/workflows/deploy-realtime-prod.yml", "utf8");
  assert.match(realtimeWorkflow, /npm run --silent smoke:realtime/);
  assert.match(realtimeWorkflow, /REALTIME_SMOKE_BASE_URL/);
  assert.match(realtimeWorkflow, /REALTIME_INTERNAL_API_KEY/);
  assert.match(realtimeWorkflow, /REALTIME_TOKEN_SECRET/);
  assert.match(realtimeWorkflow, /REALTIME_SMOKE_ORIGIN/);
  assert.match(realtimeWorkflow, /REALTIME_PUBLIC_BASE_URL_PROD/);
  assert.match(realtimeWorkflow, /https:\/\/ws\.whatfees\.ca/);
  assert.match(realtimeWorkflow, /smoke_urls=/);

  const pagesWorkflow = await readFile(".github/workflows/deploy-pages.yml", "utf8");
  assert.match(pagesWorkflow, /VITE_REALTIME_SOCKET_URL/);
  assert.match(pagesWorkflow, /wss:\/\/\*\/socket/);

  const apiWorkflow = await readFile(".github/workflows/deploy-api-prod.yml", "utf8");
  assert.doesNotMatch(apiWorkflow, /REALTIME_PUBLISH_URL_PROD/);
  assert.doesNotMatch(apiWorkflow, /REALTIME_INTERNAL_API_KEY_PROD/);
  assert.doesNotMatch(apiWorkflow, /REALTIME_TOKEN_SECRET_PROD/);
  assert.doesNotMatch(apiWorkflow, /id-token: write/);
  assert.doesNotMatch(apiWorkflow, /azure\/login@v2/);
  assert.doesNotMatch(apiWorkflow, /az functionapp config appsettings set/);

  const bootstrapScript = await readFile("scripts/bootstrap-realtime.ps1", "utf8");
  assert.doesNotMatch(bootstrapScript, /REALTIME_TOKEN_SECRET \(optional/);
  assert.match(bootstrapScript, /REALTIME_TOKEN_SECRET cannot be empty/);
});

async function importSmokeModule(): Promise<SmokeModule> {
  return await import("../scripts/smoke-realtime.mjs") as SmokeModule;
}

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response;
}

function healthyRealtimeBody(): Record<string, unknown> {
  return {
    ok: true,
    clients: 0,
    rooms: 0,
    auth: {
      allowedOrigins: 1,
      allowUnauthenticatedSubscribe: false,
      hasInternalApiKey: true,
      hasTokenSecret: true
    }
  };
}
