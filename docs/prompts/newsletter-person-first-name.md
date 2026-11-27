# First and last name for person records (leads and clients of type "person")

Run as one `ccrm-implementer` (Sonnet, **high** effort: sync-path and backfill change), in its own
worktree on top of `1.13-nectarine`. Follow-up to newsletter package 3C (decision B1.7 in
`docs/NEWSLETTER.md`, Peter 2026-11-09).

## Goal

A record of type **person** (`leads.client_type = 'person'`, both leads and clients) can store the
person's own first and last name, and the newsletter's `{{first_name}}` reads that stored first name.
Nothing guesses a first name from the full `name` any more (B1.5), and a person without a stored first name
shows up in the audience's "N without a first name" count, where the user can now fix it.

## Context / links

- Read first: `CLAUDE.md`, `.agents/rules/database-schema-and-sync.md`, `.agents/rules/large-files.md`,
  `.agents/rules/commit-and-versioning.md`, `docs/VIEW-SIZE.md`, `docs/BRANDING.md`.
- `docs/NEWSLETTER.md`: B1.5, B1.7, C5 step 7, C18, and package 3C's checklist and "Left over" (A4, Phase 3).
- What 3C built (commits `cb67fc93`, `61e1e206`, review fixes `cf1a0e7d`):
  - `public/api/contact_name.php`: `ccrm_compose_contact_name()`, `ccrm_contact_parts_from_person()`,
    `ccrm_contact_name_for_sync()`, `ccrm_set_contact_parts_from_person()`, `ccrm_backfill_contact_names()`
    (guarded by the `system_settings` key `CONTACT_NAME_BACKFILL`, called from `schema.php`, file is in
    `ccrm_schema_fingerprint()`).
  - `src/utils/contactName.ts` (+ `contactName.test.ts`): `composeContactName`, `contactNameFieldsOf`,
    `contactNamePatch`, `contactNameFromRegistry`.
  - `src/components/ui/ContactNameFields.tsx`.
  - `ccrm_split_person_name()` lives in `public/api/employee_name.php`.
- The bug being fixed: `public/api/newsletter_audience.php`, `ccrm_newsletter_lead_candidate()` (~line 385):
  a person with no contact name gets `{{first_name}}` from the first word of `name`. For a Hungarian
  "Kovács Péter" that gives "Kovács", and no form lets the user correct it.
- Today every form hides the contact fields for a person:
  - Client profile edit (`ClientsView.tsx`): the fields are hidden around line 3900, and the save
    (~2857) **clears** the parts for a person.
  - New client form (`ClientsView.tsx` ~7021).
  - Price offers' `priceOffers/NewClientModal.tsx`: `newClient.clientType !== "person"`.
  - Lead form (`LeadsDatagrid.tsx` ~6212): shown for a person only when parts already exist.

## Design (decided; do not change without asking)

1. **No new columns.** For a person, `contact_first_name` / `contact_last_name` hold **the person's own**
   first and last name. For a business they stay the contact person's, as today.
2. **`name` is not recomposed.** A person's `name` stays the display name the user typed, in any order
   ("Kovács Péter" stays as it is). Client grouping and name-matching depend on `name`, so changing it
   is out of scope. The parts only say how to address the person.
3. **`contact_person` stays as it is for a person.** It is normally empty. The compose rule of C18
   (`contact_person = first + ' ' + last` when a part is filled) applies to **business records only**.
   Apply this in both `composeContactName` / `contactNamePatch` (TS) and `ccrm_contact_name_for_sync()` /
   `ccrm_set_contact_parts_from_person()` (PHP). Otherwise every person record would suddenly carry a
   contact person equal to its own name, which shows up on PDFs and cards. TS and PHP must keep matching
   exactly; extend the unit test and the PHP test with person cases.
4. **Forms.** For a person record, every form above shows `ContactNameFields` under the name.
   - Use the label "Name for greetings" with the two fields "First name" / "Last name". Add sk/hu
     translations in the same style as the existing ones.
   - When both parts are empty, prefill them from `ccrm_split_person_name`'s TS mirror applied to `name`.
     This is a suggestion only: it is not saved unless the user edits it, which is the same as
     `contactNamePatch` today.
   - Saving a person **keeps** the parts; remove the clearing in `ClientsView.tsx` ~2857.
   - Switching a record from business to person or back: the parts move with the meaning. When switching
     to person, clear them only if they equal the split of the old `contact_person` (they belonged to the
     contact person); otherwise keep them. If this is ambiguous in a given form, stop and ask.
   - Large files get only the mount and wiring lines.
5. **Writers without a form** that create or rename a person record from `name` alone (guest order to
   client in `orders.php`, web form in `pipeline.php`, MCP `create_lead` / `update_lead` / `create_client` /
   `update_client` with `client_type = person`, workflows, `QuickAddClient.tsx` through sync):
   - On create, or when `name` changes and no parts were sent, set the parts from
     `ccrm_split_person_name(name)` (both NULL when it is unsure), the same as C18 does for
     `contact_person`.
   - If a person's `name` changes but its stored parts still compose to the old name, re-split. If they
     do not (the user typed them), keep them.
   - In sync, a missing key still means "no opinion".
   - List every writer you touched in the report.
6. **Backfill once.**
   - Scope: person records with a `name`, both parts NULL and an empty `contact_person`.
   - Split `name` with `ccrm_split_person_name()`; leave a row empty when the split is unsure.
   - Guard it with a **new** marker `PERSON_NAME_BACKFILL` (the 3C marker may already be set on dev
     databases), and give the UPDATE `` `updated_at` = `updated_at` ``. The sync conflict guard compares
     `updated_at` (see 3C's review fix).
   - Put it in `contact_name.php` (already in the fingerprint) and call it next to
     `ccrm_backfill_contact_names()` in `schema.php`.
   - This gives existing people the same first name as today, and the name is now correctable.
7. **Newsletter.** In `ccrm_newsletter_lead_candidate()`, `first_name` = `contact_first_name` (titles
   stripped) for every record. Remove the person fallback and update the doc comment. "Without a first
   name" then counts persons with no stored first name. Extend `scripts/test-newsletter.php`:
   - a person with parts Péter / Kovács and name "Kovács Péter" → "Péter";
   - a person with no parts → empty `first_name` and counted.
8. **Demo.** The person records in `public/api/demo_seed/packs/*/` get both parts. In the Hungarian pack
   the given name goes in `first`. `test:demo-packs`, `test:demo-seed` and `test:demo-wipe` must stay as
   they are.

## Scope

`public/api/contact_name.php`, `public/api/schema.php` (one call line), `public/sync.php` (only if the
person rule needs a line there), `public/api/newsletter_audience.php`, the PHP writers of item 5,
`src/utils/contactName.ts` (+ test), `src/components/ui/ContactNameFields.tsx`, the forms of item 4,
`scripts/test-newsletter.php`, the demo packs, `entities_overview.md` (column meaning for persons),
`docs/NEWSLETTER.md` C18 (add a "Person records" paragraph that matches this design), translations,
`npm run sync:backend` mirrors, changelog fragment.

## Out of scope

- Recomposing or reordering `name`.
- A name-order rule by language (B1.5).
- New columns.
- Changing how clients are grouped or matched.
- The newsletter UI other than the existing count.
- A version bump, a build, push or deploy.

## Definition of done

- [ ] Design items 1-8 built; TS and PHP compose/split rules identical, with unit and PHP test cases
      for person records
- [ ] `npm run check` green
- [ ] `npm run test:newsletter`, `test:demo-packs`, `test:demo-seed`, `test:demo-wipe` (Docker PHP from
      PowerShell when PHP is not installed: `docker run --rm -v "${pwd}:/app" -w /app php:8.2-cli php <script>`;
      give long commands a timeout)
- [ ] PHP lint (same Docker command, `php -l`) on every edited PHP file
- [ ] Changelog fragment in `changelog.d/`; commit in logical steps as soon as each passes `npm run check`
- [ ] Committed on the worktree branch; not pushed
- [ ] The orchestrator (not you), after the merge and from the main checkout:
  - `npm run test:persistence`: add a person lead with parts to `scripts/probe-persistence.mjs`, and check
    that its parts read back and its `contactPerson` stays empty;
  - one scoped QA run over the changed files;
  - a manual check: create a person client "Kovács Péter", set Péter / Kovács, and confirm the
    newsletter audience preview's sample greets "Péter".

## Pre-existing failures

- `test:demo-seed`: 4 failures "employees: E1-E3 have no leave in the last five weeks" (fail the same way
  before the newsletter work, `a0e36820`). List, do not fix.
- `test:demo-seed` prints a warning that its fake PDO cannot interpret `demo_mailbox.php`'s
  `SELECT id FROM leads WHERE LOWER(email) = ?`. Not this task.
- `npm run test:persistence` has the container name `crm-19-jackfruit` and port 8086 hard-coded; the
  current dev stack is container `crm` on port 8085. Not this task (the orchestrator runs a patched copy).

## Stop and ask when

- A reader of `contact_person` or of the parts would show a person's own name twice, and fixing it means
  touching files outside Scope.
- The business ↔ person switch in a form has no clear right answer (item 4).
- A writer cannot tell a person's `name` change from a rename of a linked client.
- A check fails for a reason unrelated to this change.

## Report format

Under 300 words:
- what changed;
- commits (hash + subject);
- checks run, with results;
- every writer touched (item 5);
- pre-existing failures seen (not fixed);
- deviations from this design, and open questions.

> Verify with `npm run check` only. Do not run browser QA, do not push, do not wait for CI. Commit on your worktree branch; the orchestrator merges.
