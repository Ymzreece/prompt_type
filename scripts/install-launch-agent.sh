#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h}"
APP_SUPPORT_DIR="${HOME}/Library/Application Support/PromptRewriter"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
PLIST_TEMPLATE="${PROJECT_ROOT}/launchd/com.promptrewriter.server.plist"
PLIST_DEST="${LAUNCH_AGENTS_DIR}/com.promptrewriter.server.plist"
LOG_PATH="${HOME}/Library/Logs/prompt-rewriter.log"
LABEL="com.promptrewriter.server"

mkdir -p "${APP_SUPPORT_DIR}/scripts" "${LAUNCH_AGENTS_DIR}" "${HOME}/Library/Logs"

cp "${PROJECT_ROOT}/server.js" "${APP_SUPPORT_DIR}/server.js"
cp "${PROJECT_ROOT}/scripts/start-server.sh" "${APP_SUPPORT_DIR}/scripts/start-server.sh"
chmod +x "${APP_SUPPORT_DIR}/scripts/start-server.sh"

if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  cp "${PROJECT_ROOT}/.env" "${APP_SUPPORT_DIR}/.env"
fi

APP_SUPPORT_ESCAPED="${APP_SUPPORT_DIR//\//\\/}"
LOG_PATH_ESCAPED="${LOG_PATH//\//\\/}"

sed \
  -e "s/__APP_SUPPORT_DIR__/${APP_SUPPORT_ESCAPED}/g" \
  -e "s/__LOG_PATH__/${LOG_PATH_ESCAPED}/g" \
  "${PLIST_TEMPLATE}" > "${PLIST_DEST}"

plutil -lint "${PLIST_DEST}" >/dev/null

if launchctl print "gui/$(id -u)/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
fi

launchctl bootstrap "gui/$(id -u)" "${PLIST_DEST}"
launchctl kickstart -k "gui/$(id -u)/${LABEL}"

echo "Installed and started ${LABEL}"
