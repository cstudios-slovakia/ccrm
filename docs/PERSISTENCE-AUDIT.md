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

## Known instances (so the next audit knows what "this class" has looked like)

| Version | Symptom | Root cause |
|---|---|---|
| 1.9.83 | Project custom fields and timeline attributes empty after reload | `str_replace('attr_', '', $col)` on read stripped the prefix that the ids themselves start with; column `attr_attr_1726_1` read back as key `1726_1`, `attr_tattr_…` as `t…`. Fixed with one shared column↔id helper and a probe check. |
| 1.5.115 | Delete-omitted wiped records after a partial (delta) push | Server read an absent list as "delete the rest" while the v2 client meant "unchanged". Mass-delete guard + explicit `deleted` lists. |
| earlier (see the comment above `$delMgr` in sync.php) | Project managers vanished on projects not in the payload | Unconditional `DELETE FROM project_managers` assumed a full snapshot. Now per-project, only when the key is present. |
| earlier (see the `COALESCE` comments in the projects INSERT) | Rating / custom file slots wiped by an older client | Field absent from payload wrote NULL. `COALESCE(VALUES(x), x)` so absent means unchanged. |
