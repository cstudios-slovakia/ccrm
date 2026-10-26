#!/usr/bin/env bash
# Ship the latest code to this VPS: the VPS equivalent of `php ccrm update` over SSH.
# Run from the stack directory (where docker-compose.yml and .env live).
set -euo pipefail
cd "$(dirname "$0")"

CCRM_DIR="${CCRM_DIR:-/srv/ccrm}"

# A pre-update database snapshot, because migrations run as part of the update.
./backup.sh

# www-data owns the checkout, so git, composer and the publish step run as it.
docker compose exec -T -u www-data web php ccrm update

# Pick up new PHP files in OPcache without dropping connections.
docker compose exec -T web apache2ctl graceful

# The stack files themselves ship in the repo. Say so if they changed; do not
# restart the databases behind the operator's back. health-log.sh is a per-host
# helper (it hardcodes the host name), so it is not part of the comparison.
if ! diff -rq --exclude=.env --exclude='.cron*' --exclude=health-log.sh "$CCRM_DIR/deploy/vps" . >/dev/null 2>&1; then
  echo
  echo "NOTE: deploy/vps/ changed in this release. Review and apply:"
  echo "  diff -r $CCRM_DIR/deploy/vps ."
  echo "  rsync -a --exclude=.env $CCRM_DIR/deploy/vps/ ./ && docker compose up -d --build"
fi
