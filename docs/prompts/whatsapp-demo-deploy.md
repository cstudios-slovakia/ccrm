# Next session: put the WhatsApp demo data on an existing demo instance

Paste this file's path as the first message of the session. Work in `ccrm-app` on branch `1.13-nectarine`.

## Goal

An existing CCRM instance that is in demo mode shows the WhatsApp module with 4 chats and everything the
WAAI connector syncs from them: links to clients/leads/projects, tasks, timeline entries, number checks.
Peter writes in English as a second language; keep replies plain and short.

## What already exists (previous session, all uncommitted)

Read `docs/WHATSAPP-DEMO-DATA.md` first. It has the chat table, the sync-option matrix and the WAAI loader spec.

| File | State |
|---|---|
| `public/api/demo_seed/whatsapp_demo.json` (+ root copy `api/demo_seed/`) | the dataset, done |
| `public/api/demo_seed/whatsapp.php` (+ root copy) | CCRM-side seeder, done and tested on a scratch DB |
| `public/api/demo_seed/index.php`, `public/api/wipe_demo.php` (+ root copies) | module registered, wipe hook added |
| `docs/WHATSAPP-DEMO-DATA.md` | documentation |

Not done: the **WAAI loader** (conversations, messages, summaries, tasks in WAAI's Postgres) and the deploy.
Chats and messages exist only in WAAI; the module's Chats tab is empty without the loader.

## Steps

1. **Ask Peter which instance** and how to reach it (do not guess): the Nethost test VPS
   (`85.239.227.171`, see memory `nethost-vps-test`, demo login on the login page) or another one.
   Ask where its WAAI runs and whether the WhatsApp module is on the native UI. Confirm it is in demo mode:
   `SELECT value FROM system_settings WHERE key = 'DEMO_MODE'` must be `true`. Check the demo records the
   seeder links to exist: `demo-clients-1..8`, `demo-projects-1..4` (`SELECT id FROM leads WHERE id LIKE 'demo-clients-%'`).
   If they are missing, the seeder silently skips those links; run the `clients` and `projects` modules first.
2. **Commit the previous session's files** (see the list above). Other sessions may share this checkout:
   stage only these paths, no `git add -A`, no `git stash`. Backend-only change: no version bump.
3. **Write the WAAI loader** in the WAAI repo (`01_My_web_apps/waai`, take a worktree off
   `feat/ccrm-integration`; the dev copy runs from other worktrees too, so do not edit `C:\waai`).
   Follow the "WAAI loader" section of the doc: `packages/db/src/seed-demo-ccrm.ts` plus a `seed:demo:ccrm`
   script, reading the JSON path from an argument. Generate real media (silent WAV, PNGs with `zlib`).
   Idempotent, stable ids. **Test against a scratch Postgres database only.** `C:\waai` (port 3005, db `waai`,
   `C:\data\wa-sessions`) is Peter's real, always-on WhatsApp and must not be touched; never start a second
   worker on its session directory (memory `local-waai-ccrm-test-stack`). Use the `mock` provider.
4. **Back up the instance database**, then put the CCRM files on it. The server has no build step and no
   licence on the VPS, so copy the four files by hand (as the vector-search files were hot-copied):
   `api/demo_seed/whatsapp.php`, `api/demo_seed/whatsapp_demo.json`, `api/demo_seed/index.php`,
   `api/wipe_demo.php`, then run the one-liner from the doc. Log in over SSH with Git Bash and the askpass
   helper from the global instructions; keys only on the Nethost VPS. Never write a password to a file, memory or git.
5. **Load the WAAI data** into that instance's WAAI with the loader. Decide with Peter first:
   - *Direct seed (recommended):* do not connect the bridge. If WAAI is already connected to this CRM, set the
     loaded tasks to `crmSyncState = 'none'`, or pause the bridge, otherwise `crm-sync` finds no
     `integration_refs` for them and pushes **duplicate** tasks.
   - *Real bridge:* load only WAAI data, connect WAAI to the instance, let `crm-sync` push. Then do not run
     the CCRM seeder (it would duplicate what the bridge writes). Needs the instance reachable from WAAI.
6. **Verify in the browser** (Claude in Chrome; click the demo login card, never type a password): open the
   Clients, a client's timeline, Projects, Tasks and the WhatsApp module. Check against the doc's table:
   chips on Vila Slavín (client + project), Sandra Weber (lead), Interiéry Dvořák (manual) and Kovács;
   badges and "deadline not stated" on tasks; Start chat on Hotel Alpenblick; the four chats with messages,
   the voice note, unread counts; no console errors. Report symptom, root cause, fix.

## Rules to keep

- `public/` is the source; run `node scripts/sync-backend.mjs` after backend edits (`--check` must pass).
- The wipe must stay clean: after a "wipe demo data" on a scratch copy no `demo-whatsapp-*`, `whatsapp_links`
  or `whatsapp_numbers` demo rows remain.
- Do not touch the real `waai` integration client or its Settings connection; the links use the inactive
  `demo-whatsapp-0` placeholder.
- Backups before any write to the instance; say plainly what was and was not verified.
