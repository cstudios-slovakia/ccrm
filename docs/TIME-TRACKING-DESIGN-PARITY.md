# Time tracking: design parity with the Claude Design canvas

Canvas: https://claude.ai/artifact/G1ZJkEvLUbzXAQG8bpwwsd ("CCRM Time Tracking"). Prompt:
[`docs/prompts/time-tracking-design-parity.md`](prompts/time-tracking-design-parity.md). Audit of
2026-11-19 against `css-main` at `fda1a127`. Screenshots: `test-results/tt-design-parity/before/` and
`after/` (local, not committed).

**Branches.** The audit was made on `css-main` (which carries time tracking v2). The same FIX commits
were ported to `1.13-nectarine`, which has no v2: there the Calendar totals sum entry durations
(no worked-time engine), and rows citing tt2 commits describe `css-main` only.

**Precedence (highest first):** owner decisions after 26 Oct 2026 → `docs/TIME-TRACKING-V2.md` → the
app's own system (View size, primitives, branding, shell) → the canvas. Px sizes, fonts, radii and
shadows are never findings on their own.

**Classes.** FIX: the canvas wins. KEEP-DECISION: an owner decision wins (evidence cited).
KEEP-SYSTEM: the app's system wins (rule named). TT2: a tt2 phase rebuilds it. MISSING: the canvas
shows a feature the app does not have (owner decides). ASK: unclear, owner decides.

**Package column.** `S`, `B`, `C`, `D`, `E`, `G` are the Stage 2 packages below. `held` = a FIX that was
**not** done in this pass because a running tt2 session is editing that file right now (see "Stage 0").
`—` = nothing to do.

## Stage 0: why some FIX rows are held

When this audit ran, a separate session was building tt2 phases 3–5 on `css-main` (commits minutes
old, agent worktrees with uncommitted edits to `EntryDrawer.tsx`, `TimeTrackingSettingsPanel.tsx`,
`timeTrackingApi.ts` and a new `StartModePopover.tsx`). The prompt says to stop in that case. The
owner was away and asked for as much as possible, so the pass went ahead **without touching any file
that session is editing or that phases 5, 7, 8 and 10 rebuild**: `TimerBar.tsx`, `HeaderTimerPill.tsx`,
`TimeTrackingMobileBar.tsx`, `EntryDrawer.tsx`, `TimeTrackingSettingsPanel.tsx`, `TaskEditDrawer.tsx`,
`extensions/chrome-time-tracker/`. Their FIX rows are marked `held` and stay open.

## Shared causes

| # | Cause | Screens | Fix | Package |
|---|---|---|---|---|
| SC1 | Project shown as a slate name; no project-colour text, no client | List, Calendar, Timesheet, Reports | One `ProjectLabel` (dot + name in the project's text colour + optional client) | S |
| SC2 | "Assign project" drawn three ways (dashed pill, amber text, none) | List, Timesheet | One solid amber `AssignProjectChip`; dashed stays for Unsorted suggestions | S |
| SC3 | Running state has no label | List row, Calendar block | One rose `RunningBadge` | S |
| SC4 | Week/range navigation drawn four ways, three label formats | List, Calendar, Timesheet | One grouped `RangeNav` (prev · label · next, then "This week/Today") | S |
| SC5 | Cost figures violet everywhere | List, Reports, salary report, project tab | `MoneyText` default tone becomes plain slate; only the Team matrix keeps violet (C2 Visual mapping) | S |
| SC6 | Settings-style rules drawn as native checkboxes; canvas uses switches | Team, Extension settings (and held: drawer Billable, Settings rules) | One `Switch` (`role="switch"`) in `src/components/ui/` | S |
| SC7 | Project option row differs between the picker and the task popover | Entry picker, task drawer popover | Same meta line and selected tint in both | E |
| SC8 | Stat tiles without their note line | List, Reports | Use `StatTile`'s existing `delta` slot for the canvas note | S, D |
| SC9 | Primary actions in module teal instead of `bg-primary` | Extension settings, Reports mode switch | `bg-primary` for primary actions; teal stays the module accent | D, G |

## 1 · Timer + List (`Main.dc.html`)

| # | Canvas | App now | Class | Evidence or rule | Package |
|---|---|---|---|---|---|
| L1 | Start/Stop as round icon buttons | Text buttons, `TimerBar.tsx:324,329` | TT2 | phase 5 rebuilds the bar (D5.4) | held |
| L2 | Tags icon in the timer bar | Tags only in the drawer | MISSING | C11.6 | — |
| L3 | Linked task as a grey chip | Teal box, `TimerBar.tsx:238` | TT2 | phase 5 | held |
| L4 | Timer/Manual stacked icon toggle | Text segmented, `TimerBar.tsx:337` | TT2 | phase 5 | held |
| L5 | Manual: Start→End, Today, computed duration | Date, from, to, duration, `TimerBar.tsx:308` | TT2 | phase 5 | held |
| L6 | No Description row | Description row | KEEP-DECISION | `aad2b344`, B13 | — |
| L7 | Header "Add entry manually" + ⋯ menu | Settings link only | ASK | manual mode already lives in the bar | — |
| L8 | Canvas subtitle copy | App subtitle | KEEP-SYSTEM | module header pattern | — |
| L9 | Week tile "/ 40:00" with a progress bar | "z 40:00 cieľ", no bar | ASK | `StatTile` has no bar slot | — |
| L10 | Billable "22:40 · 79 %" | Percent only | KEEP-DECISION | C11.1 "Billable %" | — |
| L11 | Cost tile note "at €x/h · monthly salary" | Value only | FIX | SC8 | S |
| L12 | Week nav in one pill, "This week · 19–25 Oct" | Three loose buttons | FIX | SC4 | S |
| L13 | Filter button | None | MISSING | C11.1 names a filter | — |
| L14 | Viewing-as avatar button | `CustomSelect` beside the tabs | KEEP-SYSTEM | one dropdown kind `9f49f3b8`; C2 | — |
| L15 | Day header select-all checkbox, day cost | Date, holiday chip, `WorkedTotal` | ASK | select-all is a new interaction; day cost needs a column decision | — |
| L16 | "Today"/"Yesterday" day labels | Full date | ASK | copy | — |
| L17 | Running row: RUNNING badge | Rose tint only, `EntryRow.tsx:64` | FIX | SC3 | S |
| L18 | Project dot + name in project colour + client | Slate name, `EntryRow.tsx:103` | FIX | SC1 | S |
| L19 | Task line under the description | Link icon before the title | KEEP-DECISION | C5: a linked entry's title is the task's | — |
| L20 | All tags | Max 2, hidden below ws-md | KEEP-SYSTEM | View size row density | — |
| L21 | "Assign project" solid amber pill | Dashed, `EntryRow.tsx:109` | FIX | SC2 | S |
| L22 | Cost column always visible | Hidden below ws-lg | KEEP-SYSTEM | VIEW-SIZE breakpoints | — |
| L23 | "Load earlier entries" | Week navigation | KEEP-SYSTEM | the List is week-scoped (C11.1) | — |
| L24 | Group count next to the title | Count button at row start | KEEP-DECISION | `debf869a` | — |
| L25 | Billable icon, hover ▶/⋯, checkbox | Present | match | | — |

## 2 · Calendar (`Calendar.dc.html`)

| # | Canvas | App now | Class | Evidence or rule | Package |
|---|---|---|---|---|---|
| C1 | Day/Week/Month segmented | `CustomSelect` | KEEP-SYSTEM | one dropdown kind `9f49f3b8` | — |
| C2 | Grouped range nav | Loose buttons, `TimeCalendarView.tsx:540` | FIX | SC4 | B |
| C3 | Week total in the toolbar | None | FIX | V2 D5.5 "day and week totals" | B |
| C4 | Day totals in the column heads | None | FIX | V2 D5.5 | B |
| C5 | Running block "Running · 1:12" | Rose, no label, `:659` | FIX | SC3 | B |
| C6 | Block shows project dot + name | Title, time, billable dot | FIX | SC1 | B |
| C7 | Block tint in project colour | Same | match | | — |
| C8 | Now line with label | Same | match | | — |
| C9 | Draft "+ New entry 17:00–18:00", dashed | Solid teal draft, no label | FIX (style, label) / KEEP-DECISION (09:00 default) | phase 3 Left over | B |
| C10 | Popover: chips, Continue/Edit/Duplicate/Delete | Title, time, picker, billable, Open/Delete | ASK | C11.2 says only "quick popover" | — |
| C11 | Rail "Your tasks this week" with tracked time | "Your tasks", project only | FIX (copy) / MISSING (tracked time) | | B |
| C12 | Right rail | Same | match | | — |

## 3 · Timesheet (`Timesheet.dc.html`)

| # | Canvas | App now | Class | Evidence or rule | Package |
|---|---|---|---|---|---|
| T1 | Copy rows + Submit week | Present; Submit only with approval | KEEP-DECISION | C11.3, phase 6 Left over | — |
| T2 | Cost column per row and total | None | ASK | not in C11.3; needs the cost permission | — |
| T3 | Project · task on one line, project colour | Stacked, slate | FIX | SC1 | B |
| T4 | "No project — assign" amber pill | Amber text | FIX | SC2 | B |
| T5 | "Add row — pick project and task" dashed row at the foot | Toolbar button | FIX | canvas location and kind | B |
| T6 | Totals row | Same | KEEP-SYSTEM | Totals rows | — |
| T7 | (no Worked row) | Worked row | KEEP-DECISION | tt2 phase 2d `264ebee5` | — |
| T8 | Two explainer notes at the foot | None | MISSING | copy only; owner decides | — |
| T9 | Holiday column tint | Same | match | | — |
| T10 | Range nav pill "Week 43 · 19 – 25 Oct" | Loose buttons | FIX | SC4 | B |

## 4 · Entry drawer + project picker (`EntryDrawer.dc.html`)

| # | Canvas | App now | Class | Evidence or rule | Package |
|---|---|---|---|---|---|
| E1 | Source chips "Started from task", "Timer" | Provenance line, `EntryDrawer.tsx:453` | FIX | canvas header | held |
| E2 | One Description field | Title + Description | KEEP-DECISION | `aad2b344`, C5 | — |
| E3 | Trigger shows the client | Dot + name, `ProjectPicker.tsx:158` | FIX | canvas | E |
| E4 | Option meta "3:27 this week · 186:30 total" | Total only, `:207` | FIX | SC7 | E |
| E5 | Selected option primary tint, no check | Slate + teal check, `:202` | FIX | SC7 | E |
| E6 | "Create project" and "Show finished" on one row | Stacked, `:220` | FIX | layout | E |
| E7 | Create form as a card with a Name field, "Create & assign" | Inline Client + Type; name from search | ASK | C11.7, `6cc80aee` keep it inline | — |
| E8 | Placeholder "project, client or code" | "Search project or client…" | FIX | copy | E |
| E9 | Task row plain bordered with hint | Teal box, `EntryDrawer.tsx:306` | FIX | | held |
| E10 | Date · Start · End · Duration in one row | Three rows, `:374` | FIX | | held |
| E11 | Person select with hint | `CustomSelect`, no hint | KEEP-SYSTEM (kind) / FIX (hint) | `9f49f3b8` | held |
| E12 | Tags as chips | Comma input | ASK | needs a new tag-chip primitive | — |
| E13 | Billable switch with rate line | Checkbox, `:418` | FIX | SC6 | held |
| E14 | Cost panel with formula sentence and Margin | No formula, no margin, `:427` | FIX | C11.6, C7.3 | held |
| E15 | (no worked line) | `DrawerWorkedLine` | KEEP-DECISION | tt2 phase 2b `f6b20410` | — |
| E16 | Hold to delete, Duplicate, Cancel, Save | Same | match | | — |

## 5 · Start from a task (`TaskStart.dc.html`)

| # | Canvas | App now | Class | Evidence or rule | Package |
|---|---|---|---|---|---|
| K1 | ▶ on task cards, rose running card | No card timer | KEEP-DECISION | `aad2b344` | — |
| K2 | "Which project?" popover on the card | Same popover in the drawer | KEEP-DECISION | `aad2b344` | — |
| K3 | Popover explanation sentence | Title only, `TaskTimeControls.tsx:149` | FIX | copy | E |
| K4 | Popover options with status pill | Name only, `:159` | FIX | SC7 | E |
| K5 | Section header with icon and "+ Add time manually" | Text only, `TaskEditDrawer.tsx:1027` | ASK | C9.2 names it; it is a new entry point | — |
| K6 | Running banner "You are tracking this task · Started 13:40" | Rose ■ + chip | TT2 | phase 5/8 (parallel timers on one task) | held |
| K7 | Three tiles Tracked/Estimate/Cost + bar | Chip, input, cost line | ASK | tiles vs `e2a3adda` block style | — |
| K8 | Entry rows with avatar and range | Per-person totals | ASK | C9.2 reads both ways | — |
| K9 | Footnote "prefills the description" | None | KEEP-DECISION | `aad2b344` (typed before Start) | — |
| K10 | Start toast with Undo of the stopped timer | None | TT2 | phase 5 | — |
| K11 | Description input | Present | KEEP-DECISION | `aad2b344` | — |

## 6 · Project → Time (`ProjectTime.dc.html`)

| # | Canvas | App now | Class | Evidence or rule | Package |
|---|---|---|---|---|---|
| P1 | Tab badge "186:30" | No badge, `ProjectDetailsView.tsx:3144` | FIX | tab badges exist for Tasks/Finances | E |
| P2 | "Add time" button | None | ASK | new entry point | — |
| P3 | Start only | Start/Stop | KEEP-DECISION | `d74adb2b`, `c2986aff` | — |
| P4 | Period group + Export CSV | None | TT2 | phase 9 (exports) | — |
| P5 | Five stat tiles | Block captions | KEEP-DECISION (block layout) / TT2 (billable value, margin) | `e2a3adda`; phase 9 | — |
| P6 | Hours-per-week chart | None | MISSING | | — |
| P7 | By-task bars with estimate | None | MISSING | data exists (`totals.byTask`) | — |
| P8 | By-employee cost table | None | MISSING | | — |
| P9 | Finances footnote "Labour (time tracking)" | None here | TT2 | phase 9 | — |
| P10 | No edit inputs | Budget/rate inputs | KEEP-DECISION | the tab is where they are set (`e2a3adda`) | — |
| P11 | No entries list | Team entries + Toggl badge | KEEP-DECISION | `9c6d0dcc`, `3dad84dc` | — |

## 7 · Reports + salary allocation (`Reports.dc.html`)

| # | Canvas | App now | Class | Evidence or rule | Package |
|---|---|---|---|---|---|
| R1 | Key-labelled filter chips, month period | Date inputs + `CustomSelect`s | ASK (period) / KEEP-SYSTEM (dropdowns) | `9f49f3b8` | — |
| R2 | Report-type segmented control | Teal filled buttons, `TimeReportsView.tsx:387` | FIX | SC9, component kind | D |
| R3 | CSV/PDF top right | Toolbar primary slot | KEEP-SYSTEM | Toolbar | — |
| R4 | Stat cards with a note line | No note | FIX | SC8 | D |
| R5 | Billable value tile | None | TT2 | phase 9 | — |
| R6 | Hours-per-working-day chart | Tile only | MISSING | C12 names it | — |
| R7 | Share by project in project colours with % | Teal bars, hours only | FIX (colour, %) / ASK (donut) | Visual mapping: project colour everywhere | D |
| R8 | Table rows with dot and client line | Plain group name | FIX (dot, client) / TT2 (value, margin) / KEEP-DECISION (default grouping "title", phase 4) | | D |
| R9 | Click a row to split | None | MISSING | | — |
| R10 | Money in slate | Violet | FIX | SC5 | S |
| R11 | Salary allocation as a section below | Separate mode | ASK | | — |
| R12 | Salary title and basis sentence | Month nav only | FIX | copy; data computed | D |
| R13 | Person name + role/salary line | Name only, `TimeSalaryReport.tsx:173` | FIX | hierarchy | D |
| R14 | Heads "Loaded salary", "Tracked" | "Salary", "Hours" | FIX | copy | D |
| R15 | Split bar: client blue, internal slate, unallocated hatched amber | Emerald / teal / solid amber | FIX | emerald is the billable role (C2) | D |
| R16 | Utilisation three tiers | Amber below 75 % | ASK | thresholds | — |
| R17 | (no "time without salary" block) | Present | KEEP-DECISION | C12 | — |
| R18 | Cards, table heads, Totals | Same primitives | KEEP-SYSTEM | | — |

## 8 · Settings → Time tracking (`Settings.dc.html`)

| # | Canvas | App now | Class | Evidence or rule | Package |
|---|---|---|---|---|---|
| S1 | Own Settings page | Section `projects/time` | KEEP-SYSTEM | Settings registry, docs/SETTINGS.md | — |
| S2 | Card title "Cost rate from salary" | "Hourly cost of a worker" | FIX | copy | held |
| S3 | Hours basis radio cards | `CustomSelect` | KEEP-SYSTEM | `9f49f3b8` | — |
| S4 | 3-column grid with a Contractors row | 2 columns | FIX | | held |
| S5 | Per-employee rate preview table | One example sentence | FIX | | held |
| S6 | "Re-price a period" | `HoldToConfirm` | KEEP-SYSTEM | | — |
| S7 | Rules with a note line and a switch | Label-only checkboxes | FIX | SC6 | held |
| S8 | Eight rules | All present | match | | — |
| S9 | Rounding as a segmented control | Two `CustomSelect`s | ASK | | — |
| S10 | "Who sees what" matrix | None | MISSING | roles live in Users & roles | — |
| S11 | Toggl/Clockify summary card | Full Toggl panel | KEEP-DECISION (Toggl, `cda9ffbe`, `d8f2b6aa`) / MISSING (Clockify, A5.5) | | — |
| S12 | Header, nav, Save | App shell, sticky Save | KEEP-SYSTEM | | — |

## 9 · Mobile (`Mobile.dc.html`)

| # | Canvas | App now | Class | Evidence or rule | Package |
|---|---|---|---|---|---|
| M1 | Large running card, round Stop | Small fixed card, `TimeTrackingMobileBar.tsx:35` | TT2 | phase 10 | held |
| M2 | No input bar on phone | Full `TimerBar` | TT2 | phase 10 | held |
| M3 | Bottom bar Timer/Calendar/Tasks/Add | Same | match | | — |
| M4 | Own top bar | App shell | KEEP-SYSTEM | | — |
| M5 | Today only, 44 px ▶ | Week day cards | ASK | C17 "today" vs C11.1 "week" | — |
| M6 | Strip scrolls, add form stacks | Same | match | | — |
| M7 | (no tabs on phone) | Tabs scroll | ASK | | — |

## 10 · Daily log + Unsorted (`Day.dc.html`)

| # | Canvas | App now | Class | Evidence or rule | Package |
|---|---|---|---|---|---|
| D1 | 14-day strip | Same | match | | — |
| D2 | Strip legend | None | FIX | copy | C |
| D3 | Day header, dark Add row button | Primary Add row | KEEP-SYSTEM | Visual mapping: primary | — |
| D4 | Add form open by default, hint text | Opens on click, no hint | KEEP-DECISION (on click, C11.4) / FIX (hint) | | C |
| D5 | Person group with role badge, rate, cost | Role badge only in team view | KEEP-DECISION | C11.4 | — |
| D6 | Row delete on hover | Edit via drawer | ASK | | — |
| D7 | Unsorted copy "Captured by your Chrome extension…" | "Sites you visited…" | FIX (copy) | | C |
| D8 | Hours-only row | Same | match | | — |

## 11 · Team (`Team.dc.html`)

| # | Canvas | App now | Class | Evidence or rule | Package |
|---|---|---|---|---|---|
| W1 | Tab set | Same | match | | — |
| W2 | No "Viewing as" | Present | KEEP-SYSTEM | C2 | — |
| W3 | Own page heading | Module header | KEEP-SYSTEM | | — |
| W4 | "Active projects only" pressed toggle | Checkbox in a box | FIX | SC6 | C |
| W5 | "All projects" select | `CustomSelect` | KEEP-SYSTEM | `9f49f3b8` | — |
| W6 | Weekly/Monthly segmented | Teal segmented | KEEP-SYSTEM | module colour | — |
| W7 | Period label "W37 – W44" | Date range | FIX | copy | C |
| W8 | Column heads "W41 / 5–11 Oct" | Date only | FIX | copy | C |
| W9 | Role label palette | `RoleBadge` tones, Contractor amber | ASK | amber is reserved for Assign/Unsorted (C2) | — |
| W10 | Amber bar under 75 % for employees only | Amber for every row | KEEP-DECISION | C11.5 (no exemption) | — |
| W11 | Vacation text teal | Slate | FIX | colour role | C |
| W12 | Current-week tint | Teal tint | KEEP-SYSTEM | | — |
| W13 | Totals row; Total column | Same; both read "Spolu" in Slovak | FIX (copy collision) | | C |
| W14 | Popover footer "40:30 of 40:00 h · 101 %" | None | FIX | | C |
| W15 | Legend (bar meaning, under 75 %, no rate) | None | FIX | copy for existing rules | C |
| W16 | Hours and cost per cell | Worked · Delivered | KEEP-DECISION | tt2 phase 2c `f4eda6da` | — |

## 12 · Chrome extension (`Extension.dc.html`)

| # | Canvas | App now | Class | Evidence or rule | Package |
|---|---|---|---|---|---|
| X1 | Own page | Inside Settings → Time tracking | KEEP-DECISION | phase 5 Left over | — |
| X2 | Primary Download in `bg-primary` | Teal, `ExtensionSettings.tsx:89` | FIX | SC9 | G |
| X2b | "Setup guide" button | None | MISSING | | — |
| X3 | Three step cards Install / Pair / Track | Ordered list | FIX | | G |
| X4 | Pairing card with Copy | Code without Copy, `PairedBrowsers.tsx:60` | FIX (Copy) / KEEP (on-demand code: behaviour) | | G |
| X5 | Device rows | Same, Revoke is HoldToConfirm | KEEP-SYSTEM | | — |
| X6 | Activity capture switch | Checkbox, `ExtensionSettings.tsx:145` | FIX | SC6 | G |
| X7 | Watched sites: pattern → project dot + name | Raw project **id**, `:157` | FIX | SC1 | G |
| X8 | Per-user retention | Company retention | KEEP-DECISION | C13 | — |
| X9 | Privacy line incl. "managers never see unsorted" | Shorter paragraph | FIX | copy | G |
| X10 | Company switches | Admin box | KEEP-DECISION | C13 | — |
| X11–X16 | Popup: header, round Stop, Recent, Start state, copy | Different | TT2 | phase 10 rebuilds the popup | held |
| X16b | Popup strings in English with a literal product name | Same | FIX | branding rule, t(en,sk,hu) | held (phase 10) |
| X17 | Badge "1:12" | Same | match | | — |

## Header pill and sidebar

| # | Canvas | App now | Class | Evidence or rule | Package |
|---|---|---|---|---|---|
| H1 | Pill title + project line | One line | TT2 | phase 5 (D5.4) | held |
| H2 | Idle "Start timer" in primary | Teal play icon, `HeaderTimerPill.tsx:52` | FIX | Visual mapping | held |
| H3 | Pill opens the timer bar | Same | KEEP-DECISION | `debf869a` | — |
| H4 | "CCRM" brand | Product name | KEEP-SYSTEM | docs/BRANDING.md | — |
| B1 | Stopwatch glyph | `Timer` | match | | — |
| B2 | Teal module tile | Section palette colour | KEEP-DECISION | `7bece137` one hue per section; C2 text still says teal → ASK to update the doc | — |

## Counts

Counted per row; a row with two classes counts in both.

| Class | Rows |
|---|---|
| FIX | 61 (12 of them held) |
| KEEP-DECISION | 29 |
| KEEP-SYSTEM | 24 |
| TT2 | 15 |
| MISSING | 12 |
| ASK | 21 |
| match (no difference) | 14 |

## Package plan (Stage 2)

Run one at a time (the machine is short on RAM and a tt2 session is running its own agents).

| Pkg | Scope | Files |
|---|---|---|
| S | SC1–SC6, SC8 primitives; List rows L11, L12, L17, L18, L21; R10 | `shared.tsx` or new small modules, `MoneyText.tsx`, `src/components/ui/Switch.tsx`, `TimeListView.tsx`, `EntryRow.tsx`, `TimeTeamView.tsx` (keep violet) |
| B | Calendar C2–C6, C9, C11; Timesheet T3–T5, T10 | `TimeCalendarView.tsx`, `TimeTimesheetView.tsx` |
| C | Day D2, D4, D7; Team W4, W7, W8, W11, W13–W15 | `TimeDayView.tsx`, `UnsortedInbox.tsx`, `TimeTeamView.tsx` |
| D | Reports R2, R4, R7, R8, R12–R15 | `TimeReportsView.tsx`, `TimeSalaryReport.tsx` |
| E | Picker E3–E6, E8; task popover K3, K4; tab badge P1 | `ProjectPicker.tsx`, `TaskTimeControls.tsx`, `ProjectDetailsView.tsx` (must not grow) |
| G | Extension settings X2–X4, X6, X7, X9 | `ExtensionSettings.tsx`, `PairedBrowsers.tsx` |
| held | E1, E9–E11, E13, E14, S2, S4, S5, S7, L1, L3–L5, H1, H2, K6, M1, M2, X11–X16b | wait for tt2 phases 5, 8, 10 or for the running session to merge |

## Done log

| Package | Commit | Rows |
|---|---|---|
| (filled in as packages merge) | | |
