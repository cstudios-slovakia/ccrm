# Automated release notes

Twice a day this PC checks `origin/main` for a new CCRM version. When there is
one, an AI agent decides whether users would notice anything, captures annotated
screenshots in Slovak, English and Hungarian, writes the article, and the
pipeline publishes it to the `updateNotes` section in Craft CMS — the same place
the in-app **Novinky** screen reads from (`.agents/rules/news-craft-cms.md`).

```
Task Scheduler 09:00 / 15:00
  └─ .release-notes/run.ps1
       1. git fetch; origin/main → .claude/worktrees/release-notes (detached; your checkout is untouched)
       2. detect.mjs        new version since the last handled one?   no → stop (no AI, no cost)
       3. claude -p         skill .agents/skills/ccrm-release-notes   classification.json, shots, article.json
       4. validate.mjs      the gate — nothing unvalidated reaches Craft
       5. publish.mjs       screenshots → Craft assets, article → entry  (ccrm-news module)
       6. finish.mjs        baseline moves on; a failure is counted (3 strikes → stops and waits for you)
```

## What gets written

| Version jump | Kind | Craft `version` | Article |
|---|---|---|---|
| 1.11.x → 1.12.y (new fruit) | `major` | `1.12` | Full feature article: intro, "New features" with one section per feature (screenshots, gallery, where-to-find callout), improvements list, fixes list |
| 1.11.140 → 1.11.143 | `patch` | `1.11.143` | Only if something is user-visible: same style, shorter. Polish, refactors, backend and tooling alone → no article |
| new commits, same version | — | — | Not a release; picked up with the next bump |

The rubric the agent follows — what counts as a feature, an improvement, a fix,
and the long list of what is excluded — is in
[`.agents/skills/ccrm-release-notes/SKILL.md`](../.agents/skills/ccrm-release-notes/SKILL.md),
calibrated on real commits from this repository. Every run leaves its reasoning
in `.release-notes/runs/<time>-<version>/classification.json` and `report.md`.

## Screenshots

`tests/release-notes/shotkit.ts` is the only way the agent takes a picture, so
every article has the same look:

- `shotView` — the whole window, for a new screen.
- `shotZoom` — a crop around a small element (dropdown, card, toolbar), at 2× so it stays sharp in the lightbox.
- `marks` — numbered rose-coloured boxes with label pills; the article text explains them as (1), (2) ….
- `spotlight` — dims everything except the marked elements, for "where do I find it".

The style lives in one constant (`ANNOTATION_STYLE`). Try the kit:

```bash
node scripts/release-notes/shoot.mjs --spec example.spec.ts --out test-results/release-shots
```

## Setting it up

### 1. Craft CMS changes

Do these in the Craft control panel of `ccrm.softwaresolutions.sk`. Handles must
match exactly — the app's GraphQL query and the module use them.

**a) New fields** (Settings → Fields). "Per site" = *Translation method: Translate for each site*.

| Handle | Type | Settings |
|---|---|---|
| `headingText` | Plain Text | single line, per site |
| `headingLevel` | Dropdown | options `h2` "Section", `h3` "Feature" (default `h2`) |
| `moduleTag` | Plain Text | single line, per site; optional |
| `images` | Assets | volume `images`, images only, max 12, **Manage relations on a per-site basis: on** |
| `galleryColumns` | Dropdown | options `2` (default), `3` |
| `calloutType` | Dropdown | options `where` "Where to find it", `tip`, `info`, `warning` |
| `listType` | Dropdown | options `fixes` (default), `improvements` |
| `listItems` | Plain Text | **multi-line**, per site; one item per line |
| `releaseType` | Dropdown | options `major`, `patch` — optional, for filtering in the CP |
| `sourceCommit` | Plain Text | optional, traceability; can be hidden in the layout |

**b) New entry types in the `contentMatrix` field** (Settings → Fields → contentMatrix → Entry Types → New). Title field off.

| Entry type handle | Fields in its layout |
|---|---|
| `heading` | `headingText`, `headingLevel`, `moduleTag` |
| `gallery` | `images`, `galleryColumns` |
| `callout` | `calloutType`, `text` (the existing CKEditor field) |
| `changeList` | `listType`, `headingText`, `listItems` |

**c) Changes to what exists**

| Where | Change | Why |
|---|---|---|
| `news` entry type | Add `releaseType` and `sourceCommit` to the field layout | Optional metadata |
| `news` entry type | **Title translation method: Translate for each site** | Today the title is shared, so en/hu readers see the Slovak title |
| Field `text` (CKEditor) | **Translation method: Translate for each site** | Today en/hu show the Slovak text. Existing articles keep their text on every site — only new edits diverge |
| Field `image` (Assets) | **Manage relations on a per-site basis: on** | Lets each language show screenshots of the app in that language |
| Section `updateNotes` | Confirm sites `default`, `en`, `hu` are enabled | The publisher fills all three |
| GraphQL → Schemas → Public | Confirm `updateNotes` and the `images` volume are readable after the new entry types exist | The app reads the new blocks through the public schema |
| Craft website templates (if the news section is also rendered on the public site) | Render the four new block types | Otherwise they are invisible there; the CCRM app already renders them |

Until (c) is done the pipeline still works: the module reports which fields are
not translatable, writes the Slovak values, and never overwrites them with
English. Until (a)/(b) are done the app keeps working too — it falls back to the
old three block types when Craft rejects the new ones.

**d) Install the module** — `docs/release-notes/craft-module/ccrmnews/` →
`modules/ccrmnews/` in the Craft project. Register it in `config/app.php`:

```php
return [
    'modules'   => [
        'ccrm-license' => \modules\ccrmlicense\CcrmLicense::class,
        'ccrm-news'    => \modules\ccrmnews\CcrmNews::class,
    ],
    'bootstrap' => ['ccrm-license', 'ccrm-news'],
];
```

and add to Craft's `.env`:

```
CCRM_NEWS_API_TOKEN="<48 random characters>"
CCRM_NEWS_VOLUME="images"
CCRM_NEWS_AUTHOR_ID="1"
```

The module has three token-protected routes: `GET /ccrm-news/ping`,
`POST /ccrm-news/asset`, `POST /ccrm-news/publish`. It is idempotent per
version — re-publishing `1.11.150` replaces that entry instead of creating a
second one. Screenshots go to `images/release-notes/<version>/`.

> Like the licence module, it is written against the Craft 5 API but has not
> been run against the live install. That is why the first articles go out as
> **drafts** (below).

### 2. This PC

```powershell
pwsh -File scripts\release-notes\install-schedule.ps1      # task "CCRM Release Notes", 09:00 and 15:00
notepad .release-notes\.env                                 # CRAFT_NEWS_TOKEN = the same token
node scripts/release-notes/publish.mjs --check              # Craft answers and nothing is missing
```

`.release-notes/.env`:

| Key | Meaning |
|---|---|
| `CRAFT_NEWS_BASE` | `https://ccrm.softwaresolutions.sk` |
| `CRAFT_NEWS_TOKEN` | Same as `CCRM_NEWS_API_TOKEN` in Craft |
| `RELEASE_NOTES_PUBLISH` | `draft` (entry saved disabled — review and enable in the CP) or `live` |
| `RELEASE_NOTES_MODEL` | `opus` by default |

The baseline is already set: releases after **1.11.143** (`4850bf8`, covered by
the published 1.11 article) are announced. To change it:
`node scripts/release-notes/detect.mjs --init --baseline <sha>`.

**The tooling runs from `origin/main`.** Until this branch is merged there, a
run logs "tooling not on main yet" and stops.

Requirements: the PC is on and you are logged in at the scheduled time (missed
runs catch up at next logon); `claude` is logged in; Playwright's Chromium is
installed (`npm run test:qa:setup`).

## Running it

```powershell
Start-ScheduledTask -TaskName 'CCRM Release Notes'           # now
pwsh -File .release-notes\run.ps1 -Repo (Get-Location) -DryRun   # everything except the upload
pwsh -File .release-notes\run.ps1 -Repo (Get-Location) -Force    # retry after 3 failures
```

Where to look:

| Path | Contents |
|---|---|
| `.release-notes/logs/<date>.log` | Every run, one line per step |
| `.release-notes/runs/<time>-<version>/` | `context.md`, `classification.json`, `report.md`, `article.json`, `shots/<lang>/`, `claude.log`, `publish-payload.json`, `publish.json` |
| `.release-notes/state.json` | Last handled commit and version, failure counts, history |

Desktop toasts appear when the BurntToast module is installed
(`Install-Module BurntToast -Scope CurrentUser`).

### Changing or redoing an article

- **Unhappy with a published one**: edit it in the Craft CP — the pipeline never
  touches an entry again once its version is handled.
- **Regenerate**: re-run the agent on the same run directory by hand (open
  Claude Code in the worktree and ask it to follow the skill for that
  `RUN_DIR`), then `node scripts/release-notes/publish.mjs <runDir>` — it
  updates the same entry.
- **Skip a release on purpose**: `node scripts/release-notes/finish.mjs <runDir> --outcome skipped`.

## Files

| File | Role |
|---|---|
| `scripts/release-notes/run.ps1` | Scheduled entry point (copied to `.release-notes/`) |
| `scripts/release-notes/install-schedule.ps1` | Registers / removes the Windows task |
| `scripts/release-notes/detect.mjs` | Version jump, commit range, changelog sections → run directory |
| `scripts/release-notes/shoot.mjs` | Runs a screenshot spec in sk, en, hu |
| `scripts/release-notes/validate.mjs` | Article contract and editorial rules |
| `scripts/release-notes/publish.mjs` | Uploads to Craft; `--check`, `--dry-run` |
| `scripts/release-notes/finish.mjs` | Records the outcome |
| `.agents/skills/ccrm-release-notes/SKILL.md` | The agent's instructions and the significance rubric |
| `tests/release-notes/shotkit.ts`, `example.spec.ts` | Screenshot kit and its reference spec |
| `playwright.release-notes.config.ts` | Port 5473, 1440×900 @2×, one project per language |
| `docs/release-notes/craft-module/ccrmnews/` | The Craft module |
| `src/utils/updateNotes.ts`, `src/components/UpdateNoteBlocks.tsx` | The app side: one query with fallback, one renderer for all block types |
