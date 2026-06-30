#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(pwd)"
CLI_LOCATION="${ROOT_DIR}/cli/decky"

if ! test -x "${CLI_LOCATION}"; then
    echo "Decky CLI not found at ${CLI_LOCATION}. Run .vscode/setup.sh first."
    exit 1
fi

echo "Building plugin in ${ROOT_DIR}"
"${CLI_LOCATION}" plugin build "${ROOT_DIR}"
