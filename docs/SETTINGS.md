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
| `#settings/<category>` | the category page, scrolled to the top |
| `#settings/<category>/<section>` | the category page, scrolled to that section, which flashes once |
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

## Drafts

The company forms (profile, billing details, bank account, invoice defaults) are one
`billingForm` state with one save. Every card has a Save button on wide screens; on a
phone the floating **Unsaved changes · Discard · Save** bar (`SaveBar`) appears while
the form differs from what is stored. Switching category never discards the draft —
the state lives in `SettingsView`, not in the sections.

## Tests

`tests/e2e/settingsRedesign.spec.ts` (tiles, layout switch, old links, inline search,
category pages, phone layout) and `src/components/settings/settingsRegistry.test.ts`.
