# WhatsApp module: demo chats without WAAI + the chat-row summary card

The **only** document for this work: analysis, decisions, the per-phase checklists and the spec.

> **To start work, tell a coding agent:** `make wa-demo phase 1` (then 2, then 3).
> The agent reads this whole file and follows Part A.

Two requests from the user (2026-11-03):

1. **Demo data in the WhatsApp module even when no WhatsApp account is connected.** Today a demo
   instance shows the CRM side of the WhatsApp demo (chips, task badges, timeline entries) but the
   module itself says "not configured" or shows an empty Chats tab, because chats live only in WAAI.
2. **The chat-row summary ("digest in bullets") from a real WAAI does not show properly in the CRM.**
   WAAI shows a "SÚHRN WAAI · 5 bodov" card with every open bullet; the CRM shows only the first open
   bullet as one grey line.

---

# Part A. How to work with this file

## A1. The protocol for "make wa-demo phase N"

1. **Read this whole file**, then `CLAUDE.md`, `docs/TESTING.md`, every file in `.agents/rules/`,
   `docs/VIEW-SIZE.md`, `docs/WHATSAPP-DEMO-DATA.md` and `docs/WAAI-NATIVE-MODULE.md` (skim §4).
2. **Check the status table (A2).** Phases run in order 1 → 2 → 3. Every earlier phase must be ✅.
   If phase N is already ✅, or an earlier one is 🟡, stop and tell the user.
3. **Build only the checklist of phase N (A3).** Part B (decisions) is final: do not re-ask it and do
   not change it. Part C is the spec. **If the code disagrees with this file, stop and tell the user**
   instead of guessing. Line numbers below are from 2026-11-03 and may have shifted; find the code by
   name.
4. **Test** (every phase):
   - `npx tsc --noEmit` and `npm run test:unit`
   - `php -l <file>` on every PHP file you touched (if PHP is not installed locally, use
     `docker run --rm -v "$PWD":/app -w /app php:8.2-cli php -l <file>`)
   - `npm run test:demo-seed` if you touched `public/api/demo_seed/` or `scripts/demo-assert/`
   - `node scripts/qa/run-qa.mjs --files <every file you changed>`, then read
     `test-results/qa-audit-report.md`. Never plain `npm run test:qa`.
   - Never loosen a check to make it pass. If an unrelated spec already fails, say so in the report
     and in **Left over**; do not fix it.
5. **Finish in this order:** test → bump `VERSION` in `src/utils/version.ts` (patch +1, keep the
   `-Nectarine` suffix) → entry at the top of `1.13-nectarine-changelog.md` (date, user-facing
   bullets) → commit. **Do not run `npm run build` and do not commit `dist/`**
   (`.agents/rules/post-build-cleanup.md`). Commit message: `feat(whatsapp): … (v1.13.N-Nectarine)` or
   `fix(whatsapp): …`, ending with the attribution lines your harness gives you.
6. **Other sessions share this checkout.** Stage only your own files by path (`git add <path>`), never
   `git add -A` / `git add .`, never `git stash`. `src/components/LeadsDatagrid.tsx` and any `*.patch`
   file in the repo root belong to someone else; leave them alone.
7. **Update this file in the same commit:** tick the phase's boxes, fill its row in A2, write anything
   you deferred or assumed under the phase's **Left over**.
   ✅ only when every box is ticked and the tests are green; otherwise 🟡 with what is missing.
8. **Report to the user:** what was built, test output (pass/fail counts), what was deferred. Report a
   bug in existing code as **symptom → root cause → proposed fix**. Then stop.

### Rules for every phase

- **Backend:** edit `public/` only, then `npm run sync:backend`. A **new** PHP file must also be copied
  once to the repo-root mirror by hand (`public/api/x.php` → `api/x.php`); `sync:backend` only updates
  files that already exist there. Check with `npm run sync:backend -- --check` if the script supports
  it, else diff the two files.
- **No new database columns.** None are needed. If you think you need one, stop and ask.
- **Styling:** this module uses raw Tailwind palette classes (`text-slate-500`, `bg-green-50`, …) and the
  `type-*` scale from `docs/VIEW-SIZE.md`. Write the same; do not introduce semantic tokens here.
  Dark mode works by overriding those palette classes, so it keeps working if you stay on them.
- **UI strings** go in the module's own i18n files (`src/components/whatsapp/chats/chatsI18n.ts`,
  `src/components/whatsapp/i18n.ts`) in **en, sk and hu**. Never hardcode a string in JSX.
- **Unit tests** run under `node --test --experimental-strip-types`, so they can import only `.ts`
  (not `.tsx`). Put logic you want to test in `.ts` files.
- Licensing never gates any of this (`.agents/rules/licensing.md`).

## A2. Status

Legend: ⬜ not started · 🟡 built but not finished (see Left over) · ✅ done

| # | Phase | Status | Version / commit | Date |
|---|---|---|---|---|
| 1 | Chat-row summary card (fixes request 2) | ✅ | v1.13.45-Nectarine | 2026-11-03 |
| 2 | Demo WAAI in the browser: data endpoint, fake backend, Chats tab | ✅ | v1.13.46-Nectarine | 2026-11-03 |
| 3 | Demo for Digest, Tasks, Ask and Settings tabs; QA spec; docs | ⬜ | | |

Effort: phase 1 small, phase 2 large, phase 3 medium. Each fits one session.

## A3. Phases

### Phase 1 — Chat-row summary card

Spec: C1. Independent of the demo work; it makes real WAAI summaries show properly and is what the
demo chats will show from phase 2 on.

- [x] New `src/components/whatsapp/chats/summaryBullets.ts` with `rowBullets()` and `standingCount()`
      exactly as C1.2 describes (pure functions, no React).
- [x] New `src/components/whatsapp/chats/summaryBullets.test.ts` covering every case listed in C1.4.
- [x] `ConversationList.tsx`: delete `summaryLine()`; the `Row` receives the `ChatSummaryPreview` (or
      `undefined`) plus the `done` set, and renders the card of C1.3 under the preview line.
- [x] `chatsI18n.ts`: add `summaryLabel`, `summaryPoints(n)` and `summaryAllDone` in en/sk/hu (C1.3).
- [x] QA: in `tests/e2e/whatsappNativeModule.spec.ts`, add a test where `/conversations` returns one
      chat with a five-bullet summary (three task bullets, two narrative, one task in
      `completed_task_ids`). Assert the card shows the label, "4" in the count, four `li` items, the
      done bullet absent; a second chat whose only bullets are done tasks shows the all-done line.
      Use `data-testid` hooks: `wa-row-summary`, `wa-row-summary-count`, `wa-row-summary-bullet`,
      `wa-row-summary-done`.
- [x] Check `SummaryPanel.tsx` (the right-hand panel of an open chat): if it shows only one action
      item or none, report it under **Left over**. Do not change it in this phase.
- [x] Tests (A1.4), version bump, changelog, commit, this file updated.

**Left over:**
- `standingCount()` is not described in C1.2, so it is `standingCount(r: RowSummary): number` (bullets shown, 0 for
  `none` / `all_done`). The Slovak/Hungarian/English plural lives in `summaryPoints(n)` in `chatsI18n.ts`; its
  test is in `summaryBullets.test.ts`.
- `SummaryPanel.tsx` (right-hand panel of an open chat) shows only the narrative (`AiMarkdown`) and the window
  picker; it does not list the summary's action items. The open tasks are in the separate `ChatTasks` block
  below it. Not changed, as instructed.
- Rows use `size-1.75` / `size-1` for the markers (they scale with View size) instead of fixed 7 px / 4 px.

### Phase 2 — Demo WAAI in the browser: data endpoint, fake backend, Chats tab

Spec: C2–C6. Depends on phase 1.

- [x] Dataset: enlarge the four chat summaries in `public/api/demo_seed/whatsapp_demo.{sk,hu,en}.json`
      as C4 says (allow `task: null` bullets). Copy the new sk file over
      `public/api/demo_seed/whatsapp_demo.json` byte for byte (the drift check requires it).
      Update `scripts/demo-assert/whatsapp.php` so it accepts `task: null` and checks that a numeric
      `task` names a task of the same chat. Update the contract block in `docs/WHATSAPP-DEMO-DATA.md`
      (`actionItems: [ { "task": 3 | null, "text": "..." } ]`). `npm run sync:backend`.
- [x] Endpoint `public/api/waai_demo.php` (C3) + its root mirror `api/waai_demo.php`.
- [x] `src/components/whatsapp/demo/` (C5): `demoDataset.ts` (types + loader), `demoTime.ts`
      (C5.3), `demoStore.ts` (in-memory state built from the dataset), `demoRouter.ts` (the fake WAAI:
      `createDemoWaai()`), `demoMedia.ts` + the asset files (C5.5). Unit tests for time, store and router
      (`*.test.ts` next to them).
- [x] `WaaiClient`: add the `isDemo` flag (C5.6). `Composer.tsx`: in demo, send attachments through
      `client.post` with the `FormData` instead of `uploadWithProgress` (XHR cannot be intercepted).
- [x] `useWaaiSession` → source selection of C2 (B1, B2). Wire `isDemoMode` and the directory (C5.4)
      from `App.tsx` through `WhatsAppModule` to `NativeModule`.
- [x] `NativeModule.tsx`: in demo show the demo pill and subtitle, hide "Open standalone" (C6).
- [x] Every Chats-tab endpoint of C5.2 answers (list, open chat, messages, send text, reaction,
      mark read, search, summary panel, chat tasks, CRM links + picker, open by phone, health, resync).
- [x] Manual check with `npm run dev` against a demo instance, or with the QA mock of phase 3 if you
      have no demo instance: 4 chats, unread badges, the summary cards of phase 1, open each chat,
      play nothing that needs CSP changes (C5.5), send a message, react, deep link
      `#whatsapp/c/demo-wa-c1-site?m=demo-wa-c1-site-m11` scrolls to that message.
- [x] Tests (A1.4), version bump, changelog, commit, this file updated.

**Left over:**
- **Not run against a real server:** `waai_demo.php` is `php -l` clean and its dataset is covered by `npm run test:demo-seed`
  (1172 checks), but no PHP server was started, so the endpoint's sign-in, permission and `DEMO_MODE` checks were not exercised
  end to end. The browser check used the QA mock of the endpoint (a throwaway spec, deleted; phase 3 writes the real one).
- **Digest, Tasks, Ask and Settings tabs are not faked yet** (phase 3): in demo they hit `GET /tasks` without a chat,
  `/digest`, `/search`, `/preferences`, `/wa-accounts` and answer `501 not_implemented`. `GET /tasks` with a conversation works.
- **Router input has two optional fields the spec did not list:** `media` (the files; `demoMedia.ts` imports Vite assets, which
  `node --test` cannot load, so tests pass a stub) and `language` (the UI language of the few sentences the router words itself).
- **Done tasks cannot be reopened or deleted** in the demo (`crm_linked: true`, answered `409 conflict`), exactly as WAAI treats a
  task that is linked to a CRM task. Ticking one open task done works and retires its bullet on the chat row.
- **Dates without a time** (task `due` with `time: null`, task `start`) are noon in the account's zone, so `due_at.slice(0, 10)`
  (what `ChatTasks` shows) is the right calendar day in every zone.
- **Silent WAV:** `assets/silence.wav` is 8 s, 8 kHz, 8-bit mono, filled with `0x80` (8-bit PCM is unsigned, so zeros would be
  full-scale negative, not silence). `makeSilence.mjs` regenerates it.
- **Files sent in the demo:** an image gets `URL.createObjectURL(file)` and shows (`img-src blob:` is allowed). A voice note or
  a document gets the same blob address and will not play or download everywhere (the CSP has no `media-src`; not changed).
  Files attached to a task update are counted in the message text but not shown as separate messages.
- **Summary windows:** `recent` is the cached chat summary. Any other window answers `cached: false`, and the panel's own follow-up
  stream returns the same narrative at once; a window with no messages says so and has `id: null`.
- **`useWaaiSession` has no unit test** (it imports `demoMedia.ts`, a Vite asset module). The source-selection rule is the pure
  `wantsDemo()` next to it; the real-path and demo-path states were checked in the browser (demo with the connection not configured).
  Not checked: demo mode with a working real WAAI that has an account (it must keep the real one), and `forbidden`.
- **`tsconfig.app.json`:** `src/components/whatsapp/demo/demoFixture.ts` (the tests' dataset loader, uses `node:fs`) is added to
  `exclude`, next to the `*.test.ts` files.
- **Unrelated QA failure, present on a clean `HEAD`:** `navigation.spec.ts` reports `NAV0-A31047FC` (HIGH, "nav item #1" did nothing)
  and `INTF-C34A0844` (LOW, header "Spustiť časovač"). Reproduced identically in a scratch worktree of `5b667723`; not touched.

### Phase 3 — Demo for Digest, Tasks, Ask and Settings; QA spec; docs

Spec: C5.2 (the "phase 3" rows), C7. Depends on phase 2.

- [ ] Digest, Tasks, Ask, Settings endpoints of C5.2. Open each tab in demo: nothing crashes, no
      raw error text, no request leaves the browser for `/waai-api` or a WAAI address.
- [ ] New QA spec `tests/e2e/whatsappDemo.spec.ts` (C7).
- [ ] `docs/WHATSAPP-DEMO-DATA.md`: replace the sentence "without the WAAI loader a demo instance shows
      … an empty Chats tab" with a short section "In-browser demo (no WAAI)" pointing to this file,
      saying when it is used (B1) and that nothing is sent anywhere.
- [ ] `README.md` demo section: one line that the WhatsApp module shows demo chats on a demo instance
      without WAAI.
- [ ] Tests (A1.4), version bump, changelog, commit, this file updated.

**Left over:** _(fill in)_

---

# Part B. Decisions (final)

**B1. When the module shows demo data.** Only when the CRM is in demo mode (`isDemoMode` in `App.tsx`,
from `sync.php`'s `demoMode`), and then when **any** of these is true:

- the WhatsApp connection is not configured (`config.configured === false`);
- the real session ends in `crm_not_configured`, `waai_not_ready`, `not_linked`, `needs_update` or
  `unreachable`;
- the real session is `ready` but `meta.wa_accounts` is empty.

A demo instance that **has** a working WAAI with an account (the test server with the phase W loader)
keeps showing the real WAAI. `forbidden` (the user lacks the `whatsapp` permission) stays `forbidden`:
demo mode does not bypass permissions. A non-demo instance never shows demo chats.

**B2. Where the demo runs: entirely in the browser.** A fake WAAI implements the module API as a
`fetch` function handed to the existing `WaaiClient` (it already accepts `fetch` in its options). All
UI code stays as it is and talks to the client as usual. No WAAI, no Docker, no Postgres needed.
Rejected: seeding a real WAAI (needs WAAI running — exactly what is missing), and a PHP fake of the
module API (duplicates the contract on the server, still needs the proxy path).

**B3. The data comes from the existing per-edition files** `whatsapp_demo.{sk,hu,en}.json`, served by
a new endpoint (C3) that picks the **seeded edition**, so chat links, task ids and names match the CRM
rows the demo seeder wrote. Not bundled into the JS: no bundle cost, one source of truth, a non-demo
instance never serves it.

**B4. Changes made in the demo live only in memory** (sent messages, reactions, read state, task
ticks, preferences) and reset on reload. Nothing is written to the CRM or sent anywhere. Ticking a
task in the demo module does **not** change the CRM task `demo-whatsapp-<n>`.

**B5. Ids follow the WAAI loader contract** (`docs/WHATSAPP-DEMO-DATA.md`, "WAAI loader"): conversation
id = chat `ref`, message id = `<ref>-<message id>`, so the links the CRM seeder already wrote
(`#whatsapp/c/<ref>?m=<ref>-<mid>`) open the right message. Task id = `demo-wa-task-<n>`,
`crm_task_id` = `demo-whatsapp-<n>`.

**B6. The demo user is a `member`**, not an admin, so the admin-only parts of Settings stay hidden and
need no fake. WhatsApp-account management (connect, reconnect, remove) answers `not_implemented`.

**B7. Features with no sensible fake answer `501 not_implemented`** with a demo message (text assist,
digest audio, account changes). The UI already handles a failed call; phase 3 checks it shows a calm
message, not a stack.

**B8. Summary card behaviour copies WAAI** (`C:\waai\apps\web\src\components\conversation-list-panel.tsx`,
`ChatRow`, `bulletsFrom`, `BulletMarker`), minus the generation states: the CRM only shows cached
summaries and never generates one from the list. A chat without a cached summary shows no card, as
today.

---

# Part C. Spec

## C1. Chat-row summary card (phase 1)

### C1.1 Analysis

`ConversationList.tsx` → `summaryLine()` takes the **first** open action item and the row renders it as
one `line-clamp-2` grey line. Everything else in the summary is dropped, and a summary that has only a
narrative (no action items) shows nothing. WAAI's `ChatRow` shows a divider, an "AI" badge with the
label "Súhrn WAAI", a count "N bodov" of open bullets, and up to five bullets; with no action items it
falls back to the first three sentences of the narrative; when every bullet's task is done it shows
"Všetko vybavené". The data is already in the CRM: `ConversationsResponse.summaries[id]` carries
`action_items` (each `{ text, task_id }`), `narrative`, and `completed_task_ids` lists the done tasks.
This is a rendering bug only; no contract change.

### C1.2 `summaryBullets.ts`

```ts
export interface RowBullet { text: string; taskId: string | null }
export type RowSummary =
  | { kind: "bullets"; bullets: RowBullet[] }   // at least one bullet to show
  | { kind: "all_done" }                         // there were task bullets and every one is done
  | { kind: "none" };                            // no summary, or nothing usable in it

export function rowBullets(s: ChatSummaryPreview | undefined, done: ReadonlySet<string>): RowSummary;
```

1. No summary → `none`.
2. Take `action_items` in order; trim `text`; drop empty ones. Take the first **five** of those
   (counting done ones, as WAAI does).
3. Drop those whose `task_id` is in `done`.
4. If step 2 produced nothing: split the narrative into sentences (port WAAI's `stripInlineMarkdown`
   and `splitSentences` exactly — the regex keeps "9. marca" in one sentence) and use the first three,
   each with `taskId: null`. Nothing there either → `none`.
5. If step 2 produced bullets but step 3 removed all of them → `all_done`.
6. Otherwise → `bullets`.

The count shown is `bullets.length` (all shown bullets are open).

### C1.3 The card

Under the existing preview line of `Row`, only when `kind !== "none"`:

```
──────────────────────────────── (border-t border-slate-100, mt-2 pt-2)
[✦ Súhrn WAAI]                       4 body
 ○ Poslať termín CNC rezania              ← task bullet: hollow ring
 ○ Potvrdiť zameranie lobby
 • Klient chce vzorky do piatku           ← narrative bullet: small filled dot
 • …
```

- Badge: `Sparkles` icon (lucide) + `t.summaryLabel`, `type-meta font-semibold uppercase tracking-wide`,
  green tones like the rest of the module (`bg-green-50 text-green-700 rounded-full px-2 py-0.5`).
- Count: right-aligned, `type-meta tabular-nums text-slate-400`, `t.summaryPoints(n)`; hidden for
  `all_done`.
- Bullets: `<ul>` with one `<li>` per bullet, `type-meta text-slate-600`, full text (no truncation,
  `[overflow-wrap:anywhere]`), marker aligned to the first line. Task bullet marker: 7 px ring
  `border border-green-600/80 rounded-full`; narrative marker: 4 px dot `bg-green-600/55 rounded-full`.
- `all_done`: one line, `Check` icon + `t.summaryAllDone`, `text-slate-500`.
- The card is inside the row's `<button>`: use only phrasing content (`span`s with `block`/`flex`), not
  `<div>`/`<ul>`, or the HTML is invalid. Use `<span role="list">` / `<span role="listitem">`.
  (The QA test then counts `[data-testid="wa-row-summary-bullet"]`.)
- Strings:

| key | en | sk | hu |
|---|---|---|---|
| `summaryLabel` | WAAI summary | Súhrn WAAI | WAAI összegzés |
| `summaryPoints(n)` | 1 point / n points | 1 bod / 2–4 body / n bodov | n pont |
| `summaryAllDone` | All caught up | Všetko vybavené | Minden elintézve |

  (Slovak plural: 1 → "bod", 2–4 → "body", 0 and 5+ → "bodov".)

### C1.4 Unit test cases

No summary → none · five items, none done → five bullets · seven items → first five only · item with
empty text skipped · done task removed, count drops · every task bullet done → all_done · no action
items, narrative of four sentences → three bullets · narrative with `**bold**` and "9. marca" → one
clean sentence · no action items and empty narrative → none · Slovak plural for 1, 3, 5.

## C2. Source selection (phase 2)

Extend `useWaaiSession(base)` to `useWaaiSession(base, demo: DemoOptions | null)` where `DemoOptions`
is `{ directory: DemoDirectory; userId: string; language: string }` and `null` means "not a demo
instance". Keep the `SessionState` union; add `demo: boolean` to the `ready` variant.

```
if demo is null:                  exactly today's behaviour
else if base is null:             start the demo client
else:                             start the real client;
                                  on ready with wa_accounts.length === 0  → sign out, start demo
                                  on a B1 failure state                    → start demo
                                  on forbidden                             → stay forbidden
start demo client:  GET /api/waai_demo.php (C3) → createDemoWaai(...) → new WaaiClient({ base: DEMO_BASE,
                    fetch: demo.fetch, fetchSsoToken: async () => "demo", isDemo: true }) → open() → /meta → ready(demo: true)
                    if the endpoint fails (404 = not demo mode on the server) → the state the real path
                    would have shown (not configured / unreachable)
```

`WhatsAppModule.tsx` gets `isDemoMode: boolean` and `demoDirectory: DemoDirectory` props; it passes
`demo = isDemoMode ? {...} : null` down. While `config.configured === false` it must still render
`NativeModule` in demo mode (today `NativeModule` shows "not configured" itself — move that decision
to the session state: show `wa-not-configured` only when the state says so).

## C3. `public/api/waai_demo.php` (phase 2)

- `GET` only (else 405). Same includes, sign-in check and `whatsapp` permission check as
  `public/api/waai_sso.php` — copy that pattern, do not invent a new one.
- `404 {"success":false}` unless the `DEMO_MODE` setting is `'true'` (read it the way
  `public/api/demo_reseed.php` does).
- Edition: the language the demo was seeded in. Find how `demo_ctx()` / `demo_lang()` in
  `public/api/demo_seed/helpers.php` resolve it and use the same source (without loading the seeder).
  Accept only `sk|hu|en`, fall back to `sk`.
- Answer `200 {"success":true,"edition":"sk","dataset":<the parsed whatsapp_demo.sk.json>}` with
  `Cache-Control: no-store`. Read the file from `__DIR__ . '/demo_seed/whatsapp_demo.<lang>.json'`.
- No database writes, no logging of the content.

## C4. Dataset change (phase 2)

`summary.actionItems[].task` may now be `null` (a narrative bullet). Target per chat, in all three
editions, same structure (the assert checks parity):

| Chat | Items in this order | Shown on the row |
|---|---|---|
| `demo-wa-c1-site` | task 3, task 2, task 1 (done), null, null | 4 bullets |
| `demo-wa-l10-architect` | task 5, task 4 (done), null | 2 bullets |
| `demo-wa-c6-hotel` | task 7, task 6 (done), null, null | 3 bullets |
| `demo-wa-c2-warranty` | task 9, task 8 (done) | 1 bullet |

Write the new texts from each chat's messages, in the edition's language (the German architect chat's
summary is in the edition language too — summaries follow the install language). Short, imperative or
factual, under ~90 characters, like the existing ones. Do not change messages, tasks, ids, days or
times.

## C5. The fake WAAI (phase 2, Digest/Tasks/Ask/Settings rows in phase 3)

### C5.1 Files and shape

```ts
// demoRouter.ts
export const DEMO_BASE = "/waai-demo";          // never fetched for real; only a prefix to strip
export function createDemoWaai(input: {
  dataset: DemoDataset;  edition: "sk" | "hu" | "en";
  directory: DemoDirectory;  crmUserId: string;  now?: () => number;
}): { fetch: typeof fetch; store: DemoStore };
```

`fetch(url, init)`: strip `DEMO_BASE`, split path and query, route on method + path, read the body
(`JSON.parse` of a string, or the `FormData`), answer `new Response(JSON.stringify(x), { status,
headers: { "Content-Type": "application/json" } })`. `204` → `new Response(null, { status: 204 })`.
Streams → `new Response(sseText, { headers: { "Content-Type": "text/event-stream" } })`, frames
`event: <name>\ndata: <json>\n\n` (the client reads `res.body`). Errors → the envelope
`{ error: { code, message, request_id: "demo" } }` with the matching status. Unknown route → 501
`not_implemented`. Honour `init.signal` (throw an `AbortError` `DOMException` if aborted). Add a
small random-free delay of `await Promise.resolve()` only; no timers.

Build every answer **from the types in `api/contract.ts`** (`ConversationsResponse`, `MessageDto`,
`TaskDto`, `SummaryLookupResponse`, `SummaryStreamEvent`, …) so `tsc` catches a wrong shape. Read the
consuming hook for each endpoint to see which query params it sends.

### C5.2 Endpoints

| Method + path | Consumer | Demo answer |
|---|---|---|
| `POST /session` | `WaaiClient.exchange` | `access_token: "wam_demo"`, `expires_in: 86400`, `api_version: API_VERSION`, `user` = the demo user |
| `DELETE /session` | `signOut` | 204 |
| `GET /meta` | `useWaaiSession` | every feature; `user {id:"demo-user", role:"member", name: owner e-mail, crm_user_id}`; `ai_configured: true`; `standalone_url: null`; `wa_accounts: [{id:"demo-wa-account", status:"connected", display_name: owner name}]` |
| `GET /unread` | `useUnread` | from the store |
| `GET /wa/health`, `POST /wa/resync` | `ChatsTab` | healthy / no-op success (read the response types) |
| `GET /conversations` | `useConversationList` | chats newest first; `summaries` from C4 data (`task_id` = `demo-wa-task-<n>` or null, `created_at` = the chat's last message time); `completed_task_ids`; `has_wa_account: true`; `user_name` = owner name |
| `GET /conversations/:id` | conversation pane | `ConversationResponse`; `crm_links` resolved through the directory (C5.4); `quick_reactions` from preferences; `sender_name` = owner name |
| `GET /conversations/:id/messages` | `useMessages` | the chat's messages (paging params as the hook sends them; the whole chat fits one page) |
| `POST …/load-history` | `useMessages` | nothing older |
| `POST …/mark-read` | `useMessages` | sets unread to 0 |
| `POST …/send` | `Composer` | append an `out` message (`text`, quoted id; or the `FormData` file, C5.5) and return it |
| `POST /messages/:id/reaction`, `DELETE /messages/:id`, `POST /messages/:id/forward` | bubble actions | toggle the user's reaction / remove / copy to the target chats |
| `GET /messages/search?q=` | `ConversationList` | case- and diacritic-insensitive substring over bodies and transcriptions |
| `GET /conversations/:id/summary?window=` | `useChatSummary` | `recent`: the chat summary, `cached: true`; other windows: `summary: null` with the message count of the window |
| `POST /conversations/:id/summary` (stream) | `useChatSummary` | `meta`, then `done` with the same summary, `cached: true` (no real generation) |
| `GET/PUT /conversations/:id/crm-links`, `GET /crm/entities?q=` | `useChatCrmLinks`, `CrmLinkPicker` | links from the dataset via the directory; PUT changes the store; search over the directory |
| `GET /tasks?conversation=…`, `PATCH /tasks/:id`, `DELETE /tasks/:id` | `useChatTasks`, `ChatTasks` | tasks of the dataset (dates via C5.3, `origin: "waai"`, `crm_sync_state: "synced"`, `crm_task_id`); PATCH toggles status in the store |
| `POST /conversations/:id/task-updates` | `TaskUpdateComposer` | append the update as an `out` message, success |
| `POST /open/check`, `POST /open/start` | `OpenByPhone` | registered when the number is in `dataset.numbers` with `registered`; start opens the existing chat or creates an empty one in the store |
| `POST /chat/text-assist` | `TextAssist` | 501 (B7) |
| **phase 3:** `POST /digest` | `DigestTab` | `narrative` = a markdown list, one bullet per chat with its summary narrative; `tasks` = open tasks; `chat_count`; `meetings: []`; `has_audio: false`; `auto_audio: false`; `cached: true` |
| **phase 3:** `GET /digest/audio` | `DigestTab` | 501 (B7) |
| **phase 3:** `GET /tasks` (no conversation), `POST /tasks/:id/crm` | `TasksTab` | all tasks as `HomeTask` (`crm_url` = CRM hash of the task); `crm_push_enabled: true`; crm action = success |
| **phase 3:** `POST /search` | `AskTab` | `answer`: one localized sentence ("In the demo, Ask searches the demo chats. These messages match:"), `sources`: up to 5 matching messages as `AskCitation`s; no match → a localized "nothing found" sentence |
| **phase 3:** `GET/PUT /preferences`, `PUT/DELETE /preferences/quick-reactions` | `SettingsTab` | defaults, kept in the store |
| **phase 3:** `GET /wa-accounts` (and whatever else `SettingsTab` reads for a member) | `SettingsTab` | the demo account; every change 501 (B6) |
| `/admin/*` | — | 403 `forbidden` (never called by a member; a safety net) |

### C5.3 Time (`demoTime.ts`)

`day` is an offset from today and `time` is `HH:MM` in `dataset.account.timezone`.

```ts
export function zonedInstant(dayOffset: number, hhmm: string, timeZone: string, now: number): number;
```

Today's date in the zone = `Intl.DateTimeFormat("en-CA", { timeZone, year, month, day })` of `now`.
Add `dayOffset` days to that calendar date. Guess `g = Date.UTC(y, m-1, d, hh, mm)`; offset of the zone
at `g` = (the zone's wall clock at `g`, read with `formatToParts`, as a UTC number) − `g`; result
`g − offset`; recompute the offset at the result once and correct (DST edges). Unit-test
Europe/Bratislava on a summer and a winter date and America/Denver.

Freeze `now` when the store is built. If the newest message instant is later than `now − 5 min`
(a `day: 0` message whose time has not come yet), shift **all message instants** back by the same
amount so the newest is exactly 5 minutes ago; order and gaps stay. Task dates are not shifted.

### C5.4 Directory (`DemoDirectory`)

```ts
export interface DemoDirectory {
  get(type: "lead" | "project", id: string): { name: string; isClient: boolean } | null;
  search(q: string): ChatCrmEntity[];   // first 20 matches, leads and projects
}
```

Built in `App.tsx` with `useMemo` from the `leads` and `projects` already in state (a client is a lead
with a `client-*` id or `adjustment > 0`; use the helper in `src/utils/leadClient.ts`). `url` = the hash
`crmHashForRecord` gives. A link whose record is missing (demo wiped) is left out.

### C5.5 Media

The CSP in `public/.htaccess` allows `img-src data: blob:` but has **no `media-src`**, so `blob:`/`data:`
audio is blocked. Do **not** change the CSP.

- Images (`placeholder`: `slabs`, `samples`, `site`): three small SVG files in
  `src/components/whatsapp/demo/assets/`, imported through Vite (`import slabs from "./assets/slabs.svg"`).
- Voice note: one committed silent WAV in the same folder, generated once with a short Node script
  (44-byte header + zeros, 8 kHz, 8-bit mono, as many seconds as the longest `audio` message). Put the
  script in the folder too, so it can be regenerated.
- Document: `media.url` points to a small committed `document.txt` asset; `file_name` and `mime_type`
  come from the dataset (the bubble shows the file name; opening it shows the placeholder text).
- Vite returns `/assets/…` paths and `WaaiClient.mediaUrl()` prefixes anything that starts with `/`
  with the base. Return `new URL(asset, window.location.origin).href` (absolute, so it is used as is).
- Attachments sent in the demo: images get `URL.createObjectURL(file)` (allowed by `img-src blob:`);
  other kinds are stored with the same object URL and may not play — note it under **Left over**.
- Avatars: `null` (the module draws initials).

### C5.6 `WaaiClient.isDemo`

Add `isDemo?: boolean` to `WaaiClientOptions` and a `readonly isDemo: boolean` on the class. Used only
by `Composer` (C5.2 `send`) and `NativeModule` (C6). Nothing else may branch on it: demo behaviour
belongs in the router.

## C6. What the user sees in demo

- Header pill: `t.account.demo` ("Demo data" / "Ukážkové dáta" / "Demó adatok"),
  `bg-sky-50 text-sky-700 border-sky-200`, `data-testid="wa-account-pill"` as today.
- Subtitle: `t.demoSubtitle` ("Sample chats. Nothing is sent to WhatsApp." / "Ukážkové konverzácie.
  Nič sa neodosiela do WhatsAppu." / "Minta beszélgetések. Semmi nem megy ki a WhatsAppra.").
- No "Open standalone" button.
- Nav badge: the demo unread count (`c1-site` and `c6-hotel` have 2 unread each → 2 chats, 4 messages),
  like a real account.

## C7. QA spec `tests/e2e/whatsappDemo.spec.ts` (phase 3)

Model it on `tests/e2e/whatsappNativeModule.spec.ts` (session start, routes). Routes:
`**/sync.php**` → `buildSyncPayload()` with `demoMode: true` (add the demo clients/projects the links
need: leads `demo-clients-1`, `-2`, `-6` as clients and `demo-clients-10` as a plain lead, projects
`demo-projects-1`, `-2`, `-3`); `**/api/waai_sso.php` → `configured: false`; `**/api/waai_demo.php` → the sk JSON read from
`public/api/demo_seed/whatsapp_demo.sk.json`. Fail the test if any request goes to `/waai-api`.

Assert: 4 chat rows, unread badge on two; summary cards with 4 / 2 / 3 / 1 bullets; open
`demo-wa-c1-site`: messages, a document bubble, an image, a quoted reply; send "Test" → appears as the
last outgoing bubble; react 👍 → reaction shows; deep link `#whatsapp/c/demo-wa-c1-site?m=demo-wa-c1-site-m11`
→ that message is highlighted; CRM link chip shows the client name; Digest tab shows four bullets;
Tasks tab lists 9 tasks; Ask "dosky" (or a word from the sk file) returns citations; Settings opens
without an error card. Also one test with `demoMode: false` and `configured: false` → `wa-not-configured`
(nothing changed for real instances).
