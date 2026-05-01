# 🎵 Audio Separator v2.4.1 - Premiere Pro Plugin

Professional plugin to separate audio tracks into stems (vocals, instrumental, drums, bass) directly in Adobe Premiere Pro, powered by Demucs AI.

**[English](#english)** | **[Français](#français)**

---

# English

---

## ✨ Features
*   **Separation**: 2 Stems (Vocals/Inst) or 4 Stems (Vocals/Drums/Bass/Other).
*   **Performance**: Choose between Fast (Quantized), Balanced, or Quality.
*   **GPU Support**: Auto-detects NVIDIA CUDA or Apple Silicon (MPS).
*   **Formats**: MP3, WAV, FLAC.
*   **Premiere Pro**: Auto-import to project, localized UI and alerts (Chinese Simplified, English, French, German, Italian, Japanese, Portuguese-BR, Russian, Spanish).

---

## 📋 Requirements

This extension needs the following tools installed on your computer.
**⚠️ YOU MUST INSTALL PYTHON AND FFMPEG MANUALLY BEFORE RUNNING THE INSTALLER.**

| Tool | Requirement | Action Required |
|------|-------------|-----------------|
| **Python** | **Strictly version 3.11.8** (required for Demucs compatibility) | ❌ **Install Manually** |
| **FFmpeg** | Latest version | ❌ **Install Manually** |
| **Node.js** | LTS Version | ❌ **Install Manually** |
| **Demucs** | Python AI Library | ✅ **Automatic** (Installed by script) |

### 🔗 Download Links
- **Python 3.11.8**: [Download Here](https://www.python.org/downloads/release/python-3118/)
- **FFmpeg**: [Download Here](https://ffmpeg.org/download.html)
- **Node.js**: [Download Here](https://nodejs.org/)

---

## 🚀 Installation

### macOS Installation

#### Step 1: Install Prerequisites (Manual)
1.  **Install Python 3.11** (Use the link above or Homebrew: `brew install python@3.11`).
2.  **Install FFmpeg** (Use the link above or Homebrew: `brew install ffmpeg`).

#### Step 2: Run the Installer
1.  Open Terminal.
2.  **Easiest method (recommended):** drag and drop `INSTALL_MACOS.sh` into the Terminal window, then press Enter.
3.  **Manual method (command line):** navigate to the extracted folder and run:
    ```bash
    cd /path/to/PremierePro-AudioSeparator
    chmod +x INSTALL_MACOS.sh
    ./INSTALL_MACOS.sh
    ```
4.  The installer will detect your Python/FFmpeg paths, create a config file, and install the extension.
5.  To refresh dependencies later (without reinstalling the extension), run `UPDATE_DEPENDENCIES.sh`.

#### Step 3: Restart Premiere Pro
Go to **Window** > **Extensions** > **Audio Separator**

---

### Windows Installation

#### Step 1: Install Prerequisites (Manual)
1.  **Install Python 3.11.8**: [Download Installer](https://www.python.org/downloads/release/python-3118/)
    *   ⚠️ **IMPORTANT**: Check the box **"Add Python to PATH"** during installation.
2.  **Install FFmpeg**: Extract it and add `bin` folder to your System PATH (or simpler: assume the installer will find it if it's in a standard location like `C:\ffmpeg\bin`).

#### Step 2: Run the Installer
1.  Right-click `INSTALL_WINDOWS.bat` → **Run as administrator**.
2.  Follow the instructions. It will find Python 3.11, install Demucs, and configure the plugin.
3.  To refresh dependencies later (without reinstalling the extension), run `UPDATE_DEPENDENCIES.bat`.

#### Step 3: Restart Premiere Pro
Go to **Window** > **Extensions** > **Audio Separator**

---

# Français

## 📋 Prérequis

Cette extension nécessite l'installation des outils suivants.
**⚠️ VOUS DEVEZ INSTALLER PYTHON ET FFMPEG MANUELLEMENT AVANT DE LANCER L'INSTALLATEUR.**

| Outil | Prérequis | Action Requise |
|-------|-----------|----------------|
| **Python** | **Strictement version 3.11.8** (requis pour Demucs) | ❌ **Manuel** |
| **FFmpeg** | Dernière version | ❌ **Manuel** |
| **Node.js** | Version LTS | ❌ **Manuel** |
| **Demucs** | Librairie IA | ✅ **Automatique** (via le script) |

### 🔗 Liens de Téléchargement
- **Python 3.11.8**: [Télécharger ici](https://www.python.org/downloads/release/python-3118/)
- **FFmpeg**: [Télécharger ici](https://ffmpeg.org/download.html)
- **Node.js**: [Télécharger ici](https://nodejs.org/)

---

## 🚀 Installation

### Installation macOS

#### Étape 1 : Installer les prérequis (Manuel)
1.  **Installez Python 3.11** (Lien ci-dessus ou via Homebrew : `brew install python@3.11`).
2.  **Installez FFmpeg** (Lien ci-dessus ou via Homebrew : `brew install ffmpeg`).

#### Étape 2 : Lancer l'installateur
1.  Ouvrez le Terminal.
2.  **Méthode la plus simple (recommandée)** : glissez-déposez `INSTALL_MACOS.sh` dans la fenêtre du Terminal, puis appuyez sur Entrée.
3.  **Méthode manuelle (ligne de commande)** : allez dans le dossier extrait puis lancez :
    ```bash
    cd /chemin/vers/PremierePro-AudioSeparator
    chmod +x INSTALL_MACOS.sh
    ./INSTALL_MACOS.sh
    ```
4.  L'installateur va détecter vos chemins Python/FFmpeg, créer la configuration, et installer l'extension.
5.  Pour mettre à jour les dépendances plus tard (sans réinstaller l'extension), lancez `UPDATE_DEPENDENCIES.sh`.

#### Étape 3 : Redémarrer Premiere Pro
Allez dans **Fenêtre** > **Extensions** > **Audio Separator**

---

### Installation Windows

#### Étape 1 : Installer les prérequis (Manuel)
1.  **Installez Python 3.11.8** : [Télécharger l'installateur](https://www.python.org/downloads/release/python-3118/)
    *   ⚠️ **IMPORTANT** : Cochez la case **"Add Python to PATH"** pendant l'installation.
2.  **Installez FFmpeg** et ajoutez-le au PATH système.

#### Étape 2 : Lancer l'installateur
1.  Clic-droit sur `INSTALL_WINDOWS.bat` → **Exécuter en tant qu'administrateur**.
2.  Suivez les instructions. Il va trouver Python 3.11, installer Demucs et configurer le plugin.
3.  Pour mettre à jour les dépendances plus tard (sans réinstaller l'extension), lancez `UPDATE_DEPENDENCIES.bat`.

#### Étape 3 : Redémarrer Premiere Pro
Allez dans **Fenêtre** > **Extensions** > **Audio Separator**

---

**Version**: 2.4.1
**Auteur**: Cyril V
