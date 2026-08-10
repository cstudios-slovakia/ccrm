# CCRM Security & Correctness Audit

**Date:** 2026-07-28
**Scope:** Full codebase — backend (`api/`, `src-php/`, `sync.php`, `upload.php`), frontend (`src/`), deploy topology, dependencies, git history.
**Branch:** `opus-5-audit` (9 commits, not pushed, not deployed)
**Baseline:** `main` @ `65d61e4`

> **Handling note.** This document maps exploitable weaknesses. It lives in `docs/`, which the repo-root `.htaccess` blocks from web serving twice over (the `\.md$` FilesMatch and the `^(...|docs)(/|$)` RewriteRule). Keep it out of any web-served directory. It deliberately does **not** reproduce the leaked credential values — see finding C6.

---

## 1. Executive summary

The codebase shows real, deliberate security engineering — bcrypt hashing, per-endpoint authentication, encrypted secrets at rest, an audit log, a mass-delete circuit breaker written after a genuine data-loss incident, and an unusually high standard of explanatory comments. But that hardening was applied endpoint-by-endpoint, and the gaps sit exactly where two subsystems meet.

The audit found **two working remote-code-execution / data-disclosure paths reachable by any logged-in user** — both confirmed by exploiting them against a local instance, not by reading code — and **a data-loss bug that fires on every single delta sync**, silently deleting project-manager assignments as users simply browse the app. Certificate verification was disabled on every outbound connection, leaving the OpenAI API key, mailbox passwords and all CRM data sent to the LLM interceptable by anyone on the network path.

Separately, **real production database credentials are present in git history**. That one cannot be fixed by code; it needs credential rotation.

All findings below are fixed, verified and committed. Nothing was pushed or deployed.

---

## 2. Findings

Severity reflects exploitability × blast radius. "Confirmed" means the issue was reproduced against a running local instance.

### 2.1 CRITICAL

| # | Category | Location | Finding | Impact |
|---|---|---|---|---|
| C1 | Injection / RCE | `api/mail_broker.php:1085` | `save_attachment` wrote email attachments into web-served `uploads/` using the caller-supplied `?name=` with **no extension check** | Any authenticated user with a mailbox mails themselves a `.php` payload and calls the endpoint → code execution. **Confirmed: PHP executed from `/uploads/`** |
| C2 | Authorization | `api/dashboard_query.php:100` | `action=sql` — `SELECT * FROM users` mentions neither "password" nor "password_hash", so it walked past the keyword filter | **Confirmed as a non-admin (`project_manager`) session:** dumped every bcrypt hash plus `metadata_json`, which holds the encrypted mailbox credentials |
| C3 | Injection | `api/dashboard_query.php:23` | `information_schema` is absent from `SHOW TABLES`, so the per-table allowlist loop never inspected it | **Confirmed:** full schema disclosure |
| C4 | Injection | `api/dashboard_query.php:36` | `/*!50000UNION*/` defeats `\bunion\b` (the digits kill the word boundary) but is executed by MySQL; `INTO  OUTFILE` with two spaces defeats the literal phrase check | **Confirmed:** UNION filter bypassed. Arbitrary file write where the DB user holds `FILE` privilege |
| C5 | Data integrity | `sync.php:1515` | `DELETE FROM project_managers` ran unconditionally whenever the payload carried a `projects` key, re-inserting only the projects in that payload. Correct under full-snapshot sync; wrong once the v2 delta protocol shipped, because a delta sends only changed projects and always sets the key — even when empty | **Confirmed:** a delta carrying 1 of 2 projects silently deleted the other's manager. Fires on **every** save |
| C6 | Secret hygiene | git commit `32c1c19` | `public/config.php` and `dist/config.php` were committed containing real Websupport database host, name, user and password | Full database compromise if still valid. Every deployed instance holds the full history. **Not fixable in code** |

### 2.2 HIGH

| # | Category | Location | Finding | Impact |
|---|---|---|---|---|
| H1 | Data integrity | `sync.php:1492` | projectTypes deleted straight from `array_diff()` with no circuit breaker — and deletion also `DROP`s the type's `proj_data_*`, `proj_timeline_*`, `proj_gantt_*` tables | A v1 client pushing before its state finished loading (`projectTypes: []`) wiped every type and dropped every project's data tables. Same shape as the 2026-07-06 incident. Unrecoverable |
| H2 | Data integrity | `sync.php:1629` | projects deletion also bypassed the circuit breaker; cascades to all `proj_*` rows | Bulk loss from a single stale push |
| H3 | Correctness | `sync.php:1497` | `DROP TABLE` executed inside the transaction. DDL implicitly commits in MySQL | Deleting a project type made the final `commit()` throw "There is no active transaction": the push returned 500 despite having written, and every earlier write in that request lost its rollback |
| H4 | Transport | 26 curl call sites + all IMAP | `CURLOPT_SSL_VERIFYPEER/VERIFYHOST` set to `false`; IMAP used `/novalidate-cert` everywhere | Any on-path attacker can present their own certificate and collect the OpenAI key, the mailbox password and full mailbox contents, plus all CRM data sent to the LLM |
| H5 | Auth | `api/auth.php:80` | Role copied into the session at login and never re-read | **Confirmed:** a demoted admin kept admin rights on admin-only endpoints; a deleted account kept a fully working session. Up to 30 days with "remember me" |
| H6 | Auth | `api/password_reset.php` | A completed reset did not invalidate existing sessions | Whoever prompted the reset by compromising the account keeps their session afterwards |
| H7 | Config | `uploads/`, `upload.php:41` | No execution guard on the directory; `upload.php` used a **blocklist** checking only the last extension | `shell.php.jpg` accepted (executed by Apache configs with legacy multi-extension `AddHandler`); list also missed `.user.ini`, `.svg`, `.inc` |

### 2.3 MEDIUM

| # | Category | Location | Finding | Impact |
|---|---|---|---|---|
| M1 | Info disclosure | 14 endpoints | Raw `$e->getMessage()` appended to error responses | Leaks DSN, table and column names, file paths, sometimes the offending value |
| M2 | SSRF | `api/setup.php:54` | `type: test_only` exempt from the already-installed guard and unauthenticated | Every installed instance offered anonymous MySQL connects to any host:port — a network probe and a credential-guessing oracle |
| M3 | XSS | `src/components/EmailView.tsx:241` | `stripHtml` assigned email HTML to a detached `<div>`'s `innerHTML`. Detached nodes still resolve resource URLs | `<img src=x onerror=...>` in a received email executes script in the app's origin |
| M4 | IDOR | `api/upload_audio.php:55` | No check that the caller may write the supplied `meetingId` | Any authenticated user overwrites any meeting's recording, or creates notes |
| M5 | Silent failure | `api/upload_audio.php:89` | DB write failure caught and discarded ("Silently log or ignore") | Client told "success" while the note kept no reference to the audio |
| M6 | IDOR / audit | `api/delete_file.php` | Any authenticated user deletes any file in `uploads/`, with no record | Including the directory's own execution guard |
| M7 | Resilience | `src/main.tsx:9` | Only a root `ErrorBoundary` | A render error in one CRM tab replaced the entire app; reload was the only recovery |
| M8 | Silent failure | `api/universal_search.php:181,221,287,345` | Four empty `catch (\Exception $e) {}` blocks | A broken source returned "no results", indistinguishable from a genuinely empty search |
| M9 | Growth | `login.php:57`, `password_reset.php:189` | Throttle tables pruned only for one IP on a successful login | Unbounded growth slows the `COUNT` gating every login attempt |

### 2.4 LOW

| # | Category | Location | Finding |
|---|---|---|---|
| L1 | Dead code | `public/api/test_updates.php` | Leftover debug endpoint — unauthenticated, deployed to every instance, referenced by nothing, echoed a raw upstream response |
| L2 | Correctness | root `.htaccess:12` | The documentation blocklist (`*.md`, `*.txt`, `*.yml`, `*.sql`) applied to `uploads/` too, so **every uploaded `.txt` attachment answered 403** instead of downloading |
| L3 | Docs | `sync.php:4` | Docblock still claimed the GET was "public read of CRM state"; it has required a session for some time |
| L4 | Info disclosure | `sync.php:421` | DEMO_MODE returns the user list (names + emails) unauthenticated. Intentional for the demo login picker, but it is an email-harvesting surface on any demo instance |

---

## 3. Recommended fixes (CRITICAL and HIGH)

**C1 — Upload RCE.** One shared `ccrm_safe_upload_name()` that strips path components and NUL bytes and rejects on **every** extension present, not just the last. `ccrm_uploads_dir()` creates the directory and drops an `.htaccess` that turns the PHP engine off and denies script extensions, so the guard travels with the data (`uploads/` is gitignored and never deployed). Mirrored in the repo-root `.htaccess` as a backstop.

**C2–C4 — Dashboard SQL.** Redact sensitive columns from the **result**, not the query text — the text filter can always be worded around, output filtering cannot. Additionally: reject SQL comments outright, match multi-word keywords on a whitespace-normalised copy, refuse any mention of `information_schema` / `mysql` / `performance_schema` / `sys`, and validate every `FROM`/`JOIN` target against the allowlist while rejecting schema-qualified references.

**C5 — project_managers.** Scope the delete to `WHERE project_id = ?`, and only when the payload actually carries a `managers` list. An omitted key means "unchanged", not "none".

**H1–H2 — Unguarded deletions.** Extract the circuit breaker from `ccrm_delete_omitted()` into a standalone `ccrm_filter_mass_delete()` so every delete-by-omission site can share it. Run `project_types` in strict mode, since its deletion is irreversible.

**H3 — DDL in transaction.** Collect the table drops during the transaction and execute them after `commit()`, matching how the `CREATE`/`ALTER` pre-pass already stays outside it. An orphaned table is recoverable; a dropped one is not.

**H4 — TLS.** Enable peer and host verification on all curl sites. Default IMAP to `/validate-cert` with a per-mailbox `imapAllowSelfSigned` opt-out, so an internal self-signed server is a deliberate choice rather than a blanket trust-everything.

**H5–H6 — Session lifecycle.** Re-check the account against the database at most once a minute (fail open on infrastructure errors so a DB blip cannot log everyone out). Add `users.sessions_valid_from`, stamped on any password change, to retire sessions the old password could reach.

**H7 — Upload validation.** Covered by the shared validator in C1.

**C6 — Leaked credentials.** *Not a code fix.* Rotate the database password and the hosting account. History rewriting was deliberately **not** attempted: it is destructive across three deployed instances that pull from this repository, and that call belongs to the repository owner.

---

## 4. Checked, found clean

These were audited specifically and no issue was found. Listed so the absence of a finding is not mistaken for a skipped check.

**Authentication & session**
- Password hashing is `password_hash()` with `PASSWORD_DEFAULT` (bcrypt). Legacy plaintext rows are upgraded on successful login.
- `session_regenerate_id(true)` is called on login (`api/login.php:118`) — no session fixation.
- Cookie flags: `HttpOnly`, `SameSite=Lax`, `Secure` when HTTPS.
- Logout destroys the session server-side, not just client state.
- Reset tokens: 256-bit random, 1-hour expiry, single-use, one active token per user; `request` always returns a generic response so callers cannot enumerate accounts.
- Rate limiting exists on login (20 / 15 min) and reset (5 / 15 min), both deliberately fail-open.
- User enumeration via login timing is blunted by a dummy `password_verify()` on the not-found path.

**Injection & input handling**
- Every SQL query is parameterised. No string-concatenated user input in any query.
- Every interpolated table name passes `preg_replace('/[^a-z0-9_]/', '', strtolower(...))` first.
- All filesystem paths pass through `basename()`.
- No `eval`, no `unserialize` on user input, no `include`/`require` with a variable path.
- Three `shell_exec`/`exec` sites, all arguments through `escapeshellarg()`.
- CSRF: `SameSite=Lax` plus same-origin-only CORS reflection (`ccrm_send_cors` reflects only when the Origin host matches the serving host). No state-changing GET endpoints found.
- XSS: `formatInlineMarkdown` escapes HTML before applying its own markers; untrusted email HTML renders inside `sandbox=""` iframes. `ClientsView`'s `stripHtml` is a regex strip whose output goes through React's normal escaping — cannot inject.

**Data integrity**
- Multi-step writes in `sync.php`, `pipeline.php`, `task.php` and `wipe_demo.php` are wrapped in transactions with rollback.
- `wipe_demo.php` correctly uses `DELETE` rather than `TRUNCATE` so the statements stay transactional.
- The delta protocol is negotiated, not assumed: the client stays on v1 until the server advertises v2, so a delta can never be misread as a full snapshot.
- `api/task.php` implements genuine per-resource authorization (admin, RBAC permission, creator, or legacy assignee).
- `api/mail_broker.php` correctly ignores the old `X-User-Email` header — the previous IDOR is closed.

**Transport (already correct)**
- SMTP: `fsockopen('ssl://...')` and the STARTTLS `stream_socket_enable_crypto()` call already verify under PHP's default context. Confirmed empirically — a known-bad certificate is refused, a valid one accepted. Left unchanged.

**Backups**
- `scripts/backup/db_backup.php` is real and sound: credentials passed via a 0600 defaults-file so the password never reaches `ps`, `--single-transaction`, output size verified before old dumps are pruned, and manual `ccrm_full_*` restore points are never deleted.

**Deploy topology**
- Root, `public/` and `dist/` PHP copies diffed byte-identical (the only pre-existing drift was `test_updates.php`, now removed).
- The v1.5.115 stale-`dist` fix is present and correct in `ccrm:139-153` — `public/` is copied into `dist/` before publishing, and the tracked frontend is restored afterwards.

**Dependency & config hygiene**
- `vite.config.ts` does not enable production sourcemaps.
- `.gitignore` correctly covers `config.php`, `uploads/`, `node_modules/`, `scratch/`, `tempData/`.
- `display_errors` is forced off in `api/auth.php:16`, with `log_errors` on.
- `.htaccess` sets HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and a CSP with `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.

**Code quality**
- Zero `TODO`, `FIXME`, `XXX` or `HACK` markers.
- Zero stray `console.log` calls.
- Frontend lint count identical before and after this audit's changes (671 problems both ways) — no new issues introduced. The pre-existing count is dominated by `@typescript-eslint/no-explicit-any`.

---

## 5. Known gaps not addressed

| Gap | Note |
|---|---|
| **No automated tests** | Zero backend tests, zero frontend tests, no CI. `sync.php` has now caused three incidents; it is the obvious first candidate for regression coverage |
| **`composer audit` / `npm audit`** | Both need network access to be meaningful. `composer.json` has no third-party runtime dependencies (only `composer-plugin-api`), so PHP-side exposure is minimal. The npm tree is dev/build-time plus React 19, Three.js and framer-motion at runtime — worth a real `npm audit` run |
| **Per-file ownership for uploads** | `delete_file.php` still has no ownership model. Adding one needs a schema and UI change beyond a security fix; an audit-log entry was added as the proportionate control |
| **Empty-state / loading-state inventory** | Not exhaustively enumerated per data table. Spot checks during browser testing found both states present in the views exercised |

---

## 6. Suggested remediation order

| # | Action | Rationale |
|---|---|---|
| 1 | **Rotate the leaked database credentials** | The only finding still live and unfixable by code |
| 2 | Deploy the upload RCE fix | Confirmed working exploit, lowest skill required to abuse |
| 3 | Deploy the dashboard SQL fix | Confirmed hash dump by any authenticated user; hashes enable offline cracking |
| 4 | Deploy the `project_managers` fix | Actively destroying data on every save right now |
| 5 | Verify the backup cron is installed on all three instances | Recovery path for damage already done by #4. The script is correct; the crontab lives on the servers |
| 6 | Deploy TLS verification | Passive interception leaves no trace, so exposure duration is unknowable |
| 7 | Deploy the session and privilege fixes | Required before any offboarding can be trusted |
| 8 | Deploy the remaining `sync.php` guards | Prevents the next incident of the 2026-07-06 class |
| 9 | Deploy error-message and endpoint hardening | Reduces reconnaissance value of the remaining surface |
| 10 | Add regression coverage for `ccrm_delete_omitted` and `ccrm_filter_mass_delete` | Highest-risk code in the repo with no test at all |

---

## 7. Could not be verified from the audit environment

- **Whether the leaked database credentials are still valid.** Verifying would mean connecting to the production database, which was not attempted.
- **Whether the backup cron is actually installed** on each instance. The script was reviewed and is correct; the schedule lives on the servers.

**Testing caveat.** Mid-audit the local container was found serving a 4-day-old `schema.php` from a stale image build, which produced a confusing 500. That was a test-environment artifact rather than a code defect — but it is a live illustration of the drift risk inherent in this deploy topology.

---

## 8. Commits on `opus-5-audit`

Applied in this order; each was verified against a running local instance before the next was started.

| Commit | Subject |
|---|---|
| `fbd46a7` | `fix(security): stop uploads/ from executing attacker-supplied files` |
| `fd2f960` | `fix(security): close the arbitrary-read holes in the dashboard SQL action` |
| `d8869be` | `fix(sync): stop delta pushes wiping project managers and project types` |
| `833eb77` | `fix(security): verify TLS certificates on outbound connections` |
| `48c865a` | `fix(auth): revoke privileges and retire sessions without waiting for logout` |
| `b698e7d` | `fix(security): stop leaking internals in error responses; tighten two endpoints` |
| `4e2f791` | `fix(ui): make email text extraction inert and contain per-view crashes` |
| `529b1a6` | `chore: remove debug endpoint, surface search failures, prune throttle tables` |
| `c90cfb0` | `build: publish frontend bundle v1.6.33` |

### Verification performed

**Security regression suite** (all previously-exploitable, all now blocked):

| Check | Before | After |
|---|---|---|
| PHP execution from `/uploads/` | executed | `403` |
| Legitimate `.txt` upload download | `403` (bug L2) | `200` |
| `SELECT * FROM users` as non-admin | full hash dump | `[REDACTED]` |
| `information_schema` read | full schema | rejected |
| `/*!50000UNION*/` bypass | executed | rejected |
| `setup.php` `test_only` anonymous | connected | `401` |
| Error response on bad column | raw PDO message | generic |
| Delta sync carrying 1 of 2 projects | other project's manager deleted | both retained |
| Empty `projectTypes: []` push | all types wiped, tables dropped | blocked and logged |
| Demoted admin on admin endpoint | `200` | `403`, and `200` again on re-promotion |
| Session after password change | survived | retired; fresh login works |

**Functional regression:** all endpoints return expected status codes; authorization boundaries hold (non-admin `403`, anonymous `401`); external integrations (VIES VAT, registeruz, ARES) return correct data with TLS verification enabled; a legitimate single project-type deletion now succeeds cleanly where it previously returned 500.

**Browser testing** against the built bundle in Chrome: login, dashboard, leads, projects and registry views all render with no console errors, and an edit made through the UI round-trips to the database. A full interactive session confirmed `project_managers` survives — the exact scenario that previously wiped it on every save.

**File-copy integrity:** root, `public/` and `dist/` PHP copies confirmed byte-identical after all changes.
