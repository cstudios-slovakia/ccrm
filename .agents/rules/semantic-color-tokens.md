---
description: Use semantic colour tokens, not raw Tailwind palette classes, for surfaces, borders and body text
---

# Colour: use the tokens, not the palette

## 1. The rule

For **structure** — surfaces, borders, body text — write the token, never the
literal shade:

```jsx
/* no  */ <div className="bg-white border border-slate-200 text-slate-800">
/* yes */ <div className="bg-card  border border-border    text-foreground">
```

The tokens are already defined in [`src/index.css`](../../src/index.css) and
wired into Tailwind, so these classes work today. No setup, no import.

| Role | Class | Replaces |
|---|---|---|
| Card / panel surface | `bg-card` | `bg-white` |
| Page or section behind cards | `bg-background` | `bg-slate-50` |
| Recessed well, chip, hover fill | `bg-muted` | `bg-slate-50`, `bg-slate-100` |
| Floating panel, dropdown, popover | `bg-popover` | `bg-white` |
| Hairline, divider, input outline | `border-border`, `bg-input` | `border-slate-100`, `border-slate-200` |
| Body text, headings | `text-foreground` | `text-slate-800`, `text-slate-900` |
| Labels, captions, placeholders | `text-muted-foreground` | `text-slate-400`, `text-slate-500` |
| Brand fill and its label | `bg-primary`, `text-primary-foreground` | `bg-indigo-600`, `text-white` |
| Focus ring | `ring-ring` | `ring-indigo-500` |
| Sidebar shell | `bg-sidebar`, `text-sidebar-foreground` | — |

Alpha works the same way: `bg-card/60`, `border-border/40`.

## 2. Where the raw palette is still correct

Tokens describe *structure*. They do not describe *meaning*, and forcing a
status colour through them makes the code worse, not better. Keep the ramp for:

- **Status and semantics** — `bg-emerald-50 text-emerald-700` for success,
  `rose` for danger, `amber` for a warning. These carry information.
- **Data-driven colour** — a pipeline state, a lead source, a project manager's
  badge. Those come from the database; see §4.
- **A one-off accent** a designer asked for by name.

The line is: *if it would look wrong in a differently-branded copy of this app,
it should be a token.*

> **One trap.** `--destructive` and `--destructive-foreground` are declared in
> the `@theme` block but given a value in *no* theme, so `bg-destructive` and
> `text-destructive` currently render nothing at all. Use the `rose` ramp for
> danger until someone gives them values in all three theme blocks in
> `src/index.css`. Every other token in the table above is defined in `:root`,
> `[data-theme="sezame"]` and `[data-theme="dark"]` alike.

## 3. Why — and why the existing markup breaks the rule

Roughly **13 000** raw palette classes are already in `src/**/*.tsx`
(`bg-white` 903×, `border-slate-200` 1 116×, `text-slate-400` 1 073×). Dark mode
therefore could not be built by annotating markup; it is built by inverting the
palette itself under `[data-theme="dark"]`, with
[`scripts/postcss-dark-palette.mjs`](../../scripts/postcss-dark-palette.mjs)
resolving the cases where one shade has two jobs. That works, and it covers new
markup automatically — but it is a heuristic, and a shade used in an unusual
role can still come out wrong.

Token-based markup has no such failure mode. The PostCSS pass does not touch it
at all: `bg-card` already resolves to the right colour in every theme, and a
third theme, a rebrand or a designer's "muted text is too light" becomes a
one-line change instead of a thousand-line one.

## 4. Colour that comes from the database

Pipeline states, lead sources and project-manager badges carry an administrator's
own hex value, chosen against a white screen. Never render one as raw inline
colour — use [`src/utils/accentColor.ts`](../../src/utils/accentColor.ts):

```jsx
style={{ color: liftAccent(stateColor) }}                       // colour as text
style={{ backgroundColor: fill, color: readableOn(fill) }}      // colour as a fill
```

`liftAccent` is a no-op in light mode and lifts the colour until it reads on a
dark card; `readableOn` picks the legible foreground for a fill instead of
assuming white.

## 5. Migration policy

**Do not open a project to convert the existing 13 000.** The cost is not the
typing, it is deciding what each one *means* — `bg-slate-50` is a page section
in one place, a recessed well in another and a hover state in a third, and a
blind replace would flatten the visual hierarchy across the whole app.

Instead:

- **New code uses tokens.** Always. Cost: zero.
- **A file you are already editing gets converted** as you go, while you are
  reading its markup anyway.
- **Never mix the two on one element.** `bg-card border-slate-200` is worse than
  either, because the next reader cannot tell which convention the file follows.

## 6. Verify

```bash
npm run test:qa:dark
```

Opens every module — plus the client drawer, the new-lead modal and the
create-task drawer — with the appearance forced to dark, measures every run of
text against the surface actually behind it, then flips the theme on the same
DOM and measures again. It fails on what dark mode broke, and names the class to
go and fix. Run it after any colour change, in either direction.
