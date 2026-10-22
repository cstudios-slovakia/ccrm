import React from "react";
import { ScrollText, RefreshCw, Download, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { Language } from "../utils/translations";
import { formatTimestampLocalized } from "../utils/localTime";

interface AuditEntry {
  id: number | string;
  created_at: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  detail: string | null;
  ip: string | null;
}

interface AuditLogSettingsProps {
  language: Language;
}

const PER_PAGE = 50;

/** Filter presets: the value is the action prefix `api/audit_log.php` matches. */
const ACTION_GROUPS: { value: string; en: string; sk: string; hu: string }[] = [
  { value: "", en: "All events", sk: "Všetky udalosti", hu: "Minden esemény" },
  { value: "auth.", en: "Sign-ins & lockouts", sk: "Prihlásenia a zámky", hu: "Belépések és zárolások" },
  { value: "user.", en: "Users & roles", sk: "Používatelia a roly", hu: "Felhasználók és szerepkörök" },
  { value: "passkey.", en: "Passkeys", sk: "Passkeys", hu: "Passkey-ek" },
  { value: "password.", en: "Passwords", sk: "Heslá", hu: "Jelszavak" },
  { value: "generate_mcp_key", en: "MCP keys (created)", sk: "MCP kľúče (vytvorenie)", hu: "MCP kulcsok (létrehozás)" },
  { value: "revoke_mcp_key", en: "MCP keys (revoked)", sk: "MCP kľúče (zrušenie)", hu: "MCP kulcsok (visszavonás)" },
  { value: "license.", en: "Licence", sk: "Licencia", hu: "Licenc" },
  { value: "error_logs.", en: "Error logs", sk: "Chybové záznamy", hu: "Hibanaplók" },
];

/** Security-relevant actions get a stronger chip so they stand out in a long list. */
const isAlertAction = (action: string) =>
  /^(auth\.(lockout|login_failed|2fa_failed)|user\.(role_change|delete)|generate_mcp_key|api_key\.reset|error_logs\.clear)/.test(action);

/**
 * Settings → Audit log.
 *
 * Read-only view over `GET /api/audit_log.php` (administrators only on the
 * server too). Nothing here can edit or delete a row.
 */
export const AuditLogSettings: React.FC<AuditLogSettingsProps> = ({ language }) => {
  const t = (en: string, sk: string, hu: string) => (language === "sk" ? sk : language === "hu" ? hu : en);

  const [entries, setEntries] = React.useState<AuditEntry[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [action, setAction] = React.useState("");
  const [actor, setActor] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);

  const query = React.useCallback(
    (extra: Record<string, string>) => {
      const params = new URLSearchParams({ ...extra });
      if (action) params.set("action", action);
      if (actor.trim()) params.set("actor", actor.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return params.toString();
    },
    [action, actor, from, to]
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/audit_log.php?${query({ page: String(page), per_page: String(PER_PAGE) })}`, {
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "request failed");
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    } catch {
      setError(true);
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  React.useEffect(() => {
    load();
  }, [load]);

  // A changed filter starts again from the first page.
  React.useEffect(() => {
    setPage(1);
  }, [action, actor, from, to]);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-ui font-medium text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all";

  return (
    <div className="ws-lg:col-span-12 space-y-6">
      <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass text-left">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <h3 className="text-body font-heading font-bold text-slate-900 flex items-center gap-2">
            <ScrollText className="h-4.5 w-4.5 text-indigo-600" /> {t("Audit log", "Auditný záznam", "Audit napló")}
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={load}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl type-overline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" /> {t("Refresh", "Obnoviť", "Frissítés")}
            </button>
            <a
              href={`/api/audit_log.php?${query({ format: "csv" })}`}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl type-overline flex items-center gap-1 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </a>
          </div>
        </div>

        <p className="text-ui text-slate-500 font-medium max-w-3xl">
          {t(
            "Who signed in, changed roles, created keys or cleared logs. Entries are append-only: nothing here can be edited or deleted. Administrators are notified by push when roles change, users are removed, MCP keys are created or logins are locked out.",
            "Kto sa prihlásil, zmenil roly, vytvoril kľúče alebo vymazal záznamy. Záznamy sa iba pridávajú: nič tu nemožno upraviť ani zmazať. Administrátori dostanú push upozornenie pri zmene rolí, odstránení používateľa, vytvorení MCP kľúča alebo zámku prihlásenia.",
            "Ki lépett be, ki módosított szerepköröket, hozott létre kulcsot vagy törölt naplót. A bejegyzések csak bővülnek: itt semmi sem szerkeszthető vagy törölhető. Az adminisztrátorok push értesítést kapnak szerepkörváltásról, felhasználó törléséről, MCP kulcs létrehozásáról vagy bejelentkezési zárolásról."
          )}
        </p>

        <div className="grid grid-cols-1 ws-md:grid-cols-4 gap-3">
          <label className="space-y-1">
            <span className="type-overline text-slate-400 block">{t("Event", "Udalosť", "Esemény")}</span>
            <select value={action} onChange={(e) => setAction(e.target.value)} className={inputClass}>
              {ACTION_GROUPS.map((g) => (
                <option key={g.value || "all"} value={g.value}>
                  {t(g.en, g.sk, g.hu)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="type-overline text-slate-400 block">{t("User (e-mail)", "Používateľ (e-mail)", "Felhasználó (e-mail)")}</span>
            <input value={actor} onChange={(e) => setActor(e.target.value)} className={inputClass} placeholder="anna@" />
          </label>
          <label className="space-y-1">
            <span className="type-overline text-slate-400 block">{t("From", "Od", "Ettől")}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </label>
          <label className="space-y-1">
            <span className="type-overline text-slate-400 block">{t("To", "Do", "Eddig")}</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </label>
        </div>

        {loading && entries.length === 0 ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-rose-600 font-bold text-ui">
            {t("Could not load the audit log.", "Audit log sa nepodarilo načítať.", "Az audit naplót nem sikerült betölteni.")}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-slate-500 font-bold text-ui">
            {t("No matching events.", "Žiadne zodpovedajúce udalosti.", "Nincs egyező esemény.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-ui border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 type-overline">
                  <th className="py-3 px-4">{t("Time", "Čas", "Idő")}</th>
                  <th className="py-3 px-4">{t("User", "Používateľ", "Felhasználó")}</th>
                  <th className="py-3 px-4">{t("Event", "Udalosť", "Esemény")}</th>
                  <th className="py-3 px-4">{t("Detail", "Detail", "Részletek")}</th>
                  <th className="py-3 px-4">IP</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 align-top font-medium text-slate-700">
                    <td className="py-3 px-4 font-mono text-micro whitespace-nowrap text-slate-500">
                      {formatTimestampLocalized(row.created_at, language)}
                    </td>
                    <td className="py-3 px-4 break-all">{row.actor_email || "—"}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-md type-overline ${
                          isAlertAction(row.action) ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-700"
                        }`}
                      >
                        {row.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 break-words max-w-md">{row.detail || "—"}</td>
                    <td className="py-3 px-4 font-mono text-micro whitespace-nowrap text-slate-500">{row.ip || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between text-ui text-slate-500 font-bold">
          <span>
            {total} {t("events", "udalostí", "esemény")}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              aria-label={t("Previous page", "Predchádzajúca strana", "Előző oldal")}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>
              {page} / {pages}
            </span>
            <button
              type="button"
              disabled={page >= pages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              aria-label={t("Next page", "Ďalšia strana", "Következő oldal")}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
