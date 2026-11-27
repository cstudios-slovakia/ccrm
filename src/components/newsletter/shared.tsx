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
  "h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-ui outline-none focus:border-entity focus:ring-1 focus:ring-entity-ring disabled:bg-gray-50 disabled:text-gray-500";
export const LABEL = "type-label text-gray-600";
export const HINT = "type-meta text-gray-500";
export const BTN_PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-entity-solid hover:bg-entity-solid-hover px-4 text-ui font-semibold text-white shadow-2xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";
export const BTN_SECONDARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-ui font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

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
  draft: "bg-gray-100 text-gray-700",
  sending: "bg-blue-50 text-blue-700",
  paused: "bg-amber-50 text-amber-700",
  sent: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-rose-50 text-rose-700",
};

/** Share of the queue that is finished (sent, failed, skipped or cancelled), 0 to 100. */
export const progressPercent = (c: Counts): number => (c.total > 0 ? Math.round(((c.total - c.queued) / c.total) * 100) : 0);

export const StatusChip = ({ status, counts, t }: { status: CampaignStatus; counts?: Counts; t: TFn }) => (
  <span className="inline-flex items-center gap-1.5" data-testid="newsletter-status" data-status={status}>
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
        : "border-gray-200 bg-gray-50 text-gray-700";
  return <div className={`rounded-lg border px-4 py-3 text-ui ${cls}`}>{children}</div>;
};

export const Loading = ({ t }: { t: TFn }) => (
  <p className="type-body py-8 text-center text-gray-500">{t("Loading…", "Načítava sa…", "Betöltés…")}</p>
);

/** True when sending can go ahead as far as the sender goes: a configured outgoing server, or demo mode (C10: demo never connects). */
export const senderReady = (settings: { senderConfigured: boolean; demo: boolean } | null | undefined): boolean =>
  !!settings && (settings.senderConfigured || settings.demo);

/** Shown instead of sending when the last edits could not be saved: the server sends what it has stored. */
export const unsavedSendLine = (t: TFn): string =>
  t(
    "Your last changes are not saved, so nothing was sent. Retry the save first.",
    "Posledné zmeny nie sú uložené, preto sa nič neodoslalo. Najprv skúste uložiť znova.",
    "Az utolsó módosítások nincsenek mentve, ezért semmi sem lett elküldve. Előbb próbálja újra a mentést.",
  );

/** The ConfirmDialog options when leaving a screen whose last save failed. */
export const unsavedLeaveOptions = (t: TFn) => ({
  title: t("Your last changes are not saved", "Posledné zmeny nie sú uložené", "Az utolsó módosítások nincsenek mentve"),
  message: t(
    "The server did not accept them. Stay and retry, or leave and lose them.",
    "Server ich neprijal. Zostaňte a skúste to znova, alebo odíďte a zmeny sa stratia.",
    "A szerver nem fogadta el őket. Maradjon és próbálja újra, vagy lépjen ki, és elvesznek.",
  ),
  confirmLabel: t("Leave without saving", "Odísť bez uloženia", "Kilépés mentés nélkül"),
  cancelLabel: t("Stay", "Zostať", "Maradok"),
  danger: true,
});
