#!/bin/bash
set -u

# // Launch the local CEP updater without rebuilding the macOS PKG installer.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"${SCRIPT_DIR}/scripts/audioseparator-update-local-macos.sh" "$@"
EXIT_CODE=$?

if [ "${EXIT_CODE}" -ne 0 ]; then
  echo ""
  echo "Local update failed with code ${EXIT_CODE}."
  exit "${EXIT_CODE}"
fi

echo ""
echo "Local update complete. Restart Premiere Pro to reload the panel."
