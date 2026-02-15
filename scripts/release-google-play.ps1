[CmdletBinding()]
param(
  [string]$PackageId = "io.whatfees",
  [string]$KeystorePath = "whatfees-upload.jks",
  [string]$KeyAlias = "whatfees-upload",
  [string]$ManifestUrl = "https://unschoolers.github.io/Calcul8/manifest.webmanifest",
  [string]$PagesAssetlinksUrl = "https://unschoolers.github.io/Calcul8/.well-known/assetlinks.json",
  [switch]$SkipVerify,
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

  Write-Step "Extracting SHA-256 certificate fingerprint"
  $storePassForListSecure = Read-Host "Keystore password for fingerprint lookup" -AsSecureString
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
  $fingerprint = $fingerprintMatch.Groups[1].Value.Trim()
  Write-Host "Detected SHA-256 fingerprint: $fingerprint" -ForegroundColor Green

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
  } else {
    Write-Host "Skipping Bubblewrap build by request." -ForegroundColor Yellow
  }

  Write-Step "Done"
  Write-Host "Next: commit + push public/.well-known/assetlinks.json and your release changes." -ForegroundColor Green
}
finally {
  Pop-Location
}
