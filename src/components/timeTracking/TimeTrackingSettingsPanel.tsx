import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Surface } from "../layout";
import type { Employee, Lead, Project, RolePermission } from "../../types";
import { HoursBasisCards } from "./HoursBasisCards";
import { RoundingCard } from "./RoundingCard";
import { SettingsCard } from "./SettingsCard";
import { TimerRulesCard } from "./TimerRulesCard";
import { WhoSeesWhatCard } from "./WhoSeesWhatCard";
import { RateCardPreview } from "./RateCardPreview";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import { CustomSelect } from "../ui/CustomSelect";
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
import type { OverlapMonth } from "../../utils/timeTrackingApi.ts";
import { TimeApiError, getOverlaps, repriceEntries, saveSettings, timeErrorMessage } from "../../utils/timeTrackingApi.ts";
import { ExtensionSettings } from "./ExtensionSettings";
import { ParallelTrackingBlock, StartWhileRunningBlock } from "./ParallelSettings";
import { PresenceSoundBlock } from "./PresenceSoundBlock";
import { TogglImportPanel } from "./TogglImportPanel";
import { PresenceBlock } from "./PresenceSettings";
import { formatMoney } from "../../utils/currency";
import type { Language } from "../../utils/translations";
import { PRODUCT_NAME } from "../../utils/brand";

const OFFICIAL_SOURCE: Record<HolidayCountry, { label: string; href: string }> = {
  SK: { label: "slov-lex.sk", href: "https://www.slov-lex.sk/" },
  HU: { label: "njt.hu (NGM decree on the working-time arrangement)", href: "https://njt.hu/" },
};

const num = (v: string, fallback: number) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback);

/** Settings → Time tracking: cost basis, working days and holidays, rules, extension, re-pricing. */
export function TimeTrackingSettingsPanel({ language, canEdit, isAdmin, currency, projects, employees, leads, roles, canManageRoles = false }: { language: Language; canEdit: boolean; isAdmin: boolean; currency: string; projects?: Project[]; employees?: Employee[]; leads?: Lead[]; roles?: RolePermission[]; canManageRoles?: boolean }) {
  const brand = PRODUCT_NAME;
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

  const [overlaps, setOverlaps] = useState<OverlapMonth[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    const now = new Date();
    const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    getOverlaps(ym(new Date(now.getFullYear(), now.getMonth() - 5, 1)), ym(now)).then(setOverlaps).catch(() => setOverlaps([]));
  }, [isAdmin]);

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
    return <Surface><p className="text-body text-gray-500">{enabled ? t("Loading…", "Načítava sa…", "Betöltés…") : t("You need access to the Time tracking module to change its settings.", "Na zmenu nastavení potrebujete prístup k modulu Evidencia času.", "A beállítások módosításához hozzáférés kell az Időkövetés modulhoz.")}</p></Surface>;
  }

  const field = "h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-ui outline-none focus:border-entity disabled:bg-gray-50";
  const label = "type-label text-gray-600";

  return (
    <div className="space-y-6" data-testid="tt-settings">
      {/* Cost */}
      <SettingsCard
        title={t("Cost rate from salary", "Nákladová sadzba z mzdy", "Költségdíj a fizetésből")}
        description={t("Every entry is priced from the employee's salary when it is saved, and the rate stays provisional until the month's payroll is closed or the month after next begins; then it is frozen. A monthly salary is divided by that month's real working days in the person's country.", "Každý záznam sa pri uložení ocení podľa mzdy zamestnanca a sadzba ostáva predbežná, kým sa neuzavrie výplata mesiaca alebo nezačne nasledujúci mesiac po ňom; potom sa zafixuje. Mesačná mzda sa delí skutočným počtom pracovných dní mesiaca v krajine danej osoby.", "Minden bejegyzést mentéskor a munkatárs fizetéséből áraz a rendszer, és a díj ideiglenes marad, amíg a hónap bérszámfejtése le nem zárul vagy el nem kezdődik a rá következő második hónap; utána rögzül. A havi fizetést az adott ország hónapjának valós munkanapjaival osztja.")}
      >
        <div className="grid gap-1.5">
          <span className={label}>{t("Hours basis for monthly salaries", "Základ hodín pre mesačné mzdy", "Havi fizetések óraalapja")}</span>
          <HoursBasisCards t={t} canEdit={canEdit} draft={draft} set={set} workingDaysOf={(m) => calendar.workingDaysInMonth(new Date().getFullYear(), m)} locale={locale} />
        </div>
        <div className="grid gap-4 ws-sm:grid-cols-2">
          <label className="grid content-start gap-1">
            <span className={label}>{t("Hours per working day", "Hodiny za pracovný deň", "Napi órák munkanaponként")}</span>
            <input disabled={!canEdit} type="number" min={1} max={24} step={0.5} value={draft.hoursPerDay} onChange={(e) => set("hoursPerDay", num(e.target.value, 8))} className={field} data-testid="tt-hours-per-day" />
            <span className="type-meta text-gray-500">{t("Also divides daily salaries.", "Delí aj denné mzdy.", "A napi fizetéseket is ezzel osztja.")}</span>
          </label>
          <label className="grid content-start gap-1">
            <span className={label}>{t("Employer contributions multiplier", "Násobok odvodov zamestnávateľa", "Munkáltatói járulék szorzó")}</span>
            <input disabled={!canEdit} type="number" min={0.5} max={5} step={0.001} value={draft.employerMultiplier} onChange={(e) => set("employerMultiplier", num(e.target.value, 1.352))} className={field} data-testid="tt-multiplier" />
            <span className="type-meta text-gray-500">{t("1.000 = gross salary only. Applies to employees, not to contractors.", "1,000 = len hrubá mzda. Platí pre zamestnancov, nie pre dodávateľov.", "1,000 = csak a bruttó fizetés. Munkavállalókra vonatkozik, vállalkozókra nem.")}</span>
          </label>
        </div>
        <ul className="grid list-disc gap-1 pl-5 type-meta text-gray-500" data-testid="tt-leave-notes">
          <li>{t("Paid leave raises that month's hourly rate: the same salary is spread over fewer hours. Unpaid leave lowers salary and hours together, so the rate stays the same.", "Platená dovolenka zvyšuje hodinovú sadzbu daného mesiaca: rovnaká mzda sa delí menším počtom hodín. Neplatené voľno znižuje mzdu aj hodiny spolu, sadzba ostáva rovnaká.", "A fizetett szabadság emeli az adott hónap óradíját: ugyanaz a fizetés kevesebb órára oszlik. A fizetés nélküli szabadság a fizetést és az órákat együtt csökkenti, így a díj nem változik.")}</li>
          <li>{t("Sick leave follows the leave type's paid flag. Part-time people use their own hours per day (employee form).", "Práceneschopnosť sa riadi príznakom platenosti typu voľna. Zamestnanci na čiastočný úväzok používajú vlastné hodiny za deň (formulár zamestnanca).", "A betegszabadság a szabadságtípus fizetett jelölését követi. A részmunkaidősök a saját napi óraszámukat használják (munkatársi űrlap).")}</li>
          <li>{t("A month's rate stays provisional until its payroll is closed or the month after next begins; then it is frozen.", "Sadzba mesiaca ostáva predbežná, kým sa neuzavrie jeho výplata alebo nezačne nasledujúci mesiac po ňom; potom sa zafixuje.", "A hónap díja ideiglenes marad, amíg a bérszámfejtése le nem zárul vagy el nem kezdődik a rá következő második hónap; utána rögzül.")}</li>
        </ul>
        <div className="rounded-lg bg-gray-50 p-4 text-ui text-gray-700" data-testid="tt-example">
          {t("Example", "Príklad", "Példa")}: {money(3200)} / {t("month", "mesiac", "hó")}, {new Date(new Date().getFullYear(), exampleMonth - 1, 1).toLocaleDateString(locale, { month: "long" })} ({country}) →{" "}
          <b className="tabular-nums">{exampleDays} {t("working days", "pracovných dní", "munkanap")}</b> →{" "}
          <b className="tabular-nums text-gray-900">{example.rate !== null ? `${money(example.rate)}/h` : "—"}</b>
        </div>
        <RateCardPreview t={t} employees={employees} draft={draft} tt={tt} money={money} locale={locale} />
        {isAdmin && (
          <div className="grid gap-2 border-t border-gray-100 pt-4" data-testid="tt-reprice">
            <div className="flex flex-wrap items-center gap-3">
              <input type="month" value={repriceMonth} onChange={(e) => setRepriceMonth(e.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-2 text-ui" data-testid="tt-reprice-month" />
              <HoldToConfirmButton disabled={dirty} onConfirm={() => void reprice()} tone="archive" lang={language} what={repriceMonth} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 px-3 text-ui font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer" icon={<RotateCcw className="size-4" />}>
                {t("Hold to re-price a period…", "Podržte pre prepočet obdobia…", "Tartsa az időszak újraárazásához…")}
              </HoldToConfirmButton>
              {dirty && <span className="type-meta font-semibold text-gray-700" data-testid="tt-reprice-save-first">{t("Save your changes first", "Najprv uložte zmeny", "Előbb mentse a módosításokat")}</span>}
              <span className="min-w-0 flex-1 type-meta text-gray-500">{t("Recomputes frozen rates of entries in a month after a salary correction. Logged in the audit log.", "Prepočíta zafixované sadzby záznamov v mesiaci po oprave mzdy. Zapíše sa do auditu.", "Fizetéskorrekció után újraszámolja a hónap bejegyzéseinek rögzített díjait. Az auditnaplóba kerül.")}</span>
            </div>
            <p className="type-meta text-gray-500">{t("It uses the current salaries and calendar, fills in entries that had no rate once an employee is linked, and re-allocates worked time between overlapping entries.", "Použije aktuálne mzdy a kalendár, doplní záznamy bez sadzby po pripojení zamestnanca a znovu rozdelí odpracovaný čas medzi prekrývajúcimi sa záznamami.", "A jelenlegi fizetéseket és naptárat használja, kitölti a díj nélküli bejegyzéseket, ha már van hozzárendelt munkatárs, és újraosztja a ledolgozott időt az egymást átfedő bejegyzések között.")}</p>
            {overlaps.filter((o) => o.entries > 0).map((o) => {
              const [y, m] = o.month.split("-").map(Number);
              const mLabel = new Date(y, m - 1, 1).toLocaleDateString(language, { month: "short", year: "numeric" });
              return (
                <p key={o.month} className="type-meta text-gray-500" data-testid="tt-overlap-month">
                  {t(`${mLabel}: ${o.entries} entries overlap (${o.users} people)`, `${mLabel}: ${o.entries} záznamov sa prekrýva (${o.users} ľudí)`, `${mLabel}: ${o.entries} bejegyzés fedi egymást (${o.users} fő)`)}
                </p>
              );
            })}
          </div>
        )}
      </SettingsCard>

      {/* Holidays */}
      <SettingsCard
        title={t("Working days and public holidays", "Pracovné dni a štátne sviatky", "Munkanapok és állami ünnepek")}
        description={t(
          "Holidays come from the public Nager.Date service, fetched by the server and cached. Which days count is decided by the person's work calendar (set per employee, otherwise the company's country), never by the language of the app.",
          "Sviatky pochádzajú z verejnej služby Nager.Date, ktorú načítava server a ukladá ich do cache. Ktoré dni sa rátajú, určuje pracovný kalendár osoby (nastavuje sa pri zamestnancovi, inak krajina firmy), nikdy jazyk aplikácie.",
          "Az ünnepnapok a nyilvános Nager.Date szolgáltatásból származnak, a szerver tölti le és gyorsítótárazza őket. Hogy mely napok számítanak, a személy munkanaptára dönti el (munkatársanként állítható, egyébként a cég országa), soha nem az alkalmazás nyelve.",
        )}
        action={
          <>
            <div data-testid="tt-holiday-country">
              <CustomSelect
                size="sm"
                fitLabel
                value={country}
                onChange={(v) => setCountry(v as HolidayCountry)}
                options={HOLIDAY_COUNTRIES.map((c) => ({ value: c, label: c === "SK" ? t("Slovakia", "Slovensko", "Szlovákia") : t("Hungary", "Maďarsko", "Magyarország") }))}
              />
            </div>
            <CustomSelect
              size="sm"
              fitLabel
              value={String(year)}
              onChange={(v) => setYear(Number(v))}
              options={[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => ({ value: String(y), label: String(y) }))}
            />
          </>
        }
      >
        {tt.holidaysFallback && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-ui font-semibold text-amber-900" data-testid="tt-holidays-fallback">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {t("Holidays: built-in list, the API could not be reached.", "Sviatky: vstavaný zoznam, API sa nepodarilo kontaktovať.", "Ünnepnapok: beépített lista, az API nem érhető el.")}
          </div>
        )}
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200" data-testid="tt-holiday-list">
          {Array.from({ length: 366 }, (_, i) => {
            const d = new Date(Date.UTC(year, 0, 1 + i));
            return d.getUTCFullYear() === year ? isoDate(year, d.getUTCMonth() + 1, d.getUTCDate()) : null;
          })
            .filter((iso): iso is string => !!iso && !!calendar.holiday(iso))
            .map((iso) => (
              <li key={iso} className="flex items-center justify-between gap-3 px-3 py-2 text-ui">
                <span className="font-semibold tabular-nums text-gray-700">{new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "numeric" })}</span>
                <span className="min-w-0 flex-1 truncate text-gray-800">{holidayName(calendar.holiday(iso)!, country, language)}</span>
              </li>
            ))}
        </ul>

        <div className="rounded-lg bg-gray-50 p-4">
          <div className="type-overline text-gray-500">{t("Overrides", "Výnimky", "Eltérések")} · {country} {year}</div>
          <p className="mt-1 type-meta text-gray-500">
            {country === "HU"
              ? t(
                  "Hungary moves rest days and adds working Saturdays every year by decree (áthelyezett pihenőnap, ledolgozós szombat). No free machine-readable source exists, so enter them here from the official decree.",
                  "Maďarsko každý rok dekrétom presúva dni voľna a pridáva pracovné soboty (áthelyezett pihenőnap, ledolgozós szombat). Neexistuje bezplatný strojovo čitateľný zdroj, preto ich zadajte tu podľa oficiálneho dekrétu.",
                  "Magyarország évente rendelettel áthelyezi a pihenőnapokat és ledolgozós szombatokat jelöl ki. Nincs ingyenes, gépileg olvasható forrás, ezért itt adja meg őket a hivatalos rendelet alapján.",
                )
              : t("Add an extra day off or an extra working day (for example a company holiday).", "Pridajte ďalší voľný deň alebo ďalší pracovný deň (napríklad firemné voľno).", "Adjon hozzá extra szabadnapot vagy extra munkanapot (például céges szabadnapot).")}{" "}
            <a href={OFFICIAL_SOURCE[country].href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-entity-text hover:underline">
              {OFFICIAL_SOURCE[country].label} <ExternalLink className="size-3" />
            </a>
          </p>
          <ul className="mt-3 grid gap-1.5" data-testid="tt-overrides">
            {overrides.map((o) => (
              <li key={o.date} className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-ui">
                <span className="tabular-nums font-semibold">{o.date}</span>
                <span className={`rounded-full px-2 py-0.5 text-micro font-semibold ${o.kind === "extraDayOff" ? "bg-gray-200 text-gray-700" : "bg-emerald-100 text-emerald-800"}`}>
                  {o.kind === "extraDayOff" ? t("Extra day off", "Extra voľný deň", "Extra szabadnap") : t("Extra working day", "Extra pracovný deň", "Extra munkanap")}
                </span>
                <span className="min-w-0 flex-1 truncate text-gray-600">{o.name}</span>
                {canEdit && (
                  <button type="button" onClick={() => removeOverride(o.date)} aria-label={t("Remove", "Odstrániť", "Eltávolítás")} className="text-gray-400 hover:text-rose-600 cursor-pointer">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <input type="date" value={ovDate} onChange={(e) => setOvDate(e.target.value)} min={`${year}-01-01`} max={`${year}-12-31`} className="h-9 rounded-md border border-gray-200 bg-white px-2 text-ui" data-testid="tt-override-date" />
              <div data-testid="tt-override-kind">
                <CustomSelect
                  size="sm"
                  fitLabel
                  value={ovKind}
                  onChange={(v) => setOvKind(v as HolidayOverride["kind"])}
                  options={[
                    { value: "extraDayOff", label: t("Extra day off", "Extra voľný deň", "Extra szabadnap") },
                    { value: "extraWorkingDay", label: t("Extra working day", "Extra pracovný deň", "Extra munkanap") },
                  ]}
                />
              </div>
              <input value={ovName} onChange={(e) => setOvName(e.target.value)} placeholder={t("Name", "Názov", "Név")} className="h-9 min-w-40 flex-1 rounded-md border border-gray-200 bg-white px-3 text-ui" data-testid="tt-override-name" />
              <button type="button" onClick={addOverride} data-testid="tt-override-add" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-gray-900 px-3 text-ui font-semibold text-white cursor-pointer">
                <Plus className="size-4" />
                {t("Add", "Pridať", "Hozzáad")}
              </button>
            </div>
          )}
        </div>
      </SettingsCard>

      {/* Rules */}
      <TimerRulesCard t={t} canEdit={canEdit} draft={draft} set={set} />

      <div className={`grid items-stretch gap-6 ${roles ? "ws-md:grid-cols-2" : ""}`}>
        <RoundingCard t={t} canEdit={canEdit} rounding={draft.rounding} onChange={(rounding) => set("rounding", rounding)} />
        {roles && <WhoSeesWhatCard t={t} roles={roles} canManageRoles={canManageRoles} />}
      </div>

      <ParallelTrackingBlock t={t} canEdit={canEdit} parallel={draft.parallel ?? DEFAULT_TIME_TRACKING_SETTINGS.parallel} onChange={(parallel) => set("parallel", parallel)} />
      <PresenceBlock t={t} canEdit={canEdit} isAdmin={isAdmin} presence={draft.presence ?? DEFAULT_TIME_TRACKING_SETTINGS.presence} onChange={(presence) => set("presence", presence)} />
      <StartWhileRunningBlock />
      <PresenceSoundBlock />

      <TogglImportPanel language={language} t={t} canEdit={canEdit || isAdmin} />
      <SettingsCard
        title={t("External time tracker", "Externý nástroj na evidenciu času", "Külső időkövető")}
        description={t(
          `Toggl connections stay where they are: Employees → Settings. The employee summary keeps its Toggl hours and can switch to ${brand} time tracking for that view only.`,
          `Pripojenia na Toggl zostávajú tam, kde sú: Zamestnanci → Nastavenia. Súhrn zamestnanca si ponecháva hodiny z Toggl a v tom zobrazení sa dá prepnúť na evidenciu času ${brand}.`,
          `A Toggl-kapcsolatok ott maradnak, ahol vannak: Munkatársak → Beállítások. A munkatárs összesítője megtartja a Toggl-órákat, és azon a nézeten átváltható ${brand} időkövetésre.`,
        )}
      />

      <ExtensionSettings
        language={language}
        t={t}
        canEdit={canEdit}
        isAdmin={isAdmin}
        projects={projects}
        leads={leads}
        extension={draft.extension ?? DEFAULT_TIME_TRACKING_SETTINGS.extension}
        onExtension={(extension) => setDraft((d) => ({ ...d, extension }))}
      />

      {canEdit && (
        <div className="sticky bottom-4 flex justify-end">
          <button type="button" onClick={save} disabled={!dirty || saving} data-testid="tt-save" className="h-10 rounded-md bg-entity-solid px-5 text-ui font-semibold text-white shadow-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer">
            {t("Save settings", "Uložiť nastavenia", "Beállítások mentése")}
          </button>
        </div>
      )}
    </div>
  );
}
