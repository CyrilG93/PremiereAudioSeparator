# Windows Installer Build

This project can build two Windows installers with Inno Setup:

- `AudioSeparator-vX-Windows-Full-Installer.exe`: complete first-install package with the CEP extension, private Python 3.11.8, Demucs, PyTorch and FFmpeg.
- `AudioSeparator-vX-Windows-Light-Installer.exe`: smaller package that installs the extension and downloads the private runtime when needed.

## Build on Windows

1. Install Node.js LTS.
2. Open PowerShell in the project folder.
3. Run:

```powershell
npm.cmd run verify
npm.cmd run package:windows-exe
```

The script downloads Python embeddable, `get-pip.py`, Demucs/PyTorch, the LGPL FFmpeg build from BtbN, and Inno Setup if needed. Output files are written to `Releases/`.

## Light Installer Runtime

The Light installer is complete only after the runtime EXE has been published at:

```text
https://github.com/CyrilG93/PremierePro-AudioSeparator/releases/download/windows-runtime-v1/<assetName>
```

The expected asset name and SHA-256 are stored in `installers/windows-runtime.json`. If the runtime is rebuilt or signed, rebuild the Light installer after the hash has been updated.

## Useful Options

```powershell
$env:AUDIOSEP_WINDOWS_FULL_ONLY="1"; npm.cmd run package:windows-exe
$env:AUDIOSEP_WINDOWS_LIGHT_ONLY="1"; npm.cmd run package:windows-exe
$env:AUDIOSEP_WINDOWS_REUSE_STAGING="1"; npm.cmd run package:windows-exe
$env:AUDIOSEP_WINDOWS_REBUILD_RUNTIME="1"; npm.cmd run package:windows-exe
```

Unset the variable afterwards in the same PowerShell session:

```powershell
Remove-Item Env:\AUDIOSEP_WINDOWS_FULL_ONLY -ErrorAction SilentlyContinue
Remove-Item Env:\AUDIOSEP_WINDOWS_LIGHT_ONLY -ErrorAction SilentlyContinue
Remove-Item Env:\AUDIOSEP_WINDOWS_REUSE_STAGING -ErrorAction SilentlyContinue
Remove-Item Env:\AUDIOSEP_WINDOWS_REBUILD_RUNTIME -ErrorAction SilentlyContinue
```
