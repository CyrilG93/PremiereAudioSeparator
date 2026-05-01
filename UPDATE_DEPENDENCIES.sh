#!/bin/bash
# Audio Separator - Dependency Updater (macOS)
# Updates install/runtime dependencies without reinstalling the extension

echo "========================================"
echo "Audio Separator - Dependency Updater"
echo "========================================"
echo ""

UPDATES_DONE=0
EXTENSION_PATH="$HOME/Library/Application Support/Adobe/CEP/extensions/PremierePro-AudioSeparator"
CONFIG_FILE="$EXTENSION_PATH/config.json"

# Prefer the Python runtime saved by the installer so Demucs stays in the local extension environment.
PYTHON_PATH=""
if [ -f "$CONFIG_FILE" ]; then
    CONFIG_PYTHON_PATH="$(sed -n 's/.*"pythonPath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$CONFIG_FILE")"
    if [ -n "$CONFIG_PYTHON_PATH" ] && [ -x "$CONFIG_PYTHON_PATH" ]; then
        PYTHON_PATH="$CONFIG_PYTHON_PATH"
    fi
fi

# Fallback to the installer's Python 3.11 lookup logic when the config is missing.
check_paths=(
    "/usr/local/bin/python3.11"
    "/opt/homebrew/bin/python3.11"
    "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3.11"
)

if [ -z "$PYTHON_PATH" ]; then
    for p in "${check_paths[@]}"; do
        if [ -f "$p" ] && [ -x "$p" ]; then
            PYTHON_PATH="$p"
            break
        fi
    done
fi

if [ -z "$PYTHON_PATH" ] && command -v python3.11 &> /dev/null; then
    PYTHON_PATH="$(which python3.11)"
fi

# 1. Update pip (Python 3.11)
echo "[1/3] Updating pip (Python 3.11)..."
if [ -n "$PYTHON_PATH" ]; then
    OLD_PIP_VERSION="$("$PYTHON_PATH" -m pip --version 2>/dev/null | awk '{print $2}')"
    echo "  Python: $PYTHON_PATH"
    [ -n "$OLD_PIP_VERSION" ] && echo "  Current pip: $OLD_PIP_VERSION"
    if "$PYTHON_PATH" -m pip install --upgrade pip 2>&1; then
        NEW_PIP_VERSION="$("$PYTHON_PATH" -m pip --version 2>/dev/null | awk '{print $2}')"
        if [ -n "$OLD_PIP_VERSION" ] && [ "$OLD_PIP_VERSION" != "$NEW_PIP_VERSION" ]; then
            echo "  [UPDATED] pip $OLD_PIP_VERSION -> $NEW_PIP_VERSION"
            UPDATES_DONE=$((UPDATES_DONE + 1))
        else
            echo "  [OK] pip is already up to date (${NEW_PIP_VERSION:-unknown})"
        fi
    else
        echo "  [ERROR] Failed to update pip"
    fi
else
    echo "  [MISSING] Python 3.11 not found. Run INSTALL_MACOS.sh after installing Python 3.11."
fi
echo ""

# 2. Update Demucs
echo "[2/3] Updating Demucs..."
if [ -n "$PYTHON_PATH" ]; then
    if "$PYTHON_PATH" -m pip show demucs &> /dev/null; then
        OLD_DEMUCS_VERSION="$("$PYTHON_PATH" -m pip show demucs 2>/dev/null | awk -F': ' '/^Version:/{print $2; exit}')"
        [ -n "$OLD_DEMUCS_VERSION" ] && echo "  Current Demucs: $OLD_DEMUCS_VERSION"
        if "$PYTHON_PATH" -m pip install --upgrade demucs 2>&1; then
            NEW_DEMUCS_VERSION="$("$PYTHON_PATH" -m pip show demucs 2>/dev/null | awk -F': ' '/^Version:/{print $2; exit}')"
            if [ -n "$OLD_DEMUCS_VERSION" ] && [ "$OLD_DEMUCS_VERSION" != "$NEW_DEMUCS_VERSION" ]; then
                echo "  [UPDATED] Demucs $OLD_DEMUCS_VERSION -> $NEW_DEMUCS_VERSION"
                UPDATES_DONE=$((UPDATES_DONE + 1))
            else
                echo "  [OK] Demucs is already up to date (${NEW_DEMUCS_VERSION:-unknown})"
            fi
        else
            echo "  [ERROR] Failed to update Demucs"
        fi
    else
        echo "  [MISSING] Demucs is not installed in Python 3.11."
        echo "  Run INSTALL_MACOS.sh to install it first."
    fi
else
    echo "  [SKIPPED] Python 3.11 missing"
fi
echo ""

# 3. Update FFmpeg when installed through Homebrew.
echo "[3/3] Updating FFmpeg..."
if command -v ffmpeg &> /dev/null; then
    OLD_FFMPEG_VERSION="$(ffmpeg -version 2>&1 | head -n 1 | awk '{print $3}')"
    echo "  Current version: $OLD_FFMPEG_VERSION"
    if command -v brew &> /dev/null; then
        if brew upgrade ffmpeg 2>&1; then
            NEW_FFMPEG_VERSION="$(ffmpeg -version 2>&1 | head -n 1 | awk '{print $3}')"
            if [ "$OLD_FFMPEG_VERSION" != "$NEW_FFMPEG_VERSION" ]; then
                echo "  [UPDATED] FFmpeg $OLD_FFMPEG_VERSION -> $NEW_FFMPEG_VERSION"
                UPDATES_DONE=$((UPDATES_DONE + 1))
            else
                echo "  [OK] FFmpeg is already up to date ($NEW_FFMPEG_VERSION)"
            fi
        else
            echo "  [INFO] Homebrew could not upgrade FFmpeg automatically"
        fi
    else
        echo "  [INFO] Homebrew not found. Update FFmpeg manually if needed."
    fi
else
    echo "  [MISSING] FFmpeg not found. Run INSTALL_MACOS.sh after installing FFmpeg."
fi
echo ""

echo "========================================"
if [ "$UPDATES_DONE" -gt 0 ]; then
    echo "Done! $UPDATES_DONE dependency(ies) updated."
else
    echo "Done! All dependencies are already up to date (or require manual install)."
fi
echo "========================================"
echo ""
