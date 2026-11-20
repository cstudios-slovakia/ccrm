import type { TFn, TimeTrackingSettings } from "../../utils/timeTracking.ts";

const field = "h-10 rounded-xl border border-slate-200 bg-white px-3 text-ui text-slate-900 outline-none focus:border-primary disabled:bg-slate-50";

/**
 * "Hours basis for monthly salaries" as two radio cards (canvas S1). The first card's sentence is computed from the
 * company calendar and hours per day, the fixed hours input sits inside the second card.
 */
export function HoursBasisCards({
  t,
  canEdit,
  draft,
  set,
  workingDaysOf,
  locale,
}: {
  t: TFn;
  canEdit: boolean;
  draft: TimeTrackingSettings;
  set: <K extends keyof TimeTrackingSettings>(key: K, value: TimeTrackingSettings[K]) => void;
  /** Working days of a month (1-12) of this year, with the unsaved overrides. */
  workingDaysOf: (month: number) => number;
  locale: string;
}) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const h = draft.hoursPerDay;
  const name = (m: number) => new Date(year, m - 1, 1).toLocaleDateString(locale, { month: "long" });
  const hours = (d: number) => Math.round(d * h * 100) / 100;
  const d1 = workingDaysOf(month);
  const sentence = [`${name(month)} ${year} → ${d1} ${t("days", "dní", "nap")} × ${h} h = ${hours(d1)} h`];
  if (month > 1) {
    const d0 = workingDaysOf(month - 1);
    sentence.push(`${name(month - 1)} → ${d0} × ${h} = ${hours(d0)} h`);
  }
  const card = (on: boolean) =>
    `flex items-start gap-3 rounded-2xl border p-3 transition-colors ${on ? "border-primary bg-primary/5" : "border-slate-200 bg-white hover:border-slate-300"}`;
  const fixed = draft.hoursBasis === "fixed";
  return (
    <div role="radiogroup" aria-label={t("Hours basis for monthly salaries", "Základ hodín pre mesačné mzdy", "Havi fizetések óraalapja")} className="grid gap-2" data-testid="tt-hours-basis">
      <label className={`${card(!fixed)} ${canEdit ? "cursor-pointer" : ""}`}>
        <input type="radio" name="tt-hours-basis" value="workingDays" disabled={!canEdit} checked={!fixed} onChange={() => set("hoursBasis", "workingDays")} className="mt-1 size-4 accent-primary" data-testid="tt-hours-basis-workingDays" />
        <span className="grid min-w-0 gap-0.5">
          <span className="text-ui font-semibold text-slate-900">{t("Working days of that month × hours per day", "Pracovné dni daného mesiaca × hodiny za deň", "A hónap munkanapjai × napi órák")}</span>
          <span className="type-meta text-slate-500" data-testid="tt-hours-basis-example">
            {t("Mon–Fri minus public holidays and overrides.", "Po–Pi bez štátnych sviatkov a výnimiek.", "Hétfő–péntek az állami ünnepek és eltérések nélkül.")} {sentence.join("; ")}.
          </span>
        </span>
      </label>
      <div className={card(fixed)}>
        <label className={`flex min-w-0 flex-1 items-start gap-3 ${canEdit ? "cursor-pointer" : ""}`}>
          <input type="radio" name="tt-hours-basis" value="fixed" disabled={!canEdit} checked={fixed} onChange={() => set("hoursBasis", "fixed")} className="mt-1 size-4 accent-primary" data-testid="tt-hours-basis-fixed" />
          <span className="grid min-w-0 gap-0.5">
            <span className="text-ui font-semibold text-slate-900">{t("Fixed hours per month", "Pevný počet hodín za mesiac", "Fix havi óraszám")}</span>
            <span className="type-meta text-slate-500">{t("Same rate every month.", "Rovnaká sadzba každý mesiac.", "Minden hónapban ugyanaz a díj.")}</span>
          </span>
        </label>
        <input
          type="number"
          min={1}
          disabled={!canEdit || !fixed}
          value={draft.fixedHoursPerMonth}
          aria-label={t("Hours per month", "Hodiny za mesiac", "Órák havonta")}
          onChange={(e) => set("fixedHoursPerMonth", Number.isFinite(parseFloat(e.target.value)) ? parseFloat(e.target.value) : 168)}
          className={`${field} w-24 text-center tabular-nums`}
          data-testid="tt-fixed-hours"
        />
      </div>
    </div>
  );
}
