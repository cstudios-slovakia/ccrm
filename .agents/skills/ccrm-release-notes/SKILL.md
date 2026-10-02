---
name: ccrm-release-notes
description: Writes the "What's new" article for a new CCRM version from the commits on main — decides whether the release is worth announcing, captures annotated screenshots in sk/en/hu, and produces article.json for the Craft CMS publisher. Runs unattended from scripts/release-notes/run.ps1; can also be run by hand on a prepared run directory.
---

# CCRM release notes

You write the article CCRM users read in **Novinky** (the Updates screen) after
an update. Users are office staff and managers of small companies — roofers,
builders, traders. They are not developers. They want to know three things:
*what can I do now that I couldn't before, where do I find it, and what stopped
being broken.*

You are running **unattended**. Nobody will answer a question. When something
is ambiguous, decide using the rules below and write your reasoning into
`classification.json` / `report.md`. Never stop to ask.

## Hard rules

- **You do not publish.** The runner publishes `article.json` after you exit, if
  `validate.mjs` passes. You never call Craft, never `curl`, never `git commit`,
  `git push`, `npm install`, or change anything under `src/`, `api/`, `public/`.
- **Write only** into the run directory (`$RUN_DIR`, given in your prompt) and
  `tests/release-notes/generated/`.
- **One plain command per Bash call** — no `cd`, `&&`, pipes or redirects. The
  unattended run allows exactly these shapes and refuses everything else:
  `git log …`, `git show …`, `git diff …`, `git rev-parse …`, `ls …`,
  `node scripts/release-notes/shoot.mjs …`, `node scripts/release-notes/validate.mjs …`.
  Use Read, Glob and Grep for files.
- **Every commit in the range is accounted for** in `classification.json` —
  either in an announced item or as an excluded one with a reason.
- **Never invent.** Every sentence in the article must be backed by the diff, the
  changelog, or what you saw on a screenshot. If you can't confirm a feature
  works the way the changelog says, describe less, not more.
- **Stay within budget**: at most 8 runs of `shoot.mjs`. If a screen still can't
  be captured, describe that item without a picture in an `improvements` list
  and say so in `report.md`.

## Inputs

| File | What it is |
|---|---|
| `$RUN_DIR/context.md` | Start here. Version jump, kind (major/patch), changelog sections in range, merges, every commit with touched files and a first-guess hint |
| `$RUN_DIR/context.json` | Same, machine-readable. `craftVersion` is the version string the article must carry |
| `*-changelog.md` (repo root) | The authors' own per-build notes. Best summary, but it overstates — verify in the diff |
| `git show <sha>`, `git show --stat <sha>`, `git diff <base>..<head> -- <path>` | The truth |

## Outputs

| File | When |
|---|---|
| `$RUN_DIR/classification.json` | Always |
| `tests/release-notes/generated/<craftVersion with dashes>.spec.ts` | When publishing |
| `$RUN_DIR/shots/<lang>/*.png` (written by `shoot.mjs`) | When publishing |
| `$RUN_DIR/article.json` | When publishing |
| `$RUN_DIR/report.md` | Always — 10–30 lines: decision, what's in the article, anything you dropped and why |

## Workflow

1. **Read** `context.md`, then for every commit at least `git show --stat <sha>`.
   For anything that might be user-visible read the actual diff of `src/`
   (components, `utils/translations*`, `App.tsx` routes). Backend-only commits
   (`api/`, `*.php`) matter only if they change what a user sees.
2. **Classify** every commit with the rubric below. Group commits that deliver
   one thing into one item. Write `classification.json`.
3. **Decide.** `publish` if at least one item is a `feature`, `improvement` or
   `fix`; otherwise `skip`. On `skip`: write `report.md`, run
   `node scripts/release-notes/validate.mjs $RUN_DIR`, and stop.
4. **Plan the article** (structure below): which features get their own section,
   in which order (most useful first), which screens and states each needs, how
   a user reaches each one.
5. **Find your way in the UI.** Routes are hash-based (`#tasks`, `#leads`,
   `#projects/<id>`, `#financial`, `#settings`, `#personal-settings`, `#employees`,
   `#dashboard`, `#overview`, … — see the router in `src/App.tsx`). Labels live in
   `t("English", "Slovensky", "Magyarul")` calls: grep the English text to get
   the exact Slovak and Hungarian wording, both for locators and for the article.
   The demo company (Rekonstav s.r.o., `tests/demo/demoData.ts`) supplies data;
   if a feature needs data it doesn't have, add it in the spec via `patchSync`.
6. **Write the spec** `tests/release-notes/generated/<slug>.spec.ts` using only
   the kit in `tests/release-notes/shotkit.ts` (copy the shape of
   `tests/release-notes/example.spec.ts`). Iterate fast with one language:
   ```bash
   node scripts/release-notes/shoot.mjs --spec generated/<slug>.spec.ts --out $RUN_DIR/shots --langs sk
   node scripts/release-notes/shoot.mjs --spec generated/<slug>.spec.ts --out $RUN_DIR/shots --langs sk --grep "finance"
   ```
   then the final run in all three languages (omit `--langs`).
7. **Look at every screenshot** with the Read tool — in Slovak, and spot-check
   English and Hungarian. Reject and redo a shot that shows a spinner, an empty
   state where data was expected, an error toast, a cut-off dropdown, a mark
   pointing at the wrong element, or Slovak text in the en/hu shot where the app
   has a translation.
8. **Write `article.json`** in the contract below, all three languages.
9. **Validate** until it passes:
   `node scripts/release-notes/validate.mjs $RUN_DIR`
10. **Write `report.md`.**

## Is it worth announcing? — the rubric

Ask of every change: **"Can a user now *do* something they couldn't, or does
something now *happen* differently or correctly — or does it only *look*
different?"** Only the first two are announced.

### Categories

| Category | Meaning | Goes into the article as |
|---|---|---|
| `feature` | A new capability the user can see and use: a new module, screen, tab, view, panel, setting or option, action or button that does something new, new report, widget, export, integration, AI capability | Its own section with screenshots |
| `improvement` | An existing capability now *works* differently and better: fewer steps, a new filter or sort, more information that answers a real question, smarter defaults, a picker that hides irrelevant records, functional mobile behaviour, admin-visible permission options | Its own section if it changes how a screen is used; otherwise one line in the *improvements* list |
| `fix` | Something users could hit in a **previously released** version behaved wrongly and no longer does: wrong numbers, data not saved or lost, a blank screen or crash, items missing from lists, wrong language, a page unusable on phones, a notification that never arrived | One line in the *fixes* list |
| `excluded` | Everything else — give `excludedBecause` | Not mentioned |

### `excludedBecause` vocabulary

| Value | Typical changes |
|---|---|
| `visual-polish` | Colours, fonts, sizes, spacing, shadows, icons, animations, dark-mode tweaks; buttons moved, reordered or regrouped; headers, cards or titles restyled; renamed labels and copy edits; a screen rebuilt on new layout components that does the same job |
| `backend-invisible` | Server/PHP/SQL changes, migrations, sync and storage internals, caching, performance nobody would notice, security hardening with no visible behaviour change |
| `dev-tooling` | Tests, QA suite, demo/screenshot tooling, scripts, lint, dev-only pages (`#ui-gallery`), agent rules |
| `refactor` | Code moved, shared helpers extracted, types changed — same behaviour |
| `docs` | Markdown, docs, changelog edits |
| `build` | Version bumps, `dist/` bundles, merge commits |
| `admin-ops` | Things only the person hosting CCRM sees: `php ccrm update` messages, Docker, deploy, licence server setup |
| `revert` | Reverted, or reverted later in the same range |
| `already-announced` | Already in a published article (`context.json` → `publishedVersions`), and this commit adds nothing new to it |
| `not-shipped` | Behind a disabled flag (`…_ENABLED = false`), unreachable from the UI, or a bug introduced *and* fixed inside this same range — users never saw it |

### Tie-breakers

- **The commit prefix is a hint, not the answer.** `feat(ui)` is often polish;
  `fix(...)` is often a fix to tooling. Read the diff.
- **Visual, but changes what the user can do → include.** A new navigation dock
  whose module order users can customise, or a View size setting (Auto /
  Compact / Normal / Big), is a `feature` because there is a new control. The
  same commit's token and spacing work is `visual-polish`.
- **A backend commit with a visible effect is included** for that effect only:
  "archived leads no longer appear in search" (`api/universal_search.php`) is an
  `improvement`.
- **A layout bug is a `fix` only if something was unusable or unreachable**
  (content cut off, page sliding sideways on a phone, a button off-screen).
  Misalignment or uneven spacing is `visual-polish`.
- **When the changelog and the diff disagree, the diff wins.** When the diff is
  too large to judge, open the screen in a spec and look.
- **MCP / API tools for AI assistants** are an `improvement` if a user can turn
  them on from Settings; otherwise `backend-invisible`.
- **Patch decision:** publish if at least one item is announced — a single real
  bug fix is enough. A range of polish, refactors and tooling is `skip`, however
  many commits it has.

### Calibration — real commits from this repository

| Commit | Verdict |
|---|---|
| `feat(projects): still-to-be-paid breakdown, status equation widget, client picker groups, employees` | 2 × `feature` (still-to-be-paid with *Edit remaining*; status equation widget) + `improvement` (grouped Client/Lead picker) |
| `fix: "Mark remaining as paid" booked a partially paid invoice twice` (part of 1.11.140) | `fix` — wrong money, users could hit it |
| `feat(tasks): quick add-task modal, lead picker hides dealt-with leads, archived leads hidden` | `feature` (quick add-task) + `improvement` (picker) + `improvement` (archived leads hidden) |
| `feat(tasks): inline quick task panel on the Tasks page` | `improvement` — same panel, now opens in place |
| `Finance: Simplified Operating Mode with spreadsheet cell editing` | `feature`, several views → gallery (Settings toggle, editing a cell, formula cell, cash-flow chart) |
| `feat(ui): view size - tokens everywhere, layout primitives, setting enabled` | `feature` (the View size setting) — the token work in it is not mentioned |
| `feat(ui): view size foundation … hidden behind VIEW_SIZE_ENABLED = false` | `excluded`, `not-shipped` |
| `UI: prominent large entity titles at the top of all detail views` | `excluded`, `visual-polish` |
| `feat(ui): remaining headers, tabs and KPI strips on the layout primitives` | `excluded`, `visual-polish` |
| `fix(ui): phone horizontal overflow on Dashboard, Meetings, Financial` | `fix` — the page slid sideways on phones |
| `feat(dev): UI gallery of the layout primitives at /#ui-gallery` | `excluded`, `dev-tooling` |
| `fix(update): stop CCRM_DEPLOY_BRANCH warning advising a non-persistent unset` | `excluded`, `admin-ops` |
| `chore(docker): make vector_db host port configurable` | `excluded`, `admin-ops` |
| `build: publish production bundle (v1.11.138-Lemon)` | `excluded`, `build` |

### `classification.json`

```json
{
  "kind": "patch",
  "decision": "publish",
  "reason": "One new finance feature and two fixes users could hit; the rest is polish and tooling.",
  "items": [
    {
      "title": "Finance: simplified mode with spreadsheet editing",
      "category": "feature",
      "commits": ["a1b2c3d", "e4f5a6b"],
      "module": "Financie",
      "evidence": "FinancialManagementView.tsx adds click-to-edit cells and the mode switch; Settings → Finance gets the toggle (changelog v1.11.141)."
    },
    {
      "title": "Large titles on detail views",
      "category": "excluded",
      "excludedBecause": "visual-polish",
      "commits": ["0a1b2c3"],
      "evidence": "Only class names changed in five detail headers."
    }
  ]
}
```

Short SHAs (7+ characters) are fine. `kind` must equal `context.json` → `kind`.

## Screenshots

All capture goes through `tests/release-notes/shotkit.ts`. **Never call
`page.screenshot()` yourself, and never draw your own markings** — the kit's
style is the house style and must stay identical across articles.

| Situation | Use |
|---|---|
| A new screen, page, tab or full drawer | `shotView(page, name)` — the whole window |
| Something small on a big screen: a dropdown, popover, menu, card, toolbar, a single form row | `shotZoom(page, locator, name)` — a crop around it; keeps ≥560×320 px of context |
| A feature whose parts need explaining, or several controls on one screen | `marks: [{ target, label }]` — numbered callouts; labels 2–5 words; at most 5 marks |
| "Where do I find it" — the entry point is easy to miss | `spotlight: true` + one or two marks — dims everything else |
| A feature with several views, options, modes or states | One shot per view/option/state, all of them, then a `gallery` block (or several `imageWithText` blocks if each needs its own paragraph) |

Rules:

- **Document every option.** If a setting has three modes, show three states. If
  a new drawer has two tabs, show both tabs.
- **Scope locators to `main`** (`page.locator('main').getByRole(…)`): the header
  repeats several actions under the same name, and `.first()` will happily mark
  the header icon instead of the button the article talks about.
- **Open dropdowns before shooting them**, and zoom: a whole-screen shot of an
  open dropdown is unreadable in the article column.
- **Callout labels in every language** with `L({ sk, en, hu })`, worded like the
  app's own labels.
- **The text refers to the marks** as `(1)`, `(2)` … in the same order, e.g.
  `<li><strong>(1) Filter klienta</strong> – …</li>`. The validator checks this.
- **Shot names** are kebab-case, in English, prefixed by the feature:
  `finance-mode-toggle`, `finance-cell-editing`, `tasks-quick-panel`.
- **Sanity**: no spinners, no error toasts, no empty states unless the empty
  state *is* the feature, no personal or real data — only the demo company.
- Typical counts: patch 2–8 shots, major 10–25.

Spec skeleton:

```ts
import { test } from '@playwright/test';
import { L, openView, settle, setupRelease, shotView, shotZoom } from '../shotkit';

test.beforeEach(async ({ page }) => {
  await setupRelease(page, {
    // Only when the feature needs data the demo company lacks:
    patchSync: (p) => ({ ...p, settings: { ...p.settings, financialMode: 'simplified' } }),
  });
});

test('finance: simplified mode', async ({ page }) => {
  await openView(page, 'financial');
  const cell = page.locator('[data-testid="fin-cell"]').first();
  await cell.click();
  await settle(page, 600);
  await shotZoom(page, cell, 'finance-cell-editing', {
    marks: [{ target: cell, label: L({ sk: 'Úprava bunky', en: 'Edit a cell', hu: 'Cella szerkesztése' }) }],
  });
});
```

## Article structure

**Major** (`kind: "major"`, e.g. 1.11 → 1.12 — a new fruit codename):

1. `textblock` — intro, 2–4 sentences: "CCRM 1.12 (Mango) …", the main theme,
   the two or three headline features.
2. `heading` h2 — "Nové funkcie" / "New features" / "Új funkciók".
3. For every feature, most useful first:
   - `heading` h3 with `moduleTag` (the module's name as the navigation shows it),
   - `imageWithText` — the main screenshot + one paragraph + a `<ul>` of 3–6
     concrete points (alternate `imageDirection` left/right between features),
   - then as needed: `gallery` for views/options/states, `image` for a large
     full-width view, `callout` `where` with the path to it.
4. Optionally `heading` h2 "Vylepšenia" with h3 sections for improvements big
   enough to need a picture.
5. `changeList` `improvements` — the smaller improvements, one line each.
6. `changeList` `fixes` — every fix, one line each.

**Patch** (`kind: "patch"`, e.g. 1.11.140 → 1.11.143):

1. `textblock` — intro, 1–2 sentences.
2. For each feature or picture-worthy improvement: `heading` h3 + `moduleTag`,
   `imageWithText` (+ `gallery` / `callout` as needed). No h2 needed.
3. `changeList` `improvements` (if any), then `changeList` `fixes` (if any).

A patch with only fixes is just the intro and the fixes list.

## `article.json` — the contract

Every human-readable value is `{ "sk": …, "en": …, "hu": … }`. Images are
referenced by shot name (no extension); the file must exist in
`shots/sk/`, `shots/en/` and `shots/hu/`.

```json
{
  "version": "1.11.150",
  "releaseType": "patch",
  "title": {
    "sk": "Verzia 1.11.150 – Zjednodušené financie a rýchlejšie úlohy",
    "en": "Version 1.11.150 – Simplified finance and faster tasks",
    "hu": "1.11.150-es verzió – Egyszerűsített pénzügyek és gyorsabb feladatok"
  },
  "captions": {
    "finance-cell-editing": { "sk": "Úprava bunky priamo v tabuľke", "en": "Editing a cell in the table", "hu": "Cella szerkesztése a táblázatban" }
  },
  "blocks": [
    { "type": "textblock", "text": { "sk": "<p>…</p>", "en": "<p>…</p>", "hu": "<p>…</p>" } },
    { "type": "heading", "headingLevel": "h3", "headingText": { "sk": "…", "en": "…", "hu": "…" }, "moduleTag": { "sk": "Financie", "en": "Finance", "hu": "Pénzügyek" } },
    { "type": "imageWithText", "image": "finance-mode-overview", "imageDirection": "left", "text": { "sk": "<p>…</p><ul><li>…</li></ul>", "en": "…", "hu": "…" } },
    { "type": "gallery", "images": ["finance-mode-toggle", "finance-cell-editing"], "galleryColumns": "2" },
    { "type": "image", "image": "finance-cashflow" },
    { "type": "callout", "calloutType": "where", "text": { "sk": "<p>Nastavenia → Financie → Režim</p>", "en": "…", "hu": "…" } },
    { "type": "changeList", "listType": "improvements", "listItems": { "sk": ["…"], "en": ["…"], "hu": ["…"] } },
    { "type": "changeList", "listType": "fixes", "listItems": { "sk": ["…", "…"], "en": ["…", "…"], "hu": ["…", "…"] } }
  ]
}
```

| Block | Fields |
|---|---|
| `textblock` | `text` (HTML) |
| `image` | `image` |
| `imageWithText` | `image`, `text` (HTML), `imageDirection` `left`\|`right` |
| `gallery` | `images` (2–12), `galleryColumns` `"2"`\|`"3"` — 3 only for small zoomed crops |
| `heading` | `headingText`, `headingLevel` `h2`\|`h3`, `moduleTag` (optional) |
| `callout` | `calloutType` `where`\|`tip`\|`info`\|`warning`, `text` (HTML) |
| `changeList` | `listType` `fixes`\|`improvements`, `listItems` (one line each, same count in every language), `headingText` (optional — a default title is shown) |

HTML allows only `p h2 h3 ul ol li strong b em i a code br`, no attributes
except `href="https://…"` on links. `captions` become the image titles shown
under pictures and in the lightbox — one short sentence each.

## How to write

**Slovak is the original; English and Hungarian are written for their readers,
not translated word for word.** Use the app's own labels in each language (from
the `t()` calls) so readers find the words they see on screen.

- **Address the reader** — Slovak "vy" (*nájdete, môžete, zvolíte*), English
  "you", Hungarian formal "Ön" form (*megtalálja, beállíthatja*).
- **Lead with the benefit, then the how.** "Úlohu pridáte bez opustenia
  obrazovky: …" — not "Pridali sme nový komponent…".
- **Concrete**: name the button, the tab, the menu path. "V nastaveniach" is
  weak; "Nastavenia → Financie → Režim" is right.
- **Bullets** for lists of capabilities, 3–6 per feature, each one line.
- **Fixes** describe the symptom that is gone, from the user's side:
  "Čiastočne zaplatená faktúra sa pri „Označiť zvyšok ako zaplatené“ už
  nezapočíta dvakrát." — never "Opravená chyba v ProjectDetailsView".
- **Never** mention file names, components, commits, APIs, CSS, refactors,
  tests, tokens, or anything from the excluded list. No marketing superlatives
  ("revolučný", "úžasný"), no emoji.
- **Title**: `Verzia <craftVersion> – <2–4 headline topics>` /
  `Version <craftVersion> – …` / `<craftVersion>-es verzió – …` (Hungarian:
  `-as`/`-es`/`-ös` by vowel harmony of the number's pronunciation; `-es` is
  right for most). Must contain `craftVersion`, under 110 characters.

Reference — the published 1.11 article opens like this:

> CCRM 1.11 (Lemon) zhŕňa všetko nové od verzie 1.10. Hlavnou témou je nový
> modul Zamestnanci s dochádzkou a mzdami, hlasové zadávanie úloh, obľúbené
> položky a úplne prepracovaná navigácia s dokom.

> **Obľúbené položky** — Ľubovoľného leada, klienta, projekt či zamestnanca si
> môžete označiť srdiečkom. Srdiečko je hneď vedľa vyhľadávania a otvára
> obľúbené v karte, ktorá sa plynulo rozbalí z hornej lišty.

## Before you finish

- [ ] Every commit in range is in `classification.json`.
- [ ] Each announced feature has its own section **with** screenshots of every
      view/option it introduces.
- [ ] Small elements are zoomed; marked shots are explained with `(1)`, `(2)` ….
- [ ] Not-obvious entry points have a `where` callout or a spotlight shot.
- [ ] All fixes are in one `fixes` list at the end.
- [ ] You looked at the screenshots, not only generated them.
- [ ] `node scripts/release-notes/validate.mjs $RUN_DIR` prints `Valid.`
- [ ] `report.md` written.
