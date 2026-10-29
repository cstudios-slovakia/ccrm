# WAAI ↔ CCRM integration — analysis, architecture and implementation plan

> **Status:** plan. Phases 1 (CCRM API core, v1.13.14) and 2 (task endpoints, v1.13.15) are implemented on `1.13-nectarine`; phases 3–9 are not started. Written 2026-10-29. Progress and deviations: `docs/prompts/waai-integration-sonnet.md`.
> **Repos:** CCRM = `Other_web_apps/ccrm/ccrm-app` (this repo), WAAI = `01_My_web_apps/waai`.
> **Prior art you must read:** `Other_web_apps/all-inclusive-crm/docs/WaaiTaskBridge.md`
> (the task-bridge design this plan reuses) and its PHP implementation in
> `Other_web_apps/all-inclusive-crm/modules/integration/`.

---

## 0. The answer in one page

**Do not port WAAI into CCRM, and do not build a third "middleware" service.**
WAAI stays a standalone Docker application on the VPS. Both apps get extended, but
asymmetrically:

| | Role | What gets added |
|---|---|---|
| **WAAI** | The *active* side and the WhatsApp engine. Owns the WhatsApp session, the AI, the extraction, and **all sync logic**. Its `ai-worker` already contains a finished, QA'd CRM connector (`packages/crm-client`, `apps/ai-worker/src/crm-sync`). | Make that connector CRM-agnostic (string ids), add client/project linking, timeline pushes, an **embed mode** for being shown inside CCRM, SSO from CCRM, and "open chat by phone". |
| **CCRM** | The *passive* side. Never calls WAAI server-to-server, stores no WAAI credentials. | A token-authenticated machine API **`/api/v1`** that implements the same contract as the all-inclusive-crm `integration` module (so WAAI's existing client works against it), plus directory/links/timeline endpoints; a **`whatsapp` module** that shows the full WAAI app in an iframe with single sign-on; a contact phone on projects; WhatsApp buttons on clients, leads and projects; a `whatsapp` timeline type; a WhatsApp badge on tasks. |

The connector *is* WAAI's `ai-worker`: it already has the queue, retries, cursors,
pause-on-401, payload hashing and zod validation. A separate middleware would be a
third deployable with its own state and nothing to add.

The user-facing result:

1. **Separate WhatsApp view in CCRM** — sidebar item "WhatsApp" opens the complete WAAI
   (chats, composer, voice, digest, tasks, AI lookup, search, settings) inside CCRM,
   already signed in. Every WAAI feature, present and future, is there with zero
   duplicated UI code.
2. **Chats paired with clients and projects** — WAAI matches chats to CCRM clients/leads
   by phone number (and projects by their new contact phone), lets the user link any
   chat, including groups, by hand, and pushes the links to CCRM. Client, lead and
   project views then show a WhatsApp button: **Open chat** (a linked chat exists),
   **Start chat** (no chat yet; WAAI checks the number when it's clicked), or nothing.
3. **Tasks** — every task WAAI extracts becomes a CCRM task (assigned to the right
   CCRM user, attached to the linked client/project), and stays in two-way sync
   (title, description, dates, assignee, done).
4. **Client timeline** — "task agreed on WhatsApp" and "task done" entries land on the
   linked client's timeline with a link back into the chat (and, opt-in, a daily
   conversation summary).

---

## 1. What exists today (findings)

### 1.1 WAAI (`01_My_web_apps/waai`)

- pnpm monorepo: `apps/web` (Next.js 15 App Router, Auth.js v5 Credentials, JWT
  sessions), `apps/wa-worker` (WhatsApp providers: `baileys` default-capable,
  `whatsappweb`, `openwa`, `mock`), `apps/ai-worker` (BullMQ jobs), Postgres 16 +
  pgvector, Redis 7, Caddy. Deployed with `docker-compose.prod.yml` (see
  `docs/DEPLOYMENT.md`). UI in en/sk/hu (`apps/web/src/i18n`).
- **A complete CRM task bridge already exists and is merged into `main`**
  (`feat/waai-task-bridge`): `packages/crm-client` (typed fetch client, 10 s timeout,
  no redirects, 1 MB cap, zod-validated responses, never logs bodies) and
  `apps/ai-worker/src/crm-sync` (`directory`, `push`, `sweep`, `feed`, `lookup`,
  `resync`, `complete`, `ping` jobs), Settings → CRM UI (`crm-settings.tsx`),
  pairing of WhatsApp accounts/contacts to CRM users by phone, origin/ownership
  rules, done-is-final, payload-hash change detection. It was built against
  **all-inclusive-crm** (a Yii2 CRM); its rollout there is on hold.
- That bridge assumes **integer** CRM ids: `crm_users.crm_user_id Int`,
  `wa_accounts.crm_user_id Int`, `contacts.crm_user_id Int`, zod `z.number().int()`
  for task/user ids, `Number(task.crmTaskId)` in `complete.ts`/`feed.ts`.
  `tasks.crm_task_id` is already `String`. `CRM_SYSTEM = 'ccrm'` is already the constant.
- `contacts.crm_contact_id` / `crm_system` are reserved and unused — but linking at
  **conversation** level (so groups can link to projects) is the better model, see §4.4.
- Framing is forbidden today: `Caddyfile` sets `X-Frame-Options SAMEORIGIN` and CSP
  `frame-ancestors 'self'`.
- The `baileys` provider already performs USync `onWhatsApp` lookups
  (`apps/wa-worker/src/providers/baileys.ts` ~l.2031), so "is this number on
  WhatsApp" is feasible; there is no "start a new chat by number" flow yet.
- Current WAAI branch is `feat/clickup-sync` (11 commits ahead of `main`, unmerged).
  It touches tasks and settings heavily — see decision D4.
- ⚠️ `AGENTS.md` (tracked, pushed to GitHub) contains a root password for
  185.111.88.70 in plain text. Never copy it anywhere; see §9.

### 1.2 CCRM (this repo)

- React + Vite SPA; PHP/MySQL backend in `public/` (mirrored to the root by
  `npm run sync:backend`). The SPA loads **everything** through `sync.php` and polls
  `?probe=1` every 5 s; the probe compares `ccrm_compute_data_version()` — a
  `CHECKSUM TABLE` over a fixed table list — so a server-side write to
  `tasks`/`timeline_events`/`leads`/`projects` reaches every open client on its own.
- `sync.php` already protects server-side writes from stale clients:
  delete-by-omission never removes a row whose `updated_at` is newer than the
  client's `baseSyncedAt`, and `ccrm_write_would_clobber()` skips stale re-sends.
  The task upsert (`sync.php` ~l.4704) uses an **explicit column list**, so a new
  server-only column on `tasks` survives client saves.
- **Tasks identify people by name, not id**: `tasks.owner`, `tasks.created_by`,
  `tasks.completed_by` and `task_assignees.user_name` hold user *names*.
  `tasks.deadline DATE NOT NULL` (+ optional `deadline_time` HH:MM), `start_date DATE`,
  free-form `status` from the `TASK_STATES` setting (done = `"done"` or the last state,
  `src/utils/projectTasks.ts`, `mcp_task_done_state()`), `requires_conclusion`
  (a task can refuse completion), `related_lead_id`, `related_project_id`,
  `workflow_id`. All ids are `VARCHAR(50)` strings (`tsk_…`, `client-…`, `project-…`).
- Server-side task writes already exist in the MCP tools —
  `mcp_do_create_task/update_task/complete_task` in `public/api/mcp_ext_writes.php` —
  reuse their rules (state check, conclusion rule, assignee list = visibility).
- **Clients and leads are one table** (`leads`; a client is a `client-*` row or
  `adjustment > 0`; `leads.client_id` links a lead to its client). `leads.phone`
  exists. Projects have **no phone**; they have `client_id`/`lead_id` and per-type
  "contact" attributes that point at `leads` rows.
- Users have no phone; employees do (`employees.phone`, linked by `employees.user_id`).
- Client timeline = `timeline_events` (`lead_id`, `type ENUM(...)`, `author`,
  `content`, …); there is an existing ENUM-widening migration pattern in
  `schema.php` (~l.1945).
- Existing machine auth: `mcp_keys` (sha256-hashed `ccrm_mcp_…` keys, Bearer or
  `X-API-Key`, `REDIRECT_HTTP_AUTHORIZATION` fallback) — per *user*, not suited for a
  service client, but a good pattern.
- Hash routing in `App.tsx` (`#clients`, `#client-<id>`, `#lead-<id>`,
  `#project-<id>`, sub-paths for some tabs), modules listed in
  `src/utils/moduleCatalog.ts`, permissions in `src/utils/permissions.ts`
  (module access `edit/view/nothing`), CSP in `public/.htaccess` with
  `frame-src 'self'` and `X-Frame-Options SAMEORIGIN`.
- Timezone `Europe/Bratislava` (`config.php`).
- Two production installs on Websupport shared hosting; a VPS stack exists in
  `deploy/vps/` (Caddy + Apache/PHP 8.3 + MySQL 8.4 + MariaDB) and runs on the
  Nethost test VPS.

---

## 2. Options considered

| Option | Verdict |
|---|---|
| **Re-implement WAAI's features inside CCRM** (PHP/React) | ❌ Impossible on CCRM's stack: a WhatsApp session is a long-lived socket (or a headless Chromium) with on-disk Signal state, plus BullMQ, Postgres/pgvector and ffmpeg. Shared hosting has no long-running processes. It would also fork a fast-moving product. |
| **Rebuild WAAI's UI natively in CCRM on top of WAAI's APIs** | ❌ Duplicates a large UI (chat view, composer, voice, reactions, digest, AI lookup) in a second framework; every WAAI feature would need to be built twice. |
| **Iframe only, no data sync** | ❌ Gives the separate view, but not pairing, tasks or timeline. |
| **Third service (middleware) between the two** | ❌ A third deployable with its own state and secrets. WAAI's `ai-worker` already *is* this connector. |
| **CCRM as the active side (calls WAAI's API)** | ❌ CCRM installs have no workers (cron at best), it would have to store WAAI credentials, and the polling design that already exists would be thrown away. |
| ✅ **WAAI standalone on the VPS + WAAI's `ai-worker` as the connector + a passive `/api/v1` in CCRM + WAAI embedded in a CCRM module with SSO** | Reuses ~80 % of existing, QA'd bridge code; CCRM stays a passive PHP app; nothing is lost while either side is down; one UI codebase for WhatsApp. |

---

## 3. Target architecture

```
 Browser (CCRM SPA, https://crm.example.sk)
 ┌───────────────────────────────────────────────────────────────┐
 │ Sidebar → "WhatsApp" module (#whatsapp/…)                      │
 │  ┌───────────────── <iframe src="https://wa.example.sk/…"> ──┐ │
 │  │ WAAI in embed mode (chats, digest, tasks, lookup, settings)│ │
 │  └──────────────▲──────────────────────────────┬─────────────┘ │
 │     postMessage │ ccrm:sso / navigate / theme   │ waai:route /   │
 │                 │                               │ unread / open-crm
 │ Client / lead / project views: [WhatsApp ▸ Open chat]          │
 └───────┬─────────────────────────────────────────▲──────────────┘
         │ sync.php (as today) + api/waai_sso.php   │ iframe loads WAAI
         ▼                                          │
 ┌───────────────────────────┐   HTTPS or private   ┌──────────────────────────────┐
 │ CCRM (PHP/MySQL)           │   docker network     │ WAAI (Docker on the VPS)      │
 │  /api/v1  (passive)        │◀─────────────────────│  ai-worker  ── crm-sync jobs  │
 │   ping, users, directory   │   Bearer token,      │   directory / link / push /   │
 │   tasks/external, feed,    │   IP allow-list      │   feed / lookup / timeline /  │
 │   lookup, complete         │                      │   numbers                     │
 │   whatsapp/links, numbers  │                      │  web (Next.js, embed + SSO)   │
 │   timeline/external        │                      │  wa-worker (WhatsApp session) │
 │  tables: integration_*,    │                      │  Postgres+pgvector, Redis     │
 │   whatsapp_links/_numbers  │                      └──────────────────────────────┘
 └───────────────────────────┘
```

Rules that keep this safe and simple:

- **Only WAAI's `ai-worker` talks to CCRM's API** (as in the existing design: `web`
  must not, because of the link-preview SSRF finding B3-01).
- **CCRM never calls WAAI from PHP.** The only CCRM→WAAI interaction happens in the
  browser: the iframe and a short-lived SSO token handed over by `postMessage`.
- **No raw WhatsApp message text is copied into CCRM.** CCRM receives chat titles,
  phone digits, AI-extracted task titles/descriptions, timeline entries and deep-link
  paths. The chat itself is only ever read inside WAAI.

---

## 4. Detailed design

### 4.1 CCRM machine API (`/api/v1`)

Port of the all-inclusive-crm `integration` module (§7–§8 of `WaaiTaskBridge.md`) to
CCRM's plain-PHP style. Keep its conventions exactly unless this section says
otherwise — WAAI's client depends on them:

- JSON only; 415 for another content type; 413 above 64 KB; error envelope
  `{error:{code,message,fields?,request_id}}`; status semantics of §7.1 (400/413/415/422
  refused, 401/403 auth, 404 `not_found` vs 404 `route_not_found`/405, 410 gone, 429
  with `Retry-After`, 5xx temporary).
- `Authorization: Bearer ccrm_int_<prefix>_<secret>` only (256-bit secret; store
  sha256 + compare with `hash_equals`; optional expiry; several tokens per client
  for rotation; `last_used_at/ip`).
- Order of checks: token → network (`allowed_ips` against raw `REMOTE_ADDR`;
  `require_direct` rejects any `X-Forwarded-For`) → scope → rate limit (300/min per
  token; one atomic `INSERT … ON DUPLICATE KEY UPDATE` row per token and minute in `integration_rate`, no lock needed) → size → content type.
- No PHP session, no cookies, no CORS on these routes. Never log bodies or the query
  string; log request id, client, token prefix, method, path, entity id, status,
  duration.
- **Routing (as built):** `public/.htaccess` has `RewriteRule ^api/v1(/.*)?$ api/integration.php [E=HTTP_AUTHORIZATION:%{HTTP:Authorization},L,QSA]`; `integration.php` reads the route from `REQUEST_URI` (not a `?__route=` parameter, so an encoded `&` in a path cannot inject query parameters) and falls back to `REDIRECT_HTTP_AUTHORIZATION` / `getallheaders()`. Verified on the dev Apache container; verify again behind the VPS Caddy (phase 8).

**Files (all under `public/api/`, then `npm run sync:backend`):**

| File | Content |
|---|---|
| `integration.php` | Front controller: envelope, request id, router, auth pipeline, unmatched routes → `route_not_found`/405. |
| `integration_lib.php` | Token auth, scopes, network, rate limit, text sanitizer (port of `TextSanitizer.php`: strip tags, control chars, bidi overrides, BOM; keep ZWJ), ISO-8601 date parsing (strict, 1 y back / 5 y ahead), user name↔id resolution. |
| `integration_tasks.php` | Push (upsert + three-way merge), feed, lookup, complete, serializer. |
| `integration_directory.php` | `users`, `directory`. |
| `integration_whatsapp.php` | `whatsapp/links`, `whatsapp/numbers`, `timeline/external`. |
| `integration_admin.php` | Session-authenticated, admin-only management for the Settings UI (create/edit client, issue/revoke tokens, read status). |
| `waai_sso.php` | Session-authenticated: mints the SSO token for the embedded view (§4.7). |

**Endpoints**

| Method + path | Scope | Notes |
|---|---|---|
| `GET /ping` | any | `{client, scopes, server_time}` |
| `GET /users` | `users:read` | Active users: `id` (string), `name`, `email`, `phone` (from the linked employee, raw). |
| `GET /directory?updated_since=&after_id=&limit=` | `directory:read` | Paged, ordered by `(updated_at, id)`. Items: `{type:'lead', id, name, is_client, client_id, phone, country, archived, updated_at, url}` and `{type:'project', id, name, client_id, lead_id, contact_phone, contact_lead_ids[], status, archived, updated_at, url}`. `is_client` follows the `client-*`/`adjustment>0` rule; `contact_lead_ids` are the project's "contact"-attribute values. No financial data. |
| `PUT /tasks/external/{externalId}` | `tasks:push` | As in the bridge design, plus optional top-level `lead_id`, `project_id`, `start` (all three-way merged). |
| `GET /tasks/feed` | `tasks:pull` | `updated_since` (unix s), `after_id` (**string**), `limit ≤ 100`, `open_only`. |
| `POST /tasks/lookup` | `tasks:push` or `tasks:pull` | `task_ids` (**strings**), `external_ids`; ≤ 200. |
| `POST /tasks/{id}/complete` | `tasks:pull` | Idempotent; `requires_conclusion` without a conclusion → 422 `completion_refused`. |
| `PUT /whatsapp/links/{conversationRef}` | `whatsapp:links` | Replaces the full link set of one WAAI conversation (§4.4). |
| `DELETE /whatsapp/links/{conversationRef}` | `whatsapp:links` | Conversation gone in WAAI. |
| `PUT /whatsapp/numbers` | `whatsapp:links` | Batch `{items:[{phone, status:'registered'|'not_registered', checked_at}]}` (≤ 500). |
| `PUT /timeline/external/{externalId}` | `timeline:push` | Upsert of one timeline entry (§4.6). 410 when a CCRM user deleted it. |

**Task representation** — same shape as the bridge (`id, url, origin, external_id,
title, description, state{code,label}, done, due{at,all_day}, created_by,
assignee_ids, is_automation, updated_at`) with these CCRM specifics:

- all ids are strings; `created_by`/`assignee_ids` are user ids resolved from the
  stored names (an unresolvable name is dropped, never guessed);
- extra fields `lead_id`, `project_id`, `start` (ISO date or null);
- `state.code` = the stored status, `done` = `mcp_done_task_state()` rule;
- `due.at` = `deadline` + `deadline_time` (23:59 when null) in `Europe/Bratislava`,
  `all_day = deadline_time IS NULL`;
- `is_automation = workflow_id IS NOT NULL`;
- `url` = the CCRM hash link that opens the task (find the existing deep-link format
  in `App.tsx`; add one if there is none).

**Push mapping (WAAI → CCRM)**

| WAAI payload | CCRM column | Rule |
|---|---|---|
| `title` | `title` | sanitized, ≤ 255 |
| `description` + footer | `description` | footer built by CCRM: chat name, WhatsApp assignee label, and an "Open chat" link `<ccrm base>/#whatsapp<path>` (path validated `^/c/[A-Za-z0-9_-]+(\?m=[A-Za-z0-9_-]+)?$`) |
| `start` | `start_date` | date part, local tz |
| `due` | `deadline`, `deadline_time` | `all_day` → time NULL. **No due** → `deadline = today + default_deadline_days` (client setting, default 7) and `external_meta_json.due_inferred = true`; a due stated later replaces it through the merge |
| `status` | `status`, `completed_by/at` | `open` on create → first `TASK_STATES` state; `open` on update never moves a task between non-done states; `completed` → done state, `completed_by` = owner name |
| `owner_id` | `created_by` | owner user's *name*; must be one of the client's `owner_user_ids` |
| `assignee_ids` | `owner` + `task_assignees` | names of active users; first one is `owner`; empty → the owner |
| `lead_id` / `project_id` | `related_lead_id` / `related_project_id` | must exist; three-way merged, so a CCRM user's re-link survives |
| — | `priority` | `medium` on create, never touched again |
| — | `external_source='waai'`, `external_url` (WAAI path), `external_meta_json` | **new server-only columns**; never in `sync.php`'s upsert list; returned by the GET for display |

Three-way merge, `revision` staleness, 410 after a CCRM delete — exactly as the
bridge (`integration_refs.applied_snapshot`, see §4.2). CCRM hard-deletes tasks via
sync, so "deleted" = ref exists but the task row does not (no FK needed).
Every server-side write sets `updated_at = NOW(3)` so the omission/clobber guards in
`sync.php` protect it, and writes an `audit_log` row (`integration_task_push`, id
only, no text).

**Notifications:** none from CCRM for WAAI-origin tasks (WAAI already notifies; new
tasks get no `email_reminders_json`). Check whether `workflows_engine.php` fires on
task creation; if it does, do **not** fire it for WAAI pushes (document it). This is
decision D9.

**As built (phase 2)** — `public/api/integration_tasks.php`; where it differs from the text above:

- **Wire shapes.** `PUT /tasks/external/{externalId}` takes `revision` (positive int), `title`,
  `description`, `status` (`open|completed`), `owner_id`, `assignee_ids`, `due {at, all_day}`,
  top-level `start` (the old `context.start` is still read), optional `lead_id` / `project_id`
  and `context {conversation, is_group, assignee_label, path}`. A `lead_id` / `project_id` key
  that is **absent** leaves the link alone; `null` clears it (when the chat changed it). User ids
  are strings (an integer is accepted and read as a string). Answers: 201 on create, 200
  otherwise, with the task representation plus `stale` and `applied` (the changed fields).
- **Footer** is written in the install language (`SYSTEM_LANGUAGE`: en, sk, hu); the chat link
  is built from `CCRM_APP_URL` or the stored `APP_BASE_URL` — never from the request host, which
  is the container name behind S1. Without a known base URL the footer simply has no link line.
- **No date.** A first push with no `due` stores `today + default_deadline_days`, all day, with
  `external_meta_json = {due_inferred: true, inferred_deadline: <date>}`. The sync response
  carries `dueInferred`, which is true only while the deadline still equals `inferred_deadline`,
  so a user moving it (the app's save leaves the meta alone) makes it a stated date. A later push
  with a real date replaces it through the merge; a date the chat **takes back** falls to
  `today + default_deadline_days` and is marked `due_inferred` again (`tasks.deadline` is NOT NULL) —
  but only while the deadline is still the one the chat last set; a date a CCRM user moved stays.
- **Completion.** A push that completes a task whose `requires_conclusion` is set and has no
  conclusion answers **422 `completion_refused`** and rolls the whole push back (nothing is
  applied; the same message as `POST /tasks/{id}/complete`). `completed_by` is the pushed owner;
  for `/complete` it is the optional body `user_id`, else the client's first owner. Done is
  final: once done in CCRM, a push changes nothing (but still advances the stored revision).
- **Feed** pages by `(FLOOR(UNIX_TIMESTAMP(updated_at)), id)` — whole seconds, because
  `tasks.updated_at` is `TIMESTAMP(3)` and the contract's cursor is `updated_since` in unix
  seconds. `after_id` is a string. `open_only` drops done tasks. WAAI-origin tasks are in the
  feed too (with `origin: "waai"`); tasks another client pushed never are.
- **Task `url`** is `<base>#tasks?task=<id>`; the app does not open a specific task from that
  link yet (it lands on Tasks). Opening the drawer from `?task=` comes with the task badges in
  phase 6.
- **D9.** Like the MCP task tools, these writes go straight to the tables: no `task_created` /
  `task_status_changed` workflows, no assignment or completion e-mails, no ticket auto-resolve
  (`ticket_task_links`). If a completion from WAAI should resolve a linked ticket, that is a
  follow-up.
- Rate limit, auth order and error envelope are those of phase 1; `integration_refs` rows for
  tasks use `kind = 'task'`, `local_id` = the CCRM task id, `applied_snapshot` = the composed
  values last applied (ids, not names, for people).

**As built (phase 4)** — `public/api/integration_directory.php`, `integration_whatsapp.php`, `schema.php`, `sync.php`; where it differs from the text above:

- **`GET /directory`** pages by `(updated_at in whole seconds, "<type>:<id>")`: `updated_since` (unix seconds), `after_id` (`lead:<id>` or `project:<id>`, empty for the first page), `limit` 1–200 (default 100). One list holds clients, leads and projects; `next` carries the cursor of the last item. Items are as in the table, with `phone`, `country` (the text typed in the lead, e.g. `Slovakia`) and `contact_phone` **raw** - WAAI normalises them, because only it knows the default country. `url` is `<base>#clients/<id>`, `#leads/<id>` or `#projects/<id>` (`null` without a known base URL). `contact_lead_ids` are the lead ids stored in the project's "contact"-type attributes (one id per attribute; an old JSON list is read too). Archived records are listed with `archived: true`, not left out. **A deletion is not reported**: WAAI drops what the directory no longer lists in its nightly full read. No financial field, e-mail or owner is exposed.
- **`PUT /whatsapp/links/{conversationRef}`** (`^[A-Za-z0-9_-]{1,64}$`) takes `title` (cleaned like any text from the chat, ≤255), `is_group`, `phone` (5–20 digits with the country code, or `null`), `owner_id` (a CCRM user id or `null`), `path` (`/c/<id>` - the chat, never a message), `last_message_at` (ISO 8601 **with** a zone, no date window, or `null`) and `links` (≤50 of `{entity_type: lead|project, entity_id, source: auto|manual}`). It replaces the whole set in one transaction and is idempotent (an identical PUT leaves `updated_at` alone). A link to a lead or project CCRM does not have is **left out and listed in `ignored`** instead of failing the request, so one deleted record cannot keep a chat from syncing. An empty `links` list removes every link. `DELETE` removes a chat's links (200, `deleted: n`, safe to repeat). Both are audited with the reference and a count only, never the title.
- **`PUT /whatsapp/numbers`** takes `items` (≤500 of `{phone, status, checked_at}`); the newest `checked_at` per number wins, so a late answer cannot overwrite a newer one.
- **Schema**: `whatsapp_links` (a foreign key to `integration_clients`; no key on `entity_id`), `whatsapp_numbers`, `projects.contact_phone VARCHAR(50)`, and indexes on `leads.updated_at` and `projects.updated_at` for the directory paging. All in `schema.php` (`ccrm_migrate_integration_directory`).
- **`sync.php`**: a project carries `contactPhone`. A save without the key leaves the stored value alone (an older app cannot wipe it), `""` clears it, the text is trimmed and cut to 50 characters. The GET returns `whatsappLinks` and `whatsappNumbers` only when the caller has the `whatsapp` permission; that permission is added in phase 7, so **until then only an administrator receives them** (fail closed). A save from the app never writes either table. Both tables are in the data version.
- **Messages in the install language.** The text a WAAI user can read - `completion_refused`, "deleted in CCRM" (410) and "no such task" (404) - is written in `SYSTEM_LANGUAGE` (en, sk, hu; another value falls back to Slovak, like the task footer). The other messages (token, scope, network, size, validation) are for the administrator and stay English. Error `code`s never change.
- **Not in this phase:** the contact-phone field on the project screen and the app's use of `whatsappLinks` (phase 6).
- **Verification.** `npm run test:integration`: 301 checks (directory paging across equal timestamps, the cursor, every refused parameter, the contact attribute, the app's save of `contactPhone` including "key absent", link replace/idempotence/collapse/ignored/clear, validation, delete, numbers, the sync GET for an administrator and for a user without the permission, the audit trail, and the three languages for the three messages). `npx tsc -p tsconfig.app.json`, `npm run test:unit` (1050). The scoped browser audit (`src/types/index.ts`) reports the same two findings as the untouched build (sidebar item #1 on the dashboard, the header timer button).

### 4.2 CCRM data-model changes (`public/api/schema.php`)

All DDL lives in `schema.php` (so the `ccrm_schema_fingerprint()` gate re-runs it).
Idempotent `CREATE TABLE IF NOT EXISTS` + `information_schema`-checked ALTERs, as the
file already does.

```
integration_clients   id VARCHAR(50) PK, code VARCHAR(50) UNIQUE ('waai'), name, is_active,
                      scopes JSON, allowed_ips JSON, require_direct TINYINT,
                      owner_user_ids JSON, feed_scope ENUM('owners','all') DEFAULT 'owners',
                      embed_url VARCHAR(255) NULL,           -- https://wa.example.sk
                      sso_secret VARCHAR(255) NULL,          -- stored like other CCRM secrets (check how
                                                             -- company_mailboxes stores passwords)
                      default_deadline_days INT DEFAULT 7,
                      settings_json TEXT NULL, created_at, updated_at
integration_tokens    id, client_id, prefix UNIQUE, token_hash CHAR(64), expires_at NULL,
                      revoked_at NULL, last_used_at, last_used_ip, created_at
integration_refs      id BIGINT PK, client_id, kind ENUM('task','timeline'),
                      external_id VARCHAR(64), local_id VARCHAR(50) NULL,
                      revision BIGINT, applied_snapshot JSON, created_at, updated_at,
                      UNIQUE(client_id, kind, external_id), INDEX(local_id)
integration_rate      token_prefix, window_start, hits  (PK token_prefix+window_start)
whatsapp_links        id, client_id, conversation_ref VARCHAR(64), entity_type ENUM('lead','project'),
                      entity_id VARCHAR(50), link_source ENUM('auto','manual'),
                      title VARCHAR(255), is_group TINYINT, phone_digits VARCHAR(20) NULL,
                      owner_user_id VARCHAR(50) NULL,       -- CCRM user who owns the WhatsApp account
                      path VARCHAR(255), last_message_at DATETIME NULL, updated_at TIMESTAMP(3),
                      UNIQUE(conversation_ref, entity_type, entity_id), INDEX(entity_type, entity_id)
whatsapp_numbers      phone_digits VARCHAR(20) PK, status ENUM('registered','not_registered'),
                      checked_at DATETIME, updated_at TIMESTAMP(3)
tasks                 + external_source VARCHAR(20) NULL, external_url VARCHAR(255) NULL,
                        external_meta_json TEXT NULL
timeline_events       + type ENUM value 'whatsapp'; + external_url VARCHAR(255) NULL
projects              + contact_phone VARCHAR(50) NULL   (editable, synced like other project fields)
```

`sync.php`:
- GET returns `whatsapp_links` + `whatsapp_numbers` (only when the caller's scope
  allows the `whatsapp` module) and the new task/timeline/project columns; POST never
  writes `external_*` or the two WhatsApp tables; POST does read/write
  `projects.contact_phone`.
- Add `whatsapp_links` and `whatsapp_numbers` to `ccrm_compute_data_version()`'s
  candidate list (they are returned by the GET). Do **not** add `integration_*`.
- Never put integration work in the probe path.

Update `src/types/index.ts`, the sync mappers, and `entities_overview.md` (use the
`entity-sync` skill).

### 4.3 WAAI changes

**a) CRM-agnostic ids (small, first).**
- Prisma migration: `crm_users.crm_user_id`, `wa_accounts.crm_user_id`,
  `contacts.crm_user_id` → `TEXT` (`USING crm_user_id::text`).
- `packages/crm-client`: ids parsed as `z.union([z.string(), z.number()]).transform(String)`
  (task `id`, `created_by`, `assignee_ids`, user `id`, feed `next.after_id`);
  `CrmPushPayload.owner_id: string`, `assignee_ids: string[]`; `lookup({taskIds: string[]})`;
  `complete(taskId: string)` with `encodeURIComponent`. Remove every `Number(...)`
  on CRM ids in `crm-sync`. Optional fields: user `email`, task `lead_id`,
  `project_id`, `start`.
- **Stay compatible with all-inclusive-crm:** if its validators require integers,
  send digit-only id strings as numbers (check `ExternalTaskService.php`). Its unit
  tests in `crm-client.test.ts` must keep passing; add CCRM-shaped fixtures.

**As built (phase 3)** — WAAI branch `feat/ccrm-integration`, commit "CRM-agnostic string ids in the task bridge":

- **Ids.** Migration `20261029120000_crm_string_ids` turns `crm_users.crm_user_id`, `wa_accounts.crm_user_id` and `contacts.crm_user_id` into `TEXT` (`USING …::text`; tried on a clone of the dev schema with integer rows — the values, the primary key and the phone index survive). `crm-client` parses an id as string-or-integer and keeps a string (`crmIdSchema`); `CrmPushPayload.owner_id` / `assignee_ids`, `lookup`, `complete` and the placement rules take strings; every `Number()` on a CRM id in `crm-sync` is gone; Maps and Sets are keyed by string. The first push after the upgrade re-sends each synced task once (the payload hash changed with the id type); CCRM answers it as an idempotent update.
- **Both CRMs.** CCRM takes strings. all-inclusive-crm validates integers (`owner_id`, `assignee_ids`, `task_ids`), so `CRM_ID_FORMAT=integer` on `ai-worker` makes the client send all-digit ids as numbers. A plain `string` default cannot serve both: CCRM answers 422 to an integer in `task_ids`.
- **Feed cursor.** `after_id` is a string and is left out of the first request (both CRMs read an absent value as "from the start"); an empty `next.after_id` on an empty page is accepted. The stored cursor's `afterId` is a string now; the feed never reads the stored one, so an old numeric value is harmless.
- **Optional fields** the schemas now accept: user `email`, task `lead_id`, `project_id`, `start`. They are read but not yet sent or used (that is §4.3 c, phase 4).
- **Refused completion.** A push of a task that needs a conclusion answers 422 `completion_refused`; the existing handling in `push.ts` unticks the task and shows CCRM's message (`crmError`). The message is CCRM's own English text whatever the install language.
- **Settings → CRM** already said only "CRM"; the docs (`ARCHITECTURE.md`, `AGENTS.md`, `ROADMAP.md`, `.env.example`) now name CCRM and the id format.
- **Verification.** `pnpm typecheck`, `pnpm test` (crm-client 36 tests incl. CCRM-shaped fixtures, integer mode, cursor, refused completion; web 9), `pnpm lint` (0 errors, 3 existing warnings). End to end with the real `crm-sync` functions against a scratch CCRM (clone of the dev database, served from `/waaie2e`) and a scratch Postgres database: ping; user directory; auto pairing of the WhatsApp account and a contact by employee phone; dry-run payload with string ids and nothing sent; real push (CCRM row, names mapped, source `waai`); an unchanged re-push sends nothing; no date -> today + 7 days marked not stated; done in CCRM -> done in WAAI (feed); done in WAAI -> done in CCRM (push); a task that needs a conclusion is unticked in WAAI with the reason and stays open in CCRM; a CCRM-origin task imported into the colleague's chat and completed from WAAI (`POST /tasks/{id}/complete` with a string id); `lookup` with string ids. 18/18. Both scratch databases and the test token were removed. Not run: the all-inclusive-crm backend (integer mode is unit-tested only) and the Settings → CRM page in a browser (type-checked).
- **Found on the way (not caused by this phase):** `prisma migrate deploy` fails on an empty database at `20260527085616_phase_7_migration` (`ERROR: relation "summaries_conversation_id_window_from_at_to_at_latest_messa_key" already exists`, apparently an index-name collision; the cause was not investigated, and it was not checked how the existing dev database got past it). Relevant to phase 8 — a fresh VPS database has to be created another way or that migration fixed. Also: workspace packages run from `dist/`, so after switching WAAI branches run `pnpm --filter "./packages/*" build` before anything that uses `tsx`.

**b) CRM directory cache + linking (new).**
- Tables: `crm_entities` (`entity_type`, `crm_id`, `name`, `phone_digits[]`,
  `client_id`, `is_client`, `archived`, `crm_updated_at`, `fetched_at`; unique on
  type+id) and `conversation_crm_links` (`conversation_id`, `entity_type`,
  `crm_entity_id`, `source` = `auto|manual|blocked`, `created_at`; unique on the
  triple; `blocked` = the user removed an auto link, so it is never re-added).
- Jobs on the `crm-sync` queue: `entities` (incremental every 10 min via
  `/directory` cursor, full nightly), `link` (per conversation, debounced,
  `jobId crm-link|<conversationId>`), `links-sweep` (every 15 min: re-evaluate and
  re-push conversations whose computed link set hash differs from the one CCRM
  acknowledged).
- Rules in §4.4. UI: a "CRM" chip in the conversation header — shows linked
  client/project, opens a picker (search over `crm_entities`) to link/unlink;
  ambiguity hint ("2 clients have this number — choose"). Settings → CRM gets a
  "Linked chats" table.

**c) Task payload.** `push` sends `lead_id`/`project_id` from the conversation's links
(project link wins for `project_id`; client for `lead_id` — a project link also
implies its `client_id`). `start` sent as its own field (still in the footer for
all-inclusive-crm). Direction B placement (optional, phase 9): a CCRM task whose
`lead_id` is linked to a 1:1 chat lands in that chat before the existing
counterpart rule applies.

**As built (phase 4)** — WAAI branch `feat/ccrm-integration`, commit "Directory cache and chat links":

- **Fresh-database migration - settled.** Cause: Postgres cuts identifiers at 63 characters. Migration `0006` created the summaries index under the cut name `…_latest_message_i`; `0007_summary_output_locale` then dropped the 62-character name (which never existed) and created a new index under it; `20260527085616_phase_7_migration` renamed the old index to that same name and failed. On the existing databases the order of events was different, which is why only a fresh install broke. Fix: the rename in `20260527085616_phase_7_migration` runs only when the target name is free (it was edited in place; `prisma migrate deploy` and `migrate status` do not check checksums, and `migrate status` on the dev database shows no complaint). A fresh database now applies all 45 migrations, and `prisma migrate diff` against `schema.prisma` shows only what the dev database shows too: the unused `summaries.output_locale` column (it has a default, nothing reads it) and one cosmetic index name. A new install therefore runs `prisma migrate deploy`; no other route is needed.
- **Phone numbers** (`crm-client/src/phone.ts`): `normalizePhoneDigits(raw, country)` reads `+`/`00` prefixes, a written-out trunk zero (`+421 (0)905…`), `0…` (and Hungary's `06…`) as national, and a 9-digit CZ/PL number without a prefix; the default is a calling code or an ISO code. `callingCodeForCountry` maps the country text typed in a lead (`Slovakia`, `Slovensko`, `Magyarország`, `Österreich`, … in sk/en/hu/de) to its code; unknown text falls back to the default country (Settings → CRM, default `SK`). A project's number is read in its client's country. Tests: SK, CZ, HU, AT, DE formats, `00`, `+`, spaces, leading `0`, refused input.
- **Link rules** (`crm-client/src/linking.ts`, pure, 30 tests): §4.4 exactly - archived records ignored, a lead is mapped to its client, one client wins (also over a lone lead), two clients or two plain leads are ambiguous (nothing linked, the user chooses), every non-archived project whose contact phone matches is linked, a group or a hidden-number chat is never linked automatically. `mergeLinks` adds the user's decisions: manual first (survives a phone change; dropped only when the record left the directory), automatic ones unless blocked. A stored automatic row is never trusted: the rules decide every time.
- **Data**: `crm_entities` (type, CRM id, name, normalised numbers, client id, `is_client`, archived, the lead's country, url), `conversation_crm_links` (source `auto|manual|blocked`; the CRM id is a plain string, not a key, so a record can leave the directory and come back) and `conversations.crm_links_hash` / `crm_links_pushed_at`. Migration `20261029140000_crm_directory_links`.
- **Jobs** on the `crm-sync` queue: `entities` (every 10 min, from the saved cursor; at most 50 pages of 200 per run), `entities-full` (03:10 nightly; the only read that deletes what the directory no longer lists - and not when it came back empty), `links-sweep` (every 15 min and after any directory change: re-evaluates every chat in memory, sends the ones whose set differs from what the CRM acknowledged, at most 150 sends a run) and `link` (one chat, enqueued by the UI after a manual change). **Not wired:** a new chat or a changed title is picked up by the next sweep (≤15 min), not by an immediate job - `wa-worker`'s ingest was left untouched.
- **What is pushed**: title, group flag, phone digits, owning CRM user, `/c/<id>`, last message time and the links. Identical content is not sent again; the last-message time alone refreshes at most every 10 minutes. A chat whose links were all removed is cleared in the CRM once (`DELETE`). A refused payload is logged (id only) and skipped so it cannot hold the sweep. Everything stays inside the CRM gate: nothing runs while the bridge is paused, and the feature is on only when the connection test reported the `directory:read` and `whatsapp:links` scopes (a CRM without them - all-inclusive-crm - sees no change at all).
- **Task payload (§4.3 c)**: `lead_id` is the linked client (or lead; a project alone implies its client), `project_id` the project when **exactly one** is linked (several projects in one chat leave the task on the client). `null` means "not linked"; the keys are left out for a CRM without a directory. `start` is also sent top-level. The first push after the upgrade sends each open task once more (the payload changed), which CCRM answers as an idempotent update.
- **UI**: a "CRM" chip under the chat title - the linked record(s) (`+n` for more), an amber hint when the number is ambiguous, a panel to pick one of the candidates, search the directory by name or number, open the record in the CRM, or remove a link (an automatic link is *blocked*, a manual one deleted). Settings → CRM gets a "Linked chats" section (directory counts, default country for numbers without a country code, the chats with their links and when they were last sent). Strings in en, sk, hu. Server actions write only WAAI's own tables and enqueue the job (`web` never talks to the CRM).
- **Build fix found on the way (not caused by this phase)**: neither `Dockerfile.worker` nor `Dockerfile.web` ever copied `packages/crm-client` (manifest, build, `dist`), so an image built from `main` could not install or start the bridge. Both now do; `apps/web` depends on the package and transpiles it. Not built here (no image build on this machine) - first thing to confirm in phase 8.
- **Verification.** `pnpm typecheck`, `pnpm test` (crm-client 100 tests, web), `pnpm lint` (0 errors, the 3 existing warnings). End to end with the real worker functions against a scratch CCRM and a scratch Postgres database (25 checks): ping and scopes; the directory read with SK and HU numbers; automatic links for a client, a lead of that client, a project and an HU client; an ambiguous number linked to nothing; the rows CCRM holds; no resend when nothing changed; a manual link resolving the ambiguity; a block removing the link from CCRM and staying removed after the sweep; a changed title; an incremental directory read picking up a changed project phone and the link moving to another chat; tasks from a client chat and from a project chat landing on the right client/project in CCRM; a deleted project invisible to the incremental read and dropped by the nightly one, with its links cleared in CCRM. Scratch databases and the Redis logical database used were removed. Not run: the new header chip and the Settings section in a browser (type-checked and linted), the Docker image builds.
- **Known limits**: links of a chat that WAAI deletes (Reset chat data) stay in the CCRM until the next push for that reference is made by hand - the `DELETE` route exists but nothing calls it yet; there is no "restore the automatic link" button (linking the record again by hand makes it manual); bulk "is it on WhatsApp" checks stay off (D6).

**d) Timeline job** (§4.6).

**e) Embed mode + SSO + open-by-phone** (§4.7).

Respect WAAI's own rules (`CLAUDE.md`/`AGENTS.md`): only `ai-worker` talks to the
CRM, the `web` app only writes tables/enqueues jobs; all CRM input zod-validated and
cleaned with `cleanInboundLine/Text`; bodies never logged; payload hashes, not
`updatedAt`, decide what to resend (Prisma's `@updatedAt` pitfall, bridge §3.2).

### 4.4 Pairing rules (WAAI decides, CCRM displays)

Phone normalisation: digits with country code. CCRM numbers are free text
(`0905 123 456`, `+421 905…`, `00421…`); use the lead's `country` (default
from a WAAI setting, `SK`) to expand a national number. Reuse/extend the normaliser
the bridge already uses for the user directory; unit-test it.

Auto links (only for 1:1 chats with a real phone number; LID-only contacts link
manually unless the provider knows the LID↔number pairing):

1. **Client/lead:** collect `crm_entities` of type `lead` whose phone matches.
   - Map each match to its client (`is_client` → itself; else `client_id` if it
     points at an existing client).
   - Exactly one distinct client → link that client.
   - No client, exactly one non-archived lead → link that lead.
   - Anything else → ambiguous: no auto link, surface the choice in the UI.
2. **Project:** every non-archived project whose `contact_phone` matches → link it
   (several projects of one client may share the client's chat — that is fine).
3. **Groups:** manual only (optional later: suggest by group subject ≈ project name).
4. Manual beats auto; `blocked` beats auto; manual links survive phone changes.

What CCRM receives per conversation: title, is_group, phone digits, owning CCRM user
(`wa_accounts.crm_user_id`), deep-link path `/c/<conversationId>`, last message time,
and the entity list. Pushed after every link change, title change, and at most every
10 min for `last_message_at`.

**"Is this number on WhatsApp?"** Primary signal = a linked chat exists. For a number
without a chat the CCRM button says **Start chat**; WAAI checks the number *on click*
(single lookup, rate-limited per user). Bulk background checks of all CRM numbers are
**off by default** (decision D6): mass contact discovery is a known trigger for
WhatsApp account restrictions, and losing the user's main number is not worth a
badge. When switched on: ≤ 30 lookups/hour, only numbers never checked or checked
> 30 days ago, results pushed to `/whatsapp/numbers`.

### 4.5 Tasks — behaviour summary

Everything in bridge §4–§6 applies (owner, person mapping, origin owns content,
status shared, done is final, deletions, conflicts) with CCRM ids/names. Additions:

- Extracted task → CCRM task attached to the linked client/project → it shows in the
  client's and project's task panels (`EntityTasksPanel`, `ProjectTasksPanel`)
  without any extra work.
- CCRM UI marks such tasks with a WhatsApp badge and an **Open in chat** action
  (`#whatsapp` + `external_url`); a `due_inferred` task shows "deadline not stated in
  chat" next to its date.
- Go-live: direction A (push) on; direction B (CCRM tasks into WAAI) off until
  decided (D8).

### 4.6 Client timeline

Job `timeline` on the `crm-sync` queue, enqueued on task create/complete (and
caught by a sweep). `PUT /timeline/external/{externalId}` body:

```json
{ "revision": 1730190000000, "kind": "task_created",
  "lead_id": "client-123", "project_id": "project-9",
  "at": "2026-10-29T14:03:00+01:00",
  "title": "Zaslať cenovú ponuku na kuchyňu",
  "content": "Do piatku 1.11. · zodpovedný: Peter · z chatu „Marek Novák“",
  "path": "/c/ckx8…?m=ckm2…" }
```

- `kind`: `task_created`, `task_done`, later `summary` (opt-in daily summary of a
  linked chat, D10). External ids: `task_created:<taskId>`, `task_done:<taskId>`,
  `summary:<conversationId>:<YYYY-MM-DD>`.
- CCRM writes `timeline_events` (`type='whatsapp'`, `author` = NULL, title localized by
  WAAI in the CCRM install language — add `language` to the client settings or reuse
  the conversation's send language; `external_url` = path), keyed through
  `integration_refs(kind='timeline')`; a ref whose row is gone → 410 (never recreate
  what a user deleted); stale revision → `{stale:true}`.
- Sent only when the conversation is linked to a client/lead (`lead_id` required).
- Project timelines (per-type `proj_timeline_<type>` tables) are out of scope for v1.
- Content is AI-extracted text only, never message bodies.

### 4.7 The WhatsApp module: embedding + SSO

**Hosting topology (decision D2):** WAAI on a subdomain of the CCRM site, e.g.
`wa.example.sk` next to `crm.example.sk`. Same *site*, different *origin*: session
cookies with `SameSite=Lax` are sent inside the iframe, Safari/Firefox do not block
them, and the two apps keep separate origins (an XSS in one cannot read the other's
storage). Cross-site embedding (WAAI on an unrelated domain) is **not supported in
v1**: the module falls back to "Open WhatsApp in a new tab" (top-level SSO). Optional
later: `Partitioned` cookies.

**Headers.**
- WAAI: `frame-ancestors 'self' {$WAAI_EMBED_ORIGINS}` in the Caddy CSP (env), drop
  `X-Frame-Options` when embedding is configured (it cannot list origins), mirror the
  same in Next headers if WAAI sets any there.
- CCRM: `public/.htaccess` CSP `frame-src 'self'` must allow the WAAI origin. The
  WAAI URL is per install and `.htaccess` is static, so the default is
  `frame-src 'self' https:` (decision D7, needs Peter's OK). Do not touch
  CCRM's own `X-Frame-Options`/`frame-ancestors` (CCRM is not being framed).
- The iframe: `allow="microphone; camera; clipboard-read; clipboard-write; autoplay; fullscreen"`
  (voice notes need the microphone), `referrerpolicy="strict-origin"`, no `sandbox`
  (WAAI needs same-origin storage and forms).

**SSO (one-time token over postMessage — never in a URL).**
1. CCRM `WhatsAppView` mounts the iframe at `<embed_url>/embed/sso?next=<path>`.
2. WAAI's `/embed/sso` page (public route) posts `waai:ready` to `window.parent`
   with target origin = the configured CCRM origin (`CCRM_ORIGIN` env).
3. CCRM checks `event.origin === embed origin`, calls `api/waai_sso.php`
   (session-authenticated; requires the `whatsapp` permission; rate-limited) which
   returns an HS256 JWT: `iss` = CCRM base URL, `aud` = `waai`, `sub` = CCRM user id,
   `email`, `name`, `iat`, `exp` = +60 s, `jti` random. Secret = `integration_clients.sso_secret`
   (separate from the API token).
4. CCRM posts `ccrm:sso {token}` into the iframe (target origin = WAAI origin).
5. WAAI's page calls `signIn('ccrm', {token, redirect:false})` — a new Auth.js
   Credentials provider that verifies signature (`jose`), `iss`/`aud`/`exp`,
   consumes `jti` once (Redis `SET NX EX 120`), and maps `sub` to a WAAI user via a
   new unique `users.crm_user_id`. **No auto-provisioning**: an unmapped user sees
   "Your CCRM account is not linked to WAAI — ask the admin". Admin maps users in
   WAAI Settings → CRM (suggested by e-mail from `/users`, confirmed by hand).
6. On success WAAI sets its normal session cookie, marks the session `embed=ccrm`
   (cookie `waai_embed=ccrm`), and navigates to `next` (allow-listed paths only).
   If already signed in as the same user, steps 3–5 are skipped; signed in as a
   different user → sign out first.

**postMessage protocol** (both sides check `event.origin` and `event.source`; unknown
types ignored; payloads validated):

| Direction | Type | Payload |
|---|---|---|
| WAAI → CCRM | `waai:ready` | `{authed: boolean, userCrmId?: string}` |
| CCRM → WAAI | `ccrm:sso` | `{token}` |
| CCRM → WAAI | `ccrm:navigate` | `{path}` (allow-list: `/`, `/c/…`, `/tasks`, `/digest`, `/search`, `/settings`, `/open?…`) |
| CCRM → WAAI | `ccrm:appearance` | `{theme:'light'|'dark', locale:'en'|'sk'|'hu', accent?}` |
| WAAI → CCRM | `waai:route` | `{path, title}` → CCRM updates `#whatsapp<path>` with `replaceState` (back button and shareable links work) |
| WAAI → CCRM | `waai:unread` | `{chats: number}` → CCRM sidebar badge |
| WAAI → CCRM | `waai:open-crm` | `{kind:'lead'|'project'|'task', id}` → CCRM navigates (`#lead-…`, `#project-…`, the task link) |
| WAAI → CCRM | `waai:error` | `{code}` (`not_linked`, `sso_failed`, …) → CCRM shows the matching state |

**WAAI embed layout** (when `waai_embed=ccrm`): no WAAI brand header, no sign-out, no
"install app"/push-permission prompts (notifications from a cross-origin frame are
blocked), no service-worker registration; WAAI's own navigation stays (Chats,
Digest, Tasks, Search, Settings) as a compact top tab bar — never a second bottom bar
under CCRM's mobile nav; theme/locale follow `ccrm:appearance`; "Open in CRM" links
on task rows use `waai:open-crm` instead of a new tab.

**Open by phone** — WAAI route `/open?phone=<digits>&lead=<id>|project=<id>`:
existing chat on the user's account(s) → `/c/<id>`; else a single, rate-limited
registration check through the wa-worker control bus (`checkNumber`, implemented for
`baileys` via `onWhatsApp`, for `whatsappweb` via `isRegisteredUser`, faked by
`mock`) → registered: open a new-chat composer for that JID (conversation created by
the first send's echo, then pre-linked to the CCRM entity as `manual`); not
registered: a clear "This number is not on WhatsApp" screen.

**CCRM side**
- Module id `whatsapp` in `moduleCatalog.ts` (category `collaboration`, icon
  `MessageCircle`, en/sk/hu texts, no screenshot until one is captured), Sidebar,
  StartMenu, `validTabs` + sub-path routing in `App.tsx` (`#whatsapp`,
  `#whatsapp/c/<id>`, `#whatsapp/open?…`), view title, permission key `whatsapp`
  (`access()`, default `nothing`, admins `edit`), `VisibleModulesSettings`.
- `src/components/WhatsAppView.tsx`: states *not configured* (admin → link to
  settings; others → "ask your admin"), *loading*, *not linked*, *error/retry*,
  *ready*. Keeps the iframe **mounted (hidden) after the first open** in the session,
  so switching back is instant and the unread badge stays live.
- `src/components/WaaiIntegrationSettings.tsx`: WAAI URL, connection status (last API
  call time per token), owners, scopes, allowed IPs, `require_direct`, tokens
  (issue → shown once, revoke), SSO secret (generate/rotate, shown once — WAAI needs
  it as `CCRM_SSO_SECRET`), default deadline days. Registered as the section `integrations/waai` in `settingsRegistry.ts` (administrators only) and rendered from `SettingsView`'s `renderSection`; the SSO secret part comes in phase 7. Built: `src/components/settings/WaaiIntegrationSettings.tsx`, helpers `src/utils/waaiIntegration.ts`.
- **Licensing rule:** the module and the API must never be licence-gated
  (`.agents/rules/licensing.md`).

### 4.8 CCRM UI integration points

- `src/utils/whatsappLinks.ts` (+ unit tests): phone normalisation for display
  matching, `linksForLead(leadId, links, leads)` (the lead itself, its client, and
  the client's leads), `linksForProject(project, links, leads)` (project links, the
  client's links, `contact_phone`, contact-attribute leads), state resolution
  (`chat` / `start` / `none`), ordering (viewer's own chats first, then other users'
  chats — shown but marked, since WAAI will refuse to open them for a non-admin).
- `src/components/WhatsAppChip.tsx`: one component used next to the phone in the
  client detail (`ClientsView`), lead detail (`LeadsDatagrid`), project detail
  (`ProjectDetailsView`) and project contact cards. One chat → button; several →
  popover listing them (title, group/1:1, last message time).
- Project form: `contact_phone` field (all project types), with a hint that it is
  used to pair WhatsApp chats; list column optional (not summable — no
  `SUMMABLE_PROJECT_COLUMNS` change).
- Timeline: `LeadEventType` + `'whatsapp'`; icon, colour, label, filter chip and
  "Open in chat" link wherever timeline types are mapped — grep `status_change` to
  find every map (`ClientsView`, `LeadsDatagrid`, `AutomationView`, `leadSla`,
  `translations`, `TicketsView`, `PublicProjectTicketsView`).
- Tasks: WhatsApp badge + "Open in chat" in task rows/drawer (`TaskEditDrawer`,
  task lists, `EntityTasksPanel`, `ProjectTasksPanel`).
- Follow `docs/VIEW-SIZE.md`; match the existing Tailwind style of each file (this
  codebase writes raw palette classes — do not introduce semantic tokens here);
  every string in en/sk/hu.

### 4.9 Security checklist

- API tokens and SSO secret: generated server-side, shown once, stored hashed
  (tokens) / protected like other CCRM secrets (SSO secret); rotation with overlap.
- Least privilege: the WAAI client gets `users:read directory:read tasks:push
  tasks:pull whatsapp:links timeline:push`; each can be revoked alone.
- Network: same host → private Docker network + `allowed_ips` + `require_direct`;
  different hosts → HTTPS only, `allowed_ips` = the VPS public IP (check what
  `REMOTE_ADDR` is on Websupport before relying on it).
- All inbound text sanitized on both sides; lengths capped; paths validated by regex;
  no HTML from WAAI ever rendered as HTML in CCRM.
- SSO token: 60 s, one-time, audience-bound, delivered by postMessage with strict
  origins, never in a URL or log.
- Unmapped CCRM users cannot reach any WAAI data; WAAI's own per-user isolation
  (`owner_user_id`) is unchanged.
- Personal data: CCRM never receives message bodies; WAAI receives client names and
  phones (needed for matching) — document this in both apps' docs.
- Run the `api-security-testing` skill (Strix) against `/api/v1` on a dev instance
  before go-live.

### 4.10 Deployment

WAAI runs from its existing `docker-compose.prod.yml` on the new VPS (path B or C
of WAAI's `docs/DEPLOYMENT.md`).

- **Scenario S1 — CCRM on the same VPS (recommended):** CCRM from `deploy/vps/`.
  Only one process can own ports 80/443: run **one** Caddy for both domains (the
  CCRM stack's), drop WAAI's `caddy` service, and join that Caddy to WAAI's network
  to proxy `wa.<domain>` → `web:3000` with WAAI's headers. Create
  `docker network create --subnet 172.31.250.0/24 waai_ccrm`; join only WAAI's
  `ai-worker` (fixed IP `172.31.250.10`) and CCRM's `web`. `CRM_BASE_URL=http://web`
  (container name per the CCRM compose), `allowed_ips=["172.31.250.10"]`,
  `require_direct=1`.
- **Scenario S2 — CCRM on shared hosting:** `CRM_BASE_URL=https://crm.example.sk`,
  `allowed_ips` = VPS public IP, `require_direct=0` (verify Websupport's proxying).
- WAAI env: `CRM_BASE_URL`, `CRM_API_TOKEN` (ai-worker only), `CCRM_SSO_SECRET`,
  `CCRM_ORIGIN` (web only), `WAAI_EMBED_ORIGINS` (caddy). DNS for `wa.<domain>`.
- If WAAI already runs elsewhere with Peter's real WhatsApp session, move it with
  `scripts/backup-for-migration.sh` + restore (same `NEXTAUTH_SECRET`), otherwise
  re-link by QR. Stop the old instance first — two live companions on one session
  is not allowed.
- RAM: WAAI's caps total ~2.8 GB (much less with `WA_PROVIDER=baileys`); fine on any
  4 GB+ VPS next to CCRM.
- Backups: WAAI Postgres + `wa-sessions` + `media` volumes, next to CCRM's existing
  daily backup. WAAI's CI runs `docker system prune -af` on the host — on a shared
  host change that to a scoped prune or the CCRM images can disappear while its
  stack is stopped.
- SSH: key-based login only. No passwords in files, docs, memory or git (see §9).
- Rollout: (1) API + tokens, `CRM_DRY_RUN=1`; (2) directory + links; (3) push on;
  (4) timeline on; (5) embed for admin; (6) embed for everyone with the permission;
  (7) decide direction B.

---

## 5. Implementation phases

Each phase ends with: tests green, docs updated, a commit (CCRM: version tag suffix
per `.agents/rules/commit-and-versioning.md`; WAAI: its own conventions), and a short
report to Peter (what was done, what was verified and how, what is left). **Stop for
Peter's review after phases 3, 6 and 8.**

| # | Repo | Phase | Size |
|---|---|---|---|
| 0 | both | Setup: worktrees/branches, read the prior art, confirm decisions D1–D10 | S |
| 1 | CCRM | API core: schema (integration_* tables), `integration.php` router/auth/rate limit/sanitizer, `ping`, `users`, admin endpoint + Settings panel (tokens) | M |
| 2 | CCRM | Task endpoints: push/merge, feed, lookup, complete; `tasks.external_*` columns; serializer; deadline rule | L |
| 3 | WAAI | Bridge CRM-agnostic (string ids migration, crm-client, crm-sync), end-to-end against local CCRM with `CRM_DRY_RUN=1`, then live | M |
| 4 | both | Directory + linking: `/directory`, `projects.contact_phone`, `whatsapp_links/numbers` + endpoints + sync GET; WAAI `crm_entities`, link rules, link UI, link push; task payload `lead_id/project_id/start` | L |
| 5 | both | Timeline: `whatsapp` timeline type + endpoint; WAAI `timeline` job | M |
| 6 | CCRM | UI: `WhatsAppChip` on client/lead/project, project contact phone field, timeline rendering, task badges | M |
| 7 | both | Embed: WAAI embed layout, CSP env, `ccrm` SSO provider, `/embed/sso`, `/open`, `checkNumber`; CCRM `whatsapp` module, `WhatsAppView`, `waai_sso.php`, permission, routing, postMessage bridge, CSP `frame-src` | L |
| 8 | ops | VPS deployment + rollout steps of §4.10 | M |
| 9 | both | Optional: direction B placement by client link, opt-in daily summaries to timeline, opt-in number checks, group↔project suggestions, cross-site Partitioned cookies | — |

### Phase 0 — setup

- CCRM: other sessions share this checkout — **work in a separate worktree**:
  `git worktree add ../ccrm-waai -b feature/waai-integration <base per D5>`, junction
  `node_modules` (see the `concurrent-sessions-shared-checkout` notes: remove the
  junction with `[System.IO.Directory]::Delete(path,$false)` before removing the
  worktree). QA port 5273 and RAM are shared — wait, don't kill.
- WAAI: `git switch -c feat/ccrm-integration <base per D4>`.
- Read: this file; `all-inclusive-crm/docs/WaaiTaskBridge.md`;
  `all-inclusive-crm/modules/integration/**`; WAAI `CLAUDE.md`, `AGENTS.md` (skip the
  VPS credentials block), `docs/ARCHITECTURE.md` § "CRM task sync";
  `packages/crm-client/**`; `apps/ai-worker/src/crm-sync/**`; CCRM `CLAUDE.md`,
  `docs/TESTING.md`, `.agents/rules/*`, `public/api/mcp_ext_writes.php` (task
  helpers), the task parts of `public/sync.php`.

### Phase 1 — CCRM API core

Deliver: tables, `integration.php` + `integration_lib.php`, `ping`, `users`,
`integration_admin.php`, `WaaiIntegrationSettings.tsx` (client config + tokens), the
`.htaccess` rewrite.
Tests: PHP lint (docker `php:8.2-cli php -l`); a node script
`scripts/test-integration-api.mjs` (pattern of `npm run test:mcp`) against the dev
containers covering: no token → 401, revoked/expired → 401, wrong IP → 403,
`require_direct` + `X-Forwarded-For` → 403, missing scope → 403, 300+/min → 429,
non-JSON → 415, >64 KB → 413, unknown route → 404 `route_not_found`, wrong method →
405 + `Allow`, no `Set-Cookie` on any response. Unit tests for the settings helpers.

### Phase 2 — CCRM task endpoints

Deliver: push with three-way merge, staleness, 410; feed with string cursor and
`owners`/`all` scope; lookup; complete with the conclusion rule; serializer;
`external_*` columns + GET exposure; the default-deadline rule.
Tests (same script): create → repeat → no duplicate; stale revision → `{stale:true}`;
a CCRM-side edit (simulate via `sync.php` POST) survives an unchanged push, a later
changed field is applied; delete via sync → push answers 410, lookup lists it under
`deleted`; deadline/all_day conversion around DST; sanitization (tags, bidi, NUL,
ZWJ kept); `requires_conclusion` → 422 `completion_refused`; feed paging across equal
`updated_at`; a token without `tasks:pull` can't see crm-origin tasks; a stale v1
client POST does not clobber/delete a task the API just wrote.

### Phase 3 — WAAI bridge, CRM-agnostic

Deliver: Prisma migration, crm-client and crm-sync changes of §4.3 a, Settings → CRM
copy that no longer says "all-inclusive"; `docs/ARCHITECTURE.md` updated.
Verify: `pnpm typecheck`, `pnpm test`, `pnpm lint`; then WAAI dev (mock provider,
`pnpm seed:demo`) against the CCRM dev backend: ping, directory of users, auto
pairing by employee phone, dry-run payloads, then real pushes → tasks appear in the
CCRM UI; tick done in CCRM → done in WAAI; tick in WAAI → done in CCRM.
**Stop for review.**

### Phase 4 — Directory and linking

**Done (v1.13.17-Nectarine)** - see "As built (phase 4)" in §4.1 (CCRM) and §4.3 (WAAI), including the two items carried over from phase 3, which are settled there.

Deliver: §4.1 `/directory`, `/whatsapp/links`, `/whatsapp/numbers`; §4.2 columns and
tables + sync GET; WAAI §4.3 b and c; link UI in the WAAI conversation header.
Tests: CCRM API script cases for directory paging and link replace/delete; WAAI unit
tests for the normaliser (SK/CZ/HU/AT/DE formats, `00`, `+`, spaces, leading `0`) and
every branch of §4.4 (one client, client + its leads, two clients → ambiguous, lead
only, archived ignored, project contact phone, manual/blocked precedence); an e2e
run with seeded data.

Carried over from phase 3 (decided by Peter, 2026-10-29):

- **Fresh-database migration.** `prisma migrate deploy` fails on an empty WAAI database at
  `20260527085616_phase_7_migration` (`relation "summaries_conversation_id_window_from_at_to_at_latest_messa_key"
  already exists`). Investigate the cause and settle how a new install gets its schema (fix the
  migration, or another documented way) — phase 4 adds more WAAI migrations (`crm_entities`,
  `conversation_crm_links`) and phase 8 deploys to a fresh VPS database. Test on a scratch
  Postgres database, never on the dev one.
- **Localised refusal message.** CCRM's `completion_refused` text ("This task requires a
  conclusion before it can be completed.") is English whatever `SYSTEM_LANGUAGE` is, and WAAI
  shows it to the user as is. Make CCRM answer it in the install language (en, sk, hu, as the
  description footer already does) for both `PUT /tasks/external` and `POST /tasks/{id}/complete`,
  with a test per language. The same goes for any other message that reaches a WAAI user.

### Phase 5 — Timeline

Deliver: ENUM migration + `external_url`; `/timeline/external`; WAAI `timeline` job +
sweep; localized titles.
Tests: idempotent upsert, stale revision, 410 after delete in CCRM, missing lead →
422, entries appear on the client timeline.

### Phase 6 — CCRM UI

Deliver: §4.8. Tests: unit tests for `whatsappLinks.ts`; QA audit scoped to the
changed files: `node scripts/qa/run-qa.mjs --files <files>` — read
`test-results/qa-audit-report.md`; extend the QA seed/mocks so the chip, timeline
entry and task badge are exercised (the QA suite mocks `/sync.php` and `/api/*`).
**Stop for review** (screenshots of client, lead, project, timeline, task rows in
light and dark).

### Phase 7 — Embed and SSO

Deliver: §4.7 on both sides.
Tests: WAAI unit tests for JWT verification (bad signature, wrong aud/iss, expired,
replayed jti, unmapped user); CCRM `waai_sso.php` permission and rate limit; a manual
browser pass (Chrome + Firefox; Safari if available) with WAAI on a same-site
subdomain locally (e.g. `crm.localtest.me` / `wa.localtest.me` or `dev-https.mjs`):
SSO, deep links both ways, back button, theme/locale switch, voice note recording,
file upload, unread badge, a user without the permission, a user not mapped in WAAI,
"open in new tab" fallback. Record a GIF for Peter.

### Phase 8 — Deployment

Follow §4.10 with Peter: confirm the VPS (D1), DNS, which CCRM instance (D3), then
deploy, issue the token, set envs, run the rollout steps one at a time and report
after each. Never paste secrets into chat logs, files or commits.
**Stop for review** after the dry run and before switching push on for real data.

### Version/commit hygiene (CCRM)

Order when a phase is finished: **test → bump version → changelog → build →
commit** (`.agents/rules/qa-before-ship.md`, `commit-and-versioning.md`,
`post-build-cleanup.md`). Use `npx tsc --noEmit` while working; run `npm run build`
only when a build commit is due, in the worktree. Release notes come from Craft CMS
only (`news-craft-cms.md`) — never hardcode a "What's new" text.

---

## 6. Decisions (defaults the implementer uses unless Peter says otherwise)

| # | Decision | Default |
|---|---|---|
| D1 | Which VPS hosts WAAI; SSH access | **Ask Peter** before phase 8 (host, user, key-based access). |
| D2 | WAAI domain | A subdomain of the CCRM site (`wa.<crm-domain>`). Cross-site embed not in v1. |
| D3 | Which CCRM install is connected first; does it live on the same VPS (S1) or shared hosting (S2) | **Ask Peter.** Design supports both; S1 preferred. |
| D4 | WAAI base branch | **Decided: `main`** (2026-10-29). `feat/ccrm-integration` was created from `main` (2dd588d); `feat/clickup-sync` is unmerged and touches the same files (`schema.prisma`, `packages/db/src/tasks.ts`, `packages/jobs/src/index.ts`), so whichever merges second resolves a mostly mechanical conflict. |
| D5 | CCRM base branch | **Decided: commit on `1.13-nectarine`** (worktree `../ccrm-waai`). WAAI work goes on a new branch `feat/ccrm-integration`. |
| D6 | Background "is on WhatsApp" checks for CRM numbers without a chat | Off; on-demand check on click only. |
| D7 | CCRM CSP `frame-src` | `'self' https:` (per-install WAAI URL can't be templated into a static `.htaccess`) — confirm with Peter. |
| D8 | Direction B (CCRM tasks into WAAI) at go-live | Off; decide after a week of direction A. |
| D9 | CCRM notifications/automations for WAAI-origin tasks | None (WAAI already notifies). |
| D10 | Daily chat summaries on the client timeline | Opt-in, off by default (phase 9). |
| D11 | Tasks without a stated deadline | `today + 7 days`, marked "not stated in chat"; configurable per client. |

---

## 7. Known limitations

- A job discussed in a chat and also created by hand in CCRM before the extractor
  links them becomes two tasks (as in the bridge).
- A client chatting from a number not stored in CCRM is not auto-linked (manual link).
- LID-only contacts (hidden numbers) link manually.
- "Reset chat data" in WAAI re-creates tasks with new ids; old CCRM tasks stay.
- Embedding needs WAAI on the CCRM site's domain; otherwise WhatsApp opens in a new tab.
- A CCRM task with several assignees appears once in WAAI.
- Chats owned by another user's WhatsApp account are listed in CCRM but open only for
  their owner (or a WAAI admin).

## 8. Files you will touch (orientation, not exhaustive)

CCRM: `public/api/schema.php`, `public/sync.php`, `public/.htaccess`,
`public/api/integration*.php`, `public/api/waai_sso.php`, `src/App.tsx`,
`src/types/index.ts`, `src/utils/moduleCatalog.ts`, `src/utils/permissions.ts`,
`src/components/Sidebar.tsx`, `StartMenu.tsx`, `VisibleModulesSettings.tsx`,
`SettingsView.tsx`, new `WhatsAppView.tsx`, `WhatsAppChip.tsx`,
`WaaiIntegrationSettings.tsx`, `src/utils/whatsappLinks.ts`, `ClientsView.tsx`,
`LeadsDatagrid.tsx`, `ProjectDetailsView.tsx`, task components,
`src/utils/translations.ts`, `entities_overview.md`, `scripts/test-integration-api.mjs`,
`docs/WAAI-INTEGRATION.md` (keep this file current).

WAAI: `packages/db/prisma/schema.prisma` + migrations, `packages/crm-client/**`,
`apps/ai-worker/src/crm-sync/**`, `apps/web/src/auth.ts`, `auth.config.ts`,
`proxy.ts` (public `/embed/sso`), new `apps/web/src/app/embed/**`, `apps/web/src/app/(app)/open/**`,
conversation header (link chip), Settings → CRM, `apps/wa-worker/src/providers/*`
(`checkNumber`), `Caddyfile`, `docker-compose.prod.yml`, `.env.example`,
`docs/ARCHITECTURE.md`, `CLAUDE.md` (feature description).

## 9. Housekeeping found during the analysis

- WAAI's tracked `AGENTS.md` (pushed to `github.com/cstudiossro/waai`, since commit
  `dfa4706`) contains the root password of 185.111.88.70. Peter should rotate it,
  switch that server to key-only SSH, and remove the block from the file. Purging git
  history is optional once the password is rotated. The implementer must not use or
  repeat it.
