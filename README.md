# CCRM

CCRM is a React + TypeScript + Vite single-page CRM with a small PHP/MySQL
backend.

There are two different setups depending on what you're doing — don't mix
them up:

- **Local development**: run the frontend with hot-reload against a Docker
  backend. No git deploy involved.
- **Production deployment**: the app is deployed by cloning this repo
  directly into the server's web document root and pulling updates with
  `git`/`php ccrm update` — there is no build step on the server.

**New here?** Read [Local Development Setup](#local-development-setup), then
**[docs/TESTING.md](docs/TESTING.md)** — how to run the tests, what they cover
and where the results go.

## Local Development Setup

1. Clone the repo and install JS dependencies:
   ```bash
   git clone https://github.com/cstudios-slovakia/ccrm.git
   cd ccrm
   npm install
   ```
2. Create your local backend config from the sample and point it at the
   Docker Compose database (service name `db`, credentials from
   `docker-compose.yml`):
   ```bash
   cp config.sample.php config.php
   ```
   Edit `config.php`: `DB_HOST` = `db`, `DB_NAME` = `ccrm`, `DB_USER` =
   `ccrm_user`, `DB_PASS` = `ccrm_password` (or whatever you changed those to
   in `docker-compose.yml`).
3. Start the PHP/MySQL backend in Docker (Apache+PHP on `:8080`, MySQL on
   `:3306`, a MariaDB vector store on `:3307` for the RAG/AI features):
   ```bash
   docker compose up -d --build
   ```
4. Start the Vite dev server:
   ```bash
   npm run dev
   ```
   `vite.config.ts` proxies `/sync.php`, `/upload.php` and `/api/*` from the
   dev server to the Docker container on `:8080`, so the app behaves like
   production while the frontend still gets full HMR.
5. Open the printed `localhost` URL. Since `config.php` already points at a
   real (empty) database, the setup wizard skips straight to **Seed with
   Demo Data** / **Start Fresh** and admin-account creation.

## Production Deployment

The two live instances (laminam.sk, strechyokoc.sk) are both deployed by
cloning this repo straight into the server's document root — **not** by
requiring it as a Composer dependency of a separate host project. There is no
Node/Vite build step on the server; the compiled frontend is built locally
and committed to `dist/`, then published to the docroot by `php ccrm update`.

### First-time install on a new server

1. Prerequisites: SSH access to the host; a MySQL/MariaDB database + user
   already created; PHP ≥ 8.0 (8.2+ recommended) with the `pdo_mysql`,
   `imap`, `zip` and `curl` extensions enabled; `git` and `composer`
   available over SSH.
2. SSH in and clone directly into the (empty) docroot — this folder **is**
   the install target, not a parent of it:
   ```bash
   cd /path/to/docroot
   git clone https://github.com/cstudios-slovakia/ccrm.git .
   ```
3. Install PHP dependencies (generates `vendor/autoload.php`; the package
   itself has no third-party dependencies):
   ```bash
   composer install --no-dev
   ```
4. **Publish the built frontend + backend into the docroot.** A fresh clone's
   root `index.html` is the Vite *dev* entry (`<script src="/src/main.tsx">`),
   which a browser can't execute — you'll get a blank white page if you skip
   this. `dist/*.php` (sync.php, api/, `.htaccess`) are also git-ignored and
   don't exist yet on a bare clone. Run the update script once to fix both —
   it refreshes `dist/` from `public/` and copies `dist/` over the docroot
   root:
   ```bash
   php ccrm update
   ```
   (`git pull` will just report "already up to date" on a fresh clone —
   that's fine, the publish + migrate steps are what you need here.)
5. Make sure the web server user can write to the docroot root (the setup
   wizard creates `config.php`/`api_key.txt` there) and to `uploads/`.
6. Confirm `mod_rewrite` and `mod_headers` are enabled — the shipped
   `.htaccess` uses both for SPA routing, security headers, and blocking
   `.git/`.
7. Open the site URL in a browser. The setup wizard (`api/setup.php`)
   displays automatically:
   - Enter your MySQL host/port/name/username/password — it test-connects.
   - It writes `config.php` and applies the schema migrations.
   - Choose **Seed with Demo Data** or **Start Fresh**.
   - Create your system administrator account.

   `config.php`, `api_key.txt` and `uploads/` are git-ignored, so future
   updates never touch them.

### Shipping updates after the first install

From your machine:
```bash
npm run deploy
```
(`scripts/deploy.mjs`) builds `dist/`, commits it, pushes your working
branch, then advances `main` (the branch the server pulls).

On the server:
```bash
php ccrm update
```
Checks the licence, pulls `origin/main`, runs `composer install`, publishes
`dist/` over the docroot, and runs DB migrations — see the `ccrm` script at the
repo root.

This is the only update path today, and it needs an SSH session on the host.
A design for updating from a button in the UI (and on a schedule) — feasibility,
risks and a staged implementation plan — is written up in
[`docs/in-app-updates.md`](docs/in-app-updates.md). **Not implemented yet.**

### Licensing

An installation needs a valid licence key **to receive updates**. That is the
only thing a licence controls: nothing in the running CRM is disabled by an
expired, missing, or revoked licence, and a lapsed customer keeps a fully
working app. Ahead of expiry the app shows a dismissible banner, and Settings →
Licence is where a key is entered.

```bash
php ccrm license status              # what is installed, and does it allow updates
php ccrm license set <key-or-token>  # activate
php ccrm license check               # force a re-check with the licence server
```

The licence server is a Craft CMS channel plus a small module, and its answers
are cryptographically signed — so neither a substituted licence server nor an
edit to the CCRM database can mint a licence, and a vendor outage does not stop
a valid customer updating. Full architecture and setup:
[`docs/licensing/README.md`](docs/licensing/README.md).

**A shipped build must have `CCRM_LICENSE_PUBLIC_KEY` filled in** (in both
`api/license_client.php` and `public/api/license_client.php`). While it is
empty the product reports "licensing is not configured", shows no banner and
gates nothing.

### Legacy: Composer-package consumption

This repo can still be required as a Composer dependency of a separate host
PHP project — `src-php/ComposerPlugin.php` copies `dist/` into the host's
detected (or configured, via `extra.ccrm-install-dir`/`CCRM_INSTALL_DIR`) web
root and applies migrations on `composer install`/`update`. This was the
original distribution design, but it is **not** how either current
production instance is deployed, and it isn't actively exercised anymore —
retest it before relying on it if you need this path.

## Security notes

- Authentication is verified server-side (`api/login.php`) and uses a PHP
  session; password hashes are never sent to the browser.
- Mutating endpoints require an authenticated session; destructive/admin
  operations require the admin role.
- `config.php`, `api_key.txt` and `uploads/` are git-ignored. Never commit real
  credentials.

## Testing

Full guide: **[docs/TESTING.md](docs/TESTING.md)**.

```bash
npm run test:qa:setup     # once per machine - downloads Chromium
npm run test:qa           # audit the app in a real browser
npm run test:unit         # fast unit tests
npm test                  # both
```

Two suites:

- **Unit tests** (`npm run test:unit`) — plain `node --test` over
  `src/**/*.test.ts`. No dependencies, runs in under a second.
- **QA audit** (`npm run test:qa`) — Playwright drives the real app in Chromium
  and reports every action whose **actual** result differed from its
  **expected** result, with a screenshot and a proposed fix. Covers navigation,
  every module, tabs, drill-downs, create/edit forms and every dropdown.

The QA suite mocks `/sync.php`, `/api/*` and `/upload.php` and seeds its own
data, so it needs **no Docker, no PHP and no database** — just the Vite dev
server, which it starts for you. It never touches a real backend.

Results are saved per run under `test-results/runs/<timestamp>-<kind>/`
(report + findings + screenshots, self-contained), with the latest always at
`test-results/qa-audit-report.md`. The verdict prints in your terminal as soon
as the run ends; reopen it any time with `npm run test:qa:report`.

**When to run it:** any time you like, and always when you finish a feature or
a fix. It also runs automatically — `npm run deploy` refuses to ship if the
audit finds a HIGH-severity defect, and GitHub Actions runs it on every push
and pull request.

## Development

The database DDL lives in a single source of truth: `public/api/schema.php`,
copied into `dist/api/schema.php` by `npm run build` (the PHP API and
`.htaccess` live in `public/` and are copied into `dist/` on build).

