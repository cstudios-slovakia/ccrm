# CCRM on a VPS (Docker)

A production stack for a plain Linux VPS with Docker. The shared-hosting flow
(`git clone` into the docroot, `php ccrm update`) is unchanged — the containers
only provide the runtime it needs.

```
Internet :80/:443 → caddy (auto TLS, HTTP/2+3, zstd/gzip)
   → web (Apache + PHP 8.3, docroot = /srv/ccrm git checkout)
        → db (MySQL 8.4)  → vector_db (MariaDB 11.8, RAG)
host crontab → cron-tick.sh every minute, backup.sh daily
```

Why Apache stays: the repo's `.htaccess` is the security boundary (it denies
`config.php`, `.git`, script execution in `uploads/`, and sets the CSP). Do not
swap in nginx without porting every rule.

## First install

Host prerequisites: Docker + Compose, a DNS name pointing at the VPS, ports
80 and 443 (and 443/udp) reachable from the internet.

```bash
# 1. Directories. The checkout is owned by uid 33 (www-data in the container).
sudo mkdir -p /srv/ccrm /srv/ccrm-backups /srv/ccrm-ssh   # ccrm-ssh: only needed for a private repo
sudo chown 33:33 /srv/ccrm /srv/ccrm-backups

# 2. Stack files (copy deploy/vps from the repo), then configure.
cd /opt/ccrm-stack && cp .env.example .env && nano .env   # passwords + domain
chmod +x *.sh

# 3. Start the databases, then clone as www-data and publish. (A private
#    repo needs a read-only deploy key in /srv/ccrm-ssh and an ssh:// URL.)
docker compose up -d --build db vector_db web
docker compose exec -u www-data web git clone --depth 1 -b 1.12-mango https://github.com/cstudios-slovakia/ccrm.git .
docker compose exec -u www-data web composer install --no-dev
docker compose exec -u www-data web php ccrm update
docker compose up -d caddy
```

Then open `https://<CCRM_DOMAIN>` and run the setup wizard:
DB host `db`, port `3306`, name `ccrm`, user `ccrm_user`, the password from
`.env`. For the vector store use host `vector_db`, name `vector_db`.

Finish with the scheduler and backups:

```bash
# Put the CRM's automation cronToken into .env as CCRM_CRON_TOKEN=..., then:
( crontab -l 2>/dev/null
  echo '* * * * * /opt/ccrm-stack/cron-tick.sh >>/var/log/ccrm-cron.log 2>&1'
  echo '30 2 * * * /opt/ccrm-stack/backup.sh >>/var/log/ccrm-backup.log 2>&1' ) | crontab -
sudo ufw allow 22,80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable
```

## Updating

```bash
/opt/ccrm-stack/update.sh     # backup → php ccrm update → graceful reload
```

Track another branch with
`docker compose exec -u www-data web git config ccrm.deployBranch <branch>`.

## WhatsApp (WAAI) on the same VPS

WAAI runs next to the CRM on a private Docker network (`waai_ccrm`); only Caddy is public.

```bash
docker compose -f docker-compose.yml -f docker-compose.waai.yml up -d
```

- **The module needs no DNS record for WAAI.** The overlay mounts `Caddyfile.waai-routes` into the CRM's
  site block: the browser calls `https://<CCRM_DOMAIN>/waai-api/...` and Caddy forwards it to WAAI's
  module API (`waai-web:3000/api/ccrm/v1/...`). Nothing else of WAAI is reachable that way. Leave the
  module's connection on "Through this CRM" (Settings → Integrations → WhatsApp (WAAI)).
- **WAAI's own address comes later.** When DNS for `WAAI_DOMAIN` points at the server, add
  `-f docker-compose.waai-standalone.yml` (it has no default for `WAAI_DOMAIN`, on purpose). Until then
  Caddy would keep failing the certificate request for it.
- A CRM without WAAI starts as before: without the overlay `waai-web` is never mentioned.
- **First user:** nobody can open WAAI's settings without its address, so map the first administrator with
  `docker compose exec web node apps/web/scripts/map-crm-user.mjs --email <waai-admin-email> --crm-user <crm-user-id>`
  on the WAAI stack (see WAAI's `docs/DEPLOYMENT.md`).
- WAAI needs `CCRM_ORIGIN=https://<CCRM_DOMAIN>` and `CCRM_SSO_SECRET` (from the same settings page).
- Check a changed Caddyfile before restarting: `docker run --rm -e CCRM_DOMAIN=x.example -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2 caddy validate --config /etc/caddy/Caddyfile`
  (add `-v` lines for the overlay files you use).

## Operating notes

- **State lives in four places:** `/srv/ccrm` (config.php, api_key.txt,
  uploads/), the `db_data` and `vector_db_data` volumes, and the `caddy_data`
  volume (certificates). Back up all of them; `backup.sh` covers the main
  database only and stays on this machine until you copy it off.
- **The container user owns the checkout.** Use `sudo` on the host for edits,
  or `docker compose exec -u www-data web ...`.
- **Logs:** `docker compose logs -f web caddy`.
- **Restart policy** is `unless-stopped`, so the stack returns after a reboot
  as long as the Docker service is enabled at boot.
