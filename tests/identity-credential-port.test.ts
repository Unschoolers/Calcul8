import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { createNativeGoogleIdentityPort } from "../src/app-core/platform/identity/nativeGoogleIdentity.ts";
import {
  initGoogleAutoLoginFlow,
  promptGoogleSignInFlow
} from "../src/app-core/methods/ui/entitlements/entitlements-signin-service.ts";

function createContext(): Record<string, unknown> {
  return {
    isAuthSessionResolving: false,
    googleAuthEpoch: 0,
    googleAvatarLoadFailed: true,
    notify: vi.fn(),
    debugLogEntitlement: vi.fn(async () => undefined)
  };
}

test("native identity validates the credential plugin response", async () => {
  const port = createNativeGoogleIdentityPort({
    requestCredential: vi.fn(async () => ({
      idToken: "native-token",
      displayName: "Marc",
      photoUrl: "https://example.test/avatar.png"
    })),
    clearCredentialState: vi.fn(async () => undefined)
  });

  assert.deepEqual(await port.requestCredential("interactive"), {
    idToken: "native-token",
    displayName: "Marc",
    photoUrl: "https://example.test/avatar.png"
  });
});

test("manual Android sign-in requests one native ID token then starts session bootstrap", async () => {
  const requestNativeCredential = vi.fn(async (_mode: "automatic" | "interactive") => ({
    idToken: "native-google-token",
    displayName: "Marc",
    photoUrl: "https://example.test/avatar.png"
  }));
  const bootstrapSession = vi.fn(async () => undefined);

  await promptGoogleSignInFlow(createContext() as never, {
    isNativeAndroid: () => true,
    requestNativeCredential,
    bootstrapSession,
    getGoogleIdToken: () => "",
    getGoogleClientId: () => "web-client-id",
    enableGoogleAutoSignIn: vi.fn(),
    setGoogleIdToken: vi.fn(),
    cacheGoogleProfileFromToken: vi.fn(),
    cacheProfile: vi.fn()
  });

  assert.equal(requestNativeCredential.mock.calls.length, 1);
  assert.equal(requestNativeCredential.mock.calls[0]?.[0], "interactive");
  assert.equal(bootstrapSession.mock.calls.length, 1);
});

test("Android startup requests an authorized credential and bootstraps the session once", async () => {
  const requestNativeCredential = vi.fn(async (_mode: "automatic" | "interactive") => ({
    idToken: "returning-native-token",
    displayName: "Marc",
    photoUrl: "https://example.test/avatar.png"
  }));
  const bootstrapSession = vi.fn(async () => undefined);

  initGoogleAutoLoginFlow(createContext() as never, {
    isNativeAndroid: () => true,
    requestNativeCredential,
    bootstrapSession,
    getWindow: () => undefined,
    getDocument: () => undefined,
    getGoogleIdToken: () => "",
    isGoogleAutoSignInDisabled: () => false,
    readEntitlementCache: () => null,
    enableGoogleAutoSignIn: vi.fn(),
    setGoogleIdToken: vi.fn(),
    cacheGoogleProfileFromToken: vi.fn(),
    cacheProfile: vi.fn()
  });

  await vi.waitFor(() => {
    assert.equal(bootstrapSession.mock.calls.length, 1);
  });
  assert.equal(requestNativeCredential.mock.calls[0]?.[0], "automatic");
});
