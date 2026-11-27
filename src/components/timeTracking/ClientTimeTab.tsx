import { useMemo } from "react";
import { Building2, Clock, FolderKanban } from "lucide-react";
import { StatGrid, StatTile, Surface } from "../layout";
import { useTimeEntries } from "../../hooks/useTimeEntries";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { formatMoney } from "../../utils/currency";
import { localeCodeFor } from "../../utils/localTime";
import { clockTime, entrySeconds, formatDuration, projectColor, totalCost } from "../../utils/timeTracking.ts";
import { withoutHiddenCost } from "../../utils/timeTeam.ts";
import type { Language } from "../../utils/translations";
import type { Lead, Project, UserProfile } from "../../types";
import { entityAccentStyle } from "../../utils/entityAccent";
import { MoneyText } from "./MoneyText";
import { ProjectLabel } from "./ProjectLabel";
import { projectClientName } from "./projectClient";

interface Props {
  clientIds: string[];
  language: Language;
  currency: string;
  users: UserProfile[];
  projects: Project[];
  leads: Lead[];
}

/**
 * Client detail -> Time tab: shows every tracked entry attributed to this client
 * (via any of its projects OR directly via a client-linked task without a project).
 */
export function ClientTimeTab({ clientIds, language, currency, users, projects, leads }: Props) {
  const tt = useTimeTracking();
  const { t, viewer, nowMs } = tt;
  const filterKey = useMemo(() => [...new Set(clientIds.filter(Boolean))].join(","), [clientIds]);
  const { entries, loading } = useTimeEntries(
    filterKey
      ? {
          clientId: filterKey,
          from: "2000-01-01",
          to: "2100-01-01",
          ...(viewer.canTeam ? { userId: "all" } : {}),
        }
      : null,
  );

  const liveNow = entries.some((e) => e.running) ? nowMs : 0;
  const totalSec = useMemo(() => entries.reduce((sum, e) => sum + entrySeconds(e, liveNow), 0), [entries, liveNow]);
  const billableSec = useMemo(() => entries.reduce((sum, e) => sum + (e.billable ? entrySeconds(e, liveNow) : 0), 0), [entries, liveNow]);
  const labourCost = useMemo(
    () => (viewer.canCosts ? totalCost(entries.map((e) => withoutHiddenCost(e, tt.userId || "", viewer.canCosts))) : null),
    [entries, tt.userId, viewer.canCosts],
  );

  const byProject = useMemo(() => {
    const groups = new Map<string, { projectId: string | null; name: string; seconds: number; billableSeconds: number }>();
    for (const e of entries) {
      const key = e.projectId || "__direct__";
      const existing = groups.get(key) ?? {
        projectId: e.projectId,
        name: e.projectId
          ? projects.find((p) => p.id === e.projectId)?.name || e.projectName || t("Project", "Projekt", "Projekt")
          : t("Direct (no project)", "Priamo na klienta (bez projektu)", "Közvetlen (projekt nélkül)"),
        seconds: 0,
        billableSeconds: 0,
      };
      const sec = entrySeconds(e, liveNow);
      existing.seconds += sec;
      if (e.billable) existing.billableSeconds += sec;
      groups.set(key, existing);
    }
    return [...groups.values()].sort((a, b) => b.seconds - a.seconds);
  }, [entries, liveNow, projects, t]);

  const personOf = (uid: string) => (uid && uid !== tt.userId ? users.find((u) => u.id === uid)?.name || t("Unknown", "Neznámy", "Ismeretlen") : "");
  const dateLabel = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(localeCodeFor(language), { day: "numeric", month: "numeric", year: "numeric" });
  };

  return (
    <div style={entityAccentStyle("time-tracking") as React.CSSProperties} className="space-y-4 text-left" data-testid="client-time-tab">
      <StatGrid count={labourCost !== null ? 3 : 2}>
        <StatTile
          label={t("Tracked", "Sledované", "Rögzített")}
          value={<span className="tabular-nums">{formatDuration(totalSec)}</span>}
          delta={t(`${entries.length} ${entries.length === 1 ? "entry" : "entries"}`, `Záznamy: ${entries.length}`, `${entries.length} bejegyzés`)}
        />
        <StatTile
          label={t("Billable", "Fakturovateľné", "Számlázható")}
          value={<span className="tabular-nums">{formatDuration(billableSec)}</span>}
          delta={totalSec > 0 ? `${Math.round((billableSec / totalSec) * 100)} %` : undefined}
        />
        {labourCost !== null && (
          <StatTile
            label={t("Labour cost", "Náklady na prácu", "Munkaköltség")}
            value={<MoneyText bag={{ [currency || "EUR"]: labourCost }} language={language} />}
          />
        )}
      </StatGrid>

      {byProject.length > 0 && (
        <Surface>
          <h4 className="flex items-center gap-2 type-card-title text-gray-900">
            <FolderKanban className="size-4 text-entity-text shrink-0" />
            {t("By project", "Podľa projektu", "Projekt szerint")}
          </h4>
          <ul className="mt-3 divide-y divide-gray-100">
            {byProject.map((row) => (
              <li key={row.projectId ?? "__direct__"} className="flex items-center justify-between gap-3 py-2 text-ui">
                <span className="flex min-w-0 items-center gap-2 font-medium text-gray-800">
                  {row.projectId ? (
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: projectColor(row.projectId) }} />
                  ) : (
                    <Building2 className="size-3.5 shrink-0 text-gray-400" />
                  )}
                  <span className="truncate">{row.name}</span>
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-gray-900">{formatDuration(row.seconds)}</span>
              </li>
            ))}
          </ul>
        </Surface>
      )}

      <Surface>
        <h4 className="flex items-center gap-2 type-card-title text-gray-900">
          <Clock className="size-4 text-entity-text shrink-0" />
          {t("Time entries", "Záznamy času", "Időbejegyzések")}
        </h4>
        {loading && entries.length === 0 ? (
          <p className="mt-3 text-ui text-gray-500">{t("Loading…", "Načítava sa…", "Betöltés…")}</p>
        ) : entries.length === 0 ? (
          <p className="mt-3 rounded-lg border-2 border-dashed border-gray-200 p-4 text-center text-ui font-medium text-gray-400">
            {t("No time logged for this client yet.", "Pre tohto klienta zatiaľ nie je zaznamenaný žiadny čas.", "Ehhez az ügyfélhez még nincs rögzített idő.")}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {entries.map((e) => {
              const span = e.startAt ? `${clockTime(e.startAt)}${e.endAt ? `–${clockTime(e.endAt)}` : ""}` : "";
              const projName = e.projectId ? projects.find((p) => p.id === e.projectId)?.name || e.projectName || t("Project", "Projekt", "Projekt") : null;
              const projClient = e.projectId ? projectClientName(e.projectId, projects, leads) : null;
              return (
                <li key={e.id} data-testid="client-time-entry" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-ui">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-gray-800">{e.title || e.note || t("No description", "Bez popisu", "Nincs leírás")}</div>
                    <div className="flex flex-wrap items-center gap-2 text-caption font-medium text-gray-500 tabular-nums">
                      <span>{dateLabel(e.entryDate)}</span>
                      {span && <span>· {span}</span>}
                      {personOf(e.userId) && <span>· {personOf(e.userId)}</span>}
                      {e.projectId && projName ? (
                        <ProjectLabel projectId={e.projectId} name={projName} client={projClient} compact />
                      ) : (
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-px text-micro text-gray-600">
                          {t("Direct", "Priamo", "Közvetlen")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <span className="font-bold text-gray-700">
                      {e.running ? t("running", "beží", "fut") : formatDuration(e.durationSec, (e.durationSec ?? 0) > 0 && (e.durationSec ?? 0) < 60)}
                    </span>
                    {viewer.canCosts && e.cost != null && (
                      <div className="type-meta text-gray-400">{formatMoney(e.cost, currency, language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Surface>
    </div>
  );
}
