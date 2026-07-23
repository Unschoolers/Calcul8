[CmdletBinding()]
param(
  [string]$PackageId = "io.whatfees",
  [string]$PlaySigningFingerprint = "",
  [string]$PagesAssetlinksUrl = "https://app.whatfees.ca/.well-known/assetlinks.json",
  [switch]$SkipVerify,
  [switch]$SkipWebBuild,
  [switch]$SkipVersionSync,
  [switch]$SkipBuild,
  [switch]$SkipDeployCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Require-Command {
  param([string]$Name, [string]$InstallHint)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' not found. $InstallHint"
  }
}

function Invoke-Checked {
  param([string]$Exe, [string[]]$CmdArgs)
  & $Exe @CmdArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed (exit $LASTEXITCODE): $Exe $($CmdArgs -join ' ')"
  }
}

function Assert-BundleSignature {
  param([string]$Path)

  $previousErrorPreference = $ErrorActionPreference
  try {
    # Android upload keys are intentionally self-signed. jarsigner -strict
    # reports that expected trust-chain condition as exit 4 on JDK 21.
    $ErrorActionPreference = "Continue"
    $verificationOutput = (& jarsigner -verify -strict $Path 2>&1 | Out-String)
    $verificationExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorPreference
  }

  $isExpectedUploadKeyWarning = (
    $verificationExitCode -eq 4 -and
    $verificationOutput -match "signer certificate is self-signed" -and
    $verificationOutput -match "jar verified, with signer errors"
  )
  if ($verificationExitCode -ne 0 -and -not $isExpectedUploadKeyWarning) {
    throw "App Bundle signature verification failed (jarsigner exit $verificationExitCode). Re-run with -verbose and -certs for details."
  }
  if ($verificationOutput -notmatch "jar verified") {
    throw "jarsigner did not confirm that the App Bundle is signed."
  }

  Write-Host "App Bundle signature verified." -ForegroundColor Green
}

function Test-Java21Home {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) {
    return $false
  }
  $javaExe = Join-Path $Path "bin/java.exe"
  if (-not (Test-Path -LiteralPath $javaExe -PathType Leaf)) {
    return $false
  }
  $previousErrorPreference = $ErrorActionPreference
  try {
    # Windows PowerShell surfaces java -version's stderr as NativeCommandError
    # under Stop even though the process succeeds, so inspect its exit code.
    $ErrorActionPreference = "Continue"
    $versionOutput = (& $javaExe -version 2>&1 | Out-String)
    $javaExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  return $javaExitCode -eq 0 -and $versionOutput -match 'version "21(?:\.|")'
}

function Initialize-AndroidBuildEnvironment {
  param([string]$RepoRoot)

  $sdkCandidates = @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    (Join-Path $RepoRoot ".android-sdk")
  )
  if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    $sdkCandidates += Join-Path $env:LOCALAPPDATA "Android/Sdk"
  }

  $sdkPath = $null
  foreach ($candidate in $sdkCandidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }
    $apiMarker = Join-Path $candidate "platforms/android-36/android.jar"
    if (Test-Path -LiteralPath $apiMarker -PathType Leaf) {
      $sdkPath = (Resolve-Path -LiteralPath $candidate).Path
      break
    }
  }
  if ([string]::IsNullOrWhiteSpace($sdkPath)) {
    throw "Android SDK Platform 36 was not found. Set ANDROID_HOME or install it in .android-sdk."
  }
  $env:ANDROID_HOME = $sdkPath
  $env:ANDROID_SDK_ROOT = $sdkPath

  $javaCandidates = @($env:JAVA_HOME)
  $javaRoots = @(
    (Join-Path $env:ProgramFiles "Amazon Corretto"),
    (Join-Path $env:ProgramFiles "Eclipse Adoptium"),
    (Join-Path $env:ProgramFiles "Microsoft")
  )
  foreach ($root in $javaRoots) {
    if (-not (Test-Path -LiteralPath $root -PathType Container)) {
      continue
    }
    $javaCandidates += Get-ChildItem -LiteralPath $root -Directory |
      Where-Object { $_.Name -match '^jdk-?21' } |
      ForEach-Object { $_.FullName }
  }

  $javaHome = $javaCandidates | Where-Object { Test-Java21Home $_ } | Select-Object -First 1
  if ([string]::IsNullOrWhiteSpace($javaHome)) {
    throw "Java 21 was not found. Install JDK 21 or set JAVA_HOME to its installation directory."
  }
  $javaHome = (Resolve-Path -LiteralPath $javaHome).Path
  $env:JAVA_HOME = $javaHome
  $env:Path = "$(Join-Path $javaHome 'bin');$env:Path"

  Write-Host "Android SDK: $sdkPath"
  Write-Host "Java 21: $javaHome"
}

function Assert-Sha256Fingerprint {
  param([string]$Fingerprint)
  if ($Fingerprint -notmatch "^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$") {
    throw "Invalid SHA-256 fingerprint format."
  }
}

function Read-VersionProperties {
  param([string]$Path)
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match "^([^=]+)=(.*)$") {
      $values[$matches[1].Trim()] = $matches[2].Trim()
    }
  }
  return $values
}

function Assert-SigningConfiguration {
  param([string]$RepoRoot)
  $propertiesPath = Join-Path $RepoRoot "apps/android/keystore.properties"
  if (Test-Path -LiteralPath $propertiesPath) {
    $properties = Read-VersionProperties $propertiesPath
    $requiredProperties = @("storeFile", "storePassword", "keyAlias", "keyPassword")
    $missingProperties = @(
      $requiredProperties | Where-Object {
        -not $properties.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($properties[$_])
      }
    )
    if ($missingProperties.Count -gt 0) {
      throw "Missing Android signing properties: $($missingProperties -join ', ')."
    }
    $storeFile = $properties.storeFile
    if (-not [System.IO.Path]::IsPathRooted($storeFile)) {
      $storeFile = Join-Path $RepoRoot "apps/android/app/$storeFile"
    }
    if (-not (Test-Path -LiteralPath $storeFile -PathType Leaf)) {
      throw "Android signing keystore was not found: $storeFile"
    }
    return
  }
  $required = @(
    "WHATFEES_ANDROID_KEYSTORE_FILE",
    "WHATFEES_ANDROID_KEYSTORE_PASSWORD",
    "WHATFEES_ANDROID_KEY_ALIAS",
    "WHATFEES_ANDROID_KEY_PASSWORD"
  )
  $missing = @($required | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) })
  if ($missing.Count -gt 0) {
    throw "Missing Android signing configuration. Add ignored apps/android/keystore.properties or set: $($missing -join ', ')."
  }
  $environmentStoreFile = [Environment]::GetEnvironmentVariable("WHATFEES_ANDROID_KEYSTORE_FILE")
  if (-not (Test-Path -LiteralPath $environmentStoreFile -PathType Leaf)) {
    throw "Android signing keystore was not found: $environmentStoreFile"
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
  Write-Step "Pre-flight checks"
  Require-Command "npm" "Install Node.js/npm."
  Require-Command "node" "Install Node.js."
  Initialize-AndroidBuildEnvironment $repoRoot
  if ([string]::IsNullOrWhiteSpace($env:VITE_GOOGLE_CLIENT_ID)) {
    throw "VITE_GOOGLE_CLIENT_ID is required for native Google identity."
  }

  if (-not $SkipVerify) {
    Write-Step "Running npm run verify:all"
    Invoke-Checked "npm" @("run", "verify:all")
  } else {
    Write-Host "Skipping full release preflight by request." -ForegroundColor Yellow
  }

  if (-not $SkipWebBuild) {
    Write-Step "Running npm run build:prod"
    Invoke-Checked "npm" @("run", "build:prod")
  }

  if (-not $SkipVersionSync) {
    Write-Step "Syncing Capacitor Android version"
    Invoke-Checked "node" @("scripts/sync-capacitor-version.mjs")
  }

  Write-Step "Syncing bundled web assets"
  Invoke-Checked "npx" @("cap", "sync", "android")

  Write-Step "Verifying Android API and Billing compliance"
  Invoke-Checked "node" @("scripts/verify-android-compliance.mjs")

  if (-not [string]::IsNullOrWhiteSpace($PlaySigningFingerprint)) {
    $fingerprint = $PlaySigningFingerprint.Trim().ToUpperInvariant()
    Assert-Sha256Fingerprint $fingerprint
    Write-Step "Generating Digital Asset Links file"
    Invoke-Checked "npm" @("run", "assetlinks", "--", "--package=$PackageId", "--fingerprint=$fingerprint")
  } else {
    Write-Host "No Play signing fingerprint supplied; existing assetlinks.json is preserved." -ForegroundColor Yellow
  }

  if (-not $SkipDeployCheck) {
    Write-Step "Checking published Digital Asset Links"
    try {
      $response = Invoke-WebRequest -Uri $PagesAssetlinksUrl -Method GET -TimeoutSec 20
      if ($response.StatusCode -ne 200) {
        throw "Digital Asset Links returned HTTP $($response.StatusCode)."
      }
    } catch {
      throw "Digital Asset Links deployment check failed: $($_.Exception.Message)"
    }
  }

  if (-not $SkipBuild) {
    Assert-SigningConfiguration $repoRoot
    Require-Command "jarsigner" "Install JDK 21 and make its bin directory available."
    Write-Step "Building signed Capacitor Android App Bundle"
    Push-Location (Join-Path $repoRoot "apps/android")
    try {
      Invoke-Checked ".\gradlew.bat" @("bundleRelease")
    } finally {
      Pop-Location
    }

    $version = Read-VersionProperties (Join-Path $repoRoot "apps/android/version.properties")
    $bundlePath = Join-Path $repoRoot "apps/android/app/build/outputs/bundle/release/app-release.aab"
    if (-not (Test-Path -LiteralPath $bundlePath)) {
      throw "Expected Android App Bundle was not produced: $bundlePath"
    }
    Write-Step "Verifying App Bundle signature"
    Assert-BundleSignature $bundlePath
    $outputDirectory = Join-Path $repoRoot "release-output"
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
    $outputPath = Join-Path $outputDirectory "whatfees-$($version.VERSION_NAME).aab"
    Copy-Item -LiteralPath $bundlePath -Destination $outputPath -Force
    Write-Host "Generated Android App Bundle: $outputPath" -ForegroundColor Green
  }

  Write-Step "Done"
}
finally {
  Pop-Location
}
