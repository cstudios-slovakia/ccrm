import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { newsletterApi } from "./newsletterApi";
import { formatDate } from "./shared";
import type { ContactStatus } from "./types";

type TFn = (en: string, sk: string, hu: string) => string;

/** Client profile block (docs/NEWSLETTER.md C12): campaigns the address received and its unsubscribe state. Hidden without newsletter access or data. */
export const ClientNewsletterStatus = ({ email, language, t }: { email?: string | null; language: string; t: TFn }) => {
  const [status, setStatus] = useState<ContactStatus[string] | null>(null);
  const address = (email || "").trim().toLowerCase();

  useEffect(() => {
    setStatus(null);
    if (!address) return;
    let live = true;
    newsletterApi
      .contactStatus([address])
      .then((r) => live && setStatus(r[address] || null))
      .catch(() => live && setStatus(null));
    return () => {
      live = false;
    };
  }, [address]);

  if (!status || (!status.unsubscribed && status.campaigns.length === 0)) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
      <div className="flex items-center gap-2 text-ui font-bold text-slate-700">
        <Mail className="h-4 w-4" /> {t("Newsletter", "Newsletter", "Hírlevél")}
        {status.unsubscribed && (
          <span className="ml-auto rounded-full bg-rose-50 px-2 py-0.5 text-ui font-semibold text-rose-700">
            {t("Unsubscribed on", "Odhlásený dňa", "Leiratkozott:")} {formatDate(status.unsubscribed.at, language)}
          </span>
        )}
      </div>
      {status.campaigns.length > 0 && (
        <ul className="space-y-1 text-ui text-slate-600">
          {status.campaigns.map((c) => (
            <li key={c.id} className="flex justify-between gap-3">
              <span className="truncate">{c.name}</span>
              <span className="shrink-0 text-slate-400">{formatDate(c.sentAt, language)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
