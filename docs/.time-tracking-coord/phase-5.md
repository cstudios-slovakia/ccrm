# Phase 5 — Chrome extension, activity capture, Unsorted

Owner: phase 5 agent. Status: built (QA, version bump, changelog, and commit skipped by the owner).

## Result

- Zip produced: `public/downloads/ccrm-time-tracker.zip` (manifest at the zip root, 7 files). Not git-added.
- `node --test --experimental-strip-types src/utils/timeTrackerRules.test.ts` — 5 pass, 0 fail.
- `php -l` on `time_tracker_ext.php`, `time_tracker_lib.php`, `cron.php`, `schema.php` — no syntax errors.
- Not run: `npm run test:qa`, `npm run test:unit` (full suite), `npx tsc`, `npm run build`, `npm run sync:backend`.
- Unsorted is personal: the Day panel and the List chip render only when the phase 4 view scope is `me`. The chip text is `Unsorted · N` and only when N > 0.
- Requests re-read (`phase-4-to-phase-3`, `phase-6-to-phase-3`). No request asked phase 5 to change those files. `PHASE4-VIEWING-AS` and `PHASE6-SETTINGS` were left in place. `TimeTrackingView.tsx` was not edited.

Do not add a second timer table. Start and stop write `time_entries` with the same one-running-timer rule as `time_entries.php` (`running_guard`, stop-then-start in one transaction, 409 on a lost race).

## File claim (exclusive)

- `public/api/time_tracker_ext.php` — NEW. The only HTTP surface for pairing, the extension timer, activity, and Unsorted.
- `public/api/time_tracker_lib.php` — NEW. Shared by the endpoint and the cron purge.
- `extensions/chrome-time-tracker/` — NEW. Manifest V3 source.
- `scripts/build-extension.mjs` — NEW. `npm run build:extension`.
- `public/downloads/ccrm-time-tracker.zip` — build output. Leave it on disk; do not `git add` it from this phase.
- `src/utils/timeTrackerRules.ts` — NEW. Pure rules (pairing, 24h window, activity merge).
- `src/utils/timeTrackerRules.test.ts` — NEW.
- `src/utils/timeTrackerApi.ts` — NEW. Session client for the web app.
- `src/components/timeTracking/UnsortedInbox.tsx` — NEW.
- `src/components/timeTracking/PairedBrowsers.tsx` — NEW.
- `src/components/timeTracking/ExtensionSettings.tsx` — NEW.

## Shared files (edit only inside the named markers)

- `public/api/schema.php` — SQL only inside `/* PHASE5-SCHEMA-START */` … `/* PHASE5-SCHEMA-END */`, next to `time_entries`. Do not reformat the rest. Phase 6 must not edit this region.
- `public/api/cron.php` — purge call only, marked `PHASE5-PURGE`. Never on the `?probe=1` path. Not in `sync.php`.
- `src/components/timeTracking/TimeDayView.tsx` — only inside `/* PHASE5-UNSORTED */` … `/* END-PHASE5-UNSORTED */`. Preserve `/* PHASE4-VIEWING-AS */`.
- `src/components/timeTracking/TimeListView.tsx` — same Unsorted markers. The chip is `Unsorted · N` and renders only when N > 0 and the scope is me.
- `src/components/timeTracking/TimeTrackingSettingsPanel.tsx` — only inside `/* PHASE5-SETTINGS */` … `/* END-PHASE5-SETTINGS */`. Do not touch `/* PHASE6-SETTINGS */`.
- `package.json` — the `build:extension` script only.
- `src/utils/timeTrackingApi.ts` — extra error-code sentences only.

## Not owned (do not edit)

`time_entries.php` (phase 6 lock region / phase 4 actions), `timeLock.ts`, `timeApproval.ts`, `TimeCalendarView`, `TimeTimesheetView`, `extraTabs.tsx`, `EmployeeTimesheetSummary`, Toggl connectors, `TimeTrackingView.tsx` (phase 3 tabs, phase 6 mobile bar), `docs/TIME-TRACKING.md`.

Unsorted assign/dismiss are **not** on `time_entries.php`. They are session actions on `time_tracker_ext.php` below, so phase 4/6 do not duplicate them.

## HTTP contract — `POST|GET /api/time_tracker_ext.php`

Errors are `{ "success": false, "code": "<code>" }`. Success payloads include `"success": true`.

CORS: `Access-Control-Allow-Origin` is the request `Origin` only when it is exactly `chrome-extension://` plus a 32-character Chrome extension id (`[a-p]{32}`). Never `*`. No credentialed CORS. Same-origin session calls from the app do not need it.

### Device key (never the session cookie)

`Authorization: Bearer ttk_<64 hex>`. The plaintext key is returned once from `pair`. The database stores `sha256` and a 12-character `key_prefix`. A missing or revoked key is **401** `not_paired` (the extension shows “not paired”). Every accepted call sets `last_used_at`. These actions ignore the session cookie even if one is present.

| Call | Body / query | Result |
|---|---|---|
| `POST action=pair` | `{ code, deviceName, browser, os, version }` — no bearer | `{ deviceKey, deviceId, user: { id, name }, ccrmUrl }`. Code is `XXXX-XXXX`, 10 minutes, single use, sha256 stored. Rate limit **10 / 10 min / IP** → 429 `rate_limited`. `code_invalid`, `code_expired`, `code_used`. |
| `GET action=running` | | `{ entry }` — same shape as `time_entries.php` (`title` resolved, linked titles read-only). `entry` is null when idle. |
| `POST action=start` | `{ description?, projectId?, taskId?, ticketId?, startedAt?, billable? }` | One transaction: stop the user’s running row, insert `source=extension`, `device_id` set. `{ entry, stopped }`. 409 `already_running` with `entry` if the unique guard loses a race. `startedAt` omitted = now. A provided `startedAt` must be ≤ now and ≤ 24h old, else 422 `timestamp_out_of_window`. |
| `POST action=stop` | `{ id?, projectId?, taskId?, stoppedAt? }` | Stops that row or the running row. `requireProjectToStop` / `requireTask` match the web API (`project_required`, `task_required`). `stoppedAt` must be inside the same 24h window and ≥ start. Already stopped is idempotent. |
| `GET action=recent` | | `{ entries, todaySeconds }` — last 3 stopped entries and today’s stopped seconds. |
| `GET action=projects` | `q`, optional `host` | `{ projects: [{ id, name, clientName, suggested }] }`. A watched-site hit for `host` is first. |
| `GET action=tasks` | `projectId` | `{ tasks: [{ id, title }] }` open tasks on that project. |
| `POST action=activity` | `{ blocks: [{ domain, pageTitle, startedAt, endedAt }] }` | Stores **domain, page title, times** only. Full URL paths and any `url` / `content` fields are dropped. Opt-in: user rules `enabled` (default **false**) and company `extension.activityCaptureAllowed`. Otherwise 403 `capture_disabled`. Blocks under the user’s minimum (default 5 min) are dropped after same-site merge (gap ≤ 60s). |
| `GET action=unsortedCount` | | `{ count }` — this user’s `unsorted` rows only. |
| `POST action=capture` | `{ enabled: boolean }` | The extension opt-in. Does not change the watched-site list. |
| `GET action=rules` | bearer present | `{ enabled, companyAllows, extensionEnabled, minMinutes, sites: [{ pattern, projectId }] }`. |

`extension.enabled === false` → 403 `extension_disabled` on pair and on device calls.

### Session cookie (never a device key)

These actions call `ccrm_require_auth`. A `ttk_` bearer is not accepted as a substitute. Unsorted is personal: no `userId` override, not visible to managers.

| Call | Body / query | Result |
|---|---|---|
| `POST action=code` | | `{ code, expiresAt }` plaintext once. Retires this user’s older unused codes. |
| `GET action=devices` | | `{ devices: [{ id, name, browser, os, extensionVersion, createdAt, lastUsedAt, state, updateAvailable }], currentVersion }`. `state` is `active` when `last_used_at` is under 3 minutes, else `idle`. |
| `POST action=revoke` | `{ deviceId }` | `{ revoked: true }`. Later bearer calls are 401. Own devices only. |
| `GET action=unsorted` | | `{ items, count }`. Each item: `id, domain, pageTitle, startedAt, endedAt, durationSec, suggestedProjectId, suggestedProjectName`. |
| `POST action=assign` | `{ ids: string[], projectId }` | One `time_entries` row per id, `source=activity`, page title as the entry title, then `status=assigned`. Project required. |
| `POST action=dismiss` | `{ ids: string[] }` | `status=dismissed`. |
| `GET action=rules` | no bearer | Same rules payload as the device GET. |
| `POST action=rules` | `{ enabled?, minMinutes?, sites? }` | Saves this user’s `TIME_TRACKING_ACTIVITY_RULES:<userId>`. |
| `GET action=projectSearch` | `q` | `{ projects }` for the watched-site editor. |

Company flags `extension.enabled`, `extension.activityCaptureAllowed`, `extension.unsortedRetentionDays` stay on `TIME_TRACKING_SETTINGS` (the existing settings save). Activity capture ships **off** until the user turns it on.

## Activity purge

`ccrm_tta_purge()` deletes `time_activity` rows whose `started_at` is older than `unsortedRetentionDays` (default 30). Called from `public/api/cron.php` only.

## Extension

`extensions/chrome-time-tracker/` builds with Vite to `extensions/chrome-time-tracker/dist`. `npm run build:extension` zips that folder to `public/downloads/ccrm-time-tracker.zip`. Version `1.0.0` (`EXTENSION_VERSION` in `timeTrackerRules.ts`, the manifest, and `CCRM_TT_EXT_VERSION` in the PHP lib).

Popup (360× up to 560): not paired, running, idle. Badge is elapsed `h:mm` on rose while running and empty when idle. Offline start/stop are queued with client timestamps. Activity capture asks for the optional `tabs` permission and stays off until opted in.
