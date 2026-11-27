import React from "react";
import { ArrowLeft, ArrowRight, CornerDownRight } from "lucide-react";
import type { Language } from "../../utils/translations";
import { CustomSelect } from "../ui/CustomSelect";

/*
  The sub-status controls shared by the lead-state and project-status tables:
  indent / outdent buttons, the ↳ marker and the add form's "Under" picker.
  The rules behind them are in utils/subStatusTree.ts.
*/

const pick = (lang: Language, en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);

export const subStatusNoParentToast = (lang: Language) =>
  pick(
    lang,
    "A main status must come before it in the same group to make a sub-status.",
    "Na vytvorenie podstavu musí pred ním byť hlavný stav v rovnakej skupine.",
    "Al-állapothoz előtte egy fő állapotnak kell állnia ugyanabban a csoportban.",
  );

const btn = "text-gray-400 hover:text-entity-text disabled:opacity-20 disabled:pointer-events-none cursor-pointer p-0.5 hover:scale-110 active:scale-90 transition-all";

export const SubStatusIndentButtons: React.FC<{
  lang: Language;
  canIndent: boolean;
  canOutdent: boolean;
  onIndent: () => void;
  onOutdent: () => void;
}> = ({ lang, canIndent, canOutdent, onIndent, onOutdent }) => (
  <div className="flex items-center gap-0.5 select-none shrink-0">
    <button
      type="button"
      data-testid="sub-status-indent"
      onClick={onIndent}
      disabled={!canIndent}
      className={btn}
      title={pick(lang, "Make sub-status of the status above", "Urobiť podstavom stavu nad ním", "Al-állapottá tétel a fölötte lévő alatt")}
    >
      <ArrowRight className="h-3.5 w-3.5" />
    </button>
    <button
      type="button"
      data-testid="sub-status-outdent"
      onClick={onOutdent}
      disabled={!canOutdent}
      className={btn}
      title={pick(lang, "Make main status", "Urobiť hlavným stavom", "Fő állapottá tétel")}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
    </button>
  </div>
);

export const SubStatusMarker: React.FC = () => (
  <CornerDownRight className="h-3.5 w-3.5 text-gray-300 shrink-0" aria-hidden />
);

export const SubStatusParentSelect: React.FC<{
  lang: Language;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; color?: string }[];
}> = ({ lang, value, onChange, options }) => (
  <div className="w-44">
    <CustomSelect
      value={value}
      onChange={onChange}
      options={[
        { value: "", label: pick(lang, "Under: none (main status)", "Pod: nič (hlavný stav)", "Alatta: nincs (fő állapot)") },
        ...options,
      ]}
    />
  </div>
);
