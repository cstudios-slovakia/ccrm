---
description: What a CCRM licence is allowed to control, and what it must never touch
---

# Licensing

Full architecture and Craft CMS setup: [`docs/licensing/README.md`](../../docs/licensing/README.md).

## 1. A licence gates updates. Nothing else.

An expired, missing, revoked, or unverifiable licence must **never**:

- disable, hide, or degrade a feature
- withhold data, block a login, or lock a user out
- interrupt the user with a modal, or with anything they cannot dismiss

It may only:

- refuse `php ccrm update`
- show the informational banner (`LicenseBanner`)
- refuse the creation of a **new** user past `maxUsers` — never remove, disable
  or hide an account that already exists

This app holds a customer's operational database. No licensing decision,
including a bug in the licensing code, is allowed to stand between them and
their own data. When in doubt, fail open.

## 2. The signed token is the authority

`licenses.token` is re-verified on every read (`ccrm_license_load`). Every other
column in that table is a display copy. **Never make a decision from those
columns** — that is what makes hand-editing the database pointless, and reading
`expires_at` directly would quietly undo it.

## 3. Both copies of the PHP, always

`api/` and `public/api/` are byte-identical, as are `sync.php` and
`public/sync.php`. A licensing change that lands in only one of them ships a
half-applied feature. Same for `CCRM_LICENSE_PUBLIC_KEY`.

## 4. Statuses and errors cross the wire as codes

`api/license.php` answers in stable codes; `src/utils/translations.ts` turns them
into sentences in three languages. Never return a user-facing string from the
backend, and never render a raw server string in the UI.

## 5. Changing the token format

The claim carries `v`. The client refuses any version it does not know, so a
format change means bumping `CCRM_LICENSE_CLAIM_VERSION` **and**
`LicenseSigner::CLAIM_VERSION` together, and re-issuing tokens. Run
`php scripts/test/license-verification.php` afterwards.
