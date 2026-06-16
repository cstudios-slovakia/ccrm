# CCRM

CCRM is a React + TypeScript + Vite single-page CRM with a small PHP/MySQL
backend, distributed as an updatable Composer package.

## Installation (as a Composer package)

```bash
composer require cstudios-slovakia/ccrm
```

On `composer install` / `composer update` the bundled Composer plugin
(`CCRM\ComposerPlugin`) publishes the compiled app + PHP API from the package's
`dist/` into your project's **web document root**, then applies idempotent
database migrations.

### Where it publishes

The web root is resolved in this order:

1. `CCRM_INSTALL_DIR` environment variable (absolute path).
2. `extra.ccrm-install-dir` in your project's `composer.json` (path relative to
   the project root — e.g. `"web"` for Craft/Symfony or `"web/crm"` for a
   subfolder install). The directory is created if missing.
3. Auto-detection of a conventional docroot: `web`, `public`, `public_html`,
   `httpdocs`, `htdocs`, `www`.
4. The project root (last resort).

Your real `config.php` is **never overwritten** by updates, so database
credentials survive `composer update`.

### First run

Open the published app in a browser. If `config.php` does not yet exist you get
the installation wizard (`api/setup.php`), which tests the DB connection, writes
`config.php`, creates the schema, and creates your administrator account
(passwords are stored as bcrypt hashes). The wizard is disabled once installed.

A shipped `.htaccess` sets `DirectoryIndex index.html` so Apache serves the app
instead of any default `index.php` (e.g. a shared-host parking page), and denies
web access to `config.php` / secrets.

## Security notes

- Authentication is verified server-side (`api/login.php`) and uses a PHP
  session; password hashes are never sent to the browser.
- Mutating endpoints require an authenticated session; destructive/admin
  operations require the admin role.
- `config.php`, `api_key.txt` and `uploads/` are git-ignored. Never commit real
  credentials.

## Development

This is a Vite app. `npm install` then `npm run build` regenerates `dist/`
(the PHP API and `.htaccess` live in `public/` and are copied into `dist/` on
build). The database DDL lives in a single source of truth: `public/api/schema.php`.

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
