import type { PipelineStripSegment } from "../components/ui/pipelineCollapse.ts";
import { isClosedLeadState } from "./leadSla.ts";
import { orderLeadStates } from "./leadStates.ts";

/*
  ── LEAD PIPELINE STRIP SEGMENTS ────────────────────────
  One builder for every lead pipeline strip (the lead drawer and the leads list
  rows), read from what Settings → Pipeline stages configures:

  - Only main states are steps. A substate lights its parent's segment, which
    then reads "Parent › Substate".
  - A state is closed when its stage group says so (isClosedLeadState), not by
    its English name, so "Odmietnutá" ends the pipeline like "Rejected" does.
  - All closed states share ONE outcome segment at the end: a neutral "Closed"
    while the lead is open, the actual outcome in its colour once it is closed.
  - States switched off under "Pipeline bar" (leadStatePipelineHidden) are not
    steps — "Do not contact" is somewhere a lead sits, not a stage it passes.
    A lead that sits in one still sees it, in its place, as the current step.
*/

export interface LeadPipelineConfig {
  leadStates: readonly string[];
  leadStageGroups?: Record<string, string>;
  leadStateParents?: Record<string, string>;
  leadStateColors?: Record<string, string>;
  /** Lowercased state name → true when the state is not a pipeline step. */
  leadStatePipelineHidden?: Record<string, boolean>;
  t: (en: string, sk: string, hu: string) => string;
}

/** The unreached fill (slate-300, #cbd5e1). */
export const LEAD_PIPELINE_UNREACHED_CLASS = "bg-slate-300";
const FALLBACK_COLOR = "#64748b";

/**
 * Prepares the configuration once and returns a function from a lead's status
 * to its strip segments — the leads list calls it for every row.
 */
export const makeLeadPipeline = (cfg: LeadPipelineConfig) => {
  const groups = cfg.leadStageGroups ?? {};
  const parents = cfg.leadStateParents ?? {};
  const colors = cfg.leadStateColors ?? {};
  const hidden = cfg.leadStatePipelineHidden ?? {};
  const { t } = cfg;

  const ordered = orderLeadStates([...cfg.leadStates], groups, parents);
  const labelOf = new Map(ordered.map((s) => [s.toLowerCase(), s] as const));
  const isClosed = (state: string) => isClosedLeadState(state, groups, parents);
  const majors = ordered.filter((s) => !parents[s.toLowerCase()]);
  const steps = majors.filter((s) => !isClosed(s));
  const outcomes = majors.filter(isClosed);

  const reached = t("(Current/Past)", "(Aktuálne/Minulé)", "(Aktuális/Múlt)");
  const upcoming = t("(Upcoming)", "(Nadchádzajúce)", "(Közelgő)");
  const closedWord = t("Closed", "Uzavreté", "Lezárva");
  const lit = (color: string) => ({ colorClass: "", color });
  const unlit = { colorClass: LEAD_PIPELINE_UNREACHED_CLASS };

  return (status: string | null | undefined): PipelineStripSegment[] => {
    const key = String(status ?? "").toLowerCase().trim();
    const parentKey = (parents[key] ?? "").toLowerCase();
    const majorKey = parentKey || key;
    const label = labelOf.get(key) ?? String(status ?? "");
    const path = parentKey ? `${labelOf.get(parentKey) ?? parentKey} › ${label}` : label;
    const leadClosed = key !== "" && isClosed(key);

    const visible = steps.filter((s) => !hidden[s.toLowerCase()] || s.toLowerCase() === majorKey);
    const currentIndex = leadClosed || !key ? -1 : visible.findIndex((s) => s.toLowerCase() === majorKey);

    const segments: PipelineStripSegment[] = visible.map((state, i) => {
      const filled = leadClosed || (currentIndex !== -1 && i <= currentIndex);
      const current = i === currentIndex;
      const title = current ? path : state;
      return {
        key: state,
        title,
        tooltip: `${title} ${filled ? reached : upcoming}`,
        filled,
        current,
        ...(filled ? lit(colors[state.toLowerCase()] || FALLBACK_COLOR) : unlit),
      };
    });

    if (leadClosed) {
      segments.push({
        key: "outcome",
        title: path,
        tooltip: `${closedWord} (${path})`,
        filled: true,
        current: true,
        ...lit(colors[key] || colors[majorKey] || FALLBACK_COLOR),
      });
    } else if (outcomes.length > 0) {
      segments.push({
        key: "outcome",
        title: closedWord,
        tooltip: `${closedWord} (${outcomes.join(" / ")})`,
        filled: false,
        ...unlit,
      });
    }

    return segments;
  };
};
