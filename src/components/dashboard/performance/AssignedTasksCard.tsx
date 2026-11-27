import type { Language } from "../../../utils/translations";
import type { AssignedTasksData } from "./types";
import { countNoun, makeT } from "./format";
import { Avatar, Card, CardTitle, Figure, HeadlineValue, LegendItem, NoRows, SegmentedBar } from "./shared";

export const AssignedTasksCard = ({
  data,
  language,
  className = "",
  onInfo,
}: {
  data: AssignedTasksData;
  language: Language;
  className?: string;
  onInfo?: () => void;
}) => {
  const t = makeT(language);
  const overdueWord = t("overdue", "po termíne", "lejárt");
  return (
    <Card className={className}>
      <CardTitle
        title={t("Assigned tasks", "Pridelené úlohy", "Kiosztott feladatok")}
        caption={t("Open tasks by employee", "Otvorené úlohy podľa zamestnanca", "Nyitott feladatok munkatársanként")}
        onInfo={onInfo}
        legend={
          <>
            <LegendItem swatch="bg-entity-solid" label={t("On time", "V termíne", "Határidőn belül")} />
            <LegendItem swatch="bg-rose-500" label={t("Overdue", "Po termíne", "Lejárt")} />
          </>
        }
      />
      <HeadlineValue
        value={countNoun("task", data.total, language)}
        unit={
          <>
            {t("of which", "z toho", "ebből")} <Figure tone="bad">{`${data.overdue} ${overdueWord}`}</Figure>
          </>
        }
      />
      {data.rows.length === 0 ? (
        <NoRows language={language} />
      ) : (
        <div className="mt-3 flex flex-col text-ui tabular-nums">
          {data.rows.map((row) => (
            <div
              key={row.employeeId}
              className="grid h-10 grid-cols-[--spacing(7)_--spacing(29)_minmax(0,1fr)_--spacing(6)] items-center gap-x-2.5 border-t border-gray-100"
            >
              <Avatar name={row.name} />
              <span className="truncate font-semibold text-gray-800">{row.name}</span>
              <SegmentedBar
                scaleMax={data.scaleMax}
                segments={[
                  { key: "ontime", value: Math.max(0, row.open - row.overdue), className: "bg-entity-solid" },
                  { key: "overdue", value: row.overdue, className: "bg-rose-500" },
                ]}
              />
              <span className="text-right font-bold text-gray-900">{row.open}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
