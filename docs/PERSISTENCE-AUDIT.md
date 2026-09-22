# Persistence audit: "I saved it, refreshed, and it was gone"

A prompt for an AI agent (or a person) to audit CCRM for the one bug class
that keeps coming back: a field that saves without an error, survives in the
UI until the next reload, and then reads back empty. The value is usually in
MySQL the whole time; the read side and the write side just disagree.

Paste the prompt below as-is. It needs the local Docker backend running
(`docker compose up -d`, web on :8086) because the QA suite mocks `sync.php`
and therefore cannot see this class at all.

---

## The prompt

> Audit CCRM for save/reload asymmetries: fields that the app lets a user
> fill in and save, that then read back empty, changed, or under a different
> key after a hard refresh. Treat persistence as a round-trip property — the
> only acceptable evidence is a real write, a fresh read from the server, and
> a comparison — never "the save request returned success" and never a
> frontend test, because the QA suite mocks `sync.php`.
>
> **Scope.** Every place the frontend hands data to the backend and reads it
> back: `sync.php` (GET and POST for every entity in `$candidates`), every
> `api/*.php` that writes (`task.php`, `pipeline.php`, `workflows.php`,
> `superfaktura.php`, `idoklad.php`, `mail_broker.php`, `permissions.php`,
> `upload.php`, `delete_file.php`), and the localStorage/IndexedDB layer in
> `src/` that caches server state between reloads.
>
> **Method — do all four, in this order.**
>
> 1. **Inventory the contract.** For each entity, list the fields the TS type
>    declares (`src/types/index.ts`) and the fields the UI actually edits
>    (grep the view for `setX(`/`onChange`). Then list, in `sync.php`, the
>    columns the INSERT/UPDATE writes and the keys the SELECT mapping emits for
>    that entity. The read block and the write block for one entity are often
>    1500 lines apart — find both. Any field in the UI/type that is missing from
>    either side, or named differently on the two sides (camelCase↔snake_case
>    done by hand, a JSON blob key, a `COALESCE(VALUES(x), x)` "absent means
>    unchanged" rule on one field but not its sibling), is a finding.
>
> 2. **Hunt transforms without an inverse.** Anywhere a key, id or table name
>    is derived — `strtolower`, `preg_replace('/[^a-z0-9_]/', …)`, prefixes
>    like `attr_`/`proj_data_`/`ue_`, `str_replace`, `json_encode` of arrays,
>    date normalisation, `mb_substr` truncation — confirm the read side applies
>    the exact inverse, ideally through the same shared helper (see
>    `ccrm_attr_column()` / `ccrm_attr_id_for_column()` in `sync.php` for the
>    pattern). Reconstructing an id from a column name is a red flag: ids can
>    contain the prefix themselves (`attr_attr_…`; `tattr_` contains `attr_`).
>    Also check silent skips: `if (ccrm_column_exists(...))` around a write
>    drops the value with no error when the column was never created — find
>    what creates the column and whether every path that can introduce the
>    field also runs it.
>
> 3. **Prove it on the real backend.** Extend `scripts/probe-persistence.mjs`
>    (`npm run test:persistence`) with one round-trip per finding candidate and
>    per entity you could not clear by reading: POST a record with every field
>    set to a distinctive value (ids that already carry the prefix, strings
>    with diacritics and quotes, arrays, `0`, `""`, `null`, a date, a money
>    object), GET, and assert deep equality under the same keys. Make sure the
>    container runs the current PHP first
>    (`docker cp sync.php crm-19-jackfruit:/var/www/html/sync.php`). Then do
>    the same through the browser for at least the entities with dynamic
>    schemas (project types → projects, unified entries, timeline attributes,
>    custom file slots): fill every field in the real UI, save, hard-refresh,
>    read the page. A check that passes must also be shown to fail when the fix
>    is reverted, otherwise it proves nothing.
>
> 4. **Check the delta-sync and cache layers.** With `syncProtocol: 2`, a
>    payload that omits a key means "unchanged" for some fields and "cleared"
>    for others. For each entity, confirm the frontend's dirty-tracking sends
>    the field when it changed, that the server treats an absent key the way
>    the frontend assumes, and that the localStorage snapshot the app boots
>    from is re-anchored to the server response (not to the optimistic local
>    state) after a push.
>
> **Report** as observed symptom → root cause → proposed fix, grouped by root
> cause, each with the file and line on both the write and the read side and
> the probe check that pins it. Fix what you find (small fixes without asking),
> keep the probe checks, and never make a finding disappear by loosening a
> check. Finish with `npm run test:unit`, the scoped QA run and
> `npm run test:persistence`, and say plainly which entities you proved by
> round-trip and which you only read.

---

## The second prompt: "it looked saved, but it was never sent"

The round-trip prompt above assumes the save reached the server. The
1.9.92 project-type bug never did: the attribute form's own **Save changes**
/ **Add Attribute** button only changed a local draft, the type was written by
a *second* button further down, and every exit (✕, Cancel, "Back to projects",
another module, browser back) discarded the draft without a word. The server
was fine; `npm run test:persistence` could never have seen it. Run this one
alongside the first — it needs only the dev server, though the proof step is
strongest against the Docker backend.

> Audit CCRM for **saves that never leave the browser**: any screen where a
> user can press something that looks like saving, see the change on screen,
> and still lose it by leaving the screen or reloading — because the change
> lived only in component state or a draft that a later, separate action was
> supposed to commit.
>
> **Scope.** Every editor in `src/components/` that holds a copy of persisted
> data in local `useState` and writes it back through a `setX` prop that ends
> in `update…AndSync` / `pushStateToServer` in `App.tsx`. Start with the
> settings screens (`ProjectSettings.tsx`, `SettingsView.tsx` and its tabs,
> pipeline/lead-state editors, unified-entry registry, warehouse and
> financial category editors, dashboard/widget settings drawers, template
> editors) and every drawer or modal with a form.
>
> **Method — do all four.**
>
> 1. **Map the draft layers.** For each editor list: the local state that
>    shadows persisted data (`useState(type.x)`, `setAttributes(type.attributes)`),
>    every handler that changes it, and every handler that actually calls the
>    persisting prop. A handler that changes the draft but does not persist
>    is fine only if a commit is guaranteed later. Pay special attention to
>    **nested forms**: a sub-form whose button is labelled Save / Save
>    changes / Add / Apply / Done but whose handler only updates the parent's
>    draft. That label is a promise; if the click is not a write, it is a
>    finding.
>
> 2. **Enumerate every exit** from each editor and what happens to a dirty
>    draft on each: the ✕, Cancel/Close, the parent's back button (it
>    unmounts the editor — look for a flush in an effect cleanup), switching
>    module in the sidebar, the browser back button / hash change, a type or
>    record switcher inside the editor, logout, and a hard reload. Every exit
>    must either write the draft, or ask before discarding it. A silent
>    discard is a finding. Also check the inverse: a form field typed but not
>    "added" (an option draft, an attribute name, a new file slot name) when
>    the outer Save is pressed — it must be kept or refused, never dropped.
>
> 3. **Check the autosave where one exists.** `ProjectDetailsView.tsx` and the
>    project-type editor autosave with a debounce and a flush on unmount.
>    Confirm for each: the baseline is taken from the loaded record (opening
>    must not write), a change inside the debounce window is flushed on every
>    exit from step 2, a pending write is dropped when the record is deleted
>    (no resurrection), and switching to another record flushes the previous
>    one first. A debounce with no unmount flush loses exactly the fast
>    "edit, then leave" path users take.
>
> 4. **Prove each candidate in a real browser**, not by reading. Drive the
>    UI with Playwright against the dev server proxied to the Docker backend
>    (`CCRM_DEV_BACKEND_PORT=8086 npx vite --port <free port>`): make the
>    change, press only the button the user would call "save", leave through
>    each exit *immediately* (inside the debounce window), then read
>    `/sync.php` and hard-reload. Record whether a POST carried the change at
>    all — "no POST" is this class; "POST but wrong read-back" belongs to the
>    first prompt. For every fix add a QA spec in `tests/e2e/` that asserts on
>    the **outgoing POST body** (the QA mock re-serves a fixed dataset on
>    every load, so a reload there proves nothing), and show that it fails
>    on the old code before it passes on the new.
>
> **Report** as observed symptom → root cause → proposed fix, grouped by root
> cause (one missing flush usually explains every exit of one editor), with
> the file and line of the draft state, the button that promises a save, and
> the exit that drops it. Fix small ones directly — prefer the pattern the
> project already uses (autosave with debounce + flush on unmount for
> existing records; a confirm before discarding a record that was never
> created) over adding more Save buttons. Finish with `npx tsc --noEmit`,
> `npm run test:unit` and the scoped QA run (`node scripts/qa/run-qa.mjs
> --files …`), and list which editors you proved in the browser and which
> you only read.

---

## Known instances (so the next audit knows what "this class" has looked like)

| Version | Symptom | Root cause |
|---|---|---|
| 1.9.92 | A new checkbox attribute on a project type, "saved" with the attribute's own button, was gone after going back or reloading (any attribute type, and any other edit in the type editor) | Never sent: the attribute button only changed the editor's draft, the type was written by a separate "Save Project Type", and ✕ / Cancel / Back to projects discarded the draft silently. An existing type now autosaves (600 ms debounce, flushed on close and unmount); leaving an unsaved new type asks first; a filled-in but un-added attribute is kept by Save. QA spec asserts on the outgoing POST. (Second prompt above.) |
| 1.9.85 | Deleting an imported mail from a lead timeline "worked", the mail was back after a reload | `ccrm_leads_are_identical()` compared neither `hidden` nor `is_outgoing`, and counted hidden DB rows the GET never serves — the push that hid a mail as its only change was declared identical and skipped whole. Visible-row count + both flags now compared; probe check. |
| 1.9.85 | Project timeline yes/no attribute showed "1" after reload; text "42" became a number; a project data multi-select came back as a JSON string | Write bound scalars raw (PDO turned `true` into `"1"`) and the timeline reader ran `json_decode()` on every stored text while the data reader decoded nothing. One encode/decode pair (`ccrm_encode_attr_value` / `ccrm_decode_attr_value`) on both tables. |
| 1.9.85 | Paused recurring rule lost its planned end date; "edit one payment" fields not stored; offer `statusChangedAt` lost; user activity log always empty | Fields the UI wrote with no column and/or hardcoded on read (`'activityLog' => []`). Columns added (`recurring_planned_end_date`, `status_changed_at`); the log lives in `metadata_json`. |
| 1.9.85 | Quantity 2.345 × 0.125 came back as 2.35 × 0.13 with the old total | `step="any"` inputs into `DECIMAL(12,2)`; widened to `DECIMAL(15,4)` (`ccrm_migrate_quantity_precision`). |
| 1.9.85 | A note edited seconds after saving a business client vanished ("not saved on the server" toast) | `api/generate_report.php` wrote the server-owned `financial_summary` and let `updated_at` move, so the user's next push failed the clobber guard. Server-owned writes pin `updated_at = updated_at`. |
| 1.9.85 | Task-state / lead-category rename by a non-admin reverted silently | UI gates them behind `traffic_sources`, the server behind `general_config` / `pipeline_stages`, and the settings block reported no skip. Gates aligned; refused settings keys now surface as `settings:<KEY>` in `permissionSkipped`. |
| 1.9.85 | Colleague's timeline entry vanished when another user saved twice within a few seconds | A conflicted (stale) record stayed dirty while `baseSyncedAt` advanced, so the second push passed the guard and re-inserted the stale timeline. The client now forces a full pull after any conflict. |
| 1.9.85 | Changing a user's e-mail at the licence seat limit was refused as a "new seat"; a record without `metadata_json` wiped the user's preferences; voice notes created phantom "Untitled Note" meetings; a cleared connector key came back | Existing users resolved by e-mail only (now id first); NULL metadata now keeps the stored blob; `upload_audio.php` no longer files `note_event_*` ids as meetings; `''` clears an invoicing secret like every other secret. |
| 1.9.83 | Project custom fields and timeline attributes empty after reload | `str_replace('attr_', '', $col)` on read stripped the prefix that the ids themselves start with; column `attr_attr_1726_1` read back as key `1726_1`, `attr_tattr_…` as `t…`. Fixed with one shared column↔id helper and a probe check. |
| 1.5.115 | Delete-omitted wiped records after a partial (delta) push | Server read an absent list as "delete the rest" while the v2 client meant "unchanged". Mass-delete guard + explicit `deleted` lists. |
| earlier (see the comment above `$delMgr` in sync.php) | Project managers vanished on projects not in the payload | Unconditional `DELETE FROM project_managers` assumed a full snapshot. Now per-project, only when the key is present. |
| earlier (see the `COALESCE` comments in the projects INSERT) | Rating / custom file slots wiped by an older client | Field absent from payload wrote NULL. `COALESCE(VALUES(x), x)` so absent means unchanged. |
