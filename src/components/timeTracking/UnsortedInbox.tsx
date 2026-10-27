import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Surface } from "../layout";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { clockTime, formatDuration } from "../../utils/timeTracking.ts";
import { TimeApiError, timeErrorMessage } from "../../utils/timeTrackingApi.ts";
import { assignUnsorted, dismissUnsorted, loadUnsorted, type UnsortedItem } from "../../utils/timeTrackerApi.ts";
import { ProjectPicker } from "./ProjectPicker";
import type { TimeDeps } from "./shared";

/** List chip. Renders nothing until there is at least one unsorted item. */
export function UnsortedListChip() {
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
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  if (!count) return null;
  return (
    <button
      type="button"
      data-testid="unsorted-chip"
      onClick={() => {
        sessionStorage.setItem("ccrm-focus-unsorted", "1");
        window.location.hash = "#time-tracking/day";
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-amber-50 px-3 text-ui font-semibold text-amber-900 ring-1 ring-amber-200 transition-all hover:bg-amber-100 active:scale-95 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
    >
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
      <Surface className="grid gap-3 border border-amber-200 bg-amber-50/60">
        <div>
          <h3 className="type-card-title text-amber-950">{t("Unsorted", "Nezaradené", "Rendezetlen")}</h3>
          <p className="type-meta text-amber-800">{t("Sites you visited while no timer was running. Only the domain, the page title and the times are kept.", "Stránky, ktoré ste navštívili, kým nebežal časovač. Uchováva sa len doména, názov stránky a časy.", "Oldalak, amiket időzítő nélkül nézett. Csak a domain, az oldal címe és az idők maradnak meg.")}</p>
        </div>
        {items.length === 0 ? (
          <p className="text-body text-amber-800/80">{t("Nothing waiting.", "Nič nečaká.", "Nincs várakozó elem.")}</p>
        ) : (
          <>
            {selected.size > 0 && (
              <div className="grid gap-2 rounded-xl bg-white p-2">
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
                  className="h-9 rounded-xl bg-amber-600 text-ui font-semibold text-white transition-all hover:bg-amber-700 active:scale-95 disabled:opacity-60 cursor-pointer"
                >
                  {t("Assign selected", "Priradiť vybrané", "Kijelöltek hozzárendelése")} · {selected.size}
                </button>
              </div>
            )}
            <ul className="grid gap-2">
              {items.map((item) => {
                const title = item.pageTitle || item.domain;
                const project = item.suggestedProjectId;
                return (
                  <li key={item.id} className="grid gap-2 rounded-xl border border-amber-100 bg-white p-3" data-testid="unsorted-item">
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
                        className="mt-1 size-4 accent-amber-600"
                      />
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-ui font-bold text-amber-800">
                        {(item.domain[0] || "?").toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-ui font-semibold text-slate-900">{title}</p>
                        <p className="type-meta text-slate-500">
                          {item.domain}
                          {item.startedAt ? ` · ${clockTime(item.startedAt)}` : ""}
                          {" · "}
                          <span className="tabular-nums">{formatDuration(item.durationSec)}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={t("Dismiss", "Zahodiť", "Elvetés")}
                        disabled={busy}
                        onClick={() => void dismiss([item.id])}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                    {item.suggestedProjectName ? (
                      <span className="w-fit rounded-full border border-dashed border-amber-400 px-2 py-0.5 text-micro font-semibold text-amber-800">{item.suggestedProjectName}</span>
                    ) : (
                      <span className="text-micro font-semibold text-amber-700">{t("No suggestion — pick a project", "Žiadny návrh — vyberte projekt", "Nincs javaslat — válasszon projektet")}</span>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void assign([item.id], project)}
                      className="h-8 w-fit rounded-lg bg-amber-600 px-3 text-ui font-semibold text-white transition-all hover:bg-amber-700 active:scale-95 disabled:opacity-60 cursor-pointer"
                    >
                      {t("Assign", "Priradiť", "Hozzárendelés")}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Surface>
    </div>
  );
}
