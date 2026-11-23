import { RotateCcw } from "lucide-react";
import type { Language } from "../../../utils/translations";
import type { ReworkCountData } from "./types";
import { makeT, multiplier } from "./format";
import { Card, CardTitle, HeadlineValue, NoRows, Overline, PendingCard, Track, ratioPct } from "./shared";

export const ReworkCountCard = ({
  data,
  language,
  className = "",
}: {
  data: ReworkCountData | null;
  language: Language;
  className?: string;
}) => {
  const t = makeT(language);
  const title = "Rework count";
  const caption = t(
    "How many times a task is reopened on average",
    "Koľkokrát sa úloha v priemere znova otvorí",
    "Átlagosan hányszor nyitnak újra egy feladatot",
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
      <CardTitle title={title} caption={caption} />
      <HeadlineValue
        value={multiplier(data.average, language)}
        unit={t("per reopened task", "na znovuotvorenú úlohu", "újranyitott feladatonként")}
      />
      <Overline className="mt-4">{t("By project", "Podľa projektu", "Projektenként")}</Overline>
      {data.byProject.length === 0 ? (
        <NoRows language={language} />
      ) : (
        <div className="mt-1 flex flex-col text-ui tabular-nums">
          {data.byProject.map((row) => (
            <div
              key={row.projectId}
              className="grid h-10 grid-cols-[--spacing(33)_minmax(0,1fr)_--spacing(10)] items-center gap-x-2.5 border-t border-gray-100"
            >
              <span className="truncate font-semibold text-gray-800">{row.name}</span>
              <Track pct={ratioPct(row.average, data.scaleMax)} fillClass="bg-amber-500" />
              <span className="text-right font-bold text-gray-900">{multiplier(row.average, language)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
