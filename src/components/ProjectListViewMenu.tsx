import React, { useEffect, useRef, useState } from "react";
import { ArrowDownNarrowWide, ArrowDownWideNarrow, ChevronDown, GripVertical, Lock, SlidersHorizontal } from "lucide-react";
import { CustomSelect } from "./ui/CustomSelect";
import { cn } from "../utils/cn";
import { LOCKED_PROJECT_COLUMN, moveProjectColumn } from "../utils/projectColumns";
import type { ResolvedProjectColumn } from "../utils/projectColumns";
import type { ProjectSort, ProjectSortKey } from "../utils/projectSort";
import { useDragReorder } from "../hooks/useDragReorder";

/* The sort select portals its option panel to <body>; a click in it must not
   read as a click outside this menu. */
const SORT_PANEL_CLASS = "project-view-menu-sort-panel";

interface ProjectListViewMenuProps {
  t: (en: string, sk: string, hu: string) => string;
  sort: ProjectSort;
  sortOptions: { value: ProjectSortKey; label: string }[];
  onSortChange: (next: ProjectSort) => void;
  /** Set when the current view ignores the sort (the structure): shown in place of the sort controls. */
  sortNote?: string;
  /** Every column the table can show, hidden ones included, in order. */
  columns: ResolvedProjectColumn[];
  onColumnsChange: (next: ResolvedProjectColumn[]) => void;
  columnLabel: (col: ResolvedProjectColumn) => string;
  /** False when the layout belongs to a project type the user may not edit. */
  canEditColumns: boolean;
  /** One line under the column list saying whose layout it is. */
  columnsScope: string;
  /** "Use default settings": default order and the type's default columns. */
  onReset: () => void;
}

/**
 * The projects list's "View" menu: how the rows are ordered and which columns
 * the table draws, in one popover next to the cards/table switch.
 */
export const ProjectListViewMenu: React.FC<ProjectListViewMenuProps> = ({
  t,
  sort,
  sortOptions,
  onSortChange,
  sortNote,
  columns,
  onColumnsChange,
  columnLabel,
  canEditColumns,
  columnsScope,
  onReset,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (rootRef.current?.contains(target)) return;
      if (target?.closest?.(`.${SORT_PANEL_CLASS}`)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* Drag-and-drop over the column list — the same hook the attribute list in
     project type settings and the projects list itself use. */
  const columnDrag = useDragReorder({
    enabled: canEditColumns,
    onMove: (dragKey, targetKey, position) =>
      onColumnsChange(moveProjectColumn(columns, dragKey, targetKey, position)),
  });

  const toggleColumn = (key: string) => {
    if (!canEditColumns || key === LOCKED_PROJECT_COLUMN) return;
    onColumnsChange(columns.map(c => (c.key === key ? { ...c, visible: !c.visible } : c)));
  };

  // Neither the creation order nor a hand-set order has a direction to flip.
  const sorted = sort.key !== "default" && sort.key !== "manual";
  const directions = [
    { dir: "asc" as const, Icon: ArrowDownNarrowWide, label: t("Ascending", "Vzostupne", "Növekvő") },
    { dir: "desc" as const, Icon: ArrowDownWideNarrow, label: t("Descending", "Zostupne", "Csökkenő") },
  ];
  const rowLabel = "text-xs font-semibold text-slate-600";

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "h-10 flex items-center gap-1.5 px-3 rounded-xl border text-xs font-bold transition-all duration-150 active:scale-95 cursor-pointer",
          open
            ? "bg-slate-200 border-slate-300 text-slate-800"
            : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 hover:text-slate-800"
        )}
      >
        <SlidersHorizontal className="h-4 w-4 shrink-0" />
        <span>{t("View", "Pohľad", "Nézet")}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("View settings", "Nastavenia pohľadu", "Nézet beállításai")}
          className="absolute right-0 top-full mt-2 z-50 w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white shadow-xl ring-4 ring-slate-900/[0.03] overflow-hidden text-left animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150 origin-top-right"
        >
          {/* Sort */}
          <div className="grid grid-cols-[6.5rem_1fr] items-center gap-3 px-4 py-3.5 border-b border-slate-200">
            <span className={rowLabel}>{t("Sort by", "Zoradiť podľa", "Rendezés")}</span>
            {sortNote ? (
              <p className="text-[11px] font-semibold text-slate-400 leading-snug">{sortNote}</p>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="flex-1 min-w-0">
                  <CustomSelect
                    className="h-9"
                    panelClassName={SORT_PANEL_CLASS}
                    value={sort.key}
                    onChange={v => onSortChange({ key: v as ProjectSortKey, direction: v === sort.key ? sort.direction : "asc" })}
                    options={sortOptions}
                  />
                </div>
                <div className="flex items-center shrink-0 rounded-xl border border-slate-200 overflow-hidden">
                  {directions.map(({ dir, Icon, label }) => {
                    const active = sorted && sort.direction === dir;
                    return (
                      <button
                        key={dir}
                        type="button"
                        disabled={!sorted}
                        onClick={() => onSortChange({ ...sort, direction: dir })}
                        title={label}
                        aria-label={label}
                        aria-pressed={active}
                        className={cn(
                          "h-9 w-9 flex items-center justify-center transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
                          active ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Columns */}
          <div className="grid grid-cols-[6.5rem_1fr] gap-3 px-4 py-3.5">
            <span className={cn(rowLabel, "pt-1")}>{t("Table columns", "Stĺpce tabuľky", "Táblázat oszlopai")}</span>
            <div className="min-w-0 border-l border-slate-200 pl-3">
              <div className="max-h-[50vh] overflow-y-auto scrollbar-thin -my-0.5">
                {columns.map(col => {
                  const locked = col.key === LOCKED_PROJECT_COLUMN;
                  const drop = columnDrag.dropAt(col.key);
                  const label = columnLabel(col);
                  const draggable = canEditColumns && !locked;
                  return (
                    <div
                      key={col.key}
                      {...columnDrag.rowProps(col.key, !locked, !locked)}
                      className={cn(
                        "group relative flex items-center gap-2 py-1 rounded-lg transition-opacity duration-150",
                        columnDrag.draggedId === col.key && "opacity-40"
                      )}
                    >
                      {drop === "before" && (
                        <span className="pointer-events-none absolute inset-x-0 -top-px h-0.5 rounded-full bg-indigo-500" />
                      )}
                      {drop === "after" && (
                        <span className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-indigo-500" />
                      )}
                      <span
                        className={cn("shrink-0", draggable && "cursor-grab active:cursor-grabbing")}
                        title={
                          locked
                            ? t("The project name always leads the row.", "Názov projektu je vždy prvý v riadku.", "A projekt neve mindig a sor élén áll.")
                            : draggable
                              ? t("Drag to reorder", "Potiahnutím zmeníte poradie", "Húzza az átrendezéshez")
                              : undefined
                        }
                      >
                        {locked
                          ? <Lock className="h-3.5 w-3.5 text-slate-300" />
                          : <GripVertical className={cn("h-3.5 w-3.5 text-slate-300 transition-colors duration-150", draggable && "group-hover:text-indigo-500")} />}
                      </span>
                      <label className={cn(
                        "flex items-center gap-2 min-w-0 flex-1",
                        canEditColumns && !locked ? "cursor-pointer" : "cursor-default"
                      )}>
                        <input
                          type="checkbox"
                          checked={col.visible}
                          disabled={!canEditColumns || locked}
                          onChange={() => toggleColumn(col.key)}
                          className="h-4 w-4 shrink-0 rounded border-slate-300 accent-indigo-600 cursor-pointer disabled:cursor-default"
                        />
                        <span className={cn("text-[13px] font-medium truncate", col.visible ? "text-slate-800" : "text-slate-500")}>
                          {label}
                        </span>
                      </label>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2.5 text-[11px] font-medium leading-snug text-slate-400">{columnsScope}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-semibold text-slate-600 hover:text-indigo-600 transition-colors duration-150 cursor-pointer"
            >
              {t("Use default settings", "Použiť predvolené nastavenia", "Alapértelmezett beállítások")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 px-4 rounded-xl bg-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-300 active:scale-95 transition-all duration-150 cursor-pointer"
            >
              {t("Close", "Zavrieť", "Bezárás")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
