import React, { useMemo } from "react";
import { Calendar, AlertCircle } from "lucide-react";
import type {
  TaskRecurrence,
  TaskRecurrenceFrequency,
  TaskWeekendRule,
} from "../types";
import { CustomSelect } from "./ui/CustomSelect";
import {
  getNextDueDates,
  getNextAfterCompletion,
} from "../utils/recurringTasks";

export type Translate = (en: string, sk: string, hu: string) => string;

interface TaskRecurrenceFieldsProps {
  recurrence: TaskRecurrence;
  onChange: (next: TaskRecurrence) => void;
  t: Translate;
}

export const createDefaultRecurrence = (initialDate?: string): TaskRecurrence => {
  const today = new Date().toISOString().slice(0, 10);
  const start = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : today;
  const startD = Number(start.slice(8, 10)) || 15;

  return {
    mode: "schedule",
    frequency: "monthly",
    interval: 1,
    config: {
      monthlyType: "day_of_month",
      dayOfMonth: startD,
    },
    weekendRule: "keep",
    leadDays: 3,
    startsOn: start,
    endsOn: null,
    paused: false,
  };
};

export const TaskRecurrenceFields: React.FC<TaskRecurrenceFieldsProps> = ({
  recurrence,
  onChange,
  t,
}) => {
  const today = new Date().toISOString().slice(0, 10);

  const update = (patch: Partial<TaskRecurrence>) => {
    onChange({ ...recurrence, ...patch });
  };

  const updateConfig = (patch: Partial<NonNullable<TaskRecurrence["config"]>>) => {
    onChange({
      ...recurrence,
      config: { ...(recurrence.config || {}), ...patch },
    });
  };

  const handleFrequencyChange = (freq: TaskRecurrenceFrequency) => {
    let defaultLead = 3;
    if (freq === "daily") defaultLead = 0;
    else if (freq === "weekly") defaultLead = 1;
    else if (freq === "yearly") defaultLead = 14;

    onChange({
      ...recurrence,
      frequency: freq,
      leadDays: defaultLead,
    });
  };

  // Live preview
  const upcomingPreview = useMemo(() => {
    if (recurrence.mode === "after_completion") {
      const sample = getNextAfterCompletion(
        recurrence.frequency,
        recurrence.interval,
        today,
        recurrence.weekendRule,
        recurrence.leadDays,
        recurrence.endsOn
      );
      return { sampleAfter: sample, dates: [] };
    }
    const dates = getNextDueDates(recurrence, 5);
    return { sampleAfter: null, dates };
  }, [recurrence, today]);

  const isStartsOnPast = Boolean(
    recurrence.mode === "schedule" &&
    recurrence.startsOn &&
    recurrence.startsOn < today
  );

  return (
    <div className="space-y-4 pt-2 border-t border-slate-200">
      {/* 1. Mode selector */}
      <div>
        <label className="text-caption font-bold text-slate-700 block mb-1.5">
          {t("Repeat Mode", "Režim opakovania", "Ismétlési mód")}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => update({ mode: "schedule" })}
            className={`py-2 px-3 rounded-xl text-ui font-bold transition-all cursor-pointer border ${
              recurrence.mode === "schedule"
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {t("On a schedule", "Podľa kalendára", "Ütemezés szerint")}
          </button>
          <button
            type="button"
            onClick={() => update({ mode: "after_completion" })}
            className={`py-2 px-3 rounded-xl text-ui font-bold transition-all cursor-pointer border ${
              recurrence.mode === "after_completion"
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {t("After completion", "Po dokončení", "Befejezés után")}
          </button>
        </div>
      </div>

      {/* 2. Frequency & Interval */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-caption font-bold text-slate-700 block mb-1">
            {t("Frequency", "Periodicita", "Gyakoriság")}
          </label>
          <CustomSelect
            value={recurrence.frequency}
            onChange={(val) => handleFrequencyChange(val as TaskRecurrenceFrequency)}
            options={[
              { value: "daily", label: t("Daily", "Denne", "Naponta") },
              { value: "weekly", label: t("Weekly", "Týždenne", "Hetente") },
              { value: "monthly", label: t("Monthly", "Mesačne", "Havonta") },
              { value: "yearly", label: t("Yearly", "Ročne", "Évente") },
            ]}
            size="sm"
            className="w-full text-ui font-semibold rounded-xl"
          />
        </div>

        <div>
          <label className="text-caption font-bold text-slate-700 block mb-1">
            {t("Interval (Every N)", "Interval (Každých N)", "Intervallum (Minden N.)")}
          </label>
          <input
            type="number"
            min="1"
            max="999"
            value={recurrence.interval || 1}
            onChange={(e) => update({ interval: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-ui font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* 3. Schedule-specific Day Settings */}
      {recurrence.mode === "schedule" && (
        <>
          {recurrence.frequency === "weekly" && (
            <div className="animate-in fade-in">
              <label className="text-caption font-bold text-slate-700 block mb-1">
                {t("Day of the Week", "Deň v týždni", "A hét napja")}
              </label>
              <CustomSelect
                value={String(recurrence.config?.dayOfWeek ?? 1)}
                onChange={(val) => updateConfig({ dayOfWeek: parseInt(val) })}
                options={[
                  { value: "1", label: t("Monday", "Pondelok", "Hétfő") },
                  { value: "2", label: t("Tuesday", "Utorok", "Kedd") },
                  { value: "3", label: t("Wednesday", "Streda", "Szerda") },
                  { value: "4", label: t("Thursday", "Štvrtok", "Csütörtök") },
                  { value: "5", label: t("Friday", "Piatok", "Péntek") },
                  { value: "6", label: t("Saturday", "Sobota", "Szombat") },
                  { value: "0", label: t("Sunday", "Nedeľa", "Vasárnap") },
                ]}
                size="sm"
                className="w-full text-ui font-semibold rounded-xl"
              />
            </div>
          )}

          {recurrence.frequency === "monthly" && (
            <div className="space-y-2 animate-in fade-in">
              <div className="flex flex-wrap items-center gap-4 text-ui font-semibold text-slate-700">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="taskMonthlyType"
                    checked={recurrence.config?.monthlyType !== "nth_weekday"}
                    onChange={() => updateConfig({ monthlyType: "day_of_month" })}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{t("Specific Day of Month", "Konkrétny deň v mesiaci", "A hónap adott napja")}</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="taskMonthlyType"
                    checked={recurrence.config?.monthlyType === "nth_weekday"}
                    onChange={() => updateConfig({ monthlyType: "nth_weekday" })}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{t("Relative Day (e.g. 1st Monday)", "Relatívny deň (napr. 1. pondelok)", "Relatív nap (pl. 1. hétfő)")}</span>
                </label>
              </div>

              {recurrence.config?.monthlyType === "nth_weekday" ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-caption font-bold text-slate-500 block mb-1">
                      {t("Week of Month", "Týždeň v mesiaci", "Hét a hónapban")}
                    </label>
                    <CustomSelect
                      value={String(recurrence.config?.weekOfMonth ?? 1)}
                      onChange={(val) => updateConfig({ weekOfMonth: parseInt(val) })}
                      options={[
                        { value: "1", label: t("1st (First)", "1. (Prvý)", "1. (Első)") },
                        { value: "2", label: t("2nd (Second)", "2. (Druhý)", "2. (Második)") },
                        { value: "3", label: t("3rd (Third)", "3. (Tretí)", "3. (Harmadik)") },
                        { value: "4", label: t("4th (Fourth)", "4. (Štvrtý)", "4. (Negyedik)") },
                        { value: "-1", label: t("Last", "Posledný", "Utolsó") },
                      ]}
                      size="sm"
                      className="w-full text-ui font-semibold rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-caption font-bold text-slate-500 block mb-1">
                      {t("Weekday", "Deň v týždni", "Hétköznap")}
                    </label>
                    <CustomSelect
                      value={String(recurrence.config?.dayOfWeek ?? 1)}
                      onChange={(val) => updateConfig({ dayOfWeek: parseInt(val) })}
                      options={[
                        { value: "1", label: t("Monday", "Pondelok", "Hétfő") },
                        { value: "2", label: t("Tuesday", "Utorok", "Kedd") },
                        { value: "3", label: t("Wednesday", "Streda", "Szerda") },
                        { value: "4", label: t("Thursday", "Štvrtok", "Csütörtök") },
                        { value: "5", label: t("Friday", "Piatok", "Péntek") },
                        { value: "6", label: t("Saturday", "Sobota", "Szombat") },
                        { value: "0", label: t("Sunday", "Nedeľa", "Vasárnap") },
                      ]}
                      size="sm"
                      className="w-full text-ui font-semibold rounded-xl"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-caption font-bold text-slate-500 block mb-1">
                    {t("Day of Month (1 - 31)", "Deň v mesiaci (1 - 31)", "Nap (1 - 31)")}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={recurrence.config?.dayOfMonth ?? 15}
                    onChange={(e) => updateConfig({ dayOfMonth: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-ui font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              )}
            </div>
          )}

          {recurrence.frequency === "yearly" && (
            <div className="grid grid-cols-2 gap-2 animate-in fade-in">
              <div>
                <label className="text-caption font-bold text-slate-500 block mb-1">
                  {t("Month of Year", "Mesiac v roku", "Hónap")}
                </label>
                <CustomSelect
                  value={String(recurrence.config?.month ?? 1)}
                  onChange={(val) => updateConfig({ month: parseInt(val) })}
                  options={[
                    { value: "1", label: t("January", "Január", "Január") },
                    { value: "2", label: t("February", "Február", "Február") },
                    { value: "3", label: t("March", "Marec", "Március") },
                    { value: "4", label: t("April", "Apríl", "Április") },
                    { value: "5", label: t("May", "Máj", "Május") },
                    { value: "6", label: t("June", "Jún", "Június") },
                    { value: "7", label: t("July", "Júl", "Július") },
                    { value: "8", label: t("August", "August", "Augusztus") },
                    { value: "9", label: t("September", "September", "Szeptember") },
                    { value: "10", label: t("October", "Október", "Október") },
                    { value: "11", label: t("November", "November", "November") },
                    { value: "12", label: t("December", "December", "December") },
                  ]}
                  size="sm"
                  className="w-full text-ui font-semibold rounded-xl"
                />
              </div>
              <div>
                <label className="text-caption font-bold text-slate-500 block mb-1">
                  {t("Day of Month (1 - 31)", "Deň v mesiaci (1 - 31)", "Nap (1 - 31)")}
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={recurrence.config?.dayOfMonth ?? 1}
                  onChange={(e) => updateConfig({ dayOfMonth: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-ui font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* 4. Weekend Rule & Lead Days */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-caption font-bold text-slate-700 block mb-1">
            {t("Weekend Rule", "Pravidlo pre víkend", "Hétvégi szabály")}
          </label>
          <CustomSelect
            value={recurrence.weekendRule}
            onChange={(val) => update({ weekendRule: val as TaskWeekendRule })}
            options={
              recurrence.frequency === "daily"
                ? [
                    { value: "keep", label: t("Include weekends", "Vrátane víkendov", "Hétvégékkel együtt") },
                    { value: "before", label: t("Weekdays only", "Iba pracovné dni", "Csak munkanapokon") },
                  ]
                : [
                    { value: "keep", label: t("Keep as is", "Ponechať bez zmeny", "Változatlanul hagyni") },
                    { value: "before", label: t("Move to Friday before", "Presunúť na piatok pred", "Áthelyezés előző péntekre") },
                    { value: "after", label: t("Move to Monday after", "Presunúť na pondelok po", "Áthelyezés következő hétfőre") },
                  ]
            }
            size="sm"
            className="w-full text-ui font-semibold rounded-xl"
          />
        </div>

        <div>
          <label className="text-caption font-bold text-slate-700 block mb-1">
            {t("Show N days before due", "Zobraziť N dní vopred", "Megjelenítés N nappal előbb")}
          </label>
          <input
            type="number"
            min="0"
            max="365"
            value={recurrence.leadDays ?? 0}
            onChange={(e) => update({ leadDays: Math.max(0, Math.min(365, parseInt(e.target.value) || 0)) })}
            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-ui font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>

      {/* 5. Starts On & Ends On */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-caption font-bold text-slate-700 block mb-1">
            {t("Starts on", "Začína dňa", "Kezdés dátuma")}
          </label>
          <input
            type="date"
            value={recurrence.startsOn || today}
            onChange={(e) => update({ startsOn: e.target.value || today })}
            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-ui font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="text-caption font-bold text-slate-700 block mb-1">
            {t("Ends on (optional)", "Končí dňa (voliteľné)", "Befejezés dátuma (opcionális)")}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={recurrence.endsOn || ""}
              onChange={(e) => update({ endsOn: e.target.value ? e.target.value : null })}
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-ui font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            {recurrence.endsOn && (
              <button
                type="button"
                onClick={() => update({ endsOn: null })}
                className="px-2.5 py-1.5 text-caption font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer whitespace-nowrap"
              >
                {t("Clear", "Zrušiť", "Törlés")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rule 8: Overdue warning if startsOn is in the past */}
      {isStartsOnPast && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-900 text-caption font-medium">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            {t(
              "The start date is in the past. The first task will already be created as overdue.",
              "Dátum začiatku je v minulosti. Prvá úloha bude vytvorená už po termíne.",
              "A kezdési dátum a múltban van. Az első feladat már lejártként fog létrejönni."
            )}
          </span>
        </div>
      )}

      {/* 6. Live preview */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
        <div className="flex items-center gap-1.5 text-caption font-bold text-slate-700">
          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
          <span>{t("Schedule Preview", "Náhľad plánu", "Ütemezés előnézete")}</span>
        </div>

        {recurrence.mode === "after_completion" ? (
          <p className="text-caption text-slate-600">
            {t(
              "Each task appears after the previous occurrence is closed.",
              "Každá nová úloha sa vytvorí až po uzavretí predchádzajúcej.",
              "Minden új feladat az előző lezárása után jön létre."
            )}
          </p>
        ) : (
          <div>
            {upcomingPreview.dates.length > 0 ? (
              <div className="space-y-1">
                <p className="text-caption font-semibold text-slate-700">
                  {t("First task", "Prvá úloha", "Első feladat")}:{" "}
                  <span className="text-indigo-600 font-bold">
                    {t("due", "termín", "határidő")} {upcomingPreview.dates[0].deadline}
                  </span>
                  {recurrence.leadDays > 0 && (
                    <span className="text-slate-500">
                      {" "}
                      ({t("appears", "zobrazí sa", "megjelenik")} {upcomingPreview.dates[0].startDate})
                    </span>
                  )}
                </p>
                {upcomingPreview.dates.length > 1 && (
                  <div className="pt-1 border-t border-slate-200/70 text-caption text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold text-slate-600">
                      {t("Next 5 due dates", "Ďalších 5 termínov", "Következő 5 határidő")}:
                    </span>
                    {upcomingPreview.dates.map((d, i) => (
                      <span key={i} className="inline-block px-1.5 py-0.5 bg-white border border-slate-200 rounded-md text-slate-700 font-mono text-caption">
                        {d.deadline}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-caption text-slate-500">
                {t("No upcoming occurrences within schedule limits.", "Žiadne nadchádzajúce výskyty v rámci limitov plánu.", "Nincsenek közelgő előfordulások az ütemezés határain belül.")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
