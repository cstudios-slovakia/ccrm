import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Surface } from "../layout";
import { CustomSelect } from "../ui/CustomSelect";
import { getCronStatus } from "../../utils/timeTrackingApi.ts";
import type { PresenceSettings, TFn, TimeTrackingCronStatus } from "../../utils/timeTracking.ts";

const clamp = (v: string, min: number, max: number, fallback: number) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Settings → Time tracking → Presence check (TT2 D7.1). Saved with the panel's Save. */
export function PresenceBlock({ t, canEdit, isAdmin, presence, onChange }: { t: TFn; canEdit: boolean; isAdmin: boolean; presence: PresenceSettings; onChange: (p: PresenceSettings) => void }) {
  const [cron, setCron] = useState<TimeTrackingCronStatus | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    getCronStatus().then(setCron).catch(() => setCron(null));
  }, [isAdmin]);

  const field = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-ui outline-none focus:border-primary disabled:bg-slate-50";
  const label = "type-label text-slate-600";
  const num = (key: "promptAfterMinutes" | "confirmWindowMinutes" | "resumeWindowMinutes", text: string, min: number, max: number) => (
    <label className="grid gap-1">
      <span className={label}>{text}</span>
      <input disabled={!canEdit || !presence.enabled} type="number" min={min} max={max} value={presence[key]} onChange={(e) => onChange({ ...presence, [key]: clamp(e.target.value, min, max, presence[key]) })} className={field} data-testid={`tt-presence-${key}`} />
    </label>
  );

  return (
    <Surface className="space-y-4" data-testid="tt-presence-block">
      <h3 className="type-card-title text-slate-900">{t("Presence check", "Kontrola prítomnosti", "Jelenlét-ellenőrzés")}</h3>
      <p className="text-body text-slate-500">{t(
        "While a timer runs, the person is asked whether they are still working. No answer within the answer window pauses the timer; a late answer inside the resume window continues it. The person answers only in the app, never from a push notification.",
        "Kým beží časovač, človek sa opýta, či ešte pracuje. Bez odpovede v čase na odpoveď sa časovač pozastaví; neskorá odpoveď v čase na obnovenie ho znova rozbehne. Odpovedá sa len v aplikácii, nikdy z push upozornenia.",
        "Futó időzítő mellett a rendszer megkérdezi, hogy a munkatárs még dolgozik-e. Ha a válaszidőn belül nem érkezik válasz, az időzítő szünetel; a folytatási időn belüli késői válasz újraindítja. A válasz csak az alkalmazásban adható meg, push értesítésből soha.",
      )}</p>
      <label className="flex cursor-pointer items-center gap-3 text-ui text-slate-800">
        <input type="checkbox" disabled={!canEdit} checked={presence.enabled} onChange={(e) => onChange({ ...presence, enabled: e.target.checked })} className="size-4 accent-teal-600" data-testid="tt-presence-enabled" />
        {t("Ask whether the person is still working", "Pýtať sa, či človek ešte pracuje", "Rákérdezés, hogy a munkatárs még dolgozik-e")}
      </label>
      <div className="grid gap-4 ws-sm:grid-cols-3">
        {num("promptAfterMinutes", t("Ask after (minutes, 10–240)", "Opýtať sa po (minútach, 10–240)", "Rákérdezés ennyi perc után (10–240)"), 10, 240)}
        {num("confirmWindowMinutes", t("Answer window (minutes, 2–60)", "Čas na odpoveď (minúty, 2–60)", "Válaszidő (perc, 2–60)"), 2, 60)}
        {num("resumeWindowMinutes", t("Resume window (minutes, 0–120)", "Čas na obnovenie (minúty, 0–120)", "Folytatási idő (perc, 0–120)"), 0, 120)}
      </div>
      <label className="grid gap-1">
        <span className={label}>{t("When nobody answers, keep time until", "Keď nikto neodpovie, započítať čas do", "Ha senki nem válaszol, az időt eddig számoljuk")}</span>
        <CustomSelect
          disabled={!canEdit || !presence.enabled}
          value={presence.trimTo}
          onChange={(v) => onChange({ ...presence, trimTo: v === "deadline" ? "deadline" : "prompt" })}
          options={[
            { value: "prompt", label: t("The question (default)", "Otázky (predvolené)", "A kérdésig (alapértelmezett)") },
            { value: "deadline", label: t("The pause deadline", "Termínu pozastavenia", "A szüneteltetési határidőig") },
          ]}
        />
      </label>
      {isAdmin && cron?.stale && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-ui text-amber-800" role="alert" data-testid="tt-presence-cron-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{t(
            "The server's scheduled task has not run for 5 minutes: timers still pause correctly, but no push notification is sent. Set up cron (see README).",
            "Plánovaná úloha servera nebežala 5 minút: časovače sa stále správne pozastavia, ale neodošle sa žiadne push upozornenie. Nastavte cron (pozri README).",
            "A szerver időzített feladata 5 perce nem futott: az időzítők továbbra is helyesen szünetelnek, de push értesítés nem megy ki. Állítsa be a cront (lásd README).",
          )}</span>
        </div>
      )}
    </Surface>
  );
}
