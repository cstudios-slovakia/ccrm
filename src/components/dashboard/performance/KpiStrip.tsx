import type { ReactNode } from "react";
import { StatGrid, StatTile } from "../../layout/StatGrid";
import type { Language } from "../../../utils/translations";
import type { KpiStripData, PeriodLabels } from "./types";
import { acceptedWord, countNoun, makeT, money, noun, ofTotal, percent, pointsDelta, signedPercent } from "./format";
import { DeltaPhrase, DotJoin, Figure, Track, deltaTone } from "./shared";

/** A bar-high block: tiles without a bar reserve its height so all caption lines share one baseline. */
const BarSlot = ({ children }: { children?: ReactNode }) => (
  <div className="mt-2 flex h-1.5 gap-0.5" aria-hidden={children ? undefined : true}>
    {children}
  </div>
);

export const KpiStrip = ({
  data,
  labels,
  language,
  currencyCode,
}: {
  data: KpiStripData;
  labels: PeriodLabels;
  language: Language;
  currencyCode?: string | null;
}) => {
  const t = makeT(language);
  const { revenue, leadConversion: lc, offerSuccess: os, averageDeal: ad } = data;
  const rejected = Math.max(0, os.closed - os.accepted);
  const closedOffers =
    language === "sk"
      ? `z ${os.closed} ${os.closed === 1 ? "uzavretej ponuky" : "uzavretých ponúk"}`
      : language === "en"
        ? `of ${os.closed} closed ${noun("offer", os.closed, language)}`
        : `/ ${os.closed} lezárt ${noun("offer", os.closed, language)}`;

  return (
    <section aria-label={t("Sales", "Obchod", "Értékesítés")}>
      <StatGrid count={4}>
        <StatTile
          label={t("Revenue · closed deals", "Obrat · uzavreté obchody", "Árbevétel · lezárt ügyletek")}
          value={money(revenue.value, currencyCode, language)}
          delta={
            <>
              <BarSlot />
              <div className="mt-1.5">
                <DeltaPhrase
                  text={revenue.deltaPct === null ? null : signedPercent(revenue.deltaPct, language)}
                  tone={deltaTone(revenue.deltaPct)}
                  phrase={labels.versusPrevious}
                />
              </div>
            </>
          }
        />
        <StatTile
          label={t("Lead → client conversion", "Konverzia lead → klient", "Lead → ügyfél konverzió")}
          value={percent(lc.ratePct, language)}
          delta={
            <>
              <div className="mt-2">
                <Track pct={lc.ratePct ?? 0} fillClass="bg-primary" className="h-1.5" />
              </div>
              <div className="mt-1.5">
                <DotJoin
                  parts={[
                    ofTotal(lc.converted, lc.total, "lead", language),
                    lc.deltaPp === null ? null : (
                      <Figure tone={deltaTone(lc.deltaPp)}>{pointsDelta(lc.deltaPp, language)}</Figure>
                    ),
                  ]}
                />
              </div>
            </>
          }
        />
        <StatTile
          label={t("Price offer success rate", "Úspešnosť cenových ponúk", "Árajánlatok sikeressége")}
          value={percent(os.ratePct, language)}
          delta={
            <>
              <BarSlot>
                {os.closed > 0 ? (
                  <>
                    {os.accepted > 0 && <div className="rounded-full bg-emerald-500" style={{ flex: os.accepted }} />}
                    {rejected > 0 && <div className="rounded-full bg-rose-300" style={{ flex: rejected }} />}
                  </>
                ) : (
                  <div className="flex-1 rounded-full bg-slate-100" />
                )}
              </BarSlot>
              <div className="mt-1.5">
                <Figure tone="good">
                  {`${os.accepted} ${acceptedWord(os.accepted, language)}`}
                </Figure>{" "}
                {closedOffers}
              </div>
            </>
          }
        />
        <StatTile
          label={t("Average deal value", "Priemerná hodnota zákazky", "Átlagos megrendelésérték")}
          value={money(ad.value, currencyCode, language)}
          delta={
            <>
              <BarSlot />
              <div className="mt-1.5">
                <DotJoin
                  parts={[
                    countNoun("deal", ad.deals, language),
                    ad.deltaPct === null ? null : (
                      <DeltaPhrase
                        text={signedPercent(ad.deltaPct, language)}
                        tone={deltaTone(ad.deltaPct)}
                        phrase={labels.versusPrevious}
                      />
                    ),
                  ]}
                />
              </div>
            </>
          }
        />
      </StatGrid>
    </section>
  );
};
