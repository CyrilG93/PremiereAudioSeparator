#!/bin/bash
# Audio Separator for Premiere Pro - macOS Installer
# Version 2.4.1

echo ""
echo "========================================"
echo "Audio Separator for Premiere Pro"
echo "Installation Package v2.4.1 - macOS"
echo "========================================"
echo ""

# Get script directory
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
EXTENSION_PATH="/Library/Application Support/Adobe/CEP/extensions/PremierePro-AudioSeparator"
CONFIG_FILE="$EXTENSION_PATH/config.json"

echo "Source directory: $SOURCE_DIR"
echo "Target directory: $EXTENSION_PATH"
echo ""

# Ensure the dependency updater is executable when launched from the extracted folder.
[ -f "$SOURCE_DIR/UPDATE_DEPENDENCIES.sh" ] && chmod +x "$SOURCE_DIR/UPDATE_DEPENDENCIES.sh"

# Check for sudo and auto-elevate if needed
if [ "$EUID" -ne 0 ]; then
    echo "This script requires administrator privileges."
    echo "Requesting sudo access..."
    sudo "$0" "$@"
    exit $?
fi

echo "[OK] Running with appropriate permissions"
echo ""

echo "========================================"
echo "Step 1/5: Checking Python 3.11"
echo "========================================"
echo ""

# Logic to find Python 3.11 specifically
# Since Demucs requires 3.11 for compatibility (not 3.13/3.14)
PYTHON_PATH=""

# Check specific paths first
check_paths=(
    "/usr/local/bin/python3.11"
    "/opt/homebrew/bin/python3.11"
    "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3.11"
)

for p in "${check_paths[@]}"; do
    if [ -f "$p" ] && [ -x "$p" ]; then
        PYTHON_PATH="$p"
        break
    fi
done

# If not found in common paths, try using 'which' or 'command -v' but ensure it is 3.11
if [ -z "$PYTHON_PATH" ]; then
    if command -v python3.11 &> /dev/null; then
        PYTHON_PATH=$(which python3.11)
    fi
fi

if [ -n "$PYTHON_PATH" ]; then
    PYTHON_VERSION=$("$PYTHON_PATH" --version)
    echo "[OK] Python 3.11 found: $PYTHON_VERSION"
    echo "     Path: $PYTHON_PATH"
else
    echo "[MISSING] Python 3.11 not found!"
    echo ""
    echo "Audio Separator STRICTLY requires Python 3.11 (not 3.12+)."
    echo ""
    echo "Please download and install Python 3.11.8 for macOS from:"
    echo "https://www.python.org/downloads/release/python-3118/"
    echo ""
    echo "Install it, then run this installer again."
    echo ""
    exit 1
fi

echo ""
echo "========================================"
echo "Step 2/5: Checking FFmpeg"
echo "========================================"
echo ""

FFMPEG_PATH=""
if command -v ffmpeg &> /dev/null; then
    FFMPEG_PATH=$(which ffmpeg)
    # macOS 'which' might return a shim, realpath resolves it
    FFMPEG_PATH=$(realpath "$FFMPEG_PATH" 2>/dev/null || echo "$FFMPEG_PATH")
    
    echo "[OK] FFmpeg found."
    echo "     Path: $FFMPEG_PATH"
else
    # Check common locations manually if not in PATH
    if [ -f "/opt/homebrew/bin/ffmpeg" ]; then
        FFMPEG_PATH="/opt/homebrew/bin/ffmpeg"
        echo "[OK] FFmpeg found at /opt/homebrew/bin/ffmpeg"
    elif [ -f "/usr/local/bin/ffmpeg" ]; then
        FFMPEG_PATH="/usr/local/bin/ffmpeg"
        echo "[OK] FFmpeg found at /usr/local/bin/ffmpeg"
    fi
fi

if [ -z "$FFMPEG_PATH" ]; then
    echo "[MISSING] FFmpeg not found!"
    echo ""
    echo "Please install FFmpeg using Homebrew:"
    echo "brew install ffmpeg"
    echo ""
    echo "Or download a static build and place it in a system PATH."
    echo ""
    echo "Install it, then run this installer again."
    echo ""
    exit 1
fi

echo ""
echo "========================================"
echo "Step 3/5: Installing Demucs"
echo "========================================"
echo ""

echo "Installing/Updating Demucs using $PYTHON_PATH..."
"$PYTHON_PATH" -m pip install -U demucs --quiet

if [ $? -eq 0 ]; then
    echo "[OK] Demucs installed successfully."
else
    echo "[ERROR] Failed to install Demucs."
    echo "Please check your internet connection or Python permissions."
    exit 1
fi

echo ""
echo "========================================"
echo "Step 4/5: Installing Extension Files"
echo "========================================"
echo ""

# Create extension directory
if [ ! -d "$EXTENSION_PATH" ]; then
    echo "Creating extension directory..."
    mkdir -p "$EXTENSION_PATH"
fi

# Copy files
echo "Copying extension files..."

# Safety check for source folders
if [ ! -d "$SOURCE_DIR/client" ]; then
    echo "ERROR: Source 'client' folder missing. Are you running this from the correct folder?"
    exit 1
fi

# Copy contents
cp -R "$SOURCE_DIR/client" "$EXTENSION_PATH/"
cp -R "$SOURCE_DIR/host" "$EXTENSION_PATH/"
cp -R "$SOURCE_DIR/CSXS" "$EXTENSION_PATH/"

# Copy optional debug file if exists
[ -f "$SOURCE_DIR/.debug" ] && cp "$SOURCE_DIR/.debug" "$EXTENSION_PATH/"
[ -f "$SOURCE_DIR/README.md" ] && cp "$SOURCE_DIR/README.md" "$EXTENSION_PATH/"
[ -f "$SOURCE_DIR/UPDATE_DEPENDENCIES.sh" ] && cp "$SOURCE_DIR/UPDATE_DEPENDENCIES.sh" "$EXTENSION_PATH/"

# Fix permissions
echo "Fixing permissions..."
chmod -R 755 "$EXTENSION_PATH"
[ -f "$EXTENSION_PATH/UPDATE_DEPENDENCIES.sh" ] && chmod +x "$EXTENSION_PATH/UPDATE_DEPENDENCIES.sh"
if [ -n "$SUDO_USER" ]; then
    chown -R "$SUDO_USER:staff" "$EXTENSION_PATH"
fi

echo "[OK] Extension files installed."
echo ""
echo "Enabling CEP Debug Mode..."
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
defaults write com.adobe.CSXS.13 PlayerDebugMode 1
defaults write com.adobe.CSXS.14 PlayerDebugMode 1
defaults write com.adobe.CSXS.15 PlayerDebugMode 1
defaults write com.adobe.CSXS.16 PlayerDebugMode 1
echo "[OK] Debug mode enabled."


echo ""
echo "========================================"
echo "Step 5/5: Auto-Configuration"
echo "========================================"
echo ""

echo "Generating config.json..."

# Create clean JSON content
JSON_CONTENT="{"
JSON_CONTENT="$JSON_CONTENT\"pythonPath\": \"$PYTHON_PATH\","
JSON_CONTENT="$JSON_CONTENT\"ffmpegPath\": \"$FFMPEG_PATH\""
JSON_CONTENT="$JSON_CONTENT}"

# Remove existing config if present
rm -f "$CONFIG_FILE"

# Write new config
echo "$JSON_CONTENT" > "$CONFIG_FILE"
chmod 666 "$CONFIG_FILE" # Ensure readable/writable

if [ -f "$CONFIG_FILE" ]; then
    echo "[OK] Configuration saved to:"
    echo "     $CONFIG_FILE"
    
    # Ensuring permissions are correct for the config file specifically
    if [ -n "$SUDO_USER" ]; then
        chown "$SUDO_USER:staff" "$CONFIG_FILE"
    fi
    chmod 644 "$CONFIG_FILE"
    
    echo ""
    echo "     Detected Settings:"
    echo "     Python: $PYTHON_PATH"
    echo "     FFmpeg: $FFMPEG_PATH"
    echo ""
    echo "     Config Content:"
    cat "$CONFIG_FILE"
else
    echo "[ERROR] Failed to create configuration file."
    exit 1
fi

echo ""
echo "========================================"
echo "Installation Complete!"
echo "========================================"
echo ""
echo "1. Restart Adobe Premiere Pro"
echo "2. Open Window > Extensions > Audio Separator"
echo "3. Run UPDATE_DEPENDENCIES.sh later to refresh Demucs/FFmpeg"
echo ""
