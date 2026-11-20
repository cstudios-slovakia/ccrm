/**
 * Marketing ROI on real data (Performance Dashboard → Marketing ROI).
 *
 * Costs are ordinary finance expenses: Settings → Integrations → Marketing ROI says which expense
 * categories hold the newsletter and the social media costs, so nothing is typed twice and the
 * same money counts in profit and cash flow. Revenue per channel:
 *
 *   - Newsletter: live invoices issued to a recipient within N days after the send (default 30).
 *     An invoice is credited once, to the latest campaign that reached that client before it.
 *   - Social / paid ads: won pipeline leads whose lead source is mapped to that channel.
 *
 * ROI = (revenue − cost) ÷ cost × 100, and null while the cost is 0 (a % of nothing is not a number).
 */
import type { FinancialCategory, FinancialRecord } from "../types";
import {
  aggregateOverviewTable,
  aggregateSimplifiedOverviewTable,
  overviewRecordDate,
  type OverviewColumn,
  type OverviewTableAggregate,
} from "./financialOverviewTable.ts";
import { effectiveParentId } from "./financialCategoryTree.ts";
import { isLiveInvoiceStatus, type OfferStatusDef } from "./offerStatuses.ts";

// ── Config ────────────────────────────────────────────────────────────────────

export type RoiChannel = "social" | "meta_ads" | "google_ads";
export const ROI_CHANNELS: RoiChannel[] = ["social", "meta_ads", "google_ads"];

export interface MarketingRoiConfig {
  newsletterCostCategoryIds: string[];
  socialCostCategoryIds: string[];
  /** Lower-cased lead source → the channel its leads are credited to. Unmapped sources count nowhere. */
  sourceChannels: Record<string, RoiChannel>;
  /** How long after a send an invoice still counts for the newsletter. */
  newsletterWindowDays: number;
}

export const DEFAULT_NEWSLETTER_WINDOW_DAYS = 30;

export const defaultMarketingRoiConfig = (): MarketingRoiConfig => ({
  newsletterCostCategoryIds: [],
  socialCostCategoryIds: [],
  sourceChannels: {},
  newsletterWindowDays: DEFAULT_NEWSLETTER_WINDOW_DAYS,
});

const idList = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? Array.from(new Set(raw.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim())))
    : [];

/** Same rules as `ccrm_marketing_roi_normalize()` in public/api/marketing_roi.php. */
export const normalizeMarketingRoiConfig = (raw: unknown): MarketingRoiConfig => {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const channels: Record<string, RoiChannel> = {};
  const rawChannels = src.sourceChannels;
  if (rawChannels && typeof rawChannels === "object" && !Array.isArray(rawChannels)) {
    Object.entries(rawChannels as Record<string, unknown>).forEach(([source, channel]) => {
      const key = source.trim().toLowerCase();
      if (key && ROI_CHANNELS.includes(channel as RoiChannel)) channels[key] = channel as RoiChannel;
    });
  }
  const days = Math.round(Number(src.newsletterWindowDays));
  return {
    newsletterCostCategoryIds: idList(src.newsletterCostCategoryIds),
    socialCostCategoryIds: idList(src.socialCostCategoryIds),
    sourceChannels: channels,
    newsletterWindowDays: Number.isFinite(days) && days >= 1 ? Math.min(365, days) : DEFAULT_NEWSLETTER_WINDOW_DAYS,
  };
};

export const channelOfSource = (config: MarketingRoiConfig, source: string | undefined | null): RoiChannel | null =>
  config.sourceChannels[(source || "").trim().toLowerCase()] ?? null;

export const roiPct = (revenue: number, cost: number): number | null =>
  cost > 0 ? ((revenue - cost) / cost) * 100 : null;

// ── Dates ─────────────────────────────────────────────────────────────────────

/** Inclusive `YYYY-MM-DD` bounds; null = open on that side. */
export interface Period {
  startIso: string | null;
  endIso: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export const addDaysIso = (iso: string, days: number): string => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};

export const inPeriod = (iso: string | undefined | null, period: Period): boolean => {
  const day = (iso || "").slice(0, 10);
  if (!day) return false;
  if (period.startIso && day < period.startIso) return false;
  if (period.endIso && day > period.endIso) return false;
  return true;
};

/**
 * One column per calendar month from `startIso` to `endIso`. The id is `YYYY-MM`, which is also
 * how the simplified finance table keys its cells; the first and last column are cut to the range
 * so the ledger counts only movements inside it (the simplified table only knows whole months).
 */
export const monthColumns = (startIso: string, endIso: string, todayIso: string): OverviewColumn[] => {
  if (startIso > endIso) return [];
  const cols: OverviewColumn[] = [];
  let y = Number(startIso.slice(0, 4));
  let m = Number(startIso.slice(5, 7));
  const endY = Number(endIso.slice(0, 4));
  const endM = Number(endIso.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    const first = ymd(y, m, 1);
    const last = ymd(y, m, lastDayOf(y, m));
    const colStart = first < startIso ? startIso : first;
    cols.push({ id: `${y}-${pad(m)}`, startIso: colStart, endIso: last > endIso ? endIso : last, isFuture: colStart > todayIso });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return cols;
};

// ── Finance ───────────────────────────────────────────────────────────────────

export interface FinanceInput {
  mode: "connected" | "simplified";
  records: FinancialRecord[];
  categories: FinancialCategory[];
  simplifiedTable: Record<string, string>;
  todayIso: string;
}

// A mistyped year (0202-03-01) must not turn "all time" into 20 000 month columns.
const MAX_YEARS_BACK = 25;

const earliestFinanceDay = (input: FinanceInput): string | null => {
  let min: string | null = null;
  const floor = `${Number(input.todayIso.slice(0, 4)) - MAX_YEARS_BACK}-01-01`;
  const consider = (day: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day >= floor && (min === null || day < min)) min = day;
  };
  if (input.mode === "simplified") {
    Object.keys(input.simplifiedTable).forEach((key) => {
      const col = key.slice(key.lastIndexOf(":") + 1);
      if (/^\d{4}-\d{2}$/.test(col)) consider(`${col}-01`);
    });
  } else {
    input.records.forEach((r) => {
      consider(overviewRecordDate(r));
      if (r.isRecurring && r.recurringStartDate) consider(String(r.recurringStartDate).slice(0, 10));
    });
  }
  return min;
};

/**
 * The finance matrix for the period, in the mode Finance runs in. An open start means "since the
 * first movement"; an open end means "up to the end of this month" (later months are plans).
 */
export const financeForPeriod = (input: FinanceInput, period: Period): OverviewTableAggregate | null => {
  const start = period.startIso || earliestFinanceDay(input);
  if (!start) return null;
  const [ty, tm] = [Number(input.todayIso.slice(0, 4)), Number(input.todayIso.slice(5, 7))];
  const end = period.endIso || ymd(ty, tm, lastDayOf(ty, tm));
  const columns = monthColumns(start, end, input.todayIso);
  if (columns.length === 0) return null;
  return input.mode === "simplified"
    ? aggregateSimplifiedOverviewTable(input.simplifiedTable, input.categories, columns)
    : aggregateOverviewTable(input.records, input.categories, columns, input.todayIso);
};

/** Money that actually came in (paid income), and income still expected in the period. */
export const financeRevenue = (agg: OverviewTableAggregate | null): { paid: number; expected: number } =>
  agg ? { paid: agg.totalIncomeSummary.real, expected: agg.totalIncomeSummary.estimated } : { paid: 0, expected: 0 };

/**
 * Paid cost of the chosen categories, sub-categories included. A category picked together with
 * one of its ancestors is skipped: the ancestor's row already holds it.
 */
export const categoryCost = (
  agg: OverviewTableAggregate | null,
  categories: FinancialCategory[],
  categoryIds: string[],
): number => {
  if (!agg || categoryIds.length === 0) return 0;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const chosen = new Set(categoryIds.filter((id) => byId.has(id)));
  const hasChosenAncestor = (id: string): boolean => {
    const seen = new Set<string>([id]);
    let cat = byId.get(id);
    while (cat) {
      const parentId = effectiveParentId(cat, byId);
      if (!parentId || seen.has(parentId)) return false;
      if (chosen.has(parentId)) return true;
      seen.add(parentId);
      cat = byId.get(parentId);
    }
    return false;
  };
  let sum = 0;
  chosen.forEach((id) => {
    if (!hasChosenAncestor(id)) sum += agg.rowTotals[id]?.real ?? 0;
  });
  return sum;
};

// ── Newsletter attribution ────────────────────────────────────────────────────

export interface NewsletterRecipientTouch {
  leadId: string | null;
  email: string;
  /** Local calendar day (YYYY-MM-DD, Koperniq time zone) this recipient's e-mail went out. */
  sentAt: string;
}

export interface NewsletterSend {
  id: string;
  name: string;
  /** Local day of the first delivery (YYYY-MM-DD); decides whether the campaign falls in the period. */
  sentAt: string;
  recipients: NewsletterRecipientTouch[];
}

export interface AttributionLead {
  id: string;
  clientId?: string | null;
  email?: string;
}

export interface AttributionInvoice {
  id: string;
  type: string;
  status: string;
  leadId?: string | null;
  clientId?: string | null;
  clientEmail?: string | null;
  issuedAt: string;
  totalPrice: number;
}

export interface NewsletterCampaignResult {
  id: string;
  name: string;
  sentAt: string;
  recipients: number;
  revenue: number;
  invoices: number;
}

export interface NewsletterAttribution {
  campaigns: NewsletterCampaignResult[];
  revenue: number;
  invoices: number;
  recipients: number;
}

const emailsOf = (raw: string | null | undefined): string[] =>
  (raw || "").split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));

/**
 * Credits invoices to the campaigns sent in `period`. A recipient and an invoice match on the
 * record id, on the client the record is linked to, or on an e-mail address. The invoice must be
 * issued after the send day and at most `windowDays` days later; when several campaigns reached
 * the client, the latest one before the invoice gets it.
 */
export const attributeNewsletter = (
  sends: NewsletterSend[],
  invoices: AttributionInvoice[],
  leads: AttributionLead[],
  invoiceStatuses: OfferStatusDef[] | undefined,
  windowDays: number,
  period: Period,
): NewsletterAttribution => {
  const clientOf = new Map(leads.map((l) => [l.id, l.clientId || ""]));
  const idKeys = (id: string | null | undefined): string[] => {
    if (!id) return [];
    const client = clientOf.get(id);
    return client ? [`id:${id}`, `id:${client}`] : [`id:${id}`];
  };

  // Every campaign competes for an invoice, wherever it falls; only a campaign sent in the period
  // shows up in the result. Otherwise a month view would hand an invoice to an older campaign
  // just because the newer one is outside the month, and monthly figures would add up to more
  // than the all-time one.
  // key → touches (index into `sends` + send day)
  const touches = new Map<string, { campaign: number; day: string }[]>();
  sends.forEach((send, campaign) => {
    send.recipients.forEach((r) => {
      const day = (r.sentAt || send.sentAt).slice(0, 10);
      if (!day) return;
      const keys = new Set([...idKeys(r.leadId), ...emailsOf(r.email).map((e) => `em:${e}`)]);
      keys.forEach((k) => {
        const list = touches.get(k) || [];
        list.push({ campaign, day });
        touches.set(k, list);
      });
    });
  });

  const resultOf = new Map<number, NewsletterCampaignResult>();
  sends.forEach((s, i) => {
    if (inPeriod(s.sentAt, period)) {
      resultOf.set(i, { id: s.id, name: s.name, sentAt: s.sentAt, recipients: s.recipients.length, revenue: 0, invoices: 0 });
    }
  });
  const results = Array.from(resultOf.values());

  invoices.forEach((inv) => {
    if (inv.type !== "invoice" || !isLiveInvoiceStatus(inv.status, invoiceStatuses)) return;
    const issued = (inv.issuedAt || "").slice(0, 10);
    if (!issued) return;
    const keys = new Set([
      ...idKeys(inv.leadId), ...idKeys(inv.clientId), ...emailsOf(inv.clientEmail).map((e) => `em:${e}`),
    ]);
    let best: { campaign: number; day: string } | null = null;
    keys.forEach((k) => {
      (touches.get(k) || []).forEach((t) => {
        if (issued <= t.day || issued > addDaysIso(t.day, windowDays)) return;
        if (!best || t.day > best.day) best = t;
      });
    });
    const r = best ? resultOf.get((best as { campaign: number }).campaign) : undefined;
    if (r) {
      r.revenue += Number(inv.totalPrice) || 0;
      r.invoices += 1;
    }
  });

  return {
    campaigns: results,
    revenue: results.reduce((s, r) => s + r.revenue, 0),
    invoices: results.reduce((s, r) => s + r.invoices, 0),
    recipients: results.reduce((s, r) => s + r.recipients, 0),
  };
};

// ── Lead-source channels (social, paid ads) ───────────────────────────────────

export interface ChannelLead {
  source?: string;
  status: string;
  value: number;
}

export interface ChannelResult {
  leads: number;
  won: number;
  wonValue: number;
}

/** Leads and won deals per channel. `leads` must already be pipeline leads in the period. */
export const leadsByChannel = (
  leads: ChannelLead[],
  config: MarketingRoiConfig,
  isWon: (status: string) => boolean,
): Record<RoiChannel, ChannelResult> => {
  const out = Object.fromEntries(ROI_CHANNELS.map((c) => [c, { leads: 0, won: 0, wonValue: 0 }])) as Record<RoiChannel, ChannelResult>;
  leads.forEach((l) => {
    const channel = channelOfSource(config, l.source);
    if (!channel) return;
    const bucket = out[channel];
    bucket.leads += 1;
    if (isWon(l.status)) {
      bucket.won += 1;
      bucket.wonValue += Number(l.value) || 0;
    }
  });
  return out;
};
