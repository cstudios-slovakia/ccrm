import { useEffect, useMemo, useRef, useState } from "react";
import { Inbox, X } from "lucide-react";
import { Surface } from "../layout";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { clockTime, formatDuration, projectColor } from "../../utils/timeTracking.ts";
import { TimeApiError, timeErrorMessage } from "../../utils/timeTrackingApi.ts";
import { assignUnsorted, dismissUnsorted, loadUnsorted, type UnsortedItem } from "../../utils/timeTrackerApi.ts";
import { ProjectPicker } from "./ProjectPicker";
import type { TimeDeps } from "./shared";

/** List chip. Renders nothing until there is at least one unsorted item. */
/** Fired after the inbox loaded, assigned or dismissed items, so the toolbar chip recounts. */
export const UNSORTED_CHANGED_EVENT = "ccrm-unsorted-changed";

export function UnsortedListChip({ refreshKey }: { refreshKey?: string }) {
  const { t } = useTimeTracking();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let gone = false;
    const load = () => {
      void loadUnsorted()
        .then((res) => {
          if (!gone) setCount(res.count);
        })
        .catch(() => {
          if (!gone) setCount(0);
        });
    };
    load();
    const onFocus = () => load();
    window.addEventListener(UNSORTED_CHANGED_EVENT, onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener(UNSORTED_CHANGED_EVENT, onFocus);
    };
  }, [refreshKey]);

  if (!count) return null;
  return (
    <button
      type="button"
      data-testid="unsorted-chip"
      onClick={() => {
        sessionStorage.setItem("ccrm-focus-unsorted", "1");
        window.location.hash = "#time-tracking/day";
      }}
      className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-ui font-bold text-amber-800 transition-all hover:bg-amber-100 active:scale-95 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
    >
      <Inbox className="size-4" aria-hidden />
      {t("Unsorted", "Nezaradené", "Rendezetlen")} · {count}
    </button>
  );
}

/**
 * Personal Unsorted inbox. On a wide day view it sits in a second column;
 * on a narrow one it stays under the log.
 */
export function UnsortedInbox({ deps }: { deps: TimeDeps }) {
  const tt = useTimeTracking();
  const { t } = tt;
  const ref = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<UnsortedItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [projectId, setProjectId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const res = await loadUnsorted();
      setItems(res.items);
      window.dispatchEvent(new Event(UNSORTED_CHANGED_EVENT));
      setSelected(new Set());
    } catch (e) {
      window.showToast?.(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const apply = () => {
      const wide = parent.clientWidth >= 960;
      const others = [...parent.children].filter((child) => child !== el) as HTMLElement[];
      if (!wide) {
        parent.style.gridTemplateColumns = "";
        el.style.gridColumn = "";
        el.style.gridRow = "";
        el.style.alignSelf = "";
        for (const child of others) child.style.gridColumn = "";
        return;
      }
      parent.style.gridTemplateColumns = "minmax(0, 1fr) 20rem";
      el.style.gridColumn = "2";
      el.style.gridRow = "1 / span 12";
      el.style.alignSelf = "start";
      for (const child of others) child.style.gridColumn = "1";
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(parent);
    if (sessionStorage.getItem("ccrm-focus-unsorted") === "1") {
      sessionStorage.removeItem("ccrm-focus-unsorted");
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    return () => {
      observer.disconnect();
      parent.style.gridTemplateColumns = "";
      el.style.gridColumn = "";
      el.style.gridRow = "";
      el.style.alignSelf = "";
      for (const child of [...parent.children]) {
        if (child !== el) (child as HTMLElement).style.gridColumn = "";
      }
    };
  }, []);

  const chosen = useMemo(() => items.filter((item) => selected.has(item.id)), [items, selected]);
  const sharedSuggestion = chosen.length > 0 && chosen.every((item) => item.suggestedProjectId && item.suggestedProjectId === chosen[0].suggestedProjectId)
    ? chosen[0].suggestedProjectId
    : null;

  const assign = async (ids: string[], project: string | null) => {
    if (!project) {
      tt.notify(t("Pick a project first.", "Najprv vyberte projekt.", "Először válasszon projektet."), "warning");
      return;
    }
    setBusy(true);
    try {
      await assignUnsorted(ids, project);
      tt.bump();
      await reload();
      window.showToast?.(t("Assigned to the project.", "Priradené k projektu.", "Hozzárendelve a projekthez."));
    } catch (e) {
      window.showToast?.(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async (ids: string[]) => {
    setBusy(true);
    try {
      await dismissUnsorted(ids);
      await reload();
    } catch (e) {
      window.showToast?.(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} id="unsorted-inbox" data-testid="unsorted-inbox">
      <Surface className="grid gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600" aria-hidden>
              <Inbox className="size-4" />
            </span>
            <h3 className="type-card-title text-gray-900">{t("Unsorted", "Nezaradené", "Rendezetlen")}</h3>
            <span className="ml-auto inline-flex size-6 items-center justify-center rounded-full bg-amber-500 text-micro font-bold text-white tabular-nums" data-testid="unsorted-count">{items.length}</span>
          </div>
          <p className="mt-2 type-meta text-gray-500">{t("Captured by your Chrome extension while no timer was running. Only you see these. Assign one to turn it into a time entry.", "Zachytené vaším rozšírením pre Chrome, kým nebežal časovač. Vidíte ich len vy. Priraďte záznam k projektu a vznikne z neho časový záznam.", "A Chrome-bővítmény rögzítette, amíg nem futott időzítő. Csak Ön látja őket. Rendeljen hozzá egy projektet, és időbejegyzés lesz belőle.")}</p>
        </div>
        {items.length === 0 ? (
          <p className="text-body text-gray-500">{t("Nothing waiting.", "Nič nečaká.", "Nincs várakozó elem.")}</p>
        ) : (
          <>
            {selected.size > 0 && (
              <div className="grid gap-2 rounded-md bg-gray-50 p-2">
                <ProjectPicker
                  projects={deps.projects}
                  leads={deps.leads}
                  projectTypes={deps.projectTypes}
                  value={projectId ?? sharedSuggestion}
                  onChange={setProjectId}
                  t={t}
                  disabled={!deps.canPickProject}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void assign([...selected], projectId ?? sharedSuggestion)}
                  className="h-9 rounded-md bg-entity-solid text-ui font-semibold text-white transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                >
                  {t("Assign selected", "Priradiť vybrané", "Kijelöltek hozzárendelése")} · {selected.size}
                </button>
              </div>
            )}
            <ul className="grid gap-2">
              {items.map((item) => {
                const title = item.pageTitle || item.domain;
                const project = item.suggestedProjectId;
                const color = projectColor(project);
                const range = item.startedAt ? `${clockTime(item.startedAt)}${item.endedAt ? `–${clockTime(item.endedAt)}` : ""}` : "";
                return (
                  <li key={item.id} className="grid gap-2 rounded-md border border-gray-200 bg-card p-3" data-testid="unsorted-item">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={(e) => {
                          setSelected((curr) => {
                            const next = new Set(curr);
                            if (e.target.checked) next.add(item.id);
                            else next.delete(item.id);
                            return next;
                          });
                        }}
                        aria-label={title}
                        className="mt-1 size-4 accent-[var(--entity-accent-solid)]"
                      />
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-ui font-bold text-gray-600">
                        {(item.domain[0] || "?").toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-ui font-semibold text-gray-900">{title}</p>
                        <p className="type-meta text-gray-500">
                          {item.domain}
                          {range ? ` · ${range}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-ui font-semibold tabular-nums text-gray-900">{formatDuration(item.durationSec)}</span>
                      <button
                        type="button"
                        aria-label={t("Dismiss", "Zahodiť", "Elvetés")}
                        disabled={busy}
                        onClick={() => void dismiss([item.id])}
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {item.suggestedProjectName ? (
                        <span
                          className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-micro font-semibold"
                          style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`, color: `color-mix(in oklab, color-mix(in srgb, ${color} 72%, black), var(--accent-lift-color) var(--accent-lift-amount))` }}
                        >
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                          <span className="truncate">{item.suggestedProjectName}</span>
                        </span>
                      ) : (
                        <span className="rounded-full border border-dashed border-amber-400 bg-amber-50 px-2.5 py-0.5 text-micro font-semibold text-amber-700">{t("No suggestion — pick a project", "Žiadny návrh — vyberte projekt", "Nincs javaslat — válasszon projektet")}</span>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void assign([item.id], project)}
                        className="h-8 rounded-lg bg-entity-solid px-3 text-ui font-semibold text-white transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                      >
                        {t("Assign", "Priradiť", "Hozzárendelés")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <a
          href="#settings/projects/time"
          data-testid="unsorted-extension-link"
          className="w-fit text-ui font-semibold text-gray-600 hover:text-gray-900 hover:underline"
        >
          {t("Chrome extension settings", "Nastavenia rozšírenia pre Chrome", "Chrome-bővítmény beállításai")} →
        </a>
      </Surface>
    </div>
  );
}
