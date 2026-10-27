# Settings — structure, routes and how to add a section

Since 1.13 (Nectarine) Settings is **12 categories in three groups**, each holding
**sections**. Everything that lists, finds or links to a setting reads one file:
[`src/components/settings/settingsRegistry.ts`](../src/components/settings/settingsRegistry.ts).

| Group | Categories |
|---|---|
| Organization | Company · Users & access · Modules & records |
| Work & sales | Leads & pipeline · Projects & tasks · Offers & invoicing · Orders & shipping · Finance · Support tickets |
| Connections & system | Email · Integrations · System |

## Routes

| Hash | Shows |
|---|---|
| `#settings` | the tiles home (or the first permitted category in sidebar layout, wide screens only) |
| `#settings/<category>` | the category page on its first tab |
| `#settings/<category>/<section>` | the category page on that section's tab |
| `#settings/modules/records/new`, `…/edit/<id>` | the custom record type editor (full width, navigation hidden) |

Every pre-1.13 link (`#settings/invoicing`, `#settings/states`, …) is in
`LEGACY_SETTINGS_ROUTES` and is rewritten to the new address on arrival
(`window.location.replace`, so Back does not loop). An old id that is also a
category id today (`projects`, `tickets`, `orders`, `finance`, `email`, `modules`)
simply opens that category. Callers inside the app use the new routes.

## Layout

- **Tiles** (default) and **Sidebar** are a per-user preference, `settingsLayout` in
  `UserPrefs` — never `localStorage`.
- Below `ws-lg` (the workspace container, measured by `useSettingsWide`) only the
  tile layout exists, whatever the stored preference says; the switch is hidden and
  the stored value is kept for the next wide screen.
- **Every section is a real tab.** Only the open section is rendered (`SectionPanel`), the
  others are one click away in the tab strip (`SectionTabs`: `role="tablist"`, arrow keys,
  Home/End), in the sidebar's sub-links or in the phone dropdown. Switching tabs moves the
  address (so Back and shared links work) and starts the page from the top — nothing scrolls
  to a section any more. A section that has to load data on open (`isOpen` in `SettingsView`)
  starts loading when its tab opens, not when the category does.
- Phone category pages replace the section tabs with a **section dropdown**
  (`MobileSectionMenu`) — there is no sideways chip row. The only sideways scroller
  on the phone home is the "Recently opened" row.
- `settingsRecents` (per user) holds the last six sections opened as `category/section`.

## Adding a section

1. Add it to its category in `settingsRegistry.ts` (`S(id, icon, permKey, flags)`).
   `permKey` is the permission the section needs; keep the one the setting already
   had. `adminOnly` and `flag` hide it for non-admins / while a feature is off.
2. Add its text to `src/utils/translations.settingsNav.ts` (generated from a table —
   keep **en, sk and hu** in step): `settings.nav.sec.<category>.<section>.title`,
   `.hint` (one line, shown in search and as the card's description) and `.kw`
   (comma-separated words people might type).
3. Render it in the `renderSection` switch in `SettingsView.tsx`.
4. `npm run test:unit` — `settingsRegistry.test.ts` fails if any text is missing in a
   language, a related link points nowhere, or an old route no longer resolves.

A new category additionally needs its tint (`SETTINGS_TINTS`) and `cat.<id>.*` text,
including the tile description (`desc`, ≤ 2 lines) and the phone hint (`hint`).

## Search

Inline, never a dialog. `settingsSearch.ts` matches the category title, the section
title, hint and keywords **in the current language**, accent-insensitively
("ico" finds IČO), and only returns what the user may see. `/` focuses the field
(ignored while typing elsewhere), ↑ ↓ ↵ move and open, Esc clears.

## Scrollbars

No always-visible scrollbars in Settings. `ScrollFade` (`scroll-fade-x` /
`scroll-fade-y` in `index.css`) hides the bar and fades the content out on each edge
that has more behind it; the item cut off at the fade is the second cue. Wrap any new
scrolling table or list in Settings in `<ScrollFade axis="x|y">` instead of
`overflow-auto`.

## One block, one header

Every setting on every tab lives in a `SectionCard` (`settings/SectionCard.tsx`): a title, a
one-line description and an optional action on one header row, a hairline, then the body.
Never hand-build a card (`glass-panel … <h3>`), never put an icon in front of a block title,
and put what used to be a small caption under the title into `description`. A component that
Settings embeds (`ProjectSettings`, `TicketSettings`, …) uses `SectionCard` itself. Inside a
block, `SettingsGroup` is the captioned group; a nested boxed block is a second `SectionCard`.
`settingsRedesign.spec.ts` opens every section and fails on any `.glass-panel` without the
standard header.

An **"Add …" form is closed until its button is pressed**, and it lives inside the block it adds
to (new user, new role). The only always-visible add row is the one-line input at the foot of a
list (a new source, a new division).

## Saving

There is no Save button in Settings. An edit is written shortly after the last keystroke
(`useAutosave`, 700 ms of quiet; leaving the screen writes a waiting edit at once) and the
block's header shows a `SaveStatus` chip — "Saving…" then "Saved". Wire a new form like this:

1. compute whether the draft differs from what is stored (`dirty`),
2. `const status = useAutosave({ value, dirty, enabled: canEdit, save })`,
3. pass `<SaveStatus lang={…} status={status} />` as the card's `action`.

Rules that keep it honest: compare against the stored value **with the same defaults the form
loads with** (or the first render looks dirty and writes defaults); save only the fields the
form owns (the company forms patch `COMPANY_FORM_KEYS` into the latest stored record, so a
payment-method edit made elsewhere is never overwritten); and never let a save echoing back
overwrite what is being typed (`billingDirtyRef` in `SettingsView`).

What keeps an explicit button is an action, not a setting: creating a record type, sending a
test e-mail, testing a connection, resetting or wiping data. Editing an existing record type
saves itself.

## Tests

`tests/e2e/settingsRedesign.spec.ts` (tiles, layout switch, old links, inline search,
category pages and their tabs, one header for every block, autosave, phone layout) and `src/components/settings/settingsRegistry.test.ts`.
