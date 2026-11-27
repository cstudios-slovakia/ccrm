#!/usr/bin/env bash
# Fill WAAI with the WhatsApp demo (4 chats, messages, voice note, images, tasks, summaries) so the
# WhatsApp module is populated on a demo install, with no WhatsApp account connected. The CRM side of
# the demo (links, number checks, tasks, timeline) is written by the CRM's own demo seeder.
# Run from the stack directory (where docker-compose.yml and .env live), after the WAAI overlay is up.
#
#   ./seed-waai-demo.sh           load (safe to repeat)
#   ./seed-waai-demo.sh --wipe    remove it again ("wipe demo data" in the CRM cannot reach WAAI, so do this too)
set -euo pipefail
cd "$(dirname "$0")"

CCRM_DIR="${CCRM_DIR:-/srv/ccrm}"
WAAI_WEB="${WAAI_WEB:-waai-web-1}"
DATA="$CCRM_DIR/api/demo_seed/whatsapp_demo.json"
MODE="${1:-}"

set -a; . ./.env; set +a
sql() { docker compose exec -T -e MYSQL_PWD="$DB_ROOT_PASSWORD" db mysql -uroot -N ccrm -e "$1"; }

# Demo data on a real installation would be a mess to clean up; refuse unless the CRM is in demo mode.
if [ "$(sql "SELECT \`value\` FROM system_settings WHERE \`key\` = 'DEMO_MODE'" | tr -d '\r')" != "true" ]; then
  echo "seed-waai-demo: the CRM is not in demo mode, nothing loaded." >&2
  exit 1
fi
[ -f "$DATA" ] || { echo "seed-waai-demo: $DATA not found (update the CRM first)." >&2; exit 1; }

# Task and summary text follows the CRM's install language, like the rest of the demo data.
LANG_CODE="$(sql "SELECT \`value\` FROM system_settings WHERE \`key\` = 'SYSTEM_LANGUAGE'" | tr -d '\r')"
case "$LANG_CODE" in en|sk|hu) ;; *) LANG_CODE=sk ;; esac

ARGS=(--data - --lang "$LANG_CODE")
[ "$MODE" = "--wipe" ] && ARGS+=(--wipe)

docker exec -i "$WAAI_WEB" node apps/web/scripts/seed-demo-ccrm.mjs "${ARGS[@]}" < "$DATA"
