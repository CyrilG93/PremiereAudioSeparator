#!/bin/bash
set -eu

# // Resolve the repository root from this script location so it works from npm or direct launch.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DESTINATION="${AUDIOSEP_LOCAL_DESTINATION:-${HOME}/Library/Application Support/Adobe/CEP/extensions/PremierePro-AudioSeparator}"
RUNTIME_DIR="${HOME}/Library/Application Support/PremierePro-AudioSeparator/runtime"
CONFIG_FILE="${DESTINATION}/config.json"
DRY_RUN=0

audiosep_info() {
  # // Keep quick-update output readable when launched from Terminal or npm.
  echo "[Audio Separator] $1"
}

audiosep_usage() {
  # // Document the small set of options supported by this developer updater.
  cat <<EOF
Usage: $0 [--destination <path>] [--dry-run]

Copies the current checkout into the user-level CEP extension folder without
rebuilding the macOS PKG. Existing config.json is preserved.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --destination)
      shift
      if [ "$#" -eq 0 ]; then
        echo "Missing value for --destination" >&2
        exit 2
      fi
      DESTINATION="$1"
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    -h|--help)
      audiosep_usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      audiosep_usage >&2
      exit 2
      ;;
  esac
  shift
done

audiosep_assert_source_folder() {
  # // Fail early if the script is not being run from a complete plugin checkout.
  SOURCE_PATH="${REPO_ROOT}/$1"
  if [ ! -d "${SOURCE_PATH}" ]; then
    echo "Missing source folder: ${SOURCE_PATH}" >&2
    exit 1
  fi
}

audiosep_copy_folder_contents() {
  # // Overlay files without deleting the installed config or runtime references.
  SOURCE_PATH="$1"
  TARGET_PATH="$2"

  if [ "${DRY_RUN}" -eq 1 ]; then
    audiosep_info "Would copy ${SOURCE_PATH} -> ${TARGET_PATH}"
    return
  fi

  mkdir -p "${TARGET_PATH}"
  ditto "${SOURCE_PATH}" "${TARGET_PATH}"
}

audiosep_copy_optional_file() {
  # // Keep the local CEP folder close to the installer payload without requiring a full package rebuild.
  FILE_NAME="$1"
  SOURCE_PATH="${REPO_ROOT}/${FILE_NAME}"
  TARGET_PATH="${DESTINATION}/${FILE_NAME}"

  if [ ! -f "${SOURCE_PATH}" ]; then
    return
  fi

  if [ "${DRY_RUN}" -eq 1 ]; then
    audiosep_info "Would copy ${SOURCE_PATH} -> ${TARGET_PATH}"
    return
  fi

  cp -f "${SOURCE_PATH}" "${TARGET_PATH}"
}

audiosep_enable_cep_debug_mode() {
  # // Enable unsigned CEP extensions for current-user Adobe hosts without requiring admin rights.
  if [ "${DRY_RUN}" -eq 1 ]; then
    audiosep_info "Would enable CEP debug mode for CSXS.7 to CSXS.20"
    return
  fi

  CSXS_VERSION=7
  while [ "${CSXS_VERSION}" -le 20 ]; do
    defaults write "com.adobe.CSXS.${CSXS_VERSION}" PlayerDebugMode -string "1" >/dev/null 2>&1 || true
    CSXS_VERSION=$((CSXS_VERSION + 1))
  done
  audiosep_info "CEP debug mode enabled for CSXS.7 to CSXS.20."
}

audiosep_json_escape() {
  # // Escape filesystem paths before writing the JSON file consumed by the CEP panel.
  printf "%s" "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

audiosep_write_runtime_config_if_needed() {
  # // Preserve an installer-generated config; create one only when the quick copy would otherwise miss runtime paths.
  if [ -f "${CONFIG_FILE}" ]; then
    audiosep_info "Keeping existing runtime config: ${CONFIG_FILE}"
    return
  fi

  PYTHON_PATH="${RUNTIME_DIR}/python/bin/python3"
  FFMPEG_PATH="${RUNTIME_DIR}/ffmpeg/bin/ffmpeg"
  if [ ! -x "${PYTHON_PATH}" ] || [ ! -x "${FFMPEG_PATH}" ]; then
    audiosep_info "WARNING: no installed runtime config was found. Run the full macOS installer before using the panel."
    return
  fi

  if [ "${DRY_RUN}" -eq 1 ]; then
    audiosep_info "Would write runtime config for ${RUNTIME_DIR}"
    return
  fi

  GENERATED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  mkdir -p "$(dirname "${CONFIG_FILE}")"
  cat >"${CONFIG_FILE}" <<EOF
{
  "version": 1,
  "generatedBy": "audioseparator-update-local-macos.sh",
  "generatedAtUtc": "$(audiosep_json_escape "${GENERATED_AT}")",
  "pythonPath": "$(audiosep_json_escape "${PYTHON_PATH}")",
  "ffmpegPath": "$(audiosep_json_escape "${FFMPEG_PATH}")"
}
EOF
  chmod 600 "${CONFIG_FILE}"
  audiosep_info "Runtime config written: ${CONFIG_FILE}"
}

audiosep_assert_source_folder "client"
audiosep_assert_source_folder "host"
audiosep_assert_source_folder "CSXS"

audiosep_info "Updating local CEP plugin from ${REPO_ROOT}"
audiosep_info "Destination: ${DESTINATION}"

if [ "${DRY_RUN}" -eq 0 ]; then
  mkdir -p "${DESTINATION}"
fi

audiosep_copy_folder_contents "${REPO_ROOT}/client" "${DESTINATION}/client"
audiosep_copy_folder_contents "${REPO_ROOT}/host" "${DESTINATION}/host"
audiosep_copy_folder_contents "${REPO_ROOT}/CSXS" "${DESTINATION}/CSXS"
audiosep_copy_optional_file ".debug"
audiosep_copy_optional_file "README.md"
audiosep_copy_optional_file "UPDATE_DEPENDENCIES.sh"
audiosep_write_runtime_config_if_needed
audiosep_enable_cep_debug_mode

audiosep_info "Local update complete. Restart Premiere Pro, then open Window > Extensions > Audio Separator."
