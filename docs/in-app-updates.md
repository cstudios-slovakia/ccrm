# In-app updates — feasibility and implementation plan

How CCRM could update itself from a button in the UI, and on a schedule, instead
of requiring `php ccrm update` in an SSH session.

> **Status: proposal. Nothing in this document is implemented.** It is a design
> written against the 1.9-jackfruit codebase (v1.9.5) after reading the existing
> updater, licensing client and deploy topology. File references are accurate as
> of that revision — re-check them before starting.

---

## Why

Updates today run through the root [`ccrm`](../ccrm) script over SSH. That works
for the two instances we operate ourselves and is a poor fit for everything
else:

- The app is deployed on **several shared hostings**, and an SSH credential from
  the hosting panel is typically valid for about **an hour** — so shipping a fix
  means asking the customer for fresh credentials first, every time.
- A customer cannot update their own installation at all. There is no path from
  "there is a new version" to "I have the new version" that does not go through
  us.
- Nothing tells an install that it is out of date. The Updates panel shows
  release notes from Craft; it has no idea which version is actually running
  underneath it.

The goal is two things:

1. **A button** — Settings → Updates → *Update now*, with a live log and a clear
   outcome.
2. **Auto-update** — an opt-in, licence-gated, windowed background update, plus
   an always-on *check* that tells the admin a new version exists.

---

## What the codebase already gives us

Four findings that make this much smaller than it looks.

**`composer install` is not on the critical path.** [`composer.json`](../composer.json)
requires only `php` and `composer-plugin-api`; there are no third-party
packages, and `vendor/` is git-tracked — twelve files, all of them the generated
PSR-4 autoloader. The slowest and most failure-prone step of `ccrm_update()` can
be dropped from an in-app update entirely. Regenerating the classmap for
`src-php/` is a short PHP function if we ever need it.

**Signed-artifact verification already exists.** `ccrm_license_verify_signature()`
([`api/license_client.php:237`](../api/license_client.php)) verifies Ed25519 (or
RSA) against `CCRM_LICENSE_PUBLIC_KEY`, which is compiled into every shipped
build. A signed *release manifest* needs no new crypto and no new key — only a
second claim type minted by the same
[`LicenseSigner`](licensing/craft-module/ccrmlicense/LicenseSigner.php).

**The licence server is already the release feed.** Craft already serves the
`updateNotes` section that `UpdateNotesView` renders. Adding "latest version +
artifact URL + sha256 + signature" to
[`ValidateController`](licensing/craft-module/ccrmlicense/controllers/ValidateController.php)
puts the release metadata next to the release notes, behind the same licence
key.

**The throttled-background-check pattern is already written.** `GET api/license.php`
calls `ccrm_license_refresh($pdo, false)` on every request and the function
itself throttles to one real call per `CCRM_LICENSE_REFRESH_HOURS`, absorbing
failures ([`api/license.php:120-127`](../api/license.php)). Auto-*checking* for
updates is that same shape against a different route.

Plus the smaller pieces: [`api/cron.php`](../api/cron.php) with its `cronToken`
for a real host cron, [`scripts/backup/db_backup.php`](../scripts/backup/db_backup.php)
for a pre-migration snapshot, the `system_settings` key/value table for state,
and `sw.js` being network-only (so a plain reload always picks up a new bundle —
no service-worker cache to fight).

---

## The two hard problems

### 1. The updater rewrites the code that is running it

PHP reads the whole entry file into memory before executing, so a script can
survive being overwritten mid-run — but anything it `require`s **after** the
swap is the *new* file running under the *old* bootstrap. We have already been
bitten by the first half of this: commit `b540ae3`'s publish fix only took
effect on the *following* `php ccrm update`, because the run that delivered it
was still executing the old in-memory publish logic, and that run clobbered
`dist/` with a stale `public/index.html` — old frontend against new backend,
which tripped the sync mass-delete guard and blocked every save. See
[the deploy topology notes](#see-also).

The fix is a **hard phase split**, enforced by the process boundary:

| Phase | Does | Runs as |
|---|---|---|
| 1. Preflight | capability probe, licence gate, lock, version check | one request |
| 2. Fetch + stage | download/pull into `.ccrm-update/staging/`, verify | one request (or N resumable steps) |
| 3. Swap | maintenance flag on, back up current tree, move files into place, flag off | one request that does **nothing else afterwards** |
| 4. Migrate | `ccrm_apply_schema()` + post-update tasks | a **new** request, new PHP process, new code |

Phase 3 must not migrate, must not render, must not `require` anything it has
not already loaded. It swaps and exits. This is stricter than the CLI is today,
and worth back-porting to `ccrm` once the engine exists.

### 2. Execution time limits

`max_execution_time` and PHP-FPM's `request_terminate_timeout` on shared hosting
are commonly 30–120 s. A `git pull` plus a full docroot copy can exceed that.
Two ways out:

- **Detached worker** — `setsid php … < /dev/null > .ccrm-update/log 2>&1 &`,
  browser polls a status endpoint that tails the log. Note the fd-0 gotcha
  documented in commit `a5d759a`: a detached child that inherits fd 0 under
  PHP-FPM holds the FastCGI socket open and dies with "Failed to read FastCGI
  header", taking the parent request with it. `< /dev/null` is not optional.
- **Resumable state machine** — each HTTP call performs one bounded step
  (download chunk, extract N files, copy N files) and returns
  `{step, progress, next}`; the frontend drives the loop. Slower, but needs no
  shell at all.

---

## Two routes

|  | **A — git wrapper** | **B — signed release bundle** |
|---|---|---|
| How | `api/update.php` spawns `php ccrm update` detached; UI tails the log | Download a signed `.zip` from the licence server, verify sha256 + Ed25519, stage, swap, migrate |
| Requires | `exec()`, `git` in the web user's `PATH`, writable checkout | `curl` + `zip` — both already documented prerequisites |
| Works on | Websupport almost certainly — `sync.php` used to spawn workers with `exec()` until `a5d759a`, so the function is not disabled there | Effectively any PHP host, including one with `disable_functions=exec` |
| Effort | ~1 day | ~2–3 days |
| Rollback | `git reset --hard <old-sha>` | restore `.ccrm-update/backup-<version>/` |
| Inherits | every trap in the current flow: the dirty-file guard, root-vs-`public/` drift, stale gitignored `dist/*.php` clobbering root | none of them — the bundle is built once, correctly, on the build machine |

### Recommendation

**Build B as the primary path; keep A as an auto-detected fast path where git and
`exec()` are both present.** Three reasons:

1. "Several shared hostings" is exactly the situation where *git is installed and
   `exec()` is enabled* stops being a safe assumption. B degrades to "needs curl
   and zip", which is close to "needs PHP".
2. B deletes a whole family of failures we have actually hit in production — the
   publish-order bugs (`3e95dde`, `b540ae3`, `2651afa`) all come from
   reconstructing the shipped artifact *on the server* out of three drifting
   copies of the backend. A bundle built by `npm run deploy` is assembled once,
   on the machine that has the build step.
3. It gives customers who are not on our git remote a real update path.

One engine, two source drivers, and `php ccrm update` calls the same engine — so
there is never a "the CLI does it differently" bug.

---

## Architecture

```
src-php/Updater.php          the engine: preflight, phases, lock, backup, rollback
src-php/Update/GitSource.php     driver A — pull, then publish from dist/
src-php/Update/BundleSource.php  driver B — fetch, verify, extract
api/update.php               HTTP surface (admin only): status, check, start, step, log
ccrm                         CLI, refactored to call Updater instead of inlining it
```

State lives in `system_settings` (`UPDATE_STATE`, `UPDATE_CONFIG`) and on disk
under `.ccrm-update/` (gitignored, and added to the `.htaccess` deny list next to
`src-php` and `docs`):

```
.ccrm-update/
  lock                  flock target — one update at a time, ever
  maintenance           presence = sync.php and api/* answer 503
  staging/              the new tree, fully assembled before anything is swapped
  backup-1.9.5/         the tree we replaced, for rollback
  log-<job>.ndjson      one JSON line per step, tailed by the UI
```

### The preflight probe

Ship this first and surface it in Settings → Updates, whatever else we build. It
answers "can this host update itself?" **before** a customer clicks anything:

| Check | Why |
|---|---|
| `function_exists('exec')`, `git --version` | route A available? |
| `curl`, `ZipArchive`, outbound HTTPS to the licence host | route B available? |
| docroot + `api/`, `dist/`, `vendor/` writable by the web user | can we swap at all? |
| free disk ≥ 3× bundle size | staging + backup + live |
| `max_execution_time`, `memory_limit` | pick detached vs. resumable |
| git checkout clean / drifted | route A would abort on the dirty-file guard |
| DB user can `ALTER TABLE` | migrations will land |

### The release feed (Craft side)

A new route alongside `validate`, answering a licensed instance:

```json
{
  "latest":  "1.9.6-Jackfruit",
  "channel": "stable",
  "minimum": "1.8.0",
  "url":     "https://.../releases/ccrm-1.9.6.zip",
  "sha256":  "…",
  "token":   "<base64url(manifestClaim)>.<base64url(signature)>",
  "notesUrl":"…"
}
```

The claim carries `v` (format version), `product`, `version`, `sha256` and
`issuedAt`, and is verified with the existing public key. Rules that follow from
the licensing design and must hold here too: the **signature is the authority**,
the JSON fields around it are display copies; `issuedAt` must not go backwards;
a claim version the client does not know is refused outright.

`npm run deploy` gains a step that builds the zip, hashes it, and uploads it —
one release artifact per version bump, matching the existing
`.agents/rules/commit-and-versioning.md` rule of one build = one version.

---

## Auto-update

Two separate things, and they should stay separate — the check is always on, the
apply is opt-in.

**Check** — throttled to ~6 h, piggybacked on any authenticated request, exactly
like `ccrm_license_refresh($pdo, false)`. Stores `latest_version` in
`system_settings`. The UI shows "1.9.6 is available" with a link into the
existing `UpdateNotesView`, which is already fed from the same Craft install.

**Apply** — per-install setting `autoUpdate: off | security | patch | all`,
default `off`, with:

- a **maintenance window** (default 02:00–05:00 instance-local),
- a **quiet check** — skip if a sync or a login happened in the last N minutes,
- the **same licence gate** as the button,
- the **same lock**, so cron and a clicking admin cannot collide,
- **cron if available** ([`api/cron.php`](../api/cron.php) already has a token),
  otherwise the same opportunistic hook as the check.

**During the swap** the maintenance flag makes `sync.php` and `api/*` answer 503
with a small "updating, back in a moment" payload the frontend already needs a
branch for. The window is seconds, but a write landing in a half-swapped backend
is exactly the shape of the 2026-07-06 data-loss incident, so it is not
optional.

**After**, the acting browser reloads. Other open tabs are running the previous
bundle against the new backend: a `X-CCRM-Version` response header compared
against `src/utils/version.ts` gives them a "new version — reload" toast. `sw.js`
is network-only, so a reload is genuinely enough.

---

## Security

This endpoint downloads code and executes it. It is, by construction, the most
dangerous thing in the application. Non-negotiables:

1. **Admin only, with a fresh re-authentication.** A stolen session that is an
   hour old must not be able to install a "release".
2. **The source is pinned in config, never in the request.** No branch, no URL,
   no ref, no version from the client. The body says `{"action":"start"}` and
   nothing that steers where code comes from.
3. **Signature verification is mandatory whenever `CCRM_LICENSE_PUBLIC_KEY` is
   set.** Unsigned bundles are refused — not warned about. sha256 alone is not a
   defence, since whoever serves the zip serves the hash.
4. **Rate-limited and audit-logged**, reusing the `license_attempts` /
   `ccrm_audit_log` pattern from [`api/license.php`](../api/license.php).
5. **No path traversal on extract.** Reject any zip entry that is absolute,
   contains `..`, or is a symlink — this is the classic zip-slip, and it writes
   PHP into the docroot.
6. **`config.php`, `api_key.txt`, `uploads/` are never touched**, the same
   `$preserveExisting` guarantee `Installer::copyDir()` already makes.

Worth stating plainly for the record: an attacker with an admin session already
has the customer's data. A careless version of this gives them the server. That
is the difference the list above is defending.

---

## Failure modes and rollback

| Fails at | Result | Recovery |
|---|---|---|
| Preflight / licence | nothing happened | message in the UI, install untouched |
| Fetch or verify | staging discarded | retry; a bad signature is reported as tampering, not a network error |
| Swap | partial tree on disk | restore `backup-<version>/`, clear maintenance, mark the job failed |
| Migrate | new code, old schema | `ccrm_apply_schema()` is additive and idempotent — re-run it; only if that fails does it become a support case |
| Host too slow / times out | job stuck holding the lock | lock carries a heartbeat; a stale lock is breakable after N minutes with an explicit confirmation |

Schema migrations are forward-only additive `ALTER`s, so rolling the *code* back
over a migrated database is safe. That asymmetry is what makes the backup
directory a sufficient rollback: take a DB snapshot with
`scripts/backup/db_backup.php` before phase 4 anyway.

Anything that needs a human — a genuinely dirty checkout on route A, a broken
`git pull`, an unwritable docroot — must surface in the UI as *"this install
needs manual attention over SSH"*, with the reason. A silent no-op is how an
install quietly stops receiving security fixes.

---

## Implementation plan

Five stages, each shippable and useful on its own.

### Stage 1 — Know what we are running and what exists (½ day)

- `api/update.php?action=status`: returns current `VERSION`, the preflight probe
  result, and the last known `latest_version`.
- Craft: the release-feed route, returning version + notes URL only (no artifact
  yet).
- Settings → Updates panel: current version, "up to date" / "1.9.6 available",
  and the host-capability report.
- **Ships value immediately:** we can finally see, per instance, what version it
  runs and whether it *could* self-update.

### Stage 2 — The engine and the CLI refactor (1 day)

- `src-php/Updater.php` with the four phases, the lock, the maintenance flag,
  backup and rollback. No HTTP surface yet.
- `GitSource` driver = the current `ccrm_update()` logic, moved verbatim.
- `ccrm` becomes a thin CLI over the engine, keeping its output format so nothing
  in our own deploy habits changes.
- Unit tests for the phase state machine and the lock; `php -l` over every
  tracked PHP file, per the deploy-topology rule.

### Stage 3 — The button (1 day)

- `api/update.php` actions `start` / `step` / `log`, admin + re-auth +
  rate-limit + audit.
- Detached worker where `exec()` exists, resumable stepping where it does not.
- UI: *Update now*, live log, success → reload, failure → the reason and whether
  it rolled back.
- Maintenance-mode branch in `sync.php` / `api/*` bootstrap and its frontend
  counterpart.
- **This alone solves the SSH problem.** Everything after it is convenience.

### Stage 4 — Signed bundles (1–1½ days)

- `BundleSource`: fetch, sha256, Ed25519 manifest verification, zip-slip-safe
  extract into staging.
- Craft: mint the manifest claim, serve the artifact.
- `scripts/deploy.mjs`: build + hash + upload the release zip.
- Driver auto-selection from the preflight probe, `BundleSource` preferred.

### Stage 5 — Auto-update (½ day)

- The throttled check on authenticated requests.
- `autoUpdate` setting, maintenance window, quiet check, cron hook.
- A post-update banner: "Updated to 1.9.6" linking to the notes.

Roughly **4–5 days** for all five, with a working button after three.

### Documentation and rules to update as we go

- [`.agents/rules/licensing.md`](../.agents/rules/licensing.md) — the wording
  "refuse `php ccrm update`" becomes "refuse updates, CLI or in-app". The rule
  itself does not change: a licence gates updates and nothing else, and an
  install that stops updating keeps serving its users.
- [`README.md`](../README.md) — the deployment section gains the in-app path
  alongside the SSH one.
- `.gitignore` — `/.ccrm-update/`.
- `.htaccess` — `.ccrm-update` in the blocked-directory rule.

---

## Testing

The QA audit mocks `/api/*`, so the UI half is testable the usual way: the
Updates panel against a mocked `status`, a mocked successful update, a mocked
failure, and the maintenance-mode screen.

The engine needs its own harness, because the interesting cases are all about
the file system and the process boundary:

- swap interrupted halfway → rollback restores the previous tree byte-for-byte;
- two concurrent starts → the second is refused, not queued;
- a bundle with a `../` entry → refused before anything is written;
- a manifest signed by the wrong key, an old `issuedAt`, an unknown claim
  version → each refused with its own code;
- `config.php` / `uploads/` survive every path.

The docker `crm` container is the place to run these — local PHP has no sodium,
so Ed25519 verification cannot be exercised on the host.

---

## Open questions

1. **Do we keep git deployment for our own instances?** Recommendation: yes —
   route A stays supported, and our boxes keep using it, so we always have a
   debuggable path that does not depend on the release pipeline.
2. **Where do release artifacts live?** Craft itself, or object storage with
   Craft handing out the URL. The signature makes the transport untrusted either
   way.
3. **Does auto-update default to `off` forever, or to `security` after we have
   watched it work for a few releases?** Start at `off`.
4. **One channel or two?** A `beta` channel would let the demo instance track a
   feature branch the way `CCRM_DEPLOY_BRANCH` does today.

---

## See also

- [`docs/licensing/README.md`](licensing/README.md) — the signing, verification
  and offline-window design this reuses wholesale.
- [`.agents/rules/licensing.md`](../.agents/rules/licensing.md) — what a licence
  is allowed to control.
- [`ccrm`](../ccrm) — `ccrm_update()`, the flow being replaced, including the
  comments explaining why it never auto-stashes and why it re-copies
  `public/` → `dist/` before publishing.
