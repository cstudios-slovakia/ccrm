import type { Language } from "../../../utils/translations";
import type { ProfitabilityData } from "./types";
import { countNoun, makeT, money, percent, signedMoney } from "./format";
import { Card, CardTitle, LegendItem, NoRows, TickLegend, Track } from "./shared";

const COLS =
  "grid grid-cols-[minmax(--spacing(45),2fr)_--spacing(26)_--spacing(26)_--spacing(26)_minmax(--spacing(47),1.6fr)] items-center gap-x-4";
const HEAD = "type-overline h-8 text-gray-500";

type Level = "ok" | "warn" | "loss";

const levelOf = (ratio: number): Level => (ratio > 100 ? "loss" : ratio >= 80 ? "warn" : "ok");
const FILL: Record<Level, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", loss: "bg-rose-500" };
const TEXT: Record<Level, string> = { ok: "text-gray-900", warn: "text-amber-700", loss: "text-rose-700" };

export const ProfitabilityCard = ({
  data,
  language,
  currencyCode,
  className = "",
}: {
  data: ProfitabilityData;
  language: Language;
  currencyCode?: string | null;
  className?: string;
}) => {
  const t = makeT(language);
  const { total } = data;
  // A figure that would leave out a cost the user may not see is not shown at all.
  const hiddenTitle = t("Needs the time cost permission", "Vyžaduje oprávnenie k nákladom času", "Az időköltség jogosultság szükséges");
  const hiddenDash = <span title={hiddenTitle}>—</span>;
  return (
    <Card className={className}>
      <CardTitle
        title={t("Project profitability", "Ziskovosť projektov", "Projektek jövedelmezősége")}
        caption={t(
          "Active projects and inactive ones with costs in the last month",
          "Aktívne projekty a neaktívne s nákladmi za posledný mesiac",
          "Aktív projektek és az elmúlt hónapban költséggel rendelkező inaktívak",
        )}
        legend={
          <>
            <LegendItem swatch="bg-emerald-500" label={t("up to 80 %", "do 80 %", "80 %-ig")} />
            <LegendItem swatch="bg-amber-500" label="80 – 100 %" />
            <LegendItem swatch="bg-rose-500" label={t("loss", "strata", "veszteség")} />
          </>
        }
      />
      <div className="mt-4 overflow-x-auto">
        <div className="min-w-180 text-ui tabular-nums">
          <div className={`${COLS} ${HEAD}`}>
            <span>{t("Project", "Projekt", "Projekt")}</span>
            <span className="text-right">{t("Invoiced", "Fakturované", "Számlázott")}</span>
            <span className="text-right">{t("Costs", "Náklady", "Költségek")}</span>
            <span className="text-right">{t("Profit", "Zisk", "Nyereség")}</span>
            <span>{t("Costs / invoiced", "Náklady / fakturované", "Költség / számlázott")}</span>
          </div>
          {data.rows.length === 0 ? (
            <NoRows language={language} />
          ) : (
            <>
              {data.rows.map((row) => {
                const level = row.costRatioPct === null ? null : levelOf(row.costRatioPct);
                return (
                  <div key={row.projectId} className={`${COLS} h-13 border-t border-gray-100`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-gray-900">{row.name}</span>
                        {row.inactive && (
                          <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-px text-micro font-semibold text-gray-600">
                            {t("Inactive", "Neaktívny", "Inaktív")}
                          </span>
                        )}
                      </div>
                      <div className="type-meta truncate text-gray-500">{row.clientName}</div>
                    </div>
                    <span className="text-right text-gray-800">{money(row.invoiced, currencyCode, language)}</span>
                    <span className="text-right text-gray-800">{row.costsHidden ? hiddenDash : money(row.costs, currencyCode, language)}</span>
                    <span className={`text-right font-bold ${row.costsHidden ? "text-gray-500" : row.profit < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                      {row.costsHidden ? hiddenDash : signedMoney(row.profit, currencyCode, language)}
                    </span>
                    <div className="grid grid-cols-[minmax(0,1fr)_--spacing(12)] items-center gap-x-2.5">
                      <Track
                        pct={row.costsHidden || row.costRatioPct === null ? 0 : Math.min(100, row.costRatioPct * 0.8)}
                        tickPct={80}
                        fillClass={level && !row.costsHidden ? FILL[level] : "bg-gray-100"}
                      />
                      <span className={`text-right font-bold ${level && !row.costsHidden ? TEXT[level] : "text-gray-900"}`}>
                        {row.costsHidden ? hiddenDash : percent(row.costRatioPct, language, 0)}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className={`${COLS} h-13 border-t border-gray-200 font-bold text-gray-900`}>
                <span>
                  {t("Total", "Spolu", "Összesen")} · {countNoun("project", total.projects, language)}
                </span>
                <span className="text-right">{money(total.invoiced, currencyCode, language)}</span>
                <span className="text-right">{total.costsHidden ? hiddenDash : money(total.costs, currencyCode, language)}</span>
                <span className={`text-right ${total.costsHidden ? "text-gray-500" : total.profit < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {total.costsHidden ? hiddenDash : signedMoney(total.profit, currencyCode, language)}
                </span>
                <div className="grid grid-cols-[minmax(0,1fr)_--spacing(12)] items-center gap-x-2.5">
                  <TickLegend className="font-normal">
                    {t(
                      "100 % = costs equal to the invoiced amount",
                      "100 % = náklady vo výške fakturácie",
                      "100 % = a számlázott összeggel egyező költség",
                    )}
                  </TickLegend>
                  <span className="text-right">{total.costsHidden ? hiddenDash : percent(total.costRatioPct, language, 0)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
};
