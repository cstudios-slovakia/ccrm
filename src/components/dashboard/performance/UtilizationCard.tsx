import { Bug } from "lucide-react";
import type { Language } from "../../../utils/translations";
import type { UtilizationData, UtilizationState } from "./types";
import { hours, makeT, percent } from "./format";
import { Avatar, Card, CardTitle, HeadlineValue, LegendItem, NoRows, PendingCard, SegmentedBar } from "./shared";

export const UtilizationCard = ({
  data,
  state = "ready",
  truncated = false,
  language,
  className = "",
}: {
  data: UtilizationData | null;
  state?: UtilizationState;
  /** The entries hit the server's list limit: say that the period is not complete. */
  truncated?: boolean;
  language: Language;
  className?: string;
}) => {
  const t = makeT(language);
  const title = t("Utilization · time on bugs", "Utilizácia · čas na bugoch", "Kihasználtság · hibákra fordított idő");
  const caption = t(
    "Share of worked time spent on tasks in the Bug category",
    "Podiel odpracovaného času na úlohách kategórie Bug",
    "A ledolgozott idő aránya a Bug kategóriájú feladatokon",
  );
  if (state === "loading") {
    return (
      <Card className={className}>
        <CardTitle title={title} caption={caption} />
        <p className="type-meta mt-4 text-gray-500">{t("Loading…", "Načítavam…", "Betöltés…")}</p>
      </Card>
    );
  }
  if (data === null) {
    return (
      <PendingCard
        className={className}
        language={language}
        title={title}
        caption={caption}
        icon={<Bug aria-hidden="true" />}
        body={
          state === "time-tracking"
            ? t(
                "Time tracking is not available to you.",
                "Evidencia času nie je pre vás dostupná.",
                "Az időnyilvántartás nem érhető el az Ön számára.",
              )
            : t(
                "The data could not be loaded.",
                "Údaje sa nepodarilo načítať.",
                "Az adatokat nem sikerült betölteni.",
              )
        }
      />
    );
  }
  return (
    <Card className={className}>
      <CardTitle
        title={title}
        caption={caption}
        legend={
          <>
            <LegendItem swatch="bg-rose-500" label={t("Bugs", "Bugy", "Hibák")} />
            <LegendItem swatch="bg-gray-300" label={t("Other work", "Ostatná práca", "Egyéb munka")} />
          </>
        }
      />
      {truncated && (
        <p className="type-meta mt-2 text-amber-700">
          {t(
            "Only the latest entries are shown (limit 5,000); choose a shorter period.",
            "Zobrazené sú len najnovšie záznamy (limit 5 000); zvoľte kratšie obdobie.",
            "Csak a legfrissebb bejegyzések láthatók (limit 5 000); válasszon rövidebb időszakot.",
          )}
        </p>
      )}
      <HeadlineValue
        value={percent(data.sharePct, language, 0)}
        unit={`${t("of team time", "času tímu", "a csapat idejéből")} · ${hours(data.bugMs, language)} ${t("of", "z", "/")} ${hours(data.totalMs, language)}`}
      />
      {data.rows.length === 0 ? (
        <NoRows language={language} />
      ) : (
        <div className="mt-3 overflow-x-auto">
          <div className="flex min-w-115 flex-col text-ui tabular-nums">
            {data.rows.map((row) => (
              <div
                key={row.employeeId}
                className="grid h-10 grid-cols-[--spacing(7)_--spacing(31)_minmax(0,1fr)_--spacing(24)_--spacing(11)] items-center gap-x-2.5 border-t border-gray-100"
              >
                <Avatar name={row.name} />
                <span className="truncate font-semibold text-gray-800">{row.name}</span>
                <SegmentedBar
                  segments={[
                    { key: "bug", value: row.sharePct, className: "bg-rose-500" },
                    { key: "other", value: 100 - row.sharePct, className: "bg-gray-300" },
                  ]}
                />
                <span className="type-meta text-right text-gray-600">
                  {hours(row.bugMs, language)} {t("of", "z", "/")} {hours(row.totalMs, language)}
                </span>
                <span className="text-right font-bold text-gray-900">{percent(row.sharePct, language, 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};
