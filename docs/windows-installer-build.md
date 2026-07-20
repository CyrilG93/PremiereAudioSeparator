# Windows Installer Build

This project builds one Windows installer with Inno Setup:

- `AudioSeparator-vX-Windows-Full-Installer.exe`: complete package with the CEP extension, private Python 3.11.8, pinned Demucs/PyTorch versions and FFmpeg.

## Build on Windows

1. Install Node.js LTS.
2. Open PowerShell in the project folder.
3. Run:

```powershell
npm.cmd run verify
npm.cmd run package:windows-exe
```

The script downloads Python embeddable, `get-pip.py`, the pinned Demucs/PyTorch runtime, the LGPL FFmpeg build from BtbN, and Inno Setup if needed. It validates imports and real WAV output before creating the installer. The output file is written to `Releases/`.

Build staging is kept in `%TEMP%\AudioSeparatorWindowsBuild` by default so deeply nested Torch files remain below Windows path limits. The installer also extracts its payload into shortened temporary folders and archives PyTorch's deeply nested third-party license notices into a single included ZIP, preventing the Windows error 206 (path too long) seen during installation. Set `AUDIOSEP_WINDOWS_STAGING_DIR` only when a different short local path is required.

## Useful Options

```powershell
$env:AUDIOSEP_WINDOWS_REUSE_STAGING="1"; npm.cmd run package:windows-exe
```

Unset the variable afterwards in the same PowerShell session:

```powershell
Remove-Item Env:\AUDIOSEP_WINDOWS_REUSE_STAGING -ErrorAction SilentlyContinue
```
