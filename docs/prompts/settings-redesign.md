# Prompt: implement the new Settings (tiles + sidebar, regrouped)

> For Claude Code — Sonnet 5.5, effort **high**. Paste everything below the line.

---

You are implementing a redesign of the **Settings** screen in CCRM (React + TypeScript + Vite,
Tailwind v4). Read `CLAUDE.md`, every file in `.agents/rules/`, `docs/VIEW-SIZE.md`,
`docs/TESTING.md` and `docs/UNSAVED-DRAFTS-DECISIONS.md` before writing code.

## The design

The approved design is a Design canvas: https://claude.ai/artifact/5KDKufJtD67TjfNbcj5gX4
(read it with the Artifact tool, `action: "read"`, and its `project/*.dc.html` files). It has nine
artboards — five desktop, four phone:

1. **Settings home — tiles** (new default): page header with a *Tiles | Sidebar* layout switch and
   a "My preferences" button, a large search field, a "Recently opened" chip row, then 12 category
   tiles in three labelled groups. Each tile is **one link** to its category: tinted icon square,
   title (plus a status badge on Email and System) and a description that names the category's
   sections in plain words, clamped to **two lines**. **No section chips on tiles.** Every tile has
   the **same fixed height**, whatever its text length; use the exact descriptions from the canvas
   (they are listed in the table below as the "tile text").
2. **Category page — Leads & pipeline** (what a tile opens in tile mode): back button + breadcrumb,
   category header, a sticky row of section tabs, every section stacked below as its own card
   (tabs scroll to / highlight the section), and a right-hand aside with "Related settings"
   cross-links and a short help card.
3. **Sidebar layout — Company**: the same page header, a grouped left nav (search on top, three
   group headings, 12 categories with coloured lucide icons; the active category is expanded with
   its sections as sub-links), and the category content on the right.
4. **Search** (`Search.dc.html`): **not a dialog or popup.** Results appear inline, directly under
   the search field, in the same card (field on top, results below it, keyboard hints in the
   card's footer). While the query is non-empty the results replace the tiles; clearing the field
   (✕ button or Esc) brings the tiles back. Results are grouped by category, each with the
   category icon, the section title and a one-line hint with the match highlighted; ↑ ↓ ↵ Esc.
5. **Regrouping map**: where every old tab goes (also written out below — this file is the source
   of truth if the two disagree).
6. **Phone — home** (`Mobile.dc.html`): tiles only. Header (gear icon, "Settings", My-preferences
   icon button), search field, horizontally scrolling "Recently opened" chips, then the same three
   groups as a **2-column tile grid** (icon, title, short hint clamped to two lines; no section
   chips). All phone tiles share one fixed height, sized so a two-line title still fits.
7. **Phone — category** (`MobileCategory.dc.html`): sticky top bar with back button, "Settings"
   eyebrow + category title, search icon button, and a **section dropdown** under it: a
   full-width button showing "Section N of M" + the current section name + a chevron; tapping it
   opens a menu below listing every section of the category (current one highlighted with a
   check). Picking one scrolls to that section and closes the menu; tapping outside or Esc closes
   it too. **No horizontally scrolling chip row.** Sections stacked as cards; list rows open an
   item; full-width primary button; "Related settings" as a list at the end.
8. **Phone — editing** (`MobileCompany.dc.html`): one-column form, 48 px inputs with the right
   `type`/`inputmode`, two short fields side by side where they fit, and a floating dark
   "Unsaved changes · Discard · Save" bar while a form has unsaved edits. Uses the same section
   dropdown as artboard 7 (shown closed).
9. **Phone — search** (`MobileSearch.dc.html`): same as desktop — no full-screen takeover. The
   home header stays; results show in the search card right under the field, grouped by
   category, and replace the tiles while there is a query; a ✕ button clears it.

**No sidebar on phones.** Below `ws-lg` the settings always render the tile layout whatever
`settingsLayout` says, and the Tiles | Sidebar switch is hidden (the stored preference is kept for
the next wide screen).

The canvas uses hex values for Tailwind's palette; translate them back to the classes the app
already uses (`bg-white`, `border-slate-200`, `text-slate-500`, `bg-indigo-600`, `rounded-3xl`,
`glass-panel`, `shadow-glass`, `type-overline`, `text-ui`, `font-heading`…). Category tints are the
`-50` background and `-600` foreground of: indigo (Company), blue (Users & access), violet
(Modules & records), emerald (Leads & pipeline), sky (Projects & tasks), amber (Offers &
invoicing), orange (Orders & shipping), teal (Finance), pink (Support tickets), cyan (Email),
fuchsia (Integrations), slate (System).

### Colour convention — important

This codebase uses **raw palette classes everywhere** (≈11 500 uses) and zero semantic-token
classes; dark mode works by remapping the palette ramps under `[data-theme="dark"]` in
`src/index.css`. Keep writing raw palette classes like the surrounding code. Do **not** introduce
`bg-card` / `text-foreground` etc. in this change. Check every new screen in dark mode anyway.

## New information architecture

Three groups, 12 categories, each with sections. `permKey` is the permission the old tab used —
keep each section gated by its old key (a category shows if at least one of its sections is
visible; hide empty categories).

**Organization**

| Category (icon) | Sections → content source |
|---|---|
| Company (`Building2`) | **Profile & branding** — system name (old *General Config*), logo, company name, slogan, contacts (old *Invoicing*: Company Identity & Logo) · **Billing details** — address, IČO/DIČ/IČ DPH, register lookup (old *Invoicing*: Billing Address & Contacts) · **Bank account** (old *Invoicing*: bank part) · **Divisions** (old *Traffic & Categories*: Company Divisions) · **Language & currency** — system language + currency (old *General Config*) |
| Users & access (`Users`) | **Users** (old *Users & PMs*) · **Roles & permissions** (old *Roles & RBAC*) · **Audit log** (old *Audit log*, admin only — keep `ADMIN_ONLY_TABS` behaviour) |
| Modules & records (`LayoutGrid`) | **Visible modules** + Setup wizard button (old *Visible Modules*) · **Custom record types** (old *Unified Entries*, incl. its full-width create/edit mode) |

**Work & sales**

| Category | Sections |
|---|---|
| Leads & pipeline (`Target`) | **Pipeline stages** (old *Leads*: stages editor) · **Lead sources** · **Interest categories** (old *Traffic & Categories*) · **Automatic assignment** (`LeadAssignmentCard`, old *Leads*) · **Web form intake** (the web-form field-mapping docs currently inside old *Public API*) |
| Projects & tasks (`FolderKanban`) | **Project types** · **Project statuses** (old *Project Settings*) · **Auto-create from leads** (the category → project-type rules currently in old *Traffic & Categories*) · **Tasks** (`TaskSettingsPanel`, old *Task Settings*) |
| Offers & invoicing (`ReceiptText`) | **Invoice defaults** — payment due days, VAT rates, default VAT (old *Invoicing*: VAT part) · **Price levels** (`PriceLevelSettings`) · **Payment methods** (`PaymentMethodSettings`, moved from old *Order Statuses*) · **Offer templates** / **Offer statuses** — the settings that live in the Price offers module (`OfferSettings` / `OfferStatusSettings` via `PriceOffersView`). Embed them if their props are available at Settings level; otherwise these two sections are link cards that deep-link into the module's settings. Decide after reading the code and say which you chose. |
| Orders & shipping (`Package`) | **Order statuses** (`OrderStatusSettings`) · **Shipping methods** (`ShippingMethodSettings`) |
| Finance (`Wallet`) | **Ledger mode** · **Income & expense categories** (`FinanceSettings`). Currency is currently editable here *and* in General Config: make Company › Language & currency the only editor and show it read-only here with a link. |
| Support tickets (`LifeBuoy`) | **Ticket statuses** · **Ticket intake** (split `TicketSettings` along its existing sub-panels; if it does not split cleanly, one section is fine) |

**Connections & system**

| Category | Sections |
|---|---|
| Email (`Mail`) | **Outgoing server** (SMTP / Exchange) · **Company mailboxes** (`CompanyMailboxSettings`) · **Send a test** |
| Integrations (`Plug`) | **Public API** (secret key + guide; links to Leads › Web form intake) · **AI & agents** (old *AI Integrations*: provider, vector DB, agent cron) · **Ad platforms** (old *Ads APIs & Campaigns*) · **Social media** (old *Social Media (Zernio)*, only when `SOCIAL_MEDIA_ENABLED`) |
| System (`Server`) | **Licence** (`LicenseSettings`) · **Server & database** (the DB + host status panels from old *General Config*) · **Error logs** · **Reset data** (old *System Reset*, last, rose danger styling, `system_reset` permission) |

Personal settings (theme, view size, sidebar, notifications, passkeys, MCP assistant) stay in
`PersonalSettingsView`; Settings only links to them ("My preferences" button + footer line).

Each category page gets a "Related settings" aside with cross-links where things were split
(e.g. Leads → Projects › Auto-create, Integrations › Public API, Users › Roles; Finance → Company ›
Language & currency; Offers & invoicing → Company › Billing details / Bank account).

## Behaviour

- **Layout preference**: new per-user pref `settingsLayout: "tiles" | "sidebar"`, default `"tiles"`,
  stored through `useUserPref` / `UserPrefs` in `src/utils/userPrefs.ts` (add it to the interface
  and defaults the way the other prefs are). Never `localStorage`.
- **Routes** (hash): `settings` = home (tiles) or first permitted category (sidebar mode);
  `settings/<category>`; `settings/<category>/<section>` scrolls to and briefly highlights that
  section. **Every old route must keep working**: map each old id (`branding`, `modules`,
  `license`, `invoicing`, `projects`, `tickets`, `orders`, `tasks`, `finance`, `unified`,
  `sources`, `states`, `managers`, `rbac`, `email`, `api`, `ads`, `social`, `ai`, `errors`,
  `audit`, `danger`, and `general` if anything still uses it) to its new category/section and
  replace the hash. Grep `src/` and `tests/` for `settings/` — App.tsx, TicketsView, AutomationView,
  `utils/aiConfig.ts`, `permissions.test.ts` and ~15 e2e specs use them — and update callers to the
  new routes while keeping the redirects.
- **One registry**: replace `SETTINGS_TABS` with a single typed registry (e.g.
  `src/components/settings/settingsRegistry.ts`) listing groups → categories → sections with id,
  lucide icon, tint, permKey, translation keys, and search keywords. The tiles, the sidebar, the
  section tabs, the search index, the permission fallback effect and the legacy redirect table all
  read it. Keep the comment above `SETTINGS_TABS` about why there must be exactly one list.
- **Search**: inline, never a modal. `/` focuses the field (ignore `/` while focus is in an input,
  textarea, select or contenteditable); typing shows results right under the field and hides the
  tiles; Esc or ✕ clears the query and restores them. In sidebar mode the nav's search field
  filters inline the same way. Matches category, section titles, hints and keywords in the current
  language, accent-insensitive (Slovak/Hungarian). Shows only what the user may see. ↵ navigates to
  the section.
- **Recently opened**: last 4–6 sections the user opened, stored as a user pref.
- **Labels**: remove every emoji from `settings.tab.*` and other settings headings in
  `src/utils/translations.ts` (all three languages). Icons come from `lucide-react` in the
  components. New strings in **en, sk and hu**.
- **Splitting old tabs**: the *Invoicing* form is one `billingForm` state with one save. Keep one
  state; render its parts in their new sections. Read `docs/UNSAVED-DRAFTS-DECISIONS.md` and keep
  whatever unsaved-change protection exists — a draft must not be lost by switching category.
- Keep `renderReadOnlyBanner(permKey)` per section, the read-only behaviour, and the Unified
  entries create/edit mode that hides the navigation.
- Responsive: follow `docs/VIEW-SIZE.md` (`ws-*` variants, `type-*` utilities). Below `ws-lg`
  only the tile layout exists (artboards 6–9): 2-column equal-height tiles, a section dropdown
  (not a chip row) on category pages, sticky top bar, inline search results. 44 px touch targets,
  16 px side gutter, no horizontal page scroll. The "Recently opened" chips are the only row that
  scrolls sideways.
- The floating save bar on phones only wraps forms that already have an explicit Save today
  (e.g. the billing form); settings that save immediately keep doing so.
- Motion: tile hover lift, section-highlight flash on deep link, results fade in under the field,
  section dropdown opens with a short fade/slide — all respecting `prefers-reduced-motion`.

### Tile text (desktop / phone)

Each tile's description lists what the category holds; keep it within two lines. Add these to the
registry as `descKey` / `hintKey` translations (en below; write sk and hu to the same length).

| Category | Desktop description | Phone hint |
|---|---|---|
| Company | Profile and logo, billing details, bank account, divisions, language and currency. | Profile, billing, bank, divisions, language |
| Users & access | Who can sign in, roles and permissions, and the audit log of who changed what. | Users, roles and permissions, audit log |
| Modules & records | Turn modules on or off, rerun the setup wizard and build custom record types. | Modules, setup wizard, record types |
| Leads & pipeline | Pipeline stages, lead sources, interests, automatic assignment and web form intake. | Stages, sources, assignment, web form |
| Projects & tasks | Project types and statuses, projects auto-created from won leads, task settings. | Types, statuses, auto-create, tasks |
| Offers & invoicing | Invoice defaults, VAT, price levels, payment methods, offer templates and statuses. | Invoicing, VAT, prices, payments, offers |
| Orders & shipping | Order statuses from received to delivered, and the shipping methods you offer. | Order statuses, shipping methods |
| Finance | Ledger mode and the categories every income and expense is filed under. | Ledger mode, income & expense categories |
| Support tickets | Ticket statuses and the mailbox that turns incoming e-mails into tickets. | Ticket statuses, e-mail intake |
| Email | Outgoing server (SMTP or Exchange), shared company mailboxes and a test send. | Outgoing server, mailboxes, test send |
| Integrations | Public API and webhooks, AI providers and agents, ad platforms and social media. | Public API, AI, ad platforms, social media |
| System | Licence and updates, server and database status, error logs and the data reset. | Licence, server, error logs, data reset |

## Branch — 1.13-nectarine

This work opens a new release cycle on a **new branch `1.13-nectarine`**, cut from the current tip
of `1.12-mango`. Other Claude sessions use the main checkout at the same time and may have
uncommitted work in it, so:

- Never switch branches, `git stash`, reset or clean in the shared checkout. Create a separate
  worktree instead, e.g.
  `git worktree add ../ccrm-app-nectarine -b 1.13-nectarine 1.12-mango`, run `npm install` there,
  and do all work in it.
- First commit opens the cycle the way `0b0e3874` opened 1.12-mango: `VERSION = "1.13.0-Nectarine"`
  in `src/utils/version.ts` (codename follows from it), a new `1.13-nectarine-changelog.md`, and
  the same `GEMINI.md` update — message
  `chore(release): initialize 1.13-nectarine release cycle and changelog (v1.13.0-Nectarine)`.
- Every later build bumps `1.13.N-Nectarine` and adds a changelog entry, per
  `.agents/rules/commit-and-versioning.md`.
- Commit only to `1.13-nectarine`. Do not push, merge or open a PR unless the user asks.

## How to work

1. Plan first: read `SettingsView.tsx` (≈7 700 lines) and list, per old tab, the JSX block and
   state it uses. Post the plan, then implement.
2. Move code, don't rewrite it. Extract each old tab body into section components under
   `src/components/settings/sections/` with unchanged behaviour; the new shell only arranges them.
   Shrinking `SettingsView.tsx` is a goal, but no behaviour change rides along.
3. Suggested commits: (a) registry + routes + legacy redirects, (b) section extraction,
   (c) tiles home + category page, (d) sidebar mode + layout pref, (e) search + recents,
   (f) translations/emoji cleanup, (g) tests.
4. Tests: unit tests (`node --test`) for the registry — every old id redirects, every section has
   en/sk/hu keys, permission filtering hides empty categories. E2E: home renders tiles, layout
   toggle persists, old `#settings/invoicing` lands on the right section, search finds
   "IČO" / "SMTP" (and "ico" without diacritics) with results rendered inline under the field (no
   dialog), clearing the query restores the tiles, all tiles in a group have equal height, and at
   phone width the switch is hidden, tiles show even when the stored layout is `sidebar`, and a
   category page offers its sections through the dropdown. Update existing specs that navigate to old routes only where they assert the
   old layout; never loosen a check.
5. Finish per `CLAUDE.md`: `npx tsc --noEmit`, `npm run test:unit`, `npm run test:qa`, read
   `test-results/qa-audit-report.md`, then version bump + changelog + build + commit. Check light,
   dark and the sezame theme, at phone and desktop width.

## Done when

- Tiles is the default; the switch flips to sidebar and is remembered per user across devices.
- All 23 old tabs' settings are reachable from the new structure, in ≤ 2 clicks from the home,
  and through search.
- Every old `#settings/<id>` link still lands on the right place.
- On a phone there is only the tile layout (no switch, no sidebar) and it matches artboards 6–9.
- No emoji in settings navigation or headings; every category and section has its lucide icon.
- All commits are on `1.13-nectarine`, made in its own worktree; nothing pushed.
- QA audit shows no new findings; unit and e2e tests pass.
