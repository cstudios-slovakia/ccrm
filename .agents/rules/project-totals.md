---
description: A countable field in the projects list must be added to the Totals row
---

# Projects list — Totals row

The projects list (table view) ends with a **Totals** row. It is not hand-built
per column: it walks the visible columns and sums every one declared in
`SUMMABLE_PROJECT_COLUMNS` in [`src/utils/projectColumns.ts`](../../src/utils/projectColumns.ts).
Today that is `value`, `invoicable` and `stillToBePaid`.

When you add a column or field that can be counted or summed (an amount, a
quantity, hours, a count — anything where a total means something):

1. Add one line to `SUMMABLE_PROJECT_COLUMNS` that says how a project feeds it.
   `ProjectsView.tsx` does not need to change.
2. If the figure needs data the row does not carry yet (`ProjectMoneyFigures`),
   extend that interface and the `getProjectFinancials` result that produces it.
3. Add a case to `src/utils/projectColumns.test.ts` ("Totals row").

Money is summed per currency, never across currencies. If the new figure is not
money, extend `ColumnTotalPart` and the footer formatting rather than forcing it
through `formatMoney`.

Do **not** register columns where a total is meaningless (dates, ratings,
percentages, free text) — their Totals cell stays empty on purpose.
