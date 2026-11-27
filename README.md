# Koperniq

> **Names.** The product is **Koperniq**. The command line is `php kprnq` (it used to be
> `php ccrm`). `php ccrm …` still works: that file only forwards to `kprnq`, so a server that
> has not updated yet runs `php ccrm update` once and every later update uses `php kprnq update`.
> Visible names come from two variables, never from hardcoded text: the product name
> (`PRODUCT_NAME` in `src/utils/brand.ts`, `KOPERNIQ_PRODUCT_NAME` in `public/api/brand.php`) and the
> company's own system title (Settings → System title). See `docs/BRANDING.md`.

Koperniq is a React + TypeScript + Vite single-page app for sales, projects and operations,
with a small PHP/MySQL backend.

There are two different setups depending on what you're doing — don't mix
them up:

- **Local development**: run the frontend with hot-reload against a Docker
  backend. No git deploy involved.
- **Production deployment**: the app is deployed by cloning this repo
  directly into the server's web document root and pulling updates with
  `git`/`php kprnq update` — there is no build step on the server.

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

   It also proxies `/waai-api/*` to WAAI's module API (`/api/ccrm/v1/*` on the
   WAAI web app, `http://localhost:3000` unless `WAAI_DEV_URL` says otherwise)
   for the native WhatsApp module. The module's design is
   `docs/WAAI-NATIVE-MODULE.md`; `npm run sync:waai-contract` copies WAAI's API
   contract (`WAAI_REPO` names the WAAI checkout when it is not next to this one).
5. Open the printed `localhost` URL. Since `config.php` already points at a
   real (empty) database, the setup wizard skips straight to **Seed with
   Demo Data** / **Start Fresh** and admin-account creation.

## Demo mode

Choosing **Demo** in the setup wizard installs a fictional company, **Lapidea** (a stone, quartz and
sintered-stone worktop studio), with every module filled: leads, clients, projects, offers, invoices,
orders, warehouse, finance, employees, time tracking, service tickets, e-mail, WhatsApp, AI meeting room,
automations (with run history), SAI, social posts and newsletter campaigns (two sent, one draft). The story, cast and numbers are one file:
[`docs/DEMO-MODE.md`](docs/DEMO-MODE.md). The WhatsApp module shows demo chats on a demo instance without WAAI
(an in-browser fake; nothing is sent anywhere): [`docs/WHATSAPP-DEMO-MODULE.md`](docs/WHATSAPP-DEMO-MODULE.md).

**You choose two things in the wizard** (step 2, when *Demo* is selected):

- **Demo data language** - Slovenčina, Magyar or English. It becomes the system language, so names,
  addresses, company IDs, VAT rate, phone formats and every text are those of that country
  (Lapidea s.r.o. in Slovakia, Lapidea Kft. in Hungary, Lapidea Stone Inc. in the USA).
- **Currency** - EUR, HUF, CZK, PLN, USD or GBP, independent of the language (a Hungarian company invoicing in
  EUR still charges 27 % VAT). Defaults: Slovak EUR, Hungarian HUF, English USD. Amounts are converted from
  one set of EUR figures with fixed demo rates, and every document total is recomputed from its items.

Both can be changed later in **Settings › Company › Language & currency** (this changes the setting, not the
demo rows - use *Re-seed* below for that).

**Logins** - the password is `password` for all of them. The login screen in demo mode lists the users, so
nobody has to remember the addresses.

| Role | Slovak edition | Hungarian edition | English edition |
|---|---|---|---|
| Owner (admin) | `andrej.kollar@lapidea.example` | `kollar.andras@lapidea.example` | `alex.morgan@lapidea.example` |
| Production & projects | `simona.hudecova@lapidea.example` | `szabo.szilvia@lapidea.example` | `samantha.reed@lapidea.example` |
| Showroom sales | `juraj.benko@lapidea.example` | `juhasz.janos@lapidea.example` | `jordan.hayes@lapidea.example` |

**Re-seed** replaces the demo rows (and only those: a lead, offer or user you created by hand is kept, with a
dangling link if it pointed at a demo row) and the three demo logins, in the language and currency you pick.
Use it to bring an older demo up to date (a new module's data appears) or to switch edition:

- in the app: **Settings › System › Re-seed demo data** (visible in demo mode only; pick language and
  currency, hold the button; the result lists every module's row count or error, then the app returns to the
  demo login picker);
- from the command line: `php kprnq demo:seed --lang=hu --currency=EUR` (`--keep-company` keeps the company
  profile, divisions and pipeline lists; `--only=time,sai` seeds some modules; `--force` runs it on an
  instance that is not in demo mode and switches demo mode on).

**Wipe demo data** (Settings › System) is the other way out: it leaves demo mode and empties the CRM for real
use (every lead, project, task, document, ticket, time entry and automation log, not only the demo ones).
Choosing to keep the configuration keeps the settings and every login; otherwise everything is replaced by a
fresh install with one admin and a random password shown once.

Demo data is written only by the installer, the re-seed and the CLI - never by a database migration, so an
update never adds demo rows to a real installation.

## Production Deployment

The two live instances (laminam.sk, strechyokoc.sk) are both deployed by
cloning this repo straight into the server's document root — **not** by
requiring it as a Composer dependency of a separate host project. There is no
Node/Vite build step on the server; the compiled frontend is built locally
and committed to `dist/`, then published to the docroot by `php kprnq update`.

### First-time install on a new server

1. Prerequisites: SSH access to the host; a MySQL/MariaDB database + user
   already created; PHP ≥ 8.2 (8.5 recommended) with the `pdo_mysql`,
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
   php kprnq update
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
php kprnq update
```
Checks the licence, pulls `origin/main`, runs `composer install`, publishes
`dist/` over the docroot, and runs DB migrations — see the `ccrm` script at the
repo root.

This is the only update path today, and it needs an SSH session on the host.
A design for updating from a button in the UI (and on a schedule) — feasibility,
risks and a staged implementation plan — is written up in
[`docs/in-app-updates.md`](docs/in-app-updates.md). **Not implemented yet.**

#### Tracking a different branch on a non-production box

An install updates from **the branch it has checked out**, so a box put on a
feature branch keeps following that branch with a plain `php kprnq update` — no
configuration needed. Production sits on `main`, so nothing changes there.

Every run echoes where the choice came from:

```
Deploy branch: 1.9-jackfruit (checked-out branch)
```

To pin a box to a branch other than the one checked out, record it in the
checkout's own git config:

```bash
git config ccrm.deployBranch 1.6-grapefruit-fix
php kprnq update      # -> Deploy branch: 1.6-grapefruit-fix (git config ccrm.deployBranch)
```

Prefer this over `export CCRM_DEPLOY_BRANCH=...` in `~/.bashrc`: an environment
variable is invisible to cron and to the shell you exported it in, so the next
plain `php kprnq update` silently reverts to the old branch. `git config` lives
with the checkout and holds for every invocation. Undo it with
`git config --unset ccrm.deployBranch`.

`CCRM_DEPLOY_BRANCH=<branch>` **outranks the git config**, as a one-off override
for a single run:

```bash
CCRM_DEPLOY_BRANCH=main php kprnq update
```

That precedence is also the one way `git config ccrm.deployBranch` appears not to
work: if the variable is exported in the shell (a profile, a wrapper script, a
leftover `export` from an earlier session) it wins on every run in that shell,
and the echoed source line says so:

```
Deploy branch: 1.9-jackfruit (CCRM_DEPLOY_BRANCH)
```

If that source is `CCRM_DEPLOY_BRANCH` when you expected your git config, the
update now prints a warning naming both values. `unset` alone is **not enough**:
it only clears the current shell, and the profile line that exports the variable
sets it again at the next login. Find that line, delete it, then unset:

```bash
grep -n CCRM_DEPLOY_BRANCH ~/.bashrc ~/.bash_profile ~/.profile ~/.zshrc
sed -i '/CCRM_DEPLOY_BRANCH/d' ~/.bashrc   # the file(s) the grep listed
unset CCRM_DEPLOY_BRANCH                   # clear the current shell too
php kprnq update      # -> Deploy branch: main (git config ccrm.deployBranch)
```

The pull is **fast-forward only**. A deployment checkout has no history of its
own, so anything else means the checkout and the branch have genuinely diverged
— the update stops and says which branch it is on versus which one it was told
to pull, instead of merging an unrelated branch into a live site.

### Licensing

An installation needs a valid licence key **to receive updates**. That is the
only thing a licence controls: nothing in the running CRM is disabled by an
expired, missing, or revoked licence, and a lapsed customer keeps a fully
working app. Ahead of expiry the app shows a dismissible banner, and Settings →
Licence is where a key is entered.

```bash
php kprnq license status              # what is installed, and does it allow updates
php kprnq license set <key-or-token>  # activate
php kprnq license check               # force a re-check with the licence server
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
npm run test:qa           # audit the app in a real browser (scoped; a full run needs test:qa:full)
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
audit finds a HIGH-severity defect, and GitHub Actions runs it on pull requests
and on pushes to `main`.

## Development

The database DDL lives in a single source of truth: `public/api/schema.php`,
copied into `dist/api/schema.php` by `npm run build` (the PHP API and
`.htaccess` live in `public/` and are copied into `dist/` on build).

