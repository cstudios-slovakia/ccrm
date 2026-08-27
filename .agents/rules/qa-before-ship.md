---
description: Run the QA audit when a feature or fix is finished, before committing the build
---

# Test Before You Ship

Full guide: [`docs/TESTING.md`](../../docs/TESTING.md).

## 1. The rule

When a feature, fix or UI change is **finished**, run the audit before the
version bump and the build commit:

```bash
npm run test:unit     # seconds
npm run test:qa       # minutes - drives the real app in a browser
```

This slots into the existing protocol from
[`commit-and-versioning.md`](./commit-and-versioning.md) as the step before it:

> test -> bump `src/utils/version.ts` -> changelog entry -> build -> commit

Nothing here needs Docker, PHP or a database. The suite mocks `/sync.php`,
`/api/*` and `/upload.php` and seeds its own data, so it never touches a real
backend and is safe to run at any time.

## 2. During development, not just at the end

| You changed | Run |
|---|---|
| Pure logic in `src/utils` | `npm run test:unit` |
| One module's UI | `npm run test:qa:crawler` |
| Sidebar, header or routing | `npm run test:qa:nav` |
| The QA suite itself | `npm run test:qa:canary` |

## 3. It also runs without you

- `npm run deploy` runs the gate first and **aborts the deploy** if it fails.
  `DEPLOY_SKIP_QA=1` is the hotfix escape hatch — it means shipping unverified.
- GitHub Actions (`.github/workflows/qa.yml`) runs it on every push and PR.

CI runs the same npm scripts, so a red build always reproduces locally with one
command.

## 4. Reading the result

The verdict prints in the terminal as soon as the run ends. Every run is saved
whole under `test-results/runs/<timestamp>-<kind>/` — report, findings JSON and
that run's screenshots together — with the latest also at
`test-results/qa-audit-report.md`.

```bash
npm run test:qa:report              # open the latest report
npm run test:qa:report -- --list    # what runs are saved and what they found
```

## 5. Do not game the suite

- Never make a finding disappear by loosening the check.
- `npm run test:qa:canary` **passes when it still detects** two known product
  bugs (`Čas termínu` occlusion, client timeline `?tab=` parser). If either is
  genuinely fixed, delete that canary rather than weakening it.
- `INTERACTION_FAILED` at LOW, `VIEW_RENDERED_EMPTY` on a register, and
  `node_modules` throws (`shadergradient`) are usually suite gaps or third-party
  noise, not product defects.
