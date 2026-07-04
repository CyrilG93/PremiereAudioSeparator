param(
  [string]$Destination = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# // Resolve the repository root from this script location so it works from npm, cmd, or PowerShell.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDir ".."))

# // Use the same user-level CEP folder as the modern Windows installer.
if (-not $Destination) {
  $Destination = Join-Path $env:APPDATA "Adobe\CEP\extensions\PremierePro-AudioSeparator"
}
$Destination = [System.IO.Path]::GetFullPath($Destination)

$runtimeDir = Join-Path $env:LOCALAPPDATA "PremierePro-AudioSeparator\runtime"
$configFile = Join-Path $Destination "config.json"
$sourceConfigFile = Join-Path $repoRoot "config.json"

function Write-AudioSepInfo {
  param([string]$Message)
  # // Keep the quick-update output readable when launched from npm or the .bat helper.
  Write-Host "[Audio Separator] $Message"
}

function Assert-AudioSepSourceFolder {
  param([string]$Name)
  # // Fail early if the script is not being run from a complete plugin checkout.
  $path = Join-Path $repoRoot $Name
  if (-not (Test-Path -LiteralPath $path -PathType Container)) {
    throw "Missing source folder: $path"
  }
  return $path
}

function Copy-AudioSepFolderContents {
  param(
    [string]$Source,
    [string]$Target
  )

  # // Overlay files without deleting the installed config or runtime references.
  if ($DryRun) {
    Write-AudioSepInfo "Would copy $Source -> $Target"
    return
  }

  New-Item -ItemType Directory -Path $Target -Force | Out-Null
  Get-ChildItem -LiteralPath $Source -Force | Copy-Item -Destination $Target -Recurse -Force
}

function Copy-AudioSepOptionalFile {
  param([string]$Name)

  # // Keep the local CEP folder close to the installer payload without requiring a full package rebuild.
  $source = Join-Path $repoRoot $Name
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    return
  }

  $target = Join-Path $Destination $Name
  if ($DryRun) {
    Write-AudioSepInfo "Would copy $source -> $target"
    return
  }

  Copy-Item -LiteralPath $source -Destination $target -Force
}

function Enable-AudioSepCepDebugMode {
  # // Enable unsigned CEP extensions for current-user Adobe hosts without requiring admin rights.
  if ($DryRun) {
    Write-AudioSepInfo "Would enable CEP debug mode for CSXS.7 to CSXS.20"
    return
  }

  $writes = 0
  for ($version = 7; $version -le 20; $version += 1) {
    $key = "HKCU:\Software\Adobe\CSXS.$version"
    try {
      New-Item -Path $key -Force | Out-Null
      New-ItemProperty -Path $key -Name "PlayerDebugMode" -Value "1" -PropertyType String -Force | Out-Null
      $writes += 1
    } catch {
      Write-AudioSepInfo "WARNING: unable to enable CEP debug mode for CSXS.$version."
    }
  }

  if ($writes -gt 0) {
    Write-AudioSepInfo "CEP debug mode enabled for CSXS.7 to CSXS.20."
  }
}

function Write-AudioSepRuntimeConfigIfNeeded {
  # // Preserve an installer-generated config; create one only when the quick copy would otherwise miss runtime paths.
  if (Test-Path -LiteralPath $configFile -PathType Leaf) {
    Write-AudioSepInfo "Keeping existing runtime config: $configFile"
    return
  }

  $pythonPath = Join-Path $runtimeDir "python\python.exe"
  $ffmpegPath = Join-Path $runtimeDir "ffmpeg\bin\ffmpeg.exe"

  if ((Test-Path -LiteralPath $pythonPath -PathType Leaf) -and (Test-Path -LiteralPath $ffmpegPath -PathType Leaf)) {
    if ($DryRun) {
      Write-AudioSepInfo "Would write runtime config for $runtimeDir"
      return
    }

    $config = [ordered]@{
      version = 1
      generatedBy = "audioseparator-update-local-windows.ps1"
      generatedAtUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
      pythonPath = $pythonPath
      ffmpegPath = $ffmpegPath
    }

    New-Item -ItemType Directory -Path (Split-Path -Parent $configFile) -Force | Out-Null
    $configJson = $config | ConvertTo-Json -Depth 4
    [System.IO.File]::WriteAllText($configFile, $configJson, (New-Object System.Text.UTF8Encoding($false)))
    Write-AudioSepInfo "Runtime config written: $configFile"
    return
  }

  if (Test-Path -LiteralPath $sourceConfigFile -PathType Leaf) {
    if ($DryRun) {
      Write-AudioSepInfo "Would copy fallback config $sourceConfigFile -> $configFile"
      return
    }

    Copy-Item -LiteralPath $sourceConfigFile -Destination $configFile -Force
    Write-AudioSepInfo "Fallback config copied: $configFile"
    return
  }

  Write-AudioSepInfo "WARNING: no runtime config was found or created."
}

$clientSource = Assert-AudioSepSourceFolder "client"
$hostSource = Assert-AudioSepSourceFolder "host"
$csxsSource = Assert-AudioSepSourceFolder "CSXS"

Write-AudioSepInfo "Updating local CEP plugin from $repoRoot"
Write-AudioSepInfo "Destination: $Destination"

if (-not $DryRun) {
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
}

Copy-AudioSepFolderContents -Source $clientSource -Target (Join-Path $Destination "client")
Copy-AudioSepFolderContents -Source $hostSource -Target (Join-Path $Destination "host")
Copy-AudioSepFolderContents -Source $csxsSource -Target (Join-Path $Destination "CSXS")
foreach ($fileName in @(".debug", "README.md", "UPDATE_DEPENDENCIES.bat")) {
  Copy-AudioSepOptionalFile $fileName
}
Write-AudioSepRuntimeConfigIfNeeded
Enable-AudioSepCepDebugMode

Write-AudioSepInfo "Local update complete. Restart Premiere Pro, then open Window > Extensions > Audio Separator."
