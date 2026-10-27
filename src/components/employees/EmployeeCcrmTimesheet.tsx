import { useEffect, useMemo, useState } from "react";
import { Surface } from "../layout";
import { listEntries } from "../../utils/timeTrackingApi.ts";
import { formatDuration } from "../../utils/timeTracking.ts";
import type { Employee } from "../../types";

interface Props {
  employee: Employee;
  year: number;
  month: number;
  t: (en: string, sk: string, hu: string) => string;
}

/** Native time entries for one employee-month. Shown only when the source switch says CCRM. */
export function EmployeeCcrmTimesheet({ employee, year, month, t }: Props) {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [days, setDays] = useState<Array<{ date: string; seconds: number }>>([]);
  const [error, setError] = useState(false);
  const userId = employee.userId || "";
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-31`;

  useEffect(() => {
    if (!userId) {
      setSeconds(0);
      setDays([]);
      return;
    }
    let cancelled = false;
    setSeconds(null);
    setError(false);
    listEntries({ from, to, userId })
      .then(({ entries }) => {
        if (cancelled) return;
        const byDay = new Map<string, number>();
        let total = 0;
        for (const entry of entries) {
          if (entry.userId !== userId) continue;
          const sec = entry.durationSec ?? 0;
          total += sec;
          byDay.set(entry.entryDate, (byDay.get(entry.entryDate) ?? 0) + sec);
        }
        setSeconds(total);
        setDays([...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, sec]) => ({ date, seconds: sec })));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, from, to]);

  const label = useMemo(() => formatDuration(seconds ?? 0), [seconds]);

  if (!userId) {
    return (
      <Surface>
        <p className="text-body text-slate-500">
          {t(
            "This employee has no CCRM login, so there is no native time to show. Toggl stays available on the switch.",
            "Tento zamestnanec nemá prihlásenie do CCRM, preto nie je čo zobraziť z evidencie času. Toggl zostáva na prepínači.",
            "Ennek a munkatársnak nincs CCRM-belépése, ezért nincs natív idő. A Toggl a kapcsolón elérhető marad.",
          )}
        </p>
      </Surface>
    );
  }

  return (
    <Surface className="space-y-3" data-testid="ccrm-timesheet">
      <h3 className="type-card-title text-slate-900">{t("CCRM time tracking", "Evidencia času CCRM", "CCRM időkövetés")}</h3>
      {error ? (
        <p className="text-body text-rose-700">{t("Could not load time entries.", "Záznamy času sa nepodarilo načítať.", "Az időbejegyzéseket nem sikerült betölteni.")}</p>
      ) : seconds === null ? (
        <p className="text-body text-slate-500">{t("Loading…", "Načítava sa…", "Betöltés…")}</p>
      ) : (
        <>
          <p className="text-metric tabular-nums text-teal-700">{label}</p>
          {days.length === 0 ? (
            <p className="text-body text-slate-500">{t("Nothing logged this month.", "Tento mesiac nie je nič zaznamenané.", "Ebben a hónapban nincs rögzített idő.")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {days.map((day) => (
                <li key={day.date} className="flex items-center justify-between py-2 text-ui">
                  <span className="tabular-nums text-slate-700">{day.date}</span>
                  <span className="tabular-nums font-semibold text-slate-900">{formatDuration(day.seconds)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Surface>
  );
}
