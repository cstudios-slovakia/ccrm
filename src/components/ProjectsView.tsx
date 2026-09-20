import React, { useState, useMemo, useEffect, useRef } from "react";
import * as Icons from "lucide-react";
import { Plus, Trash2, Settings, Search, Users, Briefcase, ChevronDown, ChevronLeft, LayoutGrid, Rows3, CalendarClock, Flag, ArrowUp, ArrowDown, ArrowUpDown, Lock, Star, Check, Minus, Paperclip } from "lucide-react";
import type { Project, ProjectAttribute, ProjectAutoCreateSettings, ProjectStatus, ProjectType, Lead, UserProfile, FinancialRecord, FinancialCategory } from "../types";
import { ProjectDetailsView } from "./ProjectDetailsView";
import type { Task } from "../types";
import type { TaskAccess } from "../utils/taskSelectors";
import { ProjectSettings } from "./ProjectSettings";
import { ProjectListViewMenu } from "./ProjectListViewMenu";
import { CustomSelect } from "./ui/CustomSelect";
import { StarRating } from "./ui/StarRating";
import type { Language } from "../utils/translations";
import { FULL_MODULE_ACCESS } from "../utils/permissions";
import type { ModuleAccess } from "../utils/permissions";
import { readableOn } from "../utils/accentColor";
import { parseAppHash } from "../utils/hash";
import {
  DEFAULT_PROJECT_STATUS,
  evaluateProjectDeadline,
  projectDisplayName,
  projectDelayReason,
  projectMissedDeadline,
  projectNeedsDelayReason,
  projectStatusBadgeClass,
  projectStatusLabel,
  projectStatusOptions,
  projectStatusOrder,
} from "../utils/projects";
import type { ProjectDeadlineStatus } from "../utils/projects";
import { todayLocal, formatDateLocalized, formatTimestampLocalized } from "../utils/localTime";
import { useUserPref } from "../utils/userPrefs";
import { isAttributeSortKey, nextProjectSort, normalizeProjectSort, sortProjects } from "../utils/projectSort";
import type { ProjectSort, ProjectSortKey } from "../utils/projectSort";
import { matchesRatingFilter, ratingFilterOptions, ratingValue } from "../utils/rating";
import {
  BUILTIN_COLUMN_LABELS,
  asAttributeList,
  isBooleanCheckbox,
  projectAttributeSortValue,
  resolveProjectColumns,
  toStoredColumns,
} from "../utils/projectColumns";
import type { BuiltinProjectColumnKey, ResolvedProjectColumn } from "../utils/projectColumns";
import { currencyForRegion, formatMoney, isMoneyValueEmpty, parseMoneyValue } from "../utils/currency";

/*
  The summary strip's chips. Each tone is written out in full because Tailwind
  only ships the class names it can literally see — a class assembled at runtime
  from `bg-${tone}-600` would compile to nothing.
*/
const STAT_CHIP_TONES = {
  slate: {
    idle: "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700",
    active: "bg-slate-900 border-slate-900 text-white",
    count: "text-slate-800",
  },
  sky: {
    idle: "border-slate-200 text-slate-500 hover:border-sky-200 hover:text-sky-600",
    active: "bg-sky-600 border-sky-600 text-white",
    count: "text-sky-600",
  },
  purple: {
    idle: "border-slate-200 text-slate-500 hover:border-purple-200 hover:text-purple-600",
    active: "bg-purple-600 border-purple-600 text-white",
    count: "text-purple-600",
  },
  emerald: {
    idle: "border-slate-200 text-slate-500 hover:border-emerald-200 hover:text-emerald-600",
    active: "bg-emerald-600 border-emerald-600 text-white",
    count: "text-emerald-600",
  },
  amber: {
    idle: "border-slate-200 text-slate-500 hover:border-amber-200 hover:text-amber-600",
    active: "bg-amber-600 border-amber-600 text-white",
    count: "text-amber-600",
  },
  rose: {
    idle: "border-slate-200 text-slate-500 hover:border-rose-200 hover:text-rose-600",
    active: "bg-rose-600 border-rose-600 text-white",
    count: "text-rose-600",
  },
} as const;

/*
  One tone per project status, matching the badge colours in utils/projects.ts —
  a chip and the badge on the row it counts wear the same colour.
*/
const STATUS_CHIP_TONES: Record<ProjectStatus, typeof STAT_CHIP_TONES[keyof typeof STAT_CHIP_TONES]> = {
  new: STAT_CHIP_TONES.sky,
  active: STAT_CHIP_TONES.purple,
  completed: STAT_CHIP_TONES.emerald,
  on_hold: STAT_CHIP_TONES.amber,
  cancelled: STAT_CHIP_TONES.rose,
};

/*
  The status dropdown in the filter bar. The chips above it do the same job and
  carry the counts as well, so it is hidden rather than deleted — everything it
  needs is still wired up, and one constant brings it back.
*/
const SHOW_STATUS_DROPDOWN = false;

/** The "no manager assigned" row in the manager filter. Not a real name. */
const UNASSIGNED_MANAGER = "__unassigned__";

interface ProjectsViewProps {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  projectTypes: ProjectType[];
  setProjectTypes: React.Dispatch<React.SetStateAction<ProjectType[]>>;
  leads: Lead[];
  users: UserProfile[];
  userLanguage: Language;
  /**
   * The user's view/edit/delete answers for the projects module. `edit` gates
   * every control that creates or changes a project (and the project settings
   * tab's inputs), `delete` the controls that remove one. Defaults to full
   * access so a caller that has not wired permissions yet loses nothing.
   */
  access?: ModuleAccess;
  /**
   * What the server actually enforces on project types and auto-create rules
   * (the `general_config` module) — not the same permission as `access` above.
   * Gates the Settings tab and everything inside it, so an edit offered here
   * can never be one `sync.php` silently drops.
   */
  settingsAccess?: ModuleAccess;
  /**
   * What the server enforces on `financialRecords` (the `financial` module).
   * Gates the project finance tab, which writes into a collection this
   * screen's own `access` does not cover.
   */
  financeAccess?: ModuleAccess;
  /** Rules for turning every incoming lead into a project (edited in the Settings tab). */
  projectAutoCreate?: ProjectAutoCreateSettings;
  setProjectAutoCreate?: React.Dispatch<React.SetStateAction<ProjectAutoCreateSettings>>;
  /** Interest categories, so each can be given its own auto-created project type. */
  leadCategories?: string[];
  financialRecords?: FinancialRecord[];
  setFinancialRecords?: React.Dispatch<React.SetStateAction<FinancialRecord[]>>;
  financialCategories?: FinancialCategory[];
  setFinancialCategories?: React.Dispatch<React.SetStateAction<FinancialCategory[]>>;
  currencyCode?: string | null;
  /** Every task; a project's Tasks tab lists and creates the ones linked to it. */
  tasks?: Task[];
  setTasks?: React.Dispatch<React.SetStateAction<Task[]>>;
  taskStates?: string[];
  taskStateColors?: Record<string, string>;
  taskAccess?: TaskAccess;
  currentUser?: UserProfile;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  projects,
  setProjects,
  projectTypes,
  setProjectTypes,
  leads,
  users,
  userLanguage,
  access = FULL_MODULE_ACCESS,
  settingsAccess = FULL_MODULE_ACCESS,
  financeAccess = FULL_MODULE_ACCESS,
  projectAutoCreate,
  setProjectAutoCreate,
  leadCategories = [],
  financialRecords = [],
  setFinancialRecords,
  financialCategories = [],
  setFinancialCategories,
  currencyCode,
  tasks,
  setTasks,
  taskStates,
  taskStateColors,
  taskAccess,
  currentUser
}) => {
  const t = (en: string, sk: string, hu: string) => userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  // Read once here; every handler below checks the flag before it writes.
  const canEdit = access.edit;
  const canDelete = access.delete;

  const [activeSubTab, setActiveSubTab] = useState<"list" | "settings">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("all");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("all");
  const [selectedManagerFilter, setSelectedManagerFilter] = useState("all");
  /* Star priority, same options as the leads list — see utils/rating.ts. */
  const [selectedRatingFilter, setSelectedRatingFilter] = useState("all");
  /* Its own dimension rather than another status: a project can be late in any
     status, so "overdue" cannot live in the status dropdown. */
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingProjectType, setEditingProjectType] = useState<ProjectType | null>(null);

  // "+ New Project" dropdown control
  const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false);
  const createDropdownRef = useRef<HTMLDivElement>(null);

  /* Roomy cards or a dense table. Kept in the user's DB-backed preferences, so
     the choice follows them to their next device like the leads list's does. */
  const [viewMode, setViewMode] = useUserPref("projectsViewMode");

  /* How the list is ordered. The table's column headers and the sort menu in the
     filter bar write the same DB-backed preference, so cards and table agree and
     the choice follows the user to their next device. */
  const [storedSort, setStoredSort] = useUserPref("projectsSort");
  const sort = normalizeProjectSort(storedSort);
  const setSort = (next: ProjectSort) => setStoredSort(next.key === "default" ? null : next);

  /* Set when someone picks "New project type" from the create dropdown; handed
     to ProjectSettings, which opens its create form and hands it straight back. */
  const [pendingTypeCreate, setPendingTypeCreate] = useState(false);

  // One clock for every countdown on the screen.
  const today = todayLocal();

  /* One deadline verdict per project, so the summary strip's "overdue" count
     and the filter behind it can never disagree about which projects are late. */
  const overdueIds = useMemo(() => {
    const ids = new Set<string>();
    projects.forEach(p => {
      const dl = evaluateProjectDeadline(p, projectTypes.find(pt => pt.id === p.projectTypeId), today);
      if (dl?.isOverdue) ids.add(p.id);
    });
    return ids;
  }, [projects, projectTypes, today]);

  /* Projects past their deadline with nobody having written down why — the red
     flag. Counted here so the flag filter and the badges on the rows are the
     same verdict. */
  const unexplainedIds = useMemo(() => {
    const ids = new Set<string>();
    projects.forEach(p => {
      const dl = evaluateProjectDeadline(p, projectTypes.find(pt => pt.id === p.projectTypeId), today);
      if (projectNeedsDelayReason(p, dl)) ids.add(p.id);
    });
    return ids;
  }, [projects, projectTypes, today]);

  // Counts behind the summary strip. One chip per real project status, so the
  // strip and the (now hidden) status dropdown can never offer different lists.
  const totalProjects = projects.length;
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return counts;
  }, [projects]);
  const overdueCount = overdueIds.size;

  /* Who the list can be narrowed to. Projects store manager NAMES, not ids (see
     ProjectDetailsView), so the options are names too: everyone who is already
     managing something, plus every user who could be given a project. */
  const managerOptions = useMemo(() => {
    const names = new Set<string>();
    projects.forEach(p => (p.managers || []).forEach(m => { if (m) names.add(m); }));
    users.forEach(u => { if (u.name) names.add(u.name); });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [projects, users]);

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
      const matchesManager =
        selectedManagerFilter === "all" ||
        (selectedManagerFilter === UNASSIGNED_MANAGER
          ? !(p.managers && p.managers.length > 0)
          : (p.managers || []).includes(selectedManagerFilter));
      const matchesOverdue = !overdueOnly || overdueIds.has(p.id);
      const matchesRating = matchesRatingFilter(p.rating, selectedRatingFilter);

      return matchesSearch && matchesStatus && matchesType && matchesManager && matchesOverdue && matchesRating;
    });
  }, [projects, projectTypes, leads, searchQuery, selectedStatusFilter, selectedTypeFilter, selectedManagerFilter, selectedRatingFilter, overdueOnly, overdueIds]);

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
      const id = params.get("edit") || params.get("id") || params.get("project");
      if (!id) return;

      const normalizedTarget = id.toLowerCase().trim();
      const project = projects.find(p => 
        p.id === id || 
        (p.name && p.name.toLowerCase() === normalizedTarget) ||
        (p.name && p.name.toLowerCase().includes(normalizedTarget))
      );
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
    if (!canEdit) return;
    setIsCreateDropdownOpen(false);
    setActiveSubTab("settings");
    setPendingTypeCreate(true);
  };

  const handleStartCreateProject = (type: ProjectType) => {
    if (!canEdit) return;
    setIsCreateDropdownOpen(false);

    // Create new blank project
    const newProj: Project = {
      id: "proj-" + Date.now(),
      projectTypeId: type.id,
      leadId: null,
      clientId: null,
      status: DEFAULT_PROJECT_STATUS,
      managers: [],
      data: {},
      timeline: [],
      gantt: []
    };

    setEditingProjectType(type);
    setEditingProject(newProj);
  };

  /**
   * Writes the project back. `close` is what the Save button does — the
   * controls that save on the spot (status, budget, a file upload) pass false,
   * because throwing the reader back to the list mid-edit loses their place.
   */
  const handleSaveProject = (updatedProject: Project, { close = true }: { close?: boolean } = {}) => {
    // The details view hides its own save controls in read-only mode; this is
    // the backstop for any path that still reaches it.
    if (!canEdit) return;
    setProjects(prev => {
      const exists = prev.some(p => p.id === updatedProject.id);
      if (exists) {
        return prev.map(p => p.id === updatedProject.id ? updatedProject : p);
      } else {
        return [updatedProject, ...prev];
      }
    });

    if (close) {
      setEditingProject(null);
      setEditingProjectType(null);
    } else {
      // Staying open: hand the card what was just saved, or the next save
      // builds on the version it was opened with and reverts this one.
      setEditingProject(updatedProject);
    }
    (window as any).showToast(t("Project saved successfully!", "Projekt bol úspešne uložený!", "Projekt sikeresen mentve!"));
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canDelete) return;
    if (!window.confirm(t("Are you sure you want to delete this project?", "Naozaj chcete vymazať tento projekt?", "Biztosan törli ezt a projektet?"))) {
      return;
    }

    setProjects(prev => prev.filter(p => p.id !== id));
    (window as any).showToast(t("Project deleted.", "Projekt bol vymazaný.", "Projekt törölve."));
  };

  /**
   * Rating a project from the list, the way the leads list rates a lead: one
   * click on a star writes it straight into the project — no edit mode, no save
   * button, no trip through the details view. Clicking the star a project
   * already wears clears the rating again, which is the only way back to
   * "not rated" once one has been set.
   */
  const handleRateProject = (id: string, stars: number) => {
    if (!canEdit) return;
    setProjects(prev => prev.map(p => (
      p.id === id ? { ...p, rating: ratingValue(p.rating) === stars ? 0 : stars } : p
    )));
  };

  const calculateProgress = (project: Project) => {
    if (!project.gantt || project.gantt.length === 0) return 0;
    const sum = project.gantt.reduce((acc, row) => acc + (row.progress || 0), 0);
    return Math.round(sum / project.gantt.length);
  };

  /* The currency a money attribute falls back to when it carries none of its
     own — the workspace default, or the one the language implies. */
  const defaultCurrency = currencyCode || currencyForRegion(userLanguage);

  /* Which project type's column layout the table follows.

     A custom attribute belongs to one type, so a column showing it means
     nothing to a project of another: the layout is honoured only where the list
     is unambiguously about one type — because the type filter picks it, or
     because the workspace has only that one. A mixed list falls back to the
     built-in columns, which every project can answer.

     Deliberately not "whatever type the rows happen to all be": that reading
     would change the table's shape mid-search, as a query narrowed the list to
     one type and back. */
  const layoutType = useMemo(() => {
    if (selectedTypeFilter !== "all") {
      return projectTypes.find(pt => pt.id === selectedTypeFilter) || null;
    }
    return projectTypes.length === 1 ? projectTypes[0] : null;
  }, [selectedTypeFilter, projectTypes]);

  /* A list of mixed types keeps its own built-in-only layout, per user; a list
     of one type follows that type's layout, shared by everyone. Both are edited
     from the View menu in the filter bar. */
  const [mixedListColumns, setMixedListColumns] = useUserPref("projectsListColumns");

  /** Every column the table can draw, hidden ones included, in order. */
  const allColumns = useMemo<ResolvedProjectColumn[]>(
    () => layoutType
      ? resolveProjectColumns(layoutType.attributes, layoutType.listColumns)
      : resolveProjectColumns(undefined, mixedListColumns),
    [layoutType, mixedListColumns]
  );

  /** The columns the table draws, in order. */
  const activeColumns = useMemo(() => allColumns.filter(c => c.visible), [allColumns]);

  /* A type's layout is workspace config, so changing it takes the same right
     as editing the type in Settings; the mixed layout is the user's own. */
  const canEditColumns = !layoutType || settingsAccess.edit;

  const saveColumns = (next: ResolvedProjectColumn[] | null) => {
    if (!layoutType) {
      setMixedListColumns(next ? toStoredColumns(next) : null);
      return;
    }
    if (!settingsAccess.edit) return;
    const typeId = layoutType.id;
    setProjectTypes(prev => prev.map(pt => pt.id === typeId
      ? { ...pt, listColumns: next ? toStoredColumns(next) : [] }
      : pt));
  };

  /* Ordering by an attribute column only makes sense while that column is on
     screen. Switch back to "all types", or to a type that does not carry it,
     and the stored key would sort every row by a value none of them has — so
     the list quietly returns to its default order instead. */
  const effectiveSort = useMemo<ProjectSort>(
    () => (isAttributeSortKey(sort.key) && !activeColumns.some(c => c.key === sort.key)
      ? { key: "default", direction: "asc" }
      : sort),
    [sort, activeColumns]
  );

  /* What sorting an attribute column compares, for the columns on screen. Empty
     while none is shown, which is the usual case. */
  const sortableAttributes = useMemo(
    () => activeColumns
      .filter((c): c is ResolvedProjectColumn & { attribute: ProjectAttribute } => !!c.attribute)
      .map(c => ({ key: c.key, attribute: c.attribute })),
    [activeColumns]
  );

  /* The filtered list in the chosen order. A project with no value for the
     sorted column (no deadline, no roadmap, a blank attribute) always goes last. */
  const sortedProjects = useMemo(() => {
    const statusOrder = projectStatusOrder() as string[];
    const contactName = (id: string) => leads.find(l => l.id === id)?.name || null;
    const moneyAmount = (raw: unknown) => parseMoneyValue(raw, defaultCurrency).amount;

    return sortProjects(filteredProjects, effectiveSort, p => {
      const pType = projectTypes.find(pt => pt.id === p.projectTypeId);
      const rank = statusOrder.indexOf(p.status);
      let attributes: Record<string, string | number | null> | undefined;
      if (sortableAttributes.length > 0) {
        attributes = {};
        for (const { key, attribute } of sortableAttributes) {
          attributes[key] = projectAttributeSortValue(attribute, p.data?.[attribute.id], { moneyAmount, contactName });
        }
      }
      return {
        name: projectDisplayName(p, leads, ""),
        client: leads.find(l => l.id === p.leadId)?.name || "",
        type: pType?.name || "",
        managers: (p.managers || []).join(", "),
        // Unrated travels as null, not 0 — see ProjectSortValues.rating.
        rating: ratingValue(p.rating) || null,
        deadline: evaluateProjectDeadline(p, pType, today)?.deadline ?? null,
        progress: pType?.hasGantt && p.gantt && p.gantt.length > 0 ? calculateProgress(p) : null,
        statusRank: rank === -1 ? statusOrder.length : rank,
        attributes,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredProjects, effectiveSort.key, effectiveSort.direction, projectTypes, leads, today, sortableAttributes, defaultCurrency]);

  /* The dropdown and the table headers write the same preference, so the
     dropdown offers the attribute columns the table is currently showing —
     otherwise the cards view could not be ordered by one at all. */
  const sortOptions: { value: ProjectSortKey; label: string }[] = [
    { value: "default", label: t("Default order", "Predvolené poradie", "Alapértelmezett sorrend") },
    { value: "name", label: t("Project name", "Názov projektu", "Projekt neve") },
    { value: "client", label: t("Client", "Klient", "Ügyfél") },
    { value: "type", label: t("Type", "Typ", "Típus") },
    { value: "managers", label: t("Managers", "Manažéri", "Menedzserek") },
    { value: "rating", label: t("Rating", "Hodnotenie", "Értékelés") },
    { value: "deadline", label: t("Deadline", "Termín", "Határidő") },
    { value: "progress", label: t("Progress", "Postup", "Haladás") },
    { value: "status", label: t("Status", "Stav", "Állapot") },
    ...sortableAttributes.map(({ key, attribute }) => ({ value: key as ProjectSortKey, label: attribute.name })),
  ];

  const renderIcon = (iconName: string, className?: string) => {
    const IconComponent = (Icons as any)[iconName];
    if (IconComponent) return <IconComponent className={className} />;
    return <Briefcase className={className} />;
  };

  /* How much time is left, in words. Red past the deadline, amber inside the
     type's warning window, plain otherwise — and never alarming for a project
     that is already finished or cancelled. */
  const deadlineLabel = (dl: ProjectDeadlineStatus) =>
    dl.tone === "finished"
      ? t(
          `Finished ${formatDateLocalized(dl.finishedAt, userLanguage)}`,
          `Dokončené ${formatDateLocalized(dl.finishedAt, userLanguage)}`,
          `Befejezve ${formatDateLocalized(dl.finishedAt, userLanguage)}`,
        )
      : dl.tone === "closed"
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
        : dl.tone === "finished"
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-slate-50 text-slate-500 border-slate-200";

  // A finished project's tooltip still carries the plan it was measured against.
  const deadlineTitle = (dl: ProjectDeadlineStatus) =>
    dl.tone !== "finished" || !dl.plannedDeadline
      ? formatDateLocalized(dl.deadline, userLanguage)
      : dl.finishedLateDays > 0
        ? t(
            `Deadline ${formatDateLocalized(dl.plannedDeadline, userLanguage)} — finished ${dl.finishedLateDays} days late`,
            `Termín ${formatDateLocalized(dl.plannedDeadline, userLanguage)} — dokončené ${dl.finishedLateDays} dní po termíne`,
            `Határidő ${formatDateLocalized(dl.plannedDeadline, userLanguage)} — ${dl.finishedLateDays} nap késéssel befejezve`,
          )
        : t(
            `Deadline ${formatDateLocalized(dl.plannedDeadline, userLanguage)} — finished on time`,
            `Termín ${formatDateLocalized(dl.plannedDeadline, userLanguage)} — dokončené v termíne`,
            `Határidő ${formatDateLocalized(dl.plannedDeadline, userLanguage)} — határidőre befejezve`,
          );

  const renderDeadlineBadge = (dl: ProjectDeadlineStatus) => (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${deadlineToneClass(dl)}`}
      title={deadlineTitle(dl)}
    >
      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
      <span>{deadlineLabel(dl)}</span>
    </span>
  );

  /* The red flag. A project that missed its deadline carries one — still open
     and past it, or finished after it. Filled and shouting while the delay is
     unexplained, quiet and holding the reason as its tooltip once someone has
     written it down. Nothing at all when the project is on time. */
  const renderDelayFlag = (p: Project, dl: ProjectDeadlineStatus | null) => {
    if (!projectMissedDeadline(dl)) return null;
    const reason = projectDelayReason(p);

    return reason ? (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-500 whitespace-nowrap max-w-[12rem]"
        title={t(`Reason for the delay: ${reason}`, `Dôvod meškania: ${reason}`, `A késés oka: ${reason}`)}
      >
        <Flag className="h-3 w-3 shrink-0" />
        <span className="truncate">{reason}</span>
      </span>
    ) : (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-rose-300 bg-rose-600 text-[10px] font-black uppercase tracking-wider text-white whitespace-nowrap animate-pulse"
        title={t(
          "Past the deadline and no reason given — open the project and explain the delay.",
          "Po termíne a bez zdôvodnenia — otvorte projekt a vysvetlite meškanie.",
          "Határidőn túl, indoklás nélkül — nyissa meg a projektet és indokolja a késést.",
        )}
      >
        <Flag className="h-3 w-3 shrink-0 fill-current" />
        <span>{t("Reason missing", "Chýba dôvod", "Hiányzó indoklás")}</span>
      </span>
    );
  };

  /* -------------------------------------------------------------------- */
  /* The table's columns                                                   */
  /* -------------------------------------------------------------------- */

  /** A built-in column's own name, or the attribute's, for one shown as a column. */
  const columnLabel = (col: ResolvedProjectColumn) => {
    if (col.attribute) return col.attribute.name;
    const label = BUILTIN_COLUMN_LABELS[col.key as BuiltinProjectColumnKey];
    return label ? t(label[0], label[1], label[2]) : col.key;
  };

  const emptyCell = <span className="text-slate-300 text-xs">—</span>;

  /**
   * A custom attribute in one table cell: the value in the shape its type
   * deserves, but compact — a list of files becomes a count, a long text is
   * truncated with the whole of it on hover. The roomy version lives on the
   * project itself (renderAttrValue in ProjectDetailsView).
   */
  const renderAttributeCell = (attr: ProjectAttribute, rawVal: unknown): React.ReactNode => {
    switch (attr.type) {
      case "money": {
        if (isMoneyValueEmpty(rawVal, defaultCurrency)) return emptyCell;
        const m = parseMoneyValue(rawVal, defaultCurrency);
        return (
          <span className="text-xs font-bold text-slate-700 tabular-nums whitespace-nowrap">
            {formatMoney(m.amount || 0, m.currency, userLanguage)}
          </span>
        );
      }
      case "date":
        return rawVal
          ? <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">{formatDateLocalized(String(rawVal), userLanguage)}</span>
          : emptyCell;
      case "datetime":
        return rawVal
          ? <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">{formatTimestampLocalized(String(rawVal).replace("T", " "), userLanguage)}</span>
          : emptyCell;
      case "number":
        return rawVal === "" || rawVal === null || rawVal === undefined
          ? emptyCell
          : <span className="text-xs font-semibold text-slate-600 tabular-nums">{String(rawVal)}</span>;
      case "checkbox": {
        if (isBooleanCheckbox(attr)) {
          // A yes/no box is answered either way, so both answers are drawn.
          return rawVal
            ? <Check className="h-4 w-4 text-emerald-600" aria-label={t("Yes", "Áno", "Igen")} />
            : <Minus className="h-4 w-4 text-slate-300" aria-label={t("No", "Nie", "Nem")} />;
        }
        const picked = asAttributeList(rawVal).map(String);
        if (picked.length === 0) return emptyCell;
        return (
          <div className="flex flex-wrap items-center gap-1 max-w-[14rem]" title={picked.join(", ")}>
            {picked.slice(0, 2).map(opt => (
              <span key={opt} className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-600 truncate max-w-[7rem]">
                {opt}
              </span>
            ))}
            {picked.length > 2 && (
              <span className="text-[10px] font-bold text-slate-400 tabular-nums">+{picked.length - 2}</span>
            )}
          </div>
        );
      }
      case "files": {
        const files = asAttributeList(rawVal);
        if (files.length === 0) return emptyCell;
        return (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 whitespace-nowrap"
            title={files.map((f: any) => f?.name).filter(Boolean).join(", ")}
          >
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="tabular-nums">{files.length}</span>
          </span>
        );
      }
      case "contact": {
        const contact = typeof rawVal === "string" ? leads.find(l => l.id === rawVal) : undefined;
        if (!contact) return emptyCell;
        return (
          <span className="block truncate max-w-[12rem] text-xs font-semibold text-slate-600" title={contact.name}>
            {contact.name}
          </span>
        );
      }
      default: {
        if (rawVal === "" || rawVal === null || rawVal === undefined) return emptyCell;
        const text = String(rawVal);
        return (
          <span className="block truncate max-w-[14rem] text-xs font-semibold text-slate-600" title={text}>
            {text}
          </span>
        );
      }
    }
  };

  /** Everything a cell can need about the row it sits in, worked out once per row. */
  interface ProjectRowContext {
    project: Project;
    pType: ProjectType;
    lead: Lead | undefined;
    title: string;
    progress: number;
    dl: ProjectDeadlineStatus | null;
  }

  const renderColumnCell = (col: ResolvedProjectColumn, row: ProjectRowContext): React.ReactNode => {
    const { project: p, pType, lead, title, progress, dl } = row;

    if (col.attribute) return renderAttributeCell(col.attribute, p.data?.[col.attribute.id]);

    switch (col.key) {
      case "name":
        return (
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: pType.color }} />
            <span className="font-heading font-bold text-[13px] text-slate-800 group-hover:text-indigo-600 transition-colors truncate">
              {title}
            </span>
          </div>
        );
      case "type":
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 whitespace-nowrap">
            {renderIcon(pType.icon, "h-3.5 w-3.5 shrink-0")}
            {pType.name}
          </span>
        );
      case "client":
        return lead?.name
          ? <span className="text-xs font-semibold text-slate-600">{lead.name}</span>
          : emptyCell;
      case "managers":
        return p.managers && p.managers.length > 0
          ? (
            <span className="block truncate max-w-[14rem] text-xs font-semibold text-slate-500" title={p.managers.join(", ")}>
              {p.managers.join(", ")}
            </span>
          )
          : emptyCell;
      case "rating":
        /* Rated on the spot, like a lead in its own list. Read-only for a role
           that cannot edit — the dots still show the priority, they just do not move. */
        return (
          <StarRating
            rating={ratingValue(p.rating)}
            onChange={canEdit ? (stars) => handleRateProject(p.id, stars) : undefined}
            userLanguage={userLanguage}
          />
        );
      case "deadline":
        return dl ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {renderDeadlineBadge(dl)}
            {renderDelayFlag(p, dl)}
          </div>
        ) : emptyCell;
      case "progress":
        return pType.hasGantt && p.gantt && p.gantt.length > 0 ? (
          <div className="flex items-center gap-2 min-w-[7rem]">
            <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden border border-slate-200/50">
              <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: pType.color }} />
            </div>
            <span className="text-[10px] font-bold text-slate-500 tabular-nums">{progress}%</span>
          </div>
        ) : emptyCell;
      case "status":
        return (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${projectStatusBadgeClass(p.status)}`}>
            {projectStatusLabel(p.status, t)}
          </span>
        );
      default:
        return emptyCell;
    }
  };

  /* "+ New Project" — the primary action, and since 1.9 the button that sits
     where the old "Projects List" tab used to: the list is the only view now,
     so a tab that switched to it had nothing to do. */
  const createProjectControl = (
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
        canEdit={canEdit}
        canDelete={canDelete}
        financeAccess={financeAccess}
        tasks={tasks}
        setTasks={setTasks}
        projects={projects}
        taskStates={taskStates}
        taskStateColors={taskStateColors}
        taskAccess={taskAccess}
        currentUser={currentUser}
        onClose={() => {
          setEditingProject(null);
          setEditingProjectType(null);
          window.location.hash = "projects";
        }}
        onSave={handleSaveProject}
        onDelete={(id) => {
          // The card asks for confirmation itself, so this only removes and closes.
          if (!canDelete) return;
          setProjects(prev => prev.filter(p => p.id !== id));
          setEditingProject(null);
          setEditingProjectType(null);
          window.location.hash = "projects";
          (window as any).showToast(t("Project deleted.", "Projekt bol vymazaný.", "Projekt törölve."));
        }}
        isNew={!projects.some(p => p.id === editingProject.id)}
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
            {/* Read-only: the role can look at projects but not touch them. Said
                once, up here, rather than by every control that is missing. */}
            {!canEdit && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 text-[10px] font-black uppercase tracking-wider text-amber-700 whitespace-nowrap"
                title={t(
                  "Your role can view projects but not create or change them.",
                  "Vaša rola môže projekty prezerať, ale nie vytvárať ani meniť.",
                  "A szerepköre megtekintheti a projekteket, de nem hozhat létre és nem módosíthat.",
                )}
              >
                <Lock className="h-3 w-3 shrink-0" />
                <span>{t("Read-only access", "Iba na čítanie", "Csak olvasható")}</span>
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1">
            {t("Track deliverables, roadmaps, and client workflows", "Sledovanie dodávok, plánov a klientskych procesov", "Szállítások, útemtervek és ügyfélfolyamatok nyomon követése")}
          </p>
        </div>

        {/* Actions. Settings used to be the second half of a two-tab switcher,
            which read as two equal views of this screen — it is not one, it is
            configuration you visit rarely. It is now a single quiet button in,
            and a single way back out; the space the "Projects List" tab wasted
            (a tab that switched to the view you were already on) belongs to the
            action people actually come here for. */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          {activeSubTab === "settings" ? (
            <button
              onClick={() => setActiveSubTab("list")}
              className="flex items-center gap-1.5 pl-3 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-white text-slate-600 font-heading font-bold text-xs uppercase tracking-wider hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span>{t("Back to projects", "Späť na projekty", "Vissza a projektekhez")}</span>
            </button>
          ) : (
            <>
              {canEdit && createProjectControl}
              {settingsAccess.view && (
                <button
                  onClick={() => setActiveSubTab("settings")}
                  title={t("Project settings", "Nastavenia projektov", "Projekt beállítások")}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-slate-400 font-heading font-bold text-xs uppercase tracking-wider hover:bg-slate-100 hover:text-slate-700 transition-all cursor-pointer"
                >
                  <Settings className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">{t("Settings", "Nastavenia", "Beállítások")}</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {activeSubTab === "settings" ? (
        <div className="mt-4">
          <ProjectSettings
            projectTypes={projectTypes}
            setProjectTypes={setProjectTypes}
            userLanguage={userLanguage}
            canEdit={settingsAccess.edit}
            projectAutoCreate={projectAutoCreate}
            setProjectAutoCreate={setProjectAutoCreate}
            leadCategories={leadCategories}
            autoStartCreate={pendingTypeCreate}
            onAutoStartCreateHandled={() => setPendingTypeCreate(false)}
          />
        </div>
      ) : (
        <>
          {/* Summary strip — and the status filter itself. It used to show four
              hand-picked chips next to a dropdown carrying the real list, so
              two controls filtered the same thing and disagreed about what the
              statuses were. The chips are now the whole list, straight from
              PROJECT_STATUSES, and the dropdown below is hidden.

              "Overdue" is deliberately not among them: it is not a status — a
              project can be late in any of them — so it sits apart, as the red
              flag it is. */}
          <div className="flex flex-wrap items-center gap-2 select-none">
            {([
              { key: "all", label: t("All", "Všetky", "Összes"), count: totalProjects, tone: STAT_CHIP_TONES.slate },
              ...projectStatusOrder().map(value => ({
                key: value as string,
                label: projectStatusLabel(value, t),
                count: statusCounts[value] || 0,
                tone: STATUS_CHIP_TONES[value],
              })),
            ]).map(({ key, label, count, tone }) => {
              const active = selectedStatusFilter === key;

              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    // A second click on the chip you are already filtered by
                    // clears the filter, rather than being a no-op.
                    setSelectedStatusFilter(prev => (prev === key ? "all" : key));
                  }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border shadow-sm transition-all cursor-pointer active:scale-[0.98] ${
                    active ? tone.active : `bg-white/95 ${tone.idle}`
                  }`}
                >
                  <span className={`font-heading font-bold text-base leading-none tabular-nums ${active ? "text-white" : tone.count}`}>
                    {count}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                    {label}
                  </span>
                </button>
              );
            })}

            {/* The red flag, on its own side of a divider: late projects, and
                how many of them still owe an explanation. */}
            <span className="h-6 w-px bg-slate-200 mx-0.5 hidden sm:block" />
            <button
              type="button"
              aria-pressed={overdueOnly}
              onClick={() => setOverdueOnly(v => !v)}
              title={t(
                "Projects past their deadline",
                "Projekty po termíne",
                "Határidőn túli projektek",
              )}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border shadow-sm transition-all cursor-pointer active:scale-[0.98] ${
                overdueOnly ? STAT_CHIP_TONES.rose.active : `bg-white/95 ${STAT_CHIP_TONES.rose.idle}`
              }`}
            >
              <Flag className={`h-3.5 w-3.5 shrink-0 ${overdueOnly ? "text-white" : "text-rose-500"}`} />
              <span className={`font-heading font-bold text-base leading-none tabular-nums ${overdueOnly ? "text-white" : STAT_CHIP_TONES.rose.count}`}>
                {overdueCount}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                {t("Overdue", "Po termíne", "Késésben")}
              </span>
              {unexplainedIds.size > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-black tabular-nums ${
                    overdueOnly ? "bg-white/20 text-white" : "bg-rose-100 text-rose-700"
                  }`}
                  title={t(
                    `${unexplainedIds.size} without a reason for the delay`,
                    `${unexplainedIds.size} bez zdôvodnenia meškania`,
                    `${unexplainedIds.size} késési indoklás nélkül`,
                  )}
                >
                  {t(`${unexplainedIds.size} unexplained`, `${unexplainedIds.size} bez dôvodu`, `${unexplainedIds.size} indoklás nélkül`)}
                </span>
              )}
            </button>
          </div>

          {/* One filter bar, one row. The three dropdowns used to be full-width
              blocks stacked under the search box — a "bar" three rows tall —
              because CustomSelect's trigger is w-100%; each now sits in a fixed
              track of its own. The view switcher is parked on the right, away
              from the filters it is not one of. */}
          <div className="glass-panel relative z-20 flex flex-wrap items-center gap-2 sm:gap-2.5 p-2 sm:p-2.5 rounded-3xl border border-white/60 bg-white/95 shadow-glass">
            {/* Search */}
            <div className="relative flex-1 min-w-[10rem] sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t("Search projects...", "Vyhľadať projekty...", "Projekt keresése...")}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs font-semibold text-slate-800 bg-white"
              />
            </div>

            {/* Status — hidden. The chips above are the status filter now;
                this is kept wired to the same state so it can be brought back
                by flipping SHOW_STATUS_DROPDOWN. */}
            {SHOW_STATUS_DROPDOWN && (
            <div className="w-full sm:w-auto sm:min-w-[130px] flex-1 sm:flex-initial shrink-0">
              <CustomSelect
                className="h-10"
                value={selectedStatusFilter}
                onChange={(v) => setSelectedStatusFilter(v)}
                options={[
                  { value: "all", label: t("All Statuses", "Všetky stavy", "Minden állapot") },
                  ...projectStatusOptions(t),
                ]}
              />
            </div>
            )}

            {/* Type */}
            <div className="w-full sm:w-auto sm:min-w-[130px] flex-1 sm:flex-initial shrink-0">
              <CustomSelect
                className="h-10"
                value={selectedTypeFilter}
                onChange={(v) => setSelectedTypeFilter(v)}
                options={[
                  { value: "all", label: t("All Types", "Všetky typy", "Minden típus") },
                  ...projectTypes.map(pt => ({ value: pt.id, label: pt.name })),
                ]}
              />
            </div>

            {/* Manager. "Who is on this?" was the one question the bar could not
                answer — the column was there to read but not to filter by. */}
            <div className="w-full sm:w-auto sm:min-w-[145px] flex-1 sm:flex-initial shrink-0">
              <CustomSelect
                className="h-10"
                icon={<Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                value={selectedManagerFilter}
                onChange={(v) => setSelectedManagerFilter(v)}
                options={[
                  { value: "all", label: t("All managers", "Všetci manažéri", "Minden menedzser") },
                  ...managerOptions.map(name => ({ value: name, label: name })),
                  { value: UNASSIGNED_MANAGER, label: t("Unassigned", "Bez manažéra", "Nincs menedzser") },
                ]}
              />
            </div>

            {/* Star priority. The same dropdown, and the same meanings, as the
                one over the leads list — both read utils/rating.ts. */}
            <div className="w-full sm:w-auto sm:min-w-[135px] flex-1 sm:flex-initial shrink-0">
              <CustomSelect
                className="h-10"
                icon={<Star className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                value={selectedRatingFilter}
                onChange={(v) => setSelectedRatingFilter(v)}
                options={ratingFilterOptions(t)}
              />
            </div>

            {/* Order and columns — the only way to sort the cards; the table
                headers write the same sort preference. */}
            <div className="sm:ml-auto shrink-0 flex items-center gap-2">
              <ProjectListViewMenu
                t={t}
                sort={effectiveSort}
                sortOptions={sortOptions}
                onSortChange={setSort}
                columns={allColumns}
                onColumnsChange={saveColumns}
                columnLabel={columnLabel}
                canEditColumns={canEditColumns}
                columnsScope={layoutType
                  ? (settingsAccess.edit
                    ? t(`Columns of the "${layoutType.name}" type — the same for everyone.`, `Stĺpce typu „${layoutType.name}“ — rovnaké pre všetkých.`, `A(z) „${layoutType.name}” típus oszlopai — mindenkinek ugyanazok.`)
                    : t(`Columns of the "${layoutType.name}" type. Only someone who can edit project types can change them.`, `Stĺpce typu „${layoutType.name}“. Zmeniť ich môže len ten, kto smie upravovať typy projektov.`, `A(z) „${layoutType.name}” típus oszlopai. Csak projekt típusokat szerkeszteni jogosult felhasználó módosíthatja őket.`))
                  : t("All types: built-in columns only. Filter the list by one type to show its own attributes as columns.", "Všetky typy: len vstavané stĺpce. Vyfiltrujte zoznam podľa typu a zobrazíte aj jeho atribúty.", "Minden típus: csak beépített oszlopok. Szűrjön egy típusra, hogy az attribútumai is oszlopként megjelenjenek.")}
                onReset={() => {
                  setSort({ key: "default", direction: "asc" });
                  if (canEditColumns) saveColumns(null);
                }}
              />

              {/* Cards or table. */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 select-none shrink-0">
                {([
                  { mode: "list" as const, Icon: Rows3, label: t("List view", "Zobrazenie zoznamu", "Lista nézet") },
                  { mode: "grid" as const, Icon: LayoutGrid, label: t("Grid view", "Zobrazenie kariet", "Kártyás nézet") },
                ]).map(({ mode, Icon, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    title={label}
                    aria-label={label}
                    aria-pressed={viewMode === mode}
                    className={`p-2 rounded-lg transition-all cursor-pointer ${
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
                <table className="w-full text-left border-collapse min-w-[840px]">
                  {/* The head is drawn from the layout the project type set —
                      built-in columns and its own attributes alike — so what a
                      column is, and whether it is here at all, is decided in one
                      place. See utils/projectColumns.ts. */}
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70">
                      {activeColumns.map(col => {
                        const key = col.key as ProjectSortKey;
                        // Click to sort; again to flip; a third time returns to the default order.
                        const active = effectiveSort.key === key;
                        const SortIcon = !active ? ArrowUpDown : effectiveSort.direction === "asc" ? ArrowUp : ArrowDown;
                        return (
                          <th
                            key={col.key}
                            aria-sort={active ? (effectiveSort.direction === "asc" ? "ascending" : "descending") : "none"}
                            className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap"
                          >
                            <button
                              type="button"
                              onClick={() => setSort(nextProjectSort(effectiveSort, key))}
                              className={`group/sort inline-flex items-center gap-1 uppercase tracking-widest font-black cursor-pointer transition-colors duration-150 ${
                                active ? "text-indigo-600" : "hover:text-slate-700"
                              }`}
                            >
                              {columnLabel(col)}
                              <SortIcon
                                className={`h-3 w-3 shrink-0 transition-opacity duration-150 ${
                                  active ? "opacity-100" : "opacity-30 group-hover/sort:opacity-80"
                                }`}
                              />
                            </button>
                          </th>
                        );
                      })}
                      <th className="px-4 py-3 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProjects.map(p => {
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
                          {activeColumns.map(col => (
                            <td key={col.key} className="px-4 py-3">
                              {renderColumnCell(col, { project: p, pType, lead, title, progress, dl })}
                            </td>
                          ))}
                          <td className="px-4 py-3">
                            {canDelete && (
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
              {sortedProjects.map(p => {
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
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${projectStatusBadgeClass(p.status)}`}>
                        {projectStatusLabel(p.status, t)}
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

                    {/* Star priority, under the name the way the leads list
                        shows it. Clickable straight from the card. */}
                    <StarRating
                      className="mt-2"
                      rating={ratingValue(p.rating)}
                      onChange={canEdit ? (stars) => handleRateProject(p.id, stars) : undefined}
                      userLanguage={userLanguage}
                    />

                    {/* Assigned Managers */}
                    {p.managers && p.managers.length > 0 && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 font-bold mt-2">
                        <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{p.managers.join(", ")}</span>
                      </div>
                    )}

                    <div className="flex-1 min-h-[20px]" />

                    {/* Deadline countdown */}
                    {dl && (
                      <div className="mt-4 shrink-0 select-none flex flex-wrap items-center gap-1.5">
                        {renderDeadlineBadge(dl)}
                        {renderDelayFlag(p, dl)}
                      </div>
                    )}

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
                    {canDelete && (
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
