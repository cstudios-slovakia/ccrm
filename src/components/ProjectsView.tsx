import React, { useState, useMemo, useEffect, useRef } from "react";
import * as Icons from "lucide-react";
import { Plus, Trash2, Settings, Search, Users, Briefcase, ChevronDown, LayoutGrid, Rows3, CalendarClock } from "lucide-react";
import type { Project, ProjectAutoCreateSettings, ProjectType, Lead, UserProfile, FinancialRecord, FinancialCategory } from "../types";
import { ProjectDetailsView } from "./ProjectDetailsView";
import { ProjectSettings } from "./ProjectSettings";
import { CustomSelect } from "./ui/CustomSelect";
import type { Language } from "../utils/translations";
import { readableOn } from "../utils/accentColor";
import { parseAppHash } from "../utils/hash";
import { evaluateProjectDeadline, projectDisplayName } from "../utils/projects";
import type { ProjectDeadlineStatus } from "../utils/projects";
import { todayLocal, formatDateLocalized } from "../utils/localTime";
import { useUserPref } from "../utils/userPrefs";

interface ProjectsViewProps {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  projectTypes: ProjectType[];
  setProjectTypes: React.Dispatch<React.SetStateAction<ProjectType[]>>;
  leads: Lead[];
  users: UserProfile[];
  userLanguage: Language;
  canEdit: boolean;
  /** Rules for turning every incoming lead into a project (edited in the Settings tab). */
  projectAutoCreate?: ProjectAutoCreateSettings;
  setProjectAutoCreate?: React.Dispatch<React.SetStateAction<ProjectAutoCreateSettings>>;
  financialRecords?: FinancialRecord[];
  setFinancialRecords?: React.Dispatch<React.SetStateAction<FinancialRecord[]>>;
  financialCategories?: FinancialCategory[];
  setFinancialCategories?: React.Dispatch<React.SetStateAction<FinancialCategory[]>>;
  currencyCode?: string | null;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  setProjects,
  projectTypes,
  setProjectTypes,
  leads,
  users,
  userLanguage,
  canEdit,
  projectAutoCreate,
  setProjectAutoCreate,
  financialRecords = [],
  setFinancialRecords,
  financialCategories = [],
  setFinancialCategories,
  currencyCode
}) => {
  const t = (en: string, sk: string, hu: string) => userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  const [activeSubTab, setActiveSubTab] = useState<"list" | "settings">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("all");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("all");

  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingProjectType, setEditingProjectType] = useState<ProjectType | null>(null);

  // "+ New Project" dropdown control
  const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false);
  const createDropdownRef = useRef<HTMLDivElement>(null);

  /* Roomy cards or a dense table. Kept in the user's DB-backed preferences, so
     the choice follows them to their next device like the leads list's does. */
  const [viewMode, setViewMode] = useUserPref("projectsViewMode");

  /* Set when someone picks "New project type" from the create dropdown; handed
     to ProjectSettings, which opens its create form and hands it straight back. */
  const [pendingTypeCreate, setPendingTypeCreate] = useState(false);

  // One clock for every countdown on the screen.
  const today = todayLocal();

  // Compute stats for summary badges
  const totalProjects = projects.length;
  const activeCount = projects.filter(p => p.status === "active").length;
  const completedCount = projects.filter(p => p.status === "completed").length;

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const pType = projectTypes.find(t => t.id === p.projectTypeId);
      const lead = leads.find(l => l.id === p.leadId);
      const leadName = lead?.name || "";
      const needle = searchQuery.toLowerCase();
      const matchesSearch =
        // The project's own name is searched alongside the lead's — a project
        // named "Roof replacement" is no longer findable only by its client.
        (p.name || "").toLowerCase().includes(needle) ||
        leadName.toLowerCase().includes(needle) ||
        p.id.toLowerCase().includes(needle) ||
        (pType?.name || "").toLowerCase().includes(needle);
      
      const matchesStatus = selectedStatusFilter === "all" || p.status === selectedStatusFilter;
      const matchesType = selectedTypeFilter === "all" || p.projectTypeId === selectedTypeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [projects, projectTypes, leads, searchQuery, selectedStatusFilter, selectedTypeFilter]);

  /* Deep link: `#projects?edit=<projectId>` opens that project directly.
     "Convert to Project" on a lead has always navigated here with that query,
     and the lead's "Linked projects" card does too — but nothing read it, so
     both landed on the plain list and read as the action having done nothing.
     The parameter is consumed once it has been honoured, otherwise saving the
     project (which re-renders this list) would immediately re-open it. */
  useEffect(() => {
    const openFromHash = () => {
      const { route, params } = parseAppHash(window.location.hash);
      if (route !== "projects") return;
      const id = params.get("edit");
      if (!id) return;

      const project = projects.find(p => p.id === id);
      const type = project ? projectTypes.find(pt => pt.id === project.projectTypeId) : undefined;
      // A project that has not arrived yet (or whose type was deleted) leaves
      // the parameter in place, so the next render can still honour it.
      if (!project || !type) return;

      window.history.replaceState(null, "", "#projects");
      setEditingProjectType(type);
      setEditingProject(project);
    };

    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [projects, projectTypes]);

  /* The create dropdown had no way of closing other than the button that opened
     it: clicking anywhere else left it hanging over the list. */
  useEffect(() => {
    if (!isCreateDropdownOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!createDropdownRef.current?.contains(e.target as Node)) setIsCreateDropdownOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsCreateDropdownOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isCreateDropdownOpen]);

  /* "No types configured" used to be the end of the road — the dropdown said it
     and offered nothing to do about it. Jump to the settings tab with its create
     form already open. */
  const handleStartCreateProjectType = () => {
    setIsCreateDropdownOpen(false);
    setActiveSubTab("settings");
    setPendingTypeCreate(true);
  };

  const handleStartCreateProject = (type: ProjectType) => {
    setIsCreateDropdownOpen(false);
    
    // Create new blank project
    const newProj: Project = {
      id: "proj-" + Date.now(),
      projectTypeId: type.id,
      leadId: null,
      clientId: null,
      status: "active",
      managers: [],
      data: {},
      timeline: [],
      gantt: []
    };

    setEditingProjectType(type);
    setEditingProject(newProj);
  };

  const handleSaveProject = (updatedProject: Project) => {
    setProjects(prev => {
      const exists = prev.some(p => p.id === updatedProject.id);
      if (exists) {
        return prev.map(p => p.id === updatedProject.id ? updatedProject : p);
      } else {
        return [updatedProject, ...prev];
      }
    });

    setEditingProject(null);
    setEditingProjectType(null);
    (window as any).showToast(t("Project saved successfully!", "Projekt bol úspešne uložený!", "Projekt sikeresen mentve!"));
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(t("Are you sure you want to delete this project?", "Naozaj chcete vymazať tento projekt?", "Biztosan törli ezt a projektet?"))) {
      return;
    }

    setProjects(prev => prev.filter(p => p.id !== id));
    (window as any).showToast(t("Project deleted.", "Projekt bol vymazaný.", "Projekt törölve."));
  };

  const calculateProgress = (project: Project) => {
    if (!project.gantt || project.gantt.length === 0) return 0;
    const sum = project.gantt.reduce((acc, row) => acc + (row.progress || 0), 0);
    return Math.round(sum / project.gantt.length);
  };

  const renderIcon = (iconName: string, className?: string) => {
    const IconComponent = (Icons as any)[iconName];
    if (IconComponent) return <IconComponent className={className} />;
    return <Briefcase className={className} />;
  };

  /* How much time is left, in words. Red past the deadline, amber inside the
     type's warning window, plain otherwise — and never alarming for a project
     that is already finished or cancelled. */
  const deadlineLabel = (dl: ProjectDeadlineStatus) =>
    dl.tone === "closed"
      ? formatDateLocalized(dl.deadline, userLanguage)
      : dl.isOverdue
        ? t(`${dl.overdueDays} days overdue`, `${dl.overdueDays} dní po termíne`, `${dl.overdueDays} nappal késésben`)
        : dl.daysLeft === 0
          ? t("Due today", "Termín je dnes", "Ma esedékes")
          : t(`${dl.daysLeft} days left`, `Ostáva ${dl.daysLeft} dní`, `${dl.daysLeft} nap van hátra`);

  const deadlineToneClass = (dl: ProjectDeadlineStatus) =>
    dl.tone === "overdue"
      ? "bg-rose-50 text-rose-600 border-rose-200"
      : dl.tone === "soon"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-slate-50 text-slate-500 border-slate-200";

  const renderDeadlineBadge = (dl: ProjectDeadlineStatus) => (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${deadlineToneClass(dl)}`}
      title={formatDateLocalized(dl.deadline, userLanguage)}
    >
      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
      <span>{deadlineLabel(dl)}</span>
    </span>
  );
  if (editingProject && editingProjectType) {
    return (
      <ProjectDetailsView
        project={editingProject}
        projectType={editingProjectType}
        leads={leads}
        users={users}
        userLanguage={userLanguage}
        financialRecords={financialRecords}
        setFinancialRecords={setFinancialRecords}
        financialCategories={financialCategories}
        setFinancialCategories={setFinancialCategories}
        currencyCode={currencyCode}
        onClose={() => {
          setEditingProject(null);
          setEditingProjectType(null);
          window.location.hash = "projects";
        }}
        onSave={handleSaveProject}
      />
    );
  }

  return (
    <div className="space-y-6 text-left">
      
      {/* Top Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-4 select-none">
        <div className="flex flex-col">
          <h2 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-purple-600" />
            {t("Project Management", "Manažment projektov", "Projektmenedzsment")}
          </h2>
          <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1">
            {t("Track deliverables, roadmaps, and client workflows", "Sledovanie dodávok, plánov a klientskych procesov", "Szállítások, útemtervek és ügyfélfolyamatok nyomon követése")}
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => setActiveSubTab("list")}
            className={`px-4 py-2 rounded-xl font-heading font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
              activeSubTab === "list"
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            {t("Projects List", "Zoznam projektov", "Projektek listája")}
          </button>
          <button
            onClick={() => setActiveSubTab("settings")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-heading font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
              activeSubTab === "settings"
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            <Settings className="h-4 w-4" />
            <span>{t("Settings", "Nastavenia", "Beállítások")}</span>
          </button>
        </div>
      </div>

      {activeSubTab === "settings" ? (
        <div className="mt-4">
          <ProjectSettings
            projectTypes={projectTypes}
            setProjectTypes={setProjectTypes}
            userLanguage={userLanguage}
            canEdit={canEdit}
            projectAutoCreate={projectAutoCreate}
            setProjectAutoCreate={setProjectAutoCreate}
            autoStartCreate={pendingTypeCreate}
            onAutoStartCreateHandled={() => setPendingTypeCreate(false)}
          />
        </div>
      ) : (
        <>
          {/* Summary badging widgets */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-panel p-4.5 rounded-3xl border border-white/60 bg-white/95 shadow-glass text-left">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                {t("Total Projects", "Projekty celkovo", "Összes projekt")}
              </span>
              <span className="font-heading font-bold text-2xl text-slate-800 mt-1 block">
                {totalProjects}
              </span>
            </div>
            <div className="glass-panel p-4.5 rounded-3xl border border-white/60 bg-white/95 shadow-glass text-left">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                {t("Active Projects", "Aktívne projekty", "Aktív projektek")}
              </span>
              <span className="font-heading font-bold text-2xl text-purple-600 mt-1 block">
                {activeCount}
              </span>
            </div>
            <div className="glass-panel p-4.5 rounded-3xl border border-white/60 bg-white/95 shadow-glass text-left">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                {t("Completed Projects", "Dokončené projekty", "Befejezett projektek")}
              </span>
              <span className="font-heading font-bold text-2xl text-emerald-600 mt-1 block">
                {completedCount}
              </span>
            </div>
          </div>

          {/* Filtering and Actions header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t("Search projects...", "Vyhľadať projekty...", "Projekt keresése...")}
                  className="w-full pl-9.5 pr-4 py-2.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs font-semibold text-slate-800 bg-white"
                />
              </div>

              {/* Status Filter */}
              <CustomSelect
                value={selectedStatusFilter}
                onChange={(v) => setSelectedStatusFilter(v)}
                options={[
                  { value: "all", label: t("All Statuses", "Všetky stavy", "Minden állapot") },
                  { value: "active", label: t("Active", "Aktívne", "Aktív") },
                  { value: "completed", label: t("Completed", "Dokončené", "Befejezett") },
                  { value: "on_hold", label: t("On Hold", "Pozastavené", "Függőben") },
                  { value: "cancelled", label: t("Cancelled", "Zrušené", "Törölt") },
                ]}
              />

              {/* Type Filter */}
              <CustomSelect
                value={selectedTypeFilter}
                onChange={(v) => setSelectedTypeFilter(v)}
                options={[
                  { value: "all", label: t("All Types", "Všetky typy", "Minden típus") },
                  ...projectTypes.map(pt => ({ value: pt.id, label: pt.name })),
                ]}
              />

              {/* Cards or table. */}
              <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100 border border-slate-200 select-none">
                {([
                  { mode: "grid" as const, Icon: LayoutGrid, label: t("Grid view", "Zobrazenie kariet", "Kártyás nézet") },
                  { mode: "list" as const, Icon: Rows3, label: t("List view", "Zobrazenie zoznamu", "Lista nézet") },
                ]).map(({ mode, Icon, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    title={label}
                    aria-label={label}
                    aria-pressed={viewMode === mode}
                    className={`p-2 rounded-xl transition-all cursor-pointer ${
                      viewMode === mode
                        ? "bg-white text-indigo-600 shadow-sm"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </button>
                ))}
              </div>
            </div>

            {/* Create Project Button with Type Dropdown */}
            {canEdit && (
              <div className="relative select-none" ref={createDropdownRef}>
                <button
                  onClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-wider hover:bg-indigo-700 shadow-md shadow-indigo-600/10 cursor-pointer"
                >
                  <Plus className="h-4.5 w-4.5" />
                  <span>{t("New Project", "Nový projekt", "Új projekt")}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 ml-1" />
                </button>

                {isCreateDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-slate-200 shadow-xl py-2 z-[950] animate-in slide-in-from-top-2 duration-250">
                    <span className="block px-4 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-1.5 text-left">
                      {t("Select Project Type", "Vyberte typ projektu", "Válasszon projekt típust")}
                    </span>
                    {projectTypes.length === 0 ? (
                      <span className="block px-4 py-2 text-xs text-slate-400 italic text-left">
                        {t("No types configured yet.", "Zatiaľ nie sú nastavené typy.", "Még nincsenek típusok.")}
                      </span>
                    ) : (
                      projectTypes.map(type => (
                        <button
                          key={type.id}
                          onClick={() => handleStartCreateProject(type)}
                          className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: type.color }} />
                          <span>{type.name}</span>
                        </button>
                      ))
                    )}

                    {/* The way out of an empty list — and the shortcut for adding
                        another type without hunting through the settings tab. */}
                    <button
                      onClick={handleStartCreateProjectType}
                      className="w-full text-left px-4 py-2 mt-1.5 border-t border-slate-100 pt-2.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0" />
                      <span>{t("New project type", "Nový typ projektu", "Új projekt típus")}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Results — roomy cards or a dense table, per the view toggle above.
              Both read the same rows and derive the same title, deadline and
              progress, so a project cannot say one thing in one view and
              something else in the other. */}
          {filteredProjects.length === 0 ? (
            <div className="glass-panel p-12 rounded-3xl border border-white/60 bg-white/95 text-center text-slate-400 shadow-glass mt-6">
              {projectTypes.length === 0 ? (
                <>
                  <p className="text-sm font-semibold">
                    {t(
                      "No project types yet — a project needs a type to be created from.",
                      "Zatiaľ žiadne typy projektov — projekt sa dá vytvoriť len z typu.",
                      "Még nincsenek projekt típusok — projekt csak típusból hozható létre.",
                    )}
                  </p>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleStartCreateProjectType}
                      className="inline-flex items-center gap-1.5 mt-4 px-5 py-2.5 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-wider hover:bg-indigo-700 shadow-md shadow-indigo-600/10 cursor-pointer"
                    >
                      <Plus className="h-4.5 w-4.5" />
                      <span>{t("New project type", "Nový typ projektu", "Új projekt típus")}</span>
                    </button>
                  )}
                </>
              ) : (
                <p className="text-sm font-semibold">{t("No projects found matching filters.", "Nenašli sa žiadne projekty.", "Nem találhatóak projektek.")}</p>
              )}
            </div>
          ) : viewMode === "list" ? (
            <div className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass mt-6 overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70">
                      {[
                        t("Project", "Projekt", "Projekt"),
                        t("Type", "Typ", "Típus"),
                        t("Client", "Klient", "Ügyfél"),
                        t("Managers", "Manažéri", "Menedzserek"),
                        t("Deadline", "Termín", "Határidő"),
                        t("Progress", "Postup", "Haladás"),
                        t("Status", "Stav", "Állapot"),
                      ].map(label => (
                        <th key={label} className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                          {label}
                        </th>
                      ))}
                      <th className="px-4 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map(p => {
                      const pType = projectTypes.find(t => t.id === p.projectTypeId);
                      if (!pType) return null;

                      const lead = leads.find(l => l.id === p.leadId);
                      const title = projectDisplayName(p, leads, t("Untitled project", "Projekt bez názvu", "Névtelen projekt"));
                      const progress = calculateProgress(p);
                      const dl = evaluateProjectDeadline(p, pType, today);

                      return (
                        <tr
                          key={p.id}
                          onClick={() => {
                            setEditingProjectType(pType);
                            setEditingProject(p);
                          }}
                          className="border-b border-slate-100 last:border-0 hover:bg-indigo-50/40 transition-colors cursor-pointer group"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: pType.color }} />
                              <span className="font-heading font-bold text-[13px] text-slate-800 group-hover:text-indigo-600 transition-colors truncate">
                                {title}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
                              {renderIcon(pType.icon, "h-3.5 w-3.5 shrink-0")}
                              {pType.name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                            {lead?.name || <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-500 max-w-[14rem]">
                            {p.managers && p.managers.length > 0
                              ? <span className="block truncate" title={p.managers.join(", ")}>{p.managers.join(", ")}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {dl ? renderDeadlineBadge(dl) : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {pType.hasGantt && p.gantt && p.gantt.length > 0 ? (
                              <div className="flex items-center gap-2 min-w-[7rem]">
                                <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden border border-slate-200/50">
                                  <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: pType.color }} />
                                </div>
                                <span className="text-[10px] font-bold text-slate-500 tabular-nums">{progress}%</span>
                              </div>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${
                              p.status === "completed"
                                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                : p.status === "on_hold"
                                  ? "bg-amber-50 text-amber-600 border-amber-100"
                                  : p.status === "cancelled"
                                    ? "bg-rose-50 text-rose-600 border-rose-100"
                                    : "bg-purple-50 text-purple-600 border-purple-100"
                            }`}>
                              {p.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={(e) => handleDeleteProject(p.id, e)}
                                className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                title={t("Delete Project", "Vymazať projekt", "Projekt törlése")}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
              {filteredProjects.map(p => {
                const pType = projectTypes.find(t => t.id === p.projectTypeId);
                if (!pType) return null;

                const lead = leads.find(l => l.id === p.leadId);
                const title = projectDisplayName(p, leads, t("Untitled project", "Projekt bez názvu", "Névtelen projekt"));
                const progress = calculateProgress(p);
                const dl = evaluateProjectDeadline(p, pType, today);

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setEditingProjectType(pType);
                      setEditingProject(p);
                    }}
                    className="glass-panel p-5 rounded-3xl border border-white/60 bg-white/95 shadow-glass hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col text-left group relative"
                  >
                    {/* Project Type Badge */}
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold shadow-sm"
                        style={{ backgroundColor: pType.color, color: readableOn(pType.color) }}
                      >
                        {renderIcon(pType.icon, "h-3.5 w-3.5")}
                        <span>{pType.name}</span>
                      </div>

                      {/* Status badge */}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        p.status === "completed"
                          ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                          : p.status === "on_hold"
                            ? "bg-amber-50 text-amber-600 border-amber-100"
                            : p.status === "cancelled"
                              ? "bg-rose-50 text-rose-600 border-rose-100"
                              : "bg-purple-50 text-purple-600 border-purple-100"
                      }`}>
                        {p.status}
                      </span>
                    </div>

                    {/* The project's own name, or the client it is paired with. */}
                    <h4 className="font-heading font-bold text-slate-800 group-hover:text-indigo-600 transition-colors text-base">
                      {title}
                    </h4>

                    {/* The paired client, once the project carries a name of its
                        own and the heading is no longer showing it. */}
                    {lead && lead.name !== title && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 font-bold mt-1">
                        <Briefcase className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{lead.name}</span>
                      </div>
                    )}
                    {!lead && (
                      <span className="block text-[11px] text-slate-400 font-bold mt-1">
                        {t("Unassigned client", "Nepriradený klient", "Nincs hozzárendelve")}
                      </span>
                    )}

                    {/* Assigned Managers */}
                    {p.managers && p.managers.length > 0 && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 font-bold mt-2">
                        <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{p.managers.join(", ")}</span>
                      </div>
                    )}

                    <div className="flex-1 min-h-[20px]" />

                    {/* Deadline countdown */}
                    {dl && <div className="mt-4 shrink-0 select-none">{renderDeadlineBadge(dl)}</div>}

                    {/* Roadmap Progress Bar */}
                    {pType.hasGantt && p.gantt && p.gantt.length > 0 && (
                      <div className="mt-4.5 space-y-1.5 shrink-0 select-none">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                          <span>{t("Roadmap Progress", "Postup projektu", "Projekt haladása")}</span>
                          <span className="text-slate-700">{progress}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 relative overflow-hidden border border-slate-200/50">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${progress}%`,
                              backgroundColor: pType.color
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Hover delete trigger */}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteProject(p.id, e)}
                        className="absolute right-4 top-14 opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer z-10"
                        title={t("Delete Project", "Vymazať projekt", "Projekt törlése")}
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </>
      )}

    </div>
  );
};
