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

1. **D4** — WAAI base branch: `feat/clickup-sync` or `main`? **Still open — needed before
   phase 3.**
2. **D5** — CCRM base branch: **`1.13-nectarine`** (decided, see above).
3. **D7** — relax CCRM's CSP to `frame-src 'self' https:`? Not needed before phase 7 — ask
   then.
4. **D11** — default deadline for tasks the chat gave no date: today + 7 days. Not needed
   before phase 2 — the default is built in and configurable per client, so go ahead unless
   Peter says otherwise.

D1/D3 (which VPS, which CCRM install, same host or not) are only needed for phase 8 —
ask then.

## Progress

| Phase | Status |
|---|---|
| 0 | CCRM worktree `../ccrm-waai` on `1.13-nectarine`. WAAI branch not created yet (waits for D4). |
| 1 | Done — see "Phase 1 notes" below and the changelog entry. |
| 2–8 | Not started. |

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
