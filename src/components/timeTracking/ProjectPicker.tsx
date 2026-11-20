import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import type { Lead, Project, ProjectType } from "../../types";
import { useProjectStatuses } from "../../hooks/useProjectStatuses";
import {
  isClosedProjectStatus,
  projectDisplayName,
  projectStatusColor,
  projectStatusLabel,
} from "../../utils/projects";
import { projectColor, type TFn } from "../../utils/timeTracking.ts";
import { ProjectLabel } from "./ProjectLabel";
import { clientOfProject, groupProjects, optionMeta, RECENT_LIMIT } from "./projectPickerModel";
import { ClientSelect } from "../ui/ClientSelect";
import { CustomSelect } from "../ui/CustomSelect";

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
  /** Seconds tracked on each project this week, for the meta line. */
  secondsByProject?: Record<string, number>;
  /** Creating a project needs the projects create permission. */
  onCreateProject?: (input: NewProjectInput) => Project | null;
  disabled?: boolean;
  /** Open on mount (the "pick a project before stopping" dialog). */
  defaultOpen?: boolean;
  /** Render the panel inline instead of as a popover (inside a modal). */
  inline?: boolean;
  align?: "left" | "right";
  /** The default trigger as a pill in the project's colour (amber "Assign project" when none): the timer bar's. */
  chip?: boolean;
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
  defaultOpen = false,
  inline = false,
  align = "left",
  chip = false,
}: Props) {
  const statuses = useProjectStatuses();
  const [open, setOpen] = useState(defaultOpen || inline);
  const [query, setQuery] = useState("");
  const [showFinished, setShowFinished] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState<string>("");
  const [newType, setNewType] = useState<string>(projectTypes[0]?.id ?? "");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || inline) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      // The client / type dropdowns and the "new client" form render in portals: a press inside
      // one is not a press outside the picker.
      if (target?.closest?.("[data-dropdown-panel]")) return;
      if (root.current && !root.current.contains(target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, inline]);

  const fallbackName = t("Untitled project", "Projekt bez názvu", "Névtelen projekt");
  const nameOf = (p: Project) => projectDisplayName(p, leads, fallbackName);
  const clientOf = (p: Project): Lead | undefined => clientOfProject(p, leads);
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

  const recentSet = useMemo(() => new Set(recentIds.slice(0, RECENT_LIMIT)), [recentIds]);
  const groups = useMemo(
    () => groupProjects(visible, leads, recentIds, nameOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, recentIds, leads],
  );

  const choose = (id: string | null) => {
    onChange(id);
    if (!inline) setOpen(false);
  };

  const create = () => {
    if (!onCreateProject || !newType || !newName.trim()) return;
    const made = onCreateProject({ name: newName.trim(), clientId: newClient || null, projectTypeId: newType });
    if (made) {
      setCreating(false);
      setQuery("");
      choose(made.id);
    }
  };

  const label = selected ? nameOf(selected) : t("Assign project", "Priradiť projekt", "Projekt hozzárendelése");
  const toggle = () => !disabled && setOpen((v) => !v);

  const chipColor = selected ? projectColor(selected.id) : null;
  const chipTrigger = (
    <button
      type="button"
      disabled={disabled}
      onClick={toggle}
      data-testid="project-picker-trigger"
      style={chipColor ? { backgroundColor: `${chipColor}1a`, borderColor: `${chipColor}40` } : undefined}
      className={`inline-flex h-9 max-w-64 items-center gap-2 rounded-full border px-3 text-ui font-semibold transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
        selected ? "text-slate-800 hover:brightness-95" : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
      }`}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: chipColor ?? "#d97706" }} />
      <span className="truncate">{label}</span>
      <ChevronDown className="size-3.5 shrink-0 text-slate-500" />
    </button>
  );

  const defaultTrigger = chip ? chipTrigger : (
    <button
      type="button"
      disabled={disabled}
      onClick={toggle}
      data-testid="project-picker-trigger"
      className={`inline-flex h-9 max-w-full items-center gap-2 rounded-xl border px-3 text-ui font-semibold transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
        selected ? "border-slate-200 bg-white text-slate-800 hover:border-slate-300" : "border-dashed border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100"
      }`}
    >
      {selected ? (
        <ProjectLabel projectId={selected.id} name={label} client={clientOf(selected)?.name} className="text-ui" />
      ) : (
        <>
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: "#d97706" }} />
          <span className="truncate">{label}</span>
        </>
      )}
      <ChevronDown className="size-3.5 shrink-0 text-slate-400" />
    </button>
  );

  const panel = (
    <div
      data-testid="project-picker-panel"
      className={`${inline ? "" : `absolute z-[960] mt-2 w-80 max-w-[calc(100vw-2rem)] ${align === "right" ? "right-0" : "left-0"} shadow-xl`} flex max-h-96 flex-col rounded-2xl border border-slate-200 bg-white`}
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
            <div className="type-overline px-3 pb-1 pt-2 text-slate-400">{g.clientName ?? t("No client", "Bez klienta", "Ügyfél nélkül")}</div>
            {g.items.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => choose(p.id)}
                data-testid="project-option"
                aria-current={p.id === value ? "true" : undefined}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left cursor-pointer ${p.id === value ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-slate-50"}`}
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: projectColor(p.id) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ui font-semibold text-slate-800">{nameOf(p)}</span>
                  <span className="type-meta block truncate tabular-nums text-slate-500">{optionMeta(recentSet.has(p.id), secondsByProject[p.id], t)}</span>
                </span>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-micro font-semibold" style={{ color: projectStatusColor(p.status, statuses), backgroundColor: `${projectStatusColor(p.status, statuses)}1a` }}>
                  {projectStatusLabel(p.status, t, statuses)}
                </span>
                {p.id === value && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
              </button>
            ))}
          </div>
        ))}
        {groups.length === 0 && <div className="px-3 py-4 text-ui text-slate-500">{t("No project matches.", "Žiadny projekt nevyhovuje.", "Nincs találat.")}</div>}
      </div>
      <div className="max-h-72 shrink-0 overflow-y-auto border-t border-slate-100 px-3 py-2">
        {!creating && (
          <div className="flex items-center gap-3">
            {onCreateProject && query.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setNewName(query.trim());
                  setCreating(true);
                }}
                data-testid="project-create-open"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-left text-ui font-semibold text-primary hover:bg-primary/15 cursor-pointer"
              >
                <Plus className="size-4 shrink-0" />
                <span className="truncate">{t(`Create project "${query.trim()}"`, `Vytvoriť projekt „${query.trim()}“`, `Projekt létrehozása: „${query.trim()}”`)}</span>
              </button>
            ) : (
              <span className="flex-1" />
            )}
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-ui text-slate-600">
              <input type="checkbox" checked={showFinished} onChange={(e) => setShowFinished(e.target.checked)} className="size-4 accent-teal-600" />
              {t("Show finished", "Zobraziť dokončené", "Befejezettek mutatása")}
            </label>
          </div>
        )}
        {onCreateProject && creating && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-ui font-semibold text-slate-800">{t("New project", "Nový projekt", "Új projekt")}</div>
            <label className="grid gap-1">
              <span className="type-label text-slate-600">{t("Project name", "Názov projektu", "Projekt neve")}</span>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    create();
                  }
                }}
                data-testid="project-create-name"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-ui outline-none focus:border-primary"
              />
            </label>
            <div className="grid gap-1">
              <span className="type-label text-slate-600">{t("Client", "Klient", "Ügyfél")}</span>
              <ClientSelect
                leads={leads}
                value={newClient}
                onChange={setNewClient}
                noneLabel={t("No client", "Bez klienta", "Ügyfél nélkül")}
                placeholder={t("No client", "Bez klienta", "Ügyfél nélkül")}
                searchPlaceholder={t("Search client…", "Hľadať klienta…", "Ügyfél keresése…")}
                size="sm"
              />
            </div>
            <div className="grid gap-1">
              <span className="type-label text-slate-600">{t("Project type", "Typ projektu", "Projekt típusa")}</span>
              <CustomSelect
                searchable
                size="sm"
                value={newType}
                onChange={setNewType}
                placeholder={t("Project type", "Typ projektu", "Projekt típusa")}
                searchPlaceholder={t("Search project type…", "Hľadať typ projektu…", "Projekttípus keresése…")}
                options={projectTypes.map((pt) => ({ value: pt.id, label: pt.name }))}
              />
            </div>
            <p className="type-meta text-slate-500">
              {t(
                "Created with the default status. Everything else is filled in later on the project.",
                "Vytvorí sa s predvoleným stavom. Všetko ostatné doplníte neskôr v projekte.",
                "Az alapértelmezett státusszal jön létre. Minden mást később tölthet ki a projekten.",
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-ui font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">{t("Back", "Späť", "Vissza")}</button>
              <button type="button" onClick={create} disabled={!newType || !newName.trim()} data-testid="project-create-submit" className="h-9 rounded-lg bg-primary px-3 text-ui font-semibold text-primary-foreground disabled:opacity-50 cursor-pointer">{t("Create & assign", "Vytvoriť a priradiť", "Létrehozás és hozzárendelés")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (inline) return panel;
  return (
    <div ref={root} className="relative inline-block max-w-full">
      {defaultTrigger}
      {open && panel}
    </div>
  );
}
