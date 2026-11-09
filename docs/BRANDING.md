# Branding: product name and system title

Two names, kept apart on purpose. Think Craft CMS: the product is always "Craft CMS", while an
installation can carry its own site name.

| | Product name | System title |
|---|---|---|
| Example | **Koperniq** | **Lapidea** (the demo company) |
| Meaning | what the software is | whose installation this is |
| Who sets it | us, in code | the company, Settings → System title |
| Frontend | `PRODUCT_NAME` in `src/utils/brand.ts` | `useSystemTitle()` / `getSystemTitle()` |
| Backend | `KOPERNIQ_PRODUCT_NAME` in `public/api/brand.php` | `kprnq_resolve_title()` |
| Stored | nowhere | `system_settings.SYSTEM_NAME`, `""` = none |

An empty title means the install has none, and wherever a title is wanted the product name stands in.
**Never store the product name as a title:** a stored copy stops following a future rename.

"CRM" is not a name for the product (it is no longer only a CRM). It stays only as the name of
the leads/clients function, e.g. the "Operations & CRM" module group.

## Where each one shows

| Place | Shows |
|---|---|
| Sidebar's top button, the Start menu heading, the profile footer | **Koperniq** |
| Every hint, guide, warning, confirmation, empty state, Settings text, the installer | **Koperniq** |
| Login: "Continue to…", "contact your administrator" | **Koperniq** |
| Exception report, API errors, AI prompts, e-mail subjects, push text, CLI output | **Koperniq** |
| Page header (top bar), dashboard subtitle, loading splash, client registration drawer | **title** |
| Login heading (with a small "Koperniq" line below it when there is a title) | **title** |
| Browser tab, installed-app name (PWA `name`), pop-out window | **"Lapidea (Koperniq)"**; with no title just "Koperniq" |
| PWA home-screen label (`short_name`, `apple-mobile-web-app-title`) | **title** |
| MCP `initialize` reply `instructions` and the MCP prompt text | **title** |

## How to write a visible string

- Frontend: `` `Open ${PRODUCT_NAME} settings` `` (import from `utils/brand`). In a translation table, `{product}`
  and `{title}` are filled by `getTranslation()` / `withBrand()`.
- Backend: `'… ' . KOPERNIQ_PRODUCT_NAME . ' …'` after `require_once` of `api/brand.php`.
- Never write the literal name in a new string. The only literals are the files that cannot import a
  constant (`index.html`, `public/manifest.json`, `public/api/brand.php`); `brand.test.ts` keeps them honest.

## What deliberately still says "ccrm"

Nothing a person reads. Identifiers stay: function and variable names, `ccrm_*` localStorage keys,
the `CCRMSESSID` cookie, `CCRM_*` environment variables, database and repository names, the
`/api/ccrm/v1` WAAI contract, the `ccrm.deployBranch` git config key, and the licence token's
`"product": "ccrm"`.

### The command line

`php kprnq <command>` (`update`, `migrate`, `license`, `demo:seed`, …). `php ccrm …` still works: the
`ccrm` file only forwards to `kprnq`. A server that has not updated yet runs `php ccrm update` once;
deploy tooling (`scripts/deploy.mjs`, `deploy/vps/update.sh`) keeps calling `php ccrm update` for that
reason, until every installation has the new file.

### Licence keys

New keys read `KPRNQ-XXXX-XXXX-XXXX-XXXX`. Keys issued before the rename (`CCRM-…`) stay valid and are
never rewritten; `ccrm_license_normalize_key()` re-hyphenates both shapes.

### MCP

Existing connections keep working without reconnecting or editing any client setting. These stay as
they are, because clients may have stored them: the server id the user chose (`ccrm`), the endpoint URL,
the `Authorization` / `X-CCRM-MCP-KEY` headers, `CCRM_API_URL` / `CCRM_MCP_KEY`, every tool name and
parameter, and `serverInfo.name` (`ccrm-mcp-server`). Only plain text changed: tool descriptions say
Koperniq, and `initialize` gained an optional `instructions` field naming the installation.
