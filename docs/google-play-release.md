# whatfees Google Play Release Guide (TWA)

Google Play requires an Android package (`.aab`).  
For this project, the standard path is **TWA (Trusted Web Activity)** using Bubblewrap.

## 1) Pre-flight (web app)

Run locally:

```bash
npm ci
npm run verify
npm run build:prod
```

Or run the automated PowerShell flow (recommended on Windows):

```powershell
npm run release:play
```

`release:play` now does this automatically:

- `npm run verify` (unless skipped)
- `npm run build:prod` (unless skipped)
- syncs `twa-manifest.json` version fields from root `package.json`
- generates `public/.well-known/assetlinks.json`
- builds the TWA `.aab` with Bubblewrap

Useful flags:

```powershell
.\scripts\release-google-play.ps1 -SkipVerify
.\scripts\release-google-play.ps1 -SkipWebBuild
.\scripts\release-google-play.ps1 -SkipTwaVersionSync
.\scripts\release-google-play.ps1 -SkipBuild
.\scripts\release-google-play.ps1 -SkipDeployCheck
.\scripts\release-google-play.ps1 -PackageId io.whatfees
.\scripts\release-google-play.ps1 -PlaySigningFingerprint AA:BB:CC:...:ZZ
```

Deploy your latest web build to:

- `https://app.whatfees.ca/`

Then validate:

- `https://app.whatfees.ca/manifest.webmanifest`
- `https://app.whatfees.ca/sw.js`
- `https://app.whatfees.ca/.well-known/assetlinks.json`

## 2) Create Android signing key (one-time)

```bash
keytool -genkeypair -v -keystore whatfees-upload.jks -alias whatfees-upload -keyalg RSA -keysize 2048 -validity 10000
```

Get SHA-256 fingerprint for the upload key (useful for signing/debug only):

```bash
keytool -list -v -keystore whatfees-upload.jks -alias whatfees-upload
```

For production `assetlinks.json`, use the **Play App Signing** SHA-256 fingerprint from:

- Google Play Console -> App integrity -> App signing key certificate

## 3) Generate `assetlinks.json`

From this repo:

```bash
npm run assetlinks -- --package=io.whatfees --fingerprint=AA:BB:CC:...:ZZ
```

Important:

- Use the **Play App Signing** SHA-256 for released builds.
- Using the upload key fingerprint can cause TWA trust verification to fail (URL bar may appear).

This updates:

- `public/.well-known/assetlinks.json`

Commit and deploy this file to GitHub Pages before building the final Android release.

## 4) Build TWA wrapper with Bubblewrap

Install Bubblewrap (one-time):

```bash
npm i -g @bubblewrap/cli
```

Initialize:

```bash
bubblewrap init --manifest=https://app.whatfees.ca/manifest.webmanifest
```

When prompted, use:

- Start URL: `https://app.whatfees.ca/`
- Application ID/package: `io.whatfees` (or your final package)
- Keystore: your `whatfees-upload.jks`

Build Android App Bundle:

```bash
bubblewrap build
```

Output will include an `.aab` suitable for Play upload.

## 5) Play Console checklist

- App name, short description, full description
- 512x512 app icon
- Feature graphic (1024x500)
- Phone screenshots
- Privacy policy URL
- Data safety form
- Content rating questionnaire
- Target audience + ads declaration (if applicable)
- Upload the `.aab` to Internal testing first
- In-app product configured and active (for example `pro_access`) if you use Pro unlock

## 6) Pro purchase wiring (production)

Set frontend build env:

- `VITE_API_BASE_URL=https://<your-function-app>.azurewebsites.net/api`
- `VITE_GOOGLE_CLIENT_ID=<google web client id>`
- `VITE_PLAY_PRO_PRODUCT_ID=<play in-app product id>`

Set backend Function App settings:

- `GOOGLE_PLAY_PACKAGE_NAME=io.whatfees`
- `GOOGLE_PLAY_PRO_PRODUCT_IDS=pro_access`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL=<service-account-email>`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY=<full private key with \n>`

## 7) Update flow note

This repo is configured so that:

- Service worker checks updates frequently
- New SW activates quickly
- Client reloads on `controllerchange`

For each release, bump `APP_VERSION` in `src/constants.ts` before deploy.
