# Prompt — implement the WAAI ↔ CCRM integration

You are implementing the integration of **WAAI** (WhatsApp AI triage app) into **CCRM**
(the CRM). The analysis, architecture, decisions and phase plan are finished and are
**the spec you follow**:

> `C:\Users\peter\Work\02_Cstudios_Software_Solutions\Other_web_apps\ccrm\ccrm-app\docs\WAAI-INTEGRATION.md`

Read it completely before you change anything. Do not redesign it. If something in the
codebase contradicts the spec (a file moved, a helper behaves differently, a rule in a
`CLAUDE.md` conflicts), stop, describe the conflict and your proposed resolution, and ask
Peter.

## Repositories

| | Path | Read first |
|---|---|---|
| CCRM | `C:\Users\peter\Work\02_Cstudios_Software_Solutions\Other_web_apps\ccrm\ccrm-app` | `CLAUDE.md`, `docs/TESTING.md`, `.agents/rules/*.md`, `docs/VIEW-SIZE.md` |
| WAAI | `C:\Users\peter\Work\02_Cstudios_Software_Solutions\01_My_web_apps\waai` | `CLAUDE.md`, `AGENTS.md` (skip its "VPS SSH" block), `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md` |
| Prior art (read-only) | `C:\Users\peter\Work\02_Cstudios_Software_Solutions\Other_web_apps\all-inclusive-crm` | `docs/WaaiTaskBridge.md`, `modules/integration/**` |

Each repository's own `CLAUDE.md`/`AGENTS.md` rules apply to changes in that repository.

## Branches — decided by Peter (2026-10-29)

- **CCRM: commit on `1.13-nectarine`**, not on `1.12-mango` and not on a feature branch
  (this settles D5). The worktree `../ccrm-waai` has `1.13-nectarine` checked out; commit
  there, version tags are `1.13.x-Nectarine`, the changelog is `1.13-nectarine-changelog.md`.
  Settings on 1.13 are the registry (`src/components/settings/settingsRegistry.ts`, see
  `docs/SETTINGS.md`), not the old `SETTINGS_TABS`. Remove the worktree's checkout of the
  branch (`git worktree remove`) before checking `1.13-nectarine` out anywhere else.
- **WAAI: a new branch `feat/ccrm-integration`**, created from the base branch (D4), never
  commits on `main` or `feat/clickup-sync` directly. All WAAI phases (3, 4, 5, 7) commit
  there.
- Commit at the end of every phase in both repositories; push only when Peter says so.

## Before phase 1 — decisions

Asked in one message; answers so far:

1. **D4** — WAAI base branch: **`main`** (decided 2026-10-29). `feat/ccrm-integration` was created from it.
2. **D5** — CCRM base branch: **`1.13-nectarine`** (decided, see above).
3. **D7** — relax CCRM's CSP to `frame-src 'self' https:`? **Decided: yes** (2026-10-29, phase 7).
4. **D11** — default deadline for tasks the chat gave no date: **Decided: today + 7 days**, configurable per client (`dueInferred`).
5. **D1 / D3** — **Decided (2026-10-29):** Both CCRM and WAAI are installed on the **same new VPS** as standalone applications (no connection between them yet) → **Scenario S1** (`deploy/vps/docker-compose.waai.yml` + `docker-compose.s1.yml` over private `waai_ccrm` network). Live connection & rollout will execute in the next session.

## Progress

| Phase | Status |
|---|---|
| 0 | Done — CCRM worktree `../ccrm-waai` on `1.13-nectarine`; WAAI worktree `../waai-ccrm` on `feat/ccrm-integration` (from `main`, D4). |
| 1 | Done (v1.13.14-Nectarine) — see "Phase 1 notes" below and the changelog entry. |
| 2 | Done (v1.13.15-Nectarine) — see "Phase 2 notes" and spec §4.1 "As built (phase 2)". |
| 3 | Done (`ba6056a`), **stopped for review** — see "Phase 3 notes" and spec §4.3 "As built (phase 3)". Also v1.13.16-Nectarine: a date the chat takes back falls to today + 7 days again (unless a CCRM user moved it). D9 confirmed: no workflows, e-mails or ticket auto-resolve for WAAI tasks. |
| 4 | Done (v1.13.17-Nectarine, `1a2bc8f`), **no stop required** — see "Phase 4 notes" and spec §4.1 / §4.3 "As built (phase 4)". The fresh-database migration is fixed and the localised messages are in. |
| 5 | Done (v1.13.18-Nectarine, `24cc325`), **no stop required** — see "Phase 5 notes" and spec §4.6 "As built (phase 5)". |
| 6 | Done (v1.13.19-Nectarine), **stopped for review** — see "Phase 6 notes" and spec §4.8 "As built (phase 6)". Review screenshots (light and dark) were **not** captured: Peter said to skip them. |
| 7 | Done (v1.13.21–v1.13.22-Nectarine, `e8f39fd`–`0497af4`), **no stop required** — see "Phase 7 notes" and spec §4.7 "As built (phase 7)". D7 decided: `frame-src 'self' https:`. The manual browser pass with the real WAAI was not run locally (deferred to VPS rollout). |
| 8 | **Prepared & verified (v1.13.23–v1.13.25-Nectarine, `c40891e`)** — Scenario S1 overlays, schema/column healing, and rollout runbook verified. Standalone CCRM and WAAI are installed on the new VPS (not connected yet); ready to connect and roll out in the next session. See "Phase 8 notes" below and spec §5 Phase 8. |

### Phase 8 notes (verified 2026-10-29 — ready for next session)

- **Topology confirmed (D1, D3):** Peter installed both CCRM and WAAI on the new VPS as standalone applications with no connection between them yet → **Scenario S1** applies.
- **Confirmed pre-requisites & overlays:**
  - `Dockerfile.worker` and `Dockerfile.web` copy and build `packages/crm-client`.
  - WAAI (`../waai-ccrm`, branch `feat/ccrm-integration`, commit `c40891e`): `docker-compose.s1.yml` (disables standalone Caddy, joins `waai_ccrm` external bridge network, fixes `ai-worker` IP to `172.31.250.10`, aliases `web` to `waai-web`).
  - CCRM (`../ccrm-waai`, branch `1.13-nectarine`, v1.13.25-Nectarine): `deploy/vps/docker-compose.waai.yml` (defines `waai_ccrm` bridge subnet `172.31.250.0/24`, connects `caddy` and `web`), `deploy/vps/Caddyfile.waai.snippet` (reverse proxy and security headers for WAAI domain).
- **Full verification pass (2026-10-29):**
  - **CCRM (`../ccrm-waai`):** `npx tsc --noEmit` clean; `npm run test:unit` **1068 passed, 0 failed**; `npm run test:integration` **352 passed, 0 failed**; `npm run sync:backend` in sync; 4-place schema rule (`CREATE TABLE IF NOT EXISTS tasks`, idempotent migrations, pre-transaction healing in `sync.php`, `integration_tasks.php`, `integration_whatsapp.php`, `ccrm_apply_schema` in `integration*.php` / `waai_sso.php`, `entities_overview.md`) and `require_direct` proxy header checks (`X-Forwarded-Proto` / `X-Forwarded-Host` behind Caddy `mod_remoteip`) verified.
  - **WAAI (`../waai-ccrm`):** `pnpm typecheck` clean (8/8 packages); `pnpm test` **137 passed, 0 failed** (`crm-client` 103, `web` 34); `pnpm lint` 0 errors (3 existing warnings).
- **Important branch / push state for the next session:**
  - **CCRM:** `1.13-nectarine` is pushed to `origin/1.13-nectarine`. Ensure the VPS CCRM checkout tracks `1.13-nectarine` (`git config ccrm.deployBranch 1.13-nectarine` + `/opt/ccrm-stack/update.sh`).
  - **WAAI:** `feat/ccrm-integration` (`c40891e` in `../waai-ccrm`) is **not pushed to `origin` yet** (and `main` in `../waai` only has phase 3 `ba6056a` plus unpushed `main` commits). First step in the deployment session: push `feat/ccrm-integration` (or merge into `main` and push), pull on the VPS, rebuild WAAI containers, and run `prisma migrate deploy`.
- **Rollout runbook for the next session (step-by-step with Peter):**
  1. Push WAAI `feat/ccrm-integration` (or merge to `main`) and update both standalone installs on the VPS to the integration commits (`1.13-nectarine` on CCRM, `feat/ccrm-integration` on WAAI + `prisma migrate deploy`).
  2. Apply Scenario S1 Docker Compose overlays (`docker-compose.waai.yml` + `Caddyfile.waai.snippet` on CCRM; `docker-compose.s1.yml` on WAAI) so CCRM's Caddy serves both domains and `waai_ccrm` connects `ai-worker` (`172.31.250.10`) and `waai-web` to CCRM `web` and `caddy`.
  3. Configure CCRM Settings → Integrations → WhatsApp (WAAI) (`allowed_ips = ["172.31.250.10"]`, `require_direct = true`, scopes, owners, `embed_url`), issue API token + rotate SSO secret, and set WAAI `.env` with `CRM_BASE_URL=http://web` and `CRM_DRY_RUN=1`.
  4. Validate `ping`, user directory pairing, client/project directory caching, and chat linking (`whatsapp_links`). **Stop for Peter's review.**
  5. Switch to live task push (`CRM_DRY_RUN=0`) and verify two-way task sync.
  6. Verify `whatsapp` timeline events on linked clients.
  7. Map admin user for SSO in WAAI Settings → CRM, verify `#whatsapp` embedded module in browser (Chrome + Firefox; SSO, deep links, theme/locale, voice notes, uploads), then map remaining users and grant `whatsapp` permission to roles.

### Phase 7 notes

- CCRM (`1.13-nectarine`): the `whatsapp` module and permission, `WhatsAppView` (kept alive after the first open), `api/waai_sso.php`, the sign-in secret in Settings → Integrations → WhatsApp (WAAI), the sidebar badge, the CSP `frame-src 'self' https:`. WAAI (`feat/ccrm-integration`, separate worktree `../waai-ccrm`): the `ccrm` SSO provider and `users.crm_user_id`, `/embed/sso`, embed mode and the postMessage bridge, the Caddy `frame-ancestors`, `/open` with the `check_number` bus message, the mapping table in Settings → CRM. Nothing is pushed.
- Verification: see the spec. **Not done:** a run against the real WAAI in a browser (needs Postgres, Redis and a free machine; the machine was out of RAM), Firefox/Safari, a GIF. The stand-in browser spec and the unit/integration tests cover the protocol, the token and the permission.
- Phase 8 starts with: `CCRM_SSO_SECRET` / `CCRM_ORIGIN` / `WAAI_EMBED_ORIGINS` in WAAI's `.env.production`, the SSO mapping of each CRM user in WAAI, and a real-browser pass on the VPS (Chrome + Firefox) before the module is switched on for anyone but an administrator.
- A mistake to know about: none new. The `ccrm-waai` worktree is shared with the time-tracking session; its hunks (`TaskDashboardView`, `TaskEditDrawer`, `schema.php`, `time_entries*`) were left out of the phase 7 commits.

### Phase 6 notes

- CCRM (`1.13-nectarine`): chat chip (client, lead, project, contact cards), project contact phone field, `whatsapp` timeline entries with a link back into the chat, WhatsApp badge / "Open in chat" / "deadline not stated in chat" on tasks. Nothing is pushed.
- Verification: `npm run test:unit` 1060 pass, 0 fail (5 skipped, not ours); `npx tsc -p tsconfig.app.json --noEmit` and `tsconfig.qa.json` clean; the scoped browser run `tests/e2e/whatsappLinks.spec.ts` 7/7. Only that spec was run: the crawler over the changed modules and the screenshots were not (the machine ran out of memory twice, and the screenshot run was killed).
- Links go to `#whatsapp/…`, which opens the dashboard until phase 7 adds the module; chats reach only administrators until the `whatsapp` permission exists (phase 7).
- Not built: a timeline type filter chip (none exists) and the optional project list column.
- The worktree is shared with the time-tracking session: its uncommitted changes (including two hunks in `TaskDashboardView.tsx` and one in `TaskEditDrawer.tsx`) are not part of this commit.

### Phase 5 notes

- CCRM (`1.13-nectarine`): `timeline_events` ENUM migration (`'whatsapp'`), `external_url` column + automatic migration, `PUT /api/v1/timeline/external/{externalId}` (scope `timeline:push`) with idempotent upsert, stale revision handling, 410 gone after CCRM deletion, payload validation; sync GET/POST `externalUrl` exposure and preservation. `npm run test:integration`: 323 checks pass, 0 failed.
- WAAI (`feat/ccrm-integration`): `crm_timeline_created_hash` and `crm_timeline_done_hash` on `Task` (`20261029160000_crm_timeline`), `putTimeline` client method, `timeline` queue job, localized title generation (sk/en/hu), task creation and completion triggers, background timeline sweep. 103 unit tests pass. Full workspace typecheck, test, and lint clean.

### Phase 4 notes

- CCRM (`1.13-nectarine`): `GET /directory`, `PUT/DELETE /whatsapp/links/{ref}`, `PUT /whatsapp/numbers`, `projects.contact_phone`, `whatsapp_links` / `whatsapp_numbers`, the sync GET/POST changes, and CCRM's WAAI-visible messages (completion refused, deleted, not found) in en/sk/hu. `npm run test:integration` 301/301.
- WAAI (`feat/ccrm-integration`): directory cache, link rules, push of links, link chip and Settings section, task payload with `lead_id` / `project_id` / `start`. Nothing is pushed. End to end against scratch CCRM + scratch Postgres: 25/25.
- **A mistake to know about:** the phase 3 commit (`ba6056a`) had landed on WAAI's `main`, because another session switched the shared checkout back to `main` while phase 3 was being committed. `feat/ccrm-integration` was moved to that commit and phase 4 was done in a separate worktree, `../waai-ccrm`. `main` still contains `ba6056a` (it has 21 unpushed commits besides): taking it back off `main` is Peter's call and was not done, because the shared checkout has another session's uncommitted work on `main`.
- The fresh-database migration failure was a 63-character identifier cut; fixed by guarding the rename in `20260527085616_phase_7_migration` (spec §4.3).
- `Dockerfile.worker` / `Dockerfile.web` never copied `packages/crm-client`; fixed, not built here. Confirm first thing in phase 8.
- Decisions taken: an unknown linked record is ignored and reported (`ignored`) instead of failing the PUT; the WAAI-visible CCRM messages are localised, the administrator-facing ones are not; `whatsappLinks` in the sync GET is fail-closed (administrators only) until phase 7 adds the `whatsapp` permission.
- Left for later phases: the project contact-phone field and everything that shows links in the app (phase 6), timeline (phase 5), embed/SSO (phase 7).

### Phase 3 notes

- WAAI branch `feat/ccrm-integration` (from `main`), one commit: string CRM ids end to end (Prisma migration, `crm-client`, `crm-sync`, Settings → CRM types), `CRM_ID_FORMAT=integer` for all-inclusive-crm, docs. Nothing is pushed.
- End to end against a scratch CCRM and a scratch Postgres database: 18/18 (list in spec §4.3 "As built (phase 3)"). Scratch data removed.
- The WAAI checkout is shared: another session had uncommitted changes in `packages/jobs/src/wa-bus.ts` (WhatsApp message editing). They are not part of this phase and were not committed.
- Carried into phase 4 (Peter's decision): investigate and settle the fresh-database migration failure (`20260527085616_phase_7_migration`), and localise CCRM's `completion_refused` message by install language. Details in the spec, Phase 4.
- Phase 4 starts with the §4.4 pairing rules and the directory; the task payload's `lead_id` / `project_id` / `start` are still unused.

### Phase 2 notes (what differs from the spec)

- Full list of the as-built wire shapes, the date/completion rules and D9 are in the spec
  (§4.1 "As built (phase 2)"). In short: absent `lead_id`/`project_id` = untouched, `null` =
  cleared; a first push with no date stores today + 7 days and is marked "not stated in chat"
  (`dueInferred` in the sync response; a date the chat later takes back falls to the default again, v1.13.16); completing a task that needs a conclusion is 422
  `completion_refused` for both `PUT` and `/complete`.
- The task `url` is `<base>#tasks?task=<id>`. The SPA does not open a task from that link yet —
  it needs `TaskDashboardView` to read `?task=`, which belongs with the task badges (phase 6).
- Writes do not fire workflows, e-mails or ticket auto-resolve (same as the MCP task tools).
- Verification: `npm run test:integration` (214 checks, now including the real `sync.php`),
  `scripts/test-integration-lib.php` (113), `npm run test:unit`, `npx tsc -p tsconfig.app.json`.
  The scoped browser audit (`src/types/index.ts`) fails with two findings that are identical on
  the untouched `1.13-nectarine`: sidebar item #1 on the dashboard ("nothing changed") and the
  header "Spustiť časovač" button. Not caused by this phase; not on a known-failing list here.

### Phase 1 notes (what differs from the spec)

- Routing reads `REQUEST_URI` instead of a `?__route=` query parameter (`public/.htaccess`
  rewrite → `api/integration.php`): a percent-encoded `&` in a path can no longer inject
  query parameters.
- The rate limit is one atomic `INSERT … ON DUPLICATE KEY UPDATE` row per token and minute
  (`integration_rate`), not a `GET_LOCK` around a cache counter: parallel requests cannot
  read the same count.
- Management UI lives at Settings → Integrations → **WhatsApp (WAAI)**
  (`integrations/waai`, administrators only), not a new `SETTINGS_TABS` entry. It saves with
  an explicit Save button: it changes network and permission rules, so it is not autosaved.
- The SSO secret is not in the panel yet (phase 7); the column exists.
- `GET /users` returns every user: CCRM users have no inactive state.
- Verification: `npm run test:integration` (86 checks against a scratch copy of the dev
  database, needs the dev containers) and `npm run test:unit`.

## How to work

- **Phases 0 → 8 of spec §5, in order.** One phase at a time; finish it (code, tests,
  docs, commit) before the next. **Stop and report to Peter after phases 3, 6 and 8**,
  and whenever a phase changes the plan.
- **CCRM: work in your own git worktree** (`../ccrm-waai`, branch `1.13-nectarine` — see
  "Branches"). Other Claude sessions edit the main checkout at the same
  time: never `git stash`, never `git add -A` in the main checkout, never rebuild `dist/`
  there. The QA port 5273 and RAM are shared and the machine is short on memory — if the
  port is busy, wait and retry; never kill another session's process; don't start extra
  Chromium/Vite processes casually.
- **WAAI: new branch** `feat/ccrm-integration` from the agreed base (D4); commit there.
- Backend source in CCRM is `public/`; mirror with `npm run sync:backend`. All DDL goes in
  `public/api/schema.php`. Lint PHP with
  `docker run --rm -v <dir>:/app -w /app php:8.2-cli php -l <file>` (Git Bash:
  `MSYS_NO_PATHCONV=1`, `pwd -W`).
- Type-check CCRM with `npx tsc --noEmit`; run `npm run test:unit`; run the QA audit only
  as `node scripts/qa/run-qa.mjs --files <files you changed>` and read
  `test-results/qa-audit-report.md`. Never loosen a check to make a finding disappear.
- WAAI: `pnpm typecheck`, `pnpm test`, `pnpm lint` before every commit; local runs use
  `WA_PROVIDER=mock` and `pnpm seed:demo` — never a real WhatsApp session.
- CCRM commits: one build = one version bump in `src/utils/version.ts` + changelog entry;
  suffix the commit message with the version tag; order **test → bump → changelog → build →
  commit**. End commit messages with the attribution lines your session gives you.
- Push only when Peter says so. Never deploy, never touch a production database, never
  run `npm run deploy` or `php ccrm update` on a live install without Peter's explicit go.
- **Secrets:** never write a password, token or secret into a file, doc, memory, commit or
  chat. SSH is key-based only. The plain-text password in WAAI's `AGENTS.md` must not be
  used or repeated.
- Report every phase as: what was built → how it was verified (commands + results) → what
  is left / known issues. If a test fails, say so with the output.
- Keep `docs/WAAI-INTEGRATION.md` current: when an implementation detail is settled
  differently from the spec (with Peter's OK), update the spec in the same commit.

## Definition of done (whole project)

- WhatsApp module in CCRM shows the full WAAI, signed in via SSO, with deep links, theme
  and language sync, voice notes and uploads working.
- Client, lead and project views show the right WhatsApp action for their linked chats;
  projects have a contact phone field.
- Tasks extracted in WAAI appear in CCRM on the right client/project and stay in two-way
  sync; done in either app is done in both.
- Task-created/task-done entries appear on the linked client's timeline with a link back
  into the chat.
- All tests in both repositories green; security checklist (spec §4.9) ticked; deployment
  runbook (spec §4.10) executed with Peter.
