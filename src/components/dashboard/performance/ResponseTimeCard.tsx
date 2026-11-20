import type { Language } from "../../../utils/translations";
import type { PeriodLabels, ResponseTimeData } from "./types";
import { duration, isoWeekLabel, makeT, percent } from "./format";
import { Card, CardTitle, DeltaPhrase, DotJoin, HeadlineValue, NoRows, Overline, SubLine, Track, deltaTone, ratioPct } from "./shared";

export const ResponseTimeCard = ({
  data,
  labels,
  language,
  className = "",
}: {
  data: ResponseTimeData;
  labels: PeriodLabels;
  language: Language;
  className?: string;
}) => {
  const t = makeT(language);
  const weekMax = Math.max(0, ...data.weeks.map((w) => w.averageMs ?? 0));
  const within = within_(data, language, t);
  const overSla = data.slaMs !== null && data.averageMs !== null && data.averageMs > data.slaMs;
  return (
    <Card className={className}>
      <CardTitle
        title={t("Average response time", "Priemerná reakčná doba", "Átlagos reakcióidő")}
        caption={t(
          "Time from receiving a ticket to the first reply",
          "Čas od prijatia ticketu po prvú odpoveď",
          "A jegy beérkezésétől az első válaszig eltelt idő",
        )}
      />
      <HeadlineValue value={duration(data.averageMs, language)} />
      <SubLine>
        <DotJoin
          parts={[
            data.deltaMs === null ? null : (
              <DeltaPhrase
                text={duration(data.deltaMs, language, true)}
                tone={deltaTone(data.deltaMs, false)}
                phrase={labels.versusPrevious}
              />
            ),
            within,
          ]}
        />
      </SubLine>
      {data.slaMs !== null && (
        <>
          <div className="type-meta mt-4 flex justify-between text-slate-600">
            <span>0</span>
            <span>SLA {duration(data.slaMs, language)}</span>
          </div>
          <Track
            className="mt-1.5 overflow-hidden"
            pct={data.averageMs === null ? 0 : ratioPct(data.averageMs, data.slaMs)}
            fillClass={overSla ? "bg-rose-500" : "bg-emerald-500"}
          />
        </>
      )}
      <Overline className="mt-5">{t("By week", "Po týždňoch", "Hetente")}</Overline>
      {data.weeks.length === 0 ? (
        <NoRows language={language} />
      ) : (
        <>
          <div className="mt-2 flex h-14 items-end gap-3 border-b border-slate-300">
            {data.weeks.map((w) => (
              <div
                key={w.isoWeek}
                className="flex-1 rounded-t-sm bg-primary"
                style={{ height: `${w.averageMs === null ? 0 : ratioPct(w.averageMs, weekMax)}%` }}
              />
            ))}
          </div>
          <div className="type-meta mt-1.5 flex gap-3 text-center tabular-nums">
            {data.weeks.map((w) => (
              <div key={w.isoWeek} className="min-w-0 flex-1">
                <div className="font-bold text-slate-900">{duration(w.averageMs, language)}</div>
                <div className="text-slate-600">{isoWeekLabel(w.isoWeek, language)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
};

/** "94 % ticketov v SLA"; null when the share is unknown. */
const within_ = (data: ResponseTimeData, language: Language, t: ReturnType<typeof makeT>): string | null =>
  data.withinSlaPct === null
    ? null
    : `${percent(data.withinSlaPct, language, 0)} ${t("of tickets within SLA", "ticketov v SLA", "jegy az SLA-n belül")}`;
