# Newsletter: the one file

This is the **only** document for the Newsletter module: decisions, status, what each phase
builds, which parts run in parallel, and the full specification. Source: ClickUp
[email editor modul](https://app.clickup.com/t/869f4y274) ("newsletter → kampaň; klienti povinná
kategória, ostatné voliteľné; editor; globals - header") and the decisions Peter made on
2026-11-09 (Part B).

> **To start work, tell the orchestrating agent:** `make newsletter phase 1` (or "the next
> newsletter phase"). It reads this file and follows Part A.

---

# Part A. How to work with this file

## A1. The protocol for "make newsletter phase N"

A phase is split into **work packages** (1A, 1B, 1C, ...). The packages of a phase touch
disjoint files, so they run **in parallel**, each in its own worktree. The contracts between
them (database, API, document schema, component props) are fixed in Part C, so no package
waits for another one inside the same phase.

**Orchestrator (Opus, main session):**

1. Read this whole file and the repo rules: `CLAUDE.md`, `docs/TESTING.md`, `docs/VIEW-SIZE.md`,
   everything in `.agents/rules/`, and "Adding a permission" in
   `docs/db_integration_notes/RBAC_SYSTEM.md`.
2. Check the status table (A2). Every earlier phase must be ✅, or its **Left over** items are
   done first. If phase N is ✅, stop and tell the user.
3. Start one `ccrm-implementer` agent per package (`model: sonnet`, the effort given in A2;
   at most 3 at once). Give each the package prompt: "Implement package NX of
   `docs/NEWSLETTER.md`. Read Part A3, Part B and the Part C sections the package lists.
   Build only the package checklist." plus the verbatim line:
   > Verify with `npm run check` only. Do not run browser QA, do not push, do not wait for CI.
   > Commit on your worktree branch; the orchestrator merges.
4. When they report: merge one by one with `node scripts/agent/finish-worktree.mjs <name>`,
   run `npm run check` on the merged result, then **one** scoped QA run
   (`node scripts/qa/run-qa.mjs --files <changed files>`), then a `ccrm-reviewer` pass over the
   phase diff against this file. Fix or send back what the review confirms.
5. Update this file in a docs commit: tick the boxes, fill the status table (status, commit,
   date), write deferred or assumed items under **Left over**, add what you learned to
   **Findings (A5)**. ✅ only when every box is ticked and the checks are green.
6. Report to the user: what was built, test results (with output of failures), what was
   deferred or assumed, bugs in existing code as **symptom → root cause → proposed fix**.
7. Stop. Do not start the next phase. A build happens only when the user says "make a build"
   (`.agents/rules/make-a-build.md`).

A single agent may also build a whole phase alone: it does the packages one after another
in one worktree and follows the same checklists.

**Implementer (Sonnet, one package):**

1. `node scripts/agent/link-deps.mjs` first. Never `npm install`.
2. Read A3, Part B, and the Part C sections your package lists. Build only your checklist.
3. Part B is final. If the code disagrees with this file (a helper is missing, a column has
   another name), adapt the smallest way and **write it in your report**. If the disagreement
   changes behaviour, stop and report instead of guessing.
4. Commit with a changelog fragment (`changelog.d/`, see `.agents/rules/commit-and-versioning.md`).
   Never bump the version.
5. Report under 300 words: files, commits, `npm run check` result, deviations from this file,
   open questions.

## A2. Status

Legend: ⬜ not started · 🟡 built but not finished (see Left over) · ✅ done (merged, checks green)

| Phase | Package | Agent effort | Status | Commit | Date |
|---|---|---|---|---|---|
| 1 Foundation | 1A Backend core (schema, API, audience) | Sonnet, high | ✅ | `6c2f9582`, `1cf3d559` | 2026-11-09 |
| | 1B E-mail builder (schema, renderer, editor UI) | Sonnet, high | ✅ | `12febb45`, `16bb36f3`, `c9f95f02` | 2026-11-09 |
| | 1C Module shell (wiring, RBAC, list, campaign screen) | Sonnet, medium | ✅ | `95cd7b7f` | 2026-11-09 |
| 2 Sending and integration | 2A Sending engine and public pages | Sonnet, high | ✅ | `09bc4e92`, `51ae465d` | 2026-11-09 |
| | 2B Builder in the app, review and send, results | Sonnet, medium | ✅ | `b4be3883`, `51ae465d` | 2026-11-09 |
| | 2C Demo data (en, sk, hu) | Sonnet, medium | ✅ | `50218c88` | 2026-11-09 |
| 3 QA and polish | 3A E2E journey, QA registration, view-size pass | Sonnet, medium | 🟡 | `56c7d013`..`fa18ee23`, fixes on top | 2026-11-09 |
| | 3B Client profile: newsletter status | Sonnet, low | ✅ | `11494794`, review fixes | 2026-11-09 |
| | 3C Contact first/last name, demo wipe fix | Sonnet, high | 🟡 | `cb67fc93`, `61e1e206`, review fixes | 2026-11-09 |

Branch: everything goes on `1.13-nectarine`, through worktrees (`.agents/rules/agent-worktrees.md`).

Dependencies: phase 2 needs phase 1 merged (2A uses 1A's tables and 1B's merge-tag fixture; 2B
mounts 1B's builder inside 1C's screens; 2C writes 1B documents into 1A's tables). Phase 3 needs
phase 2. Inside phase 3 the three packages run in parallel, with two small overlaps the orchestrator
resolves on merge: 3B and 3C both touch `ClientsView.tsx` (3B a mount line in the profile, 3C the
contact field of the edit form), and 3A's view-size pass and 3C both may touch
`newsletter/AudienceEditor.tsx` (3C adds one line to the live count). Merge 3C last.

## A3. Rules that apply to every package

- **Backend:** edit `public/` only, then `npm run sync:backend`. Lint PHP through Docker when PHP
  is not installed: `docker run --rm -v <dir>:/app -w /app php:8.2-cli php -l <file>`.
- **No new npm dependencies.** The builder uses native HTML5 drag and drop (pattern:
  `src/components/pdf/OfferBlockDocument.tsx`), `contenteditable` with `document.execCommand`
  (pattern: `src/components/ui/TicketRichHtmlEditor.tsx`) and the allowlist sanitiser
  `src/utils/safeHtml.ts`. Worktrees share `node_modules` through a junction, so a new package
  cannot be installed from a package anyway.
- **Newsletter data never enters the `sync.php` blob**, and nothing is added to the `?probe=1`
  path. All reads and writes go through `public/api/newsletter.php` (pattern:
  `public/api/time_entries.php`: `ccrm_require_auth()`, `ccrm_read_scope`, `ccrm_can`).
- **Large files** (`App.tsx`, `SettingsView.tsx`, `public/sync.php`, `schema.php`, `auth.php`, ...)
  get only registration lines. New code goes into new files under `src/components/newsletter/`
  and `public/api/newsletter*.php` (`.agents/rules/large-files.md`). No new file over ~600 lines.
- **UI:** reuse `PageHeader`, `Surface`, `Tabs`, `Toolbar`, `StatGrid`, `EmptyState`
  (`src/components/layout/`), `CustomSelect`, `HoldToConfirm`, `ConfirmDialog`, `UndoToast`,
  `ClientSelect`, `ColorPicker`, `InlineRenameName` (`src/components/ui/`). Every visible string
  is `t(en, sk, hu)`. Raw Tailwind palette classes like the rest of the codebase (this repo does
  not use semantic colour tokens). Type, spacing and layout follow `docs/VIEW-SIZE.md`.
- **Branding** (`docs/BRANDING.md`): e-mails and public pages show the **company's** name (company
  profile), never the product name and never the word "CRM".
- **Demo mode never sends a real e-mail** (C10).
- **Licensing** never disables the module (`.agents/rules/licensing.md`).
- **Shared checkout:** never `git stash`, never `git add -A`; stage your own files.

## A4. Phase checklists

### Phase 1: Foundation (1A, 1B, 1C in parallel)

**1A Backend core** (Sonnet, high). Reads C2, C3, C4, C5, C14 (server part).
Files: `public/api/schema.php`, `public/api/newsletter.php`, `public/api/newsletter_audience.php`,
`entities_overview.md`, `scripts/test-newsletter.php`, `package.json` (one script line), mirrors.

- [x] Tables `newsletter_campaigns`, `newsletter_recipients`, `newsletter_suppressions` in
      `ccrm_schema_statements()` exactly as C2 (no foreign keys, like the rest of the schema)
- [x] `entities_overview.md` documents the three tables and the `NEWSLETTER_CONFIG` setting
- [x] `newsletter.php`: every **read**, **write** and **settings** action of C4 (not the send
      actions, those are 2A), with the permission checks of C14. Uses the key names of C14 even
      though 1C adds them to the RBAC registry in parallel
- [x] `settings_get` returns defaults (C3) when `NEWSLETTER_CONFIG` is missing; `settings_save`
      validates and normalises (numbers clamped, colours `#rrggbb`, docs must be `version: 1`)
- [x] `newsletter_audience.php`: `ccrm_newsletter_resolve_audience(PDO, array $audience): array`
      implementing C5 (sources, dedupe, precedence, suppressions, invalid addresses, merge values,
      first-name title stripping) as pure-ish functions that the test can call without a database
      where possible; `audience_preview` uses it
- [x] `upload_image` (C4): type and size checks, random file name under the uploads dir,
      absolute URL through `ccrm_app_base_url()`; `images` lists the last 200
- [x] `scripts/test-newsletter.php` + `npm run test:newsletter`: extra-address parsing
      (`Name <a@b.c>`, commas, semicolons, new lines, invalid), dedupe precedence, suppression
      skip, first-name extraction (`Ing. Peter Novák` → `Peter`)
- [x] `npm run sync:backend`; PHP lint of every changed file; `npm run check`
- [x] Changelog fragment
- Left over: `list` returns at most 500 campaigns, without paging (low priority).

**1B E-mail builder** (Sonnet, high). Reads C6, C7, C8, C9. Pure frontend, self-contained:
it does **not** call the API (uploads come in through a prop).
Files: `src/components/newsletter/builder/**`, `src/utils/safeHtml.ts` (one new profile).

- [x] `builder/types.ts`: `EmailDoc` and friends exactly as C6, plus `NewsletterTheme` (C3)
- [x] `builder/defaults.ts`: `newBlock(type)`, `newRow(layout)`, `defaultBody(lang)`,
      `defaultHeader(company, lang)`, `defaultFooter(company, lang)` (C6, C3)
- [x] `builder/docOps.ts`: pure immutable operations (insert, move, duplicate, remove block; insert,
      move, duplicate, remove row; change row layout keeping blocks; update block/row) +
      `docOps.test.ts`
- [x] `builder/renderEmail.ts`: `renderEmail()` and the plain-text version exactly as C7 +
      `renderEmail.test.ts`
- [x] `builder/mergeTags.ts`: parse, list, substitute (C9) + `builder/mergeTags.fixtures.json`
      (the shared cases 2A's PHP reuses) + `mergeTags.test.ts` reading that fixture
- [x] Sanitiser profile `newsletter` in `src/utils/safeHtml.ts` (C6 allowlist; `href` values that
      are merge tags such as `{{unsubscribe_url}}` survive)
- [x] `EmailBuilder` component with the props of C8 and every interaction in C8's acceptance list;
      `EmailPreview` (sandboxed iframe of the real rendered HTML, desktop/mobile)
- [x] Phone width: notice plus preview only (C8); dark mode: chrome follows the app, the e-mail
      canvas stays light
- [x] Every string `t(en, sk, hu)`; no file over ~600 lines
- [x] `npm run check`; changelog fragment
- Left over: nothing has run in a browser yet. 2B must check by hand: drag and drop, the text
  format bar, keyboard after Escape, image upload, the preview. `html` blocks get no `dangerous_url`
  check (the author's own markup; the view-online page's CSP blocks scripts).

**1C Module shell** (Sonnet, medium). Reads C1, C4 (as a client), C5 (the shape only), C12, C13,
C14. Does **not** import anything from `builder/` (it does not exist in this worktree): the campaign
body is typed as an opaque `EmailDocJson` and the Content card is a placeholder that 2B replaces.
Files: registration lines in `App.tsx`, `Sidebar.tsx`, `StartMenu.tsx`, `moduleCatalog.ts`,
`permissions.ts`, `public/api/permissions.php`, `public/api/setup.php`, `translations.ts`,
`translations.settingsNav.ts`, `settingsRegistry.ts`, `SettingsView.tsx`, `src/types/index.ts`;
new files under `src/components/newsletter/` (not `builder/`).

- [x] RBAC section `newsletter` (C14) in `src/utils/permissions.ts`, mirrored in
      `public/api/permissions.php`, labels in en/sk/hu, route mapping `newsletter` → `newsletter`;
      legacy keys `newsletter.view` / `newsletter.edit` in `public/api/setup.php` reconciled (say how)
- [x] Remove the unused legacy `NewsletterCampaign` type from `src/types/index.ts` (check it is unused)
- [x] Route ids `newsletter`, `newsletter/<id>`, `newsletter/<id>/design` (the last one renders a
      placeholder until 2B) through `validTabs`, the render switch, `canOpenRoute`, lazy-loaded with
      `safeLazy`, gated by the permission and `disabledModules`
- [x] Sidebar item + saved-layout migration, Start menu entry, module catalog entry (en/sk/hu
      title, description, long description, icon `Mail` or `Send`, colour)
- [x] `newsletter/newsletterApi.ts`: typed client for every C4 action (send actions included, so 2B
      only wires buttons), `newsletter/types.ts` for the API shapes
- [x] Campaign list screen (C12) with the Campaigns and Unsubscribed tabs
- [x] Campaign screen for drafts (C12): header with inline rename, Recipients card with the full
      `AudienceEditor` and live count, Sender and subject card, Content card placeholder, Review card
      placeholder; read-only summary for non-draft statuses (the results view is 2B)
- [x] Settings category `newsletter` with sections `design` and `sending` (C13) registered with
      translations (title, hint, kw in en/sk/hu) and placeholder panels; `sending` fully built (its
      fields need no builder); `design` theme fields built, header/footer slots left for 2B
- [x] `npm run check` (includes `settingsRegistry.test.ts`, permission mirror test); changelog fragment
- Left over: the Content and Review cards, the design route and the Settings header/footer cards are
  placeholders (2B). `newsletter/types.ts` has its own `EmailDocJson` and `NewsletterThemeJson`; 2B
  switches them to the `builder/` types.

**Phase 1 verification (2026-11-09):** `npm run check` green on the merged result (type-check,
unit tests incl. 130 builder tests, backend mirror, symbol audit); `test:newsletter` green (Docker
PHP 8.2); two `ccrm-reviewer` passes, every confirmed finding fixed (`1cf3d559`, `c9f95f02`).
Scoped browser QA: see A5 (it needs 1.5 GB free RAM).

### Phase 2: Sending and integration (2A, 2B, 2C in parallel)

**2A Sending engine and public pages** (Sonnet, high). Reads C4 (send actions), C9, C10, C11.
Files: `public/api/newsletter_send.php`, `public/api/newsletter_mailer.php`,
`public/api/newsletter_merge.php`, `public/api/newsletter_public.php`, `public/api/newsletter.php`
(send actions only), `public/api/cron.php` (one guarded call), `scripts/test-newsletter.php`.

- [x] `newsletter_merge.php`: substitution identical to `builder/mergeTags.ts` (follow the rules in
      its header comment and C9 exactly); the PHP test runs every case of
      `src/components/newsletter/builder/mergeTags.fixtures.json` (44 cases)
- [x] `newsletter_mailer.php`: MIME `multipart/alternative`, headers of C10 (incl.
      `List-Unsubscribe` and `List-Unsubscribe-Post`), RFC 2047 subject, quoted-printable bodies,
      dot-stuffing, one SMTP session per batch with the **system mail profile**; reuse the low-level
      SMTP helpers of `mail_broker.php` only if they are separate functions, never grow that file
      (they are not: `newsletter_mailer.php` has its own small client; `mail_broker.php` untouched)
- [x] Actions `send_test`, `start_send`, `pause`, `resume`, `cancel`, `tick` (C4, C10), added to the
      `$routes` array of `newsletter.php` (helpers go in `newsletter_send.php` / `newsletter_lib.php`),
      including the validations and the atomic `draft → sending` switch. `start_send` also checks
      `ccrm_newsletter_audience_valid()` and refuses HTML with a `javascript:`, `vbscript:` or `data:`
      href (defence in depth behind the renderer's `dangerous_url`; also inside a leading merge tag's
      fallback since `51ae465d`)
- [x] The worker, `tick`, `resume` and `cancel` ignore soft-deleted campaigns (`deleted_at IS NULL`):
      `delete` is allowed for paused campaigns that still have queued rows
- [x] Worker `ccrm_newsletter_tick()` (C10): lock, hourly limit, batch, retries, SMTP failure →
      paused with `last_error`, hard bounce → suppression, campaign → `sent` when the queue is empty
- [x] `cron.php` calls the worker once per run inside try/catch (a newsletter error never breaks
      the other cron jobs). Never from `sync.php`
- [x] Demo mode: no SMTP connection at all; recipients are marked sent; `send_test` answers
      "demo, nothing was sent"
- [x] `newsletter_public.php` (C11): unsubscribe page (GET shows, POST confirms), RFC 8058
      one-click POST, view-online page, `t=test` page, unknown-token page; runs without a session
- [x] PHP test: MIME builder (headers present, encoded subject, QP line length ≤ 76,
      dot-stuffing), merge parity, unsubscribe idempotency (pure parts)
- [x] `npm run sync:backend` (it only updates root copies that exist: copy each **new** PHP file to
      `api/` by hand once); PHP lint; `npm run check`; changelog fragment
- Left over: the worker paths that need a real SMTP server (retry and backoff, bounce → suppression,
  pause on a login failure, the hourly allowance) are covered only by the PHP unit test with a
  scripted SMTP stream, not end to end. The manual check in C16 (before the first build) should also
  send one campaign through the worker; a local Mailpit can serve as the SMTP server for it.

**2B Builder in the app, review and send, results** (Sonnet, medium). Reads C3, C8 (props), C10
(statuses), C12, C13. Frontend only; uses 2A's actions through 1C's `newsletterApi.ts` (the
contract in C4 is fixed, so it does not wait for 2A).
Files: `src/components/newsletter/**` except `builder/`, the newsletter settings panels.

- [x] Design route `newsletter/<id>/design`: full-page `EmailBuilder` (body mode) with locked global
      header/footer, autosave (debounce 1.5 s, flush on leave; follow
      `docs/UNSAVED-DRAFTS-DECISIONS.md`), save status, Preview, Send test
- [x] Content card: scaled live thumbnail, "Edit design", header/footer toggles with the unsubscribe
      warning
- [x] Review and send card: checklist (C12), Send test dialog, **Hold to send** (`HoldToConfirm`),
      disabled states with the reason; `start_send` posts the HTML and text from `renderEmail()`
- [x] Results view for sending/paused/sent/cancelled (C12): progress, `StatGrid`, pause/resume/cancel,
      `last_error` banner, view e-mail, recipients table (paged, status filter, search); polls `tick`
      every 5 s while sending and the tab is visible
- [x] Settings › Newsletter › Design: header and footer editors (builder in header/footer mode, route
      `settings/newsletter/design/header|footer`), theme preview
- [x] Image upload and the uploaded-images picker wired to `upload_image` / `images`
- [x] `npm run check`; changelog fragment
- Left over: **nothing of the newsletter UI has run in a browser yet** (subagents run no browser and no
  spec covers `src/components/newsletter/`; the scoped QA run selected nothing for those files). This is
  now a box in 3A. Known small things for that pass: Back from the design route can show a stale
  thumbnail for a moment (the unmount flush is asynchronous); the builder's height is a fixed
  `calc(100dvh - …)`; the newsletter `Dialog` has no focus trap; **Hold to send** uses
  `HoldToConfirm tone="archive"` (the component has only `danger` and `archive`).

**2C Demo data** (Sonnet, medium). Reads C2, C3, C6, C15 and `docs/DEMO-MODE.md`.
Files: `public/api/demo_seed/**`, `docs/DEMO-MODE.md`, `README.md` (demo module list line).

- [x] Module `newsletter` registered in the demo seeder; `demo_seed/newsletter.php` and
      `packs/en|sk|hu/newsletter.php` (C15); bodies, header and footer are valid `EmailDoc` JSON
- [x] Re-seed replaces and wipe empties the three tables and `NEWSLETTER_CONFIG` (follow how other
      modules mark demo rows)
- [x] `npm run test:demo-packs`, `test:demo-seed`, `test:demo-wipe` pass (Docker PHP if needed).
      `test:demo-seed` has 4 failures, all `employees: E1-E3 have no leave in the last five weeks`;
      they fail the same way on `a0e36820`, before this package (not newsletter code)
- [x] `docs/DEMO-MODE.md`: the newsletter part of the story and numbers
- [x] `npm run sync:backend`; `npm run check`; changelog fragment
- Left over: (1) in the Hungarian edition `{{first_name}}` resolves to the family name, because
  `ccrm_newsletter_first_name()` (1A) takes the first word and Hungarian contacts are written
  surname-first. **Moved to 3C** (decision B1.5: store first and last name separately). (2)
  `demo_wipe_by_prefix` also matches `newsletter_recipients.lead_id` / `employee_id`, so wiping the
  demo deletes a user's own recipient rows that point at demo leads, and its row count counts such a
  row once per matching column (22 for 11 rows). This is **not** what other modules do (see A5).
  **Moved to 3C** (decision B1.6). (3) The wipe test's fake PDO does not interpret the lookup of the
  manual suppression by e-mail, so that one path is untested (3C adds the check).

**Phase 2 verification (2026-11-09):** `npm run check` green on the merged result and again after the
review fixes; `test:newsletter` green (Docker PHP 8.2, incl. the 44 merge fixtures and the new
fallback cases); `test:demo-packs` and `test:demo-wipe` green, `test:demo-seed` with the 4 known
employee failures. Scoped browser QA (`src/App.tsx`, `SettingsView.tsx` and the newsletter files):
29 of 30 passed; the failure is `timeTracking.spec.ts:271` (time tracking's `project-request-dialog`
stays open over the row the test clicks; not newsletter code, see A5). One `ccrm-reviewer` pass: 7
confirmed findings, all fixed in `51ae465d`. The public pages answered correctly against the dev
stack's MySQL (`t=test` 200, unknown token 404 for GET and the one-click POST, C11 headers present).

### Phase 3: QA and polish (3A, 3B, 3C in parallel)

**3A E2E and QA** (Sonnet, medium). Reads C16.
Files: `tests/e2e/helpers/newsletterMock.ts`, `tests/e2e/newsletter.spec.ts`,
`tests/e2e/crawler.spec.ts`, `tests/e2e/darkmode.spec.ts`, `scripts/qa/run-qa.mjs`.

- [x] Stateful mock of `/api/newsletter.php` (pattern: `tests/e2e/helpers/timeTrackingMock.ts`),
      including the send actions and the error codes of C4
- [ ] **First browser run** of the builder and the send flow (left over from 1B and 2B): every item of
      C8's acceptance list, autosave (status chip, edits survive Back and reload, the "leave without
      saving" dialog after a failed save), Send test with a sample recipient (the dropdown paints above
      the dialog), Hold to send in demo mode, results polling, Pause / Resume / Cancel, Settings ›
      Newsletter › Design header/footer editors. What the spec cannot cover, the orchestrator checks
      by hand in a browser
- [x] Journey spec of C16; crawler and dark-mode registration; QA area mapping
- [ ] View-size pass over every newsletter screen (`docs/VIEW-SIZE.md`); fix what it finds inside
      `src/components/newsletter/`
- [x] `npm run check`; changelog fragment. The orchestrator runs the scoped QA, not the agent
- Left over: (1) **the browser run is incomplete.** The first scoped run reached the newsletter spec:
  the C16 journey passed from New campaign through the audience count, subject autosave, the design
  route (Text and Button blocks), Back with the flushed body, the checklist and Send test, then failed
  on an intermediate progress of 50 %. Cause: the results page polls `tick` at once on mount, twice under
  React StrictMode in dev, so the first visible value was 100 %. The spec now stops the mock worker,
  checks 0 %, starts the worker and waits for the page's own polling to reach sent (review-fix commit).
  The run then ended with the session, so the other 16 newsletter tests have **not run yet**; a second
  run was stopped by the system for low memory. Run
  `node scripts/qa/run-qa.mjs --files tests/e2e/newsletter.spec.ts` when the machine has 1.5 GB free.
  (2) Manual browser checks still open (the spec cannot cover them): C8 row drag and moves, inline
  toolbar and paste, image upload, row panel, social block, HTML iframe, Ctrl+Z keys, phone-width
  message, dark-mode canvas; the view-size pass at the four reference sizes (the agent's grep found no
  hand font sizes, pixel widths or `sm:` breakpoints, so nothing was changed). (3) Not fixed: the
  builder's fixed `calc(100dvh - 7rem)` height; Hold to send uses `HoldToConfirm tone="archive"`.
  Fixed in 3A: Dialog focus trap with focus restore; no stale thumbnail after Back (`settleSaves()` in
  `useDebouncedSave.ts`); test ids on the save and status chips. Review fix: the Dialog no longer
  re-focuses its first field when the parent re-renders (inline `onClose` kept in a ref).

**3B Client profile: newsletter status** (Sonnet, low). Reads C12 ("Client profile").
Files: one new component under `src/components/newsletter/`, one mount line in the client
detail view, one read action in `newsletter.php`.

- [x] Action `contact_status {emails[]}` → per address: unsubscribed (date, campaign) and the last
      5 campaigns it was sent; view permission
- [x] Small "Newsletter" block on the client profile: campaigns received, "Unsubscribed on <date>"
      badge; hidden without newsletter access
- [x] `npm run sync:backend`; `npm run check`; changelog fragment
- Left over: none. Review fixes (`cf1a0e7d`): the block now asks only when the user can open the module
  (`newsletterEnabled` passed from `App.tsx`; before, every profile open of a user without access sent a
  request that answered 403) and asks for every distinct address of the profile (client and member
  leads), not only the client's own e-mail.

**3C Contact first and last name, demo wipe fix** (Sonnet, high: schema and sync change). Reads C18,
C5 step 7, C4 (`AudiencePreview`), `.agents/rules/database-schema-and-sync.md` and the employee
precedent (`public/api/employee_name.php`, `src/utils/employeeIdentity.ts`).
Files: `public/api/schema.php`, `public/sync.php` (registration lines: column healing and the field
mapping), `entities_overview.md`, `src/types/index.ts`, a new `src/utils/contactName.ts` (+ test), a new
`src/components/ui/ContactNameFields.tsx`, mount lines in every form that types a contact person
(`LeadsDatagrid.tsx`, `ClientsView.tsx`, `priceOffers/NewClientModal.tsx`, `ui/QuickAddClient.tsx`, any
other the implementer finds), the PHP writers of `contact_person` that are not the form (C18),
`public/api/newsletter_audience.php`, `newsletter/AudienceEditor.tsx` + `newsletter/types.ts` (one count),
`scripts/test-newsletter.php`, `public/api/demo_seed/helpers.php`, the demo packs that hold contacts,
`scripts/test-demo-wipe.php` (or its assert file), `translations*.ts` as needed, mirrors.

- [x] Columns `leads.contact_first_name` and `leads.contact_last_name` with the **4-place rule**:
      `CREATE TABLE` in `schema.php`, idempotent migration in `ccrm_apply_migrations()`, pre-transaction
      column healing in `public/sync.php` (above `beginTransaction()`), `entities_overview.md`,
      `npm run sync:backend`. Synced fields `contactFirstName` / `contactLastName` on the lead type
- [x] One-time backfill (C18): split existing `contact_person` with `ccrm_split_person_name()`; rows
      it cannot split stay empty; guarded so it never runs twice and never overwrites typed parts. If
      the migration `require`s a new file, add it to `ccrm_schema_fingerprint()`
- [x] `contactName.ts` (`composeContactName`, mirrors the PHP rule) + unit test; `ContactNameFields`
      ("First name" / "Last name", en/sk/hu) replaces the single contact field in every form; the full
      `contact_person` is composed on save. Large files get only the mount line
- [x] Every other writer of `contact_person` (MCP write tools, company-register lookup, workflows,
      orders, pipeline, …) keeps the parts consistent (C18); list each one in the report
- [x] Newsletter: `first_name` comes from `contact_first_name` (titles stripped), never guessed from the
      full name; `AudiencePreview.withoutFirstName`; the live count shows "N without a first name"
- [x] Demo: packs give each contact a first and last name (Hungarian: given name in `first`);
      `test:demo-packs`, `test:demo-seed`, `test:demo-wipe` as before (the 4 employee failures are known)
- [x] Demo wipe (B1.6): `newsletter_recipients` rows go only by `campaign_id`; a two-entry skip list
      (`newsletter_recipients.lead_id`, `.employee_id`) used by both `demo_wipe_by_prefix()` and
      `demo_count_by_prefix()`; the wipe test asserts that a non-demo campaign's row pointing at a demo
      lead survives, that 11 demo rows count as 11, and covers the manual-suppression lookup by e-mail
- [x] PHP test: backfill split cases (incl. one word, comma, trailing title), newsletter `first_name`
      from the stored field with a title, a Hungarian contact (`Péter` / `Kovács` → `Péter`)
- [x] `npm run check`; changelog fragment. After the merge the orchestrator runs
      `npm run test:persistence` from the main checkout (the new fields must survive a sync round trip)
- Left over: (1) a *person* client or lead with no contact name still gets `{{first_name}}` from the
  first word of its own name (`ccrm_newsletter_lead_candidate()` in `newsletter_audience.php`): the
  person forms have no fields to complete. **Decided (B1.7):** person records store their own first and
  last name; follow-up task `docs/prompts/newsletter-person-first-name.md`, not started. (2) `QuickAddClient.tsx` has no contact field, so it got none.
  (3) `scripts/import/villatesta/load.php` (one-off loader) writes `contact_person` without the parts;
  rows it loads after the backfill marker is set stay without parts (no `{{first_name}}`) until edited.
  (4) The Hungarian packs' `{contact:L7}` texts still read "Kovács Péter", while `contact_person` is now
  composed given-name-first ("Péter Kovács").

**Phase 3 verification (2026-11-09):** `npm run check` green on the merged result and after the review
fixes; `test:newsletter` green (Docker PHP 8.2); 3C's `test:demo-packs` and `test:demo-wipe` green,
`test:demo-seed` with the 4 known employee failures. `test:persistence` 68/68 (run as a patched copy:
the script hard-codes container `crm-19-jackfruit` and port 8086, the current stack is `crm` on 8085;
the new name fields were added to its field-complete lead). Scoped browser QA: crawler and dark-mode
registrations pass (Newsletter page included), navigation passes; the newsletter spec is incomplete (3A
Left over). The crawler's Leads / Pipeline finding (`DROPDOWN_DID_NOT_OPEN` on the "Všetky typy" /
"Všetky divízie" filters) also appears in the run of 2026-11-06, before this phase: pre-existing, not
triaged here. One `ccrm-reviewer` pass: 7 confirmed findings; 6 fixed in the review-fix commit, the
seventh (person-record first name) became decision B1.7 and its own task.

## A5. Findings

(Add what you learn while building: helper names that differ from this file, traps, decisions
the user made later.)

- 2026-11-09, planning: there is no contact-persons table. A lead or client has one `email`, one
  `phone` and one `contact_person` (`leads`), so a client contributes as many addresses as its lead
  rows have distinct e-mails. Suppliers have `contacts_json`; not used here.
- 2026-11-09, planning: outgoing mail is a hand-written SMTP client in `public/api/mail_broker.php`
  (`send_smtp_email`, `ccrm_system_mail_configured`, `ccrm_send_system_mail`). There is no queue,
  no retry, no unsubscribe and no tracking code anywhere.
- 2026-11-09, planning: VPS installs run `api/cron.php` every minute (`deploy/vps/cron-tick.sh`).
  Shared-hosting installs may have no cron; sending then continues only while a campaign page is open.
- 2026-11-09, phase 1: the API envelope (copied from `time_entries.php`) is flat: success
  `{ "success": true, ...payload }`, error `{ "success": false, "code": "...", "message"?: "..." }` with
  the HTTP status. `newsletterApi.ts` throws `NewsletterApiError { code, status, message }`.
- 2026-11-09, phase 1: `public/api/newsletter_lib.php` holds config, campaign JSON, doc checks and image
  helpers; `newsletter.php` is a `$routes` table. Permission names in it: `view`, `edit` (access key
  `newsletter`), `send`, `settings` (toggles `newsletter_send`, `newsletter_settings`).
- 2026-11-09, phase 1: no employment-end column exists; employees are filtered by `is_active = 1`.
  `created_by` / `updated_by` store the user's display name (like the rest of the schema).
- 2026-11-09, phase 1: `AudiencePreview` has `valid: boolean` (a pick audience with nothing picked
  previews as zero instead of failing); `suppression_add` also returns `invalid: string[]`; `update`
  refuses a malformed audience (`invalid_audience`) instead of defaulting to "all clients".
- 2026-11-09, phase 1: `npm run sync:backend` updates only root copies that already exist. A new
  `public/api/*.php` file has to be copied to `api/` by hand once (`check:backend` then keeps it in sync).
- 2026-11-09, phase 1: dark mode works by re-pointing the palette variables (`src/index.css`), so raw
  palette classes adapt without `dark:` variants. The e-mail canvas uses fixed hex colours.
- 2026-11-09, phase 1: `newsletter_settings` is in `SETTINGS_PERMISSION_KEYS`, so a holder of only that
  toggle can open Settings. The legacy seed rows `newsletter.view` / `newsletter.edit` were removed
  from `setup.php`; the unused `NewsletterCampaign` type was removed.
- 2026-11-09, phase 1: in a worktree-isolated session, Bash refuses `docker run` with a computed volume
  path. Lint from PowerShell instead: `docker run --rm -v "${pwd}:/app" -w /app php:8.2-cli php -l <file>`.
- 2026-11-09, phase 1: the scoped browser QA could not start on this machine (160-500 MB free RAM,
  the runner needs 1536 MB); it runs when memory allows or at the end of phase 2.
- 2026-11-09, phase 2: there was no shared demo-mode helper; `ccrm_newsletter_is_demo(PDO)` is in
  `newsletter_lib.php`. The company name in e-mails and public pages is
  `COMPANY_BILLING_SETTINGS.companyName`, else the system title, else empty ("this sender"); never the
  product name. Test e-mails get the subject prefix `[Test] `.
- 2026-11-09, phase 2: links in e-mails use **only the stored base URL** (`ccrm_app_base_url($pdo,
  false)`: `CCRM_APP_URL` in config.php, else `APP_BASE_URL`, written at the first admin sign-in).
  The cron worker has no request to fall back on, so `start_send`, `send_test`, `tick` and the public
  pages must not use the request host either. `ccrm_newsletter_tick($pdo, $budgetSec = 20, ?string
  $baseUrl = null)`; the browser's `tick` runs with 8 s, cron with 20 s; cron's JSON gains a
  `newsletter` key. The worker skips queued rows suppressed after `start_send`, and an unsubscribe
  marks the address's other queued rows skipped.
- 2026-11-09, phase 2: the server sends the **stored** subject, audience and sender; only the HTML and
  text come from the browser. So the campaign screen's `flush()` returns `false` on a failed save and
  Hold to send / Send test refuse to start on it (`51ae465d`). Keep that when touching the screen.
- 2026-11-09, phase 2: demo mode counts as a ready sender in the review checklist (`senderReady()` in
  `shared.tsx`); the demo seeds no SMTP profile. The demo `NEWSLETTER_CONFIG` carries `"demo": true`,
  which the wipe needs and the first Settings save drops (a user's own config survives a wipe).
  `DEMO_DATASET_VERSION` is 3. Demo texts avoid merge tags without an underscore (`{{company}}`): the
  demo placeholder resolver would replace them.
- 2026-11-09, phase 2: `ccrm_newsletter_first_name()` takes the first word of the contact person, so a
  Hungarian contact written surname-first ("Kovács Péter") gets `{{first_name}}` = "Kovács".
  Decided (B1.5): store first and last name separately; package 3C, spec C18.
- 2026-11-09, phase 2: how the generic demo wipe picks rows (`demo_wipe_by_prefix()` in
  `demo_seed/helpers.php`): a table with a text `id` column is wiped by that id only; its other
  `*_id` columns are matched **only** in tables without a text `id`. So a user's own task linked to a
  demo lead survives a wipe (its link goes stale), while `newsletter_recipients` (numeric id) had its
  `lead_id` / `employee_id` matched too. Decided (B1.6): recipient rows go by `campaign_id` only (3C).
- 2026-11-09, phase 2: z-index layers: the newsletter `Dialog` sits on the drawer layer
  (`z-[100000]`) so `CustomSelect` / `ColorPicker` panels (`100001`) paint above it; `ConfirmDialog`
  is `100020`. A newsletter overlay above `100001` hides every dropdown inside it.
- 2026-11-09, phase 2: the dev stack sends its global CSP and `Referrer-Policy` next to the public
  page's own. Browsers enforce both CSPs, so the strict `default-src 'none'` still holds; check the
  production server's headers in the manual test of C16.
- 2026-11-09, phase 2: the scoped QA failure `timeTracking.spec.ts:271` ("the timer bar takes a
  Description before Start…") is time tracking's `project-request-dialog` intercepting the click; time
  tracking was being changed by another session at the same time (`d9d1de75`). Not triaged here.
- 2026-11-09, phase 3: a one-time backfill `UPDATE leads` must pin `updated_at = updated_at`: the sync
  conflict guard compares it with every open tab's `baseSyncedAt`, so bumping it drops the next push of
  every tab until it refetches (the other backfills already pin it).
- 2026-11-09, phase 3: a component effect that depends on an inline callback prop re-runs on every
  parent render; hold such callbacks in a ref (the newsletter `Dialog` lost focus this way).
- 2026-11-09, phase 3: `run-qa.mjs` treats any file under `tests/e2e/helpers/` as a harness change and
  refuses without `--full`; pass the spec files only (the spec loads its mock). Under React StrictMode
  in dev an effect that fires a request on mount fires it twice, so a spec must not expect the state
  after exactly one poll.
- 2026-11-09, phase 3: two of three Sonnet implementers stalled (no output for 600 s) and were resumed
  with SendMessage; the uncommitted work in their worktrees survived. Ask implementers to commit each
  part as soon as it passes `npm run check`.
- 2026-11-09, phase 2: a worktree-isolated Bash session refuses commands that `cd` into the main
  checkout and long heredoc appends; edit with the Edit tool and run git from the worktree itself.

---

# Part B. Decisions (final)

## B1. Product decisions (Peter, 2026-11-09)

1. **Clients are the audience.** A campaign is sent *to* clients: the clients part of the audience
   is required (all clients, or chosen client categories and/or individual clients). Leads,
   employees and extra addresses are optional additions. This is the ClickUp note "klienti povinná
   kategória, ostatné voliteľné". A campaign has no single owner client.
2. **Own e-mail builder**, not Unlayer. Reasons: Koperniq is installed per company on its own
   domain; Unlayer runs from Unlayer's servers, brands the free editor, and charges from $250/month
   for white-labelling with per-domain whitelisting. With our own document format the global header,
   the campaign body and the global footer combine into one e-mail cleanly, and the editor looks like
   the rest of the app.
3. **Version 1 scope:** campaign list, campaigns sent to the audience of B1.1, the builder, global
   header and footer in Settings, test send, send now (queued, throttled), unsubscribe link and page,
   suppression list, results per recipient, **extra addresses** pasted into the audience.
4. **Not in version 1** (Part C17): open and click tracking, scheduled sending, a dedicated
   newsletter SMTP account, CSV subscriber lists and signup forms, bounce-mailbox processing,
   templates library, A/B tests.
5. **Contact names are stored as first and last name** (Peter, 2026-11-09, after phase 2), the way
   employees already are. `{{first_name}}` reads the stored first name and never guesses it from the
   full name. No name-order rule by system language (a Slovak install often has Hungarian contacts).
   Spec C18, package 3C.
6. **The demo wipe keeps a user's own campaign history** (Peter, 2026-11-09): recipient rows are
   wiped only by demo `campaign_id`, never by `lead_id` / `employee_id`. Package 3C.
7. **Person records store their own first and last name** (Peter, 2026-11-09, after the phase 3
   review). A lead or client of type `person` keeps the person's first and last name in
   `contact_first_name` / `contact_last_name` (a "Name for greetings" pair of fields in its forms);
   `name` and `contact_person` stay as they are. `{{first_name}}` is never guessed from `name`.
   Handoff: `docs/prompts/newsletter-person-first-name.md`.

## B2. Technical decisions

1. **Names.** Module "Newsletter" (sk "Newsletter", hu "Hírlevél"); its items are campaigns
   (sk "kampaň", hu "kampány"). Route `newsletter`, permission section `newsletter`, tables
   `newsletter_*`, endpoint `public/api/newsletter.php`.
2. **The builder renders, the server sends.** The e-mail HTML is produced only by
   `renderEmail()` in TypeScript (one renderer, unit-tested). When sending starts, the browser
   renders header + body + footer + theme and posts the HTML and plain text; the server stores them
   as the campaign's snapshot and only substitutes merge tags per recipient. What was previewed is
   what is sent. The server never renders blocks.
3. **Header and footer** are global `EmailDoc`s in `NEWSLETTER_CONFIG`. A campaign shows them
   locked in its editor and can switch either off. Changing them affects every campaign not yet
   sent; a sent campaign keeps its snapshot.
4. **Audience is resolved on the server** (`newsletter_audience.php`), both for the live count and
   when sending starts, so the browser never decides who receives mail.
5. **Recipients are frozen** when sending starts: one `newsletter_recipients` row per address, with
   a random token used by the unsubscribe and view-online links.
6. **Sending is a queue.** `start_send` only fills the queue. A worker sends batches under a lock,
   with an hourly limit, from `cron.php` (every minute on VPS installs) and from the open campaign
   page (`tick` poll). At-least-once: a row is marked sent right after the SMTP server accepts it.
7. **Sender** is the system mail profile (Settings › E-mail › Outgoing). The From address comes from
   that profile; the campaign may set From name and Reply-To.
8. **Opt-out model.** One global suppression list; every send skips suppressed addresses. Every
   e-mail must contain `{{unsubscribe_url}}` (the default footer has it; sending is refused without
   it). The UI tells the user to include leads and extra addresses only with their consent.
9. **Public pages are plain PHP** (`newsletter_public.php`), not SPA routes: they load fast from an
   e-mail client and work without JavaScript. GET never unsubscribes (link scanners prefetch GET);
   a POST does.
10. **No new tables in the sync blob**, so the sync.php column-healing rule does not apply to these
    tables. A later `ALTER` on them still goes into a `ccrm_migrate_newsletter()` migration.

---

# Part C. Specification

## C1. Concepts and lifecycle

- **Campaign**: name (internal), audience, subject, preheader, From name, Reply-To, body
  (`EmailDoc`), header/footer switches, status.
- **Status**: `draft` → `sending` → `sent`. `sending` ⇄ `paused` (by the user, or automatically when
  SMTP fails, with `last_error`). `sending`/`paused` → `cancelled` (remaining queued rows become
  `cancelled`). Only drafts are editable. Any campaign can be duplicated into a new draft. A campaign
  is "sent with N failures" when its queue is empty but some rows failed.
- **Recipient row**: one address of one campaign, `queued` → `sent` | `failed` | `cancelled`, or
  `skipped` from the start (unsubscribed or invalid address).
- **Suppression**: an address that never receives newsletters again (unsubscribed, hard bounce,
  added by hand).

## C2. Database

Three new tables in `ccrm_schema_statements()`. Times are UTC `DATETIME`. No foreign keys
(repo convention). Written only by `newsletter*.php`.

```sql
CREATE TABLE IF NOT EXISTS `newsletter_campaigns` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY COMMENT 'nlc-<random>',
  `name` VARCHAR(200) NOT NULL,
  `subject` VARCHAR(255) NOT NULL DEFAULT '',
  `preheader` VARCHAR(255) NULL,
  `from_name` VARCHAR(150) NULL COMMENT 'NULL = settings default',
  `reply_to` VARCHAR(190) NULL COMMENT 'NULL = settings default',
  `audience_json` TEXT NOT NULL COMMENT 'C5 Audience',
  `body_json` MEDIUMTEXT NULL COMMENT 'C6 EmailDoc',
  `use_header` TINYINT(1) NOT NULL DEFAULT 1,
  `use_footer` TINYINT(1) NOT NULL DEFAULT 1,
  `html_snapshot` MEDIUMTEXT NULL COMMENT 'Rendered e-mail at start_send, merge tags unresolved',
  `text_snapshot` MEDIUMTEXT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft | sending | paused | sent | cancelled',
  `last_error` VARCHAR(500) NULL,
  `recipients_total` INT NOT NULL DEFAULT 0 COMMENT 'Queued rows at start_send',
  `created_by` VARCHAR(50) NULL,
  `updated_by` VARCHAR(50) NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  `started_at` DATETIME NULL,
  `finished_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  KEY `idx_nlc_status` (`status`),
  KEY `idx_nlc_list` (`deleted_at`, `updated_at`)
);

CREATE TABLE IF NOT EXISTS `newsletter_recipients` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `campaign_id` VARCHAR(64) NOT NULL,
  `email` VARCHAR(190) NOT NULL COMMENT 'Lower-cased, trimmed',
  `name` VARCHAR(255) NULL,
  `source` VARCHAR(16) NOT NULL COMMENT 'client | lead | employee | extra',
  `lead_id` VARCHAR(50) NULL,
  `employee_id` VARCHAR(50) NULL,
  `merge_json` TEXT NULL COMMENT 'Merge values frozen at start_send (C9)',
  `token` CHAR(32) NOT NULL COMMENT 'bin2hex(random_bytes(16)); unsubscribe and view-online links',
  `status` VARCHAR(16) NOT NULL DEFAULT 'queued' COMMENT 'queued | sent | failed | skipped | cancelled',
  `skip_reason` VARCHAR(32) NULL COMMENT 'unsubscribed | invalid',
  `attempts` TINYINT NOT NULL DEFAULT 0,
  `next_attempt_at` DATETIME NULL,
  `error` VARCHAR(500) NULL,
  `sent_at` DATETIME NULL,
  `unsubscribed_at` DATETIME NULL,
  UNIQUE KEY `uq_nlr_campaign_email` (`campaign_id`, `email`),
  UNIQUE KEY `uq_nlr_token` (`token`),
  KEY `idx_nlr_queue` (`campaign_id`, `status`, `next_attempt_at`),
  KEY `idx_nlr_sent_at` (`sent_at`),
  KEY `idx_nlr_email` (`email`)
);

CREATE TABLE IF NOT EXISTS `newsletter_suppressions` (
  `email` VARCHAR(190) NOT NULL PRIMARY KEY COMMENT 'Lower-cased',
  `reason` VARCHAR(16) NOT NULL COMMENT 'unsubscribed | bounced | manual',
  `campaign_id` VARCHAR(64) NULL,
  `note` VARCHAR(255) NULL,
  `created_by` VARCHAR(50) NULL COMMENT 'NULL = the recipient (unsubscribe link) or the worker (bounce)',
  `created_at` DATETIME NOT NULL
);
```

Settings live in `system_settings` under the key `NEWSLETTER_CONFIG` (JSON, C3), written the way
other JSON settings are. Uploaded images are files under `<uploads dir>/newsletter/YYYY/MM/`
(no table).

## C3. Settings: `NEWSLETTER_CONFIG`

```ts
type NewsletterConfig = {
  version: 1;
  header: EmailDoc | null;          // null = use defaultHeader(company, lang)
  footer: EmailDoc | null;          // null = use defaultFooter(company, lang)
  theme: NewsletterTheme;
  sender: { fromName: string; replyTo: string };      // '' = none / company name
  sending: { batchSize: number; perHourLimit: number; testRecipients: string[] };
};
type NewsletterTheme = {
  contentWidth: number;      // 520..800, default 600
  pageBackground: string;    // default '#f1f5f9'
  contentBackground: string; // default '#ffffff'
  fontFamily: string;        // one of the web-safe stacks in builder/defaults.ts; default 'Arial, Helvetica, sans-serif'
  textColor: string;         // default '#1e293b'
  linkColor: string;         // default '#2563eb'
  buttonBackground: string;  // default '#2563eb'
  buttonTextColor: string;   // default '#ffffff'
};
```

Defaults: `batchSize` 40 (10..200), `perHourLimit` 400 (10..10000), `testRecipients` [] (max 5).
The default footer contains the company name and address (company profile), the reason the
recipient gets the e-mail, and the links `{{unsubscribe_url}}` ("Unsubscribe") and
`{{view_online_url}}` ("View in browser").

## C4. API: `public/api/newsletter.php`

`POST /api/newsletter.php` with a JSON body `{ action, ... }` (same style as `time_entries.php`).
`upload_image` is `POST /api/newsletter.php?action=upload_image` with `multipart/form-data` (`file`).
A GET answers 405. Success: HTTP 200 `{ "success": true, ...payload }`. Error: the HTTP status and
`{ "success": false, "code": "<machine code>", "message"?: "<readable>" }`. Codes so far:
`invalid_input` / `unknown_action` / `no_file` 400, `forbidden` 403, `not_found` 404, `not_draft` /
`campaign_sending` / `wrong_status` 409, 422 `invalid_name`, `invalid_reply_to`, `invalid_audience`,
`invalid_doc`, `doc_too_large`, `invalid_test_recipient`, `too_many_test_recipients`,
`no_test_recipients`, `invalid_image_type`, `file_too_large`, `base_url_unknown`, `empty_subject`,
`sender_not_configured`, `missing_unsubscribe`, `data_url_image`, `dangerous_url`, `html_too_large`,
`no_recipients`, and 502 `smtp_failed` (its `message` is the SMTP server's reply). The server's
`message` is English: the client shows its own translated line per code and the server text only as
the detail of `smtp_failed`. `send_test.sample.id` is a lead id, an employee id or an e-mail address
(the app sends the audience sample's e-mail).

| Action | Permission | Request | Response | Package |
|---|---|---|---|---|
| `list` | view | `{}` | `{ campaigns: CampaignSummary[] }` | 1A |
| `get` | view | `{ id }` | `{ campaign: Campaign }` | 1A |
| `recipients` | view | `{ id, status?, q?, offset, limit ≤ 200 }` | `{ rows: RecipientRow[], total }` | 1A |
| `audience_preview` | view | `{ audience }` | `AudiencePreview` | 1A |
| `settings_get` | view | `{}` | `{ config, senderEmail, senderConfigured, demo }` | 1A |
| `suppressions` | view | `{ q?, offset, limit ≤ 200 }` | `{ rows: SuppressionRow[], total }` | 1A |
| `images` | edit | `{}` | `{ images: { url, name, size, uploadedAt }[] }` | 1A |
| `create` | edit | `{ name? }` | `{ campaign }` | 1A |
| `update` | edit | `{ id, patch }` (name, subject, preheader, fromName, replyTo, audience, body, useHeader, useFooter) | `{ campaign }`; 409 unless draft | 1A |
| `duplicate` | edit | `{ id }` | `{ campaign }` (new draft, name + " (copy)") | 1A |
| `delete` | edit | `{ id }` | `{}`; soft delete; 409 while `sending` | 1A |
| `upload_image` | edit | multipart `file` (jpeg, png, gif, webp; ≤ 5 MB) | `{ url }` absolute | 1A |
| `suppression_add` | edit | `{ emails: string[], note? }` | `{ added }` | 1A |
| `suppression_remove` | edit | `{ email }` | `{}` | 1A |
| `settings_save` | settings | `{ config }` | `{ config }` | 1A |
| `send_test` | send | `{ id, subject, html, text, to: string[] ≤ 5, sample?: { source, id } }` | `{ sent, demo }` | 2A |
| `start_send` | send | `{ id, html, text }` | `{ campaign }` | 2A |
| `pause` / `resume` / `cancel` | send | `{ id }` | `{ campaign }` | 2A |
| `tick` | view | `{ id? }` | `{ campaign?: CampaignProgress, worker: 'ran' \| 'busy' \| 'throttled' \| 'idle' }` | 2A |
| `contact_status` | view | `{ emails: string[] ≤ 50 }` | `{ [email]: { unsubscribed?: { at, campaignId }, campaigns: { id, name, sentAt }[] } }` | 3B |

Shapes (camelCase in JSON):

```ts
type CampaignStatus = 'draft' | 'sending' | 'paused' | 'sent' | 'cancelled';
type Counts = { total: number; queued: number; sent: number; failed: number; skipped: number; cancelled: number; unsubscribed: number };
type CampaignSummary = {
  id: string; name: string; subject: string; status: CampaignStatus;
  audience: Audience;       // the client builds the audience label ("All clients", ...) from this
  counts: Counts; lastError: string | null;
  createdBy: string | null; createdAt: string; updatedAt: string; startedAt: string | null; finishedAt: string | null;
};
type Campaign = CampaignSummary & {
  preheader: string; fromName: string | null; replyTo: string | null;
  body: EmailDoc | null; useHeader: boolean; useFooter: boolean;
  htmlSnapshot: string | null;   // only when status != draft
};
type CampaignProgress = Pick<Campaign, 'id' | 'status' | 'counts' | 'lastError' | 'finishedAt'>;
type RecipientRow = { id: number; email: string; name: string | null; source: 'client' | 'lead' | 'employee' | 'extra';
  leadId: string | null; employeeId: string | null; status: string; skipReason: string | null; error: string | null;
  sentAt: string | null; unsubscribedAt: string | null };
type SuppressionRow = { email: string; reason: 'unsubscribed' | 'bounced' | 'manual'; campaignId: string | null;
  campaignName: string | null; note: string | null; createdBy: string | null; createdAt: string };
type AudiencePreview = {
  total: number;                                   // addresses that would be queued
  bySource: { client: number; lead: number; employee: number; extra: number };
  skipped: { unsubscribed: number; invalid: number };
  withoutEmail: number;                            // CRM rows that matched but have no e-mail
  withoutFirstName: number;                        // queued addresses whose first_name is empty (3C)
  sample: { email: string; name: string; source: string; merge: Record<string, string> }[];  // first 20
};
```

`Counts.unsubscribed` counts this campaign's rows with `unsubscribed_at` set (people who used
this campaign's link).

## C5. Audience

```ts
type Audience = {
  clients: { mode: 'all' | 'pick'; categoryIds: string[]; clientIds: string[] };   // required part
  leads: { enabled: boolean; statuses: string[]; interestCategories: string[] };    // optional
  employees: { enabled: boolean };                                                  // optional
  extra: { enabled: boolean; raw: string };                                         // optional, pasted text
};
```

Valid when `clients.mode === 'all'`, or `pick` with at least one category or client. New campaigns
start with `{ clients: { mode: 'all', ... }, leads/employees/extra disabled }`.

Resolution (server, `ccrm_newsletter_resolve_audience`):

1. **Clients.** A client is a `leads` row with a `client-*` id or `adjustment > 0`; its profile
   also contains the lead rows linked to it by `leads.client_id` (name match only where
   `client_id` is empty, the same fallback as `src/utils/leadClient.ts`; reuse a PHP helper if one
   exists, otherwise write one with a comment pointing at `leadClient.ts`). Archived rows are left
   out. `mode: 'pick'`: rows whose `client_category_id` is one of the chosen categories **or a
   descendant** (`client_categories.parent_id` tree), plus the profiles of the chosen clients.
   Every distinct e-mail of the profile's rows is an address.
2. **Leads** (when enabled): non-archived lead rows that are not part of any client profile,
   filtered by pipeline status (empty = all) and by interest categories (`lead_categories`, any
   match; empty = all).
3. **Employees** (when enabled): employees with an e-mail, kind `employee` or `contractor`, still
   employed (check the employment-end column).
4. **Extra**: split `raw` on new lines, commas and semicolons; accept `a@b.c` and `Name <a@b.c>`.
5. Normalise (trim, lower-case), validate (`filter_var(..., FILTER_VALIDATE_EMAIL)`), **dedupe**
   with precedence client > lead > employee > extra (the first source gives name and merge values).
6. Suppressed addresses and invalid addresses become `skipped` rows (counted, never sent); rows
   with an empty e-mail are only counted (`withoutEmail`).
7. Merge values per address: `name` (contact person, else the lead/client name for clients and
   leads, employee full name, extra name), `first_name` (first word of the contact person or the
   employee's first name, after stripping titles such as Ing., Mgr., Bc., MUDr., JUDr., PhDr.,
   RNDr., Dr., Prof., dr.; empty when unknown), `company` (client/lead name), `email`.
   **From 3C on (C18):** `first_name` of a client or lead is the stored `contact_first_name` with the
   titles stripped, empty when it is not filled in; it is never taken from `contact_person`.

## C6. The e-mail document (`EmailDoc`)

```ts
export type EmailDoc = { version: 1; rows: EmailRow[] };
export type RowLayout = '1' | '1-1' | '1-2' | '2-1' | '1-1-1';   // column width ratios
export type Align = 'left' | 'center' | 'right';
export type EmailRow = {
  id: string;
  layout: RowLayout;
  columns: EmailColumn[];            // length matches the layout (1, 2, 2, 2, 3)
  background?: string;               // full-width band behind the content
  contentBackground?: string;        // inside the content width; default theme.contentBackground
  paddingTop?: number;               // px, default 16
  paddingBottom?: number;            // px, default 16
  stackOnMobile?: boolean;           // default true
};
export type EmailColumn = { id: string; blocks: EmailBlock[]; paddingX?: number /* default 16 */; verticalAlign?: 'top' | 'middle' | 'bottom' };
export type SocialNetwork = 'facebook' | 'instagram' | 'linkedin' | 'x' | 'youtube' | 'tiktok' | 'website';
export type EmailBlock =
  | { id: string; type: 'text'; html: string; align?: Align; fontSize?: number /* 16 */; color?: string; lineHeight?: number /* 1.5 */ }
  | { id: string; type: 'heading'; html: string; level: 1 | 2 | 3; align?: Align; color?: string }
  | { id: string; type: 'image'; src: string; alt: string; href?: string; width?: number /* px; undefined = column width */; align?: Align }
  | { id: string; type: 'button'; label: string; href: string; align?: Align; background?: string; color?: string; radius?: number /* 6 */; fullWidth?: boolean }
  | { id: string; type: 'divider'; color?: string /* '#e2e8f0' */; thickness?: number /* 1 */; widthPercent?: number /* 100 */ }
  | { id: string; type: 'spacer'; height: number /* 24 */ }
  | { id: string; type: 'social'; align?: Align; items: { network: SocialNetwork; url: string }[] }
  | { id: string; type: 'html'; html: string };
```

- `text`/`heading` `html` is sanitised with the `newsletter` profile when edited: `p`, `br`,
  `strong`, `b`, `em`, `i`, `u`, `s`, `a[href|target]`, `ul`, `ol`, `li`, `span[style]` with only
  `color` kept. Merge tags are plain text (`{{first_name}}`), also inside `href`.
- `html` blocks are raw (the author's own markup); the canvas shows them in a sandboxed iframe.
- Ids are short random strings (`crypto.randomUUID().slice(0, 8)` is fine).
- Social items are 28 px brand-coloured round badges with a short white label (f, in, IG, X, ▶, TT,
  www), drawn with a table cell (Outlook shows them square). No image files. (Changed from PNG icons
  on 2026-11-09: there were no icon files to ship.)

## C7. Renderer: `renderEmail()`

```ts
renderEmail(input: {
  header?: EmailDoc | null; body: EmailDoc; footer?: EmailDoc | null;
  theme: NewsletterTheme; subject: string; preheader?: string;
  assetBaseUrl: string;     // e.g. window.location.origin; makes relative image URLs absolute
  lang: string;
}): { html: string; text: string; warnings: RenderWarning[] }
type RenderWarning = { level: 'error' | 'warning'; code: string; blockId?: string; message: { en: string; sk: string; hu: string } };
```

- Full HTML document: `<!doctype html>`, `<html lang>`, UTF-8, viewport,
  `x-apple-disable-message-reformatting`, `color-scheme: light` meta, `<title>` = subject.
- Hidden preheader right after `<body>` (preheader text + `&zwnj;&nbsp;` padding).
- Layout: outer 100 % table with `pageBackground`; each row is a full-width table (row
  `background`) holding a centred table of `contentWidth` px. Columns use the hybrid/fluid pattern:
  inline-block `div`s with `max-width`, wrapped in Outlook ghost tables (`<!--[if mso]>...<![endif]-->`),
  stacking under `contentWidth + 20` px through one media query (`.nl-col { display:block!important;
  width:100%!important; max-width:100%!important }`) when `stackOnMobile`.
- All styles inline; the only `<style>` block holds the media query, link colour and resets.
- Buttons are bulletproof table cells (background on the `td`, padding on the `a`).
- Images: `width` attribute + `style="display:block;max-width:100%;height:auto;border:0"`;
  relative `src` becomes absolute; `data:` URLs produce an **error** warning.
- Every attribute value is escaped. URLs that are merge tags (`{{unsubscribe_url}}`) stay as they are.
- `text`: built from the blocks, not by stripping the HTML: headings and paragraphs as lines,
  links as `label (url)`, buttons as `label: url`, images by `alt`, dividers as `----`, header and
  footer included.
- Warnings: `missing_unsubscribe` (error: no `{{unsubscribe_url}}` anywhere), `data_url_image`
  (error), `dangerous_url` (error: a `javascript:`, `vbscript:` or `data:` href, also inside the
  fallback of a leading merge tag; the href is output as `#`), `image_no_alt`, `image_no_src` (the
  block renders nothing), `button_no_href`, `empty_body`, `unknown_merge_tag`, `bad_url` (not
  http(s), mailto, tel or a merge tag whose fallback is one of those).
- Every colour from the doc or theme passes `safeColor()` (hex, `rgb()/rgba()`, or a named colour),
  enums pass a whitelist, the whole theme passes `safeTheme()`, and every attribute value is escaped.
- Every merge tag in the output (HTML, text, subject, preheader) is rewritten to the canonical form
  `{{tag}}` / `{{tag|fallback}}` (C9), so the server never sees spaces or NBSP inside braces.
- Deterministic output (tests compare substrings and structure).

## C8. The builder (`EmailBuilder`)

```ts
type EmailBuilderProps = {
  doc: EmailDoc;
  onChange: (doc: EmailDoc) => void;
  mode: 'body' | 'header' | 'footer';
  theme: NewsletterTheme;
  language: Language;
  lockedHeader?: EmailDoc | null;      // body mode: shown above the body, not editable
  lockedFooter?: EmailDoc | null;
  onEditLocked?: (part: 'header' | 'footer') => void;
  onUploadImage: (file: File) => Promise<string>;     // resolves to an absolute URL
  listImages?: () => Promise<{ url: string; name: string }[]>;
  sampleMerge: Record<string, string>; // values shown in Preview
  assetBaseUrl: string;
  toolbarExtra?: React.ReactNode;      // the host's save status, Send test, ...
};
```

Layout: toolbar on top (undo, redo, desktop/mobile canvas width, Preview, `toolbarExtra`); canvas in
the middle (grey background, the e-mail at `theme.contentWidth`, 375 px in mobile mode); a 320 px
panel on the right with the tabs **Blocks** and **Rows**, which becomes the **properties** of the
selected block or row (with a back arrow) when something is selected.

Acceptance list (each must work):

1. Drag a block tile (Text, Heading, Image, Button, Divider, Spacer, Social, HTML) into any column;
   a line shows where it lands; an empty column says "Drop content here".
2. Drag a row layout tile (1, 1-1, 1-2, 2-1, 1-1-1) between rows.
3. Hover outlines; click selects (outline + type chip). A selected block has move up, move down,
   duplicate, delete; a row has a handle, move up/down, duplicate, delete. Existing blocks and rows
   can be dragged to reorder; the move buttons are the keyboard path.
4. Text and heading edit inline. A floating bar: bold, italic, underline, link (popover; URL or merge
   tag), bulleted list, numbered list, text colour (`ColorPicker`), clear formatting, insert merge tag.
   Paste is sanitised to the `newsletter` profile.
5. Image: upload (file picker or a file dropped on the block, spinner, error toast), pick an uploaded
   image, or paste a URL; alt text (warning when empty), link, width, alignment.
6. Button: label (inline or in the panel), URL, colours, radius, alignment, full width.
7. Divider, spacer, social (add/remove/reorder networks), HTML (monospace textarea; canvas shows it in
   a sandboxed iframe).
8. Row properties: layout (fewer columns move the blocks of removed columns into the last remaining
   one), backgrounds, padding, stack on mobile. Column vertical alignment.
9. Undo/redo (100 steps; Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y); typing in one text block is one step
   per editing session.
10. Delete/Backspace removes the selected block when no text is being edited; Escape deselects.
11. Empty document: "Drag a row or a block here", plus starters "Text", "Image and text",
    "Two columns".
12. Body mode: the locked header and footer render above and below at reduced opacity with a label
    ("Global header: edit in Settings › Newsletter") and the `onEditLocked` button.
13. Preview: modal with a sandboxed iframe (`sandbox=""`) of `renderEmail()` output with
    `sampleMerge` substituted, desktop and mobile widths, and the warnings list.
14. Phone width: the builder shows "Edit the design on a larger screen" and the preview only.
15. Dark mode: toolbar and panels follow the app; the canvas and preview stay light (they are the e-mail).

Implementation: canvas components and the renderer share the style computation
(`builder/styles.ts`), so the canvas looks like the output. Suggested files: `types.ts`,
`defaults.ts`, `docOps.ts`, `history.ts`, `styles.ts`, `renderEmail.ts`, `renderText.ts`,
`mergeTags.ts`, `EmailBuilder.tsx`, `Canvas.tsx`, `RowView.tsx`, `BlockView.tsx`,
`InlineTextEditor.tsx`, `panels/Palette.tsx`, `panels/RowPanel.tsx`, `panels/BlockPanel*.tsx`,
`EmailPreview.tsx`. Drag data uses custom MIME types (`application/x-nl-block`,
`application/x-nl-row`, `application/x-nl-move`).

## C9. Merge tags

Syntax `{{tag}}` or `{{tag|fallback}}`. The full rules are in the header comment of
`builder/mergeTags.ts`; the PHP port follows them exactly:

- Regex `/\{\{[ \t\r\n]*([A-Za-z0-9_]+)[ \t\r\n]*(?:\|([^{}]*))?\}\}/` (PHP: the same, no `/u`). Only
  ASCII whitespace counts; never `\s` or JS `trim()`. NBSP is not whitespace (the renderer has already
  made every tag canonical).
- The fallback is trimmed with ASCII whitespace only (PHP `trim($s, " \t\r\n")`).
- Order: a non-empty value, else a non-empty fallback, else `''` when sending, else (preview) the tag
  is left as written.
- Text context (subject, plain-text part): value and fallback as they are, no decoding, no escaping.
- HTML context: a value is escaped once like PHP `htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE)`
  (`&amp; &lt; &gt; &quot; &#039;`). A fallback was already escaped by the renderer, so it is first
  decoded in one pass with exactly this map (PHP `strtr`): `&amp;`→`&`, `&lt;`→`<`, `&gt;`→`>`,
  `&quot;`→`"`, `&#039;` / `&#39;` / `&apos;`→`'`, `&nbsp;`→U+00A0; then escaped once.

| Tag | Value |
|---|---|
| `name` | Recipient's name (C5 step 7) |
| `first_name` | First name, or empty |
| `company` | Recipient's company (client/lead name) |
| `email` | Recipient's address |
| `unsubscribe_url` | `<base>/api/newsletter_public.php?a=unsubscribe&t=<token>` (required in every e-mail) |
| `view_online_url` | `<base>/api/newsletter_public.php?a=view&t=<token>` |
| `sender_company` | Company name from the company profile |
| `current_year` | e.g. 2026 |

- Unknown tags follow the same order (they never have a value): the `unknown_merge_tag` warning in
  the builder, the fallback or empty when sending.
- `builder/mergeTags.fixtures.json` holds the shared cases
  (`{ name, template, values, context: 'html' | 'text', mode: 'preview' | 'send', expected }`, 44 of
  them); the TS test and the PHP test both run all of them, so the two implementations cannot drift.
- `<base>` is `ccrm_app_base_url()` on the server. In test sends both URLs use the token `test`.

## C10. Sending engine

**Validation in `start_send`** (422 with a code when it fails): status is `draft` (atomic
`UPDATE ... WHERE id = ? AND status = 'draft'`, else 409); subject not empty; the sender is
configured (`ccrm_system_mail_configured()`) or the instance is in demo mode; the HTML contains
`{{unsubscribe_url}}`; no `data:` image; HTML ≤ 1 MB; the resolved audience has at least one queued
address. Then, in one transaction: insert the recipient rows (`queued` / `skipped`), store
`html_snapshot` and `text_snapshot`, `recipients_total`, `started_at`, status `sending`.

**Message** (`newsletter_mailer.php`): From = system profile address with name
`campaign.from_name ?? settings.sender.fromName ?? company name`; To = `"name" <email>`; Reply-To
when set; Subject RFC 2047 UTF-8 (merge tags substituted); Date; Message-ID
`<nl.<campaign>.<recipient>.<random>@<from domain>>`; MIME-Version; `List-Unsubscribe:
<unsubscribe URL>`; `List-Unsubscribe-Post: List-Unsubscribe=One-Click`;
`X-Newsletter-Campaign: <id>`; body `multipart/alternative` with `text/plain` then `text/html`,
both UTF-8 quoted-printable; CRLF line ends; dot-stuffing.

**Worker** `ccrm_newsletter_tick(PDO $pdo, int $budgetSec = 20): array` (`newsletter_send.php`):

1. `GET_LOCK('ccrm_newsletter_worker', 0)`; not acquired → `busy`.
2. Allowance = `perHourLimit` − rows with `sent_at` in the last hour; ≤ 0 → `throttled`.
3. The oldest campaign in `sending`; up to `min(batchSize, allowance)` `queued` rows whose
   `next_attempt_at` is empty or due, by id. None queued at all → campaign `sent`, `finished_at`.
4. One SMTP session for the batch. Per row: substitute merge tags (`merge_json` + token URLs), send.
   2xx → `sent`, `sent_at`. 4xx or a dropped connection → `attempts + 1`,
   `next_attempt_at = now + 5 min × attempts`; the third failure → `failed`. 5xx → `failed`, and when
   the reply means the mailbox does not exist (550/551/553) → suppression `bounced`. Stop at the time
   budget.
5. Connection or authentication failure → campaign `paused`, `last_error` set, attempts untouched.
6. `RELEASE_LOCK`.

**Demo mode** (`system_settings.DEMO_MODE = 'true'`): no SMTP connection ever. The worker marks rows
sent; `send_test` returns `{ sent: 0, demo: true }`.

**Triggers:** `cron.php` (every run, after the existing jobs, try/catch) and `tick` from an open
campaign page (every 5 s while `sending` and the tab is visible). Never from `sync.php`.

**Pause / resume / cancel:** pause stops the worker for that campaign; resume sets `sending` and
clears `last_error`; cancel turns the remaining `queued` rows into `cancelled`, sets `finished_at`.

## C11. Public pages: `public/api/newsletter_public.php`

No session, no SPA. Small server-rendered pages with inline CSS, in the system language, showing
the company name (company profile).

- `GET ?a=unsubscribe&t=<token>`: "Do you want to stop receiving e-mails from {company}?", the masked
  address (`j•••@example.com`), a **Unsubscribe** button (form POST to the same URL). Already
  unsubscribed → says so.
- `POST ?a=unsubscribe&t=<token>`: from the form, or RFC 8058 one-click (body
  `List-Unsubscribe=One-Click`). Inserts the suppression (`unsubscribed`, campaign id), sets
  `unsubscribed_at`, idempotent. Form → "You have been unsubscribed"; one-click → `200` with an empty body.
- `GET ?a=view&t=<token>`: the campaign's `html_snapshot` with that recipient's merge values.
- `t=test`: "This is a test e-mail. The link works in the real campaign."
- Unknown token: "This link is no longer valid" (404).
- Headers: `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, a CSP
  (`default-src 'none'; style-src 'unsafe-inline'; img-src * data:; form-action 'self'`). Prepared
  statements; the full address is never shown.

## C12. Module screens

**List** (`#newsletter`): `PageHeader` "Newsletter", primary action **New campaign** (edit). Tabs
**Campaigns** and **Unsubscribed**.

- Campaigns: search (name, subject), status filter. Each row: name with the subject under it,
  status chip (draft slate, sending blue with %, paused amber, sent emerald, cancelled rose; "sent
  with N failures" shows a rose count), audience label ("All clients", "2 categories, 3 clients +
  leads"), recipients, sent / failed, date (updated for drafts, finished for the rest), author.
  `EmptyState` with the call to action. Cards on phones.
- Unsubscribed: table (address, reason, campaign, date, by), search, **Add addresses** (manual
  suppression), **Remove** with a `ConfirmDialog` ("Only re-subscribe someone who asked for it").

**Campaign, draft** (`#newsletter/<id>`): header with `InlineRenameName`, status chip, menu
(Duplicate, Delete). Four `Surface` cards, each with a done/needs-attention mark:

1. **Recipients** (`AudienceEditor`): Clients (required): "All clients" or "Choose": client category
   tree multi-select (colours and icons from `client_categories`) and individual clients
   (`ClientSelect`, chips). Leads (switch): pipeline statuses, interest categories. Employees
   (switch). Extra addresses (switch): textarea with live parse feedback ("12 valid, 1 invalid:
   foo@"). Live count (`audience_preview`, debounced 600 ms): "238 recipients · 12 without e-mail ·
   3 unsubscribed" and a "Show list" of the sample. When leads or extra addresses are on: "Send only
   to people who agreed to receive marketing e-mails (GDPR)."
2. **Sender and subject**: From name (placeholder = default), From address read-only from the system
   profile (a warning with a link to `settings/email/outgoing` when not configured), Reply-To,
   Subject (merge-tag insert, counter, hint above 60 characters), Preheader (hint "shown after the
   subject in the inbox").
3. **Content**: scaled live thumbnail, **Edit design** (`#newsletter/<id>/design`), switches "Use the
   global header" / "Use the global footer" (turning the footer off warns when the body has no
   unsubscribe link). *(1C: placeholder; 2B: built.)*
4. **Review and send**: checklist (recipients > 0, subject, sender configured, unsubscribe link,
   no renderer errors) and the renderer warnings; **Send test** (dialog: up to 5 addresses prefilled
   from `testRecipients` and the user's own address, sample recipient from the audience sample);
   **Hold to send to 238 recipients** (`HoldToConfirm`). Disabled controls say why (missing
   permission, failed check). *(1C: placeholder; 2B: built.)*

**Design** (`#newsletter/<id>/design`): full-page `EmailBuilder` (body mode) with a top bar: back to
the campaign, campaign name, save status ("Saved" / "Saving…" / "Not saved, retry"), Preview, Send
test. Read-only (preview) when the campaign is not a draft.

**Campaign, after start** (sending, paused, sent, cancelled): read-only summary (subject, audience
label, sender), progress bar, `StatGrid` (Recipients, Sent, Failed, Skipped, Unsubscribed), time left
estimate from `perHourLimit` while sending, **Pause** / **Resume** / **Cancel** (cancel with
`HoldToConfirm`), `last_error` banner linking to `settings/email/outgoing`, **View e-mail** (the
snapshot in the preview modal), recipients table (50 per page, status filter, search: address, name,
source, status, sent at, error).

**Client profile** (3B): a small "Newsletter" block: campaigns this client's addresses received,
and an "Unsubscribed on <date>" badge.

Translations to use: Campaigns / Kampane / Kampányok; New campaign / Nová kampaň / Új kampány;
Recipients / Príjemcovia / Címzettek; Sender and subject / Odosielateľ a predmet / Feladó és tárgy;
Content / Obsah / Tartalom; Review and send / Kontrola a odoslanie / Ellenőrzés és küldés;
Unsubscribed / Odhlásení / Leiratkozottak.

## C13. Settings: category `newsletter`

A new category in `settingsRegistry.ts` (group `work`, a free tint), visible to holders of
`newsletter_settings` and admins, with translations (`cat.newsletter.*`, each section's title, hint,
kw in en/sk/hu) and a legacy redirect only if an old hash existed (none does).

- `newsletter/design`: **Header** and **Footer** cards, each a thumbnail and **Edit**, which opens the
  builder full height at `settings/newsletter/design/header` or `/footer` (the registry's `rest`
  segments). **Theme**: content width, page background, content background, font (web-safe list),
  text, link, button background and button text colours, with a live mini preview. *(1C: theme;
  2B: header/footer editors.)*
- `newsletter/sending`: default From name, default Reply-To, the From address read-only with its
  status and a link to `settings/email/outgoing`; batch size and hourly limit, with help ("ask your
  e-mail provider for its hourly limit"); test addresses (up to 5); a note that sending continues in
  the background through the server cron every minute, and only while the campaign page is open when
  there is no cron. *(1C.)*

## C14. Permissions

Section `newsletter` in `src/utils/permissions.ts`, mirrored in `public/api/permissions.php`:

- `access("newsletter", "nothing", "nothing")`: none / view / edit. Non-admin roles get nothing until
  an administrator grants it; admins always have everything (same intent as the `whatsapp` section).
- `toggle("newsletter_send", ..., { key: "newsletter", level: "edit" })`: send tests, start, pause,
  resume, cancel.
- `toggle("newsletter_settings", ..., { key: "newsletter", level: "edit" })`: Settings › Newsletter.
- Route mapping `newsletter` → `newsletter`. Labels in en/sk/hu.
- Server (C4): view, edit, send, settings checked per action with `ccrm_can`.
- The legacy keys `newsletter.view` and `newsletter.edit` in `public/api/setup.php` are mapped to the
  new section or removed (1C reports which).

## C15. Demo data

Lapidea (see `docs/DEMO-MODE.md`). One pack per language, the same story:

- Settings: a header with the Lapidea name in the brand colours, the default footer with the demo
  company's address, a stone-toned theme.
- Campaign 1, sent 20 days ago: the spring remnant-slab sale, to the architects / studio client
  category (use the demo's real categories). Recipient rows for those demo clients: all sent, one
  failed (`550 mailbox unavailable`, address suppressed as bounced), one unsubscribed afterwards.
- Campaign 2, sent 60 days ago: "Caring for your new worktop", to all clients.
- Campaign 3, draft: the new sintered-stone collection, audience clients + leads, a finished body.
- Suppressions: the bounced and the unsubscribed address above, plus one manual entry.
- Bodies use text, heading, button, divider and social blocks only (no photos to ship).
- Demo never sends (C10), so the user can press **Hold to send** on the draft and watch it finish.

## C16. Tests

- **Unit (1B):** `docOps.test.ts`, `renderEmail.test.ts` (doctype, preheader, ghost tables for
  multi-column rows, stacking class, escaping, absolute URLs, `data:` error, text version, every
  warning), `mergeTags.test.ts` (all fixture cases).
- **PHP (`scripts/test-newsletter.php`, 1A + 2A):** extra-address parsing, dedupe precedence,
  suppression skip, first-name extraction, merge-tag fixture parity, MIME builder, unsubscribe
  idempotency.
- **E2E (3A, `tests/e2e/newsletter.spec.ts` + `helpers/newsletterMock.ts`):** open the module → New
  campaign → choose a client category → the count appears → set the subject → Edit design → drag a
  Text block into the empty document, type, add a Button → back (autosave flushed) → Send test
  (success toast) → Hold to send → progress → sent counts. Settings › Newsletter › Design: edit the
  footer; removing the unsubscribe link shows the error. Unsubscribed tab: add and remove. Plus the
  crawler and dark-mode registrations.
- **Manual (orchestrator, before the first build):** on the dev stack, send a real test to a Gmail and
  an Outlook.com address; check a two-column row on desktop and phone, the unsubscribe page, the
  one-click header (`List-Unsubscribe` visible in "Show original").

## C17. Later (not version 1)

In rough order of value. Each would get its own phase here when the user asks for it.

1. **Open and click tracking**: a pixel and a redirect keyed by the recipient token (it already
   exists), per-campaign switch, opens/clicks in the results, clicks per link. Opens are approximate
   (Apple Mail Privacy Protection).
2. **Scheduled sending**: status `scheduled` + `scheduled_at`; the worker starts due campaigns.
3. **Dedicated newsletter SMTP** (a Brevo / Amazon SES relay) so bulk mail does not affect the company
   mailbox reputation.
4. **Bounce mailbox**: read DSNs over IMAP (the ticket IMAP code is a start), suppress hard bounces.
5. **Templates and saved blocks**: save a campaign or a row as a starting point.
6. **Subscriber lists**: CSV import, signup form, double opt-in, consent records per lead.
7. A/B subject test, an automation node "Send campaign", AI writing help, per-division sender
   identities, MCP tools for campaigns.

## C18. Contact first and last name (package 3C)

Decision B1.5. The model follows employees (`employees.first_name` / `last_name`,
`public/api/employee_name.php`, `src/utils/employeeIdentity.ts`).

- **Columns:** `leads.contact_first_name VARCHAR(100) NULL`, `leads.contact_last_name VARCHAR(100)
  NULL` (after `contact_person`). Leads are written by `sync.php`, so the 4-place rule applies in full
  (`.agents/rules/database-schema-and-sync.md`). Synced as `contactFirstName` / `contactLastName`.
- **`contact_person` stays** the full name everyone else reads (search, MCP, orders, tickets, offers,
  vector index, …: ~30 files), so none of them change. Rule, the same in TS (`composeContactName`) and
  PHP: when either part is filled, `contact_person = trim(first + ' ' + last)` (given name first, the
  same as employees; no order by language); when both are empty, `contact_person` is kept as it is.
- **Forms:** every place that types a contact person shows `ContactNameFields` ("First name" /
  "Last name"; sk "Meno" / "Priezvisko"; hu "Keresztnév" / "Vezetéknév") instead of one field, and
  saves both parts plus the composed `contact_person`.
- **Other writers** that set only `contact_person` (MCP write tools, company-register lookup,
  workflows, order and pipeline endpoints, …) also set the parts with `ccrm_split_person_name()`
  (both empty when it returns null), so the three never disagree. The implementer lists every writer.
- **Backfill, once:** rows with a `contact_person` and both parts NULL get the parts from
  `ccrm_split_person_name()` (two or more words, last word = last name, titles stay with the first
  name; nothing when unsure). This gives old contacts the same first name as before phase 3 (also the
  wrong one for a surname-first contact) and makes it correctable; everything typed afterwards is
  right. Guard it so it runs once (a `system_settings` flag or the pattern other one-time backfills
  use) and never overwrites typed parts. No language-based order (B1.5).
- **Newsletter:** `first_name` = `contact_first_name` with the titles of C5 stripped (`Ing. Michal` →
  `Michal`); employees keep their own `first_name`; extra addresses have none. `AudiencePreview`
  gains `withoutFirstName` and the live count in `AudienceEditor` shows "N without a first name" (en /
  sk "N bez krstného mena" / hu "N keresztnév nélkül"), so they can be completed before sending.
  `ccrm_newsletter_first_name()` remains only for the title stripping.
- **Demo:** the packs give each contact both parts; the Hungarian pack puts the given name in
  `first` (`Péter`) and the family name in `last` (`Kovács`).
- **Demo wipe (B1.6):** `newsletter_recipients.lead_id` and `.employee_id` are skipped by
  `demo_wipe_by_prefix()` and `demo_count_by_prefix()` (one shared two-entry list with a comment);
  demo recipient rows still go through `campaign_id LIKE 'demo-%'`.
