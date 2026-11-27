# Undefined-symbol audit, part 2 of 2: fix, guard and ship (Sonnet 5.5, high effort)

## The task

Part 1 (Opus, `docs/prompts/undefined-symbol-audit-1-opus.md`) scanned the whole app for
names that are used at runtime but are not reliably defined on every path that reaches them:
PHP functions whose file is never `require`d, unguarded files loaded twice, columns the
database may not have, undefined frontend identifiers, and so on. It wrote:

- `docs/audits/undefined-symbol-audit.md`: the triaged report, with an ID and an exact fix
  for every confirmed finding.
- A re-runnable scanner under `scripts/` (see the report's "Scanner usage" section).

Your job:
1. Apply every confirmed fix.
2. Add a guard test so this class of bug fails `npm run test:unit` from now on.
3. Ship it the project's way.

Read `CLAUDE.md`, `.agents/rules/*.md` and the **whole** report before you edit anything.
For background on each error class (A–H) and the commits that motivated them, see the
part 1 prompt.

## Step 1: check the report is current

Other sessions may have committed since part 1 ran. Re-run the scanner and compare its output
with the report. If a finding has disappeared, someone already fixed it: mark it as such and
skip it. If a new one has appeared, do **not** fix it on your own judgement. List it at the
end under "new since part 1".

## Step 2: apply the fixes

- Work through the findings in the order the report gives, respecting its dependencies
  (for example "guard `x.php` before adding the require in A-05").
- Apply **only** findings marked `certain`. For each `needs judgement` item, read the
  report's explanation. If the deciding fact is clearly settled by the code, apply the
  fix and note why. Otherwise leave it and list it in your final reply.
- Apply the fix the report specifies. If it turns out wrong when you try it (a require cycle,
  a file with top-level side effects, a redeclare, a lint error, a failing test), **stop on
  that item**. Do not invent a different fix. Record what happened and move on.
- House rules for each kind of fix:
  - Missing load: add `require_once __DIR__ . '/x.php';` at the **top** of the file that
    uses the function (never inside a branch or a migration), with a one-line comment
    naming what it provides. Example: `public/sync.php` after `80a0a76c`.
  - Unguarded declaring file: wrap it in `if (!function_exists('<first fn>')) { … }`, like
    `public/api/employee_name.php`.
  - Missing column: follow the 4-place rule in `.agents/rules/database-schema-and-sync.md`
    (CREATE TABLE, idempotent migration, pre-transaction healing in `sync.php`,
    `entities_overview.md`).
  - Frontend: import the real name, or restore the renamed one. Never cast to `any` or add
    `@ts-ignore` to silence it.
- Edit `public/`, never the root mirrors or `dist/` by hand. Run `npm run sync:backend` when
  you are done, then diff `public/` against the root copies to confirm they match.
- Do not change behaviour beyond making names resolvable. If a fix would change what a
  screen does, leave it and report it.

## Step 3: guard test

Add `src/utils/undefinedSymbolGuard.test.ts`. It runs under `npm run test:unit`, so it needs
**no PHP and no Docker**. Model it on `src/utils/recurringTaskGuard.test.ts`. Reuse the
scanner's core logic rather than writing a second copy of it.

- Enforce exactly the rules the report's "Proposed guard-test rules" section calls reliable.
  At minimum: a PHP file under `public/` that calls a project function whose defining file
  is not in its unconditional top-level require closure fails the test, with the file, the
  line, the function and the file that defines it.
- Use the report's false-positive list as the allowlist. Every allowlist entry needs a
  one-line reason.
- Add a fixture test that reproduces `80a0a76c` (a caller that uses a function from a file it
  loads only inside a function or a migration) and assert that it is flagged. Add one for the
  passing case too.
- The test must pass on the fixed tree. **Never** make it pass by adding a real finding to the
  allowlist or by loosening a rule. Fix the code, or if you can't, stop and report it.

## Step 4: verify

1. PHP lint every file you touched, in the dev container (no PHP on the host). From Git Bash:
   `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/public:/app" php:8.2-cli php -l /app/<file>`
2. `npm run typecheck`
3. `npm run test:unit`
4. Re-run the scanner. Every finding you applied must be gone.
5. Scoped QA: `node scripts/qa/run-qa.mjs --files <files you changed>`, then read
   `test-results/qa-audit-report.md`. Report failures as symptom → root cause → proposed fix.
   Check whether each failure was already failing before your change (see
   `docs/TESTING.md`). Do not loosen a check to make a finding disappear.

## Step 5: report back in the audit file

Append a "Part 2 results" section to `docs/audits/undefined-symbol-audit.md`. For each
finding ID give one of: `fixed`, `already fixed`, `skipped (reason)`, `fix failed (what
happened)`. Then list the "new since part 1" findings and the verification results.

## Step 6: ship

Follow the order in `CLAUDE.md`: **test → bump version → changelog → build → commit**.

- Bump `src/utils/version.ts`, then add an entry to the current changelog
  (`1.13-nectarine-changelog.md` while the branch is `1.13-nectarine`). Name each
  user-visible fix by the screen or flow it repairs, list the scanner and the guard test, and
  give the test results.
- `npm run build`, then commit in two commits as the recent history does:
  1. Source, mirrors, scanner, report and test. Message:
     `fix(backend): every file loads what it calls; guard test for undefined symbols (v<version>)`
  2. `build: dist for v<version>`
- Other sessions may be working in this same checkout. Stage **only** the files you
  created or edited (explicit paths, or `git add -p`). Never `git stash`, `git reset` or
  `git checkout --` anything you did not write. Check `git status` before each commit.
- Do not push and do not deploy.

## Final reply

Keep it short:
- The counts of fixed, skipped, failed and new findings.
- Every item that needs the user's decision.
- The test and QA results.
- The two commit hashes.
