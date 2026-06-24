param(
  [string]$PayloadRoot = "",
  [switch]$SkipRuntimeInstall,
  [string]$RuntimeVersion = "1"
)

$ErrorActionPreference = "Stop"

# // Resolve the extracted installer payload so the script can run from Inno Setup or manually during tests.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $PayloadRoot) {
  $PayloadRoot = Split-Path -Parent $scriptDir
}
$PayloadRoot = [System.IO.Path]::GetFullPath($PayloadRoot)

$sourceDir = Join-Path $PayloadRoot "dist\PremierePro-AudioSeparator"
$destDir = Join-Path $env:APPDATA "Adobe\CEP\extensions\PremierePro-AudioSeparator"
$runtimeDir = Join-Path $env:LOCALAPPDATA "PremierePro-AudioSeparator\runtime"
$payloadRuntimeDir = Join-Path $PayloadRoot "runtime"
$runtimeVersionFile = Join-Path $runtimeDir ".audioseparator-runtime-version"
$configFile = Join-Path $destDir "config.json"

function Write-AudioSepInfo {
  param([string]$Message)
  # // Keep install logs readable when launched from either PowerShell or the Inno Setup window.
  Write-Host $Message
}

function Copy-AudioSepDirectoryFresh {
  param(
    [string]$Source,
    [string]$Destination
  )

  # // Replace the installed extension or runtime folder cleanly for the current Windows user.
  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Recurse -Force
  }
  New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
}

function Enable-AudioSepCepDebugMode {
  # // Enable unsigned CEP extensions for recent Adobe hosts in HKCU without requiring admin rights.
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

function Install-AudioSepPrivateRuntime {
  # // Copy the packaged private runtime into LocalAppData so the plugin does not depend on system tools.
  if (-not (Test-Path -LiteralPath $payloadRuntimeDir)) {
    throw "Private runtime payload is missing: $payloadRuntimeDir"
  }

  Copy-AudioSepDirectoryFresh -Source $payloadRuntimeDir -Destination $runtimeDir
  Write-AudioSepInfo "Private runtime installed to $runtimeDir."
}

function Test-AudioSepRuntimeCommand {
  param(
    [string]$ToolName,
    [string]$ToolPath,
    [string[]]$Arguments
  )

  # // Capture native output before checking ExitCode so PowerShell pipelines cannot overwrite the tool result.
  $output = & $ToolPath @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $firstLine = $output | Select-Object -First 1
  if ($firstLine) {
    Write-AudioSepInfo $firstLine.ToString()
  }

  if ($exitCode -ne 0) {
    $details = ($output | Select-Object -First 8) -join "`n"
    throw "$ToolName failed with code $exitCode.`n$details"
  }
}

function Test-AudioSepPrivateRuntime {
  # // Validate all private tools before writing their paths to the CEP config file.
  $pythonPath = Join-Path $runtimeDir "python\python.exe"
  $ffmpegPath = Join-Path $runtimeDir "ffmpeg\bin\ffmpeg.exe"
  $ffprobePath = Join-Path $runtimeDir "ffmpeg\bin\ffprobe.exe"

  foreach ($tool in @($pythonPath, $ffmpegPath, $ffprobePath)) {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
      throw "Private runtime tool is missing: $tool"
    }
    Unblock-File -LiteralPath $tool -ErrorAction SilentlyContinue
  }

  Test-AudioSepRuntimeCommand -ToolName "Private Python" -ToolPath $pythonPath -Arguments @("-c", "import demucs, torch; print('demucs runtime ok', torch.__version__)")
  Test-AudioSepRuntimeCommand -ToolName "Private FFmpeg" -ToolPath $ffmpegPath -Arguments @("-version")
  Test-AudioSepRuntimeCommand -ToolName "Private FFprobe" -ToolPath $ffprobePath -Arguments @("-version")
}

function Write-AudioSepExtensionConfig {
  # // Persist exact private-runtime paths in the config file read by client/app.js.
  $pythonPath = Join-Path $runtimeDir "python\python.exe"
  $ffmpegPath = Join-Path $runtimeDir "ffmpeg\bin\ffmpeg.exe"

  $config = [ordered]@{
    version = 1
    generatedBy = "audioseparator_install_windows_private_runtime.ps1"
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    pythonPath = $pythonPath
    ffmpegPath = $ffmpegPath
  }

  New-Item -ItemType Directory -Path (Split-Path -Parent $configFile) -Force | Out-Null
  $configJson = $config | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText($configFile, $configJson, (New-Object System.Text.UTF8Encoding($false)))
  Write-AudioSepInfo "Runtime config written: $configFile"
}

function Write-AudioSepRuntimeVersion {
  # // Mark a validated runtime so future lightweight installers can skip large runtime replacement.
  Set-Content -LiteralPath $runtimeVersionFile -Value $RuntimeVersion -Encoding ASCII
  Write-AudioSepInfo "Private runtime version $RuntimeVersion is ready."
}

if (-not (Test-Path -LiteralPath $sourceDir)) {
  throw "Extension payload is missing: $sourceDir"
}

Write-AudioSepInfo "Installing Audio Separator from $PayloadRoot"
Copy-AudioSepDirectoryFresh -Source $sourceDir -Destination $destDir
Write-AudioSepInfo "Audio Separator installed to $destDir."
Enable-AudioSepCepDebugMode

if (-not $SkipRuntimeInstall) {
  Install-AudioSepPrivateRuntime
} else {
  Write-AudioSepInfo "Keeping the compatible private runtime already installed."
}

Test-AudioSepPrivateRuntime
Write-AudioSepRuntimeVersion
Write-AudioSepExtensionConfig

Write-AudioSepInfo "Installation complete. Restart Premiere Pro, then open Window > Extensions > Audio Separator."
