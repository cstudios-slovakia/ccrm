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
# Create uploads directory up front with group-write permissions.
sudo mkdir -p /srv/ccrm/uploads /srv/ccrm-backups /srv/ccrm-ssh   # ccrm-ssh: only needed for a private repo
sudo chown -R 33:33 /srv/ccrm /srv/ccrm-backups
sudo chmod 775 /srv/ccrm/uploads

# Prevent git "dubious ownership" warning when inspecting /srv/ccrm as root on the host:
git config --global --add safe.directory /srv/ccrm

# 2. Stack files (copy deploy/vps from the repo), then configure.
# NOTE: Do NOT wrap values in quotes in .env (use DB_PASSWORD=..., not DB_PASSWORD="...").
cd /opt/ccrm-stack && cp .env.example .env && nano .env   # passwords + domain
chmod 600 .env
chmod +x *.sh

# 3. Start the databases, then clone as www-data and publish. (A private
#    repo needs a read-only deploy key in /srv/ccrm-ssh and an ssh:// URL.)
docker compose up -d --build db vector_db web
docker compose exec -u www-data web git clone --depth 1 -b 1.13-nectarine https://github.com/cstudios-slovakia/ccrm.git .
docker compose exec -u www-data web composer install --no-dev
docker compose exec -u www-data web php ccrm update
docker compose up -d caddy
```

### 4. Setup Wizard & Database Configuration

1. Open `https://<CCRM_DOMAIN>` in your browser and run the Setup Wizard:
   - **Database Host:** `db`
   - **Port:** `3306`
   - **Database Name:** `ccrm`
   - **Username:** `ccrm_user`
   - **Password:** the `DB_PASSWORD` value from `/opt/ccrm-stack/.env`
   - Complete the admin account setup.

2. Secure `config.php` permissions on the host:
   ```bash
   sudo chmod 640 /srv/ccrm/config.php
   ```

3. Connect Vector DB (RAG / semantic search):
   - In the CRM, log in as Admin and navigate to **Settings -> Integrations -> Vector DB** (or AI Settings):
     - **Provider:** MariaDB
     - **Host:** `vector_db`
     - **Port:** `3306`
     - **Database:** `vector_db`
     - **Username:** `vector_user`
     - **Password:** the `VECTOR_DB_PASSWORD` value from `/opt/ccrm-stack/.env` (without quotes)
   - Click **Validate & Save** to connect and initialize the RAG vector tables.

### 5. Scheduler, Automations & Backups

Generate the automation cron token, register crontab, and enable firewall:

```bash
# 1. Automatically generate and register the automation cronToken into .env:
TOKEN=$(docker compose exec -T -u www-data web php -r 'require "config.php"; require_once "api/workflows_engine.php"; echo ccrm_load_automation_config(get_db_connection())["cronToken"];')
echo "CCRM_CRON_TOKEN=${TOKEN}" >> /opt/ccrm-stack/.env

# 2. Test the scheduler tick immediately (should exit silently with code 0):
/opt/ccrm-stack/cron-tick.sh

# 3. Schedule minute crons & daily backups on the host:
( crontab -l 2>/dev/null
  echo '* * * * * /opt/ccrm-stack/cron-tick.sh >>/var/log/ccrm-cron.log 2>&1'
  echo '30 2 * * * /opt/ccrm-stack/backup.sh >>/var/log/ccrm-backup.log 2>&1' ) | crontab -

# 4. Enable UFW firewall:
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
