import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { EmptyState, Surface } from "../layout";
import { CustomSelect } from "../ui/CustomSelect";
import { newsletterApi, newsletterErrorMessage } from "./newsletterApi";
import type { RecipientRow } from "./types";
import { BTN_SECONDARY, FIELD, Loading, Notice, formatDate, useDebounced, type NewsletterEnv } from "./shared";

const PAGE = 50;

const STATUSES = ["queued", "sent", "failed", "skipped", "cancelled"] as const;

const recipientStatusLabel = (s: string, t: NewsletterEnv["t"]): string => {
  switch (s) {
    case "queued":
      return t("Queued", "Čaká", "Várakozik");
    case "sent":
      return t("Sent", "Odoslané", "Elküldve");
    case "failed":
      return t("Failed", "Zlyhalo", "Sikertelen");
    case "skipped":
      return t("Skipped", "Preskočené", "Kihagyva");
    case "cancelled":
      return t("Cancelled", "Zrušené", "Megszakítva");
    default:
      return s;
  }
};

const skipLabel = (r: string | null, t: NewsletterEnv["t"]): string => {
  if (r === "unsubscribed") return t("Unsubscribed", "Odhlásený", "Leiratkozott");
  if (r === "invalid") return t("Invalid address", "Neplatná adresa", "Érvénytelen cím");
  return r || "";
};

const sourceLabel = (s: RecipientRow["source"], t: NewsletterEnv["t"]): string =>
  s === "client"
    ? t("Client", "Klient", "Ügyfél")
    : s === "lead"
      ? t("Lead", "Lead", "Lead")
      : s === "employee"
        ? t("Employee", "Zamestnanec", "Munkatárs")
        : t("Extra address", "Ďalšia adresa", "További cím");

const STATUS_TONE: Record<string, string> = {
  sent: "bg-emerald-50 text-emerald-700",
  failed: "bg-rose-50 text-rose-700",
  queued: "bg-blue-50 text-blue-700",
  skipped: "bg-amber-50 text-amber-700",
  cancelled: "bg-slate-100 text-slate-600",
};

/** The recipients of a started campaign: 50 per page, status filter, search (C12). */
export const RecipientsTable = ({ id, env, refreshKey }: { id: string; env: NewsletterEnv; refreshKey: string }) => {
  const { t, language } = env;
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 350);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ rows: RecipientRow[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setOffset(0), [dq, status]);

  const load = useCallback(() => {
    let cancelled = false;
    newsletterApi
      .recipients({ id, status: status || undefined, q: dq || undefined, offset, limit: PAGE })
      .then((r) => {
        if (cancelled) return;
        setError(null);
        setData(r);
      })
      .catch((e) => !cancelled && setError(newsletterErrorMessage(e, t)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, status, dq, offset, refreshKey]);
  useEffect(load, [load]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Search address, name, source", "Hľadať adresu, meno, zdroj", "Cím, név, forrás keresése")}
            className={`${FIELD} pl-9`}
            data-testid="newsletter-recipients-search"
          />
        </div>
        <div className="w-48">
          <CustomSelect
            value={status}
            onChange={setStatus}
            options={[{ value: "", label: t("All statuses", "Všetky stavy", "Minden állapot") }, ...STATUSES.map((s) => ({ value: s, label: recipientStatusLabel(s, t) }))]}
          />
        </div>
      </div>

      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : !data ? (
        <Loading t={t} />
      ) : data.rows.length === 0 ? (
        <Surface>
          <EmptyState title={t("No recipients match", "Žiadny príjemca nevyhovuje", "Egy címzett sem felel meg")} />
        </Surface>
      ) : (
        <Surface padding="none" className="overflow-x-auto">
          <table className="w-full min-w-200 text-left text-ui">
            <thead>
              <tr className="border-b border-slate-100 type-overline text-slate-500">
                <th className="px-4 py-3 font-semibold">{t("Address", "Adresa", "Cím")}</th>
                <th className="px-4 py-3 font-semibold">{t("Name", "Meno", "Név")}</th>
                <th className="px-4 py-3 font-semibold">{t("Source", "Zdroj", "Forrás")}</th>
                <th className="px-4 py-3 font-semibold">{t("Status", "Stav", "Állapot")}</th>
                <th className="px-4 py-3 font-semibold">{t("Sent at", "Odoslané", "Elküldve")}</th>
                <th className="px-4 py-3 font-semibold">{t("Error", "Chyba", "Hiba")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{r.email}</td>
                  <td className="px-4 py-3 text-slate-700">{r.name || "-"}</td>
                  <td className="px-4 py-3 text-slate-700">{sourceLabel(r.source, t)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 type-overline ${STATUS_TONE[r.status] ?? "bg-slate-100 text-slate-600"}`}>{recipientStatusLabel(r.status, t)}</span>
                    {r.unsubscribedAt && <span className="ml-2 type-meta text-slate-500">{t("unsubscribed", "odhlásený", "leiratkozott")}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(r.sentAt, language) || "-"}</td>
                  <td className="max-w-xs break-words px-4 py-3 text-slate-500">{r.error || skipLabel(r.skipReason, t) || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.total > PAGE && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 type-meta text-slate-500">
              <span>
                {offset + 1}-{Math.min(offset + PAGE, data.total)} / {data.total}
              </span>
              <span className="flex gap-2">
                <button type="button" className={BTN_SECONDARY} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                  {t("Previous", "Predošlé", "Előző")}
                </button>
                <button type="button" className={BTN_SECONDARY} disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>
                  {t("Next", "Ďalšie", "Következő")}
                </button>
              </span>
            </div>
          )}
        </Surface>
      )}
    </div>
  );
};
