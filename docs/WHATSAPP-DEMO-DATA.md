# WhatsApp demo data

Demo content for the WhatsApp module: 4 chats with messages, and everything the WAAI connector syncs
from them into CCRM (links to clients, leads and projects, number checks, tasks, timeline entries).
Since demo phase 4D there is **one file per edition**; two loaders read them.

| File | Role |
|---|---|
| `public/api/demo_seed/whatsapp_demo.sk.json`, `.hu.json`, `.en.json` | The datasets: account, 4 chats with messages, extracted tasks, summaries, links, number checks. **Identical structure** in the three editions (same chat refs, message ids, counts, day offsets and times); only text, names and phone numbers differ. Days are offsets from today, so a demo opens on recent data whenever it is seeded. Mirrored to `api/demo_seed/` (copy new files once; `sync:backend` does not create root copies). |
| `public/api/demo_seed/whatsapp_demo.json` | **Legacy copy of the sk file**, kept only because the WAAI loader still reads it. Phase W moves the loader to the per-edition files; phase 5 deletes this file. |
| `public/api/demo_seed/whatsapp.php` | **CCRM side.** A `demo_seed` module (runs after `time`, before `email`). Reads the file of the install language, writes what a real WAAI push leaves in CCRM. Idempotent, `demo-whatsapp-*` ids. The few words it writes itself (task footer, timeline titles) are in `packs/{sk,hu,en}/whatsapp.php`. |
| `scripts/demo-assert/whatsapp.php` | Guards the contract below: the three files must stay structurally identical, users must be refs, phones must be the cast's. Run by `npm run test:demo-seed`. |
| WAAI loader | `apps/web/scripts/seed-demo-ccrm.mjs` in the WAAI repo. **Phase W** rewrites it against the contract below (`--lang`, user refs, per-edition files). |

Chats and messages never live in CCRM. The native module reads them from WAAI (`/waai-api`), so without
the WAAI loader a demo instance shows the CRM-side surfaces (chips, task badges, timeline entries) but an
empty Chats tab.

## The contract (version 2) - what the WAAI loader reads

```jsonc
{
  "version": 2,
  "edition": "hu",                       // sk | hu | en = the file's language
  "account": {
    "sessionId": "demo-ccrm-wa",         // the SAME in every edition, so one wipe finds it
    "ownerCrmUser": "owner",             // a user REF, never a name or e-mail
    "phone": "36305550142",              // digits only
    "timezone": "Europe/Budapest"        // sk Europe/Bratislava, hu Europe/Budapest, en America/Denver
  },
  "crmUsers": {                          // the edition's three logins, by ref
    "owner": { "name": "Kollár András", "email": "kollar.andras@lapidea.example" },
    "pm":    { "name": "...", "email": "..." },
    "sales": { "name": "...", "email": "..." }
  },
  "projectContactPhones": { "demo-projects-1": "+36 30 555 0201", "...": "..." },
  "numbers": [ { "phone": "36305550201", "status": "registered|not_registered", "checkedDay": -4 } ],
  "chats": [ {
    "ref": "demo-wa-c1-site", "title": "...", "isGroup": false, "phone": "36305550201",
    "locale": "hu",                      // the contact's language: the edition's, except the German architect ("de")
    "unread": 2, "members": ["Fekete Márk"],
    "links": [ { "entityType": "lead|project", "entityId": "demo-clients-1", "source": "auto|manual" } ],
    "messages": [ { "id": "m01", "day": -4, "time": "09:12", "dir": "in|out", "sender": "Fekete Márk" /* in only */,
                    "kind": "text|image|document|audio", "body": "...",
                    "quote": "m08", "reactions": [ { "emoji": "👍", "by": "..." } ],
                    "fileName": "...", "mime": "...", "placeholder": "slabs|samples|site", "seconds": 8, "transcription": "..." } ],
    "tasks": [ { "n": 1, "sourceMessage": "m04", "status": "completed|open", "assignee": "pm" /* a user REF */,
                 "start": { "day": 0 }, "due": { "day": -2, "time": null } /* or null: no date stated */,
                 "completed": { "day": -2, "time": "14:08" }, "leadId": "demo-clients-1", "projectId": "demo-projects-1",
                 "title": "...", "description": "..." } ],
    "summary": { "narrative": "...", "actionItems": [ { "task": 3, "text": "..." } ] },
    "timeline": [ { "kind": "summary", "day": -1, "time": "18:00", "message": "m11", "title": "...", "content": "..." } ]
  } ]
}
```

Rules the loader can rely on:

- **Users are refs.** `owner`, `pm`, `sales`. Resolve a ref to the edition's person through `crmUsers`
  (name and login e-mail) or ask CCRM; never match on a first name. The WAAI user the account belongs to is
  the one mapped to `crmUsers[account.ownerCrmUser].email`.
- **Local time.** `day` is an offset from today, `time` is `HH:MM` **in `account.timezone`** (DST is the
  loader's concern: build the instant with the zone, not with a fixed offset).
- **Links** point at CCRM ids of the id map (`demo-clients-<n>`, `demo-projects-<n>`; a client is a `leads` row).
- **Chat refs are the same in every edition**: `demo-wa-c1-site`, `demo-wa-l10-architect`, `demo-wa-c6-hotel`,
  `demo-wa-c2-warranty`. A wipe must remove the data of **every** edition (a re-seed may switch language);
  the session id and refs make that one pass.
- **`placeholder`** is one of `slabs`, `samples`, `site` (a generated PNG each); `audio` is a silent WAV of
  `seconds` with the given `transcription`.
- `whatsapp_demo.json` (no suffix) is the sk file until phase 5.

## The four chats

All chats belong to the WhatsApp account of the **owner** login (Andrej Kollár / Kollár András / Alex Morgan).
Message text is in the contact's own language; task and timeline text follows the install language.

| Chat (`ref`) | Language | Links (source) | Tasks | What it demonstrates |
|---|---|---|---|---|
| `demo-wa-c1-site` site manager of C1 (Highland Park) | edition | client C1 (auto), project P1 (auto, by the project's contact phone) | 3: one done, one open with a stated date, one open **without a date** (deadline inferred, flagged) | client **and** project link; document + image messages; reaction; quoted reply; `task_created`, `task_done` and a `summary` timeline entry; 2 unread |
| `demo-wa-l10-architect` Thomas Müller | de | lead L10 (auto) | 2: one done, one open with **start date + due time** | a plain **lead** (not a client); foreign contact (German in every edition); no project; 0 unread |
| `demo-wa-c6-hotel` hotel manager of C6 (spa wall) | edition | client C6 (auto), project P3 (auto) | 2: one done, one **overdue** | voice note with transcription; photo from the contact; quoted reply; a `summary` entry; 2 unread |
| `demo-wa-c2-warranty` C2 (warranty chip) | edition | client C2 (auto), project P2 (**manual**) | 2: one done (assigned to `sales`), one open with a due time | manual project link; image from the contact; reaction; assignment to another CRM user; 0 unread |

Also seeded in CCRM:

- **Number checks** (`whatsapp_numbers`): the four chat numbers and the property manager C5
  (`registered`; no chat yet, so the client view offers **Start chat**) and the web lead L7
  (`not_registered`, so no button).
- **Project contact phone**: P1, P3 and P5 get one (the client's phone). P5 has no chat, so its project offers
  Start chat; P1 and P3 pair with their chats.
- **Timeline** (`type = whatsapp`, `external_url` = the chat path): `task_created` / `task_done` entries with the
  exact titles and body WAAI writes, plus two `summary` entries. The `summary` kind is accepted by
  `PUT /timeline/external` but the connector does not produce it yet (decision D10), so it is the one
  seeded entry a real WAAI would not create today.
- **Tasks** (`external_source = 'waai'`): footer, `external_url`, `external_meta_json` and
  `due_inferred` exactly as `integration_tasks.php` writes them, so the WhatsApp badge, "Open in chat" and
  "deadline not stated in chat" all show.

## Sync options covered

| Connector feature (WAAI-INTEGRATION.md) | In the demo |
|---|---|
| Directory → auto link by phone (client, lead) | c1-site, l10-architect, c6-hotel, c2-warranty |
| Project link by `contact_phone` | c1-site, c6-hotel |
| Manual links | c2-warranty (project) |
| One chat → client **and** project | c1-site, c6-hotel, c2-warranty |
| `PUT /whatsapp/numbers` (registered / not registered) | 6 numbers |
| Task push: stated due, due with time, start date, **no date (inferred)** | tasks 1–9 |
| Task done → CCRM state + `completed_by` | tasks 1, 4, 6, 8 |
| Assignee mapping to other CRM users | `pm` (1, 3, 6, 7, 9), `sales` (8) |
| Lead / project on the task | all (project on 1–3, 6–9) |
| Timeline `task_created` / `task_done` / `summary` | all / done tasks / c1-site, c6-hotel |
| Open chat from task / timeline (`#whatsapp/c/<ref>?m=<message>`) | all |

Not in the data (they are settings, not content): the SSO secret and connection, the ambiguity picker
(needs two clients with one number), blocked links, `requires_conclusion` refusals.

## Seeding the CCRM side

On a fresh install the module runs with the rest of the demo data. On an existing instance, run only this
module (it needs the demo clients, projects and users to exist; for a full re-seed use Settings › Re-seed demo data once phase 3 exists):

```bash
php -r '
  require "config.php"; require "api/schema.php"; require "api/demo_seed/index.php";
  require "api/demo_seed/whatsapp.php";
  $pdo = get_db_connection(); ccrm_apply_schema($pdo);
  demo_seed_run_module($pdo, "whatsapp", "demo_seed_whatsapp");'
```

Details of the placeholder integration client: the links hang on `demo-whatsapp-0` (inactive, code
`waai-demo`), never on the real `waai` client, so Settings → WhatsApp (WAAI) is untouched. `wipe_demo.php`
removes everything: ids with the `demo-` prefix, the links (FK cascade) and the six number rows.
No `integration_refs` are written, so a real WAAI connected later pushes its own tasks beside these.

Verified on a scratch MySQL 8 database (not the dev data): seeds in en, sk and hu, second run is idempotent,
the prefix wipe plus `demo_whatsapp_wipe_numbers()` leaves no row behind, `php -l` clean, `sync:backend --check`
in sync. Not run: the app against the seeded data (the QA suite mocks `/sync.php`; this is real-backend data).

## WAAI loader

Read `whatsapp_demo.<lang>.json` (phase W: `--lang=sk|hu|en`; default the CCRM instance's `SYSTEM_LANGUAGE`, else `sk`) and write, per chat, into WAAI's Postgres (idempotent, like `seed-demo.ts`):

- **Ids**: conversation `id` = `ref`; message `id` = `<ref>-<message id>` (CCRM already links to
  `/c/<ref>?m=<ref>-<mid>`); `waChatId` = `<phone>@s.whatsapp.net`, or `<ref>@g.us` for the group; task
  `crmSystem = 'ccrm'`, `crmTaskId` = `demo-whatsapp-<n>`, `origin = 'waai'`, `crmSyncState = 'synced'`.
- **Time**: `sentAt` = today + `day` at `time` in `account.timezone`. `unreadCount` = `unread`.
- **Messages**: `dir: out` → `direction out`, sender `me`; `quote` → `quotedWaMessageId`; `reactions` →
  `MessageReaction`; `document` → `mediaFileName`; `audio` → `transcription` + `transcriptionStatus done`.
- **Media files**: generate real ones, the old seed's text placeholders do not render. A valid silent WAV
  (header + zeros, `seconds` long) for the audio, a small PNG per `placeholder` (written with `zlib`, no
  dependency) for the images.
- **Tasks**: same `n`, status, assignee label, `startAt`/`dueAt` (null where `due` is null), `sourceMessageId`.
- **Summaries**: one `Summary` per chat (window `recent`, `actionItems` linking the `task` numbers).
- **CRM links**: `ConversationCrmLink` rows with the same `source`; `crm_entities` fill from the real
  directory read.
- **Account/user**: `WaAccount.sessionId = account.sessionId`, owned by the WAAI user mapped to the e-mail of `crmUsers[account.ownerCrmUser]`.
  Use the **mock** provider; never point a demo at a real WhatsApp session (see the session-wipe incident in
  the local-stack notes).

Open decision for the deploy session: let the real bridge produce the CCRM side instead (load only WAAI
data, connect WAAI to the demo instance, let `crm-sync` push), or keep the direct seed above. The direct seed
works with no WAAI running; the bridge is the more faithful demo but needs the instance reachable from WAAI.

## Deployed and verified (2026-10-30, test server 91.99.28.82) - the pre-4D, single-file edition

CRM seeder and WAAI loader both run there: 4 chats, 41 messages, 9 tasks, 6 links, 6 number checks. Checked in the browser: chat list and unread counts, messages, generated image, document, quote, voice note (plays, 0:08, transcription), WhatsApp badge and "Open in chat" on tasks, timeline entries and the "Open chat" chip on a lead, link popover (client and project), no console errors.

Two things to know:

- **Directory order.** WAAI computes `auto` links from its own copy of the CRM directory. On an existing install that copy is older than the seeded project phones, so the project chip is missing until Settings → CRM → "Obnoviť adresár" (refresh directory) is pressed once. On a fresh install the directory is read after the seed, so nothing is needed.
- **The demo account is visible in Settings → WhatsApp** ("Alex", connected). It is marked deliberately disconnected so the worker never opens a session; "Reconnect" on it would start a real QR session. Do not press it on a demo.

The loader was hot-copied into the running `waai-web-1` container (the image has no copy yet; it is lost when the container is recreated). The CRM files were copied into `/srv/ccrm/api/` by hand: before a licensed `php ccrm update` there, delete the untracked `api/demo_seed/whatsapp.php` and `whatsapp_demo.json` and `git checkout -- api`, or the pull refuses.
