import type { Language } from "../../../utils/translations";
import type { PeriodLabels, RecurringIncomeData } from "./types";
import { makeT, money, percent, signedMoney } from "./format";
import { Card, CardTitle, DeltaPhrase, DotJoin, HeadlineValue, NoRows, Overline, SubLine, Track, deltaTone } from "./shared";

export const RecurringIncomeCard = ({
  data,
  labels,
  language,
  currencyCode,
  className = "",
  onInfo,
}: {
  data: RecurringIncomeData;
  labels: PeriodLabels;
  language: Language;
  currencyCode?: string | null;
  className?: string;
  onInfo?: () => void;
}) => {
  const t = makeT(language);
  return (
    <Card className={className}>
      <CardTitle
        title={t("Recurring income", "Rekurentné príjmy", "Ismétlődő bevételek")}
        caption={t(
          "Recurring income from the Financial overview",
          "Opakované príjmy z Finančného prehľadu",
          "Ismétlődő bevételek a Pénzügyi áttekintésből",
        )}
        onInfo={onInfo}
      />
      <HeadlineValue value={money(data.monthly, currencyCode, language)} unit={t("/ month", "/ mesiac", "/ hónap")} />
      <SubLine>
        <DotJoin
          parts={[
            data.deltaMonthly === null ? null : (
              <DeltaPhrase
                text={signedMoney(data.deltaMonthly, currencyCode, language)}
                tone={deltaTone(data.deltaMonthly)}
                phrase={labels.versusPreviousMonth}
              />
            ),
            `${money(data.yearly, currencyCode, language)} ${t("per year", "ročne", "évente")}`,
          ]}
        />
      </SubLine>
      <div className="type-meta mt-5 flex justify-between text-gray-600">
        <span>{t("Share of all income", "Podiel na všetkých príjmoch", "Az összes bevétel aránya")}</span>
        <span className="font-bold text-gray-900">{percent(data.shareOfIncomePct, language, 0)}</span>
      </div>
      <Track className="mt-1.5" pct={data.shareOfIncomePct ?? 0} fillClass="bg-emerald-500" />
      <Overline className="mt-5">{t("What it is made of", "Z čoho sa skladajú", "Miből tevődik össze")}</Overline>
      {data.breakdown.length === 0 ? (
        <NoRows language={language} />
      ) : (
        <div className="mt-1 flex flex-col text-ui tabular-nums">
          {data.breakdown.map((row, i) => (
            <div
              key={`${row.label}-${i}`}
              className={`flex h-8.5 items-center justify-between gap-3 ${i < data.breakdown.length - 1 ? "border-b border-gray-100" : ""}`}
            >
              <span className="truncate text-gray-800">
                {row.other ? t("Other", "Ostatné", "Egyéb") : row.label}
              </span>
              <span className="font-bold text-gray-900">{money(row.amount, currencyCode, language)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
