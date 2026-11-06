# Undefined-symbol audit, part 1 of 2: scan and triage (Opus 5.5, high effort)

## The task

Find every place in CCRM where a name used at runtime (a PHP function, class, constant,
global, included file, DB column, or a TypeScript identifier) is not reliably defined on
**every** code path that reaches it. **Do not fix anything.** Your output is a scanner and a
triaged report precise enough that a second agent (Sonnet,
`docs/prompts/undefined-symbol-audit-2-sonnet.md`) can apply every fix without having to
re-investigate.

These bugs pass local testing and break in production on one screen, often one flow. We
have fixed them one at a time at least ten times. This audit is meant to finish the job
for the whole app.

Read `CLAUDE.md` and `.agents/rules/*.md` first. They apply in full.

## What we have already been bitten by (study these commits first)

Run `git show <hash>` on each and understand the mechanism, not just the patch.

| Commit | Symptom | Mechanism |
|---|---|---|
| `80a0a76c` | Employee file upload: `Call to undefined function ccrm_employee_file_key()` (500) | `sync.php` called helpers from `api/employee_files.php` but never required it. The only `require_once` was inside a schema migration, which the schema fingerprint skips on almost every request, so it worked on the first request after deploy and failed after that. |
| `ed884d4a` | Dashboard task widgets: `undefined function ccrm_sql_real_tasks` | `read_scope.php` and `dashboard_query.php` called it, but only `sync.php` loaded `recurring_tasks.php`. They worked when called from sync and died from any other endpoint. |
| `67bb624f` | Company mailboxes screen: HTTP 500 | `company_mailboxes.php` called `ccrm_migrate_mail_filing()` without including `schema.php`. The cron path worked because it loaded schema itself. |
| `18fc2314`, `55266908` | Tickets / error log endpoints failed | Wrong file required (`security_crypto.php` instead of `auth.php`), or a wrong relative path to `auth.php`. |
| `0792e2d9` | `php ccrm update` never ran the migration | `employee_name.php` had no `function_exists` guard. The licence check loaded `api/…`, the migration loaded `dist/api/…`, and `require_once` does not dedupe two different paths to the same code, so `Cannot redeclare` killed the run. |
| `c2e6facb` | Migrations silently skipped after update | A missing `. "` in an SQL string concat made the file fail to parse. `require_once` remembers a path even when the file failed to compile, so the fixed file deployed later in the same process was never read. |
| `00453456` | Root copy broke after `sync:backend` | A `public/` PHP file required a sibling that was never mirrored to the root copy. |
| `fbeedd81`, `b8f9569c` | `Unknown column 'layout_json' in 'INSERT INTO'`; guest→client conversion always 500'd | The DB schema is the same bug at the SQL level: code wrote a column the running install did not have (no pre-transaction healing), or columns that never existed. Also: a migration ALTERed `orders` before creating it. |
| `deef917a` | `There is no active transaction` on every sync | DDL ran inside the sync transaction; MariaDB implicitly commits on DDL. |
| `da47fe29`, `9ec792b1` | `ReferenceError: formatDateDisplay is not defined`, `brand is not defined` | A renamed or never-imported identifier in a React component. `npm run dev` does not type-check, so it surfaced only when that component rendered. |

The common thread is that **the defining code was loaded by accident**: an include order, an
entry point, a cached path or a migration that happened to run. **Correct by construction**
would mean each file loads what it uses, and every name it uses exists.

## Scope: every entry point, not just sync.php

Build the list of entry points first and put it in the report:

- Every PHP file under `public/` reachable over HTTP (`public/*.php`, `public/api/*.php`,
  `public/api/**/` subfolders such as `demo_seed/` and `Swarm/`).
- Cron and CLI entry points: the `ccrm` CLI script at the repo root (it loads from `api/`,
  `dist/api/` **and** `public/api/` depending on the step), `scripts/*.php`, and anything
  that cron or the README tells the server to run.
- Library files that are `require`d by more than one entry point.
- The frontend: `src/**/*.ts(x)`, plus any non-bundled JS (`public/*.js`, service worker,
  `scripts/*.mjs`).

The root copies (`api/`, `sync.php`) and `dist/` are mirrors of `public/`. Audit `public/`
and verify that the mirrors match it. Do not audit the mirrors separately.

## Error classes to hunt (each one needs its own check)

### A. PHP: a project function, class or constant used where its file is not loaded

The rule to enforce is that **every PHP file must itself `require_once` (directly or through
an unconditional top-level require chain) the file that defines each project function, class
or constant it uses.** "The caller always loads it first" does not count. That is exactly the
assumption that broke `read_scope.php`.

Check:
1. Collect every project-defined `function`, `class`, `interface`, `trait`, `const` and
   `define()` with its defining file. Many are wrapped in
   `if (!function_exists('…')) { … }`; those count as definitions too.
2. Collect every call or use per file: `foo(`, `new Foo`, `Foo::`, `instanceof Foo`,
   `catch (Foo`, type hints, `FOO_CONST`, plus string callables (`'ccrm_x'` passed to
   `call_user_func`, `array_map`, `usort`, `function_exists` checks that are then called).
3. For each file, compute the closure of **unconditional, top-level** `require`/`include`.
   A require that is **conditional** does not count toward the closure. Conditional means
   inside an `if`, `try`, function body, migration, branch on an action parameter, or after
   an early `exit`. Report it separately: "available only when X runs".
4. Flag every use whose definition is outside the file and outside its closure. Filter out
   PHP built-ins (get the list from `php -r 'echo json_encode(get_defined_functions()["internal"]);'`
   inside the dev container, with the same extensions as production) and Composer vendor
   symbols.
5. Pay special attention to anything defined in a file that is loaded only from
   `ccrm_apply_schema()` / `ccrm_apply_migrations()` and used anywhere else. The fingerprint
   gate makes that a guaranteed production failure.

### B. PHP: wrong or fragile require paths

- Relative paths that do not use `__DIR__`. Paths that resolve differently from `public/api/`,
  root `api/` and `dist/api/`. Paths to files that do not exist in one of the three trees.
- Requiring the wrong file for what is used (the `security_crypto.php` vs `auth.php` case).
- A `public/` file whose required sibling is missing from the root mirror or `dist/`
  (`npm run sync:backend` should handle this. Verify that it did.)

### C. PHP: redeclaration when the same code is loaded from two paths

Every PHP file that declares functions or classes and can be loaded by more than one entry
point must be wrapped in a `function_exists` / `class_exists` guard (see `schema.php` and
`employee_name.php`). Pay attention to the `ccrm` CLI, which loads `api/` and `dist/api/` in
one process. List every unguarded declaring file and decide case by case.

### D. PHP: files that do not parse, and `require_once` caching a failed compile

- `php -l` **every** PHP file in `public/` (and the `ccrm` script) in the dev container.
  Watch for broken string concatenation inside SQL, heredoc terminators and PHP 8.2-only
  syntax.
- Find any `require_once` of a file that a long-running process (the `ccrm` CLI) may load
  before **and** after a deploy step. `c2e6facb` switched one to `include` for that reason.

### E. PHP: globals and implicit state

Functions that read `$pdo`, `$config`, `$user`, `$GLOBALS[...]` or a `global $x` that only one
entry point sets. Constants from `config.php` used in a file that never requires the config
loader. Session or auth state assumed but never established (`ccrm_require_auth` or similar
not called).

### F. SQL: names the running database may not have

- Every column written or read in `sync.php` and the `api/*.php` endpoints must exist in
  `CREATE TABLE` in `schema.php` **or** in a migration. Every column `sync.php` writes must
  also be healed before `beginTransaction()` (the 4-place rule in
  `.agents/rules/database-schema-and-sync.md`).
- Columns or tables referenced that exist nowhere (the `orders.php` guest-conversion case).
- Migration order: `ALTER`/`INSERT` on a table before the migration that creates it.
- DDL (`CREATE`, `ALTER`, `DROP`, `TRUNCATE`, even `IF NOT EXISTS`) reachable inside an open
  transaction.

### G. Frontend: identifiers that are undefined at runtime

- `npm run typecheck` must be clean. Then find what it **cannot** see: files excluded from
  `tsconfig.app.json`, `// @ts-nocheck`, `@ts-ignore`/`@ts-expect-error` hiding a missing
  name, `any`-typed `window.*` globals, `declare` statements with no implementation, and
  `.js`/`.mjs` files that are not type-checked.
- Lazy imports: every `lazy(() => import('./X'))` and `import('./X').then(m => m.Y)` must
  point at an export that exists under that name (a default vs named mismatch is a runtime
  failure).
- Identifiers used inside template literals, JSX and callbacks that only run in a rare
  branch: run typecheck once, but also grep for names that look renamed (old helper names
  from `git log -S`, e.g. `formatDateDisplay`, `brand`).
- Module-scope reads of values that are not yet initialised (circular imports, the
  `VERSION_CODENAME` note in `src/utils/version.ts`).

### H. Anything else with the same shape

If you find a bug that fits "defined on some paths, used on all of them" but none of the
classes above, add it as a new class in the report. This list is a starting point, not a
complete one.

## How to work

1. **Build a scanner, do not eyeball.** There are about 100 files in `public/api` and
   `sync.php` alone is about 7,000 lines. Write the PHP symbol and require analysis
   (classes A–C, and F where it can be automated) as a re-runnable script under `scripts/`
   (suggested: `scripts/audit-undefined-symbols.mjs`). You can use PHP's own tokenizer
   (`token_get_all`, in the dev container) for accuracy, or nikic/php-parser if it is
   available. Structure it so the part 2 guard test can import or reuse its core logic: a
   function that takes file contents and returns findings, separate from the CLI wrapper.
2. **Lint PHP in the dev container** (no PHP on the host). From Git Bash:
   `MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/public:/app" php:8.2-cli php -l /app/<file>`
   (without `MSYS_NO_PATHCONV` the path gets mangled).
3. **Confirm every finding against the code.** A scanner hit is a hypothesis. Rule out false
   positives: a definition in the same file, a guarded definition, or a call inside a
   `function_exists()` check that has a fallback. Read the call site and decide.
4. **Work out the fix for every confirmed finding, but do not apply it.** For each one, check
   whether the obvious fix (a top-level `require_once`) is actually safe:
   - Would it create a require cycle?
   - Does the target file have side effects at top level (headers, output, `exit`, DB
     connection, session start)?
   - Is it declared without a guard, so that loading it from a second path would cause
     `Cannot redeclare`?
   If the obvious fix is not safe, specify the real one (guard the file first, extract the
   function into a side-effect-free library, …).
5. **Prove the scanner works.** Run it at `80a0a76c~1` (or on a fixture copied from that
   revision) and show it flags `ccrm_employee_file_key` in `sync.php`. Do the same for
   `ed884d4a~1` and `ccrm_sql_real_tasks`. Put the output in the report.

## Deliverable: `docs/audits/undefined-symbol-audit.md`

Part 2 works only from this file, so it must stand on its own:

1. **Entry-point list.**
2. **Summary table:** class, files scanned, raw hits, confirmed, false positives.
3. **Confirmed findings, grouped by root cause.** Give each one an ID (`A-01`, `F-03`, …) and:
   - `file:line` of the use, and of the definition.
   - Observed symptom: what the user would see, on which screen or in which flow, and when
     (always, only after deploy, only via cron, …).
   - Root cause.
   - **Exact fix**: the file to edit, the line to add or the change to make, and in what order
     if fixes depend on each other (for example "guard `x.php` (C-02) before adding the
     require in A-05").
   - Confidence: `certain` / `needs judgement`. Explain every `needs judgement` item, and
     say what would decide it.
4. **False positives**, each with the reason, so that the guard test can filter them.
5. **Proposed guard-test rules:** which checks are reliable enough to fail CI, and which
   produce too much noise to enforce. Include the allowlist of known-safe patterns.
6. **Out of scope / deferred:** anything that would change behaviour, needs a product
   decision or needs a real database to verify.
7. **Scanner usage:** how to run it and what its output looks like.

## Constraints

- **Read-only on the app.** The only files you create are the scanner under `scripts/` and
  the report. Do not edit `public/`, `src/`, the mirrors or `dist/`.
- Do not commit. Part 2 commits the scanner, the report and the fixes together, under one
  version bump.
- Other sessions may be working in this same checkout. Never `git stash`, `git reset` or
  `git checkout --` anything.
- Do not touch production or any real database. All checks are static or in the dev
  container.
- When done, reply with the summary table and the list of `needs judgement` items.
