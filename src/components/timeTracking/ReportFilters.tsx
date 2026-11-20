import type { ReactNode } from "react";
import { Surface } from "../layout";
import { CustomSelect } from "../ui/CustomSelect";
import type { ReportPeriod } from "../../utils/timeReports.ts";

type T = (en: string, sk: string, hu: string) => string;
type Option = { value: string; label: string };

export type ReportMode = "summary" | "detailed" | "salary";

/** A pill with a muted key ("Projects") and the chosen value; clicking it opens the usual dropdown. */
export function FilterChip({ label, value, onChange, options, active = false }: { label: string; value: string; onChange: (v: string) => void; options: Option[]; active?: boolean }) {
  return (
    <div className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-ui ${active ? "border-primary/40 bg-primary/10" : "border-slate-200 bg-white"}`}>
      <span className="text-slate-500">{label}</span>
      <CustomSelect unstyled fitLabel size="sm" value={value} onChange={onChange} options={options} className="gap-1 font-semibold text-slate-900" />
    </div>
  );
}

export function ToggleChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex h-9 items-center rounded-xl border px-3 text-ui font-semibold transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-primary cursor-pointer ${pressed ? "border-primary/40 bg-primary/10 text-primary" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}

/** Period preset chip. "Custom range…" reveals the two date inputs next to it. */
export function PeriodChip({ t, period, setPeriod, from, to, setFrom, setTo }: { t: T; period: ReportPeriod; setPeriod: (p: ReportPeriod) => void; from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  const input = "h-9 rounded-xl border border-slate-200 bg-white px-2 text-ui text-slate-800";
  return (
    <>
      <FilterChip
        label={t("Period", "Obdobie", "Időszak")}
        value={period}
        onChange={(v) => setPeriod(v as ReportPeriod)}
        active
        options={[
          { value: "thisMonth", label: t("This month", "Tento mesiac", "Ez a hónap") },
          { value: "lastMonth", label: t("Last month", "Minulý mesiac", "Előző hónap") },
          { value: "thisWeek", label: t("This week", "Tento týždeň", "Ez a hét") },
          { value: "lastWeek", label: t("Last week", "Minulý týždeň", "Előző hét") },
          { value: "thisYear", label: t("This year", "Tento rok", "Idén") },
          { value: "custom", label: t("Custom range…", "Vlastné obdobie…", "Egyéni időszak…") },
        ]}
      />
      {period === "custom" && (
        <>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("From", "Od", "Ettől")} className={input} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("To", "Do", "Eddig")} className={input} />
        </>
      )}
    </>
  );
}

/** Summary / Detailed / Salary allocation. */
export function ModeSwitch({ mode, setMode, salary, t }: { mode: ReportMode; setMode: (m: ReportMode) => void; salary: boolean; t: T }) {
  const item = (id: ReportMode, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setMode(id)}
      aria-pressed={mode === id}
      className={`h-8 rounded-lg px-3 text-ui font-semibold transition-all active:scale-95 cursor-pointer ${mode === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex w-fit flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {item("summary", t("Summary", "Súhrn", "Összegzés"))}
      {item("detailed", t("Detailed", "Podrobné", "Részletes"))}
      {salary && item("salary", t("Salary allocation", "Rozdelenie mzdy", "Bérfelosztás"))}
    </div>
  );
}

/** The one card above the report: filter chips on the left, the report type at the right end. */
export function ReportFilterCard({ chips, modeSwitch }: { chips: ReactNode; modeSwitch: ReactNode }) {
  return (
    <Surface padding="none" className="flex flex-wrap items-center gap-2 p-3">
      {chips}
      <div className="ml-auto">{modeSwitch}</div>
    </Surface>
  );
}
