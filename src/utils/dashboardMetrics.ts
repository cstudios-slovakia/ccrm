/**
 * What the Performance Dashboard counts, decided once.
 *
 * The dashboard used to answer "is this lead won?" with `isClosedLeadState`, which is also
 * true for lost and rejected deals, so "Won deals only" summed lost money. And it counted
 * client records (`client-*`, see clientRecord.ts) as active leads because a client's status
 * ("active", "client") is not a pipeline stage and fell through to "in progress". The Leads
 * screen and the MCP pipeline summary skip client records; these helpers make the dashboard
 * agree with them.
 */
import { isClientRecord } from "./clientRecord.ts";
import { isClosedLeadState } from "./leadSla.ts";

export interface MetricLead {
  id: string;
  status: string;
  value: number;
  adjustment?: number;
  archived?: boolean;
  createdAt?: string;
}

type Groups = Record<string, string>;
type Parents = Record<string, string>;

// Closed stages that mean "we did not get the deal". Every other closed stage is a win.
// Custom closed stages are matched by name in the three app languages; a company with a
// differently named losing stage still gets it right as long as the name says so.
const LOST_STAGE_PATTERNS: RegExp[] = [
  /^lost$/, /^rejected$/, /^declined$/, /^cancel/, /^no[ _-]?deal/,
  /stratil|strate|zamietnut|odmietnut|zrušen|neúspe/,
  /elveszett|elutasít|visszautasít|lemondva|sikertelen/,
];

const isLostKey = (key: string): boolean => LOST_STAGE_PATTERNS.some((re) => re.test(key));

/** True for a closed stage that is a win (accepted, won, client, or a custom winning stage). */
export const isWonLeadState = (state: string, groups: Groups = {}, parents: Parents = {}): boolean => {
  if (!isClosedLeadState(state, groups, parents)) return false;
  const key = (state || "").toLowerCase().trim();
  const parent = (parents[key] || "").toLowerCase().trim();
  return !isLostKey(key) && !(parent && isLostKey(parent));
};

/** A real sales opportunity: not a client record, not archived, not the documents placeholder. */
export const isPipelineLead = (lead: MetricLead): boolean =>
  lead.id !== "unassigned-docs" && !lead.archived && !isClientRecord(lead);

/** A pipeline lead that is still open (its stage is not closed). */
export const isActivePipelineLead = (lead: MetricLead, groups: Groups = {}, parents: Parents = {}): boolean =>
  isPipelineLead(lead) && !isClosedLeadState(lead.status, groups, parents);

export interface LeadKpis {
  /** Pipeline leads in the period, any stage. */
  total: number;
  active: { count: number; value: number };
  won: { count: number; value: number };
  /** won ÷ total × 100; 0 with no leads. */
  conversionPct: number;
}

const leadValue = (l: MetricLead) => Number(l.value) || 0;

/** The overview cards. `leads` should already be cut to the date filter. */
export const leadKpis = (leads: MetricLead[], groups: Groups = {}, parents: Parents = {}): LeadKpis => {
  const pipeline = leads.filter(isPipelineLead);
  const active = pipeline.filter((l) => !isClosedLeadState(l.status, groups, parents));
  const won = pipeline.filter((l) => isWonLeadState(l.status, groups, parents));
  return {
    total: pipeline.length,
    active: { count: active.length, value: active.reduce((s, l) => s + leadValue(l), 0) },
    won: { count: won.length, value: won.reduce((s, l) => s + leadValue(l), 0) },
    conversionPct: pipeline.length > 0 ? (won.length / pipeline.length) * 100 : 0,
  };
};
