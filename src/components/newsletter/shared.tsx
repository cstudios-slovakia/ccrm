import { useEffect, useState, type ReactNode } from "react";
import type { ClientCategory, Lead } from "../../types";
import type { TFn } from "../../utils/timeTracking";
import type { CompanyInfo } from "./builder";
import type { CampaignStatus, Counts } from "./types";

/** What every Newsletter screen gets from the module root. */
export interface NewsletterEnv {
  language: string;
  t: TFn;
  /** `newsletter` at edit: create, change, delete campaigns and the unsubscribe list. */
  canEdit: boolean;
  /** `newsletter_send`: tests, start, pause, resume, cancel (wired by package 2B). */
  canSend: boolean;
  navigate: (route: string) => void;
  /** Name, address and logo of the company profile: the default header and footer are built from them. */
  company: CompanyInfo;
}

/** Records the audience editor chooses from; all of it comes from the app state, not from the newsletter API. */
export interface NewsletterData {
  leads: Lead[];
  clientCategories: ClientCategory[];
  /** Pipeline status names, in pipeline order. */
  leadStates: string[];
  /** Interest category names (`lead.categories`). */
  leadCategories: string[];
  userEmail: string;
}

export const FIELD =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-ui outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 disabled:bg-slate-50 disabled:text-slate-500";
export const LABEL = "type-label text-slate-600";
export const HINT = "type-meta text-slate-500";
export const BTN_PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-ui font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";
export const BTN_SECONDARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-ui font-semibold text-slate-700 transition-all hover:border-slate-300 hover:text-slate-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

export const useDebounced = <T,>(value: T, ms: number): T => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
};

export const statusLabel = (status: CampaignStatus, t: TFn): string => {
  switch (status) {
    case "draft":
      return t("Draft", "Koncept", "Piszkozat");
    case "sending":
      return t("Sending", "Odosiela sa", "Küldés");
    case "paused":
      return t("Paused", "Pozastavená", "Szüneteltetve");
    case "sent":
      return t("Sent", "Odoslaná", "Elküldve");
    case "cancelled":
      return t("Cancelled", "Zrušená", "Megszakítva");
  }
};

const STATUS_TONE: Record<CampaignStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  sending: "bg-blue-50 text-blue-700",
  paused: "bg-amber-50 text-amber-700",
  sent: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-rose-50 text-rose-700",
};

/** Share of the queue that is finished (sent, failed, skipped or cancelled), 0 to 100. */
export const progressPercent = (c: Counts): number => (c.total > 0 ? Math.round(((c.total - c.queued) / c.total) * 100) : 0);

export const StatusChip = ({ status, counts, t }: { status: CampaignStatus; counts?: Counts; t: TFn }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 type-overline ${STATUS_TONE[status]}`}>
      {statusLabel(status, t)}
      {status === "sending" && counts ? ` ${progressPercent(counts)} %` : ""}
    </span>
    {status === "sent" && counts && counts.failed > 0 && (
      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 type-overline text-rose-700">
        {t(`${counts.failed} failed`, `${counts.failed} zlyhalo`, `${counts.failed} sikertelen`)}
      </span>
    )}
  </span>
);

export const formatDate = (iso: string | null | undefined, language: string): string => {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(language === "sk" ? "sk-SK" : language === "hu" ? "hu-HU" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const Notice = ({ tone, children }: { tone: "error" | "warning" | "info"; children: ReactNode }) => {
  const cls =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-700";
  return <div className={`rounded-2xl border px-4 py-3 text-ui ${cls}`}>{children}</div>;
};

export const Loading = ({ t }: { t: TFn }) => (
  <p className="type-body py-8 text-center text-slate-500">{t("Loading…", "Načítava sa…", "Betöltés…")}</p>
);
