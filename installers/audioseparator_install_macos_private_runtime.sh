#!/bin/bash
set -eu

# // Install the macOS PKG payload into the active user's profile even though Installer runs this script as root.
AUDIOSEP_SCRIPT_DIR="${AUDIOSEP_INSTALLER_SCRIPT_DIR:-$(cd "$(dirname "$0")" && pwd)}"
AUDIOSEP_PAYLOAD_ROOT="${AUDIOSEP_PAYLOAD_ROOT:-${AUDIOSEP_SCRIPT_DIR}/payload}"
AUDIOSEP_RUNTIME_ENV="${AUDIOSEP_RUNTIME_ENV:-${AUDIOSEP_SCRIPT_DIR}/runtime.env}"

if [ ! -f "${AUDIOSEP_RUNTIME_ENV}" ]; then
  echo "Runtime metadata is missing: ${AUDIOSEP_RUNTIME_ENV}" >&2
  exit 1
fi

# // Load generated shell-escaped runtime metadata embedded by the package builder.
. "${AUDIOSEP_RUNTIME_ENV}"

audiosep_resolve_user() {
  # // Resolve the graphical login user so the extension and runtime are not installed into root's home.
  AUDIOSEP_USER="${AUDIOSEP_TEST_USER:-$(stat -f "%Su" /dev/console 2>/dev/null || true)}"
  if [ -z "${AUDIOSEP_USER}" ] || [ "${AUDIOSEP_USER}" = "root" ] || [ "${AUDIOSEP_USER}" = "loginwindow" ]; then
    AUDIOSEP_USER="${SUDO_USER:-}"
  fi
  if [ -z "${AUDIOSEP_USER}" ] || [ "${AUDIOSEP_USER}" = "root" ]; then
    echo "Unable to resolve the macOS login user." >&2
    exit 1
  fi

  AUDIOSEP_UID="$(id -u "${AUDIOSEP_USER}")"
  AUDIOSEP_GID="$(id -g "${AUDIOSEP_USER}")"
  AUDIOSEP_HOME="${AUDIOSEP_TEST_HOME:-$(dscl . -read "/Users/${AUDIOSEP_USER}" NFSHomeDirectory 2>/dev/null | awk '{$1=""; sub(/^ /, ""); print}' || true)}"
  if [ -z "${AUDIOSEP_HOME}" ]; then
    AUDIOSEP_HOME="$(eval echo "~${AUDIOSEP_USER}")"
  fi
}

audiosep_run_as_user() {
  # // Run validation and preferences writes in the resolved user's environment.
  if [ "$(id -u)" -ne 0 ] || [ "${AUDIOSEP_USER}" = "$(id -un)" ]; then
    HOME="${AUDIOSEP_HOME}" USER="${AUDIOSEP_USER}" "$@"
    return
  fi

  if command -v launchctl >/dev/null 2>&1; then
    launchctl asuser "${AUDIOSEP_UID}" sudo -H -u "${AUDIOSEP_USER}" "$@"
  else
    sudo -H -u "${AUDIOSEP_USER}" "$@"
  fi
}

audiosep_json_escape() {
  # // Escape filesystem paths before writing the JSON file consumed by the CEP panel.
  printf "%s" "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

audiosep_install_extension() {
  # // Replace the user-level CEP extension with the payload shipped in the installer.
  source_dir="${AUDIOSEP_PAYLOAD_ROOT}/dist/PremierePro-AudioSeparator"
  dest_dir="${AUDIOSEP_HOME}/Library/Application Support/Adobe/CEP/extensions/PremierePro-AudioSeparator"
  if [ ! -d "${source_dir}" ]; then
    echo "Extension payload is missing: ${source_dir}" >&2
    exit 1
  fi

  mkdir -p "$(dirname "${dest_dir}")"
  replacement_dir="${dest_dir}.new.$$"
  old_dir="${dest_dir}.old.$$"
  ditto "${source_dir}" "${replacement_dir}"
  if [ -e "${dest_dir}" ]; then
    mv "${dest_dir}" "${old_dir}"
  fi
  mv "${replacement_dir}" "${dest_dir}"
  [ ! -e "${old_dir}" ] || rm -rf "${old_dir}"
  chown -R "${AUDIOSEP_UID}:${AUDIOSEP_GID}" "${dest_dir}"
  echo "Audio Separator installed to ${dest_dir}."
}

audiosep_enable_cep_debug_mode() {
  # // Enable unsigned CEP extensions for recent Adobe hosts in the active user's preferences.
  csxs_version=7
  while [ "${csxs_version}" -le 20 ]; do
    audiosep_run_as_user defaults write "com.adobe.CSXS.${csxs_version}" PlayerDebugMode -string "1" >/dev/null 2>&1 || true
    csxs_version=$((csxs_version + 1))
  done
  echo "CEP debug mode enabled for CSXS.7 to CSXS.20."
}

audiosep_runtime_is_current() {
  # // Reuse an installed runtime only when version and all expected tools validate.
  runtime_dir="$1"
  version_file="${runtime_dir}/.audioseparator-runtime-version"
  [ -f "${version_file}" ] || return 1
  [ "$(tr -d '\r\n' <"${version_file}")" = "${AUDIOSEP_RUNTIME_VERSION}" ] || return 1
  [ -x "${runtime_dir}/python/bin/python3" ] || return 1
  [ -x "${runtime_dir}/ffmpeg/bin/ffmpeg" ] || return 1
  audiosep_run_as_user "${runtime_dir}/python/bin/python3" -c "import demucs, torch; print(torch.__version__)" >/dev/null 2>&1 || return 1
  audiosep_run_as_user "${runtime_dir}/ffmpeg/bin/ffmpeg" -version >/dev/null 2>&1 || return 1
  return 0
}

audiosep_install_runtime() {
  # // Extract the bundled private runtime after verifying its immutable SHA-256.
  runtime_dir="$1"
  temp_root="$(mktemp -d "${TMPDIR:-/tmp}/audioseparator-runtime.XXXXXX")"
  archive_path="${AUDIOSEP_SCRIPT_DIR}/runtime/${AUDIOSEP_RUNTIME_ASSET_NAME}"
  extracted_root="${temp_root}/extracted"
  mkdir -p "${extracted_root}"

  if [ ! -f "${archive_path}" ]; then
    rm -rf "${temp_root}"
    echo "Bundled runtime archive is missing: ${archive_path}" >&2
    exit 1
  fi

  actual_hash="$(shasum -a 256 "${archive_path}" | awk '{print tolower($1)}')"
  if [ "${actual_hash}" != "${AUDIOSEP_RUNTIME_SHA256}" ]; then
    rm -rf "${temp_root}"
    echo "Runtime SHA-256 mismatch." >&2
    exit 1
  fi

  tar -xzf "${archive_path}" -C "${extracted_root}"
  new_runtime="${extracted_root}/runtime"
  if [ ! -x "${new_runtime}/python/bin/python3" ] || [ ! -x "${new_runtime}/ffmpeg/bin/ffmpeg" ]; then
    rm -rf "${temp_root}"
    echo "The bundled runtime archive is incomplete." >&2
    exit 1
  fi

  mkdir -p "$(dirname "${runtime_dir}")"
  old_runtime="${runtime_dir}.old.$$"
  if [ -e "${runtime_dir}" ]; then
    mv "${runtime_dir}" "${old_runtime}"
  fi
  mv "${new_runtime}" "${runtime_dir}"
  [ ! -e "${old_runtime}" ] || rm -rf "${old_runtime}"
  rm -rf "${temp_root}"
  chown -R "${AUDIOSEP_UID}:${AUDIOSEP_GID}" "${runtime_dir}"
  echo "Private runtime installed to ${runtime_dir}."
}

audiosep_validate_runtime() {
  # // Validate the runtime tools before exposing their paths to the extension.
  runtime_dir="$1"
  audiosep_run_as_user "${runtime_dir}/python/bin/python3" -c "import demucs, torch; print('demucs runtime ok', torch.__version__)" >/dev/null
  audiosep_run_as_user "${runtime_dir}/ffmpeg/bin/ffmpeg" -version >/dev/null
}

audiosep_write_extension_config() {
  # // Persist exact private-runtime paths in the config file already read by client/app.js.
  runtime_dir="$1"
  extension_dir="${AUDIOSEP_HOME}/Library/Application Support/Adobe/CEP/extensions/PremierePro-AudioSeparator"
  config_file="${extension_dir}/config.json"
  python_path="${runtime_dir}/python/bin/python3"
  ffmpeg_path="${runtime_dir}/ffmpeg/bin/ffmpeg"
  generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  mkdir -p "$(dirname "${config_file}")"
  cat >"${config_file}" <<EOF
{
  "version": 1,
  "generatedBy": "audioseparator_install_macos_private_runtime.sh",
  "generatedAtUtc": "$(audiosep_json_escape "${generated_at}")",
  "pythonPath": "$(audiosep_json_escape "${python_path}")",
  "ffmpegPath": "$(audiosep_json_escape "${ffmpeg_path}")"
}
EOF
  chmod 600 "${config_file}"
  chown "${AUDIOSEP_UID}:${AUDIOSEP_GID}" "${config_file}"
  echo "Runtime config written: ${config_file}"
}

audiosep_resolve_user

AUDIOSEP_RUNTIME_DIR="${AUDIOSEP_HOME}/Library/Application Support/PremierePro-AudioSeparator/runtime"
if [ "${AUDIOSEP_RUNTIME_ARCH}" != "$(uname -m)" ]; then
  echo "Installer runtime architecture ${AUDIOSEP_RUNTIME_ARCH} does not match this Mac ($(uname -m))." >&2
  exit 1
fi

audiosep_install_extension
if [ "${AUDIOSEP_SKIP_CEP_DEBUG:-0}" != "1" ]; then
  audiosep_enable_cep_debug_mode
fi

if audiosep_runtime_is_current "${AUDIOSEP_RUNTIME_DIR}"; then
  echo "Keeping the compatible private runtime already installed."
else
  audiosep_install_runtime "${AUDIOSEP_RUNTIME_DIR}"
fi

audiosep_validate_runtime "${AUDIOSEP_RUNTIME_DIR}"
printf "%s\n" "${AUDIOSEP_RUNTIME_VERSION}" >"${AUDIOSEP_RUNTIME_DIR}/.audioseparator-runtime-version"
chown "${AUDIOSEP_UID}:${AUDIOSEP_GID}" "${AUDIOSEP_RUNTIME_DIR}/.audioseparator-runtime-version"
audiosep_write_extension_config "${AUDIOSEP_RUNTIME_DIR}"

echo "Installation complete. Restart Premiere Pro, then open Window > Extensions > Audio Separator."
