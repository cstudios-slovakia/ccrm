import { RotateCcw } from "lucide-react";
import type { Language } from "../../../utils/translations";
import type { ReworkRatioData } from "./types";
import { makeT, ofTotal, percent } from "./format";
import { Avatar, Card, CardTitle, HeadlineValue, NoRows, Overline, PendingCard, Track, ratioPct } from "./shared";

export const ReworkRatioCard = ({
  data,
  language,
  className = "",
  onInfo,
}: {
  data: ReworkRatioData | null;
  language: Language;
  className?: string;
  onInfo?: () => void;
}) => {
  const t = makeT(language);
  const title = t("Rework ratio", "Rework pomer", "Rework arány");
  const caption = t(
    "Share of completed tasks that were reopened",
    "Podiel dokončených úloh, ktoré boli znova otvorené",
    "A befejezett feladatok közül az újranyitottak aránya",
  );
  if (data === null) {
    return (
      <PendingCard
        className={className}
        language={language}
        title={title}
        caption={caption}
        icon={<RotateCcw aria-hidden="true" />}
        body={t(
          "Task reopenings are not recorded yet.",
          "Opätovné otvorenia úloh sa zatiaľ nezaznamenávajú.",
          "A feladatok újranyitása még nincs rögzítve.",
        )}
      />
    );
  }
  return (
    <Card className={className}>
      <CardTitle title={title} caption={caption} onInfo={onInfo} />
      <HeadlineValue
        value={percent(data.ratePct, language, 0)}
        unit={`${t("overall", "celkovo", "összesen")} · ${ofTotal(data.reopened, data.completed, "task", language)}`}
      />
      <Overline className="mt-4">{t("By employee", "Podľa zamestnanca", "Munkatársanként")}</Overline>
      {data.rows.length === 0 ? (
        <NoRows language={language} />
      ) : (
        <div className="mt-1 overflow-x-auto">
          <div className="flex min-w-115 flex-col text-ui tabular-nums">
            {data.rows.map((row) => (
              <div
                key={row.employeeId}
                className="grid h-10 grid-cols-[--spacing(7)_--spacing(31)_minmax(0,1fr)_--spacing(24)_--spacing(11)] items-center gap-x-2.5 border-t border-gray-100"
              >
                <Avatar name={row.name} />
                <span className="truncate font-semibold text-gray-800">{row.name}</span>
                <Track pct={ratioPct(row.ratePct, data.scaleMax)} fillClass="bg-amber-500" />
                <span className="type-meta text-right text-gray-600">
                  {ofTotal(row.reopened, row.completed, "task", language)}
                </span>
                <span className="text-right font-bold text-gray-900">{percent(row.ratePct, language, 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};
