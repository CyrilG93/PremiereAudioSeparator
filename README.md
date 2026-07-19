# Audio Separator v2.4.10 - Premiere Pro Plugin

Audio Separator separates an audio clip into stems directly from Adobe Premiere Pro. It can create vocals/instrumental stems or four stems: vocals, drums, bass and other.

**[English](#english)** | **[Français](#français)**

---

# English

## Features

- 2-stem or 4-stem separation powered by Demucs.
- Fast, balanced and quality processing modes.
- One global progress percentage across all Demucs model passes.
- MP3, WAV and FLAC output.
- Automatic import of generated stems into Premiere Pro.
- Localized interface and alerts.
- Panel colors follow Premiere Pro's light and dark themes.

## Installation

Download the unified installer for your platform:

- macOS Apple Silicon: `AudioSeparator-v2.4.10-macOS-Installer-arm64.pkg`
- Windows 64-bit: `AudioSeparator-v2.4.10-Windows-Full-Installer.exe`

The installer includes the Premiere Pro extension and a private runtime with Python 3.11.8, Demucs 4.1.0, PyTorch 2.13.0 and FFmpeg. Python, FFmpeg and Node.js do not need to be installed separately.

The installers are currently unsigned:

- On Windows, select **More info > Run anyway** if Microsoft Defender SmartScreen appears.
- On macOS, Control-click the PKG, choose **Open**, then confirm. If necessary, allow it from **System Settings > Privacy & Security**.

After installation, restart Premiere Pro and open **Window > Extensions > Audio Separator**.

The first use of each Demucs model requires an internet connection to download its model files. They are cached locally for later offline use.

Click the version badge in the panel header to open the Audio Separator product page.

## Developer Packaging

Windows packaging requires Windows, Node.js and an internet connection. Inno Setup is downloaded automatically when it is not already installed:

```powershell
npm.cmd run verify
npm.cmd run package:windows-exe
```

macOS packaging requires an Apple Silicon Mac, Node.js, `uv` and the Xcode Command Line Tools:

```bash
npm run verify
npm run package:macos-pkg
```

The same unsigned arm64 PKG can be built from **GitHub Actions > Build macOS Installer > Run workflow**.

Generated installers are written to `Releases/`. See `docs/windows-installer-build.md` for Windows build details.

---

# Français

## Fonctionnalités

- Séparation en 2 stems ou 4 stems avec Demucs.
- Modes de traitement rapide, équilibré et qualité.
- Pourcentage de progression global sur toutes les passes des modèles Demucs.
- Sortie MP3, WAV ou FLAC.
- Import automatique des stems générés dans Premiere Pro.
- Interface et alertes localisées.
- Couleurs adaptées aux thèmes clair et sombre de Premiere Pro.

## Installation

Téléchargez l'installateur unifié adapté à votre plateforme :

- macOS Apple Silicon : `AudioSeparator-v2.4.10-macOS-Installer-arm64.pkg`
- Windows 64 bits : `AudioSeparator-v2.4.10-Windows-Full-Installer.exe`

L'installateur inclut l'extension Premiere Pro et un runtime privé contenant Python 3.11.8, Demucs 4.1.0, PyTorch 2.13.0 et FFmpeg. Il n'est pas nécessaire d'installer Python, FFmpeg ou Node.js séparément.

Les installateurs ne sont pas encore signés :

- Sous Windows, sélectionnez **Informations complémentaires > Exécuter quand même** si Microsoft Defender SmartScreen apparaît.
- Sous macOS, faites un Ctrl-clic sur le PKG, choisissez **Ouvrir**, puis confirmez. Si nécessaire, autorisez-le depuis **Réglages Système > Confidentialité et sécurité**.

Après l'installation, redémarrez Premiere Pro puis ouvrez **Fenêtre > Extensions > Audio Separator**.

La première utilisation de chaque modèle Demucs nécessite une connexion internet pour télécharger ses fichiers. Ils sont ensuite conservés localement pour les utilisations hors ligne.

Cliquez sur le badge de version dans l'en-tête du panneau pour ouvrir la page produit Audio Separator.

## Packaging développeur

Le packaging Windows nécessite Windows, Node.js et une connexion internet. Inno Setup est téléchargé automatiquement s'il n'est pas déjà installé :

```powershell
npm.cmd run verify
npm.cmd run package:windows-exe
```

Le packaging macOS nécessite un Mac Apple Silicon, Node.js, `uv` et les Xcode Command Line Tools :

```bash
npm run verify
npm run package:macos-pkg
```

Le même PKG arm64 non signé peut être généré depuis **GitHub Actions > Build macOS Installer > Run workflow**.

Les installateurs générés sont écrits dans `Releases/`. Consultez `docs/windows-installer-build.md` pour les détails du build Windows.

---

**Version**: 2.4.10
**Author**: Cyril V

## Changelog

### 2.4.2 - 2026-05-01

- macOS installer no longer requires administrator rights.
- Error popups now follow the selected language.
- Language flags now display correctly in the language selector on Windows.
