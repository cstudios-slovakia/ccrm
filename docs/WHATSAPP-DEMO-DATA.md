# WhatsApp demo data

Demo content for the WhatsApp module: 4 chats with messages, and everything the WAAI connector syncs
from them into CCRM (links to clients, leads and projects, number checks, tasks, timeline entries).
One file describes the story; two loaders read it.

| File | Role |
|---|---|
| `public/api/demo_seed/whatsapp_demo.json` | The dataset: account, 4 chats with messages, extracted tasks, summaries, links, number checks. Days are offsets from today, so a demo opens on recent data whenever it is seeded. Mirrored to `api/demo_seed/` by `sync:backend`. |
| `public/api/demo_seed/whatsapp.php` | **CCRM side — done.** A `demo_seed` module (runs after `tasks`, before `offers`). Writes what a real WAAI push leaves in CCRM. Idempotent, `demo-whatsapp-*` ids. |
| WAAI loader | **WAAI side — not written yet** (next session). Writes conversations, messages, summaries and tasks into WAAI's Postgres from the same JSON. |

Chats and messages never live in CCRM. The native module reads them from WAAI (`/waai-api`), so without
the WAAI loader a demo instance shows the CRM-side surfaces (chips, task badges, timeline entries) but an
empty Chats tab.

## The four chats

All chats belong to the WhatsApp account of the demo user **Alex**. Message text is in the contact's own
language; task and timeline text follows the install language (en, sk, hu).

| Chat (`ref`) | Language | Links (source) | Tasks | What it demonstrates |
|---|---|---|---|---|
| `demo-wa-slavin` Marek Šimko – Vila Slavín | sk | client Vila Slavín (auto), project Villa Slavín (auto, by the project's contact phone) | 3: one done, one open with a stated date, one open **without a date** (deadline inferred, flagged) | client **and** project link; document + image message; reaction; quoted reply; `task_created`, `task_done` and a `summary` timeline entry; 2 unread |
| `demo-wa-weber` Sandra Weber | de | lead Sandra Weber (auto) | 2: one done, one open with **start date + due time** | a plain **lead** (not a client); no project; 0 unread |
| `demo-wa-dvorak` Dvořák – parapety | cs | client Interiéry Dvořák (**manual**), project (**manual**) | 2: one done (assigned to Sam), one open with a due time | a **group** (no phone, so it can only be linked by hand); manual links; 2 unread |
| `demo-wa-kovacs` Kovács Gábor | hu | client Kovács & Társa (auto) | 2: one done (assigned to Jordan), one **overdue** | voice note with transcription; image from the contact; quoted reply; assignment to another CRM user; 2 unread |

Also seeded in CCRM:

- **Number checks** (`whatsapp_numbers`): the four chat numbers, Hotel Alpenblick and Andrea Horváthová
  (`registered`, no chat yet → the client view offers **Start chat**) and Mgr. Peter Baláž
  (`not_registered` → no button).
- **Project contact phone**: Villa Slavín and Hotel Alpenblick get one. The hotel has no chat, so its project
  offers Start chat; Slavín's pairs with the chat.
- **Timeline** (`type = whatsapp`, `external_url` = the chat path): 9 `task_created`, 4 `task_done` with the
  exact titles and body WAAI writes, plus one `summary` entry. The `summary` kind is accepted by
  `PUT /timeline/external` but the connector does not produce it yet (decision D10), so it is the one
  seeded entry a real WAAI would not create today.
- **Tasks** (`external_source = 'waai'`): footer, `external_url`, `external_meta_json` and
  `due_inferred` exactly as `integration_tasks.php` writes them, so the WhatsApp badge, "Open in chat" and
  "deadline not stated in chat" all show.

## Sync options covered

| Connector feature (WAAI-INTEGRATION.md) | In the demo |
|---|---|
| Directory → auto link by phone (client, lead) | slavin, weber, kovacs |
| Project link by `contact_phone` | slavin |
| Manual links, groups | dvorak |
| One chat → client **and** project | slavin, dvorak |
| `PUT /whatsapp/numbers` (registered / not registered) | 6 numbers |
| Task push: stated due, due with time, start date, **no date (inferred)** | tasks 1–9 |
| Task done → CCRM state + `completed_by` | tasks 1, 4, 6, 8 |
| Assignee mapping to other CRM users | Jordan (3, 8), Sam (6) |
| Lead / project on the task | all (project on 1–3, 6, 7) |
| Timeline `task_created` / `task_done` / `summary` | all / done tasks / slavin |
| Open chat from task / timeline (`#whatsapp/c/<ref>?m=<message>`) | all |

Not in the data (they are settings, not content): the SSO secret and connection, the ambiguity picker
(needs two clients with one number), blocked links, `requires_conclusion` refusals.

## Seeding the CCRM side

On a fresh install the module runs with the rest of the demo data. On an existing instance, run only this
module (it needs the demo clients, projects and users to exist):

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

## WAAI loader — for the next session

Read the same JSON and write, per chat, into WAAI's Postgres (idempotent, like `seed-demo.ts`):

- **Ids**: conversation `id` = `ref`; message `id` = `<ref>-<message id>` (CCRM already links to
  `/c/<ref>?m=<ref>-<mid>`); `waChatId` = `<phone>@s.whatsapp.net`, or `<ref>@g.us` for the group; task
  `crmSystem = 'ccrm'`, `crmTaskId` = `demo-whatsapp-<n>`, `origin = 'waai'`, `crmSyncState = 'synced'`.
- **Time**: `sentAt` = today + `day` at `time` in Europe/Bratislava. `unreadCount` = `unread`.
- **Messages**: `dir: out` → `direction out`, sender `me`; `quote` → `quotedWaMessageId`; `reactions` →
  `MessageReaction`; `document` → `mediaFileName`; `audio` → `transcription` + `transcriptionStatus done`.
- **Media files**: generate real ones, the old seed's text placeholders do not render. A valid silent WAV
  (header + zeros, `seconds` long) for the audio, a small PNG per `placeholder` (written with `zlib`, no
  dependency) for the images.
- **Tasks**: same `n`, status, assignee label, `startAt`/`dueAt` (null where `due` is null), `sourceMessageId`.
- **Summaries**: one `Summary` per chat (window `recent`, `actionItems` linking the `task` numbers).
- **CRM links**: `ConversationCrmLink` rows with the same `source`; `crm_entities` fill from the real
  directory read.
- **Account/user**: `WaAccount.sessionId = account.sessionId`, owned by the WAAI user mapped to Alex.
  Use the **mock** provider; never point a demo at a real WhatsApp session (see the session-wipe incident in
  the local-stack notes).

Open decision for the deploy session: let the real bridge produce the CCRM side instead (load only WAAI
data, connect WAAI to the demo instance, let `crm-sync` push), or keep the direct seed above. The direct seed
works with no WAAI running; the bridge is the more faithful demo but needs the instance reachable from WAAI.
