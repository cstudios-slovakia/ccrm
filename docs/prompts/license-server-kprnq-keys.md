# Prompt — licence server: issue `KPRNQ-` keys, keep `CCRM-` keys working

You are working in the **Craft CMS project that serves the Koperniq licence server**
(`https://ccrm.softwaresolutions.sk/ccrm-license/validate`, the `ccrmlicense` module). Read that
project's own `CLAUDE.md` / `AGENTS.md` first; its rules apply to every change you make there.

## Goal

New licence keys are issued as **`KPRNQ-XXXX-XXXX-XXXX-XXXX`** instead of `CCRM-XXXX-XXXX-XXXX-XXXX`.
Every key already issued (`CCRM-…`) keeps validating exactly as before. Nothing about the
protocol changes; only the prefix of newly issued keys and the code that recognises both shapes.

## Context / links

- The product was renamed from "CCRM" to **Koperniq**. The client side is already done in the
  `ccrm-app` repository (`C:\Users\peter\Work\02_Cstudios_Software_Solutions\Other_web_apps\ccrm\ccrm-app`):
  `public/api/license_client.php` `ccrm_license_normalize_key()` accepts and re-hyphenates **both**
  `CCRM` + 16 characters (20 total) and `KPRNQ` + 16 characters (21 total); the Settings placeholder
  shows `KPRNQ-XXXX-XXXX-XXXX-XXXX`. Read `docs/BRANDING.md` there ("Licence keys") and
  `docs/licensing/README.md` (the protocol).
- A **reference copy of the module** is in that repo at `docs/licensing/craft-module/ccrmlicense/`
  (`controllers/ValidateController.php`, `LicenseSigner.php`) and `docs/licensing/craft-module/mint-offline-token.php`.
  The deployed module may have drifted from it: **trust the deployed code, use the reference as a map.**
- The client normalises a pasted key, stores that canonical form, sends it to `validate`, and the
  signed claim you return must carry **the same key, byte for byte** (the client compares them).

## Scope

1. **Key recognition.** Wherever the module normalises a key (in the reference:
   `ValidateController::normalizeKey()`), accept both shapes and re-hyphenate each:
   `CCRM` + 16 chars → `CCRM-XXXX-XXXX-XXXX-XXXX`, `KPRNQ` + 16 chars → `KPRNQ-XXXX-XXXX-XXXX-XXXX`.
   Any other 12–64 character alphanumeric run keeps being accepted and upper-cased, as today.
2. **Key issuing.** Find where new keys are generated (a field default, a Craft event handler, a
   console command, a Twig/CP helper, an order hook; search for `CCRM-` and `random`). New keys get the
   `KPRNQ-` prefix, same random alphabet and length (4 groups of 4) as now. Do not touch how an existing
   entry's key is stored or displayed.
3. **`findLicense()`** must find an entry by its stored key whichever prefix it has. Do not rewrite,
   migrate or re-issue existing keys.
4. **Offline tokens.** Update `mint-offline-token.php` in the deployed project the same way (the reference
   in `ccrm-app/docs/licensing/craft-module/mint-offline-token.php` is updated already).
5. **Wording.** Anything a customer reads that says "CCRM" (the licence e-mail, the key-delivery page,
   CP field instructions/labels) should say **Koperniq**, and the update command is now `php kprnq update`
   (`php ccrm update` still works, it forwards). Change visible text only.
6. **Docs.** Update the module's README/notes: key format, both prefixes valid.

## Out of scope — do not change

- The protocol identifiers: `"product": "ccrm"` in the request and in the signed claim, the route
  `/ccrm-license/validate`, `CLAIM_VERSION`, the claim fields, the signing algorithm and **the signing keypair**.
  The deployed clients check these; changing any of them breaks every installation's licence check.
- Existing entries' keys, statuses, instance bindings, expiry dates.
- Handles of sections/fields (`licenseStatus`, `licenseInstances`, …) and environment variable names
  (`CCRM_LICENSE_PRIVATE_KEY_PATH`).
- Deploying to production. Commit locally and report; Peter deploys.

## Definition of done

- [ ] Unit/feature tests (or, if the project has none, a small script) prove `normalizeKey`: `ccrm-a1b2-c3d4-e5f6-g7h8` → `CCRM-A1B2-C3D4-E5F6-G7H8`; `kprnq a1b2c3d4e5f6g7h8` → `KPRNQ-A1B2-C3D4-E5F6-G7H8`; a 12–64 char legacy shape still passes unchanged apart from upper-casing; garbage → `''`.
- [ ] A key generated now starts with `KPRNQ-` and has 4 groups of 4.
- [ ] `validate` with an existing `CCRM-` key (a copy of a real entry in a dev/staging database, never production data written to) returns the same signed claim shape as before, with that key echoed back unchanged.
- [ ] `validate` with a new `KPRNQ-` key returns a claim with that exact key.
- [ ] `php -l` on every PHP file you touched.
- [ ] Committed locally with a clear message; not pushed, not deployed.

## Pre-existing failures

List known failures with evidence (command, output, commit). Do not fix them unless in scope.
- none known

## Stop and ask when

- The deployed module's key handling differs from the reference in a way that makes "accept both prefixes" unsafe (for example keys are matched by a database index on a normalised column).
- Issuing `KPRNQ-` keys would need a schema, field or migration change you cannot make as an additive, reversible one.
- Any change appears to require touching an item under "Out of scope".
- Two reasonable readings of a requirement give different behaviour.

## Report format

Under 300 words: what changed (files), the commit (hash + subject), each Definition-of-done check with its
result, anything you found that Peter must decide (for example already-issued keys that were never normalised),
and the deploy steps Peter must run.
