import { useEffect, useState, type ReactNode } from "react";
import { explainRateCard, type RateCard } from "../../utils/timeCost.ts";
import { getRateCard } from "../../utils/timeTrackingApi.ts";

interface Props {
  employeeId: string | null | undefined;
  /** YYYY-MM of the entry date. */
  month: string;
  monthLabel: string;
  country: string;
  t: (en: string, sk: string, hu: string) => string;
  money: (n: number) => string;
  /** Shown while the rate card loads, and when the person is not paid monthly. */
  fallback: ReactNode;
}

/** The monthly rate in words, read from the rate card (docs/TIME-TRACKING-V2.md D4.3); `fallback` otherwise. */
export function RateExplanation({ employeeId, month, monthLabel, country, t, money, fallback }: Props) {
  const [card, setCard] = useState<RateCard | null>(null);
  useEffect(() => {
    let live = true;
    setCard(null);
    if (employeeId) {
      getRateCard(employeeId, month)
        .then((c) => live && setCard(c))
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [employeeId, month]);

  const text = card ? explainRateCard({ ...card, country: card.country ?? country }, { t, money, monthLabel, country, provisional: card.frozen === false }) : null;
  return (
    <div className="mt-1 type-meta text-gray-500" data-testid="entry-rate-basis">
      {text ?? fallback}
    </div>
  );
}
