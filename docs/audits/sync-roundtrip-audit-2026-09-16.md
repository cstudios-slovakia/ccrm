# Sync round-trip audit — fields the UI can edit that `sync.php` silently drops

**Date:** 2026-09-16 · **Baseline:** `141573e` (1.9.50-Jackfruit) · **Scope:** read-only, no
product code changed.

The hunt is for the class of defect fixed in `141573e`: an edit that lands in local
state, survives the POST, and is then lost somewhere between the server write and the
next GET — so it "works" on screen and reverts a while later.

Every collection in the POST handler was traced: leads/clients, lead categories, lead
timeline events, tasks, task assignees, projects, project types, project dynamic
data/timeline/gantt, project managers, meeting notes, meeting tasks, unified entries and
their dynamic tables, custom dashboards, warehouses, suppliers, warehouse items, stock,
batches, movements and movement items, financial categories, client categories,
financial records, invoices/offers and their items, AI templates, users, roles and
settings.

**Five real breaks.** Three of them are everyday paths, not races.

---

## Method notes

- INSERT / `ON DUPLICATE KEY UPDATE` column lists were diffed mechanically across all 34
  upserts in `sync.php`. Apart from primary keys and the documented
  `financial_summary` exception, **every column in an INSERT list is also in its UPDATE
  clause** — the reference bug has no second instance at the SQL level.
- The identity check `ccrm_leads_are_identical()` was extracted from the live
  `/var/www/html/sync.php` inside `crm-19-jackfruit` and exercised directly, with
  controls in both directions (a changed `content` must return `false`, an unchanged
  record must return `true`). Findings A1 and A2 come from that run, not from reading.
- No POST was ever sent to `sync.php`.

---

## A. The identity check compares fewer fields than the write path touches

**Root cause.** `ccrm_leads_are_identical()` (`sync.php:158-283`) is the gate in front of
the whole lead write — the upsert, the `lead_categories` replace and the
`timeline_events` replace. When it returns `true` the server `continue`s
(`sync.php:2672-2674`) and writes nothing. It therefore has to compare **every** column
the write path can change. Two do not appear in it, so an edit that touches only one of
them is discarded with an HTTP 200.

The client then makes it permanent: a successful push advances the delta baseline
(`App.tsx:2075-2086`), so the record is never re-sent, and because nothing was written
the `CHECKSUM TABLE` data version is unchanged (`sync.php:76-90`) — the 5-second probe
says "nothing moved" and skips the pull. The edit stays on screen until the forced full
pull every 12th tick (`App.tsx:2142`), i.e. about a minute, and then reverts.

Verified in `crm-19-jackfruit`:

```
A) timeline timestamp changed only  -> identical? bool(true)   <- bug
B) vatValidationResult changed only -> identical? bool(true)   <- bug
C) timeline author changed only     -> identical? bool(true)   <- bug (not user-reachable)
D) control, content changed         -> identical? bool(false)  <- correct
E) control, nothing changed         -> identical? bool(true)   <- correct
```

### A1 — Correcting a timeline entry's date or time reverts after ~1 minute

**Observed symptom.** "I fix the time on a logged phone call / appointment / status
change in the lead timeline. It saves. About a minute later it snaps back to the old
time."

**Root cause.** Stage 3, the identity check.

| Stage | Where | Verdict |
|---|---|---|
| UI edit | `src/components/LeadsDatagrid.tsx:3256-3295` (`handleSaveEditEvent`), date/time inputs at `:3300-3325` | ok |
| Payload | whole `Lead` object, delta-diffed by `src/App.tsx:216-240` — hash changes, so it is sent | ok |
| Identity check | `sync.php:239-251` — `$teFields` lists `type, title, content, amount, file_name, file_size, file_type, attachments_json, extra_time, audio_file, transcription`. **No `timestamp`.** | **breaks** |
| Server write | `sync.php:2853` does write `timestamp` — it is simply never reached | — |
| GET / apply | `sync.php:620`, `App.tsx:1904` | ok |

Only entries whose text is left untouched are affected. A `note` is immune by accident:
`handleStartEditEvent` (`LeadsDatagrid.tsx:3232-3242`) flattens a note's block JSON to
plain text, so saving it always changes `content` too. Phone calls, e-mails,
appointments, offers, business documents and the automatic `status_change` records — the
ones the type comment at `src/types/index.ts:28-32` specifically says stay
date-editable — are all hit.

**Proposed fix.** Add `'timestamp' => $te['timestamp'] ?? null` to `$teFields`,
normalised the same way the write path normalises it (`date('Y-m-d H:i:s', strtotime(...))`
vs. the DB's `DATETIME`), so `2026-03-20 14:30` and `2026-03-20 14:30:00` compare equal.
No schema change.

**How to verify.** Edit only the time on a phone-call entry, wait ~70 s for the forced
full pull, and confirm the new time survives.

### A2 — A client's VAT verification result is never cached

**Observed symptom.** Opening a business client re-runs the VIES check against the
external service every single time, even though the verdict is supposed to be stored on
the record.

**Root cause.** Stage 3, same gate. `vat_validation_result` is in both the INSERT and the
UPDATE list (`sync.php:2624-2637`) but is not compared by
`ccrm_leads_are_identical()` — unlike `financial_summary`, which is excluded on purpose
and says so at `sync.php:189-192`.

| Stage | Where | Verdict |
|---|---|---|
| UI edit | `src/components/ClientsView.tsx:2974` (VAT field `onBlur`) → `:533-540` writes `vatValidationResult` into `leads` and nothing else | ok |
| Payload | sent | ok |
| Identity check | `sync.php:161-195` — no `vat_validation_result` entry | **breaks** |
| GET / apply | `sync.php:693`, `App.tsx:1904` | ok |

The cache is what stops the re-check: `ClientsView.tsx:2053-2066` only calls the API when
`activeClient.vatValidationResult` is empty. Because the standalone `onBlur` write never
reaches the database, it is always empty. (Saving the whole profile does persist the
verdict, because other columns change too — which is why this shows up as a redundant
API call rather than a visibly lost edit.)

**Proposed fix.** Compare the encoded blob in `ccrm_leads_are_identical()`, e.g.
`'vat_validation_result' => isset($inc['vatValidationResult']) ? json_encode($inc['vatValidationResult']) : null`,
with a branch that compares decoded structures rather than raw strings so key order does
not matter. No schema change.

**How to verify.** Open a business client, tab out of the VAT field without saving, wait
for the next full pull, reopen the client, and confirm no request to
`/api/validate_vat.php` is made.

*(C in the run above — `author` — is the same gap but has no UI that changes an author on
its own. Fixing it alongside `timestamp` costs one line and closes the hole.)*

---

## B. A document attached from the Clients screen loses its path

### B1 — "View File" 404s after a refresh, for every document attached from Clients

**Observed symptom.** "I attach a document to a client under Clients. The download link
works. After I reload — or after a minute — the entry still shows the file name and size,
but clicking it gives Not Found."

**Root cause.** Stage 3 *and* stage 4: `TimelineEvent.filePath` has no column and no
serializer, and the Clients screen is the one writer that does not work around that.

| Stage | Where | Verdict |
|---|---|---|
| UI edit | `src/components/ClientsView.tsx:2240` (log an offer) and `:2374` (Attach document) set `newEvent.filePath` from `upload.php` | ok |
| Payload | present on the wire | ok |
| Server write | `timeline_events` has no `file_path` column (`api/schema.php:100-121`); the insert at `sync.php:2853` writes 15 columns, none of them a path | **breaks** |
| GET | `sync.php:626-638` emits `fileName`/`fileSize`/`fileType`/`attachments` — never `filePath` | **breaks** |
| Apply | `applyServerData` replaces `leads` wholesale (`App.tsx:1904`), so the local copy of `filePath` is discarded | — |

`LeadsDatagrid` already knows about this and mirrors the path into `attachments`, which
*does* have a column — see its own comment at `LeadsDatagrid.tsx:3004-3007` and the
mirror at `:3008-3015`. `ClientsView` never sets `attachments` at all (the word does not
appear in the file).

The fallback does not save it. The renderers at `ClientsView.tsx:3698` and `:4070` fall
back to `` `/uploads/${event.id}_${event.fileName}` ``, but the event is stored under a
per-lead id — `` `${eventId}-${lead.id}` `` at `ClientsView.tsx:2254` and `:2381` —
while `upload.php:80,113` wrote the file as `<eventId>_<fileName>`, with no lead suffix.
The two never match, so the fallback URL is wrong for **every** document attached from
this screen.

**Proposed fix.** Mirror the uploaded path into `attachments` in both ClientsView
handlers exactly as `LeadsDatagrid.tsx:3008-3015` does, and let the renderers prefer
`event.attachments?.[0]?.path`. Cheaper and narrower than adding a `file_path` column;
`attachments_json` already round-trips correctly. No schema change.

**How to verify.** Attach a document to a client from the Clients screen, hard-reload,
and confirm "View File" still downloads it.

---

## C. The leads conflict guard reads a column that child-table writes never touch

### C1 — A web-form inquiry (or a colleague's timeline entry) can be deleted by the next lead edit

**Observed symptom.** "A new inquiry appeared on an existing client's timeline, and then
vanished when someone edited that client."

**Root cause.** Stage 3, but in the conflict guard rather than the identity check.
`ccrm_write_would_clobber()` (`sync.php:325-348`) decides whether a push is stale by
comparing `leads.updated_at` against `baseSyncedAt`. Writes to the lead's **child**
tables do not bump that column, so a lead can gain a timeline entry while its own row
stays untouched and the guard cannot fire. The upsert then runs
`DELETE FROM timeline_events WHERE lead_id = ? AND id NOT LIKE 'email-%'`
(`sync.php:2849`) and re-inserts only the pushing client's array.

Concretely, `api/pipeline.php:540` files a repeat web-form submission against an existing
lead as an `ev-<uniqid>` note. The `UPDATE leads` just above it
(`api/pipeline.php:495-499`) only runs `if (!empty($updateFields))` — i.e. only when the
form filled a field that was previously empty. For a lead that already has an e-mail,
phone, city and contact person, which is the normal case for an existing lead, nothing
is updated and `updated_at` does not move.

Incoming mail is not affected: `api/mail_broker.php:478` ids its events `email-<uid>`,
which the DELETE excludes by design.

**Window.** One poll cycle. The full pull is skipped for 4 s after any push
(`App.tsx:2166`) and the probe otherwise runs every 5 s (`App.tsx:2181`), and a
`timeline_events` insert does move the data version, so this is a ~5-10 s race — not an
everyday path, but the loss is silent and permanent.

**Proposed fix.** Touch the parent when a child row is written: have
`api/pipeline.php`'s existing-lead branch run
`UPDATE leads SET updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?` after inserting the
note, so the guard has something to see. A more complete fix is to stop replacing the
timeline wholesale and upsert it by id with a delete list, which would also close the
same hole for two users editing one lead's timeline at once. No schema change either way.

**How to verify.** POST a second form inquiry for a lead that already has full contact
details, then immediately (within 5 s, before the poll lands) edit that lead's status in
an open tab and confirm the inquiry note is still there afterwards.

---

## D. `CUSTOM_LABELS` is served on every GET and overwritten with `{}` on every settings save

**Observed symptom.** None today — nothing in `src/` reads or sends it. Listed because it
is the same defect shape and will bite whoever uses it first.

**Root cause.** Stage 2. `sync.php:1578` returns `settings.customLabels` to the client;
the client's settings payload (`src/App.tsx:1022-1043`) does not carry it; and
`sync.php:2075` writes `json_encode($s['customLabels'] ?? (object)[])` unconditionally
into an allowed key (`sync.php:2083`). So any value ever stored under `CUSTOM_LABELS` is
destroyed by the next settings save from any client.

**Proposed fix.** Give it the "omitted means unchanged" contract the neighbouring blobs
already use — `array_key_exists('customLabels', $s) ? json_encode(...) : null`, since
`null` is skipped by the loop at `sync.php:2100-2107`. No schema change.

**How to verify.** Write a value into `system_settings.CUSTOM_LABELS`, change the system
name in Settings, and confirm the value is still there.

---

## Summary

| Collection | Fields checked | Breaks |
|---|---|---|
| leads / clients | 38 columns + `categories` + `timeline`, INSERT vs UPDATE vs identity check vs GET | **1** (A2 `vat_validation_result`) |
| lead timeline events | 15 columns, incl. the type-gated document fields | **2** (A1 `timestamp`, B1 `filePath`); `author` same cause as A1 |
| lead categories | 2 | 0 |
| tasks | 16 + `assignedUsers`; `created_by` is server-owned on purpose | 0 |
| task assignees | 2 | 0 |
| meeting notes | 16 | 0 |
| meeting tasks | 9 (delete + re-insert per meeting) | 0 |
| projects | 12 + `managers` + `data` + `timeline` + `gantt` | 0 |
| project types | 15 + dynamic-column DDL | 0 |
| project data / timeline / gantt | dynamic `attr_*` columns; ids are `attr_<ts>_<rand>`, so the column-name sanitiser is a no-op and keys round-trip | 0 |
| unified entries (registry) | 12 | 0 |
| unified entries (dynamic rows) | 14 module-gated columns | 0 |
| custom dashboards | 8 | 0 |
| warehouses | 6 | 0 |
| suppliers | 17 | 0 |
| warehouse items | 15 | 0 |
| warehouse stock | 5 | 0 (see note 1) |
| warehouse batches | 8 | 0 |
| warehouse movements + items | 16 + 10 | 0 |
| financial categories | 8 | 0 |
| client categories | 7 | 0 |
| financial records | 26 | 0 |
| invoices / offers + items | 47 + 12 | 0 |
| AI templates | 10 | 0 |
| users | 8, plus password/seat/role handling | 0 |
| roles | RBAC blob, empty-push guard | 0 |
| settings | 25 keys | **1** (D `CUSTOM_LABELS`) |
| — cross-cutting — | leads conflict guard vs child tables | **1** (C1) |

### Notes and things not fully traced

1. **`warehouse_stock` has no deletion path at all** (`sync.php:3517-3533`) — rows are
   only ever upserted, and the collection has no `id`, so `diffRecords`
   (`App.tsx:230-234`) sends it whole on every push. A stock line can never be removed
   through sync. Not a lost-edit bug; flagged because it is the only collection with an
   asymmetric delete story.
2. **The stale-snapshot delete guard is disabled for 11 collections.** `ccrm_delete_omitted`
   is called with `$baseSyncedAt = null` for warehouses, suppliers, warehouse items,
   batches, movements, financial categories, client categories, financial records,
   invoices/offers, AI templates and custom dashboards, so the `updated_at <= ?` clause is
   skipped. Latent only: the shipping client raises `syncProtocol` to 2 after its first
   GET (`App.tsx:2037`), and named deletions bypass that clause anyway. The mass-delete
   circuit breaker still covers all of them.
3. **Project dynamic attribute values are typed only on the way in.** `attr_*` columns are
   `LONGTEXT`, so a `number`, `money` or `checkbox` attribute comes back from
   `sync.php:1096-1100` as a string. The keys round-trip correctly and
   `ProjectDetailsView` renders the values as text, so I found no break — but I did not
   exercise every attribute type's consumer, so this is "no evidence of a bug" rather
   than "verified clean".
4. **Unified-entry dynamic rows** are written column-by-column only when the matching
   module is active for that row type (`sync.php:3226-3345`), while the GET returns every
   column that exists (`sync.php:963-996`). The two agree for every combination I read,
   but I did not exercise all of them in the UI.
5. No format-mismatch bombs found. Every `DATE` column fed from the client is either
   passed through `ccrm_date_only()` / an explicit `preg_match` or receives a
   `YYYY-MM-DD` value from a date input; `timeline_events.file_type` is an ENUM and the
   only two writers constrain it to the three allowed values; free text bound for
   `VARCHAR`/`TEXT` on the timeline is scrubbed and clamped by `ccrm_sanitize_db_text()`.
