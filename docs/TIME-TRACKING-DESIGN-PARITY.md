# Time tracking: design parity with the Claude Design canvas

Canvas: https://claude.ai/artifact/G1ZJkEvLUbzXAQG8bpwwsd ("CCRM Time Tracking"). Prompt:
[`docs/prompts/time-tracking-design-parity.md`](prompts/time-tracking-design-parity.md). Audit of
2026-11-19 against `css-main` at `fda1a127`. Screenshots: `test-results/tt-design-parity/before/` and
`after/` (local, not committed).

**Branches.** The audit was made on `css-main` (which carries time tracking v2). The same FIX commits
were ported to `1.13-nectarine`, which has no v2: there the Calendar totals sum entry durations
(no worked-time engine), and rows citing tt2 commits describe `css-main` only.

**Pass 2.** This first pass left most screens looking like the old design (lenient KEEP calls, the frame
never touched). A stricter second pass is planned in
[`docs/prompts/time-tracking-design-parity-2.md`](prompts/time-tracking-design-parity-2.md).

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

Commits on `css-main` (the same changes were cherry-picked to `1.13-nectarine`).

| Package | Commit(s) | Rows done | Rows not done, and why |
|---|---|---|---|
| Audit | `ac83a56d` | this report; canvas link back at the top of C2 | |
| S | `ab549491`, `4d54e949` | SC1–SC6, L12, L17, L18, L21, R10 (and List costs slate) | L11/SC8: no single "at €x/h" rate on the client (rates are per entry); client names are not on entries, so `ProjectLabel` shows no client in List yet |
| B | `e894b4e8`, `17a6cc8f` | C2–C6, C9, T3, T4, T5, T10 | T10 label is the date range only (no "Week 43"); C11 copy reverted in review: the rail is not filtered to the week, so "Your tasks" stays |
| C | `dfc1aa06` | D2, D4, D7, W4, W7, W8, W11, W13, W14, W15 | D7 has no "Chrome extension settings →" link (new navigation) |
| E | `4e22c843` | E3, E5, E6, K3, K4, P1 | E4: the picker has no "this week" seconds (needs a new prop from its callers); E8: search does not match a project code, wording kept |
| G | `4ad809d3` | X2, X3, X4, X6, X9 | X7 held: showing project names needs `projects` passed from `TimeTrackingSettingsPanel.tsx` (held file) |
| Review | `efd1c277`, `f6f77498` | Calendar totals count worked time; translated week labels; dark-mode project names; selected project keeps a check (accessibility, over the canvas); extension switches toggle from their text; task-drawer costs slate (SC5) | |
| D | `5610a556` | R2, R4, R7, R8 (project dot and client line), R12–R15 | R8 Billable value / Margin columns: the report carries no billable value |
| H1 | `14d8781a` | E1, E9, E10, E11, E13, E14, drawer cost slate (SC5) | |
| H2 | `1261b3ee` | S2, S4, S5 (new `RateCardPreview`), S7, X7, H2 | |
| K (owner approved, 2026-11-20) | `a55d077f` | K5 "+ Add time manually" in the task drawer, P2 "Add time" on the project Time tab | |
| Review 2 | `aa5addc5`, `97530bb7`, `19817db9` | cost formula uses worked time (≈ when rounded), Margin hidden for parallel entries, honest hints and setting notes, rate-freeze wording per V2 D4.3, preview filters and "before paid leave", company-wide salary basis, project names in watched sites, salary title casing | |

## Checks and QA (2026-11-19)

- `npm run check` green on `css-main` and on `1.13-nectarine` after every merge.
- One scoped QA run over all changed files (`css-main` at `4ad809d3`): 66 passed, 3 failed.
  - **Dark mode: project names below 3:1** (`darkmode.spec.ts` › Time Tracking). Root cause: `ProjectLabel`
    darkened the project colour with an inline style the dark palette cannot remap. Fix: it now uses the
    theme's accent-lift mix (`f6f77498`); the test passes.
  - **`projectStatuses.spec.ts`**, two tests: pre-existing. They fail the same way on `ec7f25df`, before any
    parity change to a project file, and both are in `scripts/qa/known-failing.json`.
- Screenshots: `test-results/tt-design-parity/before/` and `after/` (local only).


---

# Pass 2 (2026-11-20): stricter audit, rendered canvas beside app screenshots

Prompt: [`docs/prompts/time-tracking-design-parity-2.md`](prompts/time-tracking-design-parity-2.md). Audit against
`css-main` at `d2ea4268`. Canvas renders: `test-results/tt-design-parity-2/canvas/`; app screenshots (QA mock data,
Normal view size, 1440 wide, phone 390): `test-results/tt-design-parity-2/before/` (local, not committed).
Review page (canvas, app before, app after): see "Review page" at the end of this part.

**Precedence (highest first):** owner decisions (only for what they actually decided) → `docs/TIME-TRACKING-V2.md`
(drawn in the canvas's visual language) → the app's tokens only (font, colour tokens, View size, shell, Settings
navigation, branding) → the canvas for everything else.

**Classes.** FIX: the canvas wins (the default). KEEP-DECISION: an owner decision wins, evidence cited.
KEEP-V2: time tracking v2 wins, drawn in canvas style. KEEP-TOKEN: font, colour token, View size, shell, branding.
MISSING: needs new data, API, permission or behaviour. ASK: the owner decides (question number in brackets, see
"The stop"). Pass 1 rows that were KEEP-SYSTEM are re-judged here; a row not listed below keeps its pass 1 result.

**Known limits of this audit.** The canvas renderer does not draw rows that come from a loop inside a table or a
list (List rows, Calendar blocks, Timesheet cells, Team cells); those were compared from the canvas source. The
extension popup has no app screenshot and was compared from code. The Unsorted inbox screenshot failed to capture
(the QA dataset has no unsorted items), so its rows come from code.

## Shared causes (pass 2)

| # | Cause | Screens | Fix |
|---|---|---|---|
| G1 | The frame is the old one: header actions, two-row timer bar with text buttons, tabs alone in their row | every tab | Package F |
| G2 | Per-view controls (range nav, zoom, totals, Unsorted, Viewing as) sit inside each view, not in the one toolbar row | List, Calendar, Timesheet, Day, Team, Reports | A toolbar slot in the shell that each view fills |
| G3 | Segmented controls and radio cards drawn as dropdowns | Calendar zoom, Settings hours basis, Settings rounding | Segmented / radio cards (`9f49f3b8` chose the dropdown component only) |
| G4 | Stat tiles without note line, inline target or progress bar | List, Reports, project Time tab, task drawer | One tile variant with note, target and bar |
| G5 | No charts anywhere in the module although the data is on the client | Reports (hours per day, donut), project Time tab (hours per week, by task) | One small chart module, reused |
| G6 | Billable value, margin and client/internal split not shown although entries carry the rate | Reports, project Time tab | Compute in `timeReports.ts`, show as tiles and columns |
| G7 | Round icon buttons drawn as text buttons or squares | Timer bar, parallel container, list running row, task drawer, mobile card | One round Start/Stop/Pause button |
| G8 | Popovers and rows hide or rename the canvas's actions | Calendar popover, Day rows | Canvas action set |
| G9 | Violet or teal money and amber accents outside their role | Day group rate and cost, salary Rate/Tracked, Calendar untimed lane, Client PDF button, Submit week | Slate money (violet only in the Team matrix), amber only for Assign project and Unsorted, `bg-primary` for primary actions |
| G10 | Copy differs from the canvas where the app has no better wording | all | Canvas copy as `t(en, sk, hu)`, only where true |

## F · The frame (`TimeTrackingView.tsx`, `TimerBar.tsx`, `TimerContainer.tsx`, `StartModePopover.tsx`, `HeaderTimerPill.tsx`, `ViewingAsSelect.tsx`)

| # | Canvas | App now | Class | Evidence or rule | Pkg |
|---|---|---|---|---|---|
| F1 | Header actions: "+ Add entry manually" and a ⋯ menu | One "Settings" link, `TimeTrackingView.tsx:85` | FIX | owner decision 20 Nov; Settings into ⋯ is ASK [Q1] | F |
| F2 | Subtitle "Track work against projects and tasks. Labour cost is calculated from each employee's salary." | Different sentence, `:84` | FIX | copy; true for the app | F |
| F3 | Timer bar is one slim row | Two rows (Description under it), `TimerBar.tsx:386` | FIX | owner decision 20 Nov: Description behind a small button, field opens under the row and stays open while it has text | F |
| F4 | Project as a pill chip in the project's colour, dot and chevron; amber when unassigned | Bordered picker trigger | FIX | canvas; `ProjectPicker` gets a chip trigger variant | F |
| F5 | Linked task as a grey chip (check icon, name) after the project | Teal box that replaces the title field, `:263` | FIX (chip) / KEEP-DECISION (the title is the task's, C5) | canvas; `docs/TIME-TRACKING.md` C5 | F |
| F6 | Tags icon button | None | ASK [Q3] | entries already carry `tags`; needs a small tag popover | F |
| F7 | Billable € as a borderless tinted icon | Bordered square, `:314` | FIX | canvas | F |
| F8 | Hairline divider before the clock | None | FIX | canvas | F |
| F9 | Big clock, rose while running | Slate, same size as the title, `:340` | FIX | canvas | F |
| F10 | Round Start (primary) and round Stop (rose), icon only | Text buttons "Start" / "Stop", `:343,349` | FIX | canvas; the presence ring (v2 phase 7) is drawn around the round button | F |
| F11 | Timer/Manual toggle as two stacked icons, always visible | Text segmented, hidden while running, `:358` | FIX (kind) / ASK [Q4] (visible while running) | canvas | F |
| F12 | Manual mode: Start → End, "Today" date button, computed duration as the big number, pill "Add" | Date input, two time inputs, duration input, "Add", `:325` | FIX | canvas; the duration stays typeable (hours-only entry, C11.4) | F |
| F13 | Tabs in a compact pill group on the left, every tab with an icon | Tabs stretch the full row; Team and Reports have no icon, `:95-106` | FIX | canvas | F |
| F14 | Range navigator on the right of the toolbar row | Inside each view, under the tiles in List | FIX | owner decision 20 Nov; G2 | F |
| F15 | Amber "Unsorted · N" chip in the toolbar row | Only inside the Day tab | FIX | owner decision 20 Nov; the count is on the client (`UnsortedInbox`) | F |
| F16 | "Viewing as" as an avatar button | Label and bare select, `ViewingAsSelect.tsx` | FIX | owner decision 20 Nov (same dropdown inside) | F |
| F17 | Filter button | List tab: funnel button with Project, Billable, Tags (browser-side) | DONE [Q2] | M1 | F17 |
| F18 | (single timer) | Parallel container: rows with text "Pause", square Stop, footer with "Pause all" / "Stop all" | KEEP-V2 / FIX (style) | V2 D5.4; each row drawn like the slim bar: title, project chip, clock, round Pause, round Stop | F |
| F19 | (single timer) | Start-mode popover "Switch / Run in parallel" | KEEP-V2 | V2 D5; canvas popover style | F |
| F20 | Header pill: title with a project line under it | Title only, project dot, `HeaderTimerPill.tsx:94` | FIX | canvas; V2 "+N" badge stays | F |
| F21 | Header pill idle: "Start timer" with a round primary play disc | Outline play icon, `:70` | FIX | `Header.dc.html` idle state | F |
| F22 | Header and timer bar on every tab | Same | match | | — |
| F23 | Pill opens the timer bar | Same | KEEP-DECISION | `debf869a` | — |

## 1 · List body (`TimeListView.tsx`, `EntryRow.tsx`)

| # | Canvas | App now | Class | Evidence or rule | Pkg |
|---|---|---|---|---|---|
| L1 | Today tile note "3 entries + running timer" | No note | FIX | G4 | P1 |
| L2 | Week tile "28:37 / 40:00" inline, progress bar | "of 40:00 target" below, no bar | FIX | G4 | P1 |
| L3 | "Billable this week": hours, %, bar | % only | FIX (hours, bar, label) | C11.1 says "Billable %": the % stays, hours are added | P1 |
| L4 | Cost tile: lock icon, note "at €24.58 / h · monthly salary, loaded" | No lock, no note | FIX (lock) / ASK [Q7] (note) | rates are per entry | P1 |
| L5 | Day header: select-all checkbox, day cost, day total | Total only | FIX | client-side; cost gated by the cost permission | P1 |
| L6 | Day label "Today / Yesterday / Tuesday" + short date, neutral | Full date, today in teal | FIX | canvas | P1 |
| L7 | Running row ends in a round rose Stop | No Stop in the row | FIX | G7; Stop exists | P1 |
| L8 | Task as its own element after the title | Link icon before the title | ASK [Q6] | C5 vs C11.1 | P1 |
| L9 | Project name with client after "·" | Name only | FIX | `ProjectLabel` supports a client; pass the project's client from the lookups | P1 |
| L10 | Hover ▶ and ⋯ in primary | Slate | FIX | colour role | P1 |
| L11 | "Load earlier entries" | Week navigation | KEEP-DECISION | C11.1 week-scoped; the canvas toolbar has the week navigator too | — |
| L12 | (no worked line) | "of your time" line | KEEP-V2 | V2 D9, muted | — |
| L13 | (no bulk bar, no holiday chip drawn) | Present | KEEP-DECISION | C11.1 bulk bar; holidays `docs/TIME-TRACKING.md:174` | — |
| L14 | Tags and cost always visible | Hidden at narrow widths | KEEP-TOKEN | View size breakpoints | — |

## 2 · Calendar (`TimeCalendarView.tsx`)

| # | Canvas | App now | Class | Evidence or rule | Pkg |
|---|---|---|---|---|---|
| C1 | Day/Week/Month segmented | Dropdown, `:575` | FIX | G3 | P2 |
| C2 | Order: zoom, range nav, "Week total" chip, all in the toolbar row | Range nav first, total as plain text | FIX | G2 | P2 |
| C3 | Range label with the year | No year | FIX | copy | P2 |
| C4 | Day total on the head row beside the date | Stacked under it | FIX | canvas | P2 |
| C5 | Today: filled number circle | Whole column tinted | FIX (shape) / KEEP-TOKEN (hue) | canvas | P2 |
| C6 | Untimed lane neutral | Amber | FIX | G9; the lane itself is KEEP-DECISION (`docs/TIME-TRACKING.md:376`) | P2 |
| C7 | Popover: title, project · client line, task / Billable / tag chips | Title, time, editable project picker, billable | FIX (chips) / ASK [Q8] (picker or label) | canvas | P2 |
| C8 | Popover grid: date and range, duration · cost | Duration only | FIX | cost gated by the cost permission | P2 |
| C9 | Popover actions: Continue (primary), Edit, Duplicate icon, Delete icon, × top right | Open, Delete, Close as text | FIX | G8; Continue and Duplicate exist | P2 |
| C10 | Rail "Your tasks this week", icon | "Your tasks" | ASK [Q9] | the rail is not week-filtered | P2 |
| C11 | Rail row: grip, text, round play at the right, "· 3:27 tracked" | Play at the left, project only | FIX | tracked time derived from loaded entries | P2 |
| C12 | Rail tip box and canvas subtitle | None, shorter | FIX | copy, both behaviours exist | P2 |
| C13 | Hours 08–19 | 24 h scroller | KEEP-TOKEN | density | — |
| C14 | (single block) | Parallel cluster | KEEP-V2 | V2 D5.5 | — |

## 3 · Timesheet (`TimeTimesheetView.tsx`, `SubmitWeekButton.tsx`)

| # | Canvas | App now | Class | Evidence or rule | Pkg |
|---|---|---|---|---|---|
| T1 | Range pill "Week 43 · 19 – 25 Oct" | No week number | FIX | copy | P3 |
| T2 | "Copy rows from last week" bordered with icon | Borderless text | FIX | canvas | P3 |
| T3 | Submit week in primary | Teal | FIX | G9 | P3 |
| T4 | Head "PROJECT · TASK"; day heads "19 Oct" | "Project"; number only | FIX | copy | P3 |
| T5 | Cost column per row and total | None | ASK [Q10] | A2; data and permission exist | P3 |
| T6 | Cells in bordered boxes | Transparent inputs | FIX | canvas | P3 |
| T7 | "Add row" in a dashed rounded box | Dashed top border | FIX | canvas | P3 |
| T8 | Two explainer notes at the foot | None | ASK [Q11] | M4; only sentences that are true | P3 |
| T9 | (no Worked row) | Worked row | KEEP-V2 | V2 `:746`, muted | — |
| T10 | Totals row | Same primitive | KEEP-TOKEN | | — |

## 4 · Day and Unsorted (`TimeDayView.tsx`, `UnsortedInbox.tsx`)

| # | Canvas | App now | Class | Evidence or rule | Pkg |
|---|---|---|---|---|---|
| D1 | Date heading with a calendar icon tile | No tile | FIX | canvas | P4 |
| D2 | Group rate and cost in slate | Violet | FIX | G9 | P4 |
| D3 | Hint "Type 1.5, 1:30 or 90m" | "1:30 or 90m" | FIX | 1.5 is accepted (C11.4) | P4 |
| D4 | Notes placeholder "What did you do?" | "Notes, or type to find a task" | FIX | copy; the task search stays | P4 |
| D5 | Row edit and delete icons visible | Hover only | ASK [Q13] | pass 1 D6 | P4 |
| D6 | Unsorted panel: icon, title, amber count badge | Title only | FIX | canvas | P4 |
| D7 | Neutral panel, tinted suggestion chip, primary "Assign" | Amber panel, dashed amber chip, amber button | ASK [Q12] | C2 amber role vs canvas | P4 |
| D8 | Link "Chrome extension settings →" | None | FIX | the page exists in Settings | P4 |
| D9 | (no bulk bar) | "Assign selected · N" | KEEP-DECISION | phase 5 behaviour, harmless | — |
| D10 | "Add row" button dark | `bg-primary` | KEEP-TOKEN | primary | — |

## 5 · Team (`TimeTeamView.tsx`, `RoleBadge.tsx`)

| # | Canvas | App now | Class | Evidence or rule | Pkg |
|---|---|---|---|---|---|
| W1 | Role badges: Employee green, Manager indigo, Contractor teal, Admin amber | Slate, teal, amber, dark | ASK [Q14] | A6; amber is reserved | P5 |
| W2 | Amber bar under 75 % only for employees | For everyone | ASK [Q15] | C11.5 has no exemption | P5 |
| W3 | Header card: icon tile, title, subtitle, controls in one card | Same after pass 1 | match | | — |
| W4 | Weekly/Monthly segmented in white-on-slate | Teal filled | FIX | same segmented style as the rest of the module | P5 |
| W5 | (one number per cell) | Worked and Delivered | KEEP-V2 | V2 D5.5, second line muted | — |
| W6 | Current-week tint | Teal tint | KEEP-TOKEN | | — |

## 6 · Reports and salary allocation (`TimeReportsView.tsx`, `TimeSalaryReport.tsx`)

| # | Canvas | App now | Class | Evidence or rule | Pkg |
|---|---|---|---|---|---|
| R1 | One filter card of key-labelled chips: Period, Employees, Projects, Clients, Billable, Group by | Date inputs and unlabelled selects | FIX (chips) / ASK [Q19] (month period) | G3; the dropdown component stays inside | P6 |
| R2 | Report-type segmented at the right end of the filter card | Own row above | FIX | canvas | P6 |
| R3 | CSV and "PDF for client" both outline, top right | PDF teal filled | FIX | G9 | P6 |
| R4 | Tiles with notes: Tracked "5 people · 21 working days", Billable hours with %, Billable value, Labour cost · client work with "+ internal · unallocated" | No notes; % only; no billable value; no split | FIX / ASK [Q17] (Billable tile shows hours) | G4, G6; the Worked tile is KEEP-V2 | P6 |
| R5 | Hours-per-working-day stacked bar chart | Average tile only | FIX | G5; `report.lines[].entryDate` | P6 |
| R6 | Share by project as a donut with legend and % | Horizontal bars | FIX | G5 | P6 |
| R7 | Table "By project" with title, default grouping by project | No title, default by title | ASK [Q16] | A4 | P6 |
| R8 | Columns Hours, Billable h, Billable value, Labour cost, Margin | Delivered, Worked, Billable, Cost | FIX | G6; Worked column is KEEP-V2 | P6 |
| R9 | Click a row to split it by employee or task; "Project → Employee" grouping | None | ASK [Q18] | M7; data is on the client, the behaviour is new | P6 |
| R10 | Salary allocation as a section under the summary (and a segment) | Separate mode only | ASK [Q20] | A3 | P6 |
| R11 | Salary title with month in one grouped nav | Loose arrows | FIX | SC4 | P6 |
| R12 | "Client projects" head; Rate and Tracked in slate | "Client"; violet, teal | FIX | G9 | P6 |
| R13 | Utilisation three colour tiers | Amber below 75 % | ASK [Q15] | A5, same rule as Team | P6 |
| R14 | (no parallel toggle) | "Parallel only" | KEEP-V2 | V2 `:1098`, drawn as a chip | — |

## 7 · Entry drawer and project picker (`EntryDrawer.tsx`, `ProjectPicker.tsx`)

| # | Canvas | App now | Class | Evidence or rule | Pkg |
|---|---|---|---|---|---|
| E1 | Plain title "Edit time entry", source chips under it | Uppercase title, chips beside it | FIX | canvas | P7 |
| E2 | One Description field | Title and Description | KEEP-DECISION | C11.6 (`docs/TIME-TRACKING.md:700`), C5 | — |
| E3 | Option meta "Recent · 3:27 this week" | 30-day figure | FIX | this-week seconds are computable from loaded entries | P7 |
| E4 | "· 186:30 total" per option | None | MISSING | the picker has no all-time totals | — |
| E5 | Selected option: tint only | Tint and check | KEEP-DECISION | pass 1 review: the check stays for accessibility | — |
| E6 | Full-width tinted "+ Create project "vill…"" row with "Show finished" beside it | Text link on the right | FIX | canvas | P7 |
| E7 | Each project once, under its client | A "Recent" group repeats projects | FIX | canvas; recency moves into the meta line | P7 |
| E8 | Create card "New project": Name, Client, Type, hint, Back, "Create & assign" | Client and Type only, name from the search | ASK [Q21] | A10; `6cc80aee` was an overflow fix | P7 |
| E9 | Tags as chips | Comma input | ASK [Q22] | A9 | P7 |
| E10 | Provenance with the start time | Date only | FIX | copy | P7 |
| E11 | "Edited 11:20 by …" | None | MISSING | entries carry no edit time or editor | — |
| E12 | Margin always | Hidden for parallel entries | KEEP-DECISION | pass 1 review 2 (`aa5addc5`) | — |
| E13 | Placeholder "project, client or code" | "Search project or client…" | KEEP-DECISION | the search does not match a code; the copy must be true | — |

## 8 · Start from a task (`TaskTimeControls.tsx`, `TaskTimeBreakdown.tsx`, `TaskEditDrawer.tsx`)

| # | Canvas | App now | Class | Evidence or rule | Pkg |
|---|---|---|---|---|---|
| K1 | Round primary play button | Rounded square | FIX | G7 | P8 |
| K2 | Rose banner "You are tracking this task · Started 13:40" | Rose Stop and chip | FIX (banner) / KEEP-V2 (several timers) | V2 C3 | P8 |
| K3 | Tiles Tracked / Estimate / Cost and a progress bar | Chip and a cost line | ASK [Q23] | A8; the estimate stays editable | P8 |
| K4 | Entry rows with avatar and range | Per-person totals | ASK [Q23] | per-entry rows of other people need an API change | P8 |
| K5 | Start toast names the stopped timer and its time | "N timers were stopped" | FIX | copy; Undo exists | P8 |
| K6 | Footnote "prefills the description" | None | KEEP-DECISION | not what the code does (C5) | — |
| K7 | ▶ on task cards, popover on the card | In the drawer | KEEP-DECISION | `aad2b344` | — |

## 9 · Project → Time (`ProjectTimeTab.tsx`)

| # | Canvas | App now | Class | Evidence or rule | Pkg |
|---|---|---|---|---|---|
| P1 | Period segmented (All time, This month, Last month, Custom) and "Export CSV" | None | FIX | entries are on the client; `reportCsv` exists | P8 |
| P2 | Five tiles: Tracked, Labour cost, Billable value, Hours budget %, Time margin | Tracked block only | FIX | G4, G6; totals carry `cost` and `billableValue` | P8 |
| P3 | Hours per week, stacked by person | None | FIX | G5 | P8 |
| P4 | By-task bars with "of estimate" | None | FIX | `totals.byTask` | P8 |
| P5 | By-employee table, cost columns for managers | None | FIX | cost gated as elsewhere | P8 |
| P6 | Start only | Start / Stop | KEEP-DECISION | `d74adb2b` | — |
| P7 | (no entries list, no budget and rate inputs) | Present | KEEP-DECISION | `9c6d0dcc`, `e2a3adda`; they move under the canvas blocks, the Internal checkbox becomes a switch | P8 |

## 10 · Settings → Time tracking (`TimeTrackingSettingsPanel.tsx`)

| # | Canvas | App now | Class | Evidence or rule | Pkg |
|---|---|---|---|---|---|
| S1 | Hours basis as two radio cards, fixed-hours input inside the second | Dropdown and a separate input | FIX | G3 | P9 |
| S2 | Row of three: hours per day, multiplier, Contractors "Hourly rate, no multiplier" | Two fields; the contractor rule is hard-coded | ASK [Q24] | a real choice would be a new setting | P9 |
| S3 | Hints "Also divides daily salaries." / "1.000 = gross salary only." | Other wording | FIX | copy, true | P9 |
| S4 | One card "Timer and entry rules": every rule a row with note and switch | Three switches, inputs and weekly approval in other cards | FIX | grouping | P9 |
| S5 | Rounding: segmented Off / 5 / 15 / 30 and two radios | Two dropdowns | FIX | G3 | P9 |
| S6 | "Who sees what" | None | ASK [Q25] | M11 | P9 |
| S7 | "Import from Toggl or Clockify" | Toggl panel | KEEP-DECISION (Toggl) / ASK [Q26] (Clockify) | 13 Nov commits; A5.5 | — |
| S8 | "Re-price a period…" plain button | Hold to confirm | KEEP-TOKEN | the app's safety pattern; canvas helper copy | P9 |
| S9 | "Warn about long entries", "Idle reminder" | Removed | KEEP-V2 | `docs/TIME-TRACKING.md:719`, V2 D7.1, D8.5 | — |
| S10 | (none) | Holidays, Parallel, Presence blocks, Save bar | KEEP-DECISION / KEEP-V2 / KEEP-TOKEN | drawn as canvas cards | P9 |
| S11 | Own page with sub-navigation | Settings registry section | KEEP-TOKEN | `docs/SETTINGS.md` | — |

## 11 · Chrome extension (`ExtensionSettings.tsx`, `PairedBrowsers.tsx`, `extensions/chrome-time-tracker/`)

| # | Canvas | App now | Class | Evidence or rule | Pkg |
|---|---|---|---|---|---|
| X1 | Intro "Start and stop timers from the Chrome toolbar…" | Technical sentence about the zip | FIX | copy | P9 |
| X2 | "Setup guide" button | None | ASK [Q27] | M13 | P9 |
| X3 | Three step cards Install / Pair / Track | Numbered list | FIX | pass 1 X3 was only partly done | P9 |
| X4 | Pairing card: code, "expires in 9:12", primary Copy, refresh icon | "New code" button, expiry in the subtitle | FIX | `expiresAt` exists | P9 |
| X5 | Capture switch in the "Suggest entries" card header | Own section | FIX | placement | P9 |
| X6 | Watched sites: "no suggestion" in amber | "no project" in slate | FIX | colour role | P9 |
| X7 | Revoke as a plain red outline button | Hold to confirm | KEEP-TOKEN | safety pattern | — |
| X8 | Retention and company switches | Company box | KEEP-DECISION | C13 | — |
| X9 | Popup running: big clock, round Stop, Recent with ▶, footer "Open … · N unsorted" | Different layout | FIX / KEEP-V2 (several timers, still-working) | V2 phase 10 | P11 |
| X10 | Popup start: title, project, "Start timer" | Also a Task select | KEEP-DECISION | phase 10 behaviour | — |
| X11 | Popup connect: address, code, Connect, help line | Code only | FIX (help line) / KEEP-DECISION (no address field: the build knows its server) | | P11 |
| X12 | (translated copy) | Raw server codes such as `already_running` | FIX | smaller open item | P11 |
| X13 | Zip name | `ccrm-time-tracker.zip` | ASK [Q28] | branding | P11 |

## 12 · Mobile (`TimeTrackingMobileBar.tsx`, phone width of the views)

| # | Canvas | App now | Class | Evidence or rule | Pkg |
|---|---|---|---|---|---|
| M1 | Large running card: "Running since 13:40", title, project / task / billable chips, big clock, round Stop, hint | Small card with a text Stop | FIX | canvas; several timers open the v2 sheet (KEEP-V2) | P10 |
| M2 | No input bar on the phone | Full timer bar | ASK [Q5] | owner said "timer bar on every tab" | P10 |
| M3 | Today only, with the day total | Week day cards | ASK [Q5] | A7 | P10 |
| M4 | No stat tiles, no tab row | Both | ASK [Q5] | | P10 |
| M5 | Bottom bar Timer / Calendar / Tasks / Add | Same | match | | — |
| M6 | Own top bar | App shell | KEEP-TOKEN | | — |

## Counts (pass 2)

Counted per row; a row with two classes counts in both.

| Class | Rows |
|---|---|
| FIX | 86 |
| KEEP-DECISION | 18 |
| KEEP-V2 | 11 |
| KEEP-TOKEN | 11 |
| MISSING | 2 |
| ASK | 31 rows, 31 questions |
| match | 3 |

## The stop: questions for the owner

Recommendation first in each line. Answers are recorded in "Owner answers" below.

**Frame**
- Q1 Settings link moves into the ⋯ menu. *Recommended: yes.*
- Q2 Filter button in the toolbar (M1). *Recommended: build it on the client: project, billable, tag; applies to List.*
- Q3 Tags button in the timer bar (M2). *Recommended: build it, with the same tag chips as Q22.*
- Q4 Timer/Manual toggle stays visible while a timer runs, so a manual entry can be added then. *Recommended: yes.*
- Q5 Phone: no input bar (the bottom bar's Timer and Add open it), Today only with a "Whole week" link, no stat tiles; the tab row stays. *Recommended: yes to all three.*

**List**
- Q6 Task shown as its own element only when the entry's title differs from the task's. *Recommended: yes.*
- Q7 Cost tile note. *Recommended: "avg €x / h" (cost ÷ hours of the week), because rates are per entry.*

**Calendar, Timesheet, Day**
- Q8 Calendar popover: project as a label; changing it goes through Edit. *Recommended: canvas (label).*
- Q9 Rail title. *Recommended: keep "Your tasks" (all open tasks) and add the time tracked this week.*
- Q10 Timesheet Cost column (A2), for people who may see cost. *Recommended: add.*
- Q11 Timesheet explainer notes (M4). *Recommended: add, only the sentences the code makes true.*
- Q12 Unsorted panel colours: neutral panel and primary "Assign"; amber stays on the count badge, the toolbar chip and "no suggestion". *Recommended: canvas.*
- Q13 Day row edit and delete icons always visible. *Recommended: canvas.*

**Team, Reports**
- Q14 Role badges (A6). *Recommended: Employee emerald, Manager indigo, Contractor teal, Admin slate (amber stays reserved).*
- Q15 Under-75 % amber only for people with a weekly target; contractors and people without an employee record are exempt, in Team and in salary Utilisation (A5). *Recommended: canvas.*
- Q16 Reports default grouping "by project" (A4). *Recommended: yes.*
- Q17 Reports Billable tile shows hours, with the % in its note. *Recommended: canvas.*
- Q18 Reports row drill-down (M7): a row opens to its employees or tasks. *Recommended: build on the client; it also gives "Project → Employee".*
- Q19 Reports period as a month chip with presets and "Custom range". *Recommended: yes.*
- Q20 Salary allocation (A3): a section under the summary for people who may see it, and still reachable from the segment. *Recommended: canvas.*

**Drawers**
- Q21 Picker create form with a Name field, hint and "Create & assign" (A10). *Recommended: canvas.*
- Q22 Tags as chips with add and remove (A9). *Recommended: build one small chip input, used by the drawer and the timer bar.*
- Q23 Task drawer (A8): three tiles Tracked / Estimate / Cost with a bar; the per-person list stays (per-entry rows of colleagues need an API change). *Recommended: tiles yes, rows stay.*

**Settings, extension, other**
- Q24 Contractors field in Settings. *Recommended: a read-only line "Hourly rate, no multiplier" (what the code does), no new setting.*
- Q25 "Who sees what" (M11). *Recommended: a read-only summary from the existing roles, with a link to Users & roles.*
- Q26 Clockify (M12). *Recommended: declined; the card says Toggl.*
- Q27 "Setup guide" button (M13). *Recommended: declined; the three step cards are the guide.*
- Q28 Extension zip name. *Recommended: rename to the product's name, built from `KOPERNIQ_PRODUCT_NAME`.*
- Q29 "Require a task" also on manual create and Add time (behaviour change). *Recommended: yes.*
- Q30 Sidebar colour. *Recommended: keep rust (section palette `7bece137`) and correct C2 in the docs.*
- Q31 Branch policy. *Recommended: stop porting to `1.13-nectarine`; this pass depends on v2 throughout.*

Not built without an API change, recorded as MISSING: picker all-time totals (E4), "Edited by" line (E11).

## Package plan (pass 2)

Package F runs first and alone. Then at most three editing agents at a time, disjoint files. Every package is
reviewed by `ccrm-reviewer` before it merges.

| Pkg | Scope | Files |
|---|---|---|
| F | F1–F21, G2 toolbar slot, round button, tile variant, tag chips if approved | `TimeTrackingView.tsx`, `TimerBar.tsx`, `TimerContainer.tsx`, `StartModePopover.tsx`, `HeaderTimerPill.tsx`, `ViewingAsSelect.tsx`, `RangeNav.tsx`, `ProjectPicker.tsx` (trigger variant only), new small modules |
| P1 | List L1–L10 | `TimeListView.tsx`, `EntryRow.tsx` |
| P2 | Calendar C1–C12 | `TimeCalendarView.tsx` |
| P3 | Timesheet T1–T8 | `TimeTimesheetView.tsx`, `SubmitWeekButton.tsx` |
| P4 | Day and Unsorted D1–D8 | `TimeDayView.tsx`, `UnsortedInbox.tsx` |
| P5 | Team W1, W2, W4 | `TimeTeamView.tsx`, `RoleBadge.tsx` |
| P6 | Reports R1–R13, chart module | `TimeReportsView.tsx`, `TimeSalaryReport.tsx`, `src/utils/timeReports.ts`, new chart module |
| P7 | Drawer and picker E1–E10 | `EntryDrawer.tsx`, `ProjectPicker.tsx` (panel) |
| P8 | Task drawer K1–K5, project tab P1–P7 (after P6, uses its charts) | `TaskTimeControls.tsx`, `TaskTimeBreakdown.tsx`, `ProjectTimeTab.tsx` |
| P9 | Settings S1–S10, extension settings X1–X6 | `TimeTrackingSettingsPanel.tsx`, `ExtensionSettings.tsx`, `PairedBrowsers.tsx` |
| P10 | Phone M1–M4 (after F and P1) | `TimeTrackingMobileBar.tsx`, phone branches |
| P11 | Extension popup X9–X13 | `extensions/chrome-time-tracker/` |

Order: F → (P1, P2, P3) → (P4, P5, P6) → (P7, P8, P9) → (P10, P11).

## Owner answers (2026-11-20)

| Q | Answer | Carried out |
|---|---|---|
| Q1 Settings into ⋯ | yes | F |
| Q2 Filter button | yes, in the browser, if the data is complete (it is: the List loads the whole shown week, server cap 5000 rows) | F17 |
| Q3 Tags button in the timer bar | no; tags stay as they are in the app | not built |
| Q4 Timer/Manual toggle while running | yes | F |
| Q5 Phone | keep the input bar, Today as on the canvas, keep the stat tiles, the tab row stays | P10 |
| Q6 Task element only when it differs | yes | P1 |
| Q7 Cost tile note | no | — |
| Q8 Calendar popover project | canvas: a label for existing entries, changed through Edit; a new entry still picks its project | P2b |
| Q9 Rail title | canvas: "Your tasks this week", filtered to tasks due or tracked this week | P2 |
| Q10 Timesheet Cost column | add (labour cost of the work, not the client's price) | T5 |
| Q11 Timesheet notes | add | P3, only true sentences (see Done log) |
| Q12 Unsorted colours | canvas | P4 |
| Q13 Day row icons | yes | P4 |
| Q14 Role badges | Employee emerald, Manager indigo, Contractor teal, Admin slate | P5 |
| Q15 Under 75 % only with a weekly target | yes | P5 (Team and salary Utilisation) |
| Q16 Reports grouped by project | yes | P6 |
| Q17 Billable tile shows hours | yes | P6 |
| Q18 Report row drill-down | **open** (same question as Q2) | not built |
| Q19 Period chip | yes | P6 |
| Q20 Salary allocation as a section | yes | P6 |
| Q21 Create form with a Name field | yes | P7 |
| Q22 Tags as chips | no ("probably deprecated"); the comma field stays | — |
| Q23 Task drawer tiles | yes, without the cost tile; the per-person list stays | P8 |
| Q24 Contractors field | **open**: the owner asked which options it would have (answered: only "apply the multiplier to contractors too") | not built; the existing sentence stays |
| Q25 "Who sees what" | yes, read-only | P9 |
| Q26 Clockify | no mention of Clockify anywhere | P9 |
| Q27 "Setup guide" | declined | — |
| Q28 Zip name | rename | P11 (`<product slug>-time-tracker.zip`; the old file is still written) |
| Q29 "Require a task" on manual entries | **open**: the owner asked what it is (answered: the switch in Settings → Time tracking; enforced only on Stop today) | not changed |
| Q30 Sidebar colour | keep rust | — (C2 text to be corrected) |
| Q31 Porting to `1.13-nectarine` | stop | not ported |

## Done log (pass 2)

Every package was built by an implementer in its own worktree, reviewed by an independent `ccrm-reviewer`, fixed,
then merged into `css-main`. Not pushed, not ported.

| Package | Commit(s) | Rows done | Not done or changed, and why |
|---|---|---|---|
| Audit | `fb2f9ab7` | this part | |
| F frame | `46d60c10`, `6230e256`, `e9fdc529` | F1–F5, F7–F16, F18–F21 | F6 tags and F17 filter not built (Q3 no, Q2 open). The linked-task chip shows "Task" / "Ticket" with ×, not the name: under C5 the name is already the title. Review fixes: Unsorted chip recount, Stop stays in Manual mode, duration follows the times, touch targets |
| P1 List | `fef14e99`, `75dfd06d` | L1–L10 | No rate note (Q7). The lock tooltip reads "Only you and people with the cost permission see this." Day cost is hidden when another person's cost is hidden. L8 will rarely show: a linked entry's title normally equals the task's |
| P2 Calendar | `bb2ae810`, `3c0ab3d6` | C1–C12 | The project picker stays editable in the popover (Q8). Delete is disabled, not hidden, on a locked entry. No Duplicate on a running entry |
| P2b Calendar popover | `96b1ba56`, `09c366bb` | C7 project as a label for existing entries; a new entry still picks its project | — |
| P3 Timesheet | `42a15ac7`, `adb48aa2` | T1–T4, T6–T8 | T5 came later (next row). The canvas notes were reworded to what the code does: a new cell makes an hours-only entry with no start time; clearing a cell changes nothing; Submit marks the week approved at once (no manager step) |
| T5 Timesheet cost | `a7599dc9` | T5 | Entries without a project carry a cost, so the explainer has no "excludes time without a project" clause. A row or the total shows "—" when another person's cost is hidden from the viewer; the column is hidden when the viewer sees no cost. Entries carry no currency, so the app currency is used |
| P4 Day, Unsorted | `696e1dff`, `79861b02` | D1–D8 | The extension link opens Settings → Time tracking and does not scroll to the extension block |
| P5 Team | `19d1fb21`, `aadcfbde` | W1, W2, W4, header card | People without an employee record have no bar; the legend says so |
| P6 Reports | `e04f5f08`, `d15d7387` | R1–R8, R10–R12 | R9 drill-down not built (Q18 open). Margin counts only entries with a cost whose worked time equals their duration, and is marked "≈" when some are left out. The badge reads "Restricted access": the salary report is a grantable permission, not admin-only. The day chart is capped at 62 working days |
| P7 Drawer, picker | `ec4aa4e2`, `52a173eb` | E1, E3, E6–E8, E10 | Meta line reads "No time this week" (the picker has no all-time data). No keyboard navigation in the picker, as before |
| P8 Task drawer, project tab | `50749da2`, `56dad0a8` | K1–K3, K5, P1–P7 | No cost tile (Q23). No rate column in "By employee": there is no per-person rate on the client. Hours budget % is always all-time |
| P9 Settings, extension settings | `bd0b0a8c`, `6eb74bc8` | S1, S3–S8, S10, X1, X3–X6 | S2 Contractors not built (Q24 open). Canvas claims dropped as untrue: "saved but flagged Assign project", "only for projects with tasks", "notifies the owner", pairing code "never stored" |
| P10 Phone | `ccaf15fa`, `6ca83752` | M1, M3 | The running card is in the page flow, not fixed; Stop stays reachable from the sticky header pill (40 px on the phone). The sheet and the paused card were not restyled |
| P11 Extension popup | `7499a606`, `a09251ce` | X9–X13 | The address field stays: the zip is generic and pairing needs the address (the audit's "the build knows its server" was wrong). No Pause in the popup: it has no pause endpoint. `EXTENSION_VERSION` unchanged |
| F17 List filter | `99e8e2ec` | F17 | Applies to the List tab only (also its phone Today view). The stat tiles stay unfiltered (a "Filtered: N of M" line says so). Not persisted across reloads. Filter is not applied to Day, Calendar, Timesheet or Reports |

Still open after this pass: Q18, Q24, Q29 (owner), the C2 text about the sidebar
colour, and the two MISSING rows (E4, E11).

## Checks and QA (pass 2)

- `npm run check` green on `css-main` after the last merge (`56dad0a8`): app, QA-suite and extension type-check,
  unit tests, backend mirror, undefined-symbol audit (193 baselined, none new). Every package was also green in
  its own worktree before merging.
- After Package F: the five time-tracking specs (`timeTracking`, `…Parallel`, `…Mobile`, `…Presence`) passed, 40
  tests. `timeTracking.spec.ts` › "the timer bar takes a Description before Start…" (registered in
  `scripts/qa/known-failing.json`) **passes** now that it opens the Description from the new button.
- One scoped QA run over all 147 changed files (`css-main` at `56dad0a8`): **113 passed, 2 failed, 27 did not run.**
  - **Failed, both pre-existing** (`scripts/qa/known-failing.json`): `projectStatuses.spec.ts` › "statuses are added,
    renamed and removed in settings…" and › "one click settles the rest of the value as a paid income row"
    (symptom: the button "Označiť zvyšok ako uhradený" is not found). Not caused by this pass; not fixed.
  - **Did not run:** the run hit its 900 s limit. Left out: 2 tests of `timeTrackingPresence.spec.ts`, 1 of
    `timeTrackingWorked.spec.ts`, `togglImportMap.spec.ts`, `viewMenuOverTableHead.spec.ts`, all 20 of
    `viewSize.spec.ts`, `whatsappDemo.spec.ts`, `whatsappNativeModule.spec.ts`. A second run of only these files was
    stopped by the machine running out of memory before it reported. **They are still to be run.**
- Nothing in this pass was checked on a real phone or in the real extension popup; the popup was changed and
  type-checked and built, never opened in Chrome.
- Screenshots: `test-results/tt-design-parity-2/canvas/`, `before/`, `after/` (local only).

## Review page

https://claude.ai/artifact/Nw7ptoiMgUg4LFDhsVPQSW (canvas | app before | app after for every screen).
