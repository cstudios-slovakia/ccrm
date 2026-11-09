import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { newsletterApi } from "./newsletterApi";
import { formatDate } from "./shared";
import type { ContactStatus } from "./types";

type TFn = (en: string, sk: string, hu: string) => string;

/**
 * Client profile block (docs/NEWSLETTER.md C12): campaigns the profile's addresses received and their
 * unsubscribe state. A campaign goes to every distinct address of the profile (client and member
 * leads), so all of them are asked. Not rendered without newsletter access (`enabled`) or data.
 */
export const ClientNewsletterStatus = ({
  emails,
  enabled,
  language,
  t,
}: {
  emails: (string | null | undefined)[];
  enabled: boolean;
  language: string;
  t: TFn;
}) => {
  const [status, setStatus] = useState<ContactStatus | null>(null);
  const addresses = Array.from(new Set(emails.map((e) => (e || "").trim().toLowerCase()).filter(Boolean))).slice(0, 50);
  const key = addresses.join(",");

  useEffect(() => {
    setStatus(null);
    if (!enabled || !key) return;
    let live = true;
    newsletterApi
      .contactStatus(key.split(","))
      .then((r) => live && setStatus(r))
      .catch(() => live && setStatus(null));
    return () => {
      live = false;
    };
  }, [enabled, key]);

  if (!enabled || !status) return null;
  const unsubscribed = addresses
    .map((a) => ({ address: a, at: status[a]?.unsubscribed?.at }))
    .filter((u): u is { address: string; at: string } => !!u.at);
  const seen = new Set<string>();
  const campaigns = addresses
    .flatMap((a) => status[a]?.campaigns || [])
    .sort((x, y) => (y.sentAt || "").localeCompare(x.sentAt || ""))
    .filter((c) => !seen.has(c.id) && !!seen.add(c.id))
    .slice(0, 5);
  if (unsubscribed.length === 0 && campaigns.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
      <div className="flex items-center gap-2 text-ui font-bold text-slate-700">
        <Mail className="h-4 w-4" /> {t("Newsletter", "Newsletter", "Hírlevél")}
      </div>
      {unsubscribed.map((u) => (
        <span key={u.address} className="inline-block rounded-full bg-rose-50 px-2 py-0.5 text-ui font-semibold text-rose-700">
          {t("Unsubscribed on", "Odhlásený dňa", "Leiratkozott:")} {formatDate(u.at, language)}
          {addresses.length > 1 ? ` · ${u.address}` : ""}
        </span>
      ))}
      {campaigns.length > 0 && (
        <ul className="space-y-1 text-ui text-slate-600">
          {campaigns.map((c) => (
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
