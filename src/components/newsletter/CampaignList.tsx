import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, Plus, Search } from "lucide-react";
import { EmptyState, Surface, Toolbar } from "../layout";
import { CustomSelect } from "../ui/CustomSelect";
import { audienceLabel, normalizeAudience } from "./audience";
import { newsletterApi, newsletterErrorMessage } from "./newsletterApi";
import type { CampaignStatus, CampaignSummary } from "./types";
import {
  BTN_PRIMARY,
  FIELD,
  Loading,
  Notice,
  StatusChip,
  formatDate,
  statusLabel,
  type NewsletterEnv,
} from "./shared";

/** C12 list, Campaigns tab. */
export const CampaignList = ({ env, onCreate, creating }: { env: NewsletterEnv; onCreate: () => void; creating: boolean }) => {
  const { t, language, navigate, canEdit } = env;
  const [rows, setRows] = useState<CampaignSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | CampaignStatus>("");

  const load = useCallback(() => {
    setError(null);
    newsletterApi
      .list()
      .then(setRows)
      .catch((e) => setError(newsletterErrorMessage(e, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(load, [load]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (c) => (!status || c.status === status) && (!needle || c.name.toLowerCase().includes(needle) || c.subject.toLowerCase().includes(needle)),
    );
  }, [rows, q, status]);

  if (error) {
    return (
      <div className="grid gap-3">
        <Notice tone="error">{error}</Notice>
        <button type="button" onClick={load} className="w-fit type-label text-indigo-600 cursor-pointer">
          {t("Try again", "Skúsiť znova", "Újra")}
        </button>
      </div>
    );
  }
  if (!rows) return <Loading t={t} />;

  const newButton = canEdit ? (
    <button type="button" onClick={onCreate} disabled={creating} className={BTN_PRIMARY} >
      <Plus className="size-4" />
      {t("New campaign", "Nová kampaň", "Új kampány")}
    </button>
  ) : undefined;

  if (rows.length === 0) {
    return (
      <Surface>
        <EmptyState
          icon={<Mail />}
          title={t("No campaigns yet", "Zatiaľ žiadne kampane", "Még nincs kampány")}
          body={t(
            "Write an e-mail once and send it to your clients.",
            "Napíšte e-mail raz a pošlite ho svojim klientom.",
            "Írjon meg egy e-mailt egyszer, és küldje el az ügyfeleinek.",
          )}
          action={newButton}
        />
      </Surface>
    );
  }

  return (
    <div className="grid gap-4">
      <Toolbar
        search={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("Search name or subject", "Hľadať názov alebo predmet", "Keresés névre vagy tárgyra")}
              className={`${FIELD} pl-9`}
            />
          </div>
        }
        filters={
          <CustomSelect
            value={status}
            onChange={(v) => setStatus(v as "" | CampaignStatus)}
            options={[
              { value: "", label: t("All statuses", "Všetky stavy", "Minden állapot") },
              ...(["draft", "sending", "paused", "sent", "cancelled"] as CampaignStatus[]).map((s) => ({ value: s, label: statusLabel(s, t) })),
            ]}
          />
        }
      />
      {shown.length === 0 ? (
        <p className="type-body py-8 text-center text-slate-500">{t("No campaign matches.", "Žiadna kampaň nevyhovuje.", "Egy kampány sem felel meg.")}</p>
      ) : (
        <Surface padding="none" className="overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {shown.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => navigate(`newsletter/${c.id}`)}
                  data-testid="newsletter-row"
                  className="grid w-full gap-2 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 cursor-pointer ws-md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_8rem_9rem] ws-md:items-center ws-md:gap-4 ws-sm:px-6"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-ui font-semibold text-slate-900">{c.name}</span>
                    <span className="block truncate type-meta text-slate-500">{c.subject || t("No subject", "Bez predmetu", "Nincs tárgy")}</span>
                  </span>
                  <span className="min-w-0 type-meta text-slate-600">
                    <span className="block truncate">{audienceLabel(normalizeAudience(c.audience), t)}</span>
                    {c.status !== "draft" && (
                      <span className="block truncate text-slate-500">
                        {t(`${c.counts.total} recipients`, `${c.counts.total} príjemcov`, `${c.counts.total} címzett`)}
                        {" · "}
                        {t(`${c.counts.sent} sent`, `${c.counts.sent} odoslaných`, `${c.counts.sent} elküldve`)}
                        {c.counts.failed > 0 && ` · ${t(`${c.counts.failed} failed`, `${c.counts.failed} zlyhalo`, `${c.counts.failed} sikertelen`)}`}
                      </span>
                    )}
                  </span>
                  <span>
                    <StatusChip status={c.status} counts={c.counts} t={t} />
                  </span>
                  <span className="type-meta text-slate-500">
                    {formatDate(c.status === "draft" ? c.updatedAt : c.finishedAt || c.startedAt || c.updatedAt, language)}
                    {c.createdBy && <span className="block truncate">{c.createdBy}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
};
