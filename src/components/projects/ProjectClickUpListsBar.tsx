import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Folder, Layers, ListChecks, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import type { ClickUpProjectList } from "../../types";
import type { Language } from "../../utils/translations";

interface HierarchyList {
  id: string;
  name: string;
  taskCount?: number | null;
}

interface HierarchyFolder {
  id: string;
  name: string;
  lists: HierarchyList[];
}

interface HierarchySpace {
  id: string;
  name: string;
  folders: HierarchyFolder[];
  lists: HierarchyList[];
}

const showToast = (message: string, variant?: "error" | "warning") =>
  (window as unknown as { showToast?: (m: string, v?: string) => void }).showToast?.(message, variant);

/**
 * Multi-list ClickUp selector for a project.
 *
 * Used in compact mode in ProjectDetailsView's left metadata column and in full mode
 * at the top of the project's Tasks tab (with Sync now + list chips).
 */
export const ProjectClickUpListsBar: React.FC<{
  projectId: string;
  isNew: boolean;
  value: ClickUpProjectList[];
  canEdit: boolean;
  userLanguage: Language;
  compact?: boolean;
  onChange: (next: ClickUpProjectList[]) => void;
  onSynced?: () => void;
}> = ({ projectId, isNew, value, canEdit, userLanguage, compact = false, onChange, onSynced }) => {
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [spaces, setSpaces] = useState<HierarchySpace[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasNewRef = useRef(isNew);

  const selectedIds = useMemo(() => new Set(value.map((v) => v.id)), [value]);

  const loadHierarchy = async (refresh = false) => {
    setLoadingTree(true);
    setTreeError(null);
    try {
      const res = await fetch(`/api/clickup.php?action=hierarchy${refresh ? "&refresh=1" : ""}`, {
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && Array.isArray(data.spaces)) {
        setSpaces(data.spaces);
      } else {
        setTreeError(
          data?.message ||
            t(
              "Could not load ClickUp lists.",
              "Zoznamy ClickUp sa nepodarilo načítať.",
              "A ClickUp listák betöltése sikertelen.",
            ),
        );
      }
    } catch {
      setTreeError(
        t(
          "Could not load ClickUp lists.",
          "Zoznamy ClickUp sa nepodarilo načítať.",
          "A ClickUp listák betöltése sikertelen.",
        ),
      );
    } finally {
      setLoadingTree(false);
    }
  };

  useEffect(() => {
    if (open && spaces.length === 0 && !loadingTree) {
      void loadHierarchy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerSync = async (listsOverride?: ClickUpProjectList[]) => {
    if (isNew || !projectId) return;
    setSyncing(true);
    try {
      const body: Record<string, unknown> = { action: "sync_project", projectId };
      if (listsOverride && canEdit) {
        body.lists = listsOverride;
      }
      const res = await fetch("/api/clickup.php", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        window.dispatchEvent(new Event("ccrm:reload-data"));
        onSynced?.();
      } else {
        showToast(
          data?.message ||
            t(
              "ClickUp sync failed.",
              "Synchronizácia ClickUp zlyhala.",
              "A ClickUp szinkronizálása sikertelen.",
            ),
          "error",
        );
      }
    } catch {
      showToast(
        t(
          "ClickUp sync failed.",
          "Synchronizácia ClickUp zlyhala.",
          "A ClickUp szinkronizálása sikertelen.",
        ),
        "error",
      );
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const wasNew = wasNewRef.current;
    wasNewRef.current = isNew;
    if (wasNew && !isNew && value.length > 0 && projectId) {
      void triggerSync(value);
    }
  }, [isNew, projectId]);

  const toggleList = (item: ClickUpProjectList) => {
    if (!canEdit) return;
    const exists = selectedIds.has(item.id);
    const next = exists ? value.filter((x) => x.id !== item.id) : [...value, item];
    onChange(next);
    if (!isNew) {
      void triggerSync(next);
    }
  };

  const q = search.trim().toLowerCase();
  const matchesQuery = (text: string) => !q || text.toLowerCase().includes(q);

  const pickerDropdown = open && (
    <div
      className="absolute left-0 z-50 mt-1.5 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white shadow-xl"
      data-testid="project-clickup-lists-popover"
    >
      <div className="flex items-center gap-1.5 border-b border-gray-100 p-2">
        <div className="relative flex-1 min-w-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search ClickUp lists…", "Hľadať zoznamy…", "Listák keresése…")}
            className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-2 text-ui text-gray-800 focus:border-violet-400 focus:bg-white focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => void loadHierarchy(true)}
          disabled={loadingTree}
          title={t("Refresh ClickUp lists", "Obnoviť zoznamy z ClickUpu", "Listák frissítése")}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingTree ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto p-1.5 space-y-2 scrollbar-thin">
        {loadingTree && spaces.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-6 text-ui text-gray-400">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            <span>{t("Loading ClickUp lists…", "Načítavam zoznamy…", "Listák betöltése…")}</span>
          </div>
        ) : treeError ? (
          <p className="px-2 py-4 text-center text-ui text-rose-600">{treeError}</p>
        ) : spaces.length === 0 ? (
          <p className="px-2 py-4 text-center text-ui text-gray-400">
            {t("No ClickUp lists found.", "Nenašli sa žiadne ClickUp zoznamy.", "Nem találhatók ClickUp listák.")}
          </p>
        ) : (
          spaces.map((sp) => {
            const spaceMatched = matchesQuery(sp.name);
            const matchingFolderless = sp.lists.filter(
              (l) => spaceMatched || matchesQuery(l.name),
            );
            const matchingFolders = sp.folders
              .map((fl) => ({
                ...fl,
                lists: fl.lists.filter(
                  (l) => spaceMatched || matchesQuery(fl.name) || matchesQuery(l.name),
                ),
              }))
              .filter((fl) => fl.lists.length > 0);

            if (matchingFolderless.length === 0 && matchingFolders.length === 0) return null;

            return (
              <div key={sp.id} className="space-y-1">
                <div className="flex items-center gap-1.5 px-2 py-0.5 text-micro font-bold uppercase tracking-wider text-gray-400">
                  <Layers className="h-3 w-3 shrink-0" />
                  <span className="truncate">{sp.name}</span>
                </div>

                {matchingFolderless.map((lst) => {
                  const checked = selectedIds.has(lst.id);
                  return (
                    <button
                      key={lst.id}
                      type="button"
                      onClick={() =>
                        toggleList({ id: lst.id, name: lst.name, spaceName: sp.name, folderName: null })
                      }
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui transition-colors cursor-pointer ${
                        checked ? "bg-violet-50 text-violet-900" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          checked
                            ? "border-violet-600 bg-violet-600 text-white"
                            : "border-gray-300 bg-white"
                        }`}
                      >
                        {checked && <Check className="h-3 w-3 stroke-[3]" />}
                      </span>
                      <span className="flex-1 truncate font-medium">{lst.name}</span>
                      {typeof lst.taskCount === "number" && (
                        <span className="text-micro tabular-nums text-gray-400">{lst.taskCount}</span>
                      )}
                    </button>
                  );
                })}

                {matchingFolders.map((fl) => (
                  <div key={fl.id} className="space-y-0.5 pl-2">
                    <div className="flex items-center gap-1 px-2 py-0.5 text-micro font-semibold text-gray-500">
                      <Folder className="h-3 w-3 shrink-0 text-gray-400" />
                      <span className="truncate">{fl.name}</span>
                    </div>
                    {fl.lists.map((lst) => {
                      const checked = selectedIds.has(lst.id);
                      return (
                        <button
                          key={lst.id}
                          type="button"
                          onClick={() =>
                            toggleList({
                              id: lst.id,
                              name: lst.name,
                              folderName: fl.name,
                              spaceName: sp.name,
                            })
                          }
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 pl-4 text-left text-ui transition-colors cursor-pointer ${
                            checked ? "bg-violet-50 text-violet-900" : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              checked
                                ? "border-violet-600 bg-violet-600 text-white"
                                : "border-gray-300 bg-white"
                            }`}
                          >
                            {checked && <Check className="h-3 w-3 stroke-[3]" />}
                          </span>
                          <span className="flex-1 truncate font-medium">{lst.name}</span>
                          {typeof lst.taskCount === "number" && (
                            <span className="text-micro tabular-nums text-gray-400">{lst.taskCount}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  if (compact) {
    return (
      <div ref={containerRef} className="relative">
        <span className="block type-overline text-slate-400 mb-1">
          {t("ClickUp lists", "Zoznamy v ClickUpe", "ClickUp listák")}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {canEdit ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              data-testid="project-clickup-lists-trigger"
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-ui font-semibold text-gray-700 hover:bg-white hover:border-gray-300 transition-colors cursor-pointer"
            >
              <ListChecks className="h-3.5 w-3.5 text-violet-600" />
              <span>
                {value.length > 0
                  ? t(
                      `${value.length} list${value.length === 1 ? "" : "s"}`,
                      value.length === 1 ? "1 zoznam" : `${value.length} zoznamy`,
                      `${value.length} lista`,
                    )
                  : t("Select lists…", "Vybrať zoznamy…", "Listák kiválasztása…")}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </button>
          ) : value.length === 0 ? (
            <span className="text-slate-300 italic font-semibold text-ui">
              {t("No lists linked", "Bez prepojených zoznamov", "Nincs csatolt lista")}
            </span>
          ) : null}

          {!isNew && value.length > 0 && (
            <button
              type="button"
              onClick={() => void triggerSync()}
              disabled={syncing}
              title={t("Sync ClickUp tasks now", "Synchronizovať ClickUp úlohy teraz", "ClickUp feladatok szinkronizálása most")}
              className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1.5 text-micro font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
              <span>{t("Sync", "Sync", "Szinkron")}</span>
            </button>
          )}
        </div>

        {value.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {value.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50/70 px-2 py-0.5 text-micro font-semibold text-violet-800"
              >
                <span className="truncate max-w-48">
                  {item.spaceName ? `${item.spaceName} › ` : ""}
                  {item.name}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => toggleList(item)}
                    aria-label={t("Remove list", "Odstrániť zoznam", "Lista eltávolítása")}
                    className="rounded text-violet-500 hover:bg-violet-200/60 hover:text-violet-900 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {pickerDropdown}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200/80 bg-violet-50/40 px-3 py-2.5"
      data-testid="project-clickup-lists-bar"
    >
      <div className="flex flex-1 min-w-0 flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-micro font-bold uppercase tracking-wider text-violet-700 mr-1">
          <ListChecks className="h-3.5 w-3.5" />
          ClickUp
        </span>

        {value.map((item) => (
          <span
            key={item.id}
            className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-white px-2 py-0.5 text-micro font-semibold text-violet-900 shadow-2xs"
          >
            <span className="truncate max-w-52">
              {item.folderName ? `${item.folderName} › ` : item.spaceName ? `${item.spaceName} › ` : ""}
              {item.name}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => toggleList(item)}
                aria-label={t("Remove list", "Odstrániť zoznam", "Lista eltávolítása")}
                className="rounded text-violet-400 hover:bg-violet-100 hover:text-violet-900 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}

        {value.length === 0 && (
          <span className="text-micro font-medium text-gray-500">
            {t(
              "Link one or more ClickUp lists to mirror their tasks & subtasks into this project.",
              "Prepojte jeden alebo viac ClickUp zoznamov a ich úlohy s podúlohami sa zobrazia v tomto projekte.",
              "Csatoljon egy vagy több ClickUp listát, hogy a feladatok és alfeladatok megjelenjenek a projektben.",
            )}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {canEdit && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            data-testid="project-clickup-lists-trigger"
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-micro font-bold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <span>{t("Select lists", "Vybrať zoznamy", "Listák")}</span>
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </button>
        )}
        {!isNew && value.length > 0 && (
          <button
            type="button"
            onClick={() => void triggerSync()}
            disabled={syncing}
            data-testid="project-clickup-sync-btn"
            className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1.5 text-micro font-bold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
            <span>
              {syncing
                ? t("Syncing…", "Synchronizujem…", "Szinkronizálás…")
                : t("Sync now", "Synchronizovať", "Szinkronizálás")}
            </span>
          </button>
        )}
      </div>

      {pickerDropdown}
    </div>
  );
};
