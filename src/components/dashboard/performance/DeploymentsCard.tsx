import { GitBranch } from "lucide-react";
import type { Language } from "../../../utils/translations";
import type { DeploymentsData } from "./types";
import { countNoun, makeT, relativeTime } from "./format";
import { Card, CardTitle, DotJoin, HeadlineValue, NoRows, PendingCard, SubLine, Track, ratioPct } from "./shared";

const COLS = "grid grid-cols-[--spacing(28)_minmax(0,1fr)_--spacing(6)_--spacing(23)] gap-x-2.5";

export const DeploymentsCard = ({
  data,
  language,
  now,
  className = "",
}: {
  data: DeploymentsData | null;
  language: Language;
  now: Date;
  className?: string;
}) => {
  const t = makeT(language);
  const title = t("Server deployments", "Nasadenia na server", "Szerver telepítések");
  const caption = t(
    "GitHub pushes by project and the time of the latest one",
    "Pushe z GitHubu podľa projektu a čas posledného",
    "GitHub push-ok projektenként és az utolsó időpontja",
  );
  if (data === null) {
    return (
      <PendingCard
        className={className}
        language={language}
        title={title}
        caption={caption}
        icon={<GitBranch aria-hidden="true" />}
        body={t(
          "Projects are not connected to GitHub yet.",
          "Projekty zatiaľ nie sú prepojené s GitHubom.",
          "A projektek még nincsenek összekötve a GitHubbal.",
        )}
      />
    );
  }
  return (
    <Card className={className}>
      <CardTitle title={title} caption={caption} />
      <HeadlineValue value={countNoun("push", data.total, language)} />
      <SubLine>
        {data.lastPushAt && (
          <DotJoin
            parts={[
              <>
                {t("Latest", "Posledný", "Utolsó")}{" "}
                <span className="font-bold text-slate-900">{relativeTime(data.lastPushAt, now, language)}</span>
              </>,
              data.lastPushProject,
            ]}
          />
        )}
      </SubLine>
      {data.rows.length === 0 ? (
        <NoRows language={language} />
      ) : (
        <>
          <div className={`${COLS} type-overline mt-4 text-slate-500`}>
            <span>{t("Project", "Projekt", "Projekt")}</span>
            <span>{t("Count", "Počet", "Darab")}</span>
            <span />
            <span className="text-right">{t("Latest", "Posledný", "Utolsó")}</span>
          </div>
          <div className="mt-1 flex flex-col text-ui tabular-nums">
            {data.rows.map((row) => (
              <div key={row.projectId} className={`${COLS} h-9 items-center`}>
                <span className="truncate text-slate-800">{row.name}</span>
                <Track pct={ratioPct(row.pushes, data.scaleMax)} fillClass="bg-primary" />
                <span className="text-right font-bold text-slate-900">{row.pushes}</span>
                <span className={`type-meta text-right ${row.stale ? "font-bold text-amber-700" : "text-slate-600"}`}>
                  {relativeTime(row.lastPushAt, now, language, "short")}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
};
