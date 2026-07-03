# CCRM Roadmap / Outstanding Work

This file tracks everything still to be done, from a defensive security & code
audit (July 2026) plus follow-up work. It is the single source of truth for
"what's left". Keep it updated as items land.

**Legend:** 🔴 critical · 🟠 high · 🟡 medium · 🔵 low · ✅ done
Effort: S (small, <1h) · M (medium) · L (large / architectural)

> Note: `.md` files are blocked from web serving by `.htaccess`, but this repo is
> public on GitHub — do **not** put secrets, passwords, or client data in here.

> **Caveats from the 2026-07-03 hardening pass (`7161672`):**
> 1. **Secret encryption & existing installs.** New installs get a dedicated
>    `CCRM_SECRET_KEY` in `config.php`; existing installs fall back to a key derived
>    from the DB credentials. On an existing install, stored secrets remain plaintext
>    until the settings/mailbox are next saved, at which point they encrypt with the
>    fallback key. **Do not add a `CCRM_SECRET_KEY` to an existing install after
>    secrets have been re-saved** — values encrypted under the fallback key won't
>    decrypt under the new key. To adopt an explicit key on an existing install, set
>    it first, then re-save every integration/mailbox secret.
> 2. **Not yet runtime-tested end-to-end.** The pass was verified by PHP lint, `tsc`
>    typecheck, a successful `vite build`, and a standalone encrypt/decrypt roundtrip
>    test — but **not** against a live MySQL instance. Smoke-test login, sync,
>    password reset, and mailbox send/receive on staging before merging `dev → main`.

---

## 0. Owner actions (cannot be done in code — do these first)

- [ ] 🔴 **Rotate the production DB password.** The websupport DB credentials were
  committed in early git history (`dist/config.php`, initial commit) and are
  recoverable by anyone while the repo is public. Rotate in the websupport panel
  and update the server's `config.php`. Treat the DB as compromised until done.
- [ ] 🔴 **Make the repo private, then purge history.** Remove the old `config.php`
  and `tempData/` from history (`git filter-repo --path dist/config.php --path
  public/config.php --path tempData --invert-paths`, then force-push) and/or set
  the repo private. The `.gitignore` / `git rm` already stop *future* commits;
  they don't erase what's published.
- [ ] 🟠 **Move `.user.ini` to the real docroot.** Upload-size limits (`.user.ini`)
  exist only under `dist/`; the served root uses host defaults (2M/8M). Copy it
  to the repo root on the server.

---

## 1. Security — remaining

- [ ] 🟠 **Mail-attachment RCE.** `api/mail_broker.php` `save_imap_attachment_to_uploads()`
  writes attachments to `uploads/` with **no extension allowlist**, and `uploads/`
  has no PHP-execution guard. An authenticated user who controls a connected
  mailbox could save `evil.php` and request it. Fix: reuse `upload.php`'s blocked-
  extension check **and** add `uploads/.htaccess` (`php_flag engine off` /
  `RemoveHandler .php`) — plus the nginx equivalent if applicable. (S)
- [ ] 🟡 **Enable TLS certificate verification** on outbound calls (`CURLOPT_SSL_VERIFYPEER`
  is `false` in ~13 files incl. the OpenAI Bearer-key path). Correct default, but
  the code disabled it citing "container CA bundle issues" — flipping it blind
  could break all AI/registry calls if the host CA store is missing. Plan: flip
  one file to `true`, smoke-test an AI summary, then roll out. (S, needs live test)
- [ ] 🟡 **Genericize remaining leaked exception messages.** *Partly done in `7161672`:*
  `display_errors=0` is now set centrally (in `api/auth.php`) and `sync.php`,
  `setup.php`, `pipeline.php` were genericized. Still echoing `$e->getMessage()`:
  `chat_rag.php`, `cron_agents.php`, `generate_report.php`, `summarize_*.php`,
  `train_vector.php`. Log server-side, return a generic message. (S)
- [ ] 🔵 **CSRF defense-in-depth.** State-changing endpoints rely on the session
  cookie + `SameSite=Lax` + same-origin CORS. Add a CSRF token for belt-and-braces. (M)
- [ ] 🔵 **`@`-suppressed file ops** hide real I/O failures (`upload.php`,
  `mail_broker.php`, `registeruz.php`, `summarize_financial.php`, `generate_report.php`,
  `src-php/Installer.php`). Handle errors explicitly. (S each)

---

## 2. Stability & correctness — remaining

- [ ] 🟠 **IMAP UID/sequence-number bug.** `mail_broker.php` searches with `SE_FREE`
  (sequence numbers) but keys/looks up the overview map by UID — on any mailbox
  with past expunges (UID ≠ msgno), emails silently vanish from the listing and
  pagination totals break. Fix: use `SE_UID` + `FT_UID` and key everything by UID.
  (M, needs a real mailbox to test.)
- [ ] 🟡 **`sync.php` GET has no try/catch** around its main queries — a PDO error
  yields an HTML/empty 500 on the endpoint that bootstraps the whole app. Wrap it
  and return structured JSON. (S)
- [ ] 🟡 **Same-record concurrent edits are last-write-wins.** The delete-side data
  loss is fixed (`baseSyncedAt` guard); overwrites of the *same* row's fields still
  clobber. Full fix = per-field/per-entity versioned saves. (L, architectural)
- [ ] 🟡 **`get_emails` mutates the DB on a GET** (timeline upsert + `rag_emails`
  insert with no `ON DUPLICATE`), racing concurrent loads into duplicate-key 500s;
  `email-<uid>` event IDs can collide across folders/users. Move ingestion out of
  the GET path. (M)
- [ ] 🟡 **ENUM / value validation.** Client strings go straight into ENUM columns
  (`timeline_events.type`, task priority/status); an unknown value fails the whole
  sync in strict mode. Add allowlists; clamp `rating` 1–5; guard `strtotime()`
  returning false (currently silently becomes `1970-01-01`). (M)
- [ ] 🟡 **OpenAI call resilience.** Only `summarize_email.php` has retry/backoff;
  the other ~7 call sites fail hard on the first transient 429/5xx, and a 15s
  timeout error gets persisted into `chat_history` as if it were a real reply.
  Add shared retry + don't store error strings as replies. (M)
- [ ] 🟡 **SMTP send reports success blindly.** `mail_broker.php` never checks the
  `MAIL FROM`/`RCPT TO`/`DATA` response codes and has no socket timeout — a rejected
  recipient still returns `{"success":true}`. (M)
- [ ] 🔵 **Per-request overhead.** `ccrm_apply_schema()` (15 CREATE + ~30 probes)
  runs on every GET/POST; RAG email ingestion opens a fresh DB connection + re-runs
  DDL per email in a loop. Cache a schema-version flag; hoist the connection. (M)
- [ ] 🔵 **RAG relevance matching is direction-inverted** for notes/emails
  (`chat_rag.php` requires the whole note to appear inside the query) — meeting
  notes effectively never match. Plus N+1 (2 queries × 100 leads per message). (M)
- [ ] 🔵 **Unbounded reads.** Whole attachments/PDFs loaded into memory before
  serving; `universal_search.php` fetches all email bodies and runs `similar_text`
  per row per keystroke. Add limits/streaming. (M)
- [ ] 🔵 **`pipeline.php` API-key file** written without `LOCK_EX` and the write
  result unchecked — concurrent first requests can each mint a different key and
  permanently 401 all integrations. (S)
- [ ] 🔵 `validate_vat.php` leaks its curl handle (no `curl_close`). (S)

---

## 3. Frontend quality — remaining

- [ ] 🟡 **`AbortController` coverage.** *Partly done in `7161672`:* a
  `fetchWithTimeout` wrapper (120s abort) now guards the long-running AI ops
  (transcribe / summarize / report / RAG) so they no longer spin forever. Still
  missing: per-effect abort/ignore to stop stale responses racing onto the wrong
  lead/agent/search across LeadsDatagrid, ClientsView, EmailView, Header. (M)
- [ ] 🟡 **`res.ok` unchecked** on ~half of ~70 `fetch` calls — 500s throw into
  console-only catches and the user sees nothing. Add a shared `apiFetch()` helper
  (ok-check + error toast + abort). (M)
- [ ] 🟡 **Side effects inside `setState` updaters** + StrictMode double-invoke →
  duplicate full-state POSTs (`App.tsx` `pushStateToServer` called inside
  `setLeads`/`setTasks`/…). Move the push to an effect. (M)
- [ ] 🔵 **Crash-hardening on API data:** unguarded `e.from.name`,
  `mail.date.substring`, `data.topics`, `lead.status.toLowerCase()`, etc. — one
  malformed record blanks a whole view (single global ErrorBoundary). Optional
  chaining + defaults at ingest; add per-view error boundaries. (M)
- [ ] 🔵 **Non-401 boot recovery** — the initial loader now always resolves; a 5xx
  still shows an empty shell until the next poll. Consider a retry banner. (S)
- [ ] 🔵 **Double-submit guards** on timeline-event / attach / quick-login / profile
  save (add `isSubmitting`). (S each)
- [ ] 🔵 **`(window as any).showToast`** called unguarded in a few places — a missing
  global turns validation into a TypeError. Wrap in a typed `toast()` helper. (S)
- [ ] 🔵 **`BlockEditor` sets `innerHTML`** from stored (AI/imported) block content
  without sanitizing. (S)
- [ ] 🔵 **i18n gaps** — three parallel mechanisms (`getTranslation`, ~660 inline
  `sk ? … : …` ternaries, hardcoded English in EmailView / create-lead modal /
  RagAiView / Dashboard). "hu" users get English in many spots. (L)
- [ ] 🔵 **Type safety** — 225 `as any` + 115 `: any` (core props like `currentUser`,
  `integrationsConfig`, `errorLogs` typed `any`). These are what let the crash
  bugs compile. (L)
- [ ] 🔵 **Dead code** — delete `src/utils/mockData.ts` (1,010 lines, unimported),
  `src/App.css` (unused), `src/assets/hero.png|react.svg|vite.svg`, and orphaned
  `sw.js` (the app actively unregisters service workers). (S)
- [ ] 🔵 **God components** — LeadsDatagrid 5,333 / SettingsView 5,120 /
  ClientsView 4,874 lines; `App.tsx` prop-drills ~25 props each. Extract a store
  and shared helpers (`getCurrentUser`, `parseUserMetadata`, `processMail`,
  `stripHtml`, error-log panel). (L)

---

## 4. Build / deploy / hygiene — remaining

- [ ] 🟠 **Restore the Vite source entry.** *Verified OK on `dev` as of `7161672`:*
  repo-root `index.html` points at `/src/main.tsx` and `vite build` transformed
  1,812 modules (real source compile, not a re-bundle of output). Keep it this way;
  confirm the `main`-branch `index.html` is the compiled entry only at deploy time,
  and keep build outputs out of the Vite entry path. (S — verify on main)
- [ ] 🟡 **Fix the hash-reappending build step** and clean stale bundles. `assets/`
  and `dist/assets/` accumulate re-hashed `index-*.js/css`, `favicon-…`, and
  `manifest-CkRMSD6B-CkRMSD6B-…json`. Find the rename step (deploy pipeline /
  `src-php/ComposerPlugin.php`), stop it re-hashing, and prune to the referenced
  files each deploy. (M)
- [ ] 🔵 **Wire `increment-version.js` into the build** — `npm run build` is
  `tsc -b && vite build` and does **not** bump the version; it's done manually. (S)
- [ ] 🔵 **Icons** — `icon_192.png` and `icon_512.png` are byte-identical (291 KB
  each); one is mislabeled in `manifest.json`. Generate correctly-sized PNGs. (S)
- [ ] 🔵 **Docs disclose internals** — `docs/db_integration_notes/SCHEMA.md`,
  `API_CONTRACTS.md`, etc. are public on GitHub (blocked from web by `.htaccess`).
  Fine once the repo is private. (—)
- [ ] 🔵 **Docker dev passwords** hardcoded in `docker-compose.yml` — ensure they
  are never reused in production. (—)
- [ ] 🔵 **`package.json` metadata** — `name: "temp-vite"`, `version: "0.0.0"`. (S)

---

## 5. Completed (remediation log)

Branch `fable-audit`. Newest first.

- ✅ `7161672` (2026-07-03, v1.5.105, branch `dev`) — Comprehensive model/view/
  controller + template audit remediation:
  - **🔴 Privilege escalation in `sync.php` POST.** The mutating sync was gated by
    auth only; any authenticated *viewer* could promote themselves to admin,
    overwrite other users' passwords, or delete accounts via the `users`/`roles`/
    `settings` blocks. Now those writes are admin-only, and a non-admin may edit
    **only their own record with their role locked**; delete-by-omission is guarded
    so a non-admin payload can't wipe every other user.
  - **🟠 Secrets encrypted at rest.** OpenAI key, SMTP/IMAP passwords, OAuth tokens,
    vector-DB keys are AES-256-GCM encrypted (key from `config.php`, never the DB)
    with transparent plaintext fallback; decryption wired into all read sites. See
    the caveat at the top of this file.
  - **🟠 Audit log.** New `audit_log` table + `ccrm_audit_log()` on role/settings/
    user-delete/API-key-rotation/password-reset.
  - **🟠 Password-reset endpoint** now rate-limited (per-IP), transactional, and
    reconciled to tracked root `api/` (was `dist/`-only).
  - **🟠 401 mutation recovery.** A push rejected by an expired session is replayed
    from the latest state after re-login instead of being silently dropped.
  - **🟡 Webhook idempotency** in `pipeline.php` (`Idempotency-Key`/`event_id`) to
    stop duplicate leads on retries; **malformed lead/task items skipped** instead
    of 500-ing the whole sync; **dynamic `ue_` DDL capped** per request.
  - **🟡 Error hardening.** Central `display_errors=0`; generic messages in
    `sync.php`/`setup.php`/`pipeline.php`. **CSP header** added to `.htaccess`.
  - **🟡 AI model** moved from a hardcoded `gpt-4o-mini` literal (8 files) into
    `INTEGRATIONS_CONFIG` via `ccrm_ai_model()`.
  - **🟡/🔵 Frontend.** `fetchWithTimeout` on long AI ops; global zero-leads empty
    state + CTA; `formatBytes` de-duplicated into a shared util.
  - **🔵 Deploy/hygiene.** `composer audit` + optional post-deploy health check in
    the `ccrm` CLI; stopped tracking AI/agent context files and scratch update notes.
- ✅ `6acc992` — Mailbox IDOR (session-derived, not `X-User-Email`); login rate
  limiting (fail-open, per-IP); constant-time API-key compare; cron overlap lock;
  `wipe_demo` transactional DELETEs + random admin password; `JSON_INVALID_UTF8_SUBSTITUTE`
  across OpenAI/extract sites; email iframes `sandbox=""`; ClientsView XSS
  (escape `formatInlineMarkdown`, strip registry names).
- ✅ `adb3c3d` — `error_logs` admin-only + payload secret redaction; `financial_summary`
  made server-owned (stops the wipe/regenerate OpenAI-cost loop); boot loader always
  resolves (no more infinite "Syncing…").
- ✅ `e73bddb` — Sync delete-by-omission guarded by `baseSyncedAt` (DB clock) so a
  stale client can't wipe records another user just created/edited.
- ✅ `e0f43ae` — Integration & mailbox secrets are write-only: masked in every
  client response, preserved-on-save when left masked, resolved server-side for
  test/validate flows.
- ✅ `7d218ba` — `GET /sync.php` requires auth (was a full anonymous PII + secret
  dump); `.htaccess` blocks `.git`/`scratch`/`tempData`/config/docs + security
  headers; removed tracked `scratch/` dump scripts and `tempData/` client data.

---

### How to use this file
Work top-down within each section (severity-ordered). When something lands, move
it to §5 with its commit hash and date. Re-run the audit after major changes.
