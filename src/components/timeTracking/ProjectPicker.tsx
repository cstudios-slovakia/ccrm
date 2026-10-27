import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import type { Lead, Project, ProjectType } from "../../types";
import { useProjectStatuses } from "../../hooks/useProjectStatuses";
import {
  isClosedProjectStatus,
  projectDisplayName,
  projectStatusColor,
  projectStatusLabel,
} from "../../utils/projects";
import { formatDuration, projectColor, type TFn } from "../../utils/timeTracking.ts";

export interface NewProjectInput {
  name: string;
  clientId: string | null;
  projectTypeId: string;
}

interface Props {
  projects: Project[];
  leads: Lead[];
  projectTypes: ProjectType[];
  value: string | null;
  onChange: (projectId: string | null) => void;
  t: TFn;
  /** Most recently used project ids, newest first. */
  recentIds?: string[];
  /** Seconds already tracked on each project, for the meta line. */
  secondsByProject?: Record<string, number>;
  /** Creating a project needs the projects create permission. */
  onCreateProject?: (input: NewProjectInput) => Project | null;
  disabled?: boolean;
  /** Replaces the default chip. */
  renderTrigger?: (state: { open: boolean; toggle: () => void; project: Project | null; label: string }) => ReactNode;
  /** Open on mount (the "pick a project before stopping" dialog). */
  defaultOpen?: boolean;
  /** Render the panel inline instead of as a popover (inside a modal). */
  inline?: boolean;
  align?: "left" | "right";
}

/**
 * The shared project picker: search by name, client or code; results grouped by
 * client with recent projects first; a "show finished" toggle; and an inline
 * "create project" mini form for people who may create one.
 */
export function ProjectPicker({
  projects,
  leads,
  projectTypes,
  value,
  onChange,
  t,
  recentIds = [],
  secondsByProject = {},
  onCreateProject,
  disabled,
  renderTrigger,
  defaultOpen = false,
  inline = false,
  align = "left",
}: Props) {
  const statuses = useProjectStatuses();
  const [open, setOpen] = useState(defaultOpen || inline);
  const [query, setQuery] = useState("");
  const [showFinished, setShowFinished] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newClient, setNewClient] = useState<string>("");
  const [newType, setNewType] = useState<string>(projectTypes[0]?.id ?? "");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || inline) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, inline]);

  const fallbackName = t("Untitled project", "Projekt bez názvu", "Névtelen projekt");
  const nameOf = (p: Project) => projectDisplayName(p, leads, fallbackName);
  const clientOf = (p: Project): Lead | undefined => {
    const id = p.clientId || p.leadId;
    return id ? leads.find((l) => l.id === id) : undefined;
  };
  const selected = projects.find((p) => p.id === value) ?? null;

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    return projects.filter((p) => {
      if (p.archived) return false;
      if (!showFinished && isClosedProjectStatus(p.status, statuses) && p.id !== value) return false;
      if (!q) return true;
      const hay = `${nameOf(p)} ${clientOf(p)?.name ?? ""} ${p.id}`.toLowerCase();
      return hay.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, leads, q, showFinished, statuses, value]);

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: Project[] }[] = [];
    const recent = recentIds.map((id) => visible.find((p) => p.id === id)).filter((p): p is Project => !!p).slice(0, 5);
    if (recent.length && !q) out.push({ key: "recent", label: t("Recent", "Nedávne", "Legutóbbi"), items: recent });
    const byClient = new Map<string, Project[]>();
    for (const p of visible) {
      const c = clientOf(p);
      const key = c ? c.id : "_none";
      byClient.set(key, [...(byClient.get(key) ?? []), p]);
    }
    const keys = [...byClient.keys()].sort((a, b) => {
      if (a === "_none") return 1;
      if (b === "_none") return -1;
      return (leads.find((l) => l.id === a)?.name ?? "").localeCompare(leads.find((l) => l.id === b)?.name ?? "");
    });
    for (const key of keys) {
      const items = byClient.get(key)!.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      out.push({ key, label: key === "_none" ? t("No client", "Bez klienta", "Ügyfél nélkül") : leads.find((l) => l.id === key)?.name ?? "", items });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, recentIds, q, leads]);

  const choose = (id: string | null) => {
    onChange(id);
    if (!inline) setOpen(false);
  };

  const create = () => {
    if (!onCreateProject || !newType || !query.trim()) return;
    const made = onCreateProject({ name: query.trim(), clientId: newClient || null, projectTypeId: newType });
    if (made) {
      setCreating(false);
      setQuery("");
      choose(made.id);
    }
  };

  const label = selected ? nameOf(selected) : t("Assign project", "Priradiť projekt", "Projekt hozzárendelése");
  const toggle = () => !disabled && setOpen((v) => !v);

  const defaultTrigger = (
    <button
      type="button"
      disabled={disabled}
      onClick={toggle}
      data-testid="project-picker-trigger"
      className={`inline-flex h-9 max-w-full items-center gap-2 rounded-xl border px-3 text-ui font-semibold transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
        selected ? "border-slate-200 bg-white text-slate-800 hover:border-slate-300" : "border-dashed border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100"
      }`}
    >
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: selected ? projectColor(selected.id) : "#d97706" }} />
      <span className="truncate">{label}</span>
      <ChevronDown className="size-3.5 shrink-0 text-slate-400" />
    </button>
  );

  const panel = (
    <div
      data-testid="project-picker-panel"
      className={`${inline ? "" : `absolute z-[960] mt-2 w-80 ${align === "right" ? "right-0" : "left-0"} shadow-xl`} flex max-h-96 flex-col rounded-2xl border border-slate-200 bg-white`}
    >
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <Search className="size-4 shrink-0 text-slate-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search project or client…", "Hľadať projekt alebo klienta…", "Projekt vagy ügyfél keresése…")}
          className="min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-slate-400"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label={t("Clear", "Vymazať", "Törlés")} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="size-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {value && (
          <button type="button" onClick={() => choose(null)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-ui text-slate-500 hover:bg-slate-50 cursor-pointer">
            <X className="size-3.5" />
            {t("No project", "Bez projektu", "Projekt nélkül")}
          </button>
        )}
        {groups.map((g) => (
          <div key={g.key}>
            <div className="type-overline px-3 pb-1 pt-2 text-slate-400">{g.label}</div>
            {g.items.map((p) => {
              const sec = secondsByProject[p.id];
              return (
                <button
                  key={`${g.key}-${p.id}`}
                  type="button"
                  onClick={() => choose(p.id)}
                  data-testid="project-option"
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 cursor-pointer ${p.id === value ? "bg-slate-50" : ""}`}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: projectColor(p.id) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui font-semibold text-slate-800">{nameOf(p)}</span>
                    {sec ? <span className="type-meta tabular-nums text-slate-500">{formatDuration(sec)} h</span> : null}
                  </span>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-micro font-semibold" style={{ color: projectStatusColor(p.status, statuses), backgroundColor: `${projectStatusColor(p.status, statuses)}1a` }}>
                    {projectStatusLabel(p.status, t, statuses)}
                  </span>
                  {p.id === value && <Check className="size-4 shrink-0 text-teal-600" />}
                </button>
              );
            })}
          </div>
        ))}
        {groups.length === 0 && <div className="px-3 py-4 text-ui text-slate-500">{t("No project matches.", "Žiadny projekt nevyhovuje.", "Nincs találat.")}</div>}
      </div>
      <div className="border-t border-slate-100 px-3 py-2">
        <label className="flex cursor-pointer items-center gap-2 text-ui text-slate-600">
          <input type="checkbox" checked={showFinished} onChange={(e) => setShowFinished(e.target.checked)} className="size-4 accent-teal-600" />
          {t("Show finished", "Zobraziť dokončené", "Befejezettek mutatása")}
        </label>
        {onCreateProject && query.trim() && !creating && (
          <button type="button" onClick={() => setCreating(true)} data-testid="project-create-open" className="mt-2 inline-flex items-center gap-1.5 text-ui font-semibold text-primary hover:underline cursor-pointer">
            <Plus className="size-4" />
            {t(`Create project "${query.trim()}"`, `Vytvoriť projekt „${query.trim()}“`, `Projekt létrehozása: „${query.trim()}”`)}
          </button>
        )}
        {onCreateProject && creating && (
          <div className="mt-2 grid gap-2 rounded-xl bg-slate-50 p-2.5">
            <select value={newClient} onChange={(e) => setNewClient(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-ui">
              <option value="">{t("No client", "Bez klienta", "Ügyfél nélkül")}</option>
              {[...leads].sort((a, b) => a.name.localeCompare(b.name)).map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <select value={newType} onChange={(e) => setNewType(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-ui">
              {projectTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>{pt.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="h-9 rounded-lg px-3 text-ui font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer">{t("Cancel", "Zrušiť", "Mégse")}</button>
              <button type="button" onClick={create} disabled={!newType} data-testid="project-create-submit" className="h-9 rounded-lg bg-primary px-3 text-ui font-semibold text-primary-foreground disabled:opacity-50 cursor-pointer">{t("Create", "Vytvoriť", "Létrehozás")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (inline) return panel;
  return (
    <div ref={root} className="relative inline-block max-w-full">
      {renderTrigger ? renderTrigger({ open, toggle, project: selected, label }) : defaultTrigger}
      {open && panel}
    </div>
  );
}
