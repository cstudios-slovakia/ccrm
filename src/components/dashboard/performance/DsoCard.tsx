import { useState } from "react";
import type { Language } from "../../../utils/translations";
import type { DsoData, PeriodLabels } from "./types";
import { days, makeT } from "./format";
import {
  Card,
  CardTitle,
  DeltaPhrase,
  HeadlineValue,
  NoRows,
  SegmentedSwitch,
  SubLine,
  TickLegend,
  Track,
  deltaTone,
  ratioPct,
} from "./shared";

export const DsoCard = ({
  data,
  labels,
  language,
  className = "",
  onInfo,
}: {
  data: DsoData;
  labels: PeriodLabels;
  language: Language;
  className?: string;
  onInfo?: () => void;
}) => {
  const t = makeT(language);
  const [order, setOrder] = useState<"worst" | "best">("worst");
  const rows = order === "worst" ? data.worst : data.best;
  const term = data.paymentTermDays !== null && data.paymentTermDays > 0 ? data.paymentTermDays : null;
  // Full at twice the term; without a term the slowest listed client fills the bar.
  const scale = term !== null ? term * 2 : Math.max(1, ...[...data.worst, ...data.best].map((r) => r.days));

  return (
    <Card className={className}>
      <CardTitle
        title={t("DSO · collection time", "DSO · doba inkasa", "DSO · beszedési idő")}
        caption={t(
          "Days from invoice issue to payment",
          "Dni od vystavenia faktúry po úhradu",
          "Napok a számla kiállításától a kifizetésig",
        )}
        onInfo={onInfo}
      />
      <HeadlineValue value={days(data.averageDays, language)} unit={t("on average", "v priemere", "átlagosan")} />
      <SubLine>
        <DeltaPhrase
          text={data.deltaDays === null ? null : days(data.deltaDays, language, true)}
          tone={deltaTone(data.deltaDays, false)}
          phrase={labels.versusPrevious}
        />
      </SubLine>
      <div className="mt-4">
        <SegmentedSwitch
          fill
          ariaLabel={t("Client order", "Poradie klientov", "Ügyfelek sorrendje")}
          activeId={order}
          onSelect={(id) => setOrder(id === "best" ? "best" : "worst")}
          items={[
            { id: "worst", label: t("Worst 5", "Najhorších 5", "Legrosszabb 5") },
            { id: "best", label: t("Best 5", "Najlepších 5", "Legjobb 5") },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <NoRows language={language} />
      ) : (
        <div className="mt-3 flex flex-col text-ui tabular-nums">
          {rows.map((row) => {
            const late = term !== null && row.days > term;
            return (
              <div
                key={row.clientId}
                className="grid h-8 grid-cols-[--spacing(24)_minmax(0,1fr)_--spacing(13)] items-center gap-x-2.5"
              >
                <span className="truncate text-gray-800">{row.name}</span>
                <Track
                  pct={ratioPct(row.days, scale)}
                  tickPct={term !== null ? 50 : null}
                  fillClass={term === null ? "bg-entity-solid" : late ? "bg-rose-500" : "bg-emerald-500"}
                />
                <span className={`text-right font-bold ${late ? "text-rose-700" : "text-gray-900"}`}>
                  {days(row.days, language)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {term !== null && (
        <TickLegend className="mt-auto pt-2.5">
          {t("Payment term", "Splatnosť", "Fizetési határidő")} {days(term, language)}
        </TickLegend>
      )}
    </Card>
  );
};
