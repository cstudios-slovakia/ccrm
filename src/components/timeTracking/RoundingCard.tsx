import type { TFn, TimeTrackingSettings } from "../../utils/timeTracking.ts";
import { SettingsCard } from "./SettingsCard";

type Rounding = TimeTrackingSettings["rounding"];
const STEPS: Rounding["minutes"][] = [0, 5, 15, 30];

/** Settings → Time tracking → "Rounding" (canvas S5): a segmented step and two radios for the direction. */
export function RoundingCard({ t, canEdit, rounding, onChange }: { t: TFn; canEdit: boolean; rounding: Rounding; onChange: (r: Rounding) => void }) {
  const off = rounding.minutes === 0;
  const modes: { v: Rounding["mode"]; text: string }[] = [
    { v: "nearest", text: t("Round to nearest", "Zaokrúhliť na najbližšie", "Kerekítés a legközelebbire") },
    { v: "up", text: t("Always round up", "Vždy zaokrúhliť nahor", "Mindig felfelé kerekítés") },
  ];
  return (
    <SettingsCard
      title={t("Rounding", "Zaokrúhľovanie", "Kerekítés")}
      description={t("Applied in reports and client PDFs only. Stored entries and cost are never rounded.", "Používa sa len v reportoch a PDF pre klientov. Uložené záznamy a náklady sa nikdy nezaokrúhľujú.", "Csak a riportokban és az ügyfél-PDF-ekben érvényesül. A tárolt bejegyzéseket és a költséget soha nem kerekíti.")}
      testId="tt-rounding"
    >
      <div role="group" aria-label={t("Rounding step", "Krok zaokrúhľovania", "Kerekítési lépés")} className="inline-flex gap-0.5 rounded-md bg-gray-100 p-1" data-testid="tt-rounding-minutes">
        {STEPS.map((m) => (
          <button
            key={m}
            type="button"
            disabled={!canEdit}
            aria-pressed={rounding.minutes === m}
            data-testid={`tt-rounding-${m}`}
            onClick={() => onChange({ ...rounding, minutes: m })}
            className={`h-8 rounded-lg px-3 text-ui font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${rounding.minutes === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
          >
            {m === 0 ? t("Off", "Vypnuté", "Ki") : `${m} min`}
          </button>
        ))}
      </div>
      <div className="grid gap-2" role="radiogroup" aria-label={t("Rounding direction", "Smer zaokrúhľovania", "Kerekítés iránya")} data-testid="tt-rounding-mode">
        {modes.map((o) => (
          <label key={o.v} className={`flex items-center gap-3 text-ui ${off ? "text-gray-400" : "cursor-pointer text-gray-800"}`}>
            <input type="radio" name="tt-rounding-mode" disabled={!canEdit || off} checked={rounding.mode === o.v} onChange={() => onChange({ ...rounding, mode: o.v })} className="size-4 accent-[var(--entity-accent-solid)]" data-testid={`tt-rounding-mode-${o.v}`} />
            {o.text}
          </label>
        ))}
      </div>
    </SettingsCard>
  );
}
