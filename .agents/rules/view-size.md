---
description: Typography, spacing and layout follow the per-device View size
---

# View size rule

[`docs/VIEW-SIZE.md`](../../docs/VIEW-SIZE.md) is the ruleset. In short, for any
UI outside the aside (`Sidebar.tsx`, `magicui/dock.tsx`) and the paper documents
(`pdf/*`):

- Never write a font size by hand (`text-[10px]`, `text-xs`, inline `fontSize`):
  use a role token (`text-micro` … `text-metric`) or a recipe (`type-overline`,
  `type-label`, …).
- No pixel widths (`w-[140px]` → `w-35`); no centred page caps.
- Inside `<main class="workspace">` use `ws-sm … ws-2xl` for layout, not
  `sm:` … `2xl:`.
- Anything sized in JavaScript reads `typePx()` / `viewSizeScale()` from
  `src/utils/viewSize.ts`.
- Colours stay raw palette classes; this refactor does not tokenise them.
