import { useEffect, useRef, useState, type ReactNode } from "react";
import { Switch } from "../ui/Switch";
import type { TFn, TimeTrackingSettings } from "../../utils/timeTracking.ts";
import { SettingsCard } from "./SettingsCard";

type BoolKey = "requireProjectToStop" | "requireTask" | "billableByDefault" | "weeklyApproval";
const box = "h-9 w-24 rounded-md border border-gray-200 bg-white px-3 text-center text-ui tabular-nums text-gray-900 outline-none focus:border-entity disabled:bg-gray-50 disabled:text-gray-400";

function Row({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-ui font-semibold text-gray-900">{title}</span>
        <span className="type-meta text-gray-500">{note}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </div>
  );
}

/** Settings → Time tracking → "Timer and entry rules" (canvas S4): every rule a row with a note and a switch. */
export function TimerRulesCard({
  t,
  canEdit,
  draft,
  set,
}: {
  t: TFn;
  canEdit: boolean;
  draft: TimeTrackingSettings;
  set: <K extends keyof TimeTrackingSettings>(key: K, value: TimeTrackingSettings[K]) => void;
}) {
  const sw = (key: BoolKey, title: string) => (
    <Switch checked={draft[key]} disabled={!canEdit} onChange={(next) => set(key, next)} testId={`tt-${key}`} label={title} tone="emerald" />
  );
  // The switch owns "on"; an emptied box stays editable and null is written only by turning the switch off.
  const [autoOn, setAutoOn] = useState(draft.autoStopAt !== null);
  const [lockOn, setLockOn] = useState(draft.lockAfterDays !== null);
  const lastAuto = useRef(draft.autoStopAt ?? "23:59");
  const lastLock = useRef(draft.lockAfterDays ?? 14);
  useEffect(() => {
    if (draft.autoStopAt !== null) { lastAuto.current = draft.autoStopAt; setAutoOn(true); }
    else if (!canEdit) setAutoOn(false);
    if (draft.lockAfterDays !== null) { lastLock.current = draft.lockAfterDays; setLockOn(true); }
    else if (!canEdit) setLockOn(false);
  }, [draft.autoStopAt, draft.lockAfterDays, canEdit]);
  const titles = {
    project: t("Require a project before Stop", "Vyžadovať projekt pred zastavením", "Projekt megkövetelése a leállítás előtt"),
    task: t("Require a task", "Vyžadovať úlohu", "Feladat megkövetelése"),
    billable: t("New entries are billable", "Nové záznamy sú fakturovateľné", "Az új bejegyzések számlázhatók"),
    autoStop: t("Stop running timers at", "Zastaviť bežiace časovače o", "Futó időzítők leállítása ekkor"),
    lock: t("Lock entries older than (days)", "Zamknúť záznamy staršie ako (dni)", "Ennél régebbi bejegyzések zárolása (nap)"),
    approval: t("Weekly approval", "Týždenné schvaľovanie", "Heti jóváhagyás"),
  };
  return (
    <SettingsCard title={t("Timer and entry rules", "Pravidlá časovača a záznamov", "Időzítő- és bejegyzésszabályok")} testId="tt-rules">
      <div className="divide-y divide-gray-100">
        <Row title={titles.project} note={t("For people who can pick a project, a timer cannot be stopped until one is chosen.", "Pre ľudí, ktorí môžu vybrať projekt, sa časovač nedá zastaviť, kým sa nevyberie projekt.", "Azoknál, akik projektet választhatnak, az időzítő nem állítható le, amíg nincs projekt kiválasztva.")}>
          {sw("requireProjectToStop", titles.project)}
        </Row>
        <Row title={titles.task} note={t("A timer cannot be stopped, and a manual entry cannot be saved, without a task or ticket.", "Časovač sa nedá zastaviť a ručný záznam sa nedá uložiť bez úlohy alebo tiketu.", "Feladat vagy jegy nélkül az időzítő nem állítható le, és kézi bejegyzés sem menthető.")}>
          {sw("requireTask", titles.task)}
        </Row>
        <Row title={titles.billable} note={t("The Billable switch starts on; you can still change it on each entry.", "Prepínač Fakturovateľné je predvolene zapnutý; na každom zázname ho môžete zmeniť.", "A Számlázható kapcsoló alapból be van kapcsolva; bejegyzésenként továbbra is módosítható.")}>
          {sw("billableByDefault", titles.billable)}
        </Row>
        <Row title={titles.autoStop} note={t("Timers still running at this time are stopped (company time zone).", "Časovače, ktoré o tomto čase stále bežia, sa zastavia (časové pásmo firmy).", "Az ekkor még futó időzítők leállnak (a cég időzónája szerint).")}>
          <input disabled={!canEdit || !autoOn} type="time" value={draft.autoStopAt ?? ""} onChange={(e) => set("autoStopAt", e.target.value || null)} onBlur={() => { if (draft.autoStopAt === null) set("autoStopAt", lastAuto.current); }} aria-label={titles.autoStop} className={box} data-testid="tt-autoStopAt-time" />
          <Switch checked={autoOn} disabled={!canEdit} onChange={(next) => { setAutoOn(next); set("autoStopAt", next ? lastAuto.current : null); }} testId="tt-autoStopAt" label={titles.autoStop} tone="emerald" />
        </Row>
        <Row title={titles.lock} note={t("Older entries can be changed only by an admin, and the change is logged. Paid payroll months are locked whatever this says.", "Staršie záznamy môže zmeniť len administrátor a zmena sa zapíše do auditu. Uhradené mzdové mesiace sú zamknuté bez ohľadu na toto nastavenie.", "A régebbi bejegyzéseket csak adminisztrátor módosíthatja, a módosítás az auditnaplóba kerül. A kifizetett bérhónapok ettől függetlenül zároltak.")}>
          <input disabled={!canEdit || !lockOn} type="number" min={0} value={draft.lockAfterDays ?? ""} onChange={(e) => set("lockAfterDays", e.target.value && Number.isFinite(parseFloat(e.target.value)) ? parseFloat(e.target.value) : null)} onBlur={() => { if (draft.lockAfterDays === null) set("lockAfterDays", lastLock.current); }} aria-label={titles.lock} className={box} data-testid="tt-lock-after-days" />
          <Switch checked={lockOn} disabled={!canEdit} onChange={(next) => { setLockOn(next); set("lockAfterDays", next ? lastLock.current : null); }} testId="tt-lock-after-days-on" label={titles.lock} tone="emerald" />
        </Row>
        <Row title={titles.approval} note={t("People submit each week for approval; a submitted week is locked for them.", "Ľudia odosielajú každý týždeň na schválenie; odoslaný týždeň sa im zamkne.", "A munkatársak hetente beküldik jóváhagyásra; a beküldött hét számukra zárolt.")}>
          {sw("weeklyApproval", titles.approval)}
        </Row>
      </div>
    </SettingsCard>
  );
}
