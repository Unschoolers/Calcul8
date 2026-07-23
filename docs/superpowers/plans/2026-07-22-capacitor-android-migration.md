# Capacitor Android Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Bubblewrap TWA release with a source-controlled Capacitor Android app that targets API 36, uses Google Play Billing 8.3.0, and preserves the existing Vue application and session-first authentication.

**Architecture:** Keep the browser/PWA and Android app on one Vue/domain codebase. Isolate Android identity and billing behind typed frontend ports and narrow local Capacitor plugins, keep the API authoritative for sessions and entitlements, and commit the native Gradle project under `apps/android` so dependency and policy upgrades are reproducible.

**Tech Stack:** Vue 3, TypeScript 6 strict mode, Capacitor 8.4.0, Android Gradle Plugin, Java 21, Android API 36, Java, Google Play Billing 8.3.0, Android Credential Manager 1.6.0, Vitest, JUnit, GitHub Actions

## Global Constraints

- Preserve the Android application ID io.whatfees, Play App Signing configuration, upload-key identity, and signing lineage so the Capacitor build remains update-compatible with the existing Play listing.
- Pin `@capacitor/core`, `@capacitor/cli`, and `@capacitor/android` to `^8.4.2`.
- Use `compileSdkVersion = 36`, and `targetSdkVersion = 36`.
- Resolve exactly `com.android.billingclient:billing:9.1.0`; no Android artifact may resolve Billing below 8.0.0.
- Support the existing non-consumable one-time product `pro_access`; do not add subscriptions, consumables, RevenueCat, or a second entitlement authority.
- Native Google identity may supply a short-lived ID token only to `/auth/me` session bootstrap. Normal API traffic remains HttpOnly cookie + CSRF authenticated.
- Keep `https://app.whatfees.ca` as the Android WebView hostname and never use a production `server.url`.
- Preserve browser/PWA Google Identity Services, Digital Goods/PaymentRequest fallback, service-worker behavior, local-first storage, bilingual UI, and mobile safe-area handling.
- Keep signing keys, passwords, service accounts, APKs, AABs, Gradle caches, local SDK paths, and generated build output untracked.
- Complete Play internal-testing acceptance before removing the Bubblewrap release fallback.

---

### Task 1: Add The Source-Controlled Capacitor Android Shell

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `capacitor.config.ts`
- Create: `scripts/run-android-gradle.mjs`
- Create: `apps/android/**` through the Capacitor generator
- Modify: `apps/android/variables.gradle`
- Modify: `apps/android/app/src/main/res/values/strings.xml`
- Modify: `.gitignore`
- Create: `tests/capacitor-android-config.test.ts`
- Modify: `tsconfig.tests.web.json`

**Interfaces:**
- Produces: a committed Capacitor Android project at `apps/android`
- Produces: `npm run android:sync`, `npm run android:test`, `npm run android:lint`, and `npm run android:bundle`
- Produces: local origin `https://app.whatfees.ca` backed by bundled `dist` assets

- [ ] **Step 1: Write the failing configuration guard**

Create `tests/capacitor-android-config.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

test("Capacitor Android is source controlled and targets API 36", async () => {
  const config = await readFile("capacitor.config.ts", "utf8");
  const variables = await readFile("apps/android/variables.gradle", "utf8");

  assert.match(config, /appId:\s*["']io\.whatfees["']/);
  assert.match(config, /webDir:\s*["']dist["']/);
  assert.match(config, /path:\s*["']apps\/android["']/);
  assert.match(config, /hostname:\s*["']app\.whatfees\.ca["']/);
  assert.match(config, /androidScheme:\s*["']https["']/);
  assert.doesNotMatch(config, /server:\s*\{[^}]*url:/s);
  assert.match(variables, /minSdkVersion\s*=\s*24/);
  assert.match(variables, /compileSdkVersion\s*=\s*36/);
  assert.match(variables, /targetSdkVersion\s*=\s*36/);
});
```

Add the file to `tsconfig.tests.web.json`.

- [ ] **Step 2: Verify the guard fails because Capacitor is absent**

Run: `npm run test -- tests/capacitor-android-config.test.ts`

Expected: FAIL with `ENOENT` for `capacitor.config.ts` or `apps/android/variables.gradle`.

- [ ] **Step 3: Pin Capacitor, write configuration, and generate the Android project**

Run:

```powershell
npm install --save-exact @capacitor/core@8.4.0
npm install --save-dev --save-exact @capacitor/cli@8.4.0
npm install --save-exact @capacitor/android@8.4.0
```

Create this `capacitor.config.ts` before invoking the generator:

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.whatfees",
  appName: "WhatFees",
  webDir: "dist",
  loggingBehavior: "debug",
  android: {
    path: "apps/android",
    backgroundColor: "#000000"
  },
  server: {
    hostname: "app.whatfees.ca",
    androidScheme: "https",
    cleartext: false
  },
  plugins: {
    SystemBars: {
      insetsHandling: "css"
    }
  }
};

export default config;
```

Then run:

```powershell
npx cap add android
```

Keep the generated Gradle wrapper and source files. Remove only generated `build`, `.gradle`, `.idea`, `local.properties`, APK, and AAB output.

- [ ] **Step 4: Make native source trackable without weakening artifact hygiene**

Replace the broad Android-generator ignores with scoped output ignores. The relevant `.gitignore` section must be:

```gitignore
# Android source is committed; generated output and local secrets are not.
apps/android/.gradle/
apps/android/.idea/
apps/android/local.properties
apps/android/**/build/
apps/android/**/*.apk
apps/android/**/*.aab
apps/android/**/*.idsig
apps/android/keystore.properties
*.jks
*.keystore
*.pem
*.p12
*.key
*.crt
```

Delete the unscoped `android`, `app/`, `gradle/`, `gradlew`, `gradlew.bat`, `build.gradle`, `settings.gradle`, and `gradle.properties` entries that would hide committed files under `apps/android`. Retain root release-artifact and signing-material patterns.

- [ ] **Step 5: Add deterministic cross-platform Android scripts**

Create `scripts/run-android-gradle.mjs` so the same package scripts work on Windows and Linux:

```js
import { spawnSync } from "node:child_process";

const wrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const result = spawnSync(wrapper, process.argv.slice(2), {
  cwd: "apps/android",
  stdio: "inherit",
  shell: process.platform === "win32"
});

process.exit(result.status ?? 1);
```

Add these scripts to `package.json`:

```json
{
  "android:sync": "npm run build && cap sync android",
  "android:test": "node scripts/run-android-gradle.mjs testDebugUnitTest",
  "android:lint": "node scripts/run-android-gradle.mjs lintRelease",
  "android:bundle": "node scripts/run-android-gradle.mjs bundleRelease"
}
```

Confirm `apps/android/variables.gradle` retains Capacitor 8.4.0 defaults:

```groovy
ext {
    minSdkVersion = 24
    compileSdkVersion = 36
    targetSdkVersion = 36
}
```

- [ ] **Step 6: Verify configuration, sync, and the generated JVM suite**

Run:

```powershell
npm run test -- tests/capacitor-android-config.test.ts
npm run android:sync
npm run android:test
```

Expected: the Vitest guard passes, Capacitor copies `dist`, and Gradle unit tests exit 0.

- [ ] **Step 7: Commit the independently buildable shell**

```powershell
git add package.json package-lock.json capacitor.config.ts apps/android scripts/run-android-gradle.mjs .gitignore tests/capacitor-android-config.test.ts tsconfig.tests.web.json
git commit -m "build(android): add source-controlled Capacitor shell"
```

### Task 2: Introduce A Shared Play Billing Port And Preserve The Web Adapter

**Files:**
- Create: `src/app-core/platform/play-billing/types.ts`
- Create: `src/app-core/platform/play-billing/webPlayBilling.ts`
- Create: `src/app-core/platform/play-billing/resolvePlayBilling.ts`
- Modify: `src/app-core/utils/playBilling.ts`
- Modify: `src/app-core/methods/ui/entitlements/entitlements-purchase-play.ts`
- Modify: `src/app-core/methods/ui/entitlements/entitlements-shared.ts`
- Create: `tests/play-billing-port.test.ts`
- Modify: `tests/play-billing.test.ts`
- Modify: `tests/entitlements-purchase-methods.test.ts`

**Interfaces:**
- Produces: `PlayPurchase`, `PlayBillingPort`, and `PlayBillingError`
- Produces: `createWebPlayBillingPort(): Promise<PlayBillingPort | null>`
- Produces: `resolvePlayBillingPort(): Promise<PlayBillingPort | null>`
- Changes: entitlement purchase orchestration consumes `PlayBillingPort`, not `DigitalGoodsService`

- [ ] **Step 1: Write failing adapter-contract tests**

Create `tests/play-billing-port.test.ts` with tests for availability, purchase, restore, and cancellation mapping:

```ts
import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { createWebPlayBillingPort } from "../src/app-core/platform/play-billing/webPlayBilling.ts";

test("web billing adapts Digital Goods purchase and restore to one contract", async () => {
  const service = {
    purchase: vi.fn(async () => ({ itemId: "pro_access", purchaseToken: "new-token" })),
    listPurchases: vi.fn(async () => [
      { itemId: "pro_access", purchaseToken: "owned-token" }
    ])
  };
  const port = await createWebPlayBillingPort({
    getService: async () => service,
    supportsPaymentRequest: () => false
  });

  assert.ok(port);
  assert.equal(await port.isAvailable(), true);
  assert.deepEqual(await port.purchase("pro_access"), {
    productId: "pro_access",
    purchaseToken: "new-token",
    state: "purchased"
  });
  assert.deepEqual(await port.listPurchases(), [{
    productId: "pro_access",
    purchaseToken: "owned-token",
    state: "purchased"
  }]);
});
```

- [ ] **Step 2: Verify the new contract test fails**

Run: `npm run test -- tests/play-billing-port.test.ts`

Expected: FAIL because `webPlayBilling.ts` and its exported factory do not exist.

- [ ] **Step 3: Define the platform-neutral contract**

Create `src/app-core/platform/play-billing/types.ts`:

```ts
export interface PlayPurchase {
  productId: string;
  purchaseToken: string;
  state: "purchased" | "pending";
}

export type PlayBillingErrorCode =
  | "cancelled"
  | "already_owned"
  | "disconnected"
  | "not_available"
  | "product_unavailable"
  | "purchase_pending"
  | "unknown";

export class PlayBillingError extends Error {
  constructor(
    public readonly code: PlayBillingErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PlayBillingError";
  }
}

export interface PlayBillingPort {
  isAvailable(): Promise<boolean>;
  listPurchases(): Promise<PlayPurchase[]>;
  purchase(productId: string): Promise<PlayPurchase>;
}
```

- [ ] **Step 4: Move browser payload knowledge into the web adapter**

Implement `createWebPlayBillingPort` by composing the existing `getPlayBillingService`, `purchasePlayProduct`, `extractPurchaseTokenFromResult`, and PaymentRequest support. Normalize only non-empty product/token pairs and return `[]` when no owned purchases exist. Convert `AbortError` to `new PlayBillingError("cancelled", "Purchase cancelled.")`; retain already-owned detection in the shared error translator.

The orchestration in `entitlements-purchase-play.ts` must use only:

```ts
const billing = await resolvedDeps.resolvePlayBillingPort();
const owned = billing ? await billing.listPurchases() : [];
const purchase = billing ? await billing.purchase(productId) : null;
```

Select a purchase with `purchase.productId === productId`, then submit its token to the existing API verification function. Keep the current pre-check, retry/backoff, in-flight guard, cancellation copy, and entitlement refresh behavior.

- [ ] **Step 5: Add a resolver with no native implementation yet**

Create `resolvePlayBilling.ts`:

```ts
import { createWebPlayBillingPort } from "./webPlayBilling.ts";
import type { PlayBillingPort } from "./types.ts";

export async function resolvePlayBillingPort(): Promise<PlayBillingPort | null> {
  return createWebPlayBillingPort();
}
```

This deliberately keeps Task 2 behavior web-only and green before native code is introduced.

- [ ] **Step 6: Verify browser and orchestration behavior**

Run:

```powershell
npm run test -- tests/play-billing.test.ts tests/play-billing-port.test.ts tests/entitlements-purchase-methods.test.ts tests/entitlements-purchase-service.test.ts
npm run typecheck:tests:web
```

Expected: PASS with existing browser purchase, recovery, verification, and cancellation scenarios unchanged.

- [ ] **Step 7: Commit the billing boundary**

```powershell
git add src/app-core/platform/play-billing src/app-core/utils/playBilling.ts src/app-core/methods/ui/entitlements tests/play-billing*.test.ts tests/entitlements-purchase-methods.test.ts
git commit -m "refactor(billing): isolate Play purchases behind a port"
```

### Task 3: Implement The Billing 8.3 Capacitor Plugin

**Files:**
- Modify: `apps/android/app/build.gradle`
- Modify: `apps/android/app/src/main/java/io/whatfees/MainActivity.java`
- Create: `apps/android/app/src/main/java/io/whatfees/billing/PlayBillingGateway.java`
- Create: `apps/android/app/src/main/java/io/whatfees/billing/GooglePlayBillingGateway.java`
- Create: `apps/android/app/src/main/java/io/whatfees/billing/PlayBillingResult.java`
- Create: `apps/android/app/src/main/java/io/whatfees/billing/PlayBillingResultMapper.java`
- Create: `apps/android/app/src/main/java/io/whatfees/billing/WhatFeesPlayBillingPlugin.java`
- Create: `apps/android/app/src/test/java/io/whatfees/billing/PlayBillingResultMapperTest.java`
- Create: `src/app-core/platform/play-billing/nativePlayBilling.ts`
- Modify: `src/app-core/platform/play-billing/resolvePlayBilling.ts`
- Modify: `tests/play-billing-port.test.ts`
- Modify: `tests/capacitor-android-config.test.ts`

**Interfaces:**
- Produces native plugin id: `WhatFeesPlayBilling`
- Produces plugin methods: `isAvailable()`, `listPurchases()`, `purchase({ productId })`
- Consumes: `PlayBillingPort` from Task 2

- [ ] **Step 1: Extend the failing dependency guard**

Add to `tests/capacitor-android-config.test.ts`:

```ts
test("Android pins Google Play Billing 8.3.0", async () => {
  const appGradle = await readFile("apps/android/app/build.gradle", "utf8");
  assert.match(appGradle, /com\.android\.billingclient:billing:8\.3\.0/);
  assert.doesNotMatch(appGradle, /com\.google\.androidbrowserhelper:billing/);
});
```

Add a native adapter test that mocks Capacitor's registered plugin and expects exact `PlayPurchase` normalization.

- [ ] **Step 2: Verify Billing 8 and native adapter tests fail**

Run: `npm run test -- tests/capacitor-android-config.test.ts tests/play-billing-port.test.ts`

Expected: FAIL because Billing 8.3.0 and `nativePlayBilling.ts` are absent.

- [ ] **Step 3: Add the exact Billing dependency**

In `apps/android/app/build.gradle` add:

```groovy
dependencies {
    implementation "com.android.billingclient:billing:8.3.0"
}
```

Do not use Gradle `force`, a dynamic version, Android Browser Helper billing, or a transitive-only declaration.

- [ ] **Step 4: Define a testable native gateway**

`PlayBillingGateway` owns the asynchronous store boundary:

```java
public interface PlayBillingGateway {
    void isAvailable(ResultCallback<Boolean> callback);
    void listPurchases(ResultCallback<List<PlayBillingResult>> callback);
    void purchase(Activity activity, String productId, ResultCallback<PlayBillingResult> callback);

    interface ResultCallback<T> {
        void success(T value);
        void failure(String code, String message);
    }
}
```

`GooglePlayBillingGateway` must build one `BillingClient` with:

```java
BillingClient.newBuilder(context)
    .setListener(this::onPurchasesUpdated)
    .enablePendingPurchases(
        PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
    )
    .enableAutoServiceReconnection()
    .build();
```

Use `QueryProductDetailsParams` with `BillingClient.ProductType.INAPP`, launch `BillingFlowParams` for the matching `ProductDetails`, and restore through `queryPurchasesAsync`. Reject a second purchase while one promise is active with code `purchase_in_flight`.

- [ ] **Step 5: Implement stable result and error mapping**

`PlayBillingResultMapper` must map response codes exactly:

```java
switch (responseCode) {
    case BillingClient.BillingResponseCode.USER_CANCELED: return "cancelled";
    case BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED: return "already_owned";
    case BillingClient.BillingResponseCode.SERVICE_DISCONNECTED: return "disconnected";
    case BillingClient.BillingResponseCode.BILLING_UNAVAILABLE: return "not_available";
    case BillingClient.BillingResponseCode.ITEM_UNAVAILABLE: return "product_unavailable";
    default: return "unknown";
}
```

Map `Purchase.PurchaseState.PURCHASED` to `purchased`, `PENDING` to `pending`, ignore unspecified purchases during restore, and never grant entitlement in native code.

- [ ] **Step 6: Expose the Capacitor plugin and TypeScript adapter**

Register `WhatFeesPlayBillingPlugin` from `MainActivity`. The plugin returns:

```json
{
  "purchase": {
    "productId": "pro_access",
    "purchaseToken": "opaque-play-token",
    "state": "purchased"
  }
}
```

The TypeScript adapter registers `WhatFeesPlayBilling`, validates every returned field, converts native codes to `PlayBillingError`, and implements `PlayBillingPort`. Update `resolvePlayBillingPort` to choose it only when:

```ts
Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
```

All other environments continue through the web adapter.

- [ ] **Step 7: Run native and frontend billing verification**

Run:

```powershell
npm run android:sync
npm run android:test
npm run test -- tests/capacitor-android-config.test.ts tests/play-billing.test.ts tests/play-billing-port.test.ts tests/entitlements-purchase-methods.test.ts
npm run typecheck:tests:web
```

Expected: JUnit mapper tests and all frontend purchase tests pass.

- [ ] **Step 8: Inspect the resolved dependency graph**

Run:

```powershell
Set-Location apps/android
./gradlew.bat :app:dependencyInsight --configuration releaseRuntimeClasspath --dependency com.android.billingclient:billing
```

Expected: output resolves `com.android.billingclient:billing:8.3.0` exactly and contains no selected version below 8.

- [ ] **Step 9: Commit Billing 8 support**

```powershell
git add apps/android/app src/app-core/platform/play-billing tests/capacitor-android-config.test.ts tests/play-billing-port.test.ts
git commit -m "feat(android): add Play Billing 8 purchase plugin"
```

### Task 4: Add Native Google Identity Without Weakening Session-First Auth

**Files:**
- Create: `src/app-core/platform/identity/types.ts`
- Create: `src/app-core/platform/identity/webGoogleIdentity.ts`
- Create: `src/app-core/platform/identity/nativeGoogleIdentity.ts`
- Create: `src/app-core/platform/identity/resolveIdentityCredential.ts`
- Modify: `src/app-core/methods/ui/entitlements/entitlements-signin-service.ts`
- Modify: `apps/android/app/build.gradle`
- Modify: `apps/android/app/src/main/java/io/whatfees/MainActivity.java`
- Create: `apps/android/app/src/main/java/io/whatfees/identity/WhatFeesGoogleIdentityPlugin.java`
- Create: `tests/identity-credential-port.test.ts`
- Modify: `tests/entitlements-signin-service.test.ts`

**Interfaces:**
- Produces: `IdentityCredentialPort.requestCredential(mode): Promise<IdentityCredential>`
- Produces native plugin id: `WhatFeesGoogleIdentity`
- Preserves: `/auth/me` as the only native-token bootstrap boundary

- [ ] **Step 1: Write failing runtime-selection and sign-in tests**

Create tests proving Android calls the native credential port while web calls the existing GIS path:

```ts
test("manual Android sign-in requests one native ID token then starts session bootstrap", async () => {
  const requestCredential = vi.fn(async () => ({
    idToken: "native-google-token",
    displayName: "Marc",
    photoUrl: "https://example.test/avatar.png"
  }));
  const bootstrapSession = vi.fn(async () => true);

  await promptGoogleSignInFlow(createContext() as never, {
    isNativeAndroid: () => true,
    requestNativeCredential: requestCredential,
    bootstrapSession
  });

  assert.equal(requestCredential.mock.calls.length, 1);
  assert.equal(bootstrapSession.mock.calls.length, 1);
});
```

- [ ] **Step 2: Verify native identity tests fail**

Run: `npm run test -- tests/identity-credential-port.test.ts tests/entitlements-signin-service.test.ts`

Expected: FAIL because native identity dependencies and routing do not exist.

- [ ] **Step 3: Define the identity port**

```ts
export interface IdentityCredential {
  idToken: string;
  displayName: string | null;
  photoUrl: string | null;
}

export interface IdentityCredentialPort {
  requestCredential(mode: "automatic" | "interactive"): Promise<IdentityCredential>;
  clearCredentialState(): Promise<void>;
}
```

The web implementation adapts the current GIS callbacks. The native implementation validates the `WhatFeesGoogleIdentity` plugin result and never writes a new refresh token or provider secret.

- [ ] **Step 4: Pin stable Credential Manager dependencies**

Add to `apps/android/app/build.gradle`:

```groovy
implementation "androidx.credentials:credentials:1.6.0"
implementation "androidx.credentials:credentials-play-services-auth:1.6.0"
implementation "com.google.android.libraries.identity.googleid:googleid:1.1.1"
```

Expose the existing web OAuth client id as a generated Android string resource without committing an environment-specific file:

```groovy
def googleWebClientId = System.getenv("VITE_GOOGLE_CLIENT_ID") ?: ""

android {
    defaultConfig {
        resValue "string", "google_web_client_id", "\"${googleWebClientId}\""
    }
}
```

The plugin reads `R.string.google_web_client_id` and rejects sign-in with `identity_not_configured` when it is empty. `release:play` must fail before Gradle when `VITE_GOOGLE_CLIENT_ID` is empty; CI may use the non-secret test client id already used by frontend tests.

- [ ] **Step 5: Implement Credential Manager sign-in**

The plugin must use `GetGoogleIdOption` for automatic sign-in and `GetSignInWithGoogleOption` for the explicit button. Set the server client id, parse only `GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL`, and return `idToken`, display name, and profile picture URL. Map user dismissal to `cancelled`, no credential to `no_credential`, malformed response to `invalid_credential`, and provider failure to `identity_unavailable`.

On sign-out call `CredentialManager.clearCredentialStateAsync` and then invoke the existing API logout flow; clearing local provider state never substitutes for server session revocation.

- [ ] **Step 6: Route auth by platform while retaining one post-login path**

Extract the existing credential callback body into:

```ts
async function acceptGoogleCredential(
  app: EntitlementSignInContext,
  idToken: string,
  profile?: { displayName?: string | null; photoUrl?: string | null }
): Promise<void>
```

Both GIS and native ports call this function. It may cache display identity, set the short-lived bootstrap token in the existing in-memory storage boundary, call `/auth/me`, update `googleAuthEpoch`, and run entitlement sync. It must not make normal API requests with bearer headers.

- [ ] **Step 7: Verify login, logout, and bearer boundaries**

Run:

```powershell
npm run test -- tests/identity-credential-port.test.ts tests/entitlements-signin-service.test.ts tests/auth-session.test.ts tests/auth-boundaries.test.ts
npm run typecheck:tests:web
npm run android:test
```

Expected: browser GIS scenarios, native credential scenarios, intentional logout, profile image refresh, and bearer-boundary guards pass.

- [ ] **Step 8: Commit native identity**

```powershell
git add apps/android/app src/app-core/platform/identity src/app-core/methods/ui/entitlements/entitlements-signin-service.ts tests/identity-credential-port.test.ts tests/entitlements-signin-service.test.ts
git commit -m "feat(android): bootstrap sessions with native Google identity"
```

### Task 5: Make Native Runtime, Cookies, Offline Assets, And Updates Explicit

**Files:**
- Create: `src/app-core/platform/runtime.ts`
- Modify: `src/app-core/methods/pwa.ts`
- Modify: `src/app-core/methods/ui/common/api-client.ts`
- Modify: `src/app-core/methods/ui/auth/auth-session.ts`
- Modify: `tests/pwa-methods.test.ts`
- Modify: `tests/fetch-with-retry-csrf.test.ts`
- Modify: `tests/auth-session-bootstrap.test.ts`
- Modify: `apps/api/src/lib/http.test.ts`
- Modify: `apps/api/src/lib/auth.test.ts`

**Interfaces:**
- Produces: `getAppRuntime(): "web" | "android"`
- Preserves: `credentials: "include"`, CSRF capture/injection, refresh single-flight, and auth expiry handling
- Changes: native builds skip browser service-worker registration and install prompts

- [ ] **Step 1: Write failing native-runtime tests**

Add tests that assert:

```ts
assert.equal(registerServiceWorker.mock.calls.length, 0);
assert.equal(beforeInstallPromptListeners.length, 0);
assert.equal(fetchMock.mock.calls[0]?.[1]?.credentials, "include");
assert.equal(fetchMock.mock.calls[1]?.[1]?.headers["x-csrf-token"], "csrf-from-bootstrap");
```

The auth bootstrap scenario must start with a native ID token, receive `Set-Cookie` plus `x-csrf-token`, then prove the next unsafe request has no `Authorization` header and does have CSRF.

- [ ] **Step 2: Verify runtime tests fail under browser-only assumptions**

Run: `npm run test -- tests/pwa-methods.test.ts tests/fetch-with-retry-csrf.test.ts tests/auth-session-bootstrap.test.ts`

Expected: FAIL because native runtime detection is absent and PWA hooks still register.

- [ ] **Step 3: Centralize runtime detection**

Create `runtime.ts`:

```ts
import { Capacitor } from "@capacitor/core";

export type AppRuntime = "web" | "android";

export function getAppRuntime(): AppRuntime {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"
    ? "android"
    : "web";
}
```

Use it in PWA methods, billing resolution, and identity resolution. Do not scatter raw Capacitor platform checks elsewhere.

- [ ] **Step 4: Disable browser-only update machinery on Android**

At the top of install-prompt setup, service-worker registration, update polling, and dev worker cleanup, return when `getAppRuntime() === "android"`. The Android binary update path is Play Store delivery; bundled assets must not be replaced by a stale service worker.

- [ ] **Step 5: Preserve cookie and CSRF semantics**

Keep `fetchWithRetry` on standard `fetch` with `credentials: "include"`. Do not enable Capacitor's global HTTP patch until the session bootstrap test proves standard WebView cookie behavior on a physical internal-test build. Keep the logical local origin `https://app.whatfees.ca`, production cookie `SameSite=None; Secure`, exact-origin credentialed CORS, and `x-csrf-token` exposure.

Extend API tests to allow `https://app.whatfees.ca` and reject `capacitor://localhost`, `http://app.whatfees.ca`, and arbitrary origins. This prevents a later configuration drift from silently widening CORS.

- [ ] **Step 6: Verify native and web runtime behavior**

Run:

```powershell
npm run test -- tests/pwa-methods.test.ts tests/fetch-with-retry-csrf.test.ts tests/auth-session-bootstrap.test.ts
npm --prefix apps/api run test -- src/lib/http.test.ts src/lib/auth.test.ts
npm run typecheck:tests:web
npm --prefix apps/api run typecheck
```

Expected: browser service-worker tests and native no-registration tests pass; cookie/CSRF and exact-origin CORS tests pass.

- [ ] **Step 7: Commit runtime hardening**

```powershell
git add src/app-core/platform/runtime.ts src/app-core/methods/pwa.ts src/app-core/methods/ui/common/api-client.ts src/app-core/methods/ui/auth/auth-session.ts tests apps/api/src/lib/http.test.ts apps/api/src/lib/auth.test.ts
git commit -m "fix(android): preserve session and offline runtime boundaries"
```

### Task 6: Replace Bubblewrap Release Automation And Add Compliance Guards

**Files:**
- Create: `apps/android/version.properties`
- Create: `scripts/sync-capacitor-version.mjs`
- Create: `scripts/verify-android-compliance.mjs`
- Modify: `scripts/release-google-play.ps1`
- Modify: `package.json`
- Modify: `tests/release-gates.test.ts`
- Modify: `scripts/security-scan.mjs`
- Modify: `.github/workflows/version-bump.yml`
- Delete after internal-test acceptance: `scripts/sync-twa-version.mjs`
- Delete after internal-test acceptance: `twa-manifest.json`

**Interfaces:**
- Produces: `npm run verify:android`
- Produces: version metadata consumed by Gradle
- Changes: `release:play` builds `apps/android/app/build/outputs/bundle/release/app-release.aab`

- [ ] **Step 1: Write failing release and compliance tests**

Extend `tests/release-gates.test.ts` to require:

```ts
assert.match(script, /sync-capacitor-version\.mjs/);
assert.match(script, /verify-android-compliance\.mjs/);
assert.match(script, /gradlew\.bat/);
assert.match(script, /bundleRelease/);
assert.doesNotMatch(script, /Get-BubblewrapCommand/);
assert.doesNotMatch(script, /bubblewrap build/);
```

Add script tests with temporary Gradle fixtures proving API 35 and Billing 7 fail while API 36 and Billing 8.3.0 pass.

- [ ] **Step 2: Verify release tests fail against Bubblewrap automation**

Run: `npm run test -- tests/release-gates.test.ts tests/capacitor-android-config.test.ts`

Expected: FAIL because the release script still invokes Bubblewrap and no compliance script exists.

- [ ] **Step 3: Make version synchronization explicit**

`apps/android/version.properties` starts with:

```properties
VERSION_NAME=1.0.415
VERSION_CODE=421
```

Load it from `apps/android/app/build.gradle` and set `versionName` and `versionCode`. `sync-capacitor-version.mjs` reads root `package.json`, updates `VERSION_NAME`, increments `VERSION_CODE` only when the name changes, and writes a final newline. Repeated execution for the same package version must be idempotent.

- [ ] **Step 4: Implement the compliance verifier**

`verify-android-compliance.mjs` must:

1. parse `apps/android/variables.gradle` and fail below compile/target 36;
2. parse the declared Billing version and fail below 8.0.0;
3. run Gradle `dependencyInsight` for `releaseRuntimeClasspath`;
4. fail unless the selected dependency is exactly 8.3.0;
5. fail if Android Browser Helper billing is present;
6. print one success line containing `targetSdk=36 billing=8.3.0`.

Add:

```json
{
  "verify:android": "node scripts/verify-android-compliance.mjs && npm run android:test && npm run android:lint"
}
```

- [ ] **Step 5: Rework `release:play` around Gradle**

Preserve full repo verification, production web build, assetlinks generation, signing fingerprint selection, and deploy checks. Replace Bubblewrap discovery/build with:

```powershell
Invoke-Checked "node" @("scripts/sync-capacitor-version.mjs")
Invoke-Checked "npx" @("cap", "sync", "android")
Invoke-Checked "node" @("scripts/verify-android-compliance.mjs")
Push-Location (Join-Path $repoRoot "apps/android")
try {
  Invoke-Checked ".\gradlew.bat" @("bundleRelease")
} finally {
  Pop-Location
}
```

Read signing values from ignored `apps/android/keystore.properties` or approved environment variables. Never print passwords. Copy the final AAB only to ignored `release-output/whatfees-<version>.aab`.

- [ ] **Step 6: Preserve artifact hygiene and version automation**

Update the security scanner so source files under `apps/android` are allowed while keystores, credentials, `local.properties`, APK/AAB output, and staged `build` files are rejected. Update `version-bump.yml` to stage `apps/android/version.properties` instead of `twa-manifest.json` after the cutover.

- [ ] **Step 7: Verify release automation without signing**

Run:

```powershell
npm run test -- tests/release-gates.test.ts tests/capacitor-android-config.test.ts
node scripts/sync-capacitor-version.mjs
npm run verify:android
npm run android:bundle
git diff --check
```

Expected: tests pass, compliance reports `targetSdk=36 billing=8.3.0`, Gradle produces an unsigned release AAB locally, and no generated artifact appears in `git status --short`.

- [ ] **Step 8: Commit release automation but retain rollback files until acceptance**

```powershell
git add apps/android/version.properties scripts package.json tests/release-gates.test.ts .github/workflows/version-bump.yml .gitignore
git commit -m "build(android): replace Bubblewrap release pipeline"
```

Do not delete `twa-manifest.json` or `sync-twa-version.mjs` until Task 9 completes internal testing.

### Task 7: Add Android CI As A First-Class Shipping Gate

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/release-gates.test.ts`

**Interfaces:**
- Produces CI output: `android`
- Produces job: `validate-android`
- Consumes: `npm run verify:android` and `npm run android:bundle`

- [ ] **Step 1: Write a failing workflow guard**

Add assertions requiring `apps/android/*`, `capacitor.config.ts`, platform ports, Android setup, Java 21, compliance verification, and bundle build:

```ts
assert.match(workflow, /android:\s*\$\{\{ steps\.filter\.outputs\.android \}\}/);
assert.match(workflow, /apps\/android\/\*/);
assert.match(workflow, /java-version:\s*["']21["']/);
assert.match(workflow, /npm run verify:android/);
assert.match(workflow, /npm run android:bundle/);
```

- [ ] **Step 2: Verify the workflow guard fails**

Run: `npm run test -- tests/release-gates.test.ts`

Expected: FAIL because CI has no Android output or job.

- [ ] **Step 3: Add Android change detection**

Set `android=true` when changes touch:

```text
apps/android/*
capacitor.config.ts
package.json
package-lock.json
src/app-core/platform/*
src/app-core/methods/ui/entitlements/*
src/app-core/methods/ui/auth/*
scripts/release-google-play.ps1
scripts/sync-capacitor-version.mjs
scripts/verify-android-compliance.mjs
.github/workflows/ci.yml
```

- [ ] **Step 4: Add the Android validation job**

Use Ubuntu, Node 22, Temurin JDK 21, and Android SDK packages for platform/build-tools 36. Run:

```yaml
- run: npm ci
- run: npm run build
- run: npx cap sync android
- run: npm run verify:android
- run: npm run android:bundle
```

Upload Gradle reports on failure only; never upload the generated AAB from pull-request CI.

- [ ] **Step 5: Verify CI structure and local Android gates**

Run:

```powershell
npm run test -- tests/release-gates.test.ts
npm run verify:android
npm run android:bundle
```

Expected: release-gate tests pass and both Android commands exit 0.

- [ ] **Step 6: Commit CI**

```powershell
git add .github/workflows/ci.yml tests/release-gates.test.ts
git commit -m "ci(android): enforce API and Billing compliance"
```

### Task 8: Align Release Documentation And C4 Architecture

**Files:**
- Rewrite: `docs/google-play-release.md`
- Modify: `docs/c4/model/software-systems.dsl`
- Modify: `docs/c4/model/containers.dsl`
- Modify: `docs/c4/model/components/web.dsl`
- Modify: `docs/c4/model/components/web-relationships.dsl`
- Modify: `docs/c4/views/dynamics/billing-entitlements.dsl`
- Create: `docs/c4/model/decisions/0007-own-android-runtime-with-capacitor.md`
- Modify only if unresolved work remains: `docs/refactorplan.md`

**Interfaces:**
- Produces operator truth for Capacitor build, signing, internal test, and Play upload
- Produces architecture truth for native identity and billing adapters

- [ ] **Step 1: Write a failing documentation guard**

Add to `tests/release-gates.test.ts`:

```ts
assert.match(releaseGuide, /Capacitor 8\.4\.0/);
assert.match(releaseGuide, /targetSdkVersion 36/);
assert.match(releaseGuide, /Billing 8\.3\.0/);
assert.match(releaseGuide, /npm run verify:android/);
assert.doesNotMatch(releaseGuide, /bubblewrap build/);
```

- [ ] **Step 2: Verify the guide test fails**

Run: `npm run test -- tests/release-gates.test.ts`

Expected: FAIL because the current guide describes Bubblewrap.

- [ ] **Step 3: Rewrite the release guide as an operator runbook**

Document prerequisites, JDK 21, Android SDK 36, `npm ci`, `npm run verify:all`, `npm run verify:android`, version sync, `npx cap sync android`, signing inputs, `npm run release:play`, exact AAB output, internal-test upload, dependency inspection, Play purchase test accounts, rollback, and artifact hygiene. State that `server.url` is forbidden in production and that OAuth client ids are identifiers rather than secrets.

- [ ] **Step 4: Update C4 and record the decision**

Model the Capacitor Android container as packaging the web UI and owning two adapters:

- `Native Google Identity Adapter` -> Android Credential Manager -> Google Identity;
- `Native Play Billing Adapter` -> BillingClient 8.3.0 -> Google Play;
- both feed the existing web application ports;
- the API remains the session and entitlement authority.

ADR 0007 must record why Bubblewrap was replaced, why Capacitor is source-controlled, why native plugins are narrow/local, why RevenueCat is not introduced, and how browser/PWA parity is preserved.

- [ ] **Step 5: Validate docs and architecture**

Run:

```powershell
npm run test -- tests/release-gates.test.ts
npm run docs:c4:validate
git diff --check
```

Expected: release-guide guard passes. C4 validation passes when Docker/Structurizr is available; if Docker is unavailable, record that environment constraint and retain the passing source guard and diff check.

- [ ] **Step 6: Commit documentation**

```powershell
git add docs/google-play-release.md docs/c4 tests/release-gates.test.ts
git commit -m "docs(android): document Capacitor release architecture"
```

### Task 9: Complete Internal Testing, Cut Over, And Remove Bubblewrap

**Files:**
- Create: `docs/testing/capacitor-android-internal-test.md`
- Modify: `docs/google-play-release.md`
- Delete: `twa-manifest.json`
- Delete: `scripts/sync-twa-version.mjs`
- Modify: `.github/workflows/version-bump.yml`
- Modify: `tests/release-gates.test.ts`

**Interfaces:**
- Consumes: signed Capacitor AAB from Tasks 1-8
- Produces: recorded internal-test evidence and Bubblewrap-free release path

- [ ] **Step 1: Build and upload a signed internal-test bundle**

Run:

```powershell
npm run verify:all
npm run verify:android
npm run release:play
```

Upload the resulting AAB to the existing `io.whatfees` internal-testing track. Confirm Play Console reports target API 36 and no Billing Library policy warning for the new artifact.

- [ ] **Step 2: Execute the acceptance matrix on physical Android devices**

Record pass/fail, device, Android version, app version, and evidence for every case:

1. fresh install and one-click Google login;
2. returning launch without a second login click;
3. Google profile image display and fallback;
4. logout, logout-all, and subsequent login;
5. process death and session restoration;
6. offline launch with local data and safe recovery after reconnect;
7. `pro_access` purchase and API verification;
8. user-cancelled purchase;
9. pending purchase without premature entitlement;
10. existing purchase restoration after reinstall;
11. already-owned recovery;
12. purchase token linked to a different account is rejected;
13. workspace/personal data remains scope isolated;
14. French and English copy, light/dark themes, safe areas, keyboard, and Android back behavior;
15. upgrade from the last TWA production version preserves local and server data.

- [ ] **Step 3: Require all blocking acceptance cases to pass**

Do not cut over while login, session restoration, purchase, restore, entitlement verification, scope isolation, or upgrade data preservation is failing. Fix failures through focused red-green tasks and rerun the affected automated and internal-test cases.

- [ ] **Step 4: Remove Bubblewrap only after acceptance**

Delete `twa-manifest.json` and `scripts/sync-twa-version.mjs`, remove their version-bump references, and make release tests reject `bubblewrap`, `twa-manifest`, and Android Browser Helper billing references from active release scripts and guides.

- [ ] **Step 5: Run the final release-equivalent gate**

Run:

```powershell
npm run verify:all
npm run verify:android
npm run android:bundle
npm run test -- tests/release-gates.test.ts tests/capacitor-android-config.test.ts
git diff --check
git status --short
```

Expected: all automated gates pass, dependency resolution reports Billing 8.3.0, target API is 36, Android bundle builds, diff check is clean, and status contains no generated release or signing artifacts.

- [ ] **Step 6: Commit the cutover**

```powershell
git add -A twa-manifest.json scripts/sync-twa-version.mjs .github/workflows/version-bump.yml docs tests/release-gates.test.ts
git commit -m "chore(android): retire Bubblewrap after Capacitor acceptance"
```

## Plan Self-Review

- Spec coverage: Capacitor ownership, API 36, Billing 8.3.0, session-first native login, browser parity, offline behavior, release automation, artifact hygiene, CI, C4, and internal-test cutover each have a task.
- Boundary consistency: Tasks 2-3 use one `PlayBillingPort`; Tasks 4-5 use one native credential acceptance path and preserve `/auth/me`; Tasks 6-7 use the same `verify:android` gate.
- Cutover safety: Bubblewrap remains available until a signed internal-test build passes the blocking acceptance matrix.
- Scope control: iOS, subscriptions, consumables, RevenueCat, remote web loading, and unrelated refactors are explicitly excluded.
