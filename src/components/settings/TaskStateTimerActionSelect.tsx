import React from "react";
import type { TimerAction, TaskStateTimerActions } from "../../utils/taskStateTimerActions";
import { suggestTimerActions } from "../../utils/taskStateTimerActions";

const L = (lang: string, en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);

/** Per-status dropdown "Timer: — / Start / Pause / Stop" (TT2 D10.1). */
export const TaskStateTimerActionSelect: React.FC<{
  value: TimerAction | undefined;
  onChange: (next: TimerAction | undefined) => void;
  canEdit: boolean;
  lang: string;
}> = ({ value, onChange, canEdit, lang }) => (
  <label className="inline-flex items-center gap-2 text-ui text-slate-500">
    <span>{L(lang, "Timer", "Časovač", "Időzítő")}</span>
    <select
      value={value ?? ""}
      disabled={!canEdit}
      onChange={(e) => onChange((e.target.value || undefined) as TimerAction | undefined)}
      className="min-h-9 rounded-xl border border-slate-200 bg-white px-2 text-ui font-semibold text-slate-700 disabled:opacity-60"
    >
      <option value="">—</option>
      <option value="start">{L(lang, "Start", "Spustiť", "Indítás")}</option>
      <option value="pause">{L(lang, "Pause", "Pozastaviť", "Szünet")}</option>
      <option value="stop">{L(lang, "Stop", "Zastaviť", "Leállítás")}</option>
    </select>
  </label>
);

/** Shown above the status list: the one-click usual mapping (only while nothing is mapped) and the C14 note. */
export const TaskStateTimerActionsHint: React.FC<{
  taskStates: string[];
  actions: TaskStateTimerActions;
  onApply: (next: TaskStateTimerActions) => void;
  canEdit: boolean;
  lang: string;
}> = ({ taskStates, actions, onApply, canEdit, lang }) => {
  const suggestion = suggestTimerActions(taskStates);
  const names = Object.keys(suggestion);
  const nothingMapped = Object.keys(actions).length === 0;
  const startName = names.find((n) => suggestion[n] === "start");
  const stopName = names.find((n) => suggestion[n] === "stop");
  return (
    <div className="mb-4 space-y-2">
      {canEdit && nothingMapped && names.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-ui text-slate-700">
          <span>
            {L(lang, "Suggested: ", "Návrh: ", "Javaslat: ")}
            {startName && <>“{startName}” {L(lang, "starts the timer", "spustí časovač", "elindítja az időzítőt")}{stopName ? ", " : ""}</>}
            {stopName && <>“{stopName}” {L(lang, "stops it.", "ho zastaví.", "leállítja.")}</>}
          </span>
          <button
            type="button"
            onClick={() => onApply(suggestion)}
            className="rounded-xl bg-indigo-600 px-3 py-1.5 text-ui font-bold text-white transition-colors hover:bg-indigo-500"
          >
            {L(lang, "Apply", "Použiť", "Alkalmaz")}
          </button>
        </div>
      )}
      <p className="text-ui text-slate-500">
        {L(
          lang,
          "Applies only to your own timer, when you change the status yourself.",
          "Platí len pre váš vlastný časovač, keď stav zmeníte sami.",
          "Csak a saját időzítőjére vonatkozik, ha Ön maga módosítja az állapotot."
        )}
      </p>
    </div>
  );
};
