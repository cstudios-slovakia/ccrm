import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Surface } from "../layout";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import {
  HOLIDAY_COUNTRIES,
  holidayName,
  isoDate,
  overridesFor,
  type HolidayCountry,
  type HolidayOverride,
} from "../../utils/holidays.ts";
import { computeCostRate } from "../../utils/timeCost.ts";
import { DEFAULT_TIME_TRACKING_SETTINGS, type TimeTrackingSettings } from "../../utils/timeTracking.ts";
import { TimeApiError, repriceEntries, saveSettings, timeErrorMessage } from "../../utils/timeTrackingApi.ts";
import { formatMoney } from "../../utils/currency";
import type { Language } from "../../utils/translations";

const OFFICIAL_SOURCE: Record<HolidayCountry, { label: string; href: string }> = {
  SK: { label: "slov-lex.sk", href: "https://www.slov-lex.sk/" },
  HU: { label: "njt.hu (NGM decree on the working-time arrangement)", href: "https://njt.hu/" },
};

const num = (v: string, fallback: number) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback);

/** Settings → Time tracking: cost basis, working days and holidays, rules, extension, re-pricing. */
export function TimeTrackingSettingsPanel({ language, canEdit, isAdmin, currency }: { language: Language; canEdit: boolean; isAdmin: boolean; currency: string }) {
  const tt = useTimeTracking();
  const { t, settings, ready, enabled } = tt;
  const [draft, setDraft] = useState<TimeTrackingSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [country, setCountry] = useState<HolidayCountry>(tt.defaultCountry);
  const [year, setYear] = useState(new Date().getFullYear());
  const [ovDate, setOvDate] = useState("");
  const [ovKind, setOvKind] = useState<HolidayOverride["kind"]>("extraDayOff");
  const [ovName, setOvName] = useState("");
  const [repriceMonth, setRepriceMonth] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => setCountry(tt.defaultCountry), [tt.defaultCountry]);
  useEffect(() => {
    if (enabled) tt.ensureHolidayYears(country, [year]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, year, enabled]);

  const locale = language === "sk" ? "sk-SK" : language === "hu" ? "hu-HU" : "en-US";
  const money = (n: number) => formatMoney(n, currency, language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const set = <K extends keyof TimeTrackingSettings>(key: K, value: TimeTrackingSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));

  // The calendar as it would be with the unsaved overrides, for the live example and the list.
  const calendar = useMemo(
    () => tt.calendarFor(country, overridesFor(draft.holidayOverrides, country)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tt.calendarFor, country, draft.holidayOverrides],
  );
  const overrides = draft.holidayOverrides[country]?.[String(year)] ?? [];
  const exampleMonth = new Date().getMonth() + 1;
  const exampleDays = calendar.workingDaysInMonth(new Date().getFullYear(), exampleMonth);
  const example = computeCostRate({ kind: "employee", salaryType: "monthly", salaryAmount: 3200 }, exampleDays, draft);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveSettings(draft);
      tt.setSettingsLocal({ ...DEFAULT_TIME_TRACKING_SETTINGS, ...saved });
      tt.bump();
      window.showToast?.(t("Time tracking settings saved.", "Nastavenia evidencie času boli uložené.", "Az időkövetés beállításai mentve."));
    } catch (e) {
      window.showToast?.(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
    } finally {
      setSaving(false);
    }
  };

  const addOverride = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ovDate) || Number(ovDate.slice(0, 4)) !== year) {
      window.showToast?.(t(`Pick a date in ${year}.`, `Vyberte dátum v roku ${year}.`, `Válasszon dátumot ${year}-ból.`), "warning");
      return;
    }
    const next = [...overrides.filter((o) => o.date !== ovDate), { date: ovDate, kind: ovKind, name: ovName.trim() }].sort((a, b) => a.date.localeCompare(b.date));
    set("holidayOverrides", { ...draft.holidayOverrides, [country]: { ...(draft.holidayOverrides[country] ?? {}), [String(year)]: next } });
    setOvDate("");
    setOvName("");
  };

  const removeOverride = (date: string) =>
    set("holidayOverrides", { ...draft.holidayOverrides, [country]: { ...(draft.holidayOverrides[country] ?? {}), [String(year)]: overrides.filter((o) => o.date !== date) } });

  const reprice = async () => {
    try {
      const res = await repriceEntries(`${repriceMonth}-01`, `${repriceMonth}-31`);
      tt.bump();
      window.showToast?.(t(`Re-priced ${res.repriced} entries.`, `Prepočítané záznamy: ${res.repriced}.`, `Újraárazott bejegyzések: ${res.repriced}.`));
    } catch (e) {
      window.showToast?.(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
    }
  };

  if (!ready) {
    return <Surface><p className="text-body text-slate-500">{enabled ? t("Loading…", "Načítava sa…", "Betöltés…") : t("You need access to the Time tracking module to change its settings.", "Na zmenu nastavení potrebujete prístup k modulu Evidencia času.", "A beállítások módosításához hozzáférés kell az Időkövetés modulhoz.")}</p></Surface>;
  }

  const field = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-ui outline-none focus:border-primary disabled:bg-slate-50";
  const label = "type-label text-slate-600";
  const toggle = (key: "requireProjectToStop" | "requireTask" | "billableByDefault" | "weeklyApproval", text: string) => (
    <label className="flex cursor-pointer items-center gap-3 text-ui text-slate-800">
      <input type="checkbox" disabled={!canEdit} checked={draft[key]} onChange={(e) => set(key, e.target.checked)} className="size-4 accent-teal-600" data-testid={`tt-${key}`} />
      {text}
    </label>
  );

  return (
    <div className="space-y-6" data-testid="tt-settings">
      {/* Cost */}
      <Surface className="space-y-4">
        <h3 className="type-card-title text-slate-900">{t("Hourly cost of a worker", "Hodinový náklad pracovníka", "A munkatárs óraköltsége")}</h3>
        <p className="text-body text-slate-500">{t("Every entry is priced when it is saved from the employee's salary. A monthly salary is divided by that month's real working days in the person's country.", "Každý záznam sa pri uložení ocení podľa mzdy zamestnanca. Mesačná mzda sa delí skutočným počtom pracovných dní mesiaca v krajine danej osoby.", "Minden bejegyzést mentéskor a munkatárs fizetéséből áraz a rendszer. A havi fizetést az adott ország hónapjának valós munkanapjaival osztja.")}</p>
        <div className="grid gap-4 ws-sm:grid-cols-2">
          <label className="grid gap-1">
            <span className={label}>{t("Monthly hours basis", "Základ mesačných hodín", "Havi óraalap")}</span>
            <select disabled={!canEdit} value={draft.hoursBasis} onChange={(e) => set("hoursBasis", e.target.value as TimeTrackingSettings["hoursBasis"])} className={field} data-testid="tt-hours-basis">
              <option value="workingDays">{t("Working days × hours per day", "Pracovné dni × hodiny za deň", "Munkanapok × napi órák")}</option>
              <option value="fixed">{t("Fixed hours per month", "Pevný počet hodín za mesiac", "Fix havi óraszám")}</option>
            </select>
          </label>
          {draft.hoursBasis === "fixed" ? (
            <label className="grid gap-1">
              <span className={label}>{t("Hours per month", "Hodiny za mesiac", "Órák havonta")}</span>
              <input disabled={!canEdit} type="number" min={1} value={draft.fixedHoursPerMonth} onChange={(e) => set("fixedHoursPerMonth", num(e.target.value, 168))} className={field} />
            </label>
          ) : (
            <label className="grid gap-1">
              <span className={label}>{t("Hours per day", "Hodiny za deň", "Napi órák")}</span>
              <input disabled={!canEdit} type="number" min={1} max={24} step={0.5} value={draft.hoursPerDay} onChange={(e) => set("hoursPerDay", num(e.target.value, 8))} className={field} data-testid="tt-hours-per-day" />
            </label>
          )}
          <label className="grid gap-1">
            <span className={label}>{t("Employer contributions multiplier", "Násobok odvodov zamestnávateľa", "Munkáltatói járulék szorzó")}</span>
            <input disabled={!canEdit} type="number" min={0.5} max={5} step={0.001} value={draft.employerMultiplier} onChange={(e) => set("employerMultiplier", num(e.target.value, 1.352))} className={field} data-testid="tt-multiplier" />
            <span className="type-meta text-slate-500">{t("Applies to employees, not to contractors.", "Platí pre zamestnancov, nie pre dodávateľov.", "Munkavállalókra vonatkozik, vállalkozókra nem.")}</span>
          </label>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4 text-ui text-slate-700" data-testid="tt-example">
          {t("Example", "Príklad", "Példa")}: {money(3200)} / {t("month", "mesiac", "hó")}, {new Date(new Date().getFullYear(), exampleMonth - 1, 1).toLocaleDateString(locale, { month: "long" })} ({country}) →{" "}
          <b className="tabular-nums">{exampleDays} {t("working days", "pracovných dní", "munkanap")}</b> →{" "}
          <b className="tabular-nums text-violet-700">{example.rate !== null ? `${money(example.rate)}/h` : "—"}</b>
        </div>
      </Surface>

      {/* Holidays */}
      <Surface className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="type-card-title text-slate-900">{t("Working days and public holidays", "Pracovné dni a štátne sviatky", "Munkanapok és állami ünnepek")}</h3>
          <div className="flex items-center gap-2">
            <select value={country} onChange={(e) => setCountry(e.target.value as HolidayCountry)} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-ui font-semibold" data-testid="tt-holiday-country">
              {HOLIDAY_COUNTRIES.map((c) => (
                <option key={c} value={c}>{c === "SK" ? t("Slovakia", "Slovensko", "Szlovákia") : t("Hungary", "Maďarsko", "Magyarország")}</option>
              ))}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-ui font-semibold">
              {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-body text-slate-500">
          {t(
            "Holidays come from the public Nager.Date service, fetched by the server and cached. Which days count is decided by the person's work calendar (set per employee, otherwise the company's country), never by the language of the app.",
            "Sviatky pochádzajú z verejnej služby Nager.Date, ktorú načítava server a ukladá ich do cache. Ktoré dni sa rátajú, určuje pracovný kalendár osoby (nastavuje sa pri zamestnancovi, inak krajina firmy), nikdy jazyk aplikácie.",
            "Az ünnepnapok a nyilvános Nager.Date szolgáltatásból származnak, a szerver tölti le és gyorsítótárazza őket. Hogy mely napok számítanak, a személy munkanaptára dönti el (munkatársanként állítható, egyébként a cég országa), soha nem az alkalmazás nyelve.",
          )}
        </p>
        {tt.holidaysFallback && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-ui font-semibold text-amber-900" data-testid="tt-holidays-fallback">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {t("Holidays: built-in list, the API could not be reached.", "Sviatky: vstavaný zoznam, API sa nepodarilo kontaktovať.", "Ünnepnapok: beépített lista, az API nem érhető el.")}
          </div>
        )}
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200" data-testid="tt-holiday-list">
          {Array.from({ length: 366 }, (_, i) => {
            const d = new Date(Date.UTC(year, 0, 1 + i));
            return d.getUTCFullYear() === year ? isoDate(year, d.getUTCMonth() + 1, d.getUTCDate()) : null;
          })
            .filter((iso): iso is string => !!iso && !!calendar.holiday(iso))
            .map((iso) => (
              <li key={iso} className="flex items-center justify-between gap-3 px-3 py-2 text-ui">
                <span className="font-semibold tabular-nums text-slate-700">{new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "numeric" })}</span>
                <span className="min-w-0 flex-1 truncate text-slate-800">{holidayName(calendar.holiday(iso)!, country, language)}</span>
              </li>
            ))}
        </ul>

        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="type-overline text-slate-500">{t("Overrides", "Výnimky", "Eltérések")} · {country} {year}</div>
          <p className="mt-1 type-meta text-slate-500">
            {country === "HU"
              ? t(
                  "Hungary moves rest days and adds working Saturdays every year by decree (áthelyezett pihenőnap, ledolgozós szombat). No free machine-readable source exists, so enter them here from the official decree.",
                  "Maďarsko každý rok dekrétom presúva dni voľna a pridáva pracovné soboty (áthelyezett pihenőnap, ledolgozós szombat). Neexistuje bezplatný strojovo čitateľný zdroj, preto ich zadajte tu podľa oficiálneho dekrétu.",
                  "Magyarország évente rendelettel áthelyezi a pihenőnapokat és ledolgozós szombatokat jelöl ki. Nincs ingyenes, gépileg olvasható forrás, ezért itt adja meg őket a hivatalos rendelet alapján.",
                )
              : t("Add an extra day off or an extra working day (for example a company holiday).", "Pridajte ďalší voľný deň alebo ďalší pracovný deň (napríklad firemné voľno).", "Adjon hozzá extra szabadnapot vagy extra munkanapot (például céges szabadnapot).")}{" "}
            <a href={OFFICIAL_SOURCE[country].href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              {OFFICIAL_SOURCE[country].label} <ExternalLink className="size-3" />
            </a>
          </p>
          <ul className="mt-3 grid gap-1.5" data-testid="tt-overrides">
            {overrides.map((o) => (
              <li key={o.date} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-ui">
                <span className="tabular-nums font-semibold">{o.date}</span>
                <span className={`rounded-full px-2 py-0.5 text-micro font-semibold ${o.kind === "extraDayOff" ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-800"}`}>
                  {o.kind === "extraDayOff" ? t("Extra day off", "Extra voľný deň", "Extra szabadnap") : t("Extra working day", "Extra pracovný deň", "Extra munkanap")}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-600">{o.name}</span>
                {canEdit && (
                  <button type="button" onClick={() => removeOverride(o.date)} aria-label={t("Remove", "Odstrániť", "Eltávolítás")} className="text-slate-400 hover:text-rose-600 cursor-pointer">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <input type="date" value={ovDate} onChange={(e) => setOvDate(e.target.value)} min={`${year}-01-01`} max={`${year}-12-31`} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-ui" data-testid="tt-override-date" />
              <select value={ovKind} onChange={(e) => setOvKind(e.target.value as HolidayOverride["kind"])} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-ui" data-testid="tt-override-kind">
                <option value="extraDayOff">{t("Extra day off", "Extra voľný deň", "Extra szabadnap")}</option>
                <option value="extraWorkingDay">{t("Extra working day", "Extra pracovný deň", "Extra munkanap")}</option>
              </select>
              <input value={ovName} onChange={(e) => setOvName(e.target.value)} placeholder={t("Name", "Názov", "Név")} className="h-9 min-w-40 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-ui" data-testid="tt-override-name" />
              <button type="button" onClick={addOverride} data-testid="tt-override-add" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-ui font-semibold text-white cursor-pointer">
                <Plus className="size-4" />
                {t("Add", "Pridať", "Hozzáad")}
              </button>
            </div>
          )}
        </div>
      </Surface>

      {/* Rules */}
      <Surface className="space-y-4">
        <h3 className="type-card-title text-slate-900">{t("Rules", "Pravidlá", "Szabályok")}</h3>
        <div className="grid gap-3">
          {toggle("requireProjectToStop", t("Require a project before stopping the timer", "Vyžadovať projekt pred zastavením časovača", "Projekt megkövetelése az időzítő leállítása előtt"))}
          {toggle("requireTask", t("Require a task on every entry", "Vyžadovať úlohu pri každom zázname", "Feladat megkövetelése minden bejegyzésnél"))}
          {toggle("billableByDefault", t("New entries are billable by default", "Nové záznamy sú predvolene fakturovateľné", "Az új bejegyzések alapból számlázhatók"))}
          {toggle("weeklyApproval", t("Weekly approval of timesheets", "Týždenné schvaľovanie výkazov", "Heti munkalap-jóváhagyás"))}
        </div>
        <div className="grid gap-4 ws-sm:grid-cols-2">
          <label className="grid gap-1">
            <span className={label}>{t("Stop running timers at", "Zastaviť bežiace časovače o", "Futó időzítők leállítása ekkor")}</span>
            <input disabled={!canEdit} type="time" value={draft.autoStopAt ?? ""} onChange={(e) => set("autoStopAt", e.target.value || null)} className={field} />
          </label>
          <label className="grid gap-1">
            <span className={label}>{t("Warn about entries longer than (hours)", "Upozorniť na záznamy dlhšie ako (hodiny)", "Figyelmeztetés ennél hosszabb bejegyzésre (óra)")}</span>
            <input disabled={!canEdit} type="number" min={1} value={draft.longEntryWarnHours ?? ""} onChange={(e) => set("longEntryWarnHours", e.target.value ? num(e.target.value, 10) : null)} className={field} />
          </label>
          <label className="grid gap-1">
            <span className={label}>{t("Idle reminder after (minutes)", "Pripomenutie nečinnosti po (minútach)", "Tétlenségi emlékeztető ennyi perc után")}</span>
            <input disabled={!canEdit} type="number" min={1} value={draft.idleReminderMinutes ?? ""} onChange={(e) => set("idleReminderMinutes", e.target.value ? num(e.target.value, 15) : null)} className={field} />
          </label>
          <label className="grid gap-1">
            <span className={label}>{t("Lock entries older than (days)", "Zamknúť záznamy staršie ako (dni)", "Ennél régebbi bejegyzések zárolása (nap)")}</span>
            <input disabled={!canEdit} type="number" min={0} value={draft.lockAfterDays ?? ""} onChange={(e) => set("lockAfterDays", e.target.value ? num(e.target.value, 14) : null)} className={field} />
          </label>
          <label className="grid gap-1">
            <span className={label}>{t("Rounding in reports and client PDFs", "Zaokrúhľovanie v reportoch a PDF pre klientov", "Kerekítés riportokban és ügyfél-PDF-ekben")}</span>
            <div className="flex gap-2">
              <select disabled={!canEdit} value={draft.rounding.minutes} onChange={(e) => set("rounding", { ...draft.rounding, minutes: Number(e.target.value) as 0 | 5 | 15 | 30 })} className={field}>
                <option value={0}>{t("No rounding", "Bez zaokrúhľovania", "Nincs kerekítés")}</option>
                <option value={5}>5 min</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
              </select>
              <select disabled={!canEdit || draft.rounding.minutes === 0} value={draft.rounding.mode} onChange={(e) => set("rounding", { ...draft.rounding, mode: e.target.value as "nearest" | "up" })} className={field}>
                <option value="nearest">{t("Nearest", "Na najbližšie", "Legközelebbi")}</option>
                <option value="up">{t("Up", "Nahor", "Felfelé")}</option>
              </select>
            </div>
          </label>
        </div>
      </Surface>

      {/* External tracker */}
      <Surface className="space-y-2">
        <h3 className="type-card-title text-slate-900">{t("External time tracker", "Externý nástroj na evidenciu času", "Külső időkövető")}</h3>
        <p className="text-body text-slate-500">{t("Toggl connections stay where they are: Employees → Settings. Their hours keep showing in each employee's summary; an importer into this module arrives later.", "Pripojenia na Toggl zostávajú tam, kde sú: Zamestnanci → Nastavenia. Ich hodiny sa naďalej zobrazujú v súhrne zamestnanca; import do tohto modulu pribudne neskôr.", "A Toggl-kapcsolatok ott maradnak, ahol vannak: Munkatársak → Beállítások. Óráik továbbra is a munkatárs összesítőjében jelennek meg; az ebbe a modulba történő importáló később érkezik.")}</p>
      </Surface>

      {isAdmin && (
        <Surface className="space-y-3">
          <h3 className="type-card-title text-slate-900">{t("Re-price a period", "Prepočítať obdobie", "Időszak újraárazása")}</h3>
          <p className="text-body text-slate-500">{t("Rates are frozen when an entry is saved. Re-pricing recomputes every entry of a month with the current salaries and calendar, and fills in entries that had no rate once an employee is linked.", "Sadzby sa pri uložení záznamu zafixujú. Prepočet znovu vypočíta všetky záznamy mesiaca podľa aktuálnych miezd a kalendára a doplní záznamy bez sadzby po pripojení zamestnanca.", "A díjak a bejegyzés mentésekor rögzülnek. Az újraárazás a hónap minden bejegyzését a jelenlegi fizetésekkel és naptárral számolja újra, és kitölti a díj nélküli bejegyzéseket, ha már van hozzárendelt munkatárs.")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <input type="month" value={repriceMonth} onChange={(e) => setRepriceMonth(e.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-ui" data-testid="tt-reprice-month" />
            <HoldToConfirmButton onConfirm={() => void reprice()} tone="archive" lang={language} what={repriceMonth} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-ui font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer" icon={<span className="size-4" />}>
              {t("Hold to re-price", "Podržte pre prepočet", "Tartsa az újraárazáshoz")}
            </HoldToConfirmButton>
          </div>
        </Surface>
      )}

      {canEdit && (
        <div className="sticky bottom-4 flex justify-end">
          <button type="button" onClick={save} disabled={!dirty || saving} data-testid="tt-save" className="h-10 rounded-xl bg-primary px-5 text-ui font-semibold text-white shadow-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer">
            {t("Save settings", "Uložiť nastavenia", "Beállítások mentése")}
          </button>
        </div>
      )}
    </div>
  );
}
