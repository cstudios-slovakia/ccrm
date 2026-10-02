# Automated release notes

When a new CCRM version reaches `main`, a Claude Code **cloud routine** decides
whether users would notice anything, captures annotated screenshots in Slovak,
English and Hungarian, writes the article, and publishes it to the
`updateNotes` section in Craft CMS — the place the in-app **Novinky** screen
reads from (`.agents/rules/news-craft-cms.md`). Nothing runs on anyone's PC.

```
Triggers: PR merged into main  +  daily 07:07 (catches direct pushes)
  └─ cloud routine "CCRM release notes" — fresh clone of main, 4 vCPU / 16 GB
       1. detect.mjs        new version since the last handled one?   no → reply one line, end
       2. npm ci
       3. the ccrm-release-notes skill: classification.json, screenshots (sk/en/hu), article.json
       4. publish.mjs       re-validates, then screenshots → Craft assets, article → entry
       5. finish.mjs        baseline moves on; a failure is counted (3 strikes → waits for you)
State ("last handled release") lives in Craft: storage/ccrm-news/state.json via /ccrm-news/state
```

## What gets written

| Version jump | Kind | Craft `version` | Article |
|---|---|---|---|
| 1.11.x → 1.12.y (new fruit) | `major` | `1.12` | Full feature article: intro, "New features" with one section per feature (screenshots, gallery, where-to-find callout), improvements list, fixes list |
| 1.11.140 → 1.11.143 | `patch` | `1.11.143` | Only if something is user-visible: same style, shorter. Polish, refactors, backend and tooling alone → no article |
| new commits, same version | — | — | Not a release; picked up with the next bump |

The rubric — what counts as a feature, an improvement, a fix, and what is
excluded — is in
[`.agents/skills/ccrm-release-notes/SKILL.md`](../.agents/skills/ccrm-release-notes/SKILL.md),
calibrated on real commits from this repository. The routine's procedure is the
skill's **Routine run** section, so changing the procedure is a commit, not an
edit in the routine's settings.

## Screenshots

`tests/release-notes/shotkit.ts` is the only way the agent takes a picture, so
every article has the same look:

- `shotView` — the whole window, for a new screen.
- `shotZoom` — a crop around a small element (dropdown, card, toolbar), at 2× so it stays sharp in the lightbox.
- `marks` — numbered rose-coloured boxes with label pills; the article text explains them as (1), (2) ….
- `spotlight` — dims everything except the marked elements, for "where do I find it".

The style lives in one constant (`ANNOTATION_STYLE`). Try the kit locally:

```bash
node scripts/release-notes/shoot.mjs --spec example.spec.ts --out test-results/release-shots
```

## Setting it up

### 1. Craft CMS content model

Already in the project config (2026-10-02): the dropdowns `headingLevel`,
`galleryColumns`, `calloutType`, `listType`, `releaseType`, the `images` Assets
field, and three reusable plain-text fields — `textfield`, `textfieldMultiline`,
`textfieldNotTranslatable`.

A reusable field gets its meaning from the **handle override** in each layout
(Craft 5: click the field in the layout designer → *Handle*). The module, the
validator and the app's GraphQL query all use these layout handles:

| Entry type (in `contentMatrix`) | Fields — layout handle ← field |
|---|---|
| `heading` | **Title** (the heading text) · `headingLevel` · `moduleTag` ← textfield |
| `gallery` | `images` · `galleryColumns` |
| `callout` | `calloutType` · `text` ← ckeditorExtended |
| `changeList` | `listType` · **Title** (the list heading, required) · `listItems` ← textfieldMultiline |
| `news` (the article) | add `releaseType` and `sourceCommit` ← textfieldNotTranslatable — optional |

`heading` and `changeList` keep their text in the block's own Title (*Use a
title field* on, per site); the module writes `headingText` there and the app
reads `title`. `gallery` and `callout` have no title field. All four are in
`contentMatrix`'s entry types. Then check **GraphQL → Schemas → Public**: the four new entry types and
the `images` volume must be readable, or the app keeps falling back to the old
three blocks. If the news section is also rendered by the public Craft site,
its templates need the four new blocks too.

Translation is already right: `textfield`, `textfieldMultiline`,
`ckeditorExtended` and `image` are per language, `images` per site, the `news`
title per site. Existing articles show Slovak on the en/hu sites only because
they were never translated.

### 2. The Craft module

See [`release-notes/craft-module/INSTALL.md`](release-notes/craft-module/INSTALL.md).

### 3. The cloud routine

**a) Cloud environment** — at [claude.ai/code](https://claude.ai/code), environment selector → *Add cloud environment*, name `ccrm-release-notes`:

| Setting | Value |
|---|---|
| Network access | **Custom**, *Also include default list of common package managers* checked, plus: `archive.ubuntu.com`, `security.ubuntu.com`, `cdn.playwright.dev`, `playwright.download.prss.microsoft.com`, `playwright.azureedge.net` |
| Environment variables | `RELEASE_NOTES_PUBLISH=draft` (→ `live` once articles look right)<br>`BASH_DEFAULT_TIMEOUT_MS=600000` (npm ci and screenshot runs exceed the 2-minute default) |
| Setup script | `npx -y playwright@1.62.1 install --with-deps chromium \|\| true` — keep the version equal to `@playwright/test` in package.json |

Save, reopen the environment for editing, then **API credentials → Add credential**:

| Field | Value |
|---|---|
| Name | `CCRM news` |
| Credential type | Bearer |
| Allowed websites | `ccrm.softwaresolutions.sk` |
| Custom headers | Name `X-CCRM-News-Token`, **Prefix empty**, Value = the `CCRM_NEWS_API_TOKEN` from Craft's `.env` |

Not `Authorization: Bearer` — Craft's GraphQL on the same host would read it as
a GraphQL token and reject the public queries. The routine never sees the token.

**b) The routine** — [claude.ai/code/routines](https://claude.ai/code/routines) → *New routine*:

| Setting | Value |
|---|---|
| Name | CCRM release notes |
| Repository | `cstudios-slovakia/ccrm` |
| Environment | `ccrm-release-notes` |
| Model | Opus |
| Connectors | remove all — it needs none |
| Trigger 1 | GitHub event: Pull request → closed; filters *Is merged* = true, *Base branch* = `main` (needs the Claude GitHub App on the repo) |
| Trigger 2 | Schedule: daily 07:07 — catches commits pushed to `main` without a PR |

Prompt:

```
Release-notes run for CCRM. Follow the "Routine run" section of
.agents/skills/ccrm-release-notes/SKILL.md exactly, from step 1. You run
unattended: never ask, decide by the skill's rules. Do not commit, push or open
pull requests.
```

**c) Baseline** — once, after the module is installed, from a PC with
`CRAFT_NEWS_TOKEN` in `.release-notes/.env`:

```bash
node scripts/release-notes/publish.mjs --check                        # module answers, nothing missing
node scripts/release-notes/detect.mjs --init --baseline 4850bf8      # releases after 1.11.143 get announced
```

`4850bf8` is the merge that brought 1.11.143 to `main`; the published 1.11
article already covers it.

## Running it

- **Now**: the routine's page → *Run now*.
- **What happened**: every run is a session in your Claude Code session list.
  A run with nothing new ends after one line. A release run ends with the
  report and the Craft edit link. The green status only means the session
  ended cleanly — read the transcript for the outcome.
- **Drafts**: with `RELEASE_NOTES_PUBLISH=draft` the entry is saved disabled;
  enable it in the Craft CP.
- **After three failures** on one commit the routine stops retrying and says so.
  Fix the cause, then run `node scripts/release-notes/detect.mjs --force` once
  (by hand, or tell the routine via *Run now* text).
- **Unhappy with a published article**: edit it in the Craft CP. The pipeline
  never touches an entry again once its version is handled.
- **Skip a release on purpose**: run `finish.mjs <runDir> --outcome skipped`
  in that run's session.
- **By hand on a PC**: `.release-notes/.env` from
  `scripts/release-notes/release-notes.env.example`, add
  `RELEASE_NOTES_STATE=file` to keep the baseline local instead of in Craft,
  then follow the skill's Routine run yourself.

Usage: runs count against your Claude subscription. A "nothing new" run is a
few cheap steps; a major article with ~20 screenshots in three languages is a
long session.

## Files

| File | Role |
|---|---|
| `.agents/skills/ccrm-release-notes/SKILL.md` | The routine's procedure, the significance rubric, the article contract and style |
| `scripts/release-notes/detect.mjs` | Version jump, commit range, changelog sections → run directory |
| `scripts/release-notes/shoot.mjs` | Runs a screenshot spec in sk, en, hu |
| `scripts/release-notes/validate.mjs` | Article contract and editorial rules |
| `scripts/release-notes/publish.mjs` | Gate + upload to Craft; `--check`, `--dry-run` |
| `scripts/release-notes/finish.mjs` | Records the outcome |
| `scripts/release-notes/lib.mjs` | Versions, git, state (Craft or file), the module client |
| `tests/release-notes/shotkit.ts`, `example.spec.ts` | Screenshot kit and its reference spec |
| `playwright.release-notes.config.ts` | Port 5473, 1440×900 @2×, one project per language |
| `docs/release-notes/craft-module/` | The Craft module and its install guide |
| `src/utils/updateNotes.ts`, `src/components/UpdateNoteBlocks.tsx` | The app side: one query with fallback, one renderer for all block types |
