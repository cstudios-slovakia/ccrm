import type { Dispatch, SetStateAction } from "react";

/*
  Settings → Pipeline stages, "Pipeline bar" column: whether a main, open state
  is a step in the lead pipeline strip. Off is for states a lead can sit in that
  are not a sales step ("Do not contact", "Unreachable"). Substates are never
  steps of their own (they light their parent) and closed states share the one
  outcome segment, so neither gets a switch. See utils/leadPipeline.
*/
interface LeadStatePipelineToggleProps {
  stateKey: string;
  /** A substate or a closed state: not a step of its own. */
  notAStep: boolean;
  hidden: Record<string, boolean>;
  setHidden: Dispatch<SetStateAction<Record<string, boolean>>>;
  canEdit: boolean;
  t: (en: string, sk: string, hu: string) => string;
}

export function LeadStatePipelineToggle({ stateKey, notAStep, hidden, setHidden, canEdit, t }: LeadStatePipelineToggleProps) {
  if (notAStep) return <span className="text-gray-300 select-none">—</span>;
  const shown = !hidden[stateKey];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      disabled={!canEdit}
      onClick={() =>
        setHidden((prev) => {
          // Stored as the hidden ones only, so the default (every state is a step) is an empty map.
          const copy = { ...prev };
          if (copy[stateKey]) delete copy[stateKey];
          else copy[stateKey] = true;
          return copy;
        })
      }
      title={t(
        "Show this state as a step in the pipeline bar on leads. Turn it off for states that are not a sales step, such as Do not contact.",
        "Zobraziť tento stav ako krok v lište fáz pri leadoch. Vypnite ho pri stavoch, ktoré nie sú krokom predaja, napríklad Nekontaktovať.",
        "Ez az állapot lépésként jelenjen meg a leadek fázissávján. Kapcsolja ki azoknál az állapotoknál, amelyek nem értékesítési lépések, például Ne keresse.",
      )}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${shown ? "bg-entity-solid" : "bg-gray-300"} ${canEdit ? "cursor-pointer hover:opacity-90" : "opacity-50 cursor-not-allowed"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${shown ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}
