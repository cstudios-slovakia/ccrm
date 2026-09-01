# Presentation screenshots

Drives the real app against an invented company's data and writes marketing
screenshots to `presentation-screenshots/` (gitignored — regenerate, don't commit).

```bash
npm run shots                 # everything, ~90 s
npx playwright test --config playwright.demo.config.ts --grep "06 —"   # one section
SHOTS_REUSE_SERVER=1 npm run shots                                     # reuse a running dev server
```

No PHP, no database, no Docker: `demoMocks.ts` answers `sync.php` and every
`/api/*.php` call from `demoData.ts`. It never touches real data, and it is
separate from the QA audit (`npm run test:qa`) — that suite has its own fixture,
built to reach every code path rather than to look good.

The fictional company is **Rekonstav s.r.o.**, a Slovak roofing contractor.
Every client, invoice, IČO and recording is invented.

## Files

| File | What it is |
|---|---|
| `demoData.ts` | The dataset: clients, projects, stock, finance, meetings, dashboards, agents, workflows |
| `demoMocks.ts` | The mock backend, plus a synthesised silent WAV so the meeting player works |
| `screenshots.spec.ts` | One test per numbered section of the marketing site's feature nav |
| `../../playwright.demo.config.ts` | 1600×1100 at 2×, own port (5373) |

## Output, by section

| Prefix | Section | Shots |
|---|---|---|
| `00-` | — | sales funnel, personal calendar, expanded navigation, tasks |
| `01-` | Obchod & Zákazky | pipeline list, table rows, kanban |
| `02-` | Adresár & Registre | client list, client profile, timeline |
| `03-` | Sklad & Hospodárstvo | stock, catalogue rows, movements, analytics, suppliers |
| `04-` | Financie & Cash Flow | overview, cash-flow chart, transactions, recurring, invoicing |
| `05-` | Hlasová Zasadačka | meeting list, AI summary, transcript, AI output |
| `06-` | Projekty & Gantt | project list, detail, Gantt |
| `07-` | RAG AI & Agenti | agent list and conversation |
| `08-` | Automatizácie & Siete | workflow list, node builder |
| `09-` | Nástenky vlastnými slovami | two generated dashboards, charts and tables |
| `10-` | Vlastné evidencie na mieru | three registries, root and inside a folder |

## Things the data has to get right

These are not stylistic choices — each one is a screen that renders wrong without it:

- **`settings.integrationsConfig.openAiKey`** must be non-empty, or every AI
  section paints an amber "OpenAI key missing" banner across the shot.
- **Gantt dates must be weekdays.** The chart builds one column per weekday and
  matches bars by exact date string; a weekend date renders as *bez termínu*
  with no bar. Use `isoWeekday()`, and keep a schedule inside ~3 weeks or it
  runs off the right edge of the pane.
- **Chart widgets map labels through `mapping.labelsKey`** (plural). `labelKey`
  silently produces a chart whose every label reads "Unknown".
- **Unified-entry folder ids must start with `folder-`**, or `#ue_<id>/<folder>`
  deep links stay at the registry root.
- **Only the current month's recurring cost carries `isRecurring`.** Flagging
  every historical copy registers overlapping monthly series, and the forward
  projection stacks them — eight months of wages drew as ~150 k €/month.
- **`leadStateParents` is left empty.** Mapping `zákazka` to the canonical
  English `accepted` makes the `#overview` KPIs compute, but demotes it to a
  sub-state and the leads screen then stops showing it as a pipeline phase.
  The pipeline is the flagship screenshot; that dashboard is not.
