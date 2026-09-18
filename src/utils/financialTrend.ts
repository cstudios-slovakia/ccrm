/**
 * Manual anchors for the finance trend / 3-month projection chart.
 *
 * These used to live in `localStorage`, which made the chart per-browser: the
 * person who reconciled a week against the real bank statement saw one curve,
 * and everybody else saw another one built from a hardcoded 48500 starting
 * balance. The anchors are a statement about the company's bank account, not a
 * view preference, so they belong in the shared dataset — they now travel in
 * the sync payload as `financialTrend` and are stored in `system_settings`
 * under `FINANCIAL_TREND`.
 *
 * The one part that stayed per-user is which curve you are looking at
 * (relative flow vs. cumulative balance) — see `financialTrendMode` in
 * utils/userPrefs.ts, which is DB-backed per user rather than per browser.
 */

export interface FinancialTrendSettings {
  /**
   * Verified bank balance per week, keyed by the week's Monday in `YYYY-MM-DD`
   * form: `{ "2026-08-17": 123456 }`.
   */
  weeklyBankBalances: Record<string, number>;
  /**
   * Balance the curve is anchored to when no week has been calibrated at all.
   * `null` means "never set", which falls back to DEFAULT_BANK_BALANCE — not
   * the same as an operator deliberately anchoring the account at zero.
   */
  currentBankBalance: number | null;
}

/** What the chart assumes before anyone has reconciled a single week. */
export const DEFAULT_BANK_BALANCE = 48500;

export const EMPTY_FINANCIAL_TREND: FinancialTrendSettings = {
  weeklyBankBalances: {},
  currentBankBalance: null,
};

const WEEK_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Coerce whatever the server (or an older client's stored blob) hands over into
 * the shape above. Anything unrecognised is dropped rather than carried into
 * the chart's arithmetic, where a NaN anchor would blank every week after it.
 */
export function normalizeFinancialTrend(raw: unknown): FinancialTrendSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_FINANCIAL_TREND;
  const source = raw as Record<string, unknown>;

  const balances: Record<string, number> = {};
  const inbound = source.weeklyBankBalances;
  if (inbound && typeof inbound === "object" && !Array.isArray(inbound)) {
    for (const [key, value] of Object.entries(inbound as Record<string, unknown>)) {
      if (!WEEK_KEY.test(key)) continue;
      const amount = typeof value === "number" ? value : parseFloat(String(value));
      if (Number.isFinite(amount)) balances[key] = amount;
    }
  }

  const rawCurrent = source.currentBankBalance;
  const current =
    rawCurrent === null || rawCurrent === undefined || rawCurrent === ""
      ? null
      : parseFloat(String(rawCurrent));

  return {
    weeklyBankBalances: balances,
    currentBankBalance: current !== null && Number.isFinite(current) ? current : null,
  };
}

/** True when nothing has ever been reconciled — the state a fresh install is in. */
export function isFinancialTrendEmpty(trend: FinancialTrendSettings): boolean {
  return trend.currentBankBalance === null && Object.keys(trend.weeklyBankBalances).length === 0;
}

/* ------------------------------------------------- one-shot local migration */

// `crm_financial_trend_mode` is deliberately not here: it became a per-user
// preference, so it migrates through readLegacyPrefs/clearLegacyPrefs in
// utils/userPrefs.ts along with every other one.
const LEGACY_BALANCES_KEY = "crm_financial_weekly_bank_balances";
const LEGACY_CURRENT_KEY = "crm_financial_current_bank_balance";

const readLocal = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    // iOS Safari with "Block All Cookies" throws on a plain read.
    return null;
  }
};

/**
 * Anchors an existing install still has sitting in this browser, so the first
 * load after this change adopts them instead of resetting the operator's
 * reconciliation to the default curve. Returns null when there is nothing to
 * adopt — which is also the answer for every user who never calibrated a week.
 */
export function readLegacyFinancialTrend(): FinancialTrendSettings | null {
  const rawBalances = readLocal(LEGACY_BALANCES_KEY);
  const rawCurrent = readLocal(LEGACY_CURRENT_KEY);
  if (rawBalances === null && rawCurrent === null) return null;

  let parsed: unknown = null;
  if (rawBalances) {
    try {
      parsed = JSON.parse(rawBalances);
    } catch (e) {
      parsed = null;
    }
  }

  const trend = normalizeFinancialTrend({
    weeklyBankBalances: parsed,
    currentBankBalance: rawCurrent,
  });
  return isFinancialTrendEmpty(trend) ? null : trend;
}

/** The per-browser copies, removed once the DB holds the anchors. */
export function clearLegacyFinancialTrend(): void {
  [LEGACY_BALANCES_KEY, LEGACY_CURRENT_KEY].forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      /* nothing we can do, and nothing that should stop the app */
    }
  });
}
