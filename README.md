# CCRM

CCRM is a React + TypeScript + Vite single-page CRM with a small PHP/MySQL
backend, distributed as an updatable Composer package.

## Installation & Git Integration Tutorial

This guide walks you through setting up a host PHP application, integrating CCRM via Composer, and configuring your Git repository to ensure smooth updates without exposing secrets.

### Step 1: Initialize Git in your Host Project
If you are starting a new project, initialize Git in your project root:
```bash
git init
```

### Step 2: Configure Composer for the Repository
To tell Composer where to find the `cstudios-slovakia/ccrm` package, add the Git VCS repository configuration to your host project's `composer.json` (create one with `composer init` if it does not exist yet):

```json
{
    "name": "your-company/your-project",
    "repositories": [
        {
            "type": "vcs",
            "url": "https://github.com/cstudios-slovakia/ccrm.git"
        }
    ],
    "require": {}
}
```

### Step 3: Install the CCRM Package
Run the following command to download the package and run the auto-installation hook:
```bash
composer require cstudios-slovakia/ccrm
```

On `composer install` or `composer update`, the bundled plugin (`CCRM\ComposerPlugin`) automatically:
1. Copies the pre-compiled React frontend and PHP API files from the package's `dist/` directory into your project's **web document root**.
2. Applies idempotent database migrations.

### Step 4: Configure the Installation Destination (Optional)
By default, CCRM auto-detects standard web directories like `public`, `web`, `public_html`, etc. If you want to specify a custom target directory (for instance, a subfolder), configure it in your `composer.json` under `extra`:

```json
{
    "extra": {
        "ccrm-install-dir": "public/crm"
    }
}
```
*Alternatively, you can specify the absolute target path by setting the `CCRM_INSTALL_DIR` environment variable.*

### Step 5: Configure Git Ignored Files
Because CCRM generates dynamic local configuration files and stores uploaded media on the host server, you must add them to your host project's `.gitignore` file to avoid committing credentials:

```gitignore
# Ignore CCRM environment & database configuration
public/config.php
public/api_key.txt

# Ignore user media uploads
public/uploads/

# Standard composer and node directories
vendor/
node_modules/
```

### Step 6: Run the Web Setup Wizard
1. Open your host application URL in a web browser (e.g. `http://localhost/` or the configured subfolder path).
2. The CCRM setup wizard will automatically display.
3. Enter your MySQL database credentials (host, port, username, password, database name).
4. Follow the prompt to either **Seed with Demo Data** (recommended for testing/demos) or **Start Fresh**.
5. Create your system administrator account.

Once completed, the wizard writes `config.php` locally and disables itself. Future updates via `composer update` will preserve this configuration file automatically!

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
