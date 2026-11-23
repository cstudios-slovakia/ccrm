/**
 * Contract of the "Výkonnostný prehľad" tab.
 *
 * `src/utils/performance/*` computes these objects from the app's records (pure functions);
 * the widgets in this folder only render them. Rules that hold for every type here:
 *
 * - Numbers are raw (euros, milliseconds, days, counts). The widget formats them.
 * - `null` on a value means "cannot be computed" (zero denominator, no data) and renders "—".
 * - `null` on a delta means "no delta line" (the period is "all time", or there is no previous value).
 * - `null` in place of a whole widget's data means the data is not stored yet (Phase 2):
 *   the widget renders its frame, title and caption with an `EmptyState` inside.
 * - A percentage is 0–100 (23.5 means 23,5 %), never a 0–1 fraction.
 * - `scaleMax` is the value that fills a bar to 100 % (see `niceCeil` in `src/utils/performance`).
 */

export type PeriodPreset = "week" | "month" | "quarter" | "year" | "custom" | "all";

/** The range chosen in the page header, as local calendar days. */
export interface PerformancePeriod {
  preset: PeriodPreset;
  /** First local day of the range (00:00:00.000 local); null for "all". */
  start: Date | null;
  /** Last local day of the range (23:59:59.999 local); null for "all". */
  end: Date | null;
  /** The preceding range of the same length; null for "all". */
  previousStart: Date | null;
  previousEnd: Date | null;
}

/** Texts derived from the period, already translated: "november", "oproti októbru". */
export interface PeriodLabels {
  /** Names the period inside a caption: "november" in "Príjmy · november". */
  current: string;
  /** The whole comparison phrase: "oproti októbru". Empty string for "all". */
  versusPrevious: string;
  /**
   * The comparison phrase for figures that are always monthly (Rekurentné príjmy):
   * names the calendar month before the one the period ends in. Empty string for "all".
   */
  versusPreviousMonth: string;
}

/* ------------------------------------------------------------------ KPI strip */

export interface KpiStripData {
  /** Obrat · uzavreté obchody */
  revenue: { value: number; deltaPct: number | null };
  /** Konverzia lead → klient: "8 z 34 leadov · +2,1 p. b." */
  leadConversion: { ratePct: number | null; converted: number; total: number; deltaPp: number | null };
  /** Úspešnosť cenových ponúk: "18 prijatých z 29 uzavretých ponúk" */
  offerSuccess: { ratePct: number | null; accepted: number; closed: number };
  /** Priemerná hodnota zákazky: "8 zákaziek · −4 % oproti októbru" */
  averageDeal: { value: number | null; deals: number; deltaPct: number | null };
}

/* ------------------------------------------------------------ Na fakturovanie */

export interface InvoicingStatusRow {
  /** Status id used by the per-user exclusion list. */
  id: string;
  label: string;
  /** Colour from the database configuration, already passed through `liftAccent`. */
  color: string;
  count: number;
  value: number;
  /** false when the user unticked the status: it stays listed but leaves every sum. */
  included: boolean;
}

export interface InvoicingGroup {
  rows: InvoicingStatusRow[];
  /** Records in the included statuses: "20 leadov". */
  itemCount: number;
  /** "5 z 5 stavov": included of all. */
  includedStatuses: number;
  totalStatuses: number;
  /** Sum of the included rows. */
  total: number;
}

export interface InvoicingData {
  pipeline: InvoicingGroup;
  projects: InvoicingGroup;
  /** pipeline.total + projects.total */
  total: number;
  /** pipeline.itemCount + projects.itemCount: "42 položiek" */
  itemCount: number;
  /** Share of each group in `total`; null when `total` is 0. */
  pipelineSharePct: number | null;
  projectsSharePct: number | null;
}

/* ------------------------------------------------------------------- Financie */

export interface CashflowMonth {
  year: number;
  /** 0–11 */
  month: number;
  income: number;
  expenses: number;
  /** Drawn at 45 % opacity inside the "Prognóza" band. */
  forecast: boolean;
  /** The month that contains today: its label is bold. */
  current: boolean;
}

export interface CashflowData {
  /** Headline figures for the selected period. Čistý tok = income − expenses. */
  periodIncome: number;
  periodExpenses: number;
  /** Six actual months ending with the current one, then two forecast months. */
  months: CashflowMonth[];
  /** Top of the value axis (the axis shows scaleMax, scaleMax / 2 and 0). */
  scaleMax: number;
}

export interface RecurringIncomeData {
  /** Recurring income per month. */
  monthly: number;
  /** Change against the previous period, in money: "+650 €". */
  deltaMonthly: number | null;
  /** monthly × 12 */
  yearly: number;
  /** Share of all income in the period. */
  shareOfIncomePct: number | null;
  /** Top three categories, then one "Ostatné" row (`other: true`) when there are more. */
  breakdown: { label: string; amount: number; other: boolean }[];
}

export interface DsoClientRow {
  clientId: string;
  name: string;
  /** Average days from issue to payment for this client. */
  days: number;
}

export interface DsoData {
  averageDays: number | null;
  /** Change against the previous period, in days: "−3 dni". Lower is better. */
  deltaDays: number | null;
  /** The real payment term: the tick and the legend "Splatnosť N dní". The bar is full at twice the term. */
  paymentTermDays: number | null;
  /** Slowest five, slowest first. */
  worst: DsoClientRow[];
  /** Fastest five, fastest first. */
  best: DsoClientRow[];
}

/* ------------------------------------------------------------------- Projekty */

export interface ProfitabilityRow {
  projectId: string;
  name: string;
  clientName: string;
  /** Inactive project that received a cost in the last 30 days: badge "Neaktívny". */
  inactive: boolean;
  invoiced: number;
  costs: number;
  /** invoiced − costs */
  profit: number;
  /** costs ÷ invoiced × 100; null when nothing is invoiced. */
  costRatioPct: number | null;
}

export interface ProfitabilityData {
  rows: ProfitabilityRow[];
  /** Footer "Spolu · N projektov". */
  total: { projects: number; invoiced: number; costs: number; profit: number; costRatioPct: number | null };
  /**
   * Time tracking is on and a listed project has tracked time whose cost the server withheld from
   * this user: `costs` then holds the expenses only. The card says so.
   */
  labourCostHidden?: boolean;
}

export type DeadlineTone = "overdue" | "soon" | "later";

export interface DeadlineRow {
  projectId: string;
  name: string;
  clientName: string;
  /** The deadline as a local calendar day. */
  deadline: Date;
  /** Whole days from today: negative = past the deadline, 0 = today. */
  daysFromToday: number;
  tone: DeadlineTone;
}

export interface DeadlinesData {
  /** Counters over every active project with a deadline, not only the listed rows. */
  overdue: number;
  soon: number;
  later: number;
  /** Nearest first, at most seven. */
  rows: DeadlineRow[];
}

export interface ScopeCreepData {
  /** Criteria added in the period: "+17 kritérií". */
  addedInPeriod: number;
  /** Criteria in the approved scope of all projects: "(108)". */
  originalTotal: number;
  /** addedInPeriod ÷ originalTotal × 100 */
  sharePct: number | null;
  /** Five projects, most additions first. */
  rows: { projectId: string; name: string; original: number; added: number }[];
  /** original + added of the largest row. */
  scaleMax: number;
}

/** "loading": the pushes are on their way; "failed": the request failed; "forbidden": the server refused (no access to projects). Absent = "ready". */
export type DeploymentsState = "loading" | "ready" | "failed" | "forbidden";

export interface DeploymentsData {
  /** Pushes in the period: "86 pushov". */
  total: number;
  /** The latest push of all projects. */
  lastPushAt: Date | null;
  lastPushProject: string | null;
  /** Most pushes first. `stale`: the last push is older than 14 days (amber). */
  rows: { projectId: string; name: string; pushes: number; lastPushAt: Date; stale: boolean }[];
  scaleMax: number;
}

export interface ThroughputData {
  /** Average days from task creation to completion. */
  averageDays: number | null;
  /** Change against the previous period, in days. Lower is better. */
  deltaDays: number | null;
  /** Fastest first, at most five. */
  byProject: { projectId: string; name: string; days: number }[];
  scaleMax: number;
}

/* ---------------------------------------------------------------- Tím a úlohy */

export type UtilizationState = "loading" | "ready" | "time-tracking" | "failed";

export interface UtilizationData {
  /** Whole team: "18 % času tímu · 142 h z 790 h". */
  bugMs: number;
  totalMs: number;
  sharePct: number | null;
  /** Highest share first. */
  rows: { employeeId: string; name: string; bugMs: number; totalMs: number; sharePct: number }[];
}

export interface AssignedTasksData {
  /** Sum of the rows (a task with several assignees counts for each): "73 úloh". */
  total: number;
  /** "z toho 11 po termíne" */
  overdue: number;
  /** Most tasks first. `open` includes `overdue`. */
  rows: { employeeId: string; name: string; open: number; overdue: number }[];
  /** `open` of the largest row. */
  scaleMax: number;
}

export interface ReworkRatioData {
  /** "12 % celkovo · 31 z 258 úloh" */
  ratePct: number | null;
  reopened: number;
  completed: number;
  /** Highest ratio first. */
  rows: { employeeId: string; name: string; reopened: number; completed: number; ratePct: number }[];
  scaleMax: number;
}

export interface ReworkCountData {
  /** Average reopenings per reopened task: "1,6×". */
  average: number | null;
  /** Highest first, at most five. */
  byProject: { projectId: string; name: string; average: number }[];
  scaleMax: number;
}

/* -------------------------------------------------------------------- Podpora */

/** The five `TicketStatusCategory` values, in display order. */
export type TicketCategoryKey = "new" | "open" | "waiting" | "resolved" | "closed";

export interface TicketsByStatusData {
  /** Tickets received in the period: "64 ticketov". */
  total: number;
  /** new + open + waiting: "z toho 30 otvorených". */
  open: number;
  /** Always five entries, in the order new, open, waiting, resolved, closed. */
  categories: { category: TicketCategoryKey; count: number; sharePct: number | null }[];
}

export interface ResponseTimeData {
  /** Average of first response − creation. */
  averageMs: number | null;
  /** Change against the previous period. Lower is better. */
  deltaMs: number | null;
  /** Share of answered tickets that met the first-response limit. */
  withinSlaPct: number | null;
  /** The SLA first-response limit; the bar shows averageMs against it. */
  slaMs: number | null;
  /** The last four ISO weeks, oldest first. */
  weeks: { isoWeek: number; averageMs: number | null }[];
}

/* -------------------------------------------------------------- Whole overview */

export interface PerformanceOverviewData {
  period: PerformancePeriod;
  labels: PeriodLabels;
  kpis: KpiStripData;
  invoicing: InvoicingData;
  cashflow: CashflowData;
  recurringIncome: RecurringIncomeData;
  dso: DsoData;
  profitability: ProfitabilityData;
  deadlines: DeadlinesData;
  /** From the projects' acceptance criteria; null is still allowed by the contract but the overview always fills it. */
  scopeCreep: ScopeCreepData | null;
  /**
   * From the stored GitHub pushes. Null while no non-archived project is paired with a repository
   * ("not connected" empty state) and while `deploymentsState` is not "ready".
   */
  deployments: DeploymentsData | null;
  deploymentsState?: DeploymentsState;
  throughput: ThroughputData;
  /** Worked time on Bug tasks; non-null only when `utilizationState` is "ready". */
  utilization: UtilizationData | null;
  /**
   * "loading": the entries are on their way; "time-tracking": the user has no time tracking or the
   * server does not give them the team's entries; "failed": the request failed. Absent = "ready".
   */
  utilizationState?: UtilizationState;
  /** The entries hit the server's list limit: older ones of the period are missing from the figures. */
  utilizationTruncated?: boolean;
  assignedTasks: AssignedTasksData;
  /** From `Task.reopens`; null is still allowed by the contract but the overview always fills it. */
  reworkRatio: ReworkRatioData | null;
  reworkCount: ReworkCountData | null;
  ticketsByStatus: TicketsByStatusData;
  responseTime: ResponseTimeData;
}
