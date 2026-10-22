#!/usr/bin/env bash
# Daily database backup (cron) and pre-update snapshot (update.sh).
# Wraps scripts/backup/db_backup.php, which dumps the CRM database to
# $CCRM_BACKUP_DIR (/backups in the container = /srv/ccrm-backups on the host)
# and prunes automatic dumps older than 14 days.
#
# This is a LOCAL backup: it does not survive losing the VPS. Copy
# /srv/ccrm-backups and /srv/ccrm/uploads off the machine as well.
set -euo pipefail
cd "$(dirname "$0")"

# No config.php yet = setup wizard not run = nothing to back up.
if ! docker compose exec -T web test -f /var/www/html/config.php; then
  echo "backup: CCRM is not installed yet, skipping."
  exit 0
fi

docker compose exec -T -u www-data -w /var/www/html web php scripts/backup/db_backup.php
