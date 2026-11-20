import type { Language } from "../../../utils/translations";
import type { CashflowData, CashflowMonth, PeriodLabels } from "./types";
import { makeT, monthShort, monthYear, signedMoney, thousands, money } from "./format";
import { Card, CardTitle, LegendItem, ratioPct } from "./shared";

const COLUMN = "relative flex h-full items-end justify-center gap-0.5";

const MonthColumn = ({ m, scaleMax, faded }: { m: CashflowMonth; scaleMax: number; faded: boolean }) => (
  <div className={`${COLUMN} flex-1`}>
    <div
      className={`w-4 rounded-t-sm bg-emerald-500 ${faded ? "opacity-45" : ""}`}
      style={{ height: `${ratioPct(m.income, scaleMax)}%` }}
    />
    <div
      className={`w-4 rounded-t-sm bg-rose-500 ${faded ? "opacity-45" : ""}`}
      style={{ height: `${ratioPct(m.expenses, scaleMax)}%` }}
    />
  </div>
);

export const CashflowCard = ({
  data,
  labels,
  language,
  currencyCode,
  className = "",
}: {
  data: CashflowData;
  labels: PeriodLabels;
  language: Language;
  currencyCode?: string | null;
  className?: string;
}) => {
  const t = makeT(language);
  const net = data.periodIncome - data.periodExpenses;
  const actual = data.months.filter((m) => !m.forecast);
  const forecast = data.months.filter((m) => m.forecast);
  const first = data.months[0];
  const last = data.months[data.months.length - 1];
  const named = (label: string) => (labels.current ? `${label} · ${labels.current}` : label);
  const range = first && last ? `${monthYear(first.year, first.month, language)}` : "";
  const rangeEnd = first && last ? `${monthYear(last.year, last.month, language)}` : "";

  return (
    <Card className={className}>
      <CardTitle
        title="Cashflow"
        caption={t(
          "Income and expenses by month from the Financial overview",
          "Príjmy a výdavky po mesiacoch z Finančného prehľadu",
          "Bevételek és kiadások havonta a Pénzügyi áttekintésből",
        )}
      />
      <div className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
        <div>
          <LegendItem swatch="bg-emerald-500" label={named(t("Income", "Príjmy", "Bevétel"))} />
          <div className="type-metric mt-0.5 text-slate-900">{money(data.periodIncome, currencyCode, language)}</div>
        </div>
        <div>
          <LegendItem swatch="bg-rose-500" label={named(t("Expenses", "Výdavky", "Kiadások"))} />
          <div className="type-metric mt-0.5 text-slate-900">{money(data.periodExpenses, currencyCode, language)}</div>
        </div>
        <div>
          <div className="type-meta text-slate-600">{named(t("Net flow", "Čistý tok", "Nettó forgalom"))}</div>
          <div className={`type-metric mt-0.5 ${net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {signedMoney(net, currencyCode, language)}
          </div>
        </div>
      </div>
      <div className="mt-5 overflow-x-auto">
        <div className="grid min-w-130 grid-cols-[--spacing(12)_minmax(0,1fr)] gap-x-2 tabular-nums">
          <div
            aria-hidden="true"
            className="flex h-40 flex-col justify-between text-right text-micro leading-none text-slate-500"
          >
            <span>{thousands(data.scaleMax, language)}</span>
            <span>{thousands(data.scaleMax / 2, language)}</span>
            <span>0</span>
          </div>
          <div
            role="img"
            aria-label={t(
              `Bar chart of income and expenses, ${range} to ${rangeEnd}`,
              `Stĺpcový graf príjmov a výdavkov, ${range} až ${rangeEnd}`,
              `Bevételek és kiadások oszlopdiagramja, ${range} – ${rangeEnd}`,
            )}
            className="relative flex h-40 items-end border-b border-slate-300"
          >
            <div className="absolute inset-x-0 top-20 h-px bg-slate-100" />
            {actual.map((m) => (
              <MonthColumn key={`${m.year}-${m.month}`} m={m} scaleMax={data.scaleMax} faded={false} />
            ))}
            {forecast.length > 0 && (
              <div
                className="relative flex h-full items-end border-l border-dashed border-slate-400 bg-slate-50"
                style={{ flex: forecast.length }}
              >
                <span className="type-overline absolute top-1.5 left-2 text-slate-600">
                  {t("Forecast", "Prognóza", "Előrejelzés")}
                </span>
                {forecast.map((m) => (
                  <MonthColumn key={`${m.year}-${m.month}`} m={m} scaleMax={data.scaleMax} faded />
                ))}
              </div>
            )}
          </div>
          <div className="pt-2 text-right text-micro leading-snug font-semibold text-slate-600">
            {t("Month", "Mesiac", "Hónap")}
            <br />
            {t("Net flow", "Čistý tok", "Nettó")}
          </div>
          <div className="type-meta flex pt-2 text-center">
            {data.months.map((m) => {
              const flow = m.income - m.expenses;
              return (
                <div key={`${m.year}-${m.month}`} className="min-w-0 flex-1">
                  <div className={m.current ? "font-bold text-slate-900" : "text-slate-600"}>
                    {monthShort(m.month, language)}
                  </div>
                  <div className={`font-bold ${flow >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {thousands(flow, language, true)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
};
