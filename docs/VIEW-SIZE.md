# View size — typography, spacing and layout ruleset

> **Status:** Phases 0–F implemented 2026-10-01 (v1.11.139). Open: `viewSize.spec.ts` is report-only (phone horizontal overflow on Dashboard/Meetings/Financial); remaining hand-built tab bars/toolbars/detail headers (Projects, Employee detail, Financial) not yet on the primitives. Note: `@custom-variant` one-liners need single spaces and a trailing `;`.
> Original plan: Written 2026-10-01 from a measured audit of
> every section. **Audience:** the agents who implement it. Read §0 first, then
> the section that matches your task. Everything here is a rule unless it says
> "recommended".

The app is getting a per-device **View size** setting — *Auto · Compact · Normal
· Big* — that controls font sizes, spacing and page layout **everywhere except
the aside** (the left navigation). The aside keeps its own existing settings
(floating/pinned and Compact/Comfortable/Spacious). This document is the single
ruleset for that work: the tokens, the layout system, the per-section plan, the
migration procedure and how to verify it.

---

## 0. The rules on one page

1. **Never write a font size by hand.** No `text-[10px]`, no `text-xs`/`text-sm`/…
   (Tailwind's stock steps), no inline `fontSize`, no breakpoint-prefixed sizes
   (`lg:text-xs`). Use a **role token** (`text-micro` … `text-metric`) or a
   **type recipe** (`type-overline`, `type-label`, …). §4.1, §4.2, §5.
2. **Sizes come from the view size, layout comes from the space.** Text and
   spacing scale through CSS variables; layout changes through **workspace
   breakpoints** `ws-sm … ws-2xl`, which are container queries in `em` and
   therefore follow both the window width *and* the view size. §3.4, §6.3.
3. **No pixel widths.** `w-[140px]` → `w-35` (px ÷ 4). Spacing utilities scale
   with the view size; arbitrary pixels do not. §4.3.
4. **No centred page caps.** The workspace fills the screen. Wide screens get
   more columns or another pane, not wider margins. A component must not sit
   alone at one side of an empty area. §6.4.
5. **One page skeleton:** PageHeader → Tabs → KPI strip → Toolbar → content,
   built from the shared primitives in `src/components/layout/`. §6.1, §6.2.
6. **Uppercase is for overlines, table headers and badges only.** Form labels,
   buttons, tabs and subtitles are normal case. `font-black` is for page/entity
   titles and big numbers only. §5.3.
7. **The aside and paper documents never scale.** They sit inside
   `.view-size-fixed`. §3.3.
8. **Anything sized in JavaScript** (charts, SVG text, canvas geometry,
   positioning maths) reads the token or the scale from `src/utils/viewSize.ts`.
   §3.5.
9. **Compact must look like today** (within ±2px; text that was under 10px rises
   to 10px). Normal and Big are where the app gets bigger. §4.1.
10. **A section is done** when the guard test passes without its ledger entry,
    the view-size QA spec is clean at all four reference screens, and the
    existing QA audit (including dark mode) is still green. §9.

---

## 1. Decisions

Taken with the product owner on 2026-10-01. Do not reopen them in an
implementation PR; raise them separately.

| Topic | Decision |
|---|---|
| Options | **Auto** (default), **Compact**, **Normal**, **Big**. |
| Scope | Everything except the aside. Header, Start menu, drawers, modals, pop-overs, login and installer all follow the view size. |
| Aside | Keeps its own settings: attachment (floating overlay / pinned column), size (Compact 64/224 px · Comfortable 80/256 px · Spacious 96/288 px), unpinned style. Covers the desktop rail, its expanded panel, the dock mode, the module picker and the mobile bottom bar. |
| Auto rule | **Width only.** Window width `< 1800px` → Compact; `1800–2199px` → Normal; `≥ 2200px` → Big. A 2560px-wide 2K monitor at 100% gets Big because its CSS pixel is physically the same size as a 27″ iMac's. |
| Storage | **Per device** (this browser), localStorage key `ccrm_view_size`. Not synced to the user row. A lost value falls back to Auto. |
| Smallest text | Compact 10px · Normal 12px · Big 13px. The 10px size exists only in Compact. Nothing anywhere below 10px. |
| Label style | **Resize and restyle.** Form labels, buttons, tabs and subtitles become normal case at their role size; uppercase remains for overlines, table headers and badges; `font-black` remains for page/entity titles and KPI numbers. |
| Colours | **Out of scope.** The codebase uses raw palette classes (`text-slate-500`, `bg-indigo-50`) and its dark mode is built on that (see `src/index.css`, "DARK THEME"). Keep writing raw palette colours. This refactor tokenises **size, spacing and layout only**. |
| "Compact rows" toggle in Leads | Stays. It changes row padding inside whatever view size is active; it does not change type. |

UI strings for the setting are in §3.1.

---

## 2. What the audit found

All 26 routed screens were captured with the demo dataset (`tests/demo/`) at
390×844 (phone), 1440×900 (laptop), 1920×1080 (Full HD) and 2560×1440 (2K / 27″
iMac), and the rendered font size of every visible text run inside `<main>` was
recorded. Local copies (not committed): `test-results/density-audit/shots/`.

### 2.1 Type is tiny everywhere, and identical on every screen

Share of rendered characters by size, all views, at 1920px:

| < 9px | 9–9.5px | 10–10.5px | 11px | 12px | 13–14px | ≥ 15px |
|---|---|---|---|---|---|---|
| 3.9% | 9.9% | 26.4% | 9.3% | 32.1% | 14.5% | 4.0% |

- **49% of all text is under 12px; 83% is under 14px** — on every screen size,
  because nothing scales.
- Worst views (share under 11px at 1920): Settings 71%, Leads 69%, Clients 65%,
  Files 64%, Overview 64%, Tasks 62%, Personal settings 59%.
- Only Email and Updates read at 14px.

In code: 2,800 arbitrary pixel sizes (`text-[10px]` ×1281, `text-[9px]` ×679,
`text-[11px]` ×525, `text-[8px]` ×149, down to `text-[6.5px]`), plus 2,153
`text-xs`. 80% of the 8–9px uses and 58% of the 10px uses are
`uppercase tracking-wider font-black` labels. SVG and Chart.js text is 7–9px.

### 2.2 Wide screens waste space

`<main>` is capped at `max-w-[1600px] mx-auto` (`src/App.tsx:3756`). Median
content width:

| Screen | Content width | Share of screen |
|---|---|---|
| 1440 laptop | 1306px | 91% |
| 1920 Full HD | 1546px | 81% |
| 2560 2K / iMac | 1546px | **60%** |

Several views add a second, narrower cap inside (Meetings, SAI, Updates, Task
dashboard pieces), and layouts stop adapting at `lg` (1024px): the whole
codebase has 39 `xl:` and 4 `2xl:` utilities.

### 2.3 The same thing is built five different ways

- **Page header:** the same title block is copy-pasted into 16 views.
  Four other variants exist: Email (boxed icon, sentence-case subtitle), SAI
  (white bar), Updates (gradient hero), Employees (tabs *above* the title).
- **Detail header:** Project detail puts back arrow, title and actions in one
  row. Lead and Client detail put a row of buttons *above* the title.
- **Tabs:** at least five styles (dark pill, coloured pill, underline with emoji,
  outlined pills that wrap to two rows, segmented).
- **Split panes:** 3/9, 4/8, 5/7, 50/50 and 2/1 column splits, all switching at
  `lg`.
- **Page width:** Meetings' title starts 133px right of every other page's at
  1920; Unified entries adds its own 24px inset.

### 2.4 Section-specific symptoms (all confirmed on screenshots)

- Settings / Personal settings: a lone card in the right column with empty space
  below it; Personal settings' content column stops at ~1290px, leaving a third
  of a 1920 screen empty.
- Projects: filter dropdowns truncate ("Všetky d…", "Všetci ma…") even at 1920.
- Leads: column headers wrap to two lines while columns waste space.
- Tasks: the task list ends after ~400px of height beside a full-height calendar.
- Financial: the cash-flow plot does not span its card; axis text is 7–9px.
- Files: row actions are 7–8px two-line labels ("KLIENTSKA / KARTA").
- Project detail at 2560: the timeline tab's list leaves half the pane empty.
- Phone: three nested paddings (page, card, inner card) eat ~25% of 390px; the
  detail-header action row is clipped at the right edge; the floating copilot
  orb covers the bottom navigation.

---

## 3. Architecture

### 3.1 The setting

**Module:** `src/utils/viewSize.ts` (new), modelled on `src/utils/theme.ts`.

```ts
export type ViewSize = "compact" | "normal" | "big";
export type ViewSizeMode = "auto" | ViewSize;

export const VIEW_SIZE_KEY = "ccrm_view_size";
export const AUTO_NORMAL_MIN = 1800; // px, window width
export const AUTO_BIG_MIN = 2200;

export const isViewSizeMode = (v: unknown): v is ViewSizeMode => …;
export const getStoredViewSizeMode = (): ViewSizeMode => …; // try/catch, like theme.ts readStorage
export const setStoredViewSizeMode = (mode: ViewSizeMode): void => …;

/** Pure; unit-tested. */
export const resolveViewSize = (mode: ViewSizeMode, windowWidth: number): ViewSize =>
  mode !== "auto" ? mode
  : windowWidth >= AUTO_BIG_MIN ? "big"
  : windowWidth >= AUTO_NORMAL_MIN ? "normal"
  : "compact";

/** Writes data-view-size (resolved) and data-view-size-mode on <html>. */
export const applyViewSize = (mode: ViewSizeMode): ViewSize => …;

/** matchMedia listeners on (min-width: 1800px) and (min-width: 2200px); re-applies while mode is auto. */
export const startViewSizeWatcher = (): (() => void) => …;

export const currentViewSize = (): ViewSize => …; // reads data-view-size

/** Re-renders on change. MutationObserver on data-view-size, exactly like useAppearance(). */
export const useViewSize = (): { mode: ViewSizeMode; size: ViewSize; scale: number } => …;

/** 1 · 1.125 · 1.25 — the --vs-scale of the resolved size. */
export const viewSizeScale = (size: ViewSize = currentViewSize()): number => …;

/** Pixel size of a type role, read from the CSS token so CSS stays the single source. */
export const typePx = (role: TypeRole): number => {
  const root = document.documentElement;
  const raw = getComputedStyle(root).getPropertyValue(`--text-${role}`).trim(); // e.g. "0.75rem"
  const rootPx = parseFloat(getComputedStyle(root).fontSize);
  return raw.endsWith("rem") ? parseFloat(raw) * rootPx : parseFloat(raw);
};
```

- Use `matchMedia("(min-width: …)")` rather than `innerWidth`, so JS and CSS
  agree about the same pixel.
- Start the watcher next to `startThemeWatcher` and stop it on unmount.
- A `storage` event listener (another tab changed the setting) is recommended.

**Pre-paint.** `index.html` already sets the theme before the bundle loads. Add
the same for the view size inside that script, so the first frame is already
the right size:

```js
var VS_DEFAULT = "compact"; // becomes "auto" in Phase F — keep equal to viewSize.ts (unit-tested)
var vs = read("ccrm_view_size");
var vsMode = vs === "auto" || vs === "compact" || vs === "normal" || vs === "big" ? vs : VS_DEFAULT;
var mq = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
var vsSize = vsMode !== "auto" ? vsMode
  : mq("(min-width: 2200px)") ? "big" : mq("(min-width: 1800px)") ? "normal" : "compact";
root.setAttribute("data-view-size", vsSize);
root.setAttribute("data-view-size-mode", vsMode);
```

**Rollout flag.** Add `VIEW_SIZE_ENABLED = false` to `src/utils/featureFlags.ts`.
While it is false:

- the default mode is **compact** (≈ today's look), in `viewSize.ts` and in the
  pre-paint script;
- an explicitly stored value is still honoured, so agents and the QA spec can
  preview Normal/Big by writing `ccrm_view_size` (devtools or `addInitScript`);
- the setting UI is not rendered.

Phase F flips the flag, changes both defaults to `auto` and shows the UI. A unit
test reads `index.html` and `featureFlags.ts` as text and fails if the two
defaults disagree.

**Settings UI.** New component `src/components/ViewSizeSettings.tsx`, styled
like the option cards in `SidebarSettings.tsx`: four options in a 4-column grid
(2×2 when the panel is narrow). Rendered in two places:

1. The **profile drawer** in `Header.tsx`, as its own section directly above the
   "Sidebar & Navigation" block (`Header.tsx:1735`).
2. **Personal settings → Appearance**, next to the theme controls
   (`PersonalSettingsView.tsx`, near the existing `SidebarSettings` at line 605).

Changing the option applies immediately (no reload). Strings (inline
`t(en, sk, hu)`, like `SidebarSettings`):

| Key | en | sk | hu |
|---|---|---|---|
| Section title | View size | Veľkosť zobrazenia | Nézet mérete |
| Section hint | Text size, spacing and layout everywhere except the sidebar | Veľkosť písma, rozostupy a rozloženie všade okrem bočného menu | Betűméret, térközök és elrendezés mindenhol, az oldalsáv kivételével |
| Auto | Auto | Automaticky | Automatikus |
| Auto sub-label | Follows the window width · now {size} | Podľa šírky okna · teraz {size} | Az ablak szélessége szerint · most {size} |
| Compact / sub | Compact · Phones & laptops | Kompaktné · Mobily a notebooky | Kompakt · Telefonok és laptopok |
| Normal / sub | Normal · Full HD & 1440p monitors | Normálne · Monitory Full HD a 1440p | Normál · Full HD és 1440p monitorok |
| Big / sub | Big · iMac & large monitors | Veľké · iMac a veľké monitory | Nagy · iMac és nagy monitorok |
| Footnote | Saved on this device only | Uloží sa len v tomto zariadení | Csak ezen az eszközön tárolódik |

Recommended in the same change: relabel the aside's existing
"Compactness & Density" block (`SidebarSettings.tsx:191`) to **Sidebar size /
Veľkosť bočného menu / Oldalsáv mérete**, so the two settings do not read as
duplicates. Its behaviour stays exactly as it is.

### 3.2 How the scaling works

The app's dark mode already works by redefining the CSS variables that Tailwind
v4 compiles every utility against (`src/index.css`, "DARK THEME"). View size uses
the same mechanism:

- every spacing and sizing utility (`p-4`, `gap-3`, `h-9`, `w-35`, `size-4`,
  `top-2`) compiles to `calc(var(--spacing) * N)`;
- every role token utility (`text-ui`) compiles to `var(--text-ui)`;
- every `max-w-md`-style container compiles to `var(--container-md)`.

`<html data-view-size="normal">` therefore re-sizes the whole app with zero
markup branching. **Arbitrary values (`text-[10px]`, `w-[140px]`) do not follow**
— which is why the migration is mostly about removing them.

Why not scale the root font-size? It would scale `rem` everywhere, including the
aside, and `rem` cannot be re-pinned for a subtree. Variables can.

Implementation notes:

- Put the per-size override blocks **unlayered** in `index.css`, after `@theme`,
  like the dark block. Unlayered declarations beat Tailwind's `@layer theme`.
- **Write literal values in every block.** A custom property that references
  another (`--container-md: calc(28rem * var(--vs-scale))`) is resolved on the
  element where it is *declared*, so a subtree that overrides `--vs-scale`
  (`.view-size-fixed`) would still inherit the root's computed value.
- Tokens are in `rem`, so the browser's own default-font-size setting
  (accessibility) still scales everything.

### 3.3 What never scales: `.view-size-fixed`

`.view-size-fixed` re-declares every view-size variable with its Compact value
(which equals Tailwind's stock spacing and containers). Put it on:

| Surface | Where |
|---|---|
| Desktop rail and expanded panel | `Sidebar.tsx:1420` root |
| Mobile bottom navigation | `Sidebar.tsx:2084` root |
| Module picker and any other pop-over the Sidebar renders (portaled ones too) | elements with `[data-module-picker]` |
| macOS-style dock | `src/components/magicui/dock.tsx` root |
| Printed / previewed offers and invoices | `.print-document`, `src/components/pdf/*.tsx` roots. These are paper, sized for A4. |

The aside's own size classes (`Sidebar.tsx:1011`, `widthClasses`) keep using
Tailwind's stock steps; the guard test exempts these files.

### 3.4 The workspace container and `ws-*` breakpoints

`<main>` (`App.tsx:3756`) becomes the **workspace**:

```css
.workspace {
  container: workspace / inline-size;
  font-size: var(--text-ui);              /* sets the em used by ws-* below */
  line-height: var(--text-ui--line-height);
  padding: var(--gutter);
  max-width: var(--workspace-max);
  margin-inline: auto;
  width: 100%;
}
```

```css
/* Registered smallest first, so a larger one wins. */
@custom-variant ws-sm  { @container workspace (width >= 40em)  { @slot; } }
@custom-variant ws-md  { @container workspace (width >= 56em)  { @slot; } }
@custom-variant ws-lg  { @container workspace (width >= 72em)  { @slot; } }
@custom-variant ws-xl  { @container workspace (width >= 96em)  { @slot; } }
@custom-variant ws-2xl { @container workspace (width >= 120em) { @slot; } }
```

`em` in a container query is resolved against the **container's** font size —
verified in Chromium 151: a 50em breakpoint on an 800px container matched at
14px and did not at 18px. Because the workspace font size is `--text-ui`, the
breakpoints move with the view size:

| Breakpoint | Compact (12px) | Normal (14px) | Big (16px) |
|---|---|---|---|
| `ws-sm` | 480 | 560 | 640 |
| `ws-md` | 672 | 784 | 896 |
| `ws-lg` | 864 | 1008 | 1152 |
| `ws-xl` | 1152 | 1344 | 1536 |
| `ws-2xl` | 1440 | 1680 | 1920 |

The same window therefore gets fewer columns when a user picks a bigger size,
and the pinned aside, the Copilot side panel or a resized window are accounted
for automatically. Typical workspace widths (window − 80px rail − 2 × gutter):

| Screen | Auto size | Workspace | Highest `ws-*` |
|---|---|---|---|
| 390 phone | Compact | 358 | — |
| 768 tablet | Compact | 720 | `ws-md` |
| 1280 laptop | Compact | 1152 | `ws-xl` |
| 1440 laptop | Compact | 1312 | `ws-xl` |
| 1728 MBP 16″ | Compact | 1600 | `ws-2xl` |
| 1920 Full HD | Normal | 1776 | `ws-2xl` |
| 1920, aside pinned at 256 | Normal | 1600 | `ws-xl` |
| 2240 iMac 24″ | Big | 2080 | `ws-2xl` |
| 2560 2K / iMac 27″ | Big | 2400 | `ws-2xl` |

Two more facts the implementation relies on:

- **`container-type` does not trap fixed overlays** — verified: a
  `position: fixed; inset: 0` child of the container still covered the whole
  viewport. The 81 `fixed inset-0` overlays rendered inside `<main>` are safe.
  Check once in **Safari** too (iMac users), since this is a containment detail.
- `ws-*` only exists **inside** `<main>`. The header, the aside, the Start menu
  and every portaled overlay (~20 `createPortal` call sites) are outside it: use
  viewport breakpoints there, or a local `@container` inside a drawer.

### 3.5 Sizes that live in JavaScript

CSS variables cannot reach these. Each must use `typePx()` for text or multiply
its base geometry by `viewSizeScale()`, and re-render via `useViewSize()`.

| Where | What | Fix |
|---|---|---|
| `DynamicDashboardView.tsx:2335–2384` | Chart.js tick/label fonts 8–9 | `typePx("micro")` |
| `ClientsView.tsx:217–254` | Chart.js fonts | `typePx("micro")` / `typePx("caption")` |
| `FinancialManagementView.tsx:4959–5125` | SVG `fontSize` 7–9 | `typePx("micro")` |
| `Dashboard.tsx:2030, 2309` | SVG `fontSize` 8 | `typePx("micro")` |
| `sai/SwarmGraphCanvas.tsx:187, 478` | popover 264×126, SVG font 7.5 | × scale, `typePx("micro")` |
| `LeadsDatagrid.tsx` (8 inline `fontSize`), `ui/PipelineStrip.tsx:32` (`REF_SIZE`, 6 inline) | inline sizes | tokens / × scale |
| `ProjectDetailsView.tsx:386` | Gantt `columnWidth` 60 | store the user's zoom as a unitless factor; render `factor × 60 × scale` |
| `utils/dashboardGrid.ts` `breakpointForWidth` | mirrors viewport `lg`/`md` (1024/768) | switch to workspace `em` (width ÷ `typePx("ui")`) with the 72/56 thresholds of `ws-lg`/`ws-md`, and the view's span classes to `ws-lg:`/`ws-md:` **in the same commit** — the planner and the grid must never disagree |
| `DynamicDashboardView.tsx:1112` | gutter in column maths | read the computed gap, don't hardcode it |
| `dashboard/widgetKit.tsx:166`, `dashboard/presetWidgets.tsx:204` | `rowHeight`, `TABLE_ROW_HEIGHT = 60` | × scale, or measure |
| `AutomationView.tsx:1069` | `NODE_WIDTH = 320` | × scale (keep the canvas's own zoom on top) |
| `executive/CopilotSidebar.tsx:35–36` | width 440 / min 360 | × scale |
| `ui/CustomSelect.tsx:70`, `ui/ColorPicker.tsx:35–36` | panel 260 / 270×200 used for positioning | × scale |
| `TimelineCollapsible.tsx:15` | collapsed height 220 | × scale |
| `magicui/dock.tsx:39` | `DEFAULT_SIZE = 40` | **aside — leave as is** |

`chartTheme()` in `theme.ts` is the precedent: add a sibling
`chartFonts(size = currentViewSize())` returning `{ tick, label, legend }` pixel
sizes from `typePx`.

---

## 4. Tokens

### 4.1 Type scale

Nine role tokens. **Compact values are the `@theme` defaults** (and equal
today's sizes, apart from the 10px floor); Normal and Big override them.

| Token | Role | Compact | Normal | Big | Line height |
|---|---|---|---|---|---|
| `text-micro` | overlines, table headers, badge/counter text, chart ticks | 10 | 12 | 13 | 1.25 |
| `text-caption` | form labels, helper text, timestamps, secondary lines, tooltips | 11 | 13 | 14 | 1.35 |
| `text-ui` | **default** — buttons, inputs, tabs, menu items, table cells, list rows | 12 | 14 | 16 | 1.4 |
| `text-body` | running text — descriptions, notes, timeline content, chat, articles | 14 | 16 | 17 | 1.55 |
| `text-title-sm` | card, widget and section titles | 15 | 17 | 19 | 1.35 |
| `text-title` | drawer, modal and panel titles | 18 | 20 | 23 | 1.3 |
| `text-heading` | page title (module / list views) | 24 | 28 | 32 | 1.2 |
| `text-display` | entity title on detail views | 30 | 34 | 40 | 1.1 |
| `text-metric` | KPI and summary numbers | 28 | 32 | 38 | 1.1 |

Values in px; write them in `rem` (÷ 16). Normal is +2px on the small roles
(comfortable on a 24″ Full HD screen). Big is sized so a 2560px-wide 27″ screen,
whose CSS pixel is ~16% smaller physically, reads at least as large as Normal on
Full HD.

**Floors:** Compact 10 · Normal 12 · Big 13. They hold automatically as long as
no size is written by hand (rule 1). Stock `text-5xl`–`text-7xl` hero type is
allow-listed per file (login, empty-state emoji) and must stay above every role.

### 4.2 Type recipes

Composite utilities for the common cases. Prefer a recipe; use a bare token when
no recipe fits. Recipes contain no colour (colours stay raw palette, §1).
Overriding one property works: Tailwind 4.3 emits recipes before single
utilities, so `type-overline font-bold` gives bold (verified).

```css
@utility type-overline     { font-size: var(--text-micro);    line-height: var(--text-micro--line-height);    font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
@utility type-label        { font-size: var(--text-caption);  line-height: var(--text-caption--line-height);  font-weight: 600; }
@utility type-meta         { font-size: var(--text-caption);  line-height: var(--text-caption--line-height);  font-weight: 500; }
@utility type-body         { font-size: var(--text-body);     line-height: var(--text-body--line-height);     font-weight: 400; }
@utility type-card-title   { font-size: var(--text-title-sm); line-height: var(--text-title-sm--line-height); font-weight: 700; letter-spacing: -0.005em; }
@utility type-panel-title  { font-size: var(--text-title);    line-height: var(--text-title--line-height);    font-weight: 700; letter-spacing: -0.01em; }
@utility type-page-title   { font-family: var(--font-heading); font-size: var(--text-heading); line-height: var(--text-heading--line-height); font-weight: 800; letter-spacing: -0.02em; }
@utility type-entity-title { font-family: var(--font-heading); font-size: var(--text-display); line-height: var(--text-display--line-height); font-weight: 900; letter-spacing: -0.025em; }
@utility type-metric       { font-size: var(--text-metric);   line-height: var(--text-metric--line-height);   font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
```

### 4.3 Spacing, gutters, panes, overlays

| Variable | Compact | Normal | Big | Used by |
|---|---|---|---|---|
| `--vs-scale` | 1 | 1.125 | 1.25 | JS geometry (`viewSizeScale()`) |
| `--spacing` | 0.25rem (4px) | 0.28125rem (4.5px) | 0.3125rem (5px) | every `p-*`, `m-*`, `gap-*`, `w-*`, `h-*`, `size-*`, `inset-*` |
| `--gutter` | 1.5rem | 2rem | 2.5rem | workspace padding; **1rem below a 640px viewport in every size** |
| `--workspace-max` | 100rem during rollout → **200rem in Phase F** | same | same | ultrawide safety cap only |
| `--container-3xs … 7xl` | stock (16 … 80rem) | stock × 1.125 | stock × 1.25 | `max-w-sm`/`md`/`lg`/… (modals, popovers) |
| `--container-measure` | 72ch | 72ch | 72ch | `max-w-measure`, reading width (`ch` already scales with the font) |
| `--drawer-sm` / `-md` / `-lg` | 24 / 30 / 42rem | 27 / 33.75 / 47.25rem | 30 / 37.5 / 52.5rem | `w-(--drawer-md) max-w-full` |

Stock container values: 3xs 16, 2xs 18, xs 20, sm 24, md 28, lg 32, xl 36, 2xl 42,
3xl 48, 4xl 56, 5xl 64, 6xl 72, 7xl 80 (rem). Write each scaled value literally
(§3.2).

Spacing scales less than type (×1.25 vs ×1.33 at Big) on purpose: bigger text
without inflating every gap, so Big still shows more content per screen than
today.

**Pane widths** (spacing units, so they scale): `nav` = `64` (256/288/320px),
`aside` = `104` (416/468/520px), `rail` = `88` (352/396/440px).

**Auto-fill grids** — a parameterised utility (verified to compile):

```css
@utility grid-auto-* {
  grid-template-columns: repeat(auto-fill, minmax(min(100%, --spacing(--value(integer))), 1fr));
}
```

`grid-auto-72` = cards at least 72 units wide (288/324/360px), as many per row as
fit.

### 4.4 Control sizes

| Size | Height | Padding-x | Text | Use |
|---|---|---|---|---|
| sm | `h-8` (32/36/40) | `px-2.5` | `text-caption font-semibold` | inline row actions, chips with actions |
| md (default) | `h-9` (36/40.5/45) | `px-3` | `text-ui font-semibold` (buttons) / `text-ui` (inputs) | buttons, inputs, selects, segmented controls |
| lg | `h-11` (44/49.5/55) | `px-4` | `text-ui font-semibold` | primary page action on phones, login |

Inputs and selects in one row share one height. Textareas use `text-body`. On
touch devices (`@media (pointer: coarse)`) interactive targets are at least
40px (`min-h-10`).

**Icons** follow `--spacing`. Use `size-*` and pick by context: inside
micro/caption text `size-3`, inside ui text `size-4`, beside a title `size-5`,
in the page header `size-6`. Fractional results (e.g. 15.75px) are acceptable.

### 4.5 What stays the same in every size

Border widths (1px), radii (`--radius`, `rounded-*`), shadows, colours,
z-indices, animation durations.

---

## 5. Typography rules

### 5.1 Element → recipe

| Element | Classes |
|---|---|
| Page title | `PageHeader` (→ `type-page-title`) |
| Page subtitle | `type-body text-slate-500`, normal case (the Email view's style) |
| Entity title (detail view) | `PageHeader` entity variant (→ `type-entity-title`) |
| Card / widget / section title | `type-card-title` |
| Section eyebrow (small label above a group) | `type-overline text-slate-500` |
| Drawer / modal title | `type-panel-title` |
| Form field label | `type-label text-slate-600` — normal case |
| Helper text, validation, character count | `type-meta text-slate-500` (`text-rose-600` for errors) |
| Input / select value, placeholder | `text-ui` |
| Textarea, rich text editor | `text-body` |
| Button | `text-ui font-semibold` (sm: `text-caption font-semibold`) — normal case |
| Tab, segmented option | `text-ui font-semibold` — normal case |
| Table header | `type-overline` |
| Table cell | `text-ui`; primary cell `font-semibold`; second line `type-meta` |
| Badge, status pill, counter | `text-micro font-semibold` (uppercase allowed) |
| Timestamp, file size, author, "next step" hint | `type-meta` |
| Paragraph, note, timeline entry body, chat message | `type-body` |
| KPI tile | label `type-overline`, value `type-metric`, delta `type-meta` |
| Chart ticks / legend | `typePx("micro")` / `typePx("caption")` |
| Calendar day number / event chip | `text-caption` (chips may use `text-micro` in Compact via `compact:`) |
| Menu item, dropdown option, toast | `text-ui` |
| Tooltip | `text-caption` |
| Empty state | title `type-card-title`, body `type-body` |

### 5.2 Mechanical mapping (first pass)

Map by the **current** size so that Compact stays the same, then review the role
(§8.3). The codemod (§8.2) applies this table.

| Current class | Token | Compact before → after |
|---|---|---|
| `text-[6.5px]` … `text-[10.5px]` | `text-micro` | 6.5–10.5 → 10 |
| `text-[11px]`, `text-[11.5px]` | `text-caption` | 11 → 11 |
| `text-xs`, `text-[12px]` | `text-ui` | 12 → 12 |
| `text-[13px]` | `text-ui` (review: running text → `text-body`) | 13 → 12 |
| `text-sm` | `text-body` | 14 → 14 |
| `text-[15px]`, `text-base` | `text-title-sm` | 15–16 → 15 |
| `text-[17px]`, `text-lg`, `text-xl` | `text-title` | 17–20 → 18 |
| `text-[22px]`, `text-2xl`, `text-[26px]` | `text-heading` | 22–26 → 24 |
| `text-3xl`, `text-[34px]`, `text-4xl` | `text-display` (review: KPI numbers → `text-metric`) | 30–36 → 30 |
| `text-5xl` … `text-7xl` | unchanged; allow-list per file | — |
| `sm:` / `md:` / `lg:` / `xl:` / `2xl:` + any size | **removed** — size follows the view size, not the breakpoint | — |

### 5.3 Case, weight, tracking

- `uppercase` only on: `type-overline` (eyebrows, table headers, group headers,
  KPI labels), badges/status pills, keyboard hints. Remove it from labels,
  buttons, tabs, subtitles, links, menu items and helper text.
- When `uppercase` is removed, also remove `tracking-wide/wider/widest`.
- Do **not** rewrite translation strings to change their case. Title Case
  English labels ("Sidebar Attachment") are acceptable; Slovak and Hungarian
  strings are already sentence case. Fix a string only if it is literally
  written in capitals in the source.
- `font-black` only on page titles, entity titles and KPI numbers. Elsewhere:
  emphasis → `font-bold`; labels and buttons → `font-semibold`; body →
  `font-normal`/`font-medium`.
- Italic 9px hint lines under rows (Leads) become `type-meta`, not italic.

---

## 6. Layout and organisation rules

### 6.1 Page skeleton

Every routed view follows this order. Skip the parts it does not have; never
reorder them.

```
<Page>                    vertical rhythm gap-6, bottom padding pb-16
  PageHeader              title + subtitle left, actions right (or entity variant)
  Tabs                    module sub-sections — always below the header
  StatGrid                KPI tiles
  Toolbar                 search · filters · view switch · primary action
  content                 table / board / SplitLayout / grid of cards
</Page>
```

Employees currently puts its tabs above the title: move them below.

### 6.2 Primitives

New folder `src/components/layout/`. Views compose these instead of copying class
strings. They are Phase 1 work; section agents use them and do not fork them.
Changes to a primitive go in their own commit.

| Primitive | Contract |
|---|---|
| `Page` | `flex flex-col gap-6 pb-16`. No max-width. |
| `PageHeader` | Props: `icon`, `title`, `subtitle?`, `actions?`. Title `type-page-title` with icon `size-6`; subtitle `type-body text-slate-500`. Row layout from `ws-md`; below it the actions wrap under the title, showing the primary action and moving the rest into a "…" menu. Hairline below (`border-b pb-4`), no panel. |
| `PageHeader` (entity variant) | Props: `onBack`, `avatar \| icon`, `title` (editable slot), `badges`, `meta`, `primaryAction`, `actions`. One row: back icon button → avatar → title, with badges and meta (`type-meta`) under the title; actions on the right. Destructive actions live in the "…" menu on Compact. Replaces the button row above the title in Lead and Client detail. |
| `Tabs` | One style: segmented pill row (`text-ui font-semibold`, `h-9`), optional count badge (`text-micro`). Never wraps to a second row — scrolls horizontally with edge fades. Deep-linkable like today. |
| `StatGrid` / `StatTile` | `grid grid-cols-2 gap-4`, and all tiles in one row from `ws-lg`: the component maps its tile count (3–6) to a static class (`ws-lg:grid-cols-3` … `ws-lg:grid-cols-6`) — never build class names at runtime. Tile: label `type-overline`, value `type-metric`, delta `type-meta`, icon `size-5`. |
| `Toolbar` | Search `flex-1 min-w-60`; filter selects size to content (`w-auto` + `whitespace-nowrap`, **never truncate**); view switch; primary action last. Wraps on narrow; below `ws-md` the filters collapse into a "Filters (n)" pop-over. |
| `Surface` | Card: `rounded-3xl bg-white border border-slate-200/80 shadow-sm`, padding `p-4 ws-sm:p-6` (or `none` for tables). `tone="inset"` = second level: `rounded-2xl bg-slate-50 p-4`, no shadow. **Maximum two levels.** |
| `SplitLayout` | Slots `nav?`, `aside?`, `rail?`, children = main. Stacked below `ws-lg`. `ws-lg`: `grid-cols-[--spacing(64)_minmax(0,1fr)]` (nav) or `[--spacing(104)_minmax(0,1fr)]` (aside). `ws-2xl`: adds `rail` as a third column `--spacing(88)`; below `ws-2xl` the rail's content renders inside main (as a tab or a section). Panes are `min-w-0`; long panes are sticky (`sticky top-0 self-start max-h-[calc(100dvh-…)] overflow-auto`). |
| `FormGrid` / `Field` | `grid gap-x-6 gap-y-4`; 1 column, `ws-md:grid-cols-2`, `ws-2xl:grid-cols-3` for forms with 8+ fields. `Field span="full"` for textareas, rich text and wide controls. Label above the control (`type-label`), hint/error below (`type-meta`). |
| `DataTable` styles | `table-header` (`type-overline whitespace-nowrap`), `table-cell` (`text-ui py-3 px-4`), `table-cell-num` (`text-right tabular-nums`), sticky header row. A `priority` prop per column: `low` = `hidden ws-xl:table-cell`, `optional` = `hidden ws-2xl:table-cell`. |
| `EmptyState` | Centred in its pane, `max-w-measure`, icon `size-10`, `type-card-title` + `type-body` + one action. |
| `Drawer` | Right-side panel: `w-(--drawer-sm\|md\|lg) max-w-full`, full width on phones. Title `type-panel-title`. Uses viewport breakpoints (it is portaled outside the workspace). |
| `Modal` | `max-w-lg` / `max-w-2xl` / `max-w-4xl` (containers scale with the view size); on phones a full-width sheet anchored to the bottom. |

### 6.3 Which breakpoints to use

| Where | Use |
|---|---|
| Inside `<main>` | `ws-sm` … `ws-2xl` for layout. Do not write `sm:`/`md:`/`lg:`/`xl:`/`2xl:` layout utilities in workspace content. First approximation when migrating: `sm:`→`ws-sm:`, `md:`→`ws-md:`, `lg:`→`ws-lg:`, `xl:`→`ws-xl:`, `2xl:`→`ws-2xl:`; then check the result at the four reference screens. |
| Header, aside, Start menu, login, portaled overlays | Viewport breakpoints (`sm:` … `2xl:`), or a local `@container` inside the overlay. |
| Exceptions per view size | `compact:` / `normal:` / `big:` variants exist for rare cases (e.g. a denser calendar chip in Compact). Prefer tokens and `ws-*`; a view needing many of these is a smell. |

```css
@custom-variant compact (&:where([data-view-size="compact"], [data-view-size="compact"] *));
@custom-variant normal  (&:where([data-view-size="normal"],  [data-view-size="normal"] *));
@custom-variant big     (&:where([data-view-size="big"],     [data-view-size="big"] *));
```

### 6.4 Width: no lone components

1. **No page-level caps.** Remove `max-w-[1600px]` from `<main>` (Phase F,
   via `--workspace-max`) and every inner `max-w-5xl/6xl/7xl mx-auto` wrapper
   in views: `MeetingRoomView.tsx:1723`, `sai/SaiModule.tsx:961`,
   `sai/CreateRehearsalView.tsx:714`, `sai/GuidedDemoWalkthrough.tsx:358, 382`,
   `UpdateNotesView.tsx:180`, `TaskDashboardView.tsx:3677`. (`FavoritesDrawer.tsx:158`
   is an overlay; give it a drawer token instead.)
2. **Reading width is capped by the component, not the page.** Paragraphs,
   chat transcripts and articles use `max-w-measure`. The width they leave goes
   to a secondary pane (navigation, metadata, preview) from `ws-xl`; only
   genuinely single-purpose screens (setup-required cards, empty states,
   wizards) are centred.
3. **Fill rows, don't leave holes.** A component must not stand alone at one
   side with a large empty area beside or below it:
   - a side card whose neighbour is much taller moves into the content flow
     (top of the section) below `ws-2xl`, and becomes the `rail` at `ws-2xl`;
   - two panes of very different height: the short one is sticky and scrolls
     internally, or both stretch (`items-stretch`) with the short one filling
     its height (e.g. the task list beside the calendar).
4. **Collections use auto-fill**, never fixed column counts: `grid-auto-72` for
   cards (workflows, projects grid, simulations, dashboards list), `grid-auto-56`
   for small tiles. Wide screens get more columns, not wider cards.
5. **Tables use the width**: full width of their surface; at `ws-xl`/`ws-2xl`
   reveal lower-priority columns instead of stretching whitespace; headers
   never wrap (`whitespace-nowrap`), cells truncate with a `title` tooltip.
6. **Forms use columns**, not long single lines: `FormGrid`. A text input is
   never wider than its column.

### 6.5 Specific patterns

- **Detail views** (lead, client, project, employee, unified entry record):
  entity `PageHeader` → `SplitLayout` with `aside` = identity/fields (profile
  card, parameters, attributes) and main = `Tabs` (timeline, tasks, files,
  finance…). At `ws-2xl` a `rail` shows the most useful secondary content (next
  tasks, linked client card, activity) so the main tab is not the only thing
  using the extra width.
- **Timeline + composer** (lead/client/project timeline): from `ws-xl`, composer
  and list side by side (`grid-cols-[--spacing(88)_minmax(0,1fr)]`); below
  that, the composer is a collapsible block above the list.
- **Value-equation chips** (`StatusValueEquationStats`,
  `GroupedStatusValueEquationStats`, on Dashboard, Overview, Leads, Projects):
  chips in `flex flex-wrap gap-2`; the "= total" block sits at the end of the
  row, right-aligned, from `ws-lg`, and gets its own full-width row below it.
  No indentation tricks on phones.
- **Kanban**: columns `w-72` (scales), horizontal scroll, sticky column headers.
- **Calendars**: the grid fills its pane; cell min-height in spacing units; event
  chips `text-caption`, truncated with tooltips.
- **Charts**: 100% of their card's width with a responsive height; never a
  fixed-width plot inside a wider card.
- **Row actions** (Files, Invoices, Unified entries): icon buttons (`size-8`,
  icon `size-4`) with `title` tooltips; at most one labelled action per row.
- **Phones** (Compact below 640px): gutter 16px; outer `Surface` `p-4`, inset
  `p-3`; tables either scroll horizontally with a sticky first column or switch
  to the existing card-row layout — never squeeze columns; header actions
  collapse into "…"; the floating Copilot orb sits above the bottom navigation
  (bottom offset = bar height + 12px).

---

## 7. Section plan

"Now" is what the audit showed; "Target" is how the section must be organised
after migration. Every section also gets §5 typography and §6 primitives.

**Shell** — `App.tsx` (main L3756, notification banner, footer), `Header.tsx`,
`executive/FloatingCopilotOrb.tsx`, `LicenseBanner`, `ui/AiKeyBanner`.
- Now: 1600px cap; fixed `p-4 md:p-6`; `h-20` header; orb over the phone bottom bar.
- Target: `.workspace` (§3.4); banners `text-ui`; footer version `type-meta`;
  header follows the view size (search grows from `xl:`); profile drawer
  `w-(--drawer-sm)` and contains the new View size section; orb offset on phones.

**Dashboard** (`#dashboard`, `#dash_*`) — `DynamicDashboardView.tsx`,
`dashboard/*`, `utils/dashboardGrid.ts`, `StatusValueEquationStats.tsx`,
`GroupedStatusValueEquationStats.tsx`.
- Now: 12-column widget grid switching at viewport `lg` only; the JS planner
  mirrors those viewport breakpoints; chart ticks 8–9px; equation chips wrap
  raggedly.
- Target: span classes and planner move to `ws-md`/`ws-lg` together (§3.5);
  chart fonts via `chartFonts()`; widget title `type-card-title`, KPI widgets
  `type-metric`; `AddWidgetDrawer`/`WidgetSettingsDrawer` `w-(--drawer-md)`.

**Overview** (`#overview`) — `Dashboard.tsx`.
- Now: equation panel, tab row, KPI row with sparklines, funnel + ROI cards; SVG text 8px.
- Target: standard Tabs; `StatGrid`; funnel and ROI as a `grid-auto-*` pair so
  they fill the row; SVG text via `typePx`.

**Tasks** (`#tasks`) — `TaskDashboardView.tsx`, `TaskEditDrawer.tsx`,
`EntityTasksPanel.tsx`, `TaskPillText.tsx`, `VoiceTaskActionBar.tsx`.
- Now: list and calendar 50/50; the list ends at ~400px height beside a
  full-height calendar; calendar chips 8px; view toggles 10px uppercase.
- Target: `SplitLayout` with the list as `aside` (sticky, own scroll, full
  height) and the calendar as main; at `ws-2xl` a `rail` with the selected day's
  agenda; chips `text-caption`; the header's view switch and month navigator use
  `Tabs`/segmented control styles; `TaskEditDrawer` `w-(--drawer-md)`.

**Leads list** (`#leads`) — `LeadsDatagrid.tsx` (13k lines — migrate it in
sub-passes: list table, kanban, modals, detail).
- Now: 56% of text at 10px; two-line column headers; 9px italic hint line under
  each row; group header rows; Compact-rows toggle.
- Target: `DataTable` styles with column priorities (date, city, source
  `low`/`optional`); single-line headers; hint line `type-meta`; group rows
  `type-overline` + `type-meta` totals; kanban per §6.5; toolbar via `Toolbar`.

**Lead detail** (`#leads/<id>`) — `LeadsDatagrid.tsx` detail part.
- Now: back/favourite buttons above the title; value and "Convert to project" in
  that row; 5/7 split; 8–9px uppercase field labels; event-type buttons in a
  fixed 5-column grid.
- Target: entity `PageHeader` (value as a badge/meta, "Convert to project"
  primary); `SplitLayout` aside = client profile + lead parameters (`FormGrid`),
  main = Tabs (timeline, tasks); `rail` at `ws-2xl` = tasks / next step;
  event-type buttons `grid-auto-32`.

**Clients** (`#clients`, `#client-<name>`) — `ClientsView.tsx`,
`ClientCategories.tsx`.
- Now: a full-width card holding only the search, type filter and settings;
  sort and the archive switch on a separate row; detail as in Lead detail, with
  tabs as large outline pills that wrap to two rows at 1920; Chart.js fonts.
- Target: one `Toolbar` (search, type, sort, archive switch, add); detail like
  Lead detail; standard `Tabs`; charts via `chartFonts()`.

**Projects** (`#projects`, `#projects/<id>`) — `ProjectsView.tsx`,
`ProjectDetailsView.tsx`, `ProjectListViewMenu.tsx`, `ProjectTasksPanel.tsx`.
- Now: filter selects truncate at 1920; status chips row; detail 4/8 split;
  timeline tab with a narrow composer column and a list leaving half of a 2560
  pane empty; Gantt in JS pixels.
- Target: `Toolbar` (filters size to content, pop-over below `ws-md`); status
  chips as `Tabs` with counts; grid view `grid-auto-72`; detail per §6.5 with
  the client relationship card in the `rail` at `ws-2xl`; timeline per §6.5;
  Gantt scaled (§3.5).

**Warehouse** (`#warehouse/*`) — `WarehouseView.tsx`.
- Now: five header actions that wrap on laptops; KPI tiles; pill tabs; good table.
- Target: `PageHeader` with "New item" primary and Receipt / Issue / Transfer as
  one split button on Compact; `StatGrid`; `Tabs`; `DataTable` priorities;
  analytics charts per §6.5.

**Financial** (`#financial/*`) — `FinancialManagementView.tsx`,
`FinanceSettings.tsx`, `FinancialCategoriesManager.tsx`.
- Now: its own tab style (emoji icons, underline); cash-flow plot narrower than
  its card; SVG axis text 7–9px; the weekly table hidden in a toggle.
- Target: `Tabs`; chart full width (§6.5) with `typePx` text; at `ws-2xl` the
  weekly table sits beside the chart instead of behind the toggle.

**Invoicing** (`#invoices`) — `InvoicingView.tsx`, `pdf/*`.
- Now: closest to target (KPI, filters, table). Documents are paper.
- Target: primitives; row actions per §6.5; document preview and print stay
  `.view-size-fixed`.

**Files** (`#files`) — `FilesView.tsx`, `FilePreviewPane.tsx`.
- Now: 7–8px two-line action buttons per row; a full-width filter strip of five
  equal buttons.
- Target: row actions per §6.5; type filter as `Tabs` inside the `Toolbar`;
  from `ws-xl` the preview pane opens as a `rail` beside the table instead of
  over it.

**Meetings** (`#meetings`) — `MeetingRoomView.tsx`, `VoiceRecorderCard.tsx`.
- Now: inner cap (narrower than every other page); filter pane plus list; long
  summaries truncated.
- Target: remove the cap; `SplitLayout` nav = filters, main = list; at `ws-2xl`
  the selected meeting's summary opens in the `rail` (master–detail); meeting
  detail: transcript `max-w-measure` with AI output beside it from `ws-xl`.

**Email** (`#email`) — `EmailView.tsx`.
- Now: two panes; header with boxed icon and sentence-case subtitle; mostly 14px.
- Target: its subtitle style becomes the `PageHeader` standard; `SplitLayout` nav
  = thread list; the message body `max-w-measure`.

**RAG AI** (`#rag_ai`) — `RagAiView.tsx`, `ui/ModuleSetupRequired.tsx`.
- Now: agent pane `lg:w-84`; chat; setup card centred.
- Target: `SplitLayout` nav = agents; transcript `max-w-measure` centred in
  main; composer full main width; setup card stays centred (single purpose).

**SAI** (`#sai`) — `sai/*`.
- Now: its own white header bar; inner `max-w-6xl`; hero banner.
- Target: standard `PageHeader`; remove caps; simulations `grid-auto-80`; the
  live war room and graph canvas follow §3.5.

**Automation** (`#automation`) — `AutomationView.tsx`.
- Now: workflow cards in a fixed 3-column grid; builder `NODE_WIDTH` 320 in JS.
- Target: `grid-auto-80`; builder geometry × scale; node text tokens.

**Employees** (`#employees`, `#employee-*`) — `employees/*`.
- Now: tabs above the page title (the only module); KPI; toolbar; table.
- Target: header first, tabs below; detail per §6.5; salary matrix with a sticky
  first column and `tabular-nums` cells; `SalaryCellDrawer` `w-(--drawer-md)`;
  modals per §6.2.

**Social media** (`#social_media`) — `SocialMediaView.tsx`. Not captured
(feature-flagged). Same rules; its `lg:grid-cols-12` 7/5 and 3/9 splits become
`SplitLayout`.

**Personal settings** (`#personal-settings`) — `PersonalSettingsView.tsx`,
`ThemeSettings.tsx`, `SidebarSettings.tsx`.
- Now: nav and one content column that stops at ~1290px, leaving a third of a
  1920 screen empty.
- Target: `SplitLayout` nav + content; content sections are `Surface`s in
  `columns-1 ws-xl:columns-2` (masonry) or a `FormGrid`. Appearance holds Theme
  and View size side by side. `SidebarSettings` keeps its own fixed styling
  only where it previews aside sizes.

**System settings** (`#settings/*`, `#user-*`) — `SettingsView.tsx` (7.7k —
migrate per sub-tab), `ProjectSettings.tsx`, `ProjectStatusSettings.tsx`,
`VisibleModulesSettings.tsx`, `LicenseSettings.tsx`, `FinanceSettings.tsx`,
`ClientCategories.tsx`, `InstallerWizard.tsx`.
- Now: nav + content + a lone info card in a third column with empty space under
  it; 30% of text at 10.5px; 9px helper text.
- Target: `SplitLayout` nav (below `ws-lg` a horizontal `Tabs` row or a select);
  contextual info cards go to the top of the section below `ws-2xl` and to the
  `rail` at `ws-2xl`; every form is a `FormGrid`; key/value lists (database
  info) use a two-column definition list.

**Updates** (`#updates`) — `UpdateNotesView.tsx`, `UpdateNotesModal.tsx`,
`ZoomableUpdateImage.tsx`, `.prose.ck-content` rules in `index.css`.
- Now: inner cap; version list + article; article already 14px.
- Target: no cap; `SplitLayout` nav = versions; article `type-body` with
  `max-w-measure` text and images up to the full pane width. Convert the
  `.prose.ck-content` heading sizes from `rem` to `em` and set the container to
  `font-size: var(--text-body)`, so the article scales.

**Unified entries** (`#ue_*`) — `UnifiedEntryView.tsx`.
- Now: an extra 24px inset; folder rows with tiny count badges.
- Target: standard skeleton; `DataTable`; badges `text-micro`.

**Overlays and shared UI** — `ui/CustomSelect`, `ui/ConfirmDialog`,
`ui/QuickAddClient`, `ui/ColorPicker`, `ui/ClientSelect`, `ui/PipelineStrip`,
`ui/InlineRenameName`, `ui/StarRating`, `FavoritesDrawer`, `StartMenu`,
`executive/CopilotSidebar`, `executive/ExecutiveCallModal`, `UpdateNotesModal`,
`BlockEditor`, `TimelineCollapsible`, `TimelineAuthorBadge`.
- Target: drawer/modal tokens; JS constants × scale (§3.5); option rows
  `text-ui`; Start menu tiles `grid-auto-*`.

**Before login** — `LoginView.tsx`, `InstallerWizard.tsx`, `AccessDeniedView.tsx`.
- Target: follow the pre-paint view size (the user may not be signed in yet);
  hero type allow-listed.

---

## 8. Migration procedure

### 8.1 Phases

Each phase ends with the project's normal finish: **test → bump version →
changelog → build → commit** (`.agents/rules/`). One section per commit. Do not
mix sections, and do not edit primitives inside a section commit.

| Phase | Content | Visible to users? |
|---|---|---|
| **0 Foundation** | `viewSize.ts` + unit tests; pre-paint; `VIEW_SIZE_ENABLED = false`; `index.css` tokens, per-size blocks, `.view-size-fixed`, `ws-*` and `compact/normal/big` variants, recipes, `grid-auto-*`; `.workspace` on `<main>` with `--workspace-max: 100rem`; `.view-size-fixed` on the aside and paper documents; `ViewSizeSettings.tsx` (not rendered yet); codemod (§8.2); guard test with the full ledger (§9.1); QA spec in report-only mode (§9.2); a short rule file `.agents/rules/view-size.md` pointing here and a line in `CLAUDE.md`. | No (Compact = today) |
| **1 Primitives + shell** | `src/components/layout/*`; shared `ui/*`; overlays; Header; Start menu; Favorites; Copilot. | No |
| **2 … n Sections** | One section of §7 per commit, in this order: Leads list → Lead detail → Clients → Projects → Tasks → Dashboard → Overview → Financial → Invoicing → Warehouse → Employees → Meetings → Email → Files → RAG → Automation → SAI → Social → Personal settings → System settings (per sub-tab) → Updates → Unified entries → Before login. After Phase 1, sections can be done in parallel worktrees: their files are disjoint. | No |
| **F Enable** | Ledger empty; `VIEW_SIZE_ENABLED = true`; default `auto` in `viewSize.ts` and the pre-paint script; `--workspace-max: 200rem`; render the setting in the profile drawer and Personal settings; relabel the aside size block; QA spec blocking; changelog entry describing the setting. | **Yes** |

### 8.2 Codemod

`scripts/view-size-codemod.mjs <file…> [--write]`. Report-only by default.

- Rewrites class tokens per §5.2 inside string literals, template literals and
  `cn()`/`clsx()` arguments. Matches whole class tokens only (the token must not
  be preceded or followed by `[\w-]`).
- Drops breakpoint-prefixed size classes. If an element only had a prefixed size,
  it keeps the largest one and reports the line.
- Rewrites arbitrary pixel widths and heights to the spacing scale:
  `w-[140px]` → `w-35`, `min-w-[220px]` → `min-w-55`, `max-h-[500px]` →
  `max-h-125` (px ÷ 4; if the result is not a multiple of 0.25, report instead).
  Same for the 25 arbitrary spacing values (`gap-[3px]` → `gap-0.75`).
- Prints a per-file summary and the lines it could not decide (13px text,
  4xl numbers, only-prefixed sizes, inline `fontSize`) for the review pass.
- Never touches files in the fixed scope (§3.3).

### 8.3 Per-file recipe

1. Run the codemod on the file(s) of the section, report-only; read the report;
   then `--write`.
2. **Role pass.** Walk the view top to bottom with §5.1 open. Typical changes:
   eyebrow combos (`text-micro font-black uppercase tracking-wider`) →
   `type-overline`; field labels → `type-label` (drop `uppercase` and tracking);
   running text that came out as `text-ui` → `type-body`; KPI numbers →
   `type-metric`; `font-black` outside titles and metrics → `font-bold` or
   `font-semibold`.
3. **Layout pass.** Replace the hand-built header, tabs, toolbar, cards and
   splits with primitives; convert `sm:`…`2xl:` layout utilities to `ws-*`;
   remove inner caps; apply §6.4–§6.5 and the section's target in §7.
4. **JS pass.** Anything in §3.5 for this section.
5. Remove the file(s) from the guard ledger.
6. Verify (§9.3) at all four reference screens, in light and dark.

### 8.4 Pitfalls

- Stock `text-xs` etc. still compile after the migration — only the guard test
  stops them. Do not loosen it.
- A `ws-*` class on something rendered through a portal silently never matches:
  the portal is outside the workspace container.
- Unsized text inside `<main>` now inherits `text-ui` (it used to inherit 16px).
  Look for anything that relied on that in the Phase 0 screenshot diff.
- The derived-variable trap (§3.2): write literal values per block.
- `dashboardGrid.ts` and the dashboard's span classes must change together.
- Do not convert colours to tokens in passing (§1).

---

## 9. Verification

### 9.1 Guard test (unit)

`src/utils/viewSizeGuard.test.ts`, run by `npm run test:unit`. It reads every
`src/**/*.tsx` as text and fails on:

- `text-[<n>px]` / `text-[<n>rem]` arbitrary font sizes;
- stock size classes `text-(xs|sm|base|lg|xl|2xl|3xl|4xl)` and any breakpoint-
  prefixed size class;
- inline `fontSize:` and `fontSize=` with a literal number;
- arbitrary pixel `w-`/`h-`/`min-w-`/`max-w-`/`min-h-`/`max-h-`/spacing values;
- `max-w-[1600px]` and inner `max-w-(5xl|6xl|7xl)` combined with `mx-auto`.

Two lists live in the test:

- `FIXED_SCOPE` — permanent exemptions: `Sidebar.tsx`, `magicui/dock.tsx`,
  `pdf/*.tsx`, plus explicit `{ file, pattern, reason }` entries for hero type
  and true canvas geometry.
- `PENDING` — the migration ledger, generated in Phase 0 from the current
  offenders. A section commit **removes** its files. The ledger only ever
  shrinks; nothing is added to it after Phase 0. Phase F requires it to be empty.

Plus: `resolveViewSize` boundary cases (1799/1800/2199/2200, every manual mode),
`isViewSizeMode`, and the `index.html` ↔ `viewSize.ts` default check (§3.1).

### 9.2 QA spec

`tests/e2e/viewSize.spec.ts`, built like `darkmode.spec.ts`: every module of the
QA crawl, opened at the four reference screens with the size forced through
`addInitScript` (`localStorage.ccrm_view_size`):

| Screen | Size |
|---|---|
| 390×844 | Compact |
| 1440×900 | Compact |
| 1920×1080 | Normal |
| 2560×1440 | Big |

Checks, reported through the existing report collector:

| Check | Defect when |
|---|---|
| `TEXT_BELOW_FLOOR` | a visible text run is smaller than the size's floor (10/12/13px). HIGH in Normal/Big, MEDIUM in Compact. |
| `HORIZONTAL_OVERFLOW` | `main.scrollWidth > main.clientWidth + 1`. |
| `UNUSED_WIDTH` (Normal, Big) | the union of the page's visible blocks covers less than 90% of the workspace's content width. Catches caps and lone components. |
| `CONTROL_TRUNCATED` | a button, tab or select shows an ellipsis and has no `title`. |
| `ASIDE_CHANGED` | the aside's width or its item font size differs between view sizes (it must not change). |

Report-only until Phase F; blocking from Phase F. Add it to the coverage map in
`.agents/skills/ccrm-qa-audit/SKILL.md` and to `docs/TESTING.md`.

### 9.3 Definition of done for a section

1. Its files are out of `PENDING`; `npm run test:unit` passes.
2. `npm run test:qa` passes, including `darkmode.spec.ts`, and `viewSize.spec.ts`
   reports nothing for the section.
3. You looked at it at 390, 1440 (Compact), 1920 (Normal) and 2560 (Big), light
   and dark. Compact is within ±2px of the baseline screenshots; Normal and Big
   have no text under the floor, no holes (§6.4), no truncated controls.
4. Uses the primitives; no forked header/tabs/toolbar markup.
5. `npx tsc --noEmit` is clean (`npm run build` only for the build commit; restore
   `dist/` otherwise — `.agents/rules/post-build-cleanup.md`).

---

## 10. Starter CSS

The complete addition to `src/index.css`, for Phase 0. Values are literal on
purpose (§3.2).

```css
/* ===========================================================================
   VIEW SIZE — see docs/VIEW-SIZE.md
   =========================================================================== */

@theme {
  /* Compact values are the defaults. */
  --text-micro: 0.625rem;     --text-micro--line-height: 1.25;
  --text-caption: 0.6875rem;  --text-caption--line-height: 1.35;
  --text-ui: 0.75rem;         --text-ui--line-height: 1.4;
  --text-body: 0.875rem;      --text-body--line-height: 1.55;
  --text-title-sm: 0.9375rem; --text-title-sm--line-height: 1.35;
  --text-title: 1.125rem;     --text-title--line-height: 1.3;
  --text-heading: 1.5rem;     --text-heading--line-height: 1.2;
  --text-display: 1.875rem;   --text-display--line-height: 1.1;
  --text-metric: 1.75rem;     --text-metric--line-height: 1.1;
  --container-measure: 72ch;
}

:root {
  --vs-scale: 1;
  --gutter: 1.5rem;
  --workspace-max: 100rem; /* Phase F: 200rem */
  --drawer-sm: 24rem; --drawer-md: 30rem; --drawer-lg: 42rem;
}

[data-view-size="normal"] {
  --vs-scale: 1.125;
  --spacing: 0.28125rem;
  --gutter: 2rem;
  --text-micro: 0.75rem;   --text-caption: 0.8125rem; --text-ui: 0.875rem;
  --text-body: 1rem;       --text-title-sm: 1.0625rem; --text-title: 1.25rem;
  --text-heading: 1.75rem; --text-display: 2.125rem;  --text-metric: 2rem;
  --container-3xs: 18rem;    --container-2xs: 20.25rem; --container-xs: 22.5rem;
  --container-sm: 27rem;     --container-md: 31.5rem;   --container-lg: 36rem;
  --container-xl: 40.5rem;   --container-2xl: 47.25rem; --container-3xl: 54rem;
  --container-4xl: 63rem;    --container-5xl: 72rem;    --container-6xl: 81rem;
  --container-7xl: 90rem;
  --drawer-sm: 27rem; --drawer-md: 33.75rem; --drawer-lg: 47.25rem;
}

[data-view-size="big"] {
  --vs-scale: 1.25;
  --spacing: 0.3125rem;
  --gutter: 2.5rem;
  --text-micro: 0.8125rem; --text-caption: 0.875rem;  --text-ui: 1rem;
  --text-body: 1.0625rem;  --text-title-sm: 1.1875rem; --text-title: 1.4375rem;
  --text-heading: 2rem;    --text-display: 2.5rem;    --text-metric: 2.375rem;
  --container-3xs: 20rem;    --container-2xs: 22.5rem;  --container-xs: 25rem;
  --container-sm: 30rem;     --container-md: 35rem;     --container-lg: 40rem;
  --container-xl: 45rem;     --container-2xl: 52.5rem;  --container-3xl: 60rem;
  --container-4xl: 70rem;    --container-5xl: 80rem;    --container-6xl: 90rem;
  --container-7xl: 100rem;
  --drawer-sm: 30rem; --drawer-md: 37.5rem; --drawer-lg: 52.5rem;
}

/* Phones keep a 16px gutter whatever size is chosen. After the size blocks,
   so it wins over them by source order at equal specificity. */
@media (max-width: 639.98px) {
  :root, [data-view-size] { --gutter: 1rem; }
}

/* The aside and paper documents: always the Compact (= stock) values. */
.view-size-fixed {
  --vs-scale: 1;
  --spacing: 0.25rem;
  --text-micro: 0.625rem;  --text-caption: 0.6875rem; --text-ui: 0.75rem;
  --text-body: 0.875rem;   --text-title-sm: 0.9375rem; --text-title: 1.125rem;
  --text-heading: 1.5rem;  --text-display: 1.875rem;  --text-metric: 1.75rem;
  --container-3xs: 16rem;  --container-2xs: 18rem;    --container-xs: 20rem;
  --container-sm: 24rem;   --container-md: 28rem;     --container-lg: 32rem;
  --container-xl: 36rem;   --container-2xl: 42rem;    --container-3xl: 48rem;
  --container-4xl: 56rem;  --container-5xl: 64rem;    --container-6xl: 72rem;
  --container-7xl: 80rem;
  --drawer-sm: 24rem; --drawer-md: 30rem; --drawer-lg: 42rem;
}

.workspace {
  container: workspace / inline-size;
  font-size: var(--text-ui);
  line-height: var(--text-ui--line-height);
  padding: var(--gutter);
  max-width: var(--workspace-max);
  margin-inline: auto;
  width: 100%;
}

@custom-variant ws-sm  { @container workspace (width >= 40em)  { @slot; } }
@custom-variant ws-md  { @container workspace (width >= 56em)  { @slot; } }
@custom-variant ws-lg  { @container workspace (width >= 72em)  { @slot; } }
@custom-variant ws-xl  { @container workspace (width >= 96em)  { @slot; } }
@custom-variant ws-2xl { @container workspace (width >= 120em) { @slot; } }

@custom-variant compact (&:where([data-view-size="compact"], [data-view-size="compact"] *));
@custom-variant normal  (&:where([data-view-size="normal"],  [data-view-size="normal"] *));
@custom-variant big     (&:where([data-view-size="big"],     [data-view-size="big"] *));

@utility grid-auto-* {
  grid-template-columns: repeat(auto-fill, minmax(min(100%, --spacing(--value(integer))), 1fr));
}

/* + the nine type recipes from §4.2 */
```

Note: `--spacing` is redefined in the size blocks but not in `:root`, because
Tailwind's `@theme` already declares it there (`0.25rem`).

---

## 11. Not in scope

- Colour tokens (§1).
- Redesigning the aside.
- Paper documents (offers, invoices) — fixed size by design.
- Per-module density toggles beyond the existing Leads "Compact rows".
- Changing translation strings' case (§5.3).
