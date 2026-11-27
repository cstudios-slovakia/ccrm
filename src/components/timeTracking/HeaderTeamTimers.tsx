import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, RefreshCw, Users } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { fetchTeamRunning, type TeamRunningEntry } from "../../utils/timeTrackingApi.ts";
import { elapsedSeconds, formatDuration, projectColor } from "../../utils/timeTracking.ts";
import { entityAccentStyle } from "../../utils/entityAccent";
import { ClockDigits } from "./ClockDigits";
import type { TimeDeps } from "./shared";

const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("") || "?";

/**
 * Global top-bar live team tracker indicator (for users with `time_tracking_team`).
 * Shows stacked initials of everyone currently tracking time; clicking opens a popover
 * listing each person, what they are tracking, and live elapsed clocks.
 */
export function HeaderTeamTimers({ deps }: { deps?: TimeDeps | null }) {
  const { enabled, ready, viewer, running: myRunning, nowMs, t } = useTimeTracking();
  const canTeam = enabled && ready && viewer.canTeam;
  const [entries, setEntries] = useState<TeamRunningEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    if (!canTeam) return;
    setLoading(true);
    try {
      const res = await fetchTeamRunning();
      setEntries(res.running);
    } catch {
      // Ignore transient network/offline errors in background poll
    } finally {
      setLoading(false);
    }
  }, [canTeam]);

  useEffect(() => {
    if (!canTeam) {
      setEntries([]);
      setOpen(false);
      return;
    }
    void reload();
    const timer = window.setInterval(() => {
      if (!document.hidden) void reload();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [canTeam, reload, myRunning.length]);

  useEffect(() => {
    if (!open) return;
    void reload();
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, reload]);

  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of deps?.users ?? []) {
      if (u.id && u.name) map.set(String(u.id), u.name);
    }
    return map;
  }, [deps?.users]);

  const people = useMemo(() => {
    const byUser = new Map<string, { userId: string; name: string; timers: TeamRunningEntry[] }>();
    for (const entry of entries) {
      const uid = String(entry.userId || "");
      const name = (entry.userName && entry.userName.trim()) || userNameById.get(uid) || uid || t("User", "Používateľ", "Felhasználó");
      const existing = byUser.get(uid);
      if (existing) existing.timers.push(entry);
      else byUser.set(uid, { userId: uid, name, timers: [entry] });
    }
    return Array.from(byUser.values());
  }, [entries, userNameById, t]);

  if (!canTeam || people.length === 0) return null;

  const visiblePeople = people.slice(0, 4);
  const overflow = Math.max(0, people.length - visiblePeople.length);
  const tooltip = people.map((p) => p.name).join(", ");

  return (
    <div ref={wrapRef} className="relative shrink-0" style={entityAccentStyle("time-tracking") as React.CSSProperties}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="header-team-timers"
        title={tooltip}
        className={`inline-flex h-8.5 items-center gap-1.5 rounded-md border px-2 text-ui font-semibold shadow-2xs transition-colors cursor-pointer xs:h-9 sm:h-10 ${
          open
            ? "border-emerald-300 bg-emerald-100 text-emerald-900"
            : "border-emerald-200 bg-emerald-50/90 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100/80"
        }`}
      >
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none" />
        <span className="flex -space-x-1.5">
          {visiblePeople.map((person) => (
            <span
              key={person.userId}
              className="inline-flex size-6 items-center justify-center rounded-full border border-white bg-emerald-700 text-micro font-bold text-white shadow-2xs"
            >
              {initialsOf(person.name)}
            </span>
          ))}
          {overflow > 0 && (
            <span className="inline-flex size-6 items-center justify-center rounded-full border border-white bg-emerald-200 text-micro font-bold text-emerald-900">
              +{overflow}
            </span>
          )}
        </span>
        <span className="hidden text-micro font-semibold xl:inline">
          {people.length} {t("live", "sleduje", "aktív")}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("Who is tracking time", "Kto práve sleduje čas", "Ki mér éppen időt")}
          data-testid="header-team-timers-panel"
          className="absolute right-0 top-full z-[950] mt-1.5 w-80 sm:w-96 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/80 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-emerald-700" />
              <span className="text-ui font-bold text-gray-900">
                {t("Currently tracking", "Práve sledujú čas", "Jelenleg időt mérnek")}
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-micro font-bold text-emerald-800">
                {people.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void reload()}
              disabled={loading}
              aria-label={t("Refresh", "Obnoviť", "Frissítés")}
              title={t("Refresh", "Obnoviť", "Frissítés")}
              className="inline-flex size-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-200/70 hover:text-gray-900 cursor-pointer"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
            {people.map((person) => (
              <li key={person.userId} className="px-3.5 py-2.5" data-testid="header-team-timer-person">
                <div className="mb-1 flex items-center gap-2">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-micro font-bold text-emerald-800">
                    {initialsOf(person.name)}
                  </span>
                  <span className="truncate text-ui font-semibold text-gray-900">{person.name}</span>
                </div>
                <div className="grid gap-1.5 pl-8">
                  {person.timers.map((timer) => {
                    const sub = [timer.projectName, timer.clientName].filter(Boolean).join(" · ");
                    return (
                      <div key={timer.id} className="flex items-start justify-between gap-2 rounded-md bg-gray-50 px-2.5 py-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: timer.projectId ? projectColor(timer.projectId) : "#10b981" }}
                            />
                            <span className="truncate text-micro font-semibold text-gray-900">
                              {timer.title || t("Untitled timer", "Časovač bez názvu", "Névtelen időzítő")}
                            </span>
                          </div>
                          {sub && <span className="block truncate pl-3.5 text-micro text-gray-500">{sub}</span>}
                        </div>
                        <ClockDigits
                          value={formatDuration(elapsedSeconds(timer.startAt, nowMs), true)}
                          className="shrink-0 text-micro font-bold text-emerald-700"
                        />
                      </div>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>

          <div className="border-t border-gray-100 bg-gray-50/60 px-3.5 py-2 text-right">
            <a
              href="#time-tracking"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-micro font-semibold text-entity-text hover:underline"
            >
              {t("Open Time tracking", "Otvoriť Evidenciu času", "Időkövetés megnyitása")}
              <ArrowRight className="size-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
