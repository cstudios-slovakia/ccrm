# Unsaved drafts — open decisions

Left over from the "saves that never leave the browser" audit
(`docs/PERSISTENCE-AUDIT.md`, second prompt, 2026-09-21). Everything small was
fixed in the same pass; what is below changes behaviour across the app or the
product's rules, so it waits for a decision. Each item has a recommendation.

## 1. A shared "leave guard" for unsaved drafts — the main one

**Problem.** Several editors hold a draft that only an explicit Save writes, and
every exit throws it away without a word: the sidebar, browser back, a hash
link, a reload. The app has nothing that can ask first — leaving through the
sidebar just unmounts the component, and an unmounting component cannot show a
confirm.

Affected today:

| Editor | Draft that is lost | Exits |
|---|---|---|
| Invoicing wizard (new and edit) | all five steps; edits have no save point before step 5 | ✕, "Open settings" in the step-5 error box, sidebar, reload |
| Automation workflow editor | name, trigger, nodes, edges | "Back to list", sidebar, reload |
| Dashboard layout edit | added/moved widgets, widget settings | sidebar, switching dashboard, reload |
| New project type (not saved yet) | the whole type | another settings tab, sidebar, reload (✕ and Cancel already ask) |
| Lead / client log form | typed note, recorded audio, picked file | switching to another lead or client (reset on purpose so it is not filed on the wrong record), sidebar, reload |
| Lead profile edit mode | edited fields | switching lead (now reset instead of written onto the next lead), sidebar |
| Warehouse goods issue ("Rozpracované" badge) | issue lines, client | Back, Cancel, sidebar, reload |
| Unified entry editor | form fields, an uploaded file | Back arrow, Cancel |
| Files upload drawer | queue with filled-in details | backdrop click, ✕ (even while uploading) |

**Options.**

- **A — one `useLeaveGuard(isDirty, message)` hook** (recommended). It
  registers the editor's dirty state with App, which asks for confirmation
  before `setActiveTab` from the sidebar, on `hashchange` (restoring the hash
  when the answer is no), and on `beforeunload`. There is one mechanism and one
  wording, and each editor adds a single line.
- **B — autosave every existing record** (the project / project-type pattern:
  a debounce plus a flush on exit), with a confirm only for records never
  created. This is the least friction for users, but it is a large change per
  editor and it changes what Cancel means.
- **C — accept the discard and make the labels honest** (e.g. no "Draft" badge,
  and no "Done" that looks like saving). This is the cheapest option, but data
  still gets lost.

Recommendation: **A for new records and explicit-Save editors, B where the
project pattern already exists.** Decide whether A may block the sidebar.

## 2. Dashboard "Done" buttons

The header "Done ✓", "Add" in the widget drawer (whose row then shows "Added")
and "Done" in widget settings all change only the unsaved layout; only "Save"
writes. The comment in `DynamicDashboardView.tsx` says this is intentional.
**Decide:** should Done save (recommended — the ✓ reads as saving), or does
Done stay a draft action with a visible "unsaved changes" state plus the leave
guard from #1?

## 3. Invoicing: editing a document that was already issued externally

Saving an edit to a document issued through SuperFaktúra or iDoklad changes
only the CRM copy; the accounting service never sees it. Changing the type of
an existing document also keeps its old number series (CP/ZF/FA).
**Decide:** lock issued documents (recommended), warn and allow the edit, or
push the edit to the service. The step-1 hint also says the due date and
valid-until "can be edited", but there are no fields for them: add the fields
or reword the hint. (The issue date itself is now honoured on edit.)

## 4. Finance: the recurring-rule drawer's Active/Inactive switch

Inside the rule drawer the switch changes only the draft, and its caption
changes at once ("No further payments are generated."). The identical pill on
the Recurring tab saves immediately. **Decide:** make the drawer switch save
immediately like the pill (recommended), or keep it a draft and rely on #1.

## 5. Recording toasts on leads, clients and meetings

"Audio recording saved successfully!" appears when the file reaches the server,
but on a lead or client the note is filed only by the "Log" button.
**Decide:** reword the toast ("Recording uploaded — press Log to add it"), or
create the note event automatically once the upload finishes (recommended).

## 6. Warehouse product categories

Categories created with "Add & Select" in the product card live only in the
open card (`customCategories` is never stored); a category exists only while
some saved item uses it. **Decide:** a stored category catalogue, or keep
categories as free labels on items (then say so in the picker).

## 7. Files: a client name typed but not picked

Uploading after typing a client name without clicking a suggestion files the
document under "Unassigned documents" without a word. **Decide:** block Upload
until a client is picked, or use an exact name match (recommended: exact match,
otherwise block with a message).

## 8. Smaller wording and UX calls

- **Task e-mail reminder:** ticking the box shows "Sent <day> at <time> to
  <email>" before the task is saved. Use future wording ("Will be sent … once
  saved")? (This is the task-reminder feature from another session.)
- **Warehouse product card:** "Unlocked" re-locks the card without saving, which
  reads like committing. Should it save on lock?
- **Start menu group rename:** a rename typed but not confirmed is dropped when
  the menu closes. Should it save on close?
- **BlockEditor** writes its blocks back once on mount, which normalises
  plain-text meeting notes to JSON and triggers a sync just by opening a note.
  Should it skip the first run?
