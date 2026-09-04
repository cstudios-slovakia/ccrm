# CCRM licensing

How a CCRM installation proves it is entitled to updates, and how to stand the
whole thing up on the Craft CMS side.

> **Status of the Craft half.** Everything under `craft-module/` was written for
> your Craft install but has never been run against it — there was no access to
> that server from where it was written. The CCRM half (verification, storage,
> state machine, seat limit, CLI gate, UI) *is* exercised: see
> [Testing](#testing). Treat the module as a reviewed first draft: read it, run
> it on staging, and expect to adjust field handles to whatever you actually
> create in the control panel.

---

## What a licence controls

Exactly one thing: **whether `php ccrm update` will run.**

Nothing in the running application is disabled by an expired, missing, or even
revoked licence. No feature is hidden, no data is withheld, no login is refused.
A customer whose licence lapsed keeps a fully working CRM; they simply stop
receiving new versions until they renew.

Two smaller consequences follow from the licence, both additive:

- **A banner** appears ahead of the expiry date (and after it), which any user
  can close or silence.
- **A seat ceiling**, if the licence carries one: *new* user accounts are
  refused past `maxUsers`. Accounts that already exist are never touched,
  disabled, or hidden — a downgrade stops the team growing, it does not shrink
  it.

This is a deliberate line. The application holds a customer's operational
database, and no licensing decision — including a bug in this code — is allowed
to stand between them and their own data.

---

## How it works

```
CCRM install                                Craft licence server
────────────                                ────────────────────
POST {action, key, instance, nonce, …}  ──▶  find the entry for `key`
                                             check status / expiry / instances
                                             bind this instance if there is room
                                        ◀──  { token }

token = base64url(claimJson) "." base64url(signature)

verify signature with the compiled-in PUBLIC key
check product / instance / key / nonce / issuedAt
store the whole token in `licenses`
```

The answer is **signed**, and the signature covers the encoded claim exactly as
it arrives on the wire. That has three consequences worth stating plainly:

1. **A fake licence server is useless.** Hijacked DNS, a TLS-terminating proxy,
   or a replacement server cannot mint a licence, because none of them hold the
   private key.
2. **Editing the CCRM database is useless.** The stored token is re-verified from
   scratch on every read, so setting `licenses.expires_at` to 2099 by hand
   changes a display column and nothing else.
3. **A vendor outage is invisible.** Because the cached token carries its own
   proof, the last verified claim stays authoritative while the licence server is
   unreachable. Updates keep working for `CCRM_LICENSE_OFFLINE_DAYS` (30 by
   default) without contact; the application is never affected at all.

Three replay defences, because a signed token is a bearer object:

| Defence | Stops |
|---|---|
| `instance` in the claim | One customer's token pasted into a second install |
| `nonce` echoed in the claim | A recorded old response replayed by a network attacker |
| `issuedAt` must not go backwards | Rolling an install back to a claim from before the licence lapsed |

### The claim

```json
{
  "v": 1,
  "alg": "ed25519",
  "product": "ccrm",
  "key": "CCRM-A1B2-C3D4-E5F6-G7H8",
  "instance": "f8002ac6a048d82fe591249003a6e700",
  "status": "active",
  "issuedAt": "2026-08-28T09:17:34+00:00",
  "expiresAt": "2027-08-28",
  "maxUsers": 10,
  "customer": "Laminam s.r.o.",
  "plan": "standard",
  "warnDays": 30,
  "nonce": "5f3c…"
}
```

`status` is one of `active`, `suspended`, `revoked`. Expiry is decided by CCRM
from `expiresAt` against the **database** clock, not by the server saying
"expired" — one clock, the same rule the rest of the app follows.

---

## Setting it up

### 1. Generate the signing keypair

Run this **on a machine you control**, not in the web root:

```bash
php docs/licensing/craft-module/generate-keypair.php
```

It writes `ccrm-license-private.json` (keep secret, back it up — losing it means
re-issuing every licence) and prints the public key line.

Ed25519 is used when the PHP build has `ext-sodium`; otherwise it falls back to
RSA-2048. Both are supported by the client. Ed25519 produces a much shorter key.

### 2. Compile the public key into CCRM

In **`api/license_client.php` and `public/api/license_client.php`** (they are
byte-identical copies — patch both):

```php
if (!defined('CCRM_LICENSE_PUBLIC_KEY')) {
    define('CCRM_LICENSE_PUBLIC_KEY', 'ed25519:AAAA…');
}
```

Until this holds a real key the product reports **"licensing is not
configured"**: no banner, no seat limit, and `php ccrm update` warns but
proceeds. That is the intended behaviour for an unreleased build, and it is why
this step is not optional for a shipped one.

The value may hold **several** keys, comma or whitespace separated. That is how
a key is rotated: publish the new one alongside the old for one release, re-issue
tokens, then drop the old one.

A single install can override the whole thing from its `config.php`
(`define('CCRM_LICENSE_PUBLIC_KEY', …)` and `CCRM_LICENSE_ENDPOINT`), which is
how you point a staging box at a staging licence server.

### 3. Point CCRM at the licence server

```php
if (!defined('CCRM_LICENSE_ENDPOINT')) {
    define('CCRM_LICENSE_ENDPOINT', 'https://ccrm.softwaresolutions.sk/ccrm-license/validate');
}
```

Must be `https://`. The client refuses anything else, does not follow redirects,
and verifies the certificate.

### 4. Create the Craft channel

Section **`licenses`** (channel), with these custom fields:

| Handle | Type | Notes |
|---|---|---|
| `licenseKey` | Plain Text | The key itself, `CCRM-XXXX-XXXX-XXXX-XXXX`. Unique. |
| `licenseStatus` | Dropdown | `active`, `suspended`, `revoked` |
| `licenseExpiresAt` | Date | Leave empty for a perpetual licence |
| `licenseMaxUsers` | Number | Seat ceiling. `0` or empty = unlimited |
| `licenseCustomer` | Plain Text | Shown in the customer's settings screen |
| `licensePlan` | Plain Text | Free-form label, shown to the customer |
| `licenseMaxInstances` | Number | How many installs may bind. Default 1 |
| `licenseInstances` | Plain Text (multiline) | **Written by the module** — one bound install id per line. Clear it to let a customer re-activate after a rebuild. |
| `licenseWarnDays` | Number | Optional; overrides the 30-day warning window |

The entry **title** is for you, not for the protocol — name it after the
customer.

`licenseInstances` is the field the module writes back to. Leave it editable in
the CP: clearing it is the one-click answer to "we rebuilt the server and now it
says the key is in use elsewhere".

### 5. Install the module

Copy `craft-module/ccrmlicense/` into your Craft project's `modules/` directory,
then register it in `config/app.php`:

```php
return [
    'modules' => [
        'ccrm-license' => \modules\ccrmlicense\CcrmLicense::class,
    ],
    'bootstrap' => ['ccrm-license'],
];
```

Point it at the private key with an environment variable in `.env` — **outside**
the web root:

```
CCRM_LICENSE_PRIVATE_KEY_PATH="/home/you/secrets/ccrm-license-private.json"
```

The module registers the site route `ccrm-license/validate` itself.

Verify with:

```bash
curl -s https://your-craft-site/ccrm-license/validate \
  -H 'Content-Type: application/json' \
  -d '{"action":"validate","product":"ccrm","claimV":1,"key":"CCRM-…","instance":"0123456789abcdef0123456789abcdef","nonce":"test"}'
```

Or, from PowerShell — `curl` there is an alias for `Invoke-WebRequest`, so the
line above silently becomes a GET and Craft answers with its **HTML** 405 page
rather than JSON:

```powershell
$body = '{"action":"validate","product":"ccrm","claimV":1,"key":"CCRM-…","instance":"0123456789abcdef0123456789abcdef","nonce":"test"}'
Invoke-RestMethod -Uri https://your-craft-site/ccrm-license/validate `
  -Method Post -ContentType 'application/json' -Body $body -SkipHttpErrorCheck
```

A healthy answer is `{"success":true,"token":"…"}`. An HTML page instead of
JSON means the request never arrived as a POST; `{"error":"unknown_key"}` means it
did, and only the entry is missing.

### 6. Hand the customer their key

They paste it into **Settings → Licence**, or run:

```bash
php ccrm license set CCRM-A1B2-C3D4-E5F6-G7H8
```

---

## Running it

### On a customer install

```bash
php ccrm license status   # what is installed, and does it allow updates
php ccrm license check    # force a re-check with the licence server now
php ccrm license set <key-or-token>
php ccrm update           # refuses, with an explanation, on an invalid licence
```

Settings → Licence does the same three things in the browser, for admins.

### Issuing an offline token

For an install with no outbound internet, mint a token by hand:

```bash
php docs/licensing/craft-module/mint-offline-token.php \
    --key CCRM-A1B2-C3D4-E5F6-G7H8 \
    --instance f8002ac6a048d82fe591249003a6e700 \
    --expires 2027-08-28 --max-users 10 --customer "Laminam s.r.o."
```

The customer finds their instance id in `php ccrm license status` output on a
configured build, or in `system_settings.LICENSE_INSTANCE_ID`. They paste the
resulting token into the **same field** as a licence key — CCRM tells the two
apart by shape.

An offline token has no nonce, so it is accepted only if its `issuedAt` is not
older than the token already installed. It is still bound to the instance and
still signed.

---

## Operating notes

**Revoking a licence.** Set `licenseStatus` to `revoked`. The install picks it up
on its next check (within `CCRM_LICENSE_REFRESH_HOURS`, 12 by default) and stops
being able to update. Nothing about the customer's running app changes. An
install that never reaches the server again keeps its cached claim for
`CCRM_LICENSE_OFFLINE_DAYS` and then stops authorising updates on that ground
instead.

**A customer rebuilt their server.** Their instance id is new, so binding fails
with `instance_limit`. Clear `licenseInstances` on their entry.

**A customer runs staging + production off one key.** Raise
`licenseMaxInstances`.

**Losing the private key** means every existing token becomes unverifiable at the
next key rotation. Back it up somewhere you would also back up a signing
certificate.

**The seat limit is a floor, not a wall.** If a licence downgrade leaves an
install over its seat count, nobody is locked out — the admin simply cannot add
more until they remove someone or upgrade.

---

## Testing

The CCRM half is exercised two ways:

- `npm run test:unit` — `src/utils/license.test.ts` covers the pure decision
  layer: parsing an untrusted payload, when the banner shows, how dismissals are
  keyed to the situation rather than to the banner, and the seat arithmetic.
- A standalone PHP harness (see the "Verified behaviour" list below) drove
  `api/license_client.php` against a throwaway MySQL database with real
  keypairs, covering both signature algorithms.

Verified behaviour, in both Ed25519 and RSA:

- a well-formed token verifies; one signed by another key does not
- a claim edited after signing is refused
- `alg: none`, and an Ed25519 claim over an RSA signature, are refused
- a token for another product, another install, another key, or an unknown claim
  version is refused
- a replayed response (wrong nonce) and an older token for the same key are
  refused
- hand-editing `licenses.expires_at` or `licenses.max_users` changes nothing;
  mangling `licenses.token` reads as `invalid` and blocks updates
- the state machine: active → expiring → expired, plus revoked and suspended
- a long-unconfirmed licence stays valid for the app but stops authorising
  updates
- the seat ceiling refuses new accounts and leaves existing ones alone
- no licence at all imposes **no** seat limit

The Craft module has not been run. What it does is small and readable; review it
before trusting it with real keys.
