[CmdletBinding()]
param(
  [string]$PackageId = "io.whatfees",
  [string]$KeystorePath = "whatfees-upload.jks",
  [string]$KeyAlias = "whatfees-upload",
  [string]$PlaySigningFingerprint = "",
  [string]$ManifestUrl = "https://unschoolers.github.io/Calcul8/manifest.webmanifest",
  [string]$PagesAssetlinksUrl = "https://unschoolers.github.io/Calcul8/.well-known/assetlinks.json",
  [switch]$SkipVerify,
  [switch]$SkipWebBuild,
  [switch]$SkipTwaVersionSync,
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
  param(
    [string]$Name,
    [string]$InstallHint
  )
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' not found. $InstallHint"
  }
}

function Convert-SecureToPlainText {
  param([Security.SecureString]$SecureString)
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Invoke-Checked {
  param(
    [string]$Exe,
    [string[]]$CmdArgs
  )
  if (-not $CmdArgs) {
    $CmdArgs = @()
  }
  & $Exe @CmdArgs
  if ($LASTEXITCODE -ne 0) {
    $joined = if ($CmdArgs.Count -gt 0) { $CmdArgs -join " " } else { "<no-args>" }
    throw "Command failed (exit $LASTEXITCODE): $Exe $joined"
  }
}

function Read-JsonFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  $content = Get-Content -LiteralPath $Path -Raw
  if ([string]::IsNullOrWhiteSpace($content)) {
    return $null
  }

  return $content | ConvertFrom-Json
}

function Assert-Sha256Fingerprint {
  param([string]$Fingerprint)
  if ($Fingerprint -notmatch "^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$") {
    throw "Invalid SHA-256 fingerprint format: '$Fingerprint'. Expected AA:BB:...:ZZ"
  }
}

function Get-BubblewrapCommand {
  if (Get-Command bubblewrap -ErrorAction SilentlyContinue) {
    return @{
      Exe = "bubblewrap"
      Prefix = @()
    }
  }

  Require-Command "npx" "Install Node.js/npm."
  return @{
    Exe = "npx"
    Prefix = @("@bubblewrap/cli")
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
  Write-Step "Pre-flight checks"
  Require-Command "npm" "Install Node.js/npm."
  Require-Command "node" "Install Node.js."
  Require-Command "keytool" "Install JDK and ensure keytool is in PATH."

  if (-not $SkipBuild) {
    $null = Get-BubblewrapCommand
  }

  if (-not $SkipVerify) {
    Write-Step "Running npm run verify"
    Invoke-Checked "npm" @("run", "verify")
  } else {
    Write-Host "Skipping verify step by request." -ForegroundColor Yellow
  }

  if (-not $SkipWebBuild) {
    Write-Step "Running npm run build:prod"
    Invoke-Checked "npm" @("run", "build:prod")
  } else {
    Write-Host "Skipping build:prod step by request." -ForegroundColor Yellow
  }

  if (-not $SkipTwaVersionSync) {
    Write-Step "Syncing TWA version from package.json"
    Invoke-Checked "node" @("scripts/sync-twa-version.mjs")

    $twaManifestPath = Join-Path $repoRoot "twa-manifest.json"
    $twaManifest = Read-JsonFile -Path $twaManifestPath
    if ($null -ne $twaManifest) {
      Write-Host "TWA version synced -> name: $($twaManifest.appVersionName), code: $($twaManifest.appVersionCode)" -ForegroundColor Green
      if ($twaManifest.packageId -and $twaManifest.packageId -ne $PackageId) {
        Write-Host "Warning: PackageId argument '$PackageId' differs from twa-manifest packageId '$($twaManifest.packageId)'." -ForegroundColor Yellow
      }
    }
  } else {
    Write-Host "Skipping TWA version sync by request." -ForegroundColor Yellow
  }

  $resolvedKeystorePath = Resolve-Path -LiteralPath $KeystorePath -ErrorAction SilentlyContinue
  if (-not $resolvedKeystorePath) {
    Write-Step "Generating Android upload key ($KeystorePath)"

    $defaultDname = "CN=whatfees, OU=Mobile, O=Unschoolers, L=Montreal, ST=Quebec, C=CA"
    $dname = Read-Host "Distinguished Name (DN) [`"$defaultDname`"]"
    if ([string]::IsNullOrWhiteSpace($dname)) {
      $dname = $defaultDname
    }

    $storePassSecure = Read-Host "Keystore password" -AsSecureString
    $storePassConfirmSecure = Read-Host "Confirm keystore password" -AsSecureString
    $storePass = Convert-SecureToPlainText $storePassSecure
    $storePassConfirm = Convert-SecureToPlainText $storePassConfirmSecure
    if ($storePass -ne $storePassConfirm) {
      throw "Keystore password confirmation mismatch."
    }

    $keyPassSecure = Read-Host "Key password (leave empty to reuse keystore password)" -AsSecureString
    $keyPass = Convert-SecureToPlainText $keyPassSecure
    if ([string]::IsNullOrWhiteSpace($keyPass)) {
      $keyPass = $storePass
    }

    Invoke-Checked "keytool" @(
      "-genkeypair",
      "-v",
      "-keystore", $KeystorePath,
      "-alias", $KeyAlias,
      "-keyalg", "RSA",
      "-keysize", "2048",
      "-validity", "10000",
      "-dname", $dname,
      "-storepass", $storePass,
      "-keypass", $keyPass
    )

    $resolvedKeystorePath = Resolve-Path -LiteralPath $KeystorePath
  } else {
    Write-Step "Using existing keystore: $($resolvedKeystorePath.Path)"
  }

  Write-Step "Selecting SHA-256 fingerprint for Digital Asset Links"
  $fingerprint = ""
  if (-not [string]::IsNullOrWhiteSpace($PlaySigningFingerprint)) {
    $fingerprint = $PlaySigningFingerprint.Trim().ToUpperInvariant()
    Assert-Sha256Fingerprint -Fingerprint $fingerprint
    Write-Host "Using -PlaySigningFingerprint value (recommended)." -ForegroundColor Green
  } else {
    $manualFingerprint = Read-Host "Play App Signing SHA-256 fingerprint from Play Console (recommended). Press Enter to fallback to upload key fingerprint"
    if (-not [string]::IsNullOrWhiteSpace($manualFingerprint)) {
      $fingerprint = $manualFingerprint.Trim().ToUpperInvariant()
      Assert-Sha256Fingerprint -Fingerprint $fingerprint
      Write-Host "Using Play App Signing fingerprint entered manually." -ForegroundColor Green
    } else {
      Write-Host "No Play App Signing fingerprint provided. Falling back to upload key fingerprint (may break TWA trust in production)." -ForegroundColor Yellow
      $storePassForListSecure = Read-Host "Keystore password for upload-key fingerprint lookup" -AsSecureString
      $storePassForList = Convert-SecureToPlainText $storePassForListSecure
      $listOutput = & keytool -list -v -keystore $resolvedKeystorePath.Path -alias $KeyAlias -storepass $storePassForList 2>&1
      if ($LASTEXITCODE -ne 0) {
        throw "keytool fingerprint lookup failed."
      }

      $listText = ($listOutput | Out-String)
      $fingerprintMatch = [regex]::Match($listText, "SHA256:\s*([0-9A-F:]+)")
      if (-not $fingerprintMatch.Success) {
        throw "Could not parse SHA-256 fingerprint from keytool output."
      }
      $fingerprint = $fingerprintMatch.Groups[1].Value.Trim().ToUpperInvariant()
      Assert-Sha256Fingerprint -Fingerprint $fingerprint
      Write-Host "Detected upload-key SHA-256 fingerprint: $fingerprint" -ForegroundColor Yellow
    }
  }

  Write-Step "Generating Digital Asset Links file"
  Invoke-Checked "npm" @("run", "assetlinks", "--", "--package=$PackageId", "--fingerprint=$fingerprint")

  $assetlinksPath = Join-Path $repoRoot "public/.well-known/assetlinks.json"
  if (-not (Test-Path -LiteralPath $assetlinksPath)) {
    throw "Expected file was not created: $assetlinksPath"
  }
  Write-Host "Updated: $assetlinksPath" -ForegroundColor Green

  if (-not $SkipDeployCheck) {
    Write-Step "GitHub Pages deploy check"
    Write-Host "This script does not auto-deploy your repo (workflow depends on your branch setup)." -ForegroundColor Yellow
    $shouldCheck = Read-Host "Check published URL now? (y/N)"
    if ($shouldCheck -match "^(y|yes)$") {
      try {
        $response = Invoke-WebRequest -Uri $PagesAssetlinksUrl -Method GET -TimeoutSec 20
        if ($response.StatusCode -eq 200) {
          Write-Host "URL is reachable: $PagesAssetlinksUrl" -ForegroundColor Green
        } else {
          Write-Host "URL responded with status $($response.StatusCode): $PagesAssetlinksUrl" -ForegroundColor Yellow
        }
      } catch {
        Write-Host "URL not reachable yet. Deploy, wait a minute, then retry:" -ForegroundColor Yellow
        Write-Host "  $PagesAssetlinksUrl"
      }
    }
  } else {
    Write-Host "Skipping deploy URL check by request." -ForegroundColor Yellow
  }

  if (-not $SkipBuild) {
    Write-Step "Building TWA with Bubblewrap"
    $bubblewrap = Get-BubblewrapCommand

    $hasBubblewrapConfig = (Test-Path -LiteralPath (Join-Path $repoRoot "twa-manifest.json")) -or
      (Test-Path -LiteralPath (Join-Path $repoRoot ".bubblewrap"))

    if (-not $hasBubblewrapConfig) {
      Write-Host "Bubblewrap config not found. Running init first..." -ForegroundColor Yellow
      Invoke-Checked $bubblewrap.Exe ($bubblewrap.Prefix + @("init", "--manifest=$ManifestUrl"))
    }

    Invoke-Checked $bubblewrap.Exe ($bubblewrap.Prefix + @("build"))

    $bundlePath = Join-Path $repoRoot "app-release-bundle.aab"
    if (Test-Path -LiteralPath $bundlePath) {
      Write-Host "Generated Android App Bundle: $bundlePath" -ForegroundColor Green
    } else {
      Write-Host "Warning: app-release-bundle.aab not found at repo root." -ForegroundColor Yellow
    }
  } else {
    Write-Host "Skipping Bubblewrap build by request." -ForegroundColor Yellow
  }

  Write-Step "Done"
  Write-Host "Next: commit + push public/.well-known/assetlinks.json and your release changes." -ForegroundColor Green
}
finally {
  Pop-Location
}
