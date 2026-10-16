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
sudo mkdir -p /srv/ccrm /srv/ccrm-backups /srv/ccrm-ssh
sudo chown 33:33 /srv/ccrm /srv/ccrm-backups

# 2. Stack files (copy deploy/vps from the repo), then configure.
cd /opt/ccrm-stack && cp .env.example .env && nano .env   # passwords + domain
chmod +x *.sh

# 3. Deploy key for the private GitHub repo (read-only), plus known_hosts.
ssh-keygen -t ed25519 -N '' -f /srv/ccrm-ssh/id_ed25519 -C ccrm-vps   # sudo
ssh-keyscan github.com | sudo tee /srv/ccrm-ssh/known_hosts
#    -> add /srv/ccrm-ssh/id_ed25519.pub as a read-only Deploy key on the repo
sudo chown -R 33:33 /srv/ccrm-ssh && sudo chmod 600 /srv/ccrm-ssh/id_ed25519

# 4. Start the databases, then clone as www-data and publish.
docker compose up -d --build db vector_db web
docker compose exec -u www-data web git clone -b 1.12-mango git@github.com:cstudios-slovakia/ccrm.git .
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
