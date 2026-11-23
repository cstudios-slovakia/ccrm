import type { Language } from "../../../utils/translations";
import type { PeriodLabels, ThroughputData } from "./types";
import { days, makeT } from "./format";
import { Card, CardTitle, DeltaPhrase, HeadlineValue, NoRows, Overline, SubLine, Track, deltaTone, ratioPct } from "./shared";

export const ThroughputCard = ({
  data,
  labels,
  language,
  className = "",
}: {
  data: ThroughputData;
  labels: PeriodLabels;
  language: Language;
  className?: string;
}) => {
  const t = makeT(language);
  return (
    <Card className={className}>
      <CardTitle
        title={t("Task throughput", "Priepustnosť úloh", "Feladatok átfutása")}
        caption={t(
          "Average time from task creation to completion",
          "Priemerný čas od zadania úlohy po dokončenie",
          "Átlagos idő a feladat kiadásától a befejezéséig",
        )}
      />
      <HeadlineValue value={days(data.averageDays, language)} unit={t("per task", "na úlohu", "feladatonként")} />
      <SubLine>
        <DeltaPhrase
          text={data.deltaDays === null ? null : days(data.deltaDays, language, true)}
          tone={deltaTone(data.deltaDays, false)}
          phrase={labels.versusPrevious}
        />
      </SubLine>
      <Overline className="mt-4">{t("By project", "Podľa projektu", "Projektenként")}</Overline>
      {data.byProject.length === 0 ? (
        <NoRows language={language} />
      ) : (
        <div className="mt-1 flex flex-col text-ui tabular-nums">
          {data.byProject.map((row) => (
            <div
              key={row.projectId}
              className="grid h-9 grid-cols-[--spacing(28)_minmax(0,1fr)_--spacing(15)] items-center gap-x-2.5"
            >
              <span className="truncate text-gray-800">{row.name}</span>
              <Track pct={ratioPct(row.days, data.scaleMax)} fillClass="bg-entity-solid" />
              <span className="text-right font-bold text-gray-900">{days(row.days, language)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
