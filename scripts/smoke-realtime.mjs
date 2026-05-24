import { createHmac, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_EVENT_TYPE = "realtime.smoke";
const DEFAULT_MARKER = "whatfees-realtime-smoke";

export function resolveRealtimeSmokeConfig(args = {}) {
  const env = args.env ?? process.env;
  const argvConfig = parseArgs(args.argv ?? process.argv.slice(2));

  const baseUrl = normalizeHttpBaseUrl(
    argvConfig.baseUrl
      ?? env.REALTIME_SMOKE_BASE_URL
      ?? env.REALTIME_BASE_URL
      ?? ""
  );
  if (!baseUrl) {
    throw new Error("REALTIME_SMOKE_BASE_URL is required and must be an http(s) realtime gateway base URL.");
  }

  const internalApiKey = normalizeString(
    argvConfig.internalApiKey
      ?? env.REALTIME_INTERNAL_API_KEY
      ?? env.REALTIME_INTERNAL_API_KEY_PROD
  );
  if (!internalApiKey) {
    throw new Error("REALTIME_INTERNAL_API_KEY is required for realtime smoke publish checks.");
  }

  const tokenSecret = normalizeString(
    argvConfig.tokenSecret
      ?? env.REALTIME_TOKEN_SECRET
      ?? env.REALTIME_TOKEN_SECRET_PROD
  );
  if (!tokenSecret) {
    throw new Error("REALTIME_TOKEN_SECRET is required for realtime smoke subscribe checks.");
  }

  const timeoutMs = parsePositiveInteger(
    argvConfig.timeoutMs
      ?? env.REALTIME_SMOKE_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
  const room = normalizeString(
    argvConfig.room
      ?? env.REALTIME_SMOKE_ROOM
  ) ?? `smoke:${randomUUID()}`;
  const eventType = normalizeString(
    argvConfig.eventType
      ?? env.REALTIME_SMOKE_EVENT_TYPE
  ) ?? DEFAULT_EVENT_TYPE;
  const origin = normalizeString(
    argvConfig.origin
      ?? env.REALTIME_SMOKE_ORIGIN
  );
  const socketUrl = normalizeSocketUrl(
    argvConfig.socketUrl
      ?? env.REALTIME_SMOKE_SOCKET_URL
      ?? deriveSocketUrl(baseUrl)
  );

  return {
    baseUrl,
    socketUrl,
    internalApiKey,
    tokenSecret,
    room,
    eventType,
    timeoutMs,
    ...(origin ? { origin } : {})
  };
}

export function signRealtimeSmokeSubscribeToken(payload, secret) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export async function runRealtimeSmoke(config, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for realtime smoke checks.");
  }

  const WebSocketCtor = deps.WebSocketCtor ?? await resolveWebSocketCtor({ needsOriginHeader: Boolean(config.origin) });
  const now = typeof deps.now === "function" ? deps.now : Date.now;

  await assertHealth(fetchImpl, config);

  const socket = openSocket(WebSocketCtor, config);
  try {
    await waitForSocketOpen(socket, config.timeoutMs);

    const subscribed = waitForSocketMessage(
      socket,
      (message) => message.type === "subscribed" && includesRoom(message.rooms, config.room),
      config.timeoutMs,
      "realtime subscription acknowledgement"
    );

    socket.send(JSON.stringify({
      type: "subscribe",
      rooms: [config.room],
      token: signRealtimeSmokeSubscribeToken({
        rooms: [config.room],
        userId: "realtime-smoke",
        exp: Math.floor(now() / 1000) + 60
      }, config.tokenSecret)
    }));
    await subscribed;

    const eventData = {
      marker: DEFAULT_MARKER,
      room: config.room
    };
    const deliveredEvent = waitForSocketMessage(
      socket,
      (message) => (
        message.type === "event"
        && message.room === config.room
        && message.eventType === config.eventType
        && message.data?.marker === DEFAULT_MARKER
        && message.data?.room === config.room
      ),
      config.timeoutMs,
      "realtime smoke publish delivery"
    );

    const publishBody = {
      room: config.room,
      eventType: config.eventType,
      data: eventData
    };
    const publishResponse = await fetchJson(fetchImpl, `${config.baseUrl}/internal/publish`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-realtime-key": config.internalApiKey
      },
      body: JSON.stringify(publishBody)
    }, "realtime publish");

    if (!Number.isFinite(Number(publishResponse.body?.delivered)) || Number(publishResponse.body.delivered) < 1) {
      throw new Error(`Realtime smoke publish delivered ${publishResponse.body?.delivered ?? 0} clients.`);
    }

    await deliveredEvent;

    return {
      ok: true,
      room: config.room,
      eventType: config.eventType,
      delivered: Number(publishResponse.body.delivered)
    };
  } finally {
    closeSocket(socket);
  }
}

async function assertHealth(fetchImpl, config) {
  const health = await fetchJson(fetchImpl, `${config.baseUrl}/healthz`, {
    method: "GET"
  }, "realtime health");

  if (health.body?.ok !== true) {
    throw new Error("Realtime health check did not report ok=true.");
  }
}

async function fetchJson(fetchImpl, url, init, label) {
  const response = await fetchImpl(url, init);
  const body = await readResponseBody(response);
  if (!response.ok) {
    throw new Error(`${label} failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return { response, body };
}

async function readResponseBody(response) {
  try {
    return await response.json();
  } catch {
    try {
      return { text: await response.text() };
    } catch {
      return {};
    }
  }
}

function openSocket(WebSocketCtor, config) {
  if (config.origin) {
    return new WebSocketCtor(config.socketUrl, {
      headers: {
        Origin: config.origin
      }
    });
  }
  return new WebSocketCtor(config.socketUrl);
}

async function resolveWebSocketCtor(options = {}) {
  if (!options.needsOriginHeader && typeof globalThis.WebSocket === "function") {
    return globalThis.WebSocket;
  }

  try {
    const requireFromRealtime = createRequire(new URL("../apps/realtime/package.json", import.meta.url));
    return requireFromRealtime("ws").WebSocket;
  } catch (error) {
    if (!options.needsOriginHeader && typeof globalThis.WebSocket === "function") return globalThis.WebSocket;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to load a WebSocket client for realtime smoke checks: ${message}`);
  }
}

function waitForSocketOpen(socket, timeoutMs) {
  if (socket.readyState === socketOpenValue(socket)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for realtime websocket open."));
    }, timeoutMs);

    const cleanupOpen = addSocketListener(socket, "open", () => {
      cleanup();
      resolve();
    });
    const cleanupError = addSocketListener(socket, "error", (event) => {
      cleanup();
      reject(normalizeSocketError(event));
    });
    const cleanupClose = addSocketListener(socket, "close", () => {
      cleanup();
      reject(new Error("Realtime websocket closed before opening."));
    });

    function cleanup() {
      clearTimeout(timer);
      cleanupOpen();
      cleanupError();
      cleanupClose();
    }
  });
}

function waitForSocketMessage(socket, predicate, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${label}.`));
    }, timeoutMs);

    const cleanupMessage = addSocketListener(socket, "message", (event) => {
      const message = parseSocketMessage(event);
      if (!message || !predicate(message)) return;
      cleanup();
      resolve(message);
    });
    const cleanupError = addSocketListener(socket, "error", (event) => {
      cleanup();
      reject(normalizeSocketError(event));
    });
    const cleanupClose = addSocketListener(socket, "close", () => {
      cleanup();
      reject(new Error(`Realtime websocket closed while waiting for ${label}.`));
    });

    function cleanup() {
      clearTimeout(timer);
      cleanupMessage();
      cleanupError();
      cleanupClose();
    }
  });
}

function addSocketListener(socket, name, listener) {
  if (typeof socket.addEventListener === "function") {
    socket.addEventListener(name, listener);
    return () => socket.removeEventListener?.(name, listener);
  }
  if (typeof socket.on === "function") {
    const wrapped = name === "message"
      ? (data) => listener({ data })
      : (error) => listener(error);
    socket.on(name, wrapped);
    return () => socket.off?.(name, wrapped);
  }
  throw new Error("WebSocket client does not support event listeners.");
}

function parseSocketMessage(event) {
  try {
    const raw = event?.data ?? event;
    const text = typeof raw === "string"
      ? raw
      : Buffer.isBuffer(raw)
        ? raw.toString("utf8")
        : raw instanceof ArrayBuffer
          ? Buffer.from(raw).toString("utf8")
          : String(raw ?? "");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeSocketError(event) {
  if (event instanceof Error) return event;
  if (event?.error instanceof Error) return event.error;
  if (event?.message) return new Error(String(event.message));
  return new Error("Realtime websocket error.");
}

function closeSocket(socket) {
  try {
    if (socket.readyState === socketOpenValue(socket) || socket.readyState === 0) {
      socket.close();
    }
  } catch {
    // Smoke cleanup should not hide the real verification result.
  }
}

function socketOpenValue(socket) {
  return Number(socket?.OPEN ?? socket?.constructor?.OPEN ?? 1);
}

function includesRoom(rooms, room) {
  return Array.isArray(rooms) && rooms.includes(room);
}

function deriveSocketUrl(baseUrl) {
  const parsed = new URL(baseUrl);
  const scheme = parsed.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${parsed.host}/socket`;
}

function normalizeHttpBaseUrl(value) {
  const candidate = normalizeString(value);
  if (!candidate) return "";
  const parsed = new URL(candidate);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Realtime smoke base URL must start with http:// or https://.");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  const normalized = parsed.toString().replace(/\/$/, "");
  return normalized;
}

function normalizeSocketUrl(value) {
  const candidate = normalizeString(value);
  if (!candidate) throw new Error("Realtime smoke socket URL is required.");
  const parsed = new URL(candidate);
  if (parsed.protocol !== "wss:" && parsed.protocol !== "ws:") {
    throw new Error("Realtime smoke socket URL must start with ws:// or wss://.");
  }
  return parsed.toString();
}

function normalizeString(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parsePositiveInteger(value, fallback) {
  const candidate = normalizeString(value);
  if (!candidate) return fallback;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [rawKey, ...rawValueParts] = arg.slice(2).split("=");
    const value = rawValueParts.length ? rawValueParts.join("=") : "true";
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => String(letter).toUpperCase());
    result[key] = value;
  }
  return result;
}

async function main() {
  const config = resolveRealtimeSmokeConfig();
  const result = await runRealtimeSmoke(config);
  console.log(JSON.stringify(result, null, 2));
}

const entrypoint = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (entrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
