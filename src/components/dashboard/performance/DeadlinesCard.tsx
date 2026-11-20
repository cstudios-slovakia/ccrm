import type { Language } from "../../../utils/translations";
import type { DeadlineTone, DeadlinesData } from "./types";
import { deadlineDistance, makeT, monthShort } from "./format";
import { Card, CardTitle, NoRows } from "./shared";

const CHIP: Record<DeadlineTone, string> = {
  overdue: "border-rose-200 bg-rose-50 text-rose-700",
  soon: "border-amber-200 bg-amber-50 text-amber-700",
  later: "border-slate-200 bg-slate-100 text-slate-600",
};
const DATE_BOX: Record<DeadlineTone, string> = {
  overdue: "bg-rose-50 text-rose-700",
  soon: "bg-amber-50 text-amber-700",
  later: "bg-slate-100 text-slate-600",
};
const DISTANCE: Record<DeadlineTone, string> = {
  overdue: "font-bold text-rose-700",
  soon: "font-bold text-amber-700",
  later: "font-semibold text-slate-600",
};

export const DeadlinesCard = ({
  data,
  language,
  className = "",
}: {
  data: DeadlinesData;
  language: Language;
  className?: string;
}) => {
  const t = makeT(language);
  const counters: { tone: DeadlineTone; n: number; label: string }[] = [
    { tone: "overdue", n: data.overdue, label: t("overdue", "po termíne", "lejárt") },
    { tone: "soon", n: data.soon, label: t("within 14 days", "do 14 dní", "14 napon belül") },
    { tone: "later", n: data.later, label: t("later", "neskôr", "később") },
  ];
  return (
    <Card className={className}>
      <CardTitle
        title={t("Project deadlines", "Termíny projektov", "Projektek határidői")}
        caption={t(
          "Active projects by nearest deadline",
          "Aktívne projekty podľa najbližšieho termínu",
          "Aktív projektek a legközelebbi határidő szerint",
        )}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        {counters.map((c) => (
          <span key={c.tone} className={`type-meta rounded-full border px-2.5 py-0.5 font-bold ${CHIP[c.tone]}`}>
            {c.n} {c.label}
          </span>
        ))}
      </div>
      {data.rows.length === 0 ? (
        <NoRows language={language} />
      ) : (
        <div className="mt-3 flex flex-col">
          {data.rows.map((row) => (
            <div
              key={row.projectId}
              className="grid h-13 grid-cols-[--spacing(11)_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-slate-100"
            >
              <div className={`flex h-10 flex-col items-center justify-center rounded-xl leading-tight ${DATE_BOX[row.tone]}`}>
                <span className="type-body font-extrabold">{row.deadline.getDate()}</span>
                <span className="text-micro font-bold uppercase">{monthShort(row.deadline.getMonth(), language)}</span>
              </div>
              <div className="min-w-0">
                <div className="truncate text-ui font-semibold text-slate-900">{row.name}</div>
                <div className="type-meta truncate text-slate-500">{row.clientName}</div>
              </div>
              <span className={`type-meta whitespace-nowrap tabular-nums ${DISTANCE[row.tone]}`}>
                {deadlineDistance(row.daysFromToday, language)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
