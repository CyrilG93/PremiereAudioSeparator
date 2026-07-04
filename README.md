# Audio Separator v2.4.6 - Premiere Pro Plugin

Audio Separator separates an audio clip into stems directly from Adobe Premiere Pro. It can create vocals/instrumental stems or four stems: vocals, drums, bass and other.

**[English](#english)** | **[Français](#français)**

---

# English

## Features

- 2-stem or 4-stem separation powered by Demucs.
- Fast, balanced and quality processing modes.
- MP3, WAV and FLAC output.
- Automatic import of generated stems into Premiere Pro.
- Localized interface and alerts.

## Recommended Installation

Use the unified installer for your platform:

- macOS: `AudioSeparator-v2.4.6-macOS-Installer-<arch>.pkg`
- Windows: `AudioSeparator-v2.4.6-Windows-Full-Installer.exe`

The unified installer installs the Premiere Pro extension, enables CEP debug mode, and configures a private runtime with Python, Demucs and FFmpeg. You do not need to install Python, FFmpeg or Node.js manually.

After installation, restart Premiere Pro and open **Window > Extensions > Audio Separator**.

## Windows Light Installer

`AudioSeparator-v2.4.6-Windows-Light-Installer.exe` is a smaller connected installer. It is intended for updates or for computers that can download the private runtime during installation. For a first offline installation, use the Full installer.

Click the version badge in the header to open the Audio Separator product page.

## Legacy Script Installation

The older scripts are still included as a fallback:

- macOS: `INSTALL_MACOS.sh`
- Windows: `INSTALL_WINDOWS.bat`

Those scripts may still require manual Python/FFmpeg setup depending on the computer. Prefer the unified `.pkg` or `.exe` installers when available.

## Developer Packaging

macOS:

```bash
npm run verify
npm run package:macos-pkg
```

Windows:

```powershell
npm.cmd run verify
npm.cmd run package:windows-exe
```

Windows packaging must be completed on a Windows computer or runner. See `docs/windows-installer-build.md`.

---

# Français

## Fonctionnalités

- Séparation en 2 stems ou 4 stems avec Demucs.
- Modes rapide, équilibré et qualité.
- Sortie MP3, WAV ou FLAC.
- Import automatique des stems générés dans Premiere Pro.
- Interface et alertes localisées.

## Installation recommandée

Utilisez l'installateur unifié adapté à votre plateforme :

- macOS : `AudioSeparator-v2.4.6-macOS-Installer-<arch>.pkg`
- Windows : `AudioSeparator-v2.4.6-Windows-Full-Installer.exe`

L'installateur unifié installe l'extension Premiere Pro, active le mode CEP debug et configure un runtime privé avec Python, Demucs et FFmpeg. Vous n'avez pas besoin d'installer Python, FFmpeg ou Node.js manuellement.

Après l'installation, redémarrez Premiere Pro puis ouvrez **Fenêtre > Extensions > Audio Separator**.

## Installateur Windows Light

`AudioSeparator-v2.4.6-Windows-Light-Installer.exe` est un installateur connecté plus léger. Il sert surtout aux mises à jour ou aux ordinateurs qui peuvent télécharger le runtime privé pendant l'installation. Pour une première installation hors ligne, utilisez l'installateur Full.

Cliquez sur le badge de version dans l'en-tête pour ouvrir la page produit Audio Separator.

## Installation par scripts historiques

Les anciens scripts restent fournis en solution de secours :

- macOS : `INSTALL_MACOS.sh`
- Windows : `INSTALL_WINDOWS.bat`

Ces scripts peuvent encore demander une installation manuelle de Python/FFmpeg selon l'ordinateur. Privilégiez les installateurs unifiés `.pkg` ou `.exe` quand ils sont disponibles.

## Packaging développeur

macOS :

```bash
npm run verify
npm run package:macos-pkg
```

Windows :

```powershell
npm.cmd run verify
npm.cmd run package:windows-exe
```

Le packaging Windows doit être terminé sur un ordinateur Windows ou un runner Windows. Voir `docs/windows-installer-build.md`.

---

**Version**: 2.4.6
**Author**: Cyril V

## Changelog

### 2.4.5 - 2026-06-24
- Fixed the Windows installer validation at the end of installation.

### 2.4.4 - 2026-06-24
- Fixed the version displayed in the panel.
- Improved GPU and settings log labels.

### 2.4.3 - 2026-06-24
- Added unified macOS `.pkg` packaging with a private Python, Demucs and FFmpeg runtime.
- Prepared unified Windows Full/Light `.exe` packaging with a private runtime.
- GPU mode now checks the configured PyTorch runtime before using CUDA or Apple MPS.

### 2.4.2 - 2026-05-01
- macOS installer no longer requires administrator rights.
- Error popups now follow the selected language.
- Language flags now display correctly in the language selector on Windows.
