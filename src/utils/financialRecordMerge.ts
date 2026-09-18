import type { FinancialRecord, FinancialStatus } from "../types";
import { todayLocal } from "./localTime.ts";

/**
 * `ProjectDetailsView` and `ClientsView` each carry a small secondary finance
 * form that edits only a handful of fields (title, amounts, status, dates,
 * category). Saving from either used to rebuild the whole `FinancialRecord`
 * from a literal, so every field the form does not render — recurring
 * config, attachments, `createdBy`, the correct type/project link — was
 * destroyed. `mergeFinancialRecord` starts from the existing record and
 * overwrites only the keys the caller actually passes, so a secondary form
 * can never clobber a field it does not own.
 */
export function mergeFinancialRecord(
  existing: FinancialRecord | null,
  formValues: Partial<FinancialRecord> & Pick<FinancialRecord, "id">
): FinancialRecord {
  return {
    ...(existing || ({} as FinancialRecord)),
    ...formValues,
    updatedAt: new Date().toISOString()
  };
}

/**
 * A `paidDate` a form cannot itself edit must never be silently rewritten:
 * stamp it once when a record first becomes `paid` (preserving whatever
 * `paidDate` it already had, matching the correct writer in
 * `FinancialManagementView.tsx`), and never null it back out just because the
 * status moved away from `paid` afterwards.
 */
export function derivePaidDate(existing: FinancialRecord | null, status: FinancialStatus): string | null {
  if (status === "paid") return existing?.paidDate || todayLocal();
  return existing?.paidDate ?? null;
}

/** The six statuses a `FinancialRecord` can carry — every status <select> must offer all of them. */
export const FINANCIAL_STATUS_OPTIONS: readonly FinancialStatus[] = [
  "planned",
  "pending",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled"
];
