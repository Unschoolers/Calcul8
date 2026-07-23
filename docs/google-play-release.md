# WhatFees Google Play release guide

WhatFees ships its Android app from the source-controlled Capacitor 8.4.0 project in
`apps/android`. Kotlin plugins own Google Play Billing and Google Identity, while the
Vue application and API remain the shared product implementation.

The release baseline is:

- Android 16 with `compileSdkVersion 36` and `targetSdkVersion 36`
- Google Play Billing 8.3.0
- Capacitor 8.4.0
- Kotlin 2.2.21 and Java 21 bytecode
- package id `io.whatfees`

Bubblewrap is not part of the active build or release path. Its old inputs remain only
as rollback material until the Capacitor build passes internal testing.

## 1. Workstation requirements

Install Node.js 22, JDK 21, and Android SDK Platform 36, Build-Tools 36.0.0,
Platform-Tools, and Command-line Tools. Set `ANDROID_HOME` or create the ignored
`apps/android/local.properties`:

```properties
sdk.dir=C\:\\Users\\you\\AppData\\Local\\Android\\Sdk
```

On Windows, `npm run release:play` also discovers the ignored workspace
`.android-sdk` installation and an installed JDK 21 automatically. It prints the
resolved SDK and Java paths during preflight.

Every normal release run also applies `npm version patch --no-git-tag-version`
and synchronizes that version into the Android project before building. The
diagnostic `-SkipVersionSync` switch skips both the automatic bump and Android
version synchronization.

No keystore, signing password, `local.properties`, `.aab`, or generated Gradle output
may be committed.

## 2. Build configuration

The frontend build requires the public Google web OAuth client id:

```powershell
$env:VITE_GOOGLE_CLIENT_ID="<google-web-client-id>"
```

It is compiled into Android resources for Credential Manager. This identifier is not
a secret; an OAuth client secret must never be added to the app.

Production frontend settings also include:

- `VITE_API_BASE_URL=https://<api-host>/api`
- `VITE_REALTIME_SOCKET_URL=wss://ws.whatfees.ca/socket`
- `VITE_PLAY_PRO_PRODUCT_ID=<active Play product id>`

The API retains the private provider configuration:

- `GOOGLE_PLAY_PACKAGE_NAME=io.whatfees`
- `GOOGLE_PLAY_PRO_PRODUCT_IDS=<allowed product ids>`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL=<service-account-email>`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY=<private key>`

## 3. Verification

```powershell
npm ci
npm run verify:all
npm run build:prod
npm run android:sync
npm run verify:android
```

`npm run verify:android` runs native unit tests, lint, and a dependency-insight
compliance guard. The guard rejects a target SDK below 36, Billing below 8, a resolved
Billing version other than 8.3.0, or Android Browser Helper billing.

For an explicit dependency audit:

```powershell
Set-Location apps/android
.\gradlew.bat app:dependencyInsight --configuration releaseRuntimeClasspath --dependency com.android.billingclient
```

The result must resolve `com.android.billingclient:billing:8.3.0`.

## 4. Versioning

The root `package.json` owns the public version. Android keeps its monotonic Play
version code in `apps/android/version.properties`.

```powershell
node scripts/sync-capacitor-version.mjs
npx cap sync android
```

The sync is idempotent for the same public version and increments `VERSION_CODE` only
when that version changes. Review both values before uploading to Play.

## 5. Signing

Create an upload key once and store it outside source control:

```powershell
keytool -genkeypair -v -keystore whatfees-upload.jks -alias whatfees-upload -keyalg RSA -keysize 2048 -validity 10000
```

Provide signing through the ignored `apps/android/keystore.properties`:

```properties
storeFile=C\:\\secure\\whatfees-upload.jks
storePassword=<password>
keyAlias=whatfees-upload
keyPassword=<password>
```

CI may instead provide `WHATFEES_ANDROID_KEYSTORE_FILE`,
`WHATFEES_ANDROID_KEYSTORE_PASSWORD`, `WHATFEES_ANDROID_KEY_ALIAS`, and
`WHATFEES_ANDROID_KEY_PASSWORD`. Never print them in release logs.

## 6. Produce the bundle

```powershell
npm run release:play
```

This verifies every runtime, bumps the patch version, builds the production web
bundle, synchronizes Capacitor and its version, enforces Android compliance, requires
signing, and builds the signed bundle. The ignored output is
`release-output/whatfees-<version>.aab`.

Use `-SkipVerify` only when an equivalent reviewed CI run is attached to the release.
Use `-SkipWebBuild` only when `dist` came from the exact source revision being
released. Neither option bypasses Android compliance or signing.

## 7. Internal testing acceptance

Upload the `.aab` to Google Play Internal testing first. Test with a licensed account
on Android 16 and one supported older Android version.

Required cases include cold/returning/offline start, automatic and explicit Google
sign-in, one-step session entry, profile-image fallback, purchase success/cancel/
pending/restore, duplicate-tap protection, server-side entitlement verification,
sign-out, navigation, app-used file/media paths, and phone/tablet light/dark layouts.

Record results in `docs/testing/capacitor-android-internal-test.md`. Remove the
Bubblewrap rollback files only after the matrix passes and Play accepts the artifact.

## 8. Play Console checklist

- App signing and upload certificate are valid
- Internal artifact reports target API 36
- Billing products match the API allowlist
- Android OAuth client uses package `io.whatfees` and the Play signing SHA-1
- Data safety, privacy policy, content rating, audience, and ads declarations are current
- Store assets and release notes are current
- The pre-launch report has no blocking crash, ANR, login, or billing issue

Promote the exact tested artifact; do not rebuild between internal testing and a
staged production rollout.
