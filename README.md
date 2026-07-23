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
Pulls `origin/main`, runs `composer install`, publishes `dist/` over the
docroot, and runs DB migrations — see the `ccrm` script at the repo root.

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

## Development

The database DDL lives in a single source of truth: `public/api/schema.php`,
copied into `dist/api/schema.php` by `npm run build` (the PHP API and
`.htaccess` live in `public/` and are copied into `dist/` on build).

---

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
