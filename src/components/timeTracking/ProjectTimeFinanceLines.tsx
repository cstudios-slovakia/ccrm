import type { Language } from "../../utils/translations";

const pick = (language: Language, en: string, sk: string, hu: string) => (language === "sk" ? sk : language === "hu" ? hu : en);

/**
 * Two information lines under the project's Costs card. "Labour" is the sum of the stored entry cost
 * (each person's worked time x their hourly cost). "Billable work" is tracked hours x billable rate (C13);
 * it is shown for reference only and is never added to Invoicable, income or any total (D3.4).
 */
export function ProjectTimeFinanceLines({
  language,
  money,
  labourCost,
  billableValue,
  billableComplete,
}: {
  language: Language;
  money: (v: number) => string;
  labourCost: number | null;
  billableValue: number | null | undefined;
  billableComplete: boolean | undefined;
}) {
  return (
    <>
      {labourCost != null && (
        <div
          className="mt-1 type-meta text-violet-700"
          data-testid="project-labour-line"
          title={pick(language, "Cost of tracked time (each person's worked time × their hourly cost)", "Náklad sledovaného času (odpracovaný čas každého × jeho hodinový náklad)", "A követett idő költsége (mindenki ledolgozott ideje × órás költsége)")}
        >
          {pick(language, "Labour (time tracking)", "Práca (evidencia času)", "Munka (időkövetés)")}: {money(labourCost)}
        </div>
      )}
      {billableValue != null && (
        <div
          className="mt-1 type-meta text-gray-600"
          data-testid="project-billable-work-line"
          title={pick(language, "Tracked hours × billable rate. Information only: does not change Invoicable or income.", "Sledované hodiny × fakturačná sadzba. Len informatívne: nemení Fakturovateľné ani príjem.", "Követett órák × számlázási díj. Csak tájékoztató: nem módosítja a Számlázhatót és a bevételt.")}
        >
          {pick(language, "Billable work (time tracking)", "Fakturovateľná práca (sledovanie času)", "Számlázható munka (időkövetés)")}: {money(billableValue)}
          {billableComplete === false && (
            <span className="ml-1 text-amber-700">({pick(language, "incomplete: some entries have no rate", "neúplné: niektoré záznamy nemajú sadzbu", "hiányos: egyes bejegyzéseknek nincs díja")})</span>
          )}
        </div>
      )}
    </>
  );
}
