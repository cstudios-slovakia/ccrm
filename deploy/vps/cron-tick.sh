#!/usr/bin/env bash
# One scheduler tick: processes timer workflows, the workflow queue and task
# reminders (api/cron.php). Run every minute from the host crontab.
# The token is the "cronToken" in the CRM's automation settings; put it in .env
# as CCRM_CRON_TOKEN once the app is installed.
set -euo pipefail
cd "$(dirname "$0")"

token="$(grep -E '^CCRM_CRON_TOKEN=' .env | cut -d= -f2- || true)"
[ -n "$token" ] || exit 0   # not configured yet

# Call Apache inside the container directly: no TLS round trip, no Caddy.
docker compose exec -T web curl -fsS -m 55 -o /dev/null \
  -H 'Host: localhost' "http://127.0.0.1/api/cron.php?token=${token}"
