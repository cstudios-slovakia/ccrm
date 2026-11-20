import { ListChecks } from "lucide-react";
import type { Language } from "../../../utils/translations";
import type { ScopeCreepData } from "./types";
import { makeT, signedCountNoun, signedPercent } from "./format";
import { Card, CardTitle, Figure, HeadlineValue, LegendItem, NoRows, PendingCard, SegmentedBar, SubLine } from "./shared";

export const ScopeCreepCard = ({
  data,
  language,
  className = "",
}: {
  data: ScopeCreepData | null;
  language: Language;
  className?: string;
}) => {
  const t = makeT(language);
  const title = "Scope creep";
  const caption = t(
    "Acceptance criteria added after the scope was approved",
    "Akceptačné kritériá pridané po schválení rozsahu",
    "A terjedelem jóváhagyása után hozzáadott elfogadási kritériumok",
  );
  if (data === null) {
    return (
      <PendingCard
        className={className}
        language={language}
        title={title}
        caption={caption}
        icon={<ListChecks aria-hidden="true" />}
        body={t(
          "Projects do not have acceptance criteria yet.",
          "Projekty zatiaľ nemajú akceptačné kritériá.",
          "A projekteknek még nincsenek elfogadási kritériumaik.",
        )}
      />
    );
  }
  return (
    <Card className={className}>
      <CardTitle title={title} caption={caption} />
      <HeadlineValue value={signedCountNoun("criterion", data.addedInPeriod, language)} />
      <SubLine>
        {data.sharePct !== null && <Figure tone="warn">{signedPercent(data.sharePct, language)}</Figure>}
        {data.sharePct !== null && " "}
        {t("against the original scope", "oproti pôvodnému rozsahu", "az eredeti terjedelemhez képest")} ({data.originalTotal})
      </SubLine>
      {data.rows.length === 0 ? (
        <NoRows language={language} />
      ) : (
        <>
          <div className="mt-4 flex gap-3.5">
            <LegendItem swatch="bg-slate-300" label={t("Original scope", "Pôvodný rozsah", "Eredeti terjedelem")} />
            <LegendItem swatch="bg-amber-500" label={t("Added", "Pridané", "Hozzáadott")} />
          </div>
          <div className="mt-2 flex flex-col text-ui tabular-nums">
            {data.rows.map((row) => (
              <div
                key={row.projectId}
                className="grid h-9 grid-cols-[--spacing(28)_minmax(0,1fr)_--spacing(18)] items-center gap-x-2.5"
              >
                <span className="truncate text-slate-800">{row.name}</span>
                <SegmentedBar
                  scaleMax={data.scaleMax}
                  segments={[
                    { key: "original", value: row.original, className: "bg-slate-300" },
                    { key: "added", value: row.added, className: "bg-amber-500" },
                  ]}
                />
                <span className="text-right text-slate-600">
                  {row.original} <span className="font-bold text-amber-700">+{row.added}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
};
