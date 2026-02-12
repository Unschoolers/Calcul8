# calcul8tr Google Play Release Guide (TWA)

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

Useful flags:

```powershell
.\scripts\release-google-play.ps1 -SkipVerify
.\scripts\release-google-play.ps1 -SkipBuild
.\scripts\release-google-play.ps1 -SkipDeployCheck
.\scripts\release-google-play.ps1 -PackageId io.calcul8tr
```

Deploy your latest web build to:

- `https://unschoolers.github.io/Calcul8/`

Then validate:

- `https://unschoolers.github.io/Calcul8/manifest.webmanifest`
- `https://unschoolers.github.io/Calcul8/sw.js`
- `https://unschoolers.github.io/Calcul8/.well-known/assetlinks.json`

## 2) Create Android signing key (one-time)

```bash
keytool -genkeypair -v -keystore calcul8tr-upload.jks -alias calcul8tr-upload -keyalg RSA -keysize 2048 -validity 10000
```

Get SHA-256 fingerprint (needed for Digital Asset Links):

```bash
keytool -list -v -keystore calcul8tr-upload.jks -alias calcul8tr-upload
```

## 3) Generate `assetlinks.json`

From this repo:

```bash
npm run assetlinks -- --package=io.calcul8tr --fingerprint=AA:BB:CC:...:ZZ
```

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
bubblewrap init --manifest=https://unschoolers.github.io/Calcul8/manifest.webmanifest
```

When prompted, use:

- Start URL: `https://unschoolers.github.io/Calcul8/`
- Application ID/package: `io.calcul8tr` (or your final package)
- Keystore: your `calcul8tr-upload.jks`

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

## 6) Update flow note

This repo is configured so that:

- Service worker checks updates frequently
- New SW activates quickly
- Client reloads on `controllerchange`

For each release, bump `APP_VERSION` in `src/constants.ts` before deploy.
