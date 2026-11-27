# Large files: do not make them bigger

Some files are huge (`LeadsDatagrid.tsx`, `FinancialManagementView.tsx`, `SettingsView.tsx`,
`ClientsView.tsx`, `WarehouseView.tsx`, `App.tsx`, `public/sync.php`, ...). Agents re-read them
constantly and parallel edits conflict on merge. A ratchet test keeps them from growing.

- Test: `src/utils/fileSizeRatchet.test.ts` (part of `npm run test:unit`).
- Baseline: `scripts/agent/file-size-baseline.json` (every `src/**/*.{ts,tsx}` and
  `public/**/*.php` file over 2,500 lines, with its line count).
- It fails when a listed file exceeds baseline + 150 lines, or an unlisted file passes 2,500.

## Rules

1. When you touch a listed file, put each new self-contained piece (more than ~150 lines: a
   component, hook, helper set, PHP function group) in a **new module next to it**, and import it.
   Do not append it to the big file.
2. Extracting a region you are about to change is fine, as its own **pure-move commit** (no
   behavior change, no renaming, no reformatting) when the risk is low. Then make the real change
   in the new module in a second commit.
3. No big-bang refactors. Never split a file as a side effect of an unrelated task.
4. If the test fails, extract a module. Do not raise the baseline to make it pass.

## Updating the baseline

- A file shrank: the test prints a note. Lower its number in the JSON to the new `wc -l` value
  (in the same commit that shrank it), so the gain is locked in.
- A file dropped under 2,500: remove its entry.
- Never raise a number and never add a new entry for a file that grew past the limit; split it.
