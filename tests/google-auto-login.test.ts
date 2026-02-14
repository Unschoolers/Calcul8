import assert from "node:assert/strict";
import test from "node:test";
import { initGoogleAutoLoginWithRetry, type GoogleIdentityApi } from "../src/app-core/utils/googleAutoLogin.ts";

function createGoogleIdentity() {
  let callback: ((response: { credential?: string }) => void) | null = null;
  let initialized = 0;
  let prompted = 0;

  const api: GoogleIdentityApi = {
    initialize(config) {
      initialized += 1;
      callback = config.callback;
    },
    prompt() {
      prompted += 1;
    }
  };

  return {
    api,
    emitCredential(token: string) {
      callback?.({ credential: token });
    },
    get initialized() {
      return initialized;
    },
    get prompted() {
      return prompted;
    }
  };
}

test("auto login initializes immediately when Google API is ready", () => {
  const google = createGoogleIdentity();
  const receivedTokens: string[] = [];
  const scheduled: Array<() => void> = [];

  initGoogleAutoLoginWithRetry({
    clientId: "client-id",
    getGoogleIdentity: () => google.api,
    onCredential: (token) => receivedTokens.push(token),
    retryCount: 20,
    retryDelayMs: 250,
    schedule: (callback) => {
      scheduled.push(callback);
    }
  });

  google.emitCredential("token-1");

  assert.equal(google.initialized, 1);
  assert.equal(google.prompted, 1);
  assert.deepEqual(receivedTokens, ["token-1"]);
  assert.equal(scheduled.length, 0);
});

test("auto login retries until Google API becomes ready", () => {
  const google = createGoogleIdentity();
  let attempts = 0;
  const receivedTokens: string[] = [];
  const queue: Array<() => void> = [];

  initGoogleAutoLoginWithRetry({
    clientId: "client-id",
    getGoogleIdentity: () => {
      attempts += 1;
      return attempts >= 3 ? google.api : undefined;
    },
    onCredential: (token) => receivedTokens.push(token),
    retryCount: 5,
    retryDelayMs: 250,
    schedule: (callback) => {
      queue.push(callback);
    }
  });

  assert.equal(queue.length, 1);
  queue.shift()?.();
  assert.equal(queue.length, 1);
  queue.shift()?.();

  google.emitCredential("token-late");

  assert.equal(google.initialized, 1);
  assert.equal(google.prompted, 1);
  assert.deepEqual(receivedTokens, ["token-late"]);
});

test("auto login stops after retries are exhausted", () => {
  const google = createGoogleIdentity();
  const queue: Array<() => void> = [];
  let getCalls = 0;

  initGoogleAutoLoginWithRetry({
    clientId: "client-id",
    getGoogleIdentity: () => {
      getCalls += 1;
      return undefined;
    },
    onCredential: () => {
      throw new Error("onCredential should never be called");
    },
    retryCount: 2,
    retryDelayMs: 250,
    schedule: (callback) => {
      queue.push(callback);
    }
  });

  while (queue.length > 0) {
    queue.shift()?.();
  }

  assert.equal(google.initialized, 0);
  assert.equal(google.prompted, 0);
  assert.equal(getCalls, 3);
});
