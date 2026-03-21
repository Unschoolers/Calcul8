[CmdletBinding()]
param(
  [string]$ResourceGroup = "DefaultResourceGroup-CCAN",
  [string]$Location = "canadaeast",
  [string]$SubscriptionId = "57ea8087-61d6-4c06-a2f7-06027bfe6d40",
  [string]$TenantId = "d4ecbd6b-4bc4-43c5-99fa-a5bc020dc2f9",
  [string]$RegistryName = "calcul8teregistry",
  [string]$ContainerAppName = "whatfees-realtime",
  [string]$EnvironmentName = "whatfees-prod-env",
  [string]$ImageName = "whatfees-realtime",
  [string]$ImageTag = "",
  [string]$AllowedOrigin = "https://app.whatfees.ca,https://whatfees.ca",
  [int]$MinReplicas = 1,
  [int]$MaxReplicas = 2,
  [string]$InternalApiKey = "",
  [string]$TokenSecret = "",
  [switch]$SkipBuild
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

function Invoke-Checked {
  param(
    [string]$Exe,
    [string[]]$CmdArgs
  )

  & $Exe @CmdArgs
  if ($LASTEXITCODE -ne 0) {
    $joined = if ($CmdArgs.Count -gt 0) { $CmdArgs -join " " } else { "<no-args>" }
    throw "Command failed (exit $LASTEXITCODE): $Exe $joined"
  }
}

function Invoke-Capture {
  param(
    [string]$Exe,
    [string[]]$CmdArgs
  )

  $output = & $Exe @CmdArgs
  if ($LASTEXITCODE -ne 0) {
    $joined = if ($CmdArgs.Count -gt 0) { $CmdArgs -join " " } else { "<no-args>" }
    throw "Command failed (exit $LASTEXITCODE): $Exe $joined"
  }

  return ($output | Out-String).Trim()
}

function Test-AzCommand {
  param([string[]]$CmdArgs)

  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()
  try {
    $process = Start-Process `
      -FilePath "az" `
      -ArgumentList $CmdArgs `
      -NoNewWindow `
      -Wait `
      -PassThru `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath

    return $process.ExitCode -eq 0
  } finally {
    Remove-Item -LiteralPath $stdoutPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
  Require-Command "az" "Install Azure CLI and sign in with 'az login'."
  Require-Command "docker" "Install Docker Desktop and make sure it is running."
  Require-Command "npm" "Install Node.js/npm."

  if ([string]::IsNullOrWhiteSpace($ImageTag)) {
    $ImageTag = "manual-{0}" -f (Get-Date -Format "yyyyMMddHHmmss")
  }

  if ([string]::IsNullOrWhiteSpace($InternalApiKey)) {
    $InternalApiKey = Read-Host "Enter REALTIME_INTERNAL_API_KEY"
  }
  if ([string]::IsNullOrWhiteSpace($InternalApiKey)) {
    throw "REALTIME_INTERNAL_API_KEY cannot be empty."
  }

  if ([string]::IsNullOrWhiteSpace($TokenSecret)) {
    $TokenSecret = Read-Host "Enter REALTIME_TOKEN_SECRET (optional, press Enter to skip)"
  }

  Write-Step "Checking Azure login"
  Invoke-Checked "az" @("account", "show")

  if (-not [string]::IsNullOrWhiteSpace($TenantId)) {
    $currentTenantId = Invoke-Capture "az" @("account", "show", "--query", "tenantId", "-o", "tsv")
    if ($currentTenantId -ne $TenantId) {
      Write-Step "Switching Azure login to tenant $TenantId"
      Invoke-Checked "az" @("login", "--tenant", $TenantId)
    }
  }

  if (-not [string]::IsNullOrWhiteSpace($SubscriptionId)) {
    Write-Step "Selecting Azure subscription $SubscriptionId"
    Invoke-Checked "az" @("account", "set", "--subscription", $SubscriptionId)
  }

  $selectedTenantId = Invoke-Capture "az" @("account", "show", "--query", "tenantId", "-o", "tsv")
  if (-not [string]::IsNullOrWhiteSpace($TenantId) -and $selectedTenantId -ne $TenantId) {
    throw "Azure CLI is still using tenant '$selectedTenantId', but this deployment expects tenant '$TenantId'."
  }

  Write-Step "Ensuring required Azure providers and CLI extensions are available"
  Invoke-Checked "az" @("config", "set", "extension.use_dynamic_install=yes_without_prompt")
  Invoke-Checked "az" @("provider", "register", "--namespace", "Microsoft.App")
  Invoke-Checked "az" @("provider", "register", "--namespace", "Microsoft.OperationalInsights")

  if (-not $SkipBuild) {
    Write-Step "Building realtime gateway TypeScript"
    Invoke-Checked "npm" @("run", "realtime:build")
  } else {
    Write-Host "Skipping realtime TypeScript build by request." -ForegroundColor Yellow
  }

  $fullImage = "{0}.azurecr.io/{1}:{2}" -f $RegistryName, $ImageName, $ImageTag

  Write-Step "Building Docker image $fullImage"
  Invoke-Checked "docker" @(
    "build",
    "-t", $fullImage,
    "-f", "apps/realtime/Dockerfile",
    "apps/realtime"
  )

  Write-Step "Logging in to Azure Container Registry"
  Invoke-Checked "az" @("acr", "login", "--name", $RegistryName)

  Write-Step "Pushing Docker image to ACR"
  Invoke-Checked "docker" @("push", $fullImage)

  Write-Step "Ensuring Container Apps environment exists"
  if (-not (Test-AzCommand @("containerapp", "env", "show", "--name", $EnvironmentName, "--resource-group", $ResourceGroup))) {
    Invoke-Checked "az" @(
      "containerapp", "env", "create",
      "--name", $EnvironmentName,
      "--resource-group", $ResourceGroup,
      "--location", $Location
    )
  } else {
    Write-Host "Container Apps environment already exists." -ForegroundColor DarkGray
  }

  $registryServer = "{0}.azurecr.io" -f $RegistryName
  $registryUsername = Invoke-Capture "az" @("acr", "credential", "show", "--name", $RegistryName, "--query", "username", "-o", "tsv")
  $registryPassword = Invoke-Capture "az" @("acr", "credential", "show", "--name", $RegistryName, "--query", "passwords[0].value", "-o", "tsv")
  if ([string]::IsNullOrWhiteSpace($registryUsername) -or [string]::IsNullOrWhiteSpace($registryPassword)) {
    throw "Failed to read ACR admin credentials from '$RegistryName'. Ensure admin user is enabled."
  }

  $allowUnauthenticatedSubscribe = if ([string]::IsNullOrWhiteSpace($TokenSecret)) { "true" } else { "false" }
  $secretArgs = @("realtime-internal-api-key=$InternalApiKey")
  $envArgs = @(
    "NODE_ENV=production",
    "REALTIME_ALLOWED_ORIGIN=$AllowedOrigin",
    "REALTIME_DEV_ALLOW_UNAUTH_SUBSCRIBE=$allowUnauthenticatedSubscribe",
    "REALTIME_INTERNAL_API_KEY=secretref:realtime-internal-api-key"
  )

  if (-not [string]::IsNullOrWhiteSpace($TokenSecret)) {
    $secretArgs += "realtime-token-secret=$TokenSecret"
    $envArgs += "REALTIME_TOKEN_SECRET=secretref:realtime-token-secret"
  }

  Write-Step "Creating or updating Container App '$ContainerAppName'"
  if (-not (Test-AzCommand @("containerapp", "show", "--name", $ContainerAppName, "--resource-group", $ResourceGroup))) {
    $createArgs = @(
      "containerapp", "create",
      "--name", $ContainerAppName,
      "--resource-group", $ResourceGroup,
      "--environment", $EnvironmentName,
      "--image", $fullImage,
      "--ingress", "external",
      "--target-port", "8080",
      "--registry-server", $registryServer,
      "--registry-username", $registryUsername,
      "--registry-password", $registryPassword,
      "--min-replicas", $MinReplicas.ToString(),
      "--max-replicas", $MaxReplicas.ToString(),
      "--secrets"
    ) + $secretArgs + @("--env-vars") + $envArgs

    Invoke-Checked "az" $createArgs
  } else {
    Invoke-Checked "az" @(
      "containerapp", "secret", "set",
      "--name", $ContainerAppName,
      "--resource-group", $ResourceGroup,
      "--secrets"
    ) + $secretArgs

    Invoke-Checked "az" @(
      "containerapp", "update",
      "--name", $ContainerAppName,
      "--resource-group", $ResourceGroup,
      "--image", $fullImage,
      "--min-replicas", $MinReplicas.ToString(),
      "--max-replicas", $MaxReplicas.ToString(),
      "--set-env-vars"
    ) + $envArgs
  }

  $fqdn = Invoke-Capture "az" @(
    "containerapp", "show",
    "--name", $ContainerAppName,
    "--resource-group", $ResourceGroup,
    "--query", "properties.configuration.ingress.fqdn",
    "-o", "tsv"
  )

  Write-Step "Bootstrap complete"
  Write-Host "Container App: $ContainerAppName" -ForegroundColor Green
  Write-Host "Environment:   $EnvironmentName" -ForegroundColor Green
  Write-Host "Image:         $fullImage" -ForegroundColor Green
  if (-not [string]::IsNullOrWhiteSpace($fqdn)) {
    Write-Host "FQDN:          https://$fqdn" -ForegroundColor Green
  }
} finally {
  Pop-Location
}
