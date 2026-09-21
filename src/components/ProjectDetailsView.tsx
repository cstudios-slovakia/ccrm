import React, { useState, useEffect, useMemo } from "react";
import * as Icons from "lucide-react";
import {
  Plus, Trash2, Upload, FileText, ArrowLeft, Mail, Phone,
  Coins, TrendingUp, TrendingDown, DollarSign,
  PieChart, X, Edit3, Wallet, Check, Paperclip, CircleCheck, CircleAlert
} from "lucide-react";
import type {
  Project, ProjectType, Lead, UserProfile,
  ProjectTimelineEvent, ProjectGanttRow, ProjectCustomFileField, ProjectUploadedFile,
  FinancialRecord, FinancialCategory, FinancialStatus, FinancialType
} from "../types";
import { getTranslation, type Language } from "../utils/translations";
import { nowLocalStamp, formatTimestampLocalized, formatDateLocalized, todayLocal } from "../utils/localTime";
import {
  CURRENCY_OPTIONS,
  currencyForRegion,
  formatMoney,
  isMoneyValueEmpty,
  parseMoneyValue,
} from "../utils/currency";
import { mergeFinancialRecord, derivePaidDate, FINANCIAL_STATUS_OPTIONS } from "../utils/financialRecordMerge";
import { splitRecordAmounts } from "../utils/financialOverviewTable";
import { categoryBreadcrumbs } from "../utils/financialCategoryTree";
import { evaluateProjectDeadline, finishedAtForStatus, projectDisplayName, projectMissedDeadline, projectPipelineSegments, projectStartDate, projectStatusBadgeClass, projectStatusDotClass, projectStatusOptions } from "../utils/projects";
import { CustomSelect } from "./ui/CustomSelect";
import { ClientSelect } from "./ui/ClientSelect";
import { PipelineStrip } from "./ui/PipelineStrip";
import { StarRating } from "./ui/StarRating";
import { ratingValue } from "../utils/rating";
import { missingChecklistItems, readChecklistValue, writeChecklistValue } from "../utils/projectColumns";
import { ProjectTasksPanel } from "./ProjectTasksPanel";
import type { Task } from "../types";
import { isDoneTaskState } from "../utils/projectTasks";
import { isOnPersonalDashboard, type TaskAccess } from "../utils/taskSelectors";
import { FULL_MODULE_ACCESS, type ModuleAccess } from "../utils/permissions";

/** The tabs of the right-hand column, as they also appear in the URL's `tab` parameter. */
type RightTab = "timeline" | "tasks" | "gantt" | "finances" | "files";
const isRightTab = (value: string | null): value is RightTab =>
  value === "timeline" || value === "tasks" || value === "gantt" || value === "finances" || value === "files";

interface ProjectDetailsViewProps {
  project: Project | null;
  projectType: ProjectType | null;
  leads: Lead[];
  users: UserProfile[];
  userLanguage: Language;
  financialRecords?: FinancialRecord[];
  setFinancialRecords?: React.Dispatch<React.SetStateAction<FinancialRecord[]>>;
  financialCategories?: FinancialCategory[];
  setFinancialCategories?: React.Dispatch<React.SetStateAction<FinancialCategory[]>>;
  currencyCode?: string | null;
  onClose: () => void;
  /** Called with `close: false` on every change — the view has no Save
      button and saves itself in place, leaving the card open. */
  onSave: (updatedProject: Project, options?: { close?: boolean }) => void;
  /**
   * Removes the project and closes the card. Without it the header's delete
   * button is not offered — the same way the list hides its own without
   * `canDelete`.
   */
  onDelete?: (projectId: string) => void;
  /** A project that has never been saved: opens with the header's name input ready, so it can be named. */
  isNew?: boolean;
  /**
   * Whether the user may change the project at all — the card, its attributes
   * and uploads, the timeline, the Gantt rows, the budget and the finance rows.
   * Off, the view is read-only. Defaults to true.
   */
  canEdit?: boolean;
  /**
   * Whether the user may remove things — attachments, timeline events, Gantt
   * rows and finance rows. Never wider than `canEdit`. Defaults to true.
   */
  canDelete?: boolean;
  /**
   * What the server actually enforces on `financialRecords` (the `financial`
   * module) — separate from `canEdit`/`canDelete`, which are the *projects*
   * module's answer. The finance tab writes into a collection this view's own
   * permission does not cover, so it needs its own gate. Defaults to full
   * access so a caller that has not wired it yet loses nothing.
   */
  financeAccess?: ModuleAccess;
  /**
   * Every task in the workspace; the Tasks tab lists the ones carrying this
   * project's id. Without `setTasks` the tab is not offered.
   */
  tasks?: Task[];
  setTasks?: React.Dispatch<React.SetStateAction<Task[]>>;
  /** For the task drawer's "Project" field. */
  projects?: Project[];
  taskStates?: string[];
  taskStateColors?: Record<string, string>;
  /** Task permissions — separate from the project ones in `canEdit`/`canDelete`. */
  taskAccess?: TaskAccess;
  currentUser?: UserProfile;
}

/**
 * The right column's tabs all wear the same shape — an icon that takes the tab's
 * own colour, a label, and an optional badge — so the row reads as one control
 * rather than five differently-sized buttons. `shrink-0` + `whitespace-nowrap`
 * keep each tab whole; the row scrolls sideways when the column is too narrow.
 */
const tabClass = "shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-heading font-bold text-[11px] uppercase tracking-wider whitespace-nowrap transition-all active:scale-95 cursor-pointer";
const tabActiveClass = "bg-slate-900 text-white shadow-sm";
const tabIdleClass = "text-slate-500 hover:bg-slate-100 hover:text-slate-800";
const tabBadgeClass = "px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none";

const DEFAULT_TASK_STATES = ["New", "In progress", "Blocked", "Done"];
const FULL_TASK_ACCESS: TaskAccess = { view: true, create: true, edit: true, delete: true, viewAll: true };

export const ProjectDetailsView: React.FC<ProjectDetailsViewProps> = ({
  project,
  projectType,
  leads,
  users,
  userLanguage,
  financialRecords = [],
  setFinancialRecords,
  financialCategories = [],
  currencyCode,
  onClose,
  onSave,
  onDelete,
  isNew = false,
  canEdit = true,
  canDelete: canDeleteProp = true,
  financeAccess = FULL_MODULE_ACCESS,
  tasks = [],
  setTasks,
  projects = [],
  taskStates = DEFAULT_TASK_STATES,
  taskStateColors,
  taskAccess = FULL_TASK_ACCESS,
  currentUser
}) => {
  const t = (en: string, sk: string, hu: string) => userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;
  // Removing something is a change, so the delete flag never outranks edit.
  const canDelete = canEdit && canDeleteProp;
  // The finance tab writes financialRecords, which the server gates on the
  // `financial` module, not `projects` — so it needs its own edit/delete
  // answer rather than inheriting canEdit/canDelete above.
  const canEditFinance = financeAccess.edit;
  const canDeleteFinance = financeAccess.edit && financeAccess.delete;
  const money = (v: number) => formatMoney(v, currencyCode, userLanguage);
  // What a money attribute starts on. Only the default: the currency is stored
  // with the value, so each record keeps whichever one it was actually filled in.
  const defaultCurrency = currencyCode || currencyForRegion(userLanguage);

  /**
   * The input pair behind a `money` attribute — amount on the left, its own
   * currency on the right. Shared by project attributes and timeline event
   * attributes so the two cannot drift apart.
   */
  /**
   * A list-valued attribute (a multi-option checkbox, a files list) is stored in
   * a free-form column, so sync.php JSON-encodes it on the way in and the
   * project-data table hands the text straight back. Local state holds the array
   * itself. Read both, or a saved checkbox selection comes back as a string,
   * fails `Array.isArray`, and silently reads as nothing ticked.
   */
  const asList = (rawVal: unknown): any[] => {
    if (Array.isArray(rawVal)) return rawVal;
    if (typeof rawVal === "string" && rawVal.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(rawVal);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const renderMoneyInput = (
    rawVal: unknown,
    updateVal: (next: any) => void,
    compact = false
  ) => {
    const current = parseMoneyValue(rawVal, defaultCurrency);
    const inputClass = compact
      ? "flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800"
      : "flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800";
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="any"
          value={current.amount === null ? "" : String(current.amount)}
          onChange={e => {
            const raw = e.target.value.trim().replace(",", ".");
            const parsed = Number(raw);
            updateVal({
              amount: raw === "" || !Number.isFinite(parsed) ? null : parsed,
              currency: current.currency,
            });
          }}
          className={inputClass}
          placeholder={t("Amount", "Čiastka", "Összeg")}
        />
        <div className="w-28 shrink-0">
          <CustomSelect
            value={current.currency}
            onChange={code => updateVal({ amount: current.amount, currency: code })}
            className="!text-xs"
            options={CURRENCY_OPTIONS.map(c => ({ value: c.code, label: `${c.code} ${c.symbol}` }))}
          />
        </div>
      </div>
    );
  };

  /**
   * A custom attribute as it reads outside edit mode — the value alone, in the
   * shape its type deserves (a money amount in its own currency, a file as a
   * link, a multi-option checkbox as chips), never an input box.
   */
  const renderAttrValue = (attr: any, rawVal: any): React.ReactNode => {
    const empty = <span className="text-slate-300 italic font-semibold">—</span>;

    switch (attr.type) {
      case "money": {
        if (isMoneyValueEmpty(rawVal, defaultCurrency)) return empty;
        const m = parseMoneyValue(rawVal, defaultCurrency);
        return <span className="font-black text-slate-800">{formatMoney(m.amount || 0, m.currency, userLanguage)}</span>;
      }
      case "date":
        return rawVal ? formatDateLocalized(rawVal, userLanguage) : empty;
      case "datetime":
        return rawVal ? formatTimestampLocalized(String(rawVal).replace("T", " "), userLanguage) : empty;
      case "textarea":
        return rawVal ? <span className="whitespace-pre-line leading-relaxed">{rawVal}</span> : empty;
      case "checkbox": {
        if (!attr.options) return rawVal
          ? t("Yes", "Áno", "Igen")
          : <span className="text-slate-300 italic font-semibold">{t("No", "Nie", "Nem")}</span>;
        const picked = readChecklistValue(rawVal).checked;
        if (picked.length === 0) return empty;
        return (
          <div className="flex flex-wrap gap-1.5">
            {picked.map(opt => (
              <span key={String(opt)} className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600">
                {String(opt)}
              </span>
            ))}
          </div>
        );
      }
      case "files": {
        const files = asList(rawVal);
        if (files.length === 0) return empty;
        return (
          <div className="flex flex-col gap-1">
            {files.map((f: any, i: number) => (
              <a
                key={i}
                href={f.path}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 truncate"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate">{f.name}</span>
              </a>
            ))}
          </div>
        );
      }
      case "contact": {
        const contact = leads.find(l => l.id === rawVal);
        if (!contact) return empty;
        return (
          <a href={`#lead-${contact.id}`} className="text-indigo-600 hover:text-indigo-800 font-black">
            {contact.name}
          </a>
        );
      }
      default:
        return rawVal === "" || rawVal === null || rawVal === undefined ? empty : String(rawVal);
    }
  };

  // Global state wiring
  const [projectName, setProjectName] = useState("");
  const [deadline, setDeadline] = useState("");
  /* Why the project is late. Mandatory once it actually is — see the red flag
     block under the deadline. */
  const [delayReason, setDelayReason] = useState("");
  /* The real start and finish, set by hand. The start is prefilled with the
     creation day; a finish date outranks the deadline in the list. */
  const [startDate, setStartDate] = useState("");
  const [finishedAt, setFinishedAt] = useState("");
  const [status, setStatus] = useState("active");
  /* Star priority, 1-5, 0 while nobody has rated it. Like the status below it,
     a click saves on the spot. */
  const [rating, setRating] = useState(0);
  const [associatedLeadId, setAssociatedLeadId] = useState("");
  const [associatedClientId, setAssociatedClientId] = useState("");
  const [selectedManagers, setSelectedManagers] = useState<string[]>([]);
  // The paired lead is shown as the same green client card the lead view has;
  // the picker only comes back while re-pairing.
  const [pickingClient, setPickingClient] = useState(false);
  // The name is edited in the header itself: a pencil beside the title swaps
  // it for an input, committed on Enter or blur, dropped on Escape.
  const [isEditingNameState, setIsEditingName] = useState(false);
  const isEditingName = canEdit && isEditingNameState;
  const [nameDraft, setNameDraft] = useState("");
  const nameCancelledRef = React.useRef(false);
  // The custom attributes card is edited in place like the rest of the view —
  // anyone who may edit sees the inputs, and every change saves on its own.
  const isEditingAttrs = canEdit;
  const [dynamicData, setDynamicData] = useState<Record<string, any>>({});
  // The label being typed for a checkbox this project adds, per checkbox attribute.
  const [newChecklistLabels, setNewChecklistLabels] = useState<Record<string, string>>({});
  const [timeline, setTimeline] = useState<ProjectTimelineEvent[]>([]);
  const [gantt, setGantt] = useState<ProjectGanttRow[]>([]);
  // File slots added on this project alone, on top of the type's default files.
  const [customFileFields, setCustomFileFields] = useState<ProjectCustomFileField[]>([]);
  const [newCustomFileName, setNewCustomFileName] = useState("");
  // An upload finishes after an await, by which time the render that started it
  // is stale; the Files tab reads the slots from here so two uploads racing
  // each other cannot drop one another's file.
  const latestFilesRef = React.useRef({ data: dynamicData, custom: customFileFields });
  latestFilesRef.current = { data: dynamicData, custom: customFileFields };

  // Right Side tab control with URL sync
  const getInitialRightTab = (): RightTab => {
    const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    const tabParam = params.get("tab");
    return isRightTab(tabParam) ? tabParam : "timeline";
  };

  const [activeRightTab, setActiveRightTab] = useState<RightTab>(getInitialRightTab);

  const handleRightTabChange = (tab: RightTab) => {
    setActiveRightTab(tab);
    const hash = window.location.hash;
    const [base, query] = hash.split("?");
    const params = new URLSearchParams(query || "");
    params.set("tab", tab);
    window.location.hash = `${base}?${params.toString()}`;
  };

  // Project Financial Modal & Form
  const [isFinModalOpen, setIsFinModalOpen] = useState(false);
  const [finEditingRecord, setFinEditingRecord] = useState<FinancialRecord | null>(null);
  const [finFormType, setFinFormType] = useState<FinancialType>("income");
  const [finFormTitle, setFinFormTitle] = useState("");
  const [finFormInvoiceNumber, setFinFormInvoiceNumber] = useState("");
  const [finFormAmountPlanned, setFinFormAmountPlanned] = useState<number | "">("");
  const [finFormAmountReal, setFinFormAmountReal] = useState<number | "">("");
  const [finFormCategoryId, setFinFormCategoryId] = useState("");
  const [finFormStatus, setFinFormStatus] = useState<FinancialStatus>("pending");
  const [finFormIssueDate, setFinFormIssueDate] = useState(todayLocal());
  const [finFormDueDate, setFinFormDueDate] = useState("");
  const [finFormDescription, setFinFormDescription] = useState("");

  // Timeline Event Form
  const [newTeTitle, setNewTeTitle] = useState("");
  const [newTeType, setNewTeType] = useState("note");
  const [newTeContent, setNewTeContent] = useState("");
  const [newTeTime, setNewTeTime] = useState("");
  const [timelineEventData, setTimelineEventData] = useState<Record<string, any>>({});

  // Gantt Row Form
  const [newGeTitle, setNewGeTitle] = useState("");
  const [newGeContactId, setNewGeContactId] = useState("");
  const [newGeStart, setNewGeStart] = useState("");
  const [newGeEnd, setNewGeEnd] = useState("");
  const [columnWidth, setColumnWidth] = useState(60);
  const [selectedGanttEdit, setSelectedGanttEdit] = useState<ProjectGanttRow | null>(null);

  // File Upload states
  const [isUploading, setIsUploading] = useState<string | null>(null); // tracks active attribute.id uploading
  /* Which drop target the pointer is over, so only that one lights up. Paired
     with a counter, not a flag: dragging across a child fires leave on the parent. */
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragDepth = React.useRef(0);

  /* A file dropped beside a slot instead of on it would otherwise be opened by
     the browser, which navigates away from the app and loses the project. */
  useEffect(() => {
    const swallow = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, []);

  useEffect(() => {
    if (projectType?.timelineEventTypes && projectType.timelineEventTypes.length > 0) {
      setNewTeType(projectType.timelineEventTypes[0].id);
    } else {
      setNewTeType("note");
    }
  }, [projectType]);

  /* ── Autosave ─────────────────────────────────────────────────────────────
     There is no Save button: every change in the view is written back on its
     own. The editable fields are compared, in the shape the state holds them,
     against the project as last saved; a difference is saved after a short
     pause, so typing a sentence is one write rather than one per keystroke.
     A change still waiting when the view closes is written out on the way. */
  const editableSnapshot = (p: Project) => ({
    name: p.name || "",
    deadline: p.deadline || "",
    delayReason: p.delayReason || "",
    startDate: projectStartDate(p) || todayLocal(),
    finishedAt: p.finishedAt || "",
    status: p.status || "active",
    rating: ratingValue(p.rating),
    leadId: p.leadId || "",
    clientId: p.clientId || "",
    managers: p.managers || [],
    data: p.data || {},
    customFileFields: Array.isArray(p.customFileFields) ? p.customFileFields : [],
    timeline: p.timeline || [],
    gantt: p.gantt || [],
  });

  /** The project as the view currently holds it, plus any values handed in directly. */
  const buildProject = (overrides: Partial<Project> = {}): Project | null => {
    if (!project || !projectType) return null;
    return {
      ...project,
      name: projectName.trim(),
      // Only a type with deadlines on can hold one. Turning the switch off on
      // the type would otherwise leave an invisible date behind that starts
      // counting down again the moment someone turns it back on.
      deadline: projectType.hasDeadline ? (deadline || null) : null,
      // Only kept while it is still the answer to something: a project that is
      // no longer late has no delay to explain, and leaving the old text behind
      // would make it reappear the next time a date slips.
      delayReason: projectType.hasDeadline ? (delayReason.trim() || null) : null,
      startDate: startDate || null,
      finishedAt: finishedAt || null,
      status,
      rating,
      leadId: associatedLeadId || null,
      clientId: associatedClientId || null,
      managers: selectedManagers,
      data: dynamicData,
      customFileFields,
      timeline,
      gantt,
      ...overrides,
    };
  };

  // Which project the state was last loaded from. Until the load effect has
  // run for a newly opened project the state still holds the previous one,
  // and comparing that against the new project would save it over it.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const pendingSaveRef = React.useRef<Project | null>(null);
  const onSaveRef = React.useRef(onSave);
  onSaveRef.current = onSave;
  const [saveState, setSaveState] = useState<"saved" | "pending">("saved");

  /** Writes out a change that is still waiting for its pause, if there is one. */
  const flushPendingSave = React.useCallback(() => {
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    onSaveRef.current(pending, { close: false });
    setSaveState("saved");
  }, []);

  // Leaving the view — back to the list, or to another module — must not
  // drop the last edit made within the pause.
  useEffect(() => () => flushPendingSave(), [flushPendingSave]);

  // A different project opened in the same view: fresh UI modes and tab.
  useEffect(() => {
    if (!project) return;
    setPickingClient(false);
    // A blank project has nothing to call it yet, so it opens on the name.
    setIsEditingName(isNew);
    nameCancelledRef.current = false;
    setNameDraft(project.name || "");

    // Resolve right tab from URL or defaults
    const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    const tabParam = params.get("tab");
    if (isRightTab(tabParam)) {
      setActiveRightTab(tabParam);
    } else if (projectType) {
      if (projectType.hasTimeline) setActiveRightTab("timeline");
      else if (projectType.hasGantt) setActiveRightTab("gantt");
      else setActiveRightTab("finances");
    }
  }, [project?.id, projectType?.id]);

  useEffect(() => {
    if (!project) return;
    if (project.id !== loadedId) {
      // The previous project's last edit goes out before its state is replaced.
      flushPendingSave();
    } else if (pendingSaveRef.current) {
      // Same project, and an edit of ours is still on its way — reloading now
      // would throw it away.
      return;
    }
    const s = editableSnapshot(project);
    setProjectName(s.name);
    setDeadline(s.deadline);
    setDelayReason(s.delayReason);
    setStartDate(s.startDate);
    setFinishedAt(s.finishedAt);
    setStatus(s.status);
    setRating(s.rating);
    setAssociatedLeadId(s.leadId);
    setAssociatedClientId(s.clientId);
    setSelectedManagers(s.managers);
    setDynamicData(s.data);
    setCustomFileFields(s.customFileFields);
    setTimeline(s.timeline);
    setGantt(s.gantt);
    setLoadedId(project.id);
  }, [project, projectType]);

  const savedSnapshotJson = useMemo(
    () => (project ? JSON.stringify(editableSnapshot(project)) : ""),
    [project],
  );
  const currentSnapshotJson = JSON.stringify({
    name: projectName,
    deadline,
    delayReason,
    startDate,
    finishedAt,
    status,
    rating,
    leadId: associatedLeadId,
    clientId: associatedClientId,
    managers: selectedManagers,
    data: dynamicData,
    customFileFields,
    timeline,
    gantt,
  });
  // A finish before the start is the one value that is never written — the
  // card says so under the dates, and the save resumes once it is fixed.
  const finishBeforeStart = !!(finishedAt && startDate && finishedAt < startDate);

  useEffect(() => {
    if (!project || !canEdit || loadedId !== project.id) return;
    if (currentSnapshotJson === savedSnapshotJson || finishBeforeStart) {
      pendingSaveRef.current = null;
      setSaveState("saved");
      return;
    }
    pendingSaveRef.current = buildProject();
    setSaveState("pending");
    const timer = window.setTimeout(flushPendingSave, 600);
    return () => window.clearTimeout(timer);
  }, [currentSnapshotJson, savedSnapshotJson, finishBeforeStart, loadedId, canEdit]);

  // Project Financials Calculation & Revenue Analysis
  const projectFinancials = useMemo(() => {
    return financialRecords.filter((r) => r.projectId === project?.id);
  }, [financialRecords, project?.id]);

  const projectInvoices = useMemo(() => {
    return projectFinancials.filter((r) => r.type === "income");
  }, [projectFinancials]);

  const projectExpenses = useMemo(() => {
    return projectFinancials.filter((r) => r.type === "expense");
  }, [projectFinancials]);

  const revenueAnalysis = useMemo(() => {
    let totalPlannedIncome = 0;
    let totalRealIncome = 0;
    let totalPlannedExpenses = 0;
    let totalRealExpenses = 0;

    projectFinancials.forEach((r) => {
      const { real } = splitRecordAmounts(r);
      if (r.type === "income") {
        totalPlannedIncome += r.amountPlanned || 0;
        totalRealIncome += real;
      } else {
        totalPlannedExpenses += r.amountPlanned || 0;
        totalRealExpenses += real;
      }
    });

    const plannedProfit = totalPlannedIncome - totalPlannedExpenses;
    const realProfit = totalRealIncome - totalRealExpenses;
    const plannedMarginPct = totalPlannedIncome > 0 ? (plannedProfit / totalPlannedIncome) * 100 : 0;
    const realMarginPct = totalRealIncome > 0 ? (realProfit / totalRealIncome) * 100 : 0;

    // Expenses by category
    const catMap: Record<string, { name: string; planned: number; real: number; color: string }> = {};
    projectExpenses.forEach((e) => {
      const catId = e.categoryId || "uncat";
      const cat = financialCategories.find((c) => c.id === catId);
      const name = e.categoryPath || cat?.name || t("Uncategorized", "Bez kategórie", "Kategória nélkül");
      const color = cat?.color || "#ef4444";
      if (!catMap[catId]) {
        catMap[catId] = { name, planned: 0, real: 0, color };
      }
      catMap[catId].planned += e.amountPlanned || 0;
      catMap[catId].real += splitRecordAmounts(e).real;
    });

    return {
      totalPlannedIncome,
      totalRealIncome,
      totalPlannedExpenses,
      totalRealExpenses,
      plannedProfit,
      realProfit,
      plannedMarginPct,
      realMarginPct,
      invoicesCount: projectInvoices.length,
      expensesCount: projectExpenses.length,
      expensesByCategory: Object.values(catMap).sort((a, b) => b.planned - a.planned)
    };
  }, [projectFinancials, projectInvoices, projectExpenses, financialCategories, userLanguage]);

  /* The budget is a cost ceiling — what the project may spend. The money
     already paid out and the costs planned so far are both measured against
     it; null while no budget is set. */
  const budgetAnalysis = useMemo(() => {
    const budget = Number(project?.budget);
    if (!Number.isFinite(budget) || budget <= 0) return null;
    const spent = revenueAnalysis.totalRealExpenses;
    const planned = revenueAnalysis.totalPlannedExpenses;
    return {
      budget,
      spent,
      planned,
      remaining: budget - spent,
      spentPct: (spent / budget) * 100,
      plannedPct: (planned / budget) * 100,
      tone: spent > budget ? "over" : planned > budget ? "atRisk" : "ok",
    } as const;
  }, [project?.budget, revenueAnalysis]);

  /* The budget editor on the finance tab: null while closed, the typed amount while open. */
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null);
  useEffect(() => setBudgetDraft(null), [project?.id]);

  const handleSaveBudget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || budgetDraft === null) return;
    const raw = budgetDraft.replace(/\s/g, "").replace(",", ".");
    const value = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    // Lives on the project, not in the view's state, so it is written directly.
    handleSave({ budget: value > 0 ? Math.round(value * 100) / 100 : null });
    setBudgetDraft(null);
  };

  const handleOpenProjectFinModal = (type: FinancialType, record?: FinancialRecord) => {
    if (!canEdit) return;
    // This secondary form has no recurring UI at all and can never
    // faithfully represent a recurring rule — it must be edited from
    // Financial Management → Recurring instead.
    if (record?.isRecurring) return;
    if (record) {
      setFinEditingRecord(record);
      setFinFormType(record.type);
      setFinFormTitle(record.title);
      setFinFormInvoiceNumber(record.invoiceNumber || "");
      setFinFormAmountPlanned(record.amountPlanned);
      setFinFormAmountReal(record.amountReal);
      setFinFormCategoryId(record.categoryId || "");
      setFinFormStatus(record.status);
      setFinFormIssueDate(record.issueDate || todayLocal());
      setFinFormDueDate(record.dueDate || "");
      setFinFormDescription(record.description || "");
    } else {
      setFinEditingRecord(null);
      setFinFormType(type);
      setFinFormTitle("");
      setFinFormInvoiceNumber(type === "income" ? `FA-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}` : "");
      setFinFormAmountPlanned("");
      setFinFormAmountReal("");
      setFinFormCategoryId("");
      setFinFormStatus(type === "income" ? "pending" : "planned");
      setFinFormIssueDate(todayLocal());
      setFinFormDueDate("");
      setFinFormDescription("");
    }
    setIsFinModalOpen(true);
  };

  const handleSaveProjectFinancial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditFinance || !finFormTitle.trim() || !project) return;

    const formValues: Partial<FinancialRecord> & Pick<FinancialRecord, "id"> = {
      id: finEditingRecord?.id || `fr-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: finFormTitle.trim(),
      description: finFormDescription.trim() || null,
      categoryId: finFormCategoryId || null,
      amountPlanned: Number(finFormAmountPlanned) || 0,
      amountReal: Number(finFormAmountReal) || 0,
      currency: currencyCode || "EUR",
      status: finFormStatus,
      issueDate: finFormIssueDate,
      dueDate: finFormDueDate || null,
      invoiceNumber: finFormInvoiceNumber.trim() || null,
      paidDate: derivePaidDate(finEditingRecord, finFormStatus)
    };

    // Only recompute the category breadcrumb when the category actually
    // changed (or this is a brand-new record) — otherwise omit it so the
    // merge preserves whatever breadcrumb the record already had.
    const previousCategoryId = finEditingRecord?.categoryId || "";
    if (!finEditingRecord || finFormCategoryId !== previousCategoryId) {
      formValues.categoryPath = finFormCategoryId
        ? categoryBreadcrumbs(financialCategories, finFormCategoryId).map((c) => c.name).join(" > ") || null
        : null;
    }

    if (!finEditingRecord) {
      // A brand-new record from this secondary form is always a one-off —
      // set the fields the form does not render, but only once, at
      // creation. Editing must never re-stamp these (see mergeFinancialRecord).
      formValues.type = finFormType;
      formValues.subtype = finFormType === "income" ? "invoice" : "material";
      formValues.paymentMethod = "bank_transfer";
      formValues.isRecurring = false;
      formValues.projectId = project.id;
      formValues.clientId = associatedClientId || associatedLeadId || null;
      formValues.taxRate = 20;
      formValues.createdBy = (window as any).ccrmCurrentUser?.email || "Admin";
      formValues.createdAt = new Date().toISOString();
    }

    const payload = mergeFinancialRecord(finEditingRecord, formValues);

    if (setFinancialRecords) {
      setFinancialRecords((prev) => {
        const exists = prev.some((r) => r.id === payload.id);
        if (exists) {
          return prev.map((r) => (r.id === payload.id ? payload : r));
        }
        return [payload, ...prev];
      });
    }

    setIsFinModalOpen(false);
  };

  const handleDeleteProjectFinancial = (id: string) => {
    if (!canDeleteFinance) return;
    if (confirm(t("Delete this financial record?", "Vymazať tento finančný záznam?", "Törli ezt a tételt?"))) {
      if (setFinancialRecords) {
        setFinancialRecords((prev) => prev.filter((r) => r.id !== id));
      }
    }
  };

  if (!project || !projectType) return null;

  /** Sends one file to the server and returns it as a file slot stores it, or null when the upload failed. */
  const uploadFile = async (slotId: string, file: File): Promise<ProjectUploadedFile | null> => {
    setIsUploading(slotId);
    const eventId = `proj-${project.id}-${slotId}`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("eventId", eventId);

    try {
      const res = await fetch("/upload.php", {
        method: "POST",
        body: formData
      });
      const resData = await res.json();
      if (!resData.success) {
        alert(t("File upload failed", "Nahrávanie súboru zlyhalo", "Fájl feltöltés sikertelen"));
        return null;
      }
      const sizeStr = file.size > 1024 * 1024
        ? (file.size / (1024 * 1024)).toFixed(1) + " MB"
        : (file.size / 1024).toFixed(0) + " KB";
      return {
        name: resData.fileName || file.name,
        size: sizeStr,
        path: `/uploads/${eventId}_${resData.fileName || file.name}`
      };
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      setIsUploading(null);
    }
  };

  /** Sends a whole selection one by one and keeps the ones that made it. */
  const uploadFiles = async (slotId: string, files: File[]): Promise<ProjectUploadedFile[]> => {
    const done: ProjectUploadedFile[] = [];
    for (const file of files) {
      const one = await uploadFile(slotId, file);
      if (one) done.push(one);
    }
    return done;
  };

  /** The drag handlers every drop zone shares — highlight, and take the files. */
  const dropZone = (id: string, onFiles: (files: File[]) => void) => ({
    onDragEnter: (e: React.DragEvent) => {
      if (!canEdit) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDropTarget(id);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!canEdit) return;
      // Without this the browser keeps its "no drop" cursor and never fires onDrop.
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!canEdit) return;
      e.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDropTarget(null);
    },
    onDrop: (e: React.DragEvent) => {
      if (!canEdit) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepth.current = 0;
      setDropTarget(null);
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) onFiles(files);
    },
  });

  const handleFileUpload = async (attrId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = Array.from(input.files || []);
    input.value = "";
    await addFilesToAttribute(attrId, files);
  };

  /** Appends dropped or picked files to a `files` attribute in edit mode. */
  const addFilesToAttribute = async (attrId: string, files: File[]) => {
    if (files.length === 0 || !canEdit) return;
    const uploaded = await uploadFiles(attrId, files);
    if (uploaded.length === 0) return;
    setDynamicData(prev => ({
      ...prev,
      [attrId]: [...asList(prev[attrId]), ...uploaded]
    }));
  };

  const handleRemoveFile = (attrId: string, fileIndex: number) => {
    if (!canDelete) return;
    const currentFiles = asList(dynamicData[attrId]);
    const nextFiles = currentFiles.filter((_: any, idx: number) => idx !== fileIndex);
    setDynamicData(prev => ({
      ...prev,
      [attrId]: nextFiles
    }));
  };

  /** The upload list and button for a files attribute or a document slot, in edit mode. */
  const renderFilesInput = (attrId: string, val: unknown) => (
    <div
      className={`space-y-2 rounded-xl transition-colors duration-150 ${
        dropTarget === attrId ? "ring-2 ring-indigo-400 bg-indigo-50/60" : ""
      }`}
      {...dropZone(attrId, files => { void addFilesToAttribute(attrId, files); })}
    >
      <div className="flex flex-col gap-1.5">
        {asList(val).map((f, fIdx) => (
          <div key={fIdx} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
            <a
              href={f.path}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 truncate animate-fade-in"
            >
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="truncate">{f.name}</span>
              <span className="text-[10px] text-slate-400 font-medium shrink-0">({f.size})</span>
            </a>
            {canDelete && (
              <button
                type="button"
                onClick={() => handleRemoveFile(attrId, fIdx)}
                className="p-1 hover:bg-rose-50 rounded text-rose-600 shrink-0 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="relative">
        <button
          type="button"
          disabled={isUploading === attrId}
          onClick={() => {
            const input = document.getElementById(`file-input-${attrId}`);
            input?.click();
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:border-slate-400 transition-all cursor-pointer disabled:opacity-50"
        >
          <Upload className="h-4 w-4 text-slate-400" />
          <span>
            {isUploading === attrId
              ? t("Uploading...", "Nahráva sa...", "Feltöltés...")
              : t("Upload file or drop it here", "Nahrať súbor alebo ho sem pretiahnite", "Fájl feltöltése vagy húzza ide")}
          </span>
        </button>
        <input
          type="file"
          multiple
          id={`file-input-${attrId}`}
          onChange={e => handleFileUpload(attrId, e)}
          className="hidden"
        />
      </div>
    </div>
  );

  /* ── Files tab ────────────────────────────────────────────────────────────
     The type's default files (uploads in `data[slot.id]`) followed by the
     slots added on this project alone (uploads inside each slot). None is
     required; a slot with nothing uploaded is only counted as missing. */
  type FileSlot = { id: string; name: string; custom: boolean; files: ProjectUploadedFile[] };
  const fileSlots: FileSlot[] = [
    ...(projectType.fileFields || []).map(f => ({ id: f.id, name: f.name, custom: false, files: asList(dynamicData[f.id]) })),
    ...customFileFields.map(f => ({ id: f.id, name: f.name, custom: true, files: Array.isArray(f.files) ? f.files : [] })),
  ];
  const missingFileCount = fileSlots.filter(s => s.files.length === 0).length;
  const missingFilesLabel = (n: number) =>
    userLanguage === "sk"
      ? n === 1 ? "1 súbor chýba" : n <= 4 ? `${n} súbory chýbajú` : `${n} súborov chýba`
      : userLanguage === "hu"
        ? `${n} fájl hiányzik`
        : `${n} ${n === 1 ? "file" : "files"} missing`;
  const newCustomFileTaken = fileSlots.some(s => s.name.toLowerCase() === newCustomFileName.trim().toLowerCase());
  const canAddCustomFile = canEdit && newCustomFileName.trim() !== "" && !newCustomFileTaken;

  /** Writes the file slots back into the state; the autosave takes it from there. */
  const commitFiles = (nextData: Record<string, any>, nextCustom: ProjectCustomFileField[]) => {
    latestFilesRef.current = { data: nextData, custom: nextCustom };
    setDynamicData(nextData);
    setCustomFileFields(nextCustom);
  };

  /** Adds files to one slot — from its button, or dropped onto its card. */
  const addFilesToSlot = async (slot: FileSlot, files: File[]) => {
    if (files.length === 0 || !canEdit) return;
    const uploaded = await uploadFiles(slot.id, files);
    if (uploaded.length === 0) return;
    // Read the slots back after the await: the render that started the upload
    // is stale, and a second drop must not drop the first one's files.
    const { data, custom } = latestFilesRef.current;
    if (slot.custom) {
      commitFiles(data, custom.map(f => f.id === slot.id ? { ...f, files: [...(f.files || []), ...uploaded] } : f));
    } else {
      commitFiles({ ...data, [slot.id]: [...asList(data[slot.id]), ...uploaded] }, custom);
    }
  };

  const handleSlotUpload = async (slot: FileSlot, e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = Array.from(input.files || []);
    input.value = "";
    await addFilesToSlot(slot, files);
  };

  const handleSlotRemoveFile = (slot: FileSlot, fileIndex: number) => {
    if (!canDelete) return;
    if (!window.confirm(t("Remove this file?", "Odstrániť tento súbor?", "Eltávolítja ezt a fájlt?"))) return;
    const { data, custom } = latestFilesRef.current;
    if (slot.custom) {
      commitFiles(data, custom.map(f => f.id === slot.id ? { ...f, files: (f.files || []).filter((_, i) => i !== fileIndex) } : f));
    } else {
      commitFiles({ ...data, [slot.id]: asList(data[slot.id]).filter((_, i) => i !== fileIndex) }, custom);
    }
  };

  const handleAddCustomFileField = () => {
    if (!canAddCustomFile) return;
    const { data, custom } = latestFilesRef.current;
    const id = "pfile_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    commitFiles(data, [...custom, { id, name: newCustomFileName.trim(), files: [] }]);
    setNewCustomFileName("");
  };

  const handleRemoveCustomFileField = (slot: FileSlot) => {
    if (!canDelete) return;
    if (slot.files.length > 0 && !window.confirm(t(
      "Remove this custom file together with everything uploaded to it?",
      "Odstrániť tento vlastný súbor spolu so všetkým, čo je k nemu nahrané?",
      "Eltávolítja ezt az egyedi fájlt a hozzá feltöltött tartalommal együtt?",
    ))) return;
    const { data, custom } = latestFilesRef.current;
    commitFiles(data, custom.filter(f => f.id !== slot.id));
  };

  /** One file slot on the Files tab: red while nothing is uploaded, green once something is. */
  const renderFileSlot = (slot: FileSlot) => {
    const uploaded = slot.files.length > 0;
    const busy = isUploading === slot.id;
    const dropping = dropTarget === slot.id;
    return (
      <div
        key={slot.id}
        {...dropZone(slot.id, files => { void addFilesToSlot(slot, files); })}
        className={`p-3 rounded-2xl border transition-colors duration-200 animate-fade-in ${
          dropping
            ? "bg-indigo-50 border-indigo-300 ring-2 ring-indigo-400"
            : uploaded ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {uploaded
              ? <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              : <CircleAlert className="h-4 w-4 shrink-0 text-rose-500" />}
            <span className="text-xs font-black text-slate-800 truncate">{slot.name}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wider shrink-0 ${uploaded ? "text-emerald-700" : "text-rose-600"}`}>
              {uploaded ? t("Uploaded", "Nahrané", "Feltöltve") : t("Missing", "Chýba", "Hiányzik")}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canEdit && (
              <label
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px] font-bold text-slate-600 transition-all duration-150 active:scale-95 ${
                  busy ? "opacity-50 cursor-wait pointer-events-none" : "cursor-pointer hover:bg-slate-50 hover:border-slate-300"
                }`}
              >
                <Upload className="h-3.5 w-3.5 text-slate-400" />
                <span>{busy ? t("Uploading...", "Nahráva sa...", "Feltöltés...") : t("Upload", "Nahrať", "Feltöltés")}</span>
                <input type="file" multiple className="hidden" disabled={busy} onChange={e => handleSlotUpload(slot, e)} />
              </label>
            )}
            {slot.custom && canDelete && (
              <button
                type="button"
                onClick={() => handleRemoveCustomFileField(slot)}
                className="p-1.5 rounded-lg hover:bg-white/70 text-rose-600 transition-all duration-150 active:scale-95 cursor-pointer"
                title={t("Remove custom file", "Odstrániť vlastný súbor", "Egyedi fájl eltávolítása")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {canEdit && (dropping || !uploaded) && (
          <p className={`mt-2 px-2.5 py-1.5 rounded-xl border border-dashed text-center text-[10px] font-bold uppercase tracking-wider transition-colors duration-150 ${
            dropping ? "border-indigo-400 text-indigo-600 bg-white/70" : "border-slate-300/70 text-slate-400"
          }`}>
            {t("Drop files here", "Pretiahnite súbory sem", "Húzza ide a fájlokat")}
          </p>
        )}

        {uploaded && (
          <div className="mt-2 flex flex-col gap-1.5">
            {slot.files.map((f, fIdx) => (
              <div key={fIdx} className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-white/80 border border-emerald-100 rounded-xl text-xs font-semibold">
                <a
                  href={f.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 min-w-0 text-indigo-600 hover:text-indigo-800 transition-colors duration-150"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{f.name}</span>
                  {f.size && <span className="text-[10px] text-slate-400 font-medium shrink-0">({f.size})</span>}
                </a>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleSlotRemoveFile(slot, fIdx)}
                    className="p-1 hover:bg-rose-50 rounded text-rose-600 shrink-0 transition-all duration-150 active:scale-95 cursor-pointer"
                    title={t("Remove", "Odobrať", "Eltávolítás")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  /**
   * Writes the project back at once, with `overrides` for a value that lives
   * outside the view's own state (the budget). Everything else saves itself —
   * see the autosave above. A read-only role is refused here too.
   */
  const handleSave = (overrides: Partial<Project> = {}) => {
    if (!canEdit) return;
    const updated = buildProject(overrides);
    if (!updated) return;
    // Whatever was waiting is part of this write already.
    pendingSaveRef.current = null;
    onSave(updated, { close: false });
    setSaveState("saved");
  };

  const commitName = () => {
    // Escape unmounts the input, and a browser may still fire its blur.
    if (nameCancelledRef.current) { nameCancelledRef.current = false; return; }
    const next = nameDraft.trim();
    setProjectName(next);
    setNameDraft(next);
    setIsEditingName(false);
  };

  const cancelNameEdit = () => {
    nameCancelledRef.current = true;
    setNameDraft(projectName);
    setIsEditingName(false);
  };

  // Timeline Handlers
  const handleAddTimelineEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !newTeTitle.trim()) return;

    // Validate required timeline attributes
    const selectedTeType = projectType.timelineEventTypes?.find(t => t.id === newTeType);
    const activeTimelineAttributes = selectedTeType ? selectedTeType.attributes : [];
    for (const attr of activeTimelineAttributes) {
      if (attr.required) {
        const val = timelineEventData[attr.id];
        const missing = attr.type === "money"
          ? isMoneyValueEmpty(val, defaultCurrency)
          : (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0));
        if (missing) {
          alert(`"${attr.name}" ${t("is required.", "je povinné.", "megadása kötelező.")}`);
          return;
        }
      }
    }

    const isCustom = projectType.timelineEventTypes && projectType.timelineEventTypes.length > 0;
    const newEvent: ProjectTimelineEvent = {
      id: "pte-" + Date.now(),
      type: isCustom ? "custom" : newTeType,
      eventType: isCustom ? newTeType : undefined,
      timestamp: newTeTime || nowLocalStamp(),
      title: newTeTitle.trim(),
      content: newTeContent.trim(),
      data: timelineEventData
    };

    setTimeline(prev => [newEvent, ...prev]);
    setNewTeTitle("");
    setNewTeContent("");
    setNewTeTime("");
    setTimelineEventData({});
  };

  const handleRemoveTimelineEvent = (id: string) => {
    if (!canDelete) return;
    if (!window.confirm(t("Delete timeline event?", "Vymazať udalosť časovej osi?", "Törli az idővonal eseményt?"))) return;
    setTimeline(prev => prev.filter(e => e.id !== id));
  };

  // Gantt Handlers
  const handleAddGanttRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !newGeTitle.trim()) return;

    const newRow: ProjectGanttRow = {
      id: "pgr-" + Date.now(),
      title: newGeTitle.trim(),
      contactId: newGeContactId,
      startDate: newGeStart || undefined,
      endDate: newGeEnd || undefined,
      progress: 0
    };

    setGantt(prev => [...prev, newRow]);
    setNewGeTitle("");
    setNewGeContactId("");
    setNewGeStart("");
    setNewGeEnd("");
  };

  const handleUpdateGanttProgress = (id: string, progress: number) => {
    if (!canEdit) return;
    setGantt(prev => prev.map(r => r.id === id ? { ...r, progress } : r));
  };

  /** The task editor writes straight into the rows, so it stays shut for a read-only role. */
  const openGanttEdit = (row: ProjectGanttRow) => {
    if (!canEdit) return;
    setSelectedGanttEdit(row);
  };

  const handleRemoveGanttRow = (id: string) => {
    if (!canDelete) return;
    if (!window.confirm(t("Delete Gantt row?", "Vymazať riadok Gantt diagramu?", "Törli a Gantt diagram sort?"))) return;
    setGantt(prev => prev.filter(r => r.id !== id));
  };

  const getMonday = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  };

  const getWeekNumber = (d: Date) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  const formatWeekRange = (monday: Date) => {
    const weekNum = getWeekNumber(monday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const formatMonthDay = (d: Date) => {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${months[d.getMonth()]} ${d.getDate()}`;
    };

    return `W${weekNum} ${formatMonthDay(monday)} - ${formatMonthDay(sunday)}`;
  };

  const formatDayHeader = (d: Date) => {
    const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    return `${days[d.getDay()]} ${d.getDate()}`;
  };

  const handleZoomIn = () => setColumnWidth(prev => Math.min(prev + 10, 120));
  const handleZoomOut = () => setColumnWidth(prev => Math.max(prev - 10, 35));

  const getGanttTimelineData = () => {
    let minDate = new Date();
    minDate.setDate(minDate.getDate() - 10);
    let maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 20);

    const validDates = gantt
      .filter(r => r.startDate || r.endDate)
      .map(r => new Date(r.startDate || r.endDate!));
    const validEndDates = gantt
      .filter(r => r.startDate || r.endDate)
      .map(r => new Date(r.endDate || r.startDate!));

    if (validDates.length > 0) {
      const minVal = Math.min(...validDates.map(d => d.getTime()));
      const maxVal = validEndDates.length > 0 
        ? Math.max(...validEndDates.map(d => d.getTime()), ...validDates.map(d => d.getTime()))
        : Math.max(...validDates.map(d => d.getTime()));
      
      minDate = new Date(minVal - 5 * 24 * 60 * 60 * 1000);
      maxDate = new Date(maxVal + 10 * 24 * 60 * 60 * 1000);
    }

    const weekdays: Date[] = [];
    let curr = new Date(minDate);
    let count = 0;
    while (curr <= maxDate && count < 150) {
      const day = curr.getDay();
      if (day !== 0 && day !== 6) { // Skip weekends
        weekdays.push(new Date(curr));
      }
      curr.setDate(curr.getDate() + 1);
      count++;
    }

    const weekGroups: { monday: Date; startOffset: number; width: number; weekdays: Date[] }[] = [];
    const grouped: Record<string, Date[]> = {};
    weekdays.forEach(d => {
      const monday = getMonday(d);
      const mStr = monday.toISOString().slice(0, 10);
      if (!grouped[mStr]) grouped[mStr] = [];
      grouped[mStr].push(d);
    });

    let currentOffset = 0;
    Object.keys(grouped).sort().forEach(mStr => {
      const groupDays = grouped[mStr];
      const monday = new Date(mStr);
      const width = groupDays.length * columnWidth;
      weekGroups.push({
        monday,
        startOffset: currentOffset,
        width,
        weekdays: groupDays
      });
      currentOffset += width;
    });

    return { weekdays, weekGroups, totalTimelineWidth: currentOffset };
  };

  /** Deletes the whole project, after the same confirmation the list asks for. */
  const handleDeleteProject = () => {
    if (!canDelete || !onDelete) return;
    if (!window.confirm(t(
      "Are you sure you want to delete this project?",
      "Naozaj chcete vymazať tento projekt?",
      "Biztosan törli ezt a projektet?",
    ))) return;
    // An edit still waiting would otherwise write the project straight back.
    pendingSaveRef.current = null;
    onDelete(project.id);
  };

  const renderIcon = (iconName: string, className?: string) => {
    const IconComponent = (Icons as any)[iconName];
    if (IconComponent) return <IconComponent className={className} />;
    return <Icons.Briefcase className={className} />;
  };

  const getTimelineIcon = (type: string, eventType?: string | null) => {
    if (eventType && projectType) {
      const customType = projectType.timelineEventTypes?.find(t => t.id === eventType);
      if (customType) {
        const IconComp = (Icons as any)[customType.icon];
        if (IconComp) {
          return <IconComp className="h-4 w-4" style={{ color: customType.color }} />;
        }
      }
    }
    switch (type) {
      case "phone": return <Icons.Phone className="h-4 w-4 text-sky-500" />;
      case "email": return <Icons.Mail className="h-4 w-4 text-pink-500" />;
      case "offer": return <Icons.FileText className="h-4 w-4 text-amber-500" />;
      case "appointment": return <Icons.Calendar className="h-4 w-4 text-indigo-500" />;
      default: return <Icons.MessageSquare className="h-4 w-4 text-purple-500" />;
    }
  };

  return (
    <div className="w-full flex flex-col h-[calc(100vh-11rem)] animate-fade-in text-left">

      {/* Header — the same shape the projects list opens with: a large
          heading with its icon, a caption under it, the actions on the right,
          and a hairline below. No panel of its own. */}
      <div className="shrink-0 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-4 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="shrink-0 p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-all active:scale-95 cursor-pointer"
            title={t("Back to list", "Späť na zoznam", "Vissza a listához")}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex flex-col min-w-0 flex-1">
            <h2 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2 min-w-0">
              <span className="shrink-0" style={{ color: projectType.color }}>
                {renderIcon(projectType.icon, "h-6 w-6")}
              </span>
              {/* Project name, edited in place. Projects used to have none and
                  simply wore the paired lead's, which left a project paired with
                  nobody with no name at all. Still optional: left empty, it
                  reads as the lead. */}
              {isEditingName ? (
                <input
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={e => {
                    if (e.key === "Enter") { e.preventDefault(); commitName(); }
                    else if (e.key === "Escape") { e.preventDefault(); cancelNameEdit(); }
                  }}
                  autoFocus
                  maxLength={200}
                  placeholder={t("e.g. Roof replacement, Kosice", "napr. Výmena strechy, Košice", "pl. Tetőcsere, Kassa")}
                  className="select-text min-w-0 flex-1 max-w-xl px-2 py-0.5 -my-1 rounded-xl border border-indigo-300 bg-white text-2xl font-heading font-extrabold text-slate-900 tracking-tight focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              ) : (
                <>
                  <span className="truncate">
                    {projectDisplayName(
                      { name: projectName, leadId: associatedLeadId },
                      leads,
                      t("New Project", "Nový projekt", "Új projekt"),
                    )}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => { nameCancelledRef.current = false; setNameDraft(projectName); setIsEditingName(true); }}
                      className="shrink-0 p-1.5 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-95 cursor-pointer"
                      title={t("Rename project", "Premenovať projekt", "Projekt átnevezése")}
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                  )}
                </>
              )}
            </h2>
            <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1 truncate">
              {isEditingName && !nameDraft.trim()
                ? t(
                    "Left empty, the project is listed under the paired lead's name",
                    "Ak ostane prázdny, projekt sa zobrazí pod menom spárovaného leadu",
                    "Üresen hagyva a projekt a párosított lead nevén szerepel",
                  )
                : projectType.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          {/* Deleting a project that has never been saved would delete nothing,
              so the button only appears once the project exists. */}
          {canDelete && !isNew && onDelete && (
            <button
              onClick={handleDeleteProject}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-rose-500 font-heading font-bold text-xs uppercase tracking-wider hover:bg-rose-50 hover:text-rose-700 transition-all active:scale-95 cursor-pointer"
              title={t("Delete Project", "Vymazať projekt", "Projekt törlése")}
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t("Delete", "Vymazať", "Törlés")}</span>
            </button>
          )}
          {canEdit ? (
            /* No Save button: every change saves itself. This only says whether
               the last one has gone out yet — or why it cannot. */
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-colors duration-200 ${
                finishBeforeStart ? "text-rose-600" : saveState === "pending" ? "text-slate-400" : "text-emerald-600"
              }`}
              data-testid="project-save-state"
            >
              {finishBeforeStart ? (
                <>
                  <CircleAlert className="h-3.5 w-3.5 shrink-0" />
                  <span>{t("Not saved — check the dates", "Neuložené — skontrolujte dátumy", "Nincs mentve — ellenőrizze a dátumokat")}</span>
                </>
              ) : saveState === "pending" ? (
                <>
                  <Icons.Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  <span>{t("Saving…", "Ukladá sa…", "Mentés…")}</span>
                </>
              ) : (
                <>
                  <Icons.CloudCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>{t("All changes saved", "Všetko uložené", "Minden mentve")}</span>
                </>
              )}
            </span>
          ) : (
            /* Read-only: the same pill the list wears, in place of the save state. */
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 text-[10px] font-black uppercase tracking-wider text-amber-700 whitespace-nowrap"
              title={t(
                "Your role can view this project but not change it.",
                "Vaša rola môže tento projekt prezerať, ale nie meniť.",
                "A szerepköre megtekintheti ezt a projektet, de nem módosíthatja.",
              )}
            >
              <Icons.Lock className="h-3 w-3 shrink-0" />
              <span>{t("Read-only access", "Iba na čítanie", "Csak olvasható")}</span>
            </span>
          )}
        </div>
      </div>

      {/* Workspace Body */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-6 pt-6 min-h-0">
        
        {/* LEFT COLUMN: the project's own card, its custom attributes, then
            the paired client at the bottom. The project card is edited in
            place and every change saves itself; the attributes card keeps an
            Edit mode of its own. */}
        <div className="lg:col-span-4 flex flex-col h-full min-h-0 overflow-y-auto gap-4 pr-1 scrollbar-thin text-left">


          {/* PROJECT CARD DETAILS */}
          <div className="shrink-0 bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 pb-3">
              <h4 className="text-xs font-heading font-black text-slate-900 uppercase tracking-widest">
                {t("Project Card Details", "Detaily karty projektu", "Projekt részletei")}
              </h4>
            </div>

            {/* Pipeline strip — edge to edge under the header, in place of its
                divider, the way the lead drawer shows the lead pipeline. Follows
                the live status, so it moves the moment the select below does. */}
            <PipelineStrip segments={projectPipelineSegments(status, t)} className="-mx-5 mb-4" />

          <div className="space-y-4">
            {/* Status. Each status wears its own colour, badge and dropdown row alike. */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t("Status", "Stav", "Állapot")}</label>
              <CustomSelect
                value={status}
                disabled={!canEdit}
                onChange={v => {
                  if (!canEdit) return;
                  setStatus(v);
                  // Completing stamps today as the real finish, reopening clears
                  // it — see finishedAtForStatus. Only where the field is shown.
                  const nextFinished = projectType.hasDeadline ? finishedAtForStatus(v, finishedAt, todayLocal()) : finishedAt;
                  setFinishedAt(nextFinished);
                }}
                className={`!font-black ${projectStatusBadgeClass(status)}`}
                icon={<span className={`h-2 w-2 rounded-full shrink-0 inline-block ${projectStatusDotClass(status)}`} />}
                options={projectStatusOptions(t).map(o => ({
                  value: o.value,
                  label: o.label,
                  icon: <span className={`h-2.5 w-2.5 rounded-full shrink-0 inline-block ${projectStatusDotClass(o.value)}`} />,
                }))}
              />
            </div>

            {/* Star priority — the same 1-5 rating a lead carries, and the same
                widget. Clicking the star it already wears clears the rating again. */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">
                {getTranslation(userLanguage, "profile.priority_rating")}
              </label>
              <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 w-fit">
                <StarRating
                  rating={rating}
                  userLanguage={userLanguage}
                  onChange={!canEdit ? undefined : (stars) => {
                    const next = rating === stars ? 0 : stars;
                    setRating(next);
                  }}
                />
                {rating === 0 && (
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    {t("Not rated", "Bez hodnotenia", "Nincs értékelve")}
                  </span>
                )}
              </div>
            </div>

            {/* Deadline. Only for a project type that is time-boxed — see
                hasDeadline in Projects -> Settings -> project type. */}
            {projectType.hasDeadline && (() => {
              const dl = evaluateProjectDeadline({ deadline, status, finishedAt }, projectType, todayLocal());
              const missedDeadline = projectMissedDeadline(dl);
              const dateInputClass = "flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500";
              return (
                <div>
                  {/* Planned deadline on the left, the real start and finish next
                      to it. The real finish, once set, is what the list shows. */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">
                    {t("Deadline", "Termín dokončenia", "Határidő")} {canEdit && projectType.deadlineRequired && <span className="text-red-500">*</span>}
                  </label>
                  {!canEdit ? (
                    <p className="text-xs font-bold text-slate-800">
                      {deadline
                        ? formatDateLocalized(deadline, userLanguage)
                        : <span className="text-slate-300 italic font-semibold">{t("No deadline set", "Bez termínu", "Nincs határidő")}</span>}
                    </p>
                  ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={deadline}
                      onChange={e => setDeadline(e.target.value)}
                      className={dateInputClass}
                    />
                    {deadline && (
                      <button
                        type="button"
                        onClick={() => setDeadline("")}
                        className="shrink-0 p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title={t("Clear deadline", "Zrušiť termín", "Határidő törlése")}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  )}
                  {canEdit && projectType.deadlineRequired && !deadline && (
                    <p className="mt-1 text-[9px] font-bold text-rose-600 leading-snug">
                      {t("A deadline is required for this project type.", "Termín je pre tento typ projektu povinný.", "Ennél a projekt típusnál a határidő kötelező.")}
                    </p>
                  )}
                  </div>

                  <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t("Real dates", "Skutočný termín", "Tényleges időpontok")}</label>
                  {!canEdit ? (
                    <p className="text-xs font-bold text-slate-800">
                      {startDate ? formatDateLocalized(startDate, userLanguage) : "—"}
                      {" – "}
                      {finishedAt
                        ? formatDateLocalized(finishedAt, userLanguage)
                        : <span className="text-slate-300 italic font-semibold">{t("in progress", "prebieha", "folyamatban")}</span>}
                    </p>
                  ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-[9px] font-black text-slate-400 uppercase">{t("Start", "Začiatok", "Kezdés")}</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className={dateInputClass}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-[9px] font-black text-slate-400 uppercase">{t("Finish", "Koniec", "Befejezés")}</span>
                      <input
                        type="date"
                        value={finishedAt}
                        min={startDate || undefined}
                        onChange={e => setFinishedAt(e.target.value)}
                        className={dateInputClass}
                      />
                      {finishedAt && (
                        <button
                          type="button"
                          onClick={() => setFinishedAt("")}
                          className="shrink-0 p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title={t("Clear finish date", "Zrušiť dátum dokončenia", "Befejezés törlése")}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {finishBeforeStart && (
                      <p className="text-[9px] font-bold text-rose-600 leading-snug">
                        {t(
                          "The finish cannot be before the start — changes are not saved until it is fixed.",
                          "Koniec nemôže byť pred začiatkom — zmeny sa neuložia, kým to neopravíte.",
                          "A befejezés nem lehet a kezdés előtt — a módosítások a javításig nem mentődnek.",
                        )}
                      </p>
                    )}
                  </div>
                  )}
                  </div>
                  </div>

                  {dl && (
                    <p className={`mt-1.5 text-[10px] font-black uppercase tracking-wider ${
                      missedDeadline
                        ? "text-rose-600"
                        : dl.tone === "soon"
                          ? "text-amber-600"
                          : dl.tone === "finished"
                            ? "text-emerald-600"
                            : "text-slate-400"
                    }`}>
                      {dl.tone === "finished"
                        ? dl.finishedLateDays > 0
                          ? t(`Finished ${dl.finishedLateDays} days after the deadline`, `Dokončené ${dl.finishedLateDays} dní po termíne`, `${dl.finishedLateDays} nappal a határidő után befejezve`)
                          : dl.plannedDeadline
                            ? t("Finished on time", "Dokončené v termíne", "Határidőre befejezve")
                            : t("Finished", "Dokončené", "Befejezve")
                        : dl.tone === "closed"
                        ? t("Closed — the deadline no longer applies.", "Uzavretý — termín už neplatí.", "Lezárva — a határidő már nem érvényes.")
                        : dl.isOverdue
                          ? t(`${dl.overdueDays} days overdue`, `${dl.overdueDays} dní po termíne`, `${dl.overdueDays} nappal késésben`)
                          : dl.daysLeft === 0
                            ? t("Due today", "Termín je dnes", "Ma esedékes")
                            : t(`${dl.daysLeft} days left`, `Ostáva ${dl.daysLeft} dní`, `${dl.daysLeft} nap van hátra`)}
                    </p>
                  )}

                  {/* The red flag. Once the project missed its date — still
                      open and past it, or finished after it — the reason for
                      the delay is required: until it is written down the
                      project wears a flag everywhere it is listed. */}
                  {missedDeadline && (
                    <div className="mt-3 p-3 rounded-2xl border border-rose-200 bg-rose-50">
                      <label className="flex items-center gap-1.5 text-[10px] font-black text-rose-700 uppercase tracking-wider mb-1.5">
                        <Icons.Flag className="h-3.5 w-3.5 shrink-0 fill-current" />
                        <span>{t("Reason for the delay", "Dôvod meškania", "A késés oka")}</span>
                        <span className="text-rose-500">*</span>
                      </label>

                      {canEdit ? (
                        <>
                          <textarea
                            value={delayReason}
                            onChange={e => setDelayReason(e.target.value)}
                            rows={2}
                            maxLength={500}
                            placeholder={t(
                              "e.g. waiting on the client's approval of the design",
                              "napr. čakáme na schválenie návrhu klientom",
                              "pl. az ügyfél jóváhagyására várunk",
                            )}
                            className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold bg-white text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 ${
                              delayReason.trim() ? "border-rose-200" : "border-rose-400"
                            }`}
                          />
                          {!delayReason.trim() && (
                            <p className="mt-1 text-[9px] font-bold text-rose-600 leading-snug">
                              {t(
                                "Required while the project is past its deadline — it stays flagged in the list until one is given.",
                                "Povinné, kým je projekt po termíne — v zozname ostane označený, kým ho nedoplníte.",
                                "Kötelező, amíg a projekt határidőn túl van — addig megjelölve marad a listában.",
                              )}
                            </p>
                          )}
                        </>
                      ) : delayReason.trim() ? (
                        <p className="text-xs font-semibold text-slate-700 whitespace-pre-wrap break-words">
                          {delayReason}
                        </p>
                      ) : (
                        <>
                          <p className="text-[11px] font-bold text-rose-600 leading-snug">
                            {t(
                              "No reason given yet — this project is flagged in the list until one is.",
                              "Zatiaľ bez zdôvodnenia — projekt je v zozname označený, kým ho nedoplníte.",
                              "Még nincs indoklás — a projekt megjelölve marad a listában, amíg meg nem adja.",
                            )}
                          </p>
                        </>
                      )}
                    </div>
                  )}

                </div>
              );
            })()}

            {/* Project Managers, edited in place. A project can carry several,
                so the dropdown adds one at a time and the chosen ones sit above
                it as the same coloured chips the lead view wears for its manager;
                each chip's cross takes that manager off again. */}
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t("Project Managers", "Projektoví manažéri", "Projektmenedzserek")}</label>
              {selectedManagers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedManagers.map(name => {
                    const color = users.find(u => u.name === name)?.color || "#64748b";
                    return (
                      <span
                        key={name}
                        className={`inline-flex items-center gap-1 pl-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider shadow-sm ${canEdit ? "pr-1" : "pr-2.5"}`}
                        style={{ backgroundColor: `${color}15`, color, borderColor: `${color}30` }}
                      >
                        <Icons.User className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[10rem]">{name}</span>
                        {canEdit && (
                        <button
                          type="button"
                          onClick={() => setSelectedManagers(prev => prev.filter(m => m !== name))}
                          className="ml-0.5 p-0.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
                          title={t("Remove", "Odobrať", "Eltávolítás")}
                        >
                          <X className="h-3 w-3" />
                        </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
              {canEdit && (() => {
                const available = users.filter(u => !selectedManagers.includes(u.name));
                return (
                  <CustomSelect
                    value=""
                    onChange={name => {
                      if (name && !selectedManagers.includes(name)) setSelectedManagers(prev => [...prev, name]);
                    }}
                    disabled={available.length === 0}
                    placeholder={
                      available.length === 0
                        ? t("Everyone is assigned", "Priradení sú všetci", "Mindenki hozzá van rendelve")
                        : selectedManagers.length > 0
                          ? t("Add another manager...", "Pridať ďalšieho manažéra...", "További menedzser hozzáadása...")
                          : t("Assign a manager...", "Priradiť manažéra...", "Menedzser kijelölése...")
                    }
                    options={available.map(u => ({
                      value: u.name,
                      label: u.name,
                      icon: <span className="h-2.5 w-2.5 rounded-full shrink-0 inline-block" style={{ backgroundColor: u.color || "#64748b" }} />,
                    }))}
                  />
                );
              })()}
              {!canEdit && selectedManagers.length === 0 && (
                <p className="text-xs font-semibold text-slate-300 italic">
                  {t(
                    "Nobody is on this project yet.",
                    "Na projekte zatiaľ nikto nie je priradený.",
                    "Még senki sincs hozzárendelve a projekthez.",
                  )}
                </p>
              )}
            </div>

          </div>
          </div>

          {/* CUSTOM ATTRIBUTES — the type's own fields, on a card of their own,
              two to a row, edited in place like the project card above; every
              change saves itself. Viewers without edit rights get the values in
              reading shape. A value that needs the full width (long text, a
              file list, the money and contact pickers while editable) takes
              the whole row. */}
          {(projectType.attributes || []).length > 0 && (
          <div className="shrink-0 bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-200">
              <h4 className="text-xs font-heading font-black text-slate-900 uppercase tracking-widest">
                {t("Custom Attributes", "Vlastné atribúty", "Egyedi attribútumok")}
              </h4>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              {(() => {
                const attrs = projectType.attributes || [];
                const isWide = (a: typeof attrs[number]) => a.type === "textarea" || a.type === "files"
                  || (isEditingAttrs && (a.type === "money" || a.type === "contact"));
                // A half-width attribute with nothing beside it — the next one is
                // full-width, or there is no next one — takes the whole row.
                const lone = new Set<string>();
                let col = 0;
                attrs.forEach((a, i) => {
                  if (isWide(a)) { col = 0; return; }
                  if (col === 0 && (i === attrs.length - 1 || isWide(attrs[i + 1]))) lone.add(a.id);
                  col = col === 0 ? 1 : 0;
                });
                return attrs.map(attr => {
                const val = dynamicData[attr.id] ?? "";
                const updateVal = (newVal: any) => {
                  setDynamicData(prev => ({ ...prev, [attr.id]: newVal }));
                };
                const wide = isWide(attr) || lone.has(attr.id);
                // Nothing blocks a save any more, so an empty required value is
                // pointed out where it sits instead.
                const missingRequired = !!attr.required && (attr.type === "money"
                  ? isMoneyValueEmpty(dynamicData[attr.id], defaultCurrency)
                  : attr.type === "checkbox" && attr.options
                    ? readChecklistValue(dynamicData[attr.id]).checked.length === 0
                    : attr.type === "files"
                      ? asList(dynamicData[attr.id]).length === 0
                      : val === "" || val === null || (Array.isArray(val) && val.length === 0));
                // Required boxes — the type's and this project's own — still unticked.
                const missingBoxes = missingChecklistItems(attr, dynamicData[attr.id]);

                return (
                  <div key={attr.id} className={`min-w-0 break-words ${wide ? "col-span-2" : ""}`}>
                    <label className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-black text-slate-400 uppercase mb-1">
                      <span>{attr.name} {canEdit && attr.required && <span className="text-red-500">*</span>}</span>
                      {missingBoxes.length > 0 && (
                        <span
                          title={missingBoxes.join(", ")}
                          className="px-1.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-600 text-[9px] font-black normal-case tracking-normal leading-none tabular-nums animate-fade-in"
                        >
                          {missingBoxes.length} {t("missing", "chýba", "hiányzik")}
                        </span>
                      )}
                    </label>

                    {!isEditingAttrs ? (
                      <div className="text-xs font-bold text-slate-800">{renderAttrValue(attr, dynamicData[attr.id])}</div>
                    ) : (
                    <>
                    {/* Textfield */}
                    {attr.type === "textfield" && (
                      <input
                        type="text"
                        value={val}
                        onChange={e => updateVal(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800"
                      />
                    )}

                    {/* Textarea */}
                    {attr.type === "textarea" && (
                      <textarea
                        value={val}
                        onChange={e => updateVal(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800 resize-none"
                      />
                    )}

                    {/* Number */}
                    {attr.type === "number" && (
                      <input
                        type="number"
                        value={val}
                        onChange={e => updateVal(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800"
                      />
                    )}

                    {/* Money — amount plus the currency this record is in */}
                    {attr.type === "money" && renderMoneyInput(dynamicData[attr.id], updateVal)}

                    {/* Date */}
                    {attr.type === "date" && (
                      <input
                        type="date"
                        value={val}
                        onChange={e => updateVal(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800"
                      />
                    )}

                    {/* Time */}
                    {attr.type === "time" && (
                      <input
                        type="time"
                        value={val}
                        onChange={e => updateVal(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800"
                      />
                    )}

                    {/* Datetime */}
                    {attr.type === "datetime" && (
                      <input
                        type="datetime-local"
                        value={val}
                        onChange={e => updateVal(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800"
                      />
                    )}

                    {/* Select Dropdown */}
                    {attr.type === "select" && (
                      <CustomSelect
                        value={val}
                        onChange={v => updateVal(v)}
                        placeholder={t("Select option...", "Vybrať možnosť...", "Válasszon opciót...")}
                        options={(attr.options || []).map(opt => ({ value: opt, label: opt }))}
                      />
                    )}

                    {/* Checkbox (options-based or single boolean) */}
                    {attr.type === "checkbox" && (
                      <div className="space-y-1 py-1">
                        {attr.options ? (() => {
                          // The type's options, then the boxes this project added
                          // itself — the checklist twin of the Files tab's own slots.
                          const list = readChecklistValue(val);
                          const save = (next: Partial<typeof list>) => updateVal(writeChecklistValue({ ...list, ...next }));
                          const toggle = (label: string) => save({
                            checked: list.checked.includes(label)
                              ? list.checked.filter(o => o !== label)
                              : [...list.checked, label],
                          });
                          const requiredOptions = attr.requiredOptions || [];
                          const draft = newChecklistLabels[attr.id] || "";
                          const addExtra = () => {
                            const label = draft.trim();
                            if (!label) return;
                            const taken = [...(attr.options || []), ...list.extra.map(e => e.label)]
                              .some(l => l.toLowerCase() === label.toLowerCase());
                            if (!taken) save({ extra: [...list.extra, { label, required: true }] });
                            setNewChecklistLabels(prev => ({ ...prev, [attr.id]: "" }));
                          };
                          return (
                            <>
                              {(attr.options || []).map(opt => (
                                <label key={opt} className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={list.checked.includes(opt)}
                                    onChange={() => toggle(opt)}
                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                                  />
                                  <span>{opt}</span>
                                  {requiredOptions.includes(opt) && <span className="text-red-500">*</span>}
                                </label>
                              ))}
                              {list.extra.map(extra => (
                                <div key={extra.label} className="group flex items-start gap-2 text-xs font-semibold text-slate-600">
                                  {/* Required reads as the same red "*" as the type's own
                                      options; a word-sized badge here squeezed the label
                                      to a few letters in a half-width column. */}
                                  <label className="flex min-w-0 items-start gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={list.checked.includes(extra.label)}
                                      onChange={() => toggle(extra.label)}
                                      className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600"
                                    />
                                    <span className="min-w-0 break-words">{extra.label}</span>
                                  </label>
                                  {(() => {
                                    const hint = extra.required
                                      ? t("Required — click to make optional", "Povinné — kliknutím nastavíte ako nepovinné", "Kötelező — kattintson az opcionálishoz")
                                      : t("Optional — click to make required", "Nepovinné — kliknutím nastavíte ako povinné", "Opcionális — kattintson a kötelezőhöz");
                                    return (
                                      <button
                                        type="button"
                                        aria-pressed={extra.required}
                                        aria-label={hint}
                                        title={hint}
                                        onClick={() => save({
                                          extra: list.extra.map(e => e.label === extra.label ? { ...e, required: !e.required } : e),
                                        })}
                                        className={`-ml-1 shrink-0 w-4 h-4 flex items-center justify-center rounded text-sm leading-none font-black transition-all duration-150 active:scale-90 cursor-pointer ${
                                          extra.required
                                            ? "text-red-500 hover:bg-rose-50"
                                            : "text-slate-300 hover:text-red-400 hover:bg-slate-100"
                                        }`}
                                      >
                                        *
                                      </button>
                                    );
                                  })()}
                                  {canDelete && (
                                    <button
                                      type="button"
                                      aria-label={t("Remove checkbox", "Odstrániť políčko", "Jelölőnégyzet törlése")}
                                      onClick={() => save({
                                        extra: list.extra.filter(e => e.label !== extra.label),
                                        checked: list.checked.filter(o => o !== extra.label),
                                      })}
                                      className="shrink-0 p-0.5 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-150 active:scale-95 cursor-pointer"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              <div className="flex items-center gap-1.5 pt-1">
                                <input
                                  type="text"
                                  value={draft}
                                  onChange={e => setNewChecklistLabels(prev => ({ ...prev, [attr.id]: e.target.value }))}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      addExtra();
                                    }
                                  }}
                                  placeholder={t("Add checkbox…", "Pridať políčko…", "Jelölőnégyzet hozzáadása…")}
                                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold bg-white text-slate-800"
                                />
                                <button
                                  type="button"
                                  onClick={addExtra}
                                  disabled={!draft.trim()}
                                  aria-label={t("Add checkbox", "Pridať políčko", "Jelölőnégyzet hozzáadása")}
                                  className="shrink-0 p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 active:scale-95 cursor-pointer"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </>
                          );
                        })() : (
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600">
                            <input
                              type="checkbox"
                              checked={!!val}
                              onChange={e => updateVal(e.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                            />
                            <span>{t("Yes / Enabled", "Áno / Povolené", "Igen / Engedélyezve")}</span>
                          </label>
                        )}
                      </div>
                    )}

                    {/* Radio Buttons */}
                    {attr.type === "radio" && (
                      <div className="space-y-1.5 py-1">
                        {(attr.options || []).map(opt => (
                          <label key={opt} className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600">
                            <input
                              type="radio"
                              name={attr.id}
                              value={opt}
                              checked={val === opt}
                              onChange={() => updateVal(opt)}
                              className="h-4 w-4 border-slate-300 text-indigo-600"
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Multiple Files Upload */}
                    {attr.type === "files" && renderFilesInput(attr.id, val)}

                    {/* Contact Picker attribute type */}
                    {attr.type === "contact" && (
                      <div className="space-y-2">
                        <ClientSelect
                          leads={leads}
                          value={val}
                          onChange={v => updateVal(v)}
                          placeholder={t("Select Contact...", "Vybrať kontakt...", "Kapcsolat választása...")}
                        />
                        {val && (() => {
                          const contact = leads.find(l => l.id === val);
                          if (!contact) return null;
                          return (
                            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-[11px] font-semibold text-slate-600 animate-fade-in">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-800 font-bold">{contact.name}</span>
                                <a 
                                  href={`#lead-${contact.id}`}
                                  className="text-indigo-600 hover:text-indigo-800 text-[10px] underline"
                                >
                                  {t("View Profile", "Zobraziť profil", "Profil megtekintése")}
                                </a>
                              </div>
                              {contact.email && (
                                <div className="flex items-center gap-1.5 text-slate-500">
                                  <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                                  <span>{contact.email}</span>
                                </div>
                              )}
                              {contact.phone && (
                                <div className="flex items-center gap-1.5 text-slate-500">
                                  <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                                  <span>{contact.phone}</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    </>
                    )}

                    {canEdit && missingRequired && (
                      <p className="mt-1 text-[9px] font-bold text-rose-600 leading-snug">
                        {t("Required", "Povinné", "Kötelező")}
                      </p>
                    )}
                  </div>
                );
                });
              })()}
            </div>
          </div>
          )}

          {/* Lead / Client pairing — the project's half of the link. The
              same pairing is edited from the lead's "Linked projects" card,
              and both write the one field (`leadId`) that carries it. */}
          {(() => {
            const pairedLead = leads.find(l => l.id === associatedLeadId);
            const pairWith = (id: string) => {
              setAssociatedLeadId(id);
              setAssociatedClientId(id);
              setPickingClient(false);
              // Pairing a lead names the project after it, but only while it
              // has no name yet — re-pairing never overwrites what somebody
              // deliberately typed.
              if (!projectName.trim()) {
                const paired = leads.find(l => l.id === id);
                if (paired?.name) setProjectName(paired.name);
              }
            };

            if (!pairedLead || pickingClient) {
              // Unpaired and not picking yet: the note that this project hangs on
              // nobody, and a way in. A read-only role only gets the note.
              if (!canEdit || !pickingClient) {
                return (
                  <div className="shrink-0 bg-white border border-dashed border-slate-300 rounded-3xl p-5 shadow-sm text-center">
                    <Icons.Unlink className="h-5 w-5 text-slate-300 mx-auto mb-2" />
                    <p className="text-[11px] font-bold text-slate-500 leading-snug">
                      {t(
                        "This project is not paired with any lead or client.",
                        "Tento projekt nie je spárovaný so žiadnym leadom ani klientom.",
                        "Ez a projekt nincs leaddel vagy ügyféllel párosítva.",
                      )}
                    </p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setPickingClient(true)}
                        className="mt-2.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                      >
                        {t("Pair now", "Spárovať", "Párosítať")}
                      </button>
                    )}
                  </div>
                );
              }
              return (
                <div className="shrink-0 bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t("Paired Lead / Client", "Spárovaný lead / klient", "Párosított lead / ügyfél")}</label>
                  <ClientSelect
                    leads={leads}
                    value={associatedLeadId}
                    onChange={pairWith}
                    noneLabel={t("No associated client", "Žiadny klient", "Nincs ügyfél")}
                    placeholder={t("Select Client...", "Vybrať klienta...", "Ügyfél választása...")}
                  />
                  {pairedLead && (
                    <button
                      type="button"
                      onClick={() => setPickingClient(false)}
                      className="mt-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                      {t("Keep current pairing", "Ponechať súčasné spárovanie", "Jelenlegi párosítás megtartása")}
                    </button>
                  )}
                  <p className="mt-1 text-[9px] font-semibold text-slate-400 leading-snug">
                    {t(
                      "Not paired with anyone — pick a lead or client to link this project to.",
                      "Nie je spárovaný s nikým — vyberte lead alebo klienta, s ktorým sa projekt prepojí.",
                      "Nincs párosítva — válasszon leadet vagy ügyfelet a projekt összekapcsolásához.",
                    )}
                  </p>
                </div>
              );
            }

            // The same green card the lead view shows for its client, so a
            // pairing reads the same from either end of the link.
            const initials = pairedLead.name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map(w => w[0]?.toUpperCase() || "")
              .join("") || "?";
            const clientTypeLabel =
              pairedLead.clientType === "business"
                ? `🏢 ${t("Company / Business", "Firma / Podnikanie", "Cég / Vállalkozás")}`
                : pairedLead.clientType === "partner"
                  ? `🤝 ${t("Dealer Partner", "Obchodný partner", "Kereskedő partner")}`
                  : `👤 ${t("Private Person", "Súkromná osoba", "Magánszemély")}`;
            const addr = pairedLead.address;
            const city = addr?.city || pairedLead.city || "";
            const addressText = [addr?.street, city].filter(Boolean).join(", ") + (addr?.postalCode ? ` (${addr.postalCode})` : "");
            const noneAdded = <span className="text-slate-300 italic">{getTranslation(userLanguage, "profile.none_added")}</span>;

            return (
              <div className="shrink-0 rounded-3xl border-2 border-emerald-400 bg-emerald-50/70 shadow-md p-4 space-y-3 text-emerald-950">
                <div className="border-b-2 border-emerald-200/50 pb-2 flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider flex items-center gap-1.5 min-w-0">
                    <Icons.Briefcase className="h-4 w-4 text-emerald-600 stroke-[2.5] shrink-0" />
                    <span>{getTranslation(userLanguage, "common.client_relationship_card")}</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wider shrink-0">
                    {getTranslation(userLanguage, "common.synced_profile")}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-2 border-emerald-700 flex items-center justify-center font-heading font-black text-sm shadow shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-black text-slate-800 line-clamp-1">{pairedLead.name}</h4>
                    <span className="text-[9px] font-extrabold uppercase tracking-wide text-emerald-700">{clientTypeLabel}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] bg-white/70 p-3 rounded-xl border border-emerald-200/50">
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-[8px] font-black text-emerald-700/60 uppercase tracking-wider block">
                      {getTranslation(userLanguage, "profile.phone_number")}
                    </span>
                    <span className="font-extrabold text-slate-700 block truncate">
                      {pairedLead.phone ? (
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-emerald-600 shrink-0" />{pairedLead.phone}</span>
                      ) : noneAdded}
                    </span>
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-[8px] font-black text-emerald-700/60 uppercase tracking-wider block">
                      {getTranslation(userLanguage, "profile.email_address")}
                    </span>
                    <span className="font-extrabold text-slate-700 block truncate">
                      {pairedLead.email ? (
                        <span className="flex items-center gap-1"><Mail className="h-3 w-3 text-emerald-600 shrink-0" /><span className="truncate">{pairedLead.email}</span></span>
                      ) : noneAdded}
                    </span>
                  </div>
                  <div className="space-y-0.5 col-span-2 border-t border-emerald-200/50 pt-2 mt-1">
                    <span className="text-[8px] font-black text-emerald-700/60 uppercase tracking-wider block">
                      {getTranslation(userLanguage, "profile.location_address")}
                    </span>
                    <span className="font-extrabold text-slate-700 block">
                      {addressText ? (
                        <span className="flex items-center gap-1"><Icons.MapPin className="h-3.5 w-3.5 text-emerald-600 shrink-0" /><span className="line-clamp-1">{addressText}</span></span>
                      ) : noneAdded}
                    </span>
                  </div>
                  {pairedLead.website && (
                    <div className="space-y-0.5 col-span-2 border-t border-emerald-200/50 pt-2 mt-1">
                      <span className="text-[8px] font-black text-emerald-700/60 uppercase tracking-wider block">
                        {getTranslation(userLanguage, "profile.website_link")}
                      </span>
                      <a
                        href={`https://${pairedLead.website.replace(/^https?:\/\//, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-extrabold text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <Icons.Globe className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">{pairedLead.website}</span>
                      </a>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                  {canEdit && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPickingClient(true)}
                      className="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer flex items-center gap-1"
                      title={t("Pair with a different lead or client", "Spárovať s iným leadom alebo klientom", "Másik leaddel vagy ügyféllel párosítás")}
                    >
                      <Icons.Repeat className="h-3 w-3" />
                      {t("Change", "Zmeniť", "Módosítás")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAssociatedLeadId(""); setAssociatedClientId(""); setPickingClient(false); }}
                      className="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer flex items-center gap-1"
                      title={t("Unpair this project", "Zrušiť spárovanie projektu", "Párosítás megszüntetése")}
                    >
                      <Icons.Unlink className="h-3 w-3" />
                      {t("Unpair", "Odpojiť", "Leválasztás")}
                    </button>
                  </div>
                  )}
                  <button
                    type="button"
                    onClick={() => { window.location.hash = `client-${encodeURIComponent(pairedLead.name)}`; }}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider shadow transition-all active:scale-95 flex items-center justify-center gap-1.5 border border-emerald-700 cursor-pointer"
                  >
                    {getTranslation(userLanguage, "common.view_full_profile")}
                    <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
                  </button>
                </div>

                {canEdit && (
                <p className="text-[9px] font-semibold text-emerald-800/60 leading-snug">
                  {t(
                    "This project shows up on the lead's card too.",
                    "Tento projekt sa zobrazí aj na karte leadu.",
                    "Ez a projekt a lead kartonján is megjelenik.",
                  )}
                </p>
                )}
              </div>
            );
          })()}
        </div>

        {/* RIGHT COLUMN: Timeline & Gantt Tabs */}
        <div className="lg:col-span-8 flex flex-col h-full overflow-hidden bg-white border border-slate-200 rounded-3xl p-5 shadow-sm text-left">
          {/* Tab Switched Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4 shrink-0">
            {/* One shape for every tab: icon, label, optional badge. The row
                scrolls sideways rather than wrapping, so a narrow column keeps
                the tabs on one line instead of breaking the header. */}
            <div className="flex items-center gap-1 select-none overflow-x-auto scrollbar-none -mx-1 px-1 py-0.5">
              {projectType.hasTimeline && (
                <button
                  onClick={() => handleRightTabChange("timeline")}
                  className={`${tabClass} ${activeRightTab === "timeline" ? tabActiveClass : tabIdleClass}`}
                >
                  <Icons.Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>{t("Timeline", "Časová os", "Idővonal")}</span>
                </button>
              )}
              {setTasks && taskAccess.view && (() => {
                // Open tasks, counted by the same visibility rule the tab lists them with.
                const openTaskCount = tasks.filter(tk =>
                  tk.relatedProjectId === project.id &&
                  !tk.archived &&
                  !isDoneTaskState(tk.status, taskStates) &&
                  (taskAccess.viewAll || isOnPersonalDashboard(tk, currentUser?.name || ""))
                ).length;
                return (
                  <button
                    onClick={() => handleRightTabChange("tasks")}
                    className={`${tabClass} ${activeRightTab === "tasks" ? tabActiveClass : tabIdleClass}`}
                  >
                    <Icons.ListChecks className="h-3.5 w-3.5 shrink-0" />
                    <span>{t("Tasks", "Úlohy", "Feladatok")}</span>
                    {openTaskCount > 0 && (
                      <span className={`${tabBadgeClass} ${activeRightTab === "tasks" ? "bg-white/20 text-white" : "bg-indigo-500/15 text-indigo-600"}`}>
                        {openTaskCount}
                      </span>
                    )}
                  </button>
                );
              })()}
              {projectType.hasGantt && (
                <button
                  onClick={() => handleRightTabChange("gantt")}
                  className={`${tabClass} ${activeRightTab === "gantt" ? tabActiveClass : tabIdleClass}`}
                >
                  <Icons.GanttChartSquare className="h-3.5 w-3.5 shrink-0" />
                  <span>{t("Gantt Chart", "Ganttov diagram", "Gantt diagram")}</span>
                </button>
              )}
              <button
                onClick={() => handleRightTabChange("finances")}
                className={`${tabClass} ${activeRightTab === "finances" ? tabActiveClass : tabIdleClass}`}
                title={t("Finances & Revenue", "Financie & Ziskovosť", "Pénzügyek & Jövedelmezőség")}
              >
                <Coins className="h-3.5 w-3.5 shrink-0" />
                <span>{t("Finances", "Financie", "Pénzügyek")}</span>
                <span className={`${tabBadgeClass} ${
                  revenueAnalysis.realProfit >= 0
                    ? activeRightTab === "finances" ? "bg-emerald-400/20 text-emerald-300" : "bg-emerald-500/15 text-emerald-600"
                    : activeRightTab === "finances" ? "bg-rose-400/20 text-rose-300" : "bg-rose-500/15 text-rose-600"
                }`}>
                  {money(revenueAnalysis.realProfit)}
                </span>
              </button>
              <button
                onClick={() => handleRightTabChange("files")}
                className={`${tabClass} ${activeRightTab === "files" ? tabActiveClass : tabIdleClass}`}
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0" />
                <span>{t("Files", "Súbory", "Fájlok")}</span>
                {missingFileCount > 0 && (
                  <span className={`${tabBadgeClass} bg-rose-500/20 text-rose-500`}>
                    {missingFileCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* TAB CONTENT: Tasks — ordinary tasks that carry this project's id */}
          {activeRightTab === "tasks" && setTasks && (
            <ProjectTasksPanel
              project={project}
              isNew={isNew}
              tasks={tasks}
              setTasks={setTasks}
              projects={projects}
              leads={leads}
              users={users}
              userLanguage={userLanguage}
              taskStates={taskStates}
              taskStateColors={taskStateColors}
              taskAccess={taskAccess}
              currentUser={currentUser}
            />
          )}

          {/* TAB CONTENT: Timeline */}
          {activeRightTab === "timeline" && projectType.hasTimeline && (
            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-6">
              {/* Timeline Form — writes an event, so a read-only role gets the list alone. */}
              {canEdit && (
              <div className="lg:w-1/3 flex flex-col shrink-0 bg-slate-50 p-4 border border-slate-200 rounded-2xl h-fit">
                <span className="text-[10px] font-black text-slate-400 uppercase mb-3 block">
                  {t("Log Timeline Event", "Zaznamenať udalosť", "Esemény rögzítése")}
                </span>
                
                <form onSubmit={handleAddTimelineEvent} className="space-y-3.5 text-xs font-semibold">
                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase mb-1">{t("Event Title", "Názov udalosti", "Esemény címe")}</label>
                    <input
                      value={newTeTitle}
                      onChange={e => setNewTeTitle(e.target.value)}
                      placeholder={t("e.g. Site survey completed", "napr. Zameranie dokončené", "pl. Helyszíni felmérés kész")}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase mb-1">{t("Event Type", "Typ", "Típus")}</label>
                    <CustomSelect
                      value={newTeType}
                      onChange={v => setNewTeType(v)}
                      options={
                        projectType.timelineEventTypes && projectType.timelineEventTypes.length > 0
                          ? projectType.timelineEventTypes.map(et => ({ value: et.id, label: et.name }))
                          : [
                              { value: "note", label: t("Internal Note", "Interná poznámka", "Belső jegyzet") },
                              { value: "phone", label: t("Phone Call", "Telefonát", "Telefonhívás") },
                              { value: "email", label: t("Email Dispatch", "Odoslaný e-mail", "E-mail") },
                              { value: "appointment", label: t("Meeting / Appointment", "Stretnutie", "Találkozó") },
                            ]
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase mb-1">{t("Timestamp (Optional)", "Dátum a čas", "Dátum és idő")}</label>
                    <input
                      type="datetime-local"
                      value={newTeTime}
                      onChange={e => setNewTeTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase mb-1">{t("Content details...", "Podrobnosti", "Részletek")}</label>
                    <textarea
                      value={newTeContent}
                      onChange={e => setNewTeContent(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white resize-none"
                    />
                  </div>

                  {/* DYNAMIC TIMELINE EVENT ATTRIBUTES FIELDS */}
                  {(() => {
                    const selectedTeType = projectType.timelineEventTypes?.find(t => t.id === newTeType);
                    const activeTimelineAttributes = selectedTeType ? selectedTeType.attributes : [];
                    return activeTimelineAttributes.map(attr => {
                      const val = timelineEventData[attr.id] ?? "";
                      const updateVal = (newVal: any) => {
                        setTimelineEventData(prev => ({ ...prev, [attr.id]: newVal }));
                      };

                      return (
                        <div key={attr.id} className="text-left mt-2">
                          <label className="block text-[9px] text-slate-400 uppercase mb-1">
                            {attr.name} {attr.required && <span className="text-red-500">*</span>}
                          </label>
                          {attr.type === "textfield" && (
                            <input
                              type="text"
                              value={val}
                              onChange={e => updateVal(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800"
                            />
                          )}
                          {attr.type === "textarea" && (
                            <textarea
                              value={val}
                              onChange={e => updateVal(e.target.value)}
                              rows={2}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white resize-none text-slate-800"
                            />
                          )}
                          {attr.type === "number" && (
                            <input
                              type="number"
                              value={val}
                              onChange={e => updateVal(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800"
                            />
                          )}
                          {attr.type === "money" && renderMoneyInput(timelineEventData[attr.id], updateVal, true)}
                          {attr.type === "date" && (
                            <input
                              type="date"
                              value={val}
                              onChange={e => updateVal(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800"
                            />
                          )}
                          {attr.type === "time" && (
                            <input
                              type="time"
                              value={val}
                              onChange={e => updateVal(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800"
                            />
                          )}
                          {attr.type === "datetime" && (
                            <input
                              type="datetime-local"
                              value={val}
                              onChange={e => updateVal(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800"
                            />
                          )}
                          {attr.type === "select" && (
                            <CustomSelect
                              value={val}
                              onChange={v => updateVal(v)}
                              placeholder={t("Select...", "Vybrať...", "Kiválasztás...")}
                              options={(attr.options || []).map(opt => ({ value: opt, label: opt }))}
                            />
                          )}
                          {attr.type === "contact" && (
                            <ClientSelect
                              leads={leads}
                              value={val}
                              onChange={v => updateVal(v)}
                              placeholder={t("Select Contact...", "Vybrať kontakt...", "Kapcsolat választása...")}
                            />
                          )}
                          {attr.type === "checkbox" && (
                            <div className="space-y-1 py-1">
                              {attr.options ? (
                                attr.options.map(opt => {
                                  const checkedList = asList(val);
                                  const isChecked = checkedList.includes(opt);
                                  return (
                                    <label key={opt} className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 select-none">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          const nextList = isChecked 
                                            ? checkedList.filter(o => o !== opt)
                                            : [...checkedList, opt];
                                          updateVal(nextList);
                                        }}
                                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                                      />
                                      <span>{opt}</span>
                                    </label>
                                  );
                                })
                              ) : (
                                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 select-none">
                                  <input
                                    type="checkbox"
                                    checked={!!val}
                                    onChange={e => updateVal(e.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                                  />
                                  <span>{t("Yes", "Áno", "Igen")}</span>
                                </label>
                              )}
                            </div>
                          )}
                          {attr.type === "radio" && (
                            <div className="space-y-1.5 py-1">
                              {(attr.options || []).map(opt => (
                                <label key={opt} className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 select-none">
                                  <input
                                    type="radio"
                                    name={`te-${attr.id}`}
                                    value={opt}
                                    checked={val === opt}
                                    onChange={() => updateVal(opt)}
                                    className="h-4 w-4 border-slate-300 text-indigo-600"
                                  />
                                  <span>{opt}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          {attr.type === "files" && (
                            <div className="space-y-2">
                              <div className="flex flex-col gap-1.5">
                                {asList(val).map((f, fIdx) => (
                                  <div key={fIdx} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-xl text-[10.5px]">
                                    <span className="truncate max-w-[150px] font-bold text-slate-700">{f.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const currentFiles = asList(val);
                                        const next = currentFiles.filter((_: any, idx: number) => idx !== fIdx);
                                        updateVal(next);
                                      }}
                                      className="p-0.5 text-rose-600 hover:text-rose-800"
                                    >
                                      &times;
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <div className="relative">
                                <button
                                  type="button"
                                  disabled={isUploading === `te-${attr.id}`}
                                  onClick={() => {
                                    document.getElementById(`te-file-input-${attr.id}`)?.click();
                                  }}
                                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-slate-300 text-[10.5px] font-bold text-slate-500 hover:bg-slate-100/50 hover:border-slate-400 transition-all cursor-pointer disabled:opacity-50"
                                >
                                  <Upload className="h-3.5 w-3.5 text-slate-400" />
                                  <span>{isUploading === `te-${attr.id}` ? t("Uploading...", "Nahráva sa...", "Feltöltés...") : t("Upload File", "Nahrať súbor", "Fájl feltöltése")}</span>
                                </button>
                                <input
                                  type="file"
                                  id={`te-file-input-${attr.id}`}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file || !canEdit) return;
                                    setIsUploading(`te-${attr.id}`);
                                    const eventId = `pte-${project.id}-${attr.id}-${Date.now()}`;
                                    const formData = new FormData();
                                    formData.append("file", file);
                                    formData.append("eventId", eventId);
                                    try {
                                      const res = await fetch("/upload.php", { method: "POST", body: formData });
                                      const resData = await res.json();
                                      if (resData.success) {
                                        const sizeStr = file.size > 1024 * 1024 ? (file.size / (1024 * 1024)).toFixed(1) + " MB" : (file.size / 1024).toFixed(0) + " KB";
                                        const uploaded = { name: resData.fileName || file.name, size: sizeStr, path: `/uploads/${eventId}_${resData.fileName || file.name}` };
                                        const current = asList(val);
                                        updateVal([...current, uploaded]);
                                      }
                                    } catch (err) {
                                      console.error(err);
                                    } finally {
                                      setIsUploading(null);
                                    }
                                  }}
                                  className="hidden"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}

                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer mt-4"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{t("Add Event", "Pridať udalosť", "Esemény hozzáadása")}</span>
                  </button>
                </form>
              </div>
              )}

              {/* Timeline Events List */}
              <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 scrollbar-thin">
                {timeline.length === 0 ? (
                  <div className="h-full min-h-[200px] flex items-center justify-center border-2 border-dashed border-slate-100 rounded-2xl p-6 text-slate-400 text-xs">
                    {t("No events logged for this project yet.", "Zatiaľ neboli zaznamenané žiadne udalosti.", "Még nincsenek események rögzítve.")}
                  </div>
                ) : (
                  timeline.map(event => (
                    <div key={event.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm text-xs font-semibold relative group flex gap-3.5 animate-fade-in">
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200 shrink-0 self-start shadow-sm">
                        {getTimelineIcon(event.type, event.eventType)}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-800 text-[13px] font-bold">{event.title}</span>
                            {event.eventType && (
                              <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                {projectType.timelineEventTypes?.find(t => t.id === event.eventType)?.name || event.eventType}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                            <Icons.Clock className="h-3 w-3" />
                            {formatTimestampLocalized(event.timestamp, userLanguage)}
                          </span>
                        </div>
                        {event.content && (
                          <p className="text-slate-500 font-medium mt-1 leading-relaxed whitespace-pre-line">
                            {event.content}
                          </p>
                        )}

                        {/* Timeline custom event attributes values */}
                        {event.data && Object.keys(event.data).length > 0 && (() => {
                          const eventTypeObj = projectType.timelineEventTypes?.find(t => t.id === event.eventType);
                          const eventTypeAttrs = eventTypeObj ? eventTypeObj.attributes : [];
                          if (eventTypeAttrs.length === 0) return null;

                          return (
                            <div className="mt-2.5 grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/50">
                              {eventTypeAttrs.map(attr => {
                                const rawVal = event.data?.[attr.id];
                                if (rawVal === undefined || rawVal === null || rawVal === "" || (Array.isArray(rawVal) && rawVal.length === 0)) return null;

                                let renderedVal = rawVal;
                                if (attr.type === "money") {
                                  const parsed = parseMoneyValue(rawVal, defaultCurrency);
                                  if (parsed.amount === null) return null;
                                  renderedVal = formatMoney(parsed.amount, parsed.currency, userLanguage, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  });
                                } else if (attr.type === "contact") {
                                  const c = leads.find(l => l.id === rawVal);
                                  renderedVal = c ? c.name : rawVal;
                                } else if (attr.type === "files") {
                                  const filesList = asList(rawVal);
                                  renderedVal = (
                                    <div className="flex flex-col gap-1 mt-0.5">
                                      {filesList.map((f: any, fIdx: number) => (
                                        <a key={fIdx} href={f.path} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1 text-[10px] font-bold">
                                          <FileText className="h-3 w-3 shrink-0 text-slate-400" />
                                          <span className="truncate max-w-[120px]">{f.name}</span>
                                        </a>
                                      ))}
                                    </div>
                                  );
                                } else if (Array.isArray(rawVal)) {
                                  renderedVal = rawVal.join(", ");
                                } else if (typeof rawVal === "boolean") {
                                  renderedVal = rawVal ? "Yes" : "No";
                                }

                                return (
                                  <div key={attr.id} className="text-left text-[11px] font-semibold text-slate-500">
                                    <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">{attr.name}</span>
                                    <div className="text-slate-700 mt-0.5">{renderedVal}</div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTimelineEvent(event.id)}
                          className="absolute right-3 bottom-3 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition-all cursor-pointer"
                        >
                          <Trash2 className="h-4.5 w-4.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB CONTENT: Gantt Chart */}
          {activeRightTab === "gantt" && projectType.hasGantt && (() => {
            const { weekdays, weekGroups, totalTimelineWidth } = getGanttTimelineData();
            return (
              <div className="flex-1 overflow-hidden flex flex-col gap-4 text-xs font-semibold">
                
                {/* Gantt Entry Form Inline — adds a row, so only for a role that may edit. */}
                {canEdit && (
                <form onSubmit={handleAddGanttRow} className="bg-slate-50 p-4 border border-slate-200 rounded-2xl flex flex-wrap gap-4 items-end shrink-0">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-[9px] text-slate-400 uppercase mb-1">{t("Task Title", "Názov úlohy", "Feladat címe")}</label>
                    <input
                      value={newGeTitle}
                      onChange={e => setNewGeTitle(e.target.value)}
                      placeholder={t("e.g. Slab fabrication", "napr. Výroba dosiek", "pl. Lapok gyártása")}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase mb-1">{t("Assignee Contact", "Kontakt", "Kapcsolat")}</label>
                    <div className="min-w-[150px]">
                      <ClientSelect
                        leads={leads}
                        value={newGeContactId}
                        onChange={v => setNewGeContactId(v)}
                        placeholder={t("Select Contact...", "Vybrať kontakt...", "Kapcsolat választása...")}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase mb-1">{t("Start Date", "Začiatok", "Kezdet")}</label>
                    <input
                      type="date"
                      value={newGeStart}
                      onChange={e => setNewGeStart(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 uppercase mb-1">{t("End Date", "Koniec", "Vége")}</label>
                    <input
                      type="date"
                      value={newGeEnd}
                      onChange={e => setNewGeEnd(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{t("Add Row", "Pridať", "Hozzáadás")}</span>
                  </button>
                </form>
                )}

                {/* THE GANTT CONTAINER: Left Table & Right Timeline Scrollable */}
                <div className="flex-1 border border-slate-200 rounded-3xl overflow-hidden bg-white shadow-sm flex flex-col relative min-h-[350px]">
                  
                  {/* Zoom controls floating */}
                  <div className="absolute right-4 top-3.5 z-30 flex items-center gap-1 bg-white/90 backdrop-blur border border-slate-200 p-1.5 rounded-xl shadow-sm">
                    <button
                      type="button"
                      onClick={handleZoomOut}
                      className="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors"
                    >
                      <Icons.Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[10px] font-black text-slate-400 px-1.5 uppercase select-none">{columnWidth}px</span>
                    <button
                      type="button"
                      onClick={handleZoomIn}
                      className="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors"
                    >
                      <Icons.Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 flex overflow-hidden">
                    
                    {/* LEFT SIDE PANEL: Tasks table */}
                    <div className="w-[340px] shrink-0 flex flex-col border-r border-slate-200 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.015)]">
                      {/* Left Header */}
                      <div className="h-[76px] border-b border-slate-200 flex items-center justify-between px-4 shrink-0 bg-slate-50/20">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t("Task Name", "Názov úlohy", "Feladat")}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pr-4">{t("Due Date", "Termín", "Határidő")}</span>
                        </div>
                      </div>

                      {/* Left Body List */}
                      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 scrollbar-none" id="gantt-left-body" onScroll={(e) => {
                        const rightBody = document.getElementById("gantt-right-body");
                        if (rightBody) rightBody.scrollTop = (e.target as HTMLDivElement).scrollTop;
                      }}>
                        {gantt.map(row => {
                          const isCompleted = row.progress === 100;
                          return (
                            <div key={row.id} className="h-[44px] flex items-center justify-between px-4 hover:bg-slate-50 transition-colors shrink-0">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateGanttProgress(row.id, isCompleted ? 0 : 100)}
                                  className="focus:outline-none shrink-0 cursor-pointer"
                                >
                                  {isCompleted ? (
                                    <Icons.CheckCircle2 className="h-4.5 w-4.5 text-blue-500 fill-blue-50" />
                                  ) : (
                                    <div className="h-4.5 w-4.5 rounded-full border border-slate-300 bg-white hover:border-slate-500 transition-colors" />
                                  )}
                                </button>
                                <input
                                  value={row.title}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setGantt(prev => prev.map(r => r.id === row.id ? { ...r, title: val } : r));
                                  }}
                                  className="bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-indigo-500/30 rounded px-1.5 py-0.5 flex-1 min-w-0 truncate text-slate-800 font-bold"
                                  placeholder={t("Task name", "Názov úlohy", "Feladat neve")}
                                />
                              </div>
                              <div className="flex items-center gap-1 shrink-0 ml-2">
                                <button
                                  type="button"
                                  onClick={() => openGanttEdit(row)}
                                  className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/50 font-bold px-2 py-0.5 rounded-xl border border-slate-200 transition-all text-[10.5px] cursor-pointer"
                                >
                                  {row.endDate ? (
                                    new Date(row.endDate).toLocaleDateString(userLanguage === "sk" ? "sk-SK" : userLanguage === "hu" ? "hu-HU" : "en-US", { month: "short", day: "numeric" })
                                  ) : (
                                    <Icons.Calendar className="h-3.5 w-3.5 text-slate-400" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveGanttRow(row.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* RIGHT SIDE PANEL: Timeline scrollable */}
                    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/30">
                      
                      {/* Timeline Header */}
                      <div className="h-[76px] border-b border-slate-200 overflow-x-hidden overflow-y-hidden shrink-0 bg-slate-50/20" id="gantt-right-header">
                        <div style={{ width: totalTimelineWidth, height: "100%" }} className="flex flex-col relative select-none">
                          {/* Weeks Row */}
                          <div className="h-[38px] border-b border-slate-100 relative">
                            {weekGroups.map((g, idx) => (
                              <div
                                key={idx}
                                className="absolute h-full border-r border-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 uppercase tracking-wider bg-slate-50/20 px-2"
                                style={{
                                  left: g.startOffset,
                                  width: g.width
                                }}
                              >
                                <span className="truncate">{formatWeekRange(g.monday)}</span>
                              </div>
                            ))}
                          </div>
                          {/* Days Row */}
                          <div className="h-[38px] relative">
                            {weekdays.map((d, idx) => (
                              <div
                                key={idx}
                                className="absolute h-full border-r border-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-400 uppercase"
                                style={{
                                  left: idx * columnWidth,
                                  width: columnWidth
                                }}
                              >
                                {formatDayHeader(d)}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Timeline Body */}
                      <div 
                        className="flex-1 overflow-auto" 
                        id="gantt-right-body"
                        onScroll={(e) => {
                          const target = e.target as HTMLDivElement;
                          const header = document.getElementById("gantt-right-header");
                          if (header) header.scrollLeft = target.scrollLeft;
                          const leftBody = document.getElementById("gantt-left-body");
                          if (leftBody) leftBody.scrollTop = target.scrollTop;
                        }}
                      >
                        <div style={{ width: totalTimelineWidth, minHeight: "100%" }} className="relative divide-y divide-slate-100">
                          {/* Grid background lines */}
                          <div className="absolute inset-y-0 flex z-0 pointer-events-none">
                            {weekdays.map((_, idx) => (
                              <div 
                                key={idx} 
                                className="h-full border-r border-slate-100/70 shrink-0" 
                                style={{ width: columnWidth }}
                              />
                            ))}
                          </div>

                          {/* Task Timeline Rows */}
                          {gantt.map(row => {
                            let hasPill = false;
                            let pillLeft = 0;
                            let pillWidth = 0;

                            const effectiveStart = row.startDate || row.endDate;
                            const effectiveEnd = row.endDate || row.startDate;

                            if (effectiveStart && effectiveEnd) {
                              const startIdx = weekdays.findIndex(d => d.toISOString().slice(0,10) === effectiveStart);
                              const endIdx = weekdays.findIndex(d => d.toISOString().slice(0,10) === effectiveEnd);
                              if (startIdx !== -1 && endIdx !== -1) {
                                hasPill = true;
                                const leftIdx = Math.min(startIdx, endIdx);
                                const rightIdx = Math.max(startIdx, endIdx);
                                pillLeft = leftIdx * columnWidth;
                                pillWidth = (rightIdx - leftIdx + 1) * columnWidth;
                              }
                            }

                            const contact = leads.find(l => l.id === row.contactId);
                            const contactName = contact?.name || "";
                            const initials = contactName ? contactName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "";

                            return (
                              <div key={row.id} className="h-[44px] relative shrink-0 z-10 flex items-center bg-transparent">
                                {hasPill ? (
                                  <div 
                                    className="absolute h-full flex items-center transition-all duration-300"
                                    style={{
                                      left: pillLeft,
                                      width: `calc(100% - ${pillLeft}px)`
                                    }}
                                  >
                                    {/* Green Pill bar */}
                                    <div 
                                      className="h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 shrink-0 select-none cursor-pointer flex items-center justify-center hover:bg-emerald-500/30 transition-colors"
                                      style={{ width: pillWidth }}
                                      onClick={() => openGanttEdit(row)}
                                      title={`${formatDateLocalized(row.startDate || row.endDate, userLanguage)} to ${formatDateLocalized(row.endDate || row.startDate, userLanguage)}`}
                                    />
                                    
                                    {/* Assignee initials badge */}
                                    {initials && (
                                      <div 
                                        className={`h-5.5 w-5.5 rounded-full shrink-0 flex items-center justify-center text-[9px] font-black text-white ml-2 shadow-sm uppercase ${
                                          row.progress === 100 ? "bg-blue-500" : "bg-orange-500"
                                        }`}
                                        title={contactName}
                                      >
                                        {initials}
                                      </div>
                                    )}

                                    {/* Task name display next to badge */}
                                    <span 
                                      className="ml-2 text-[11px] font-bold text-slate-700 truncate cursor-pointer hover:underline max-w-[300px]"
                                      onClick={() => openGanttEdit(row)}
                                    >
                                      {row.title}
                                    </span>
                                  </div>
                                ) : (
                                  // If no dates set, show yellow dot and name on the left of timeline
                                  <div className="absolute h-full flex items-center left-3">
                                    <div className="h-2 w-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                                    {initials && (
                                      <div className="h-5 w-5 rounded-full bg-slate-500 shrink-0 flex items-center justify-center text-[8.5px] font-black text-white ml-2 shadow-sm">
                                        {initials}
                                      </div>
                                    )}
                                    <span 
                                      className="ml-2 text-[11px] font-bold text-slate-400 italic cursor-pointer hover:underline truncate max-w-[250px]"
                                      onClick={() => openGanttEdit(row)}
                                    >
                                      {row.title} ({t("no dates", "bez termínu", "nincs határidő")})
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </div>

                  </div>
                </div>

              </div>
            );
          })()}

          {/* GANTT EDIT MODAL */}
          {selectedGanttEdit && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
              <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-glass border border-slate-200/60 text-left space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h4 className="font-heading font-bold text-sm text-slate-800">
                    {t("Edit Task Details", "Upraviť podrobnosti úlohy", "Feladat részleteinek szerkesztése")}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setSelectedGanttEdit(null)}
                    className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                  >
                    <Icons.X className="h-4.5 w-4.5" />
                  </button>
                </div>

                <div className="space-y-3.5 text-xs font-semibold text-slate-700">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t("Task Title", "Názov úlohy", "Feladat címe")}</label>
                    <input
                      type="text"
                      value={selectedGanttEdit.title}
                      onChange={e => {
                        const val = e.target.value;
                        setSelectedGanttEdit(prev => prev ? { ...prev, title: val } : null);
                        setGantt(prev => prev.map(r => r.id === selectedGanttEdit.id ? { ...r, title: val } : r));
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t("Assignee Contact", "Kontakt", "Kapcsolat")}</label>
                    <ClientSelect
                      leads={leads}
                      value={selectedGanttEdit.contactId}
                      onChange={v => {
                        setSelectedGanttEdit(prev => prev ? { ...prev, contactId: v } : null);
                        setGantt(prev => prev.map(r => r.id === selectedGanttEdit.id ? { ...r, contactId: v } : r));
                      }}
                      placeholder={t("Select Contact...", "Vybrať kontakt...", "Kapcsolat választása...")}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t("Start Date", "Začiatok", "Kezdet")}</label>
                      <input
                        type="date"
                        value={selectedGanttEdit.startDate || ""}
                        onChange={e => {
                          const val = e.target.value;
                          setSelectedGanttEdit(prev => prev ? { ...prev, startDate: val || undefined } : null);
                          setGantt(prev => prev.map(r => r.id === selectedGanttEdit.id ? { ...r, startDate: val || undefined } : r));
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{t("End Date", "Koniec", "Vége")}</label>
                      <input
                        type="date"
                        value={selectedGanttEdit.endDate || ""}
                        onChange={e => {
                          const val = e.target.value;
                          setSelectedGanttEdit(prev => prev ? { ...prev, endDate: val || undefined } : null);
                          setGantt(prev => prev.map(r => r.id === selectedGanttEdit.id ? { ...r, endDate: val || undefined } : r));
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">{t("Progress", "Postup", "Haladás")} ({selectedGanttEdit.progress}%)</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={selectedGanttEdit.progress}
                        onChange={e => {
                          const val = parseInt(e.target.value);
                          setSelectedGanttEdit(prev => prev ? { ...prev, progress: val } : null);
                          setGantt(prev => prev.map(r => r.id === selectedGanttEdit.id ? { ...r, progress: val } : r));
                        }}
                        className="flex-1 accent-indigo-600"
                      />
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedGanttEdit(prev => prev ? { ...prev, progress: 0 } : null);
                            setGantt(prev => prev.map(r => r.id === selectedGanttEdit.id ? { ...r, progress: 0 } : r));
                          }}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] cursor-pointer"
                        >
                          0%
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedGanttEdit(prev => prev ? { ...prev, progress: 100 } : null);
                            setGantt(prev => prev.map(r => r.id === selectedGanttEdit.id ? { ...r, progress: 100 } : r));
                          }}
                          className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] cursor-pointer"
                        >
                          100%
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    type="button"
                    onClick={() => setSelectedGanttEdit(null)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    {t("Close", "Zatvoriť", "Bezárás")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: Files — the type's default files, then this project's own */}
          {activeRightTab === "files" && (
            <div className="flex-1 overflow-y-auto space-y-5 scrollbar-thin pr-1 animate-in fade-in duration-150 text-left">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col min-w-0">
                  <span className="font-heading font-bold text-sm text-slate-800 flex items-center gap-1.5">
                    <Paperclip className="h-4 w-4 text-slate-400" />
                    {t("Files", "Súbory", "Fájlok")}
                  </span>
                  <span className="text-[11px] font-medium text-slate-400 mt-0.5">
                    {t(
                      "Default files come from the project type. Custom files belong to this project only.",
                      "Predvolené súbory určuje typ projektu. Vlastné súbory patria len tomuto projektu.",
                      "Az alapértelmezett fájlokat a projekt típus adja. Az egyedi fájlok csak ehhez a projekthez tartoznak.",
                    )}
                  </span>
                </div>
                {fileSlots.length > 0 && (
                  missingFileCount > 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-rose-200 bg-rose-50 text-[10px] font-black uppercase tracking-wider text-rose-700 whitespace-nowrap">
                      <CircleAlert className="h-3.5 w-3.5" />
                      {missingFilesLabel(missingFileCount)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-[10px] font-black uppercase tracking-wider text-emerald-700 whitespace-nowrap">
                      <CircleCheck className="h-3.5 w-3.5" />
                      {t("All files uploaded", "Všetky súbory nahrané", "Minden fájl feltöltve")}
                    </span>
                  )
                )}
              </div>

              {/* Default files */}
              <div className="space-y-2">
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {t("Default files", "Predvolené súbory", "Alapértelmezett fájlok")}
                </span>
                {fileSlots.some(s => !s.custom) ? (
                  fileSlots.filter(s => !s.custom).map(renderFileSlot)
                ) : (
                  <p className="p-3 border-2 border-dashed border-slate-200 rounded-2xl text-center text-slate-400 text-xs font-semibold">
                    {t("This project type has no default files.", "Tento typ projektu nemá predvolené súbory.", "Ennek a projekt típusnak nincsenek alapértelmezett fájljai.")}
                  </p>
                )}
              </div>

              {/* Custom files — this project only */}
              <div className="space-y-2">
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {t("Custom files", "Vlastné súbory", "Egyedi fájlok")}
                </span>
                {fileSlots.some(s => s.custom) ? (
                  fileSlots.filter(s => s.custom).map(renderFileSlot)
                ) : (
                  <p className="text-[11px] font-semibold text-slate-400">
                    {t("No custom files on this project.", "Tento projekt nemá vlastné súbory.", "Ennek a projektnek nincsenek egyedi fájljai.")}
                  </p>
                )}

                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                    <input
                      value={newCustomFileName}
                      onChange={e => setNewCustomFileName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCustomFileField();
                        }
                      }}
                      placeholder={t("e.g. Building permit", "napr. Stavebné povolenie", "pl. Építési engedély")}
                      className="flex-1 min-w-[8rem] px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-800 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomFileField}
                      disabled={!canAddCustomFile}
                      title={newCustomFileTaken ? t("A file with this name already exists.", "Súbor s týmto názvom už existuje.", "Ilyen nevű fájl már létezik.") : undefined}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                      <span>{t("Add custom file", "Pridať vlastný súbor", "Egyedi fájl hozzáadása")}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB CONTENT: Finances & Revenue Analysis (CRITICAL REQUIREMENT #5, #6, #7) */}
          {activeRightTab === "finances" && (
            <div className="flex-1 overflow-y-auto space-y-6 scrollbar-thin pr-1 animate-in fade-in duration-150 text-left">
              {/* 0. Project Budget — the ceiling the direct costs are measured against */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Wallet className="h-4 w-4 text-indigo-600 shrink-0" />
                    <span className="text-xs font-bold text-slate-900 uppercase">
                      {t("Project Budget", "Rozpočet projektu", "Projekt költségvetése")}
                    </span>
                    {budgetAnalysis && budgetDraft === null && (
                      <span className="text-sm font-black text-slate-900">{money(budgetAnalysis.budget)}</span>
                    )}
                  </div>

                  {budgetDraft === null ? (
                    <button
                      type="button"
                      onClick={() => setBudgetDraft(budgetAnalysis ? String(budgetAnalysis.budget) : "")}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95"
                    >
                      {budgetAnalysis ? <Edit3 className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      {budgetAnalysis
                        ? t("Edit Budget", "Upraviť rozpočet", "Költségvetés módosítása")
                        : t("Set Budget", "Nastaviť rozpočet", "Költségvetés megadása")}
                    </button>
                  ) : (
                    <form onSubmit={handleSaveBudget} className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        type="number"
                        min="0"
                        step="0.01"
                        value={budgetDraft}
                        onChange={(e) => setBudgetDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Escape") setBudgetDraft(null); }}
                        placeholder="0.00"
                        aria-label={t("Project Budget", "Rozpočet projektu", "Projekt költségvetése")}
                        className="w-32 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                      <span className="text-[11px] font-bold text-slate-500">{currencyCode}</span>
                      <button
                        type="submit"
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-95"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {t("Save", "Uložiť", "Mentés")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBudgetDraft(null)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer transition-colors"
                        aria-label={t("Cancel", "Zrušiť", "Mégse")}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </form>
                  )}
                </div>

                {!budgetAnalysis ? (
                  <p className="text-[11px] text-slate-500">
                    {t(
                      "No budget set yet. Set one to see how the project's costs compare with it. (The \"Planned\" figures below are the sums of the planned amounts on invoices and expenses.)",
                      "Rozpočet zatiaľ nie je nastavený. Po nastavení uvidíte, ako sa k nemu majú náklady projektu. (Hodnoty „Plán“ nižšie sú súčty plánovaných súm na faktúrach a výdavkoch.)",
                      "Még nincs költségvetés megadva. Megadása után látható, hogyan viszonyulnak hozzá a projekt költségei. (Az alábbi „Terv” értékek a számlák és kiadások tervezett összegeinek összegei.)",
                    )}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <div className="relative w-full h-2 bg-slate-200/70 rounded-full overflow-hidden">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${budgetAnalysis.tone === "ok" ? "bg-emerald-200" : "bg-amber-200"}`}
                        style={{ width: `${Math.min(budgetAnalysis.plannedPct, 100)}%` }}
                      />
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${budgetAnalysis.tone === "over" ? "bg-rose-500" : budgetAnalysis.tone === "atRisk" ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(budgetAnalysis.spentPct, 100)}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span>
                        {t("Spent:", "Minuté:", "Elköltve:")} <strong className="text-slate-700">{money(budgetAnalysis.spent)}</strong> ({budgetAnalysis.spentPct.toFixed(0)}%)
                        {" · "}
                        {t("Planned costs:", "Plánované náklady:", "Tervezett költségek:")} <strong className="text-slate-700">{money(budgetAnalysis.planned)}</strong> ({budgetAnalysis.plannedPct.toFixed(0)}%)
                      </span>
                      <span className={`font-bold ${budgetAnalysis.tone === "over" ? "text-rose-600" : budgetAnalysis.tone === "atRisk" ? "text-amber-600" : "text-emerald-600"}`}>
                        {budgetAnalysis.remaining >= 0
                          ? `${t("Remaining:", "Zostáva:", "Hátralévő:")} ${money(budgetAnalysis.remaining)}`
                          : `${t("Over budget by", "Prekročené o", "Túllépés:")} ${money(-budgetAnalysis.remaining)}`}
                        {budgetAnalysis.tone === "atRisk" && ` · ${t("planned costs exceed the budget", "plánované náklady prekračujú rozpočet", "a tervezett költségek meghaladják a keretet")}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 1. Project Revenue & Profitability Scorecard */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Revenue Card */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase">
                    <span>{t("Project Revenue", "Príjmy z projektu", "Projekt bevételek")}</span>
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="text-xl font-black text-slate-900 mt-1">
                    {money(revenueAnalysis.totalRealIncome)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {t("Planned:", "Plán:", "Terv:")} <strong>{money(revenueAnalysis.totalPlannedIncome)}</strong>
                  </div>
                </div>

                {/* Costs Card */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase">
                    <span>{t("Project Costs", "Priame náklady", "Közvetlen költségek")}</span>
                    <TrendingDown className="h-4 w-4 text-rose-500" />
                  </div>
                  <div className="text-xl font-black text-slate-900 mt-1">
                    {money(revenueAnalysis.totalRealExpenses)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {t("Planned:", "Plán:", "Terv:")} <strong>{money(revenueAnalysis.totalPlannedExpenses)}</strong>
                  </div>
                </div>

                {/* Net Profit Card */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase">
                    <span>{t("Net Profit", "Čistý zisk", "Nettó nyereség")}</span>
                    <DollarSign className="h-4 w-4 text-indigo-500" />
                  </div>
                  <div className={`text-xl font-black mt-1 ${revenueAnalysis.realProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {money(revenueAnalysis.realProfit)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {t("Planned:", "Plán:", "Terv:")} <strong>{money(revenueAnalysis.plannedProfit)}</strong>
                  </div>
                </div>

                {/* Profit Margin Card */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase">
                    <span>{t("Profit Margin", "Zisková marža", "Haszonkulcs")}</span>
                    <Coins className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className={`text-xl font-black mt-1 ${revenueAnalysis.realMarginPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {revenueAnalysis.realMarginPct.toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {t("Planned:", "Plán:", "Terv:")} <strong>{revenueAnalysis.plannedMarginPct.toFixed(1)}%</strong>
                  </div>
                </div>
              </div>

              {/* 2. INVOICES SECTION */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-900 uppercase">
                      {t("Issued & Scheduled Invoices", "Faktúry a vystavené doklady", "Kimenő és tervezett számlák")} ({projectInvoices.length})
                    </span>
                  </div>
                  {canEditFinance && (
                    <button
                      type="button"
                      onClick={() => handleOpenProjectFinModal("income")}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t("Issue / Plan Invoice", "Vystaviť / naplánovať faktúru", "Új számla kiállítása")}
                    </button>
                  )}
                </div>

                {projectInvoices.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 font-medium">
                    {t("No invoices issued for this project yet.", "K tomuto projektu zatiaľ neboli vystavené žiadne faktúry.", "Még nincsenek számlák rögzítve ehhez a projekthez.")}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-400 border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3 font-semibold">{t("Date", "Dátum", "Dátum")}</th>
                          <th className="py-2 px-3 font-semibold">{t("Invoice # & Title", "Číslo FA a popis", "Számlaszám és tétel")}</th>
                          <th className="py-2 px-3 font-semibold text-right">{t("Planned (€)", "Plánované (€)", "Tervezett (€)")}</th>
                          <th className="py-2 px-3 font-semibold text-right">{t("Real (€)", "Uhradené (€)", "Fizetett (€)")}</th>
                          <th className="py-2 px-3 font-semibold text-center">{t("Status", "Stav", "Állapot")}</th>
                          <th className="py-2 px-3 font-semibold text-right">{t("Actions", "Akcie", "Műveletek")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60 font-semibold text-slate-700">
                        {projectInvoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-white/80">
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <div>{formatDateLocalized(inv.issueDate, userLanguage)}</div>
                              {inv.dueDate && <div className="text-[10px] text-slate-400">{t("Due:", "Splatné:", "Esedékes:")} {formatDateLocalized(inv.dueDate, userLanguage)}</div>}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900">{inv.title}</div>
                              {inv.invoiceNumber && <span className="text-[10px] font-mono text-slate-500">#{inv.invoiceNumber}</span>}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-500 font-normal">{money(inv.amountPlanned)}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-600">{money(inv.amountReal)}</td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                inv.status === "paid" ? "bg-emerald-100 text-emerald-800" : inv.status === "overdue" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                              }`}>
                                {inv.status === "paid" ? t("Paid", "Uhradené", "Fizetve") : inv.status === "overdue" ? t("Overdue", "Po splatnosti", "Lejárt") : t("Pending", "Čaká na úhradu", "Függő")}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {canEditFinance && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenProjectFinModal("income", inv)}
                                    disabled={inv.isRecurring}
                                    title={inv.isRecurring ? t("This is a recurring rule — edit it from Financial Management → Recurring.", "Toto je opakovaná platba — upravte ju v Finančnom prehľade → Opakované platby.", "Ez egy ismétlődő szabály — szerkessze a Pénzügyek → Ismétlődők nézetben.") : undefined}
                                    className="p-1 text-slate-400 hover:text-indigo-600 rounded disabled:opacity-40 disabled:hover:text-slate-400 disabled:cursor-not-allowed"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {canDeleteFinance && (
                                  <button
                                    onClick={() => handleDeleteProjectFinancial(inv.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 3. EXPENSES SECTION */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-rose-600" />
                    <span className="text-xs font-bold text-slate-900 uppercase">
                      {t("Direct Project Costs & Materials", "Priame náklady a materiál projektu", "Közvetlen projektköltségek és anyagok")} ({projectExpenses.length})
                    </span>
                  </div>
                  {canEditFinance && (
                    <button
                      type="button"
                      onClick={() => handleOpenProjectFinModal("expense")}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t("Add Project Expense", "Pridať výdavok k projektu", "Új kiadás rögzítése")}
                    </button>
                  )}
                </div>

                {projectExpenses.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 font-medium">
                    {t("No expenses logged for this project yet.", "K tomuto projektu zatiaľ neboli zaevidované žiadne výdavky.", "Még nincsenek kiadások rögzítve.")}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-400 border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3 font-semibold">{t("Date", "Dátum", "Dátum")}</th>
                          <th className="py-2 px-3 font-semibold">{t("Expense Title & Category", "Názov a kategória", "Megnevezés és kategória")}</th>
                          <th className="py-2 px-3 font-semibold text-right">{t("Planned (€)", "Plánované (€)", "Tervezett (€)")}</th>
                          <th className="py-2 px-3 font-semibold text-right">{t("Real (€)", "Zaplatené (€)", "Kifizetett (€)")}</th>
                          <th className="py-2 px-3 font-semibold text-center">{t("Status", "Stav", "Állapot")}</th>
                          <th className="py-2 px-3 font-semibold text-right">{t("Actions", "Akcie", "Műveletek")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60 font-semibold text-slate-700">
                        {projectExpenses.map((exp) => (
                          <tr key={exp.id} className="hover:bg-white/80">
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {formatDateLocalized(exp.issueDate, userLanguage)}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900">{exp.title}</div>
                              {exp.categoryPath && <span className="text-[10px] text-slate-400">{exp.categoryPath}</span>}
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-500 font-normal">{money(exp.amountPlanned)}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-rose-600">{money(exp.amountReal)}</td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                exp.status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
                              }`}>
                                {exp.status === "paid" ? t("Paid", "Zaplatené", "Kifizetve") : t("Planned", "Plánované", "Tervezett")}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {canEditFinance && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenProjectFinModal("expense", exp)}
                                    disabled={exp.isRecurring}
                                    title={exp.isRecurring ? t("This is a recurring rule — edit it from Financial Management → Recurring.", "Toto je opakovaná platba — upravte ju v Finančnom prehľade → Opakované platby.", "Ez egy ismétlődő szabály — szerkessze a Pénzügyek → Ismétlődők nézetben.") : undefined}
                                    className="p-1 text-slate-400 hover:text-indigo-600 rounded disabled:opacity-40 disabled:hover:text-slate-400 disabled:cursor-not-allowed"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {canDeleteFinance && (
                                  <button
                                    onClick={() => handleDeleteProjectFinancial(exp.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 4. Cost Structure Breakdown by Category */}
              {revenueAnalysis.expensesByCategory.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase">
                    <PieChart className="h-4 w-4 text-indigo-600" />
                    <span>{t("Project Cost Breakdown by Category", "Štruktúra nákladov projektu podľa kategórií", "Költségstruktúra kategóriák szerint")}</span>
                  </div>
                  <div className="space-y-2">
                    {revenueAnalysis.expensesByCategory.map((cat, idx) => {
                      const pct = revenueAnalysis.totalRealExpenses > 0 ? (cat.real / revenueAnalysis.totalRealExpenses) * 100 : 0;
                      return (
                        <div key={idx} className="p-2 bg-white rounded-xl border border-slate-100">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                              {cat.name}
                            </span>
                            <span className="font-bold text-slate-900">
                              {money(cat.real)} <span className="text-[10px] text-slate-400">({pct.toFixed(0)}%)</span>
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ backgroundColor: cat.color, width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PROJECT FINANCIAL MODAL */}
          {isFinModalOpen && (
            <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    {finFormType === "income" ? <TrendingUp className="h-5 w-5 text-emerald-600" /> : <TrendingDown className="h-5 w-5 text-rose-600" />}
                    <h3 className="text-sm font-bold text-slate-900">
                      {finEditingRecord
                        ? (finFormType === "income" ? t("Edit Project Invoice", "Upraviť faktúru projektu", "Számla szerkesztése") : t("Edit Project Expense", "Upraviť výdavok projektu", "Kiadás szerkesztése"))
                        : (finFormType === "income" ? t("Issue Project Invoice", "Vystaviť faktúru pre projekt", "Számla kiállítása projekthez") : t("Add Project Expense", "Pridať výdavok k projektu", "Új kiadás hozzáadása"))}
                    </h3>
                  </div>
                  <button onClick={() => setIsFinModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form onSubmit={handleSaveProjectFinancial} className="space-y-3.5 text-xs font-semibold text-left">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase mb-1">{t("Title / Description *", "Názov / Popis *", "Megnevezés *")}</label>
                    <input
                      required
                      value={finFormTitle}
                      onChange={(e) => setFinFormTitle(e.target.value)}
                      placeholder={finFormType === "income" ? t("e.g. Advance invoice 50%...", "napr. Zálohová faktúra 50%...", "pl. Előlegszámla 50%...") : t("e.g. Material purchase, rental...", "napr. Nákup materiálu, prenájom...", "pl. Anyagbeszerzés, bérlet...")}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:border-indigo-500 font-medium"
                    />
                  </div>

                  {finFormType === "income" && (
                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase mb-1">{t("Invoice Number", "Číslo faktúry", "Számlaszám")}</label>
                      <input
                        value={finFormInvoiceNumber}
                        onChange={(e) => setFinFormInvoiceNumber(e.target.value)}
                        placeholder="FA-2026-0001"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase mb-1">{t("Planned Amount (€) *", "Plánovaná suma (€) *", "Tervezett összeg (€) *")}</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={finFormAmountPlanned}
                        onChange={(e) => setFinFormAmountPlanned(e.target.value ? parseFloat(e.target.value) : "")}
                        placeholder="0.00"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase mb-1">{t("Real / Paid Amount (€)", "Skutočná suma (€)", "Valós összeg (€)")}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={finFormAmountReal}
                        onChange={(e) => setFinFormAmountReal(e.target.value ? parseFloat(e.target.value) : "")}
                        placeholder="0.00"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-emerald-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase mb-1">{t("Category", "Kategória", "Kategória")}</label>
                      <select
                        value={finFormCategoryId}
                        onChange={(e) => setFinFormCategoryId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                      >
                        <option value="">{t("-- Select Category --", "-- Vyberte kategóriu --", "-- Válasszon --")}</option>
                        {financialCategories
                          .filter((c) => c.type === finFormType)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.level === 1 ? `● ${c.name}` : `  ↳ ${c.name}`}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase mb-1">{t("Status", "Stav", "Állapot")}</label>
                      <select
                        value={finFormStatus}
                        onChange={(e) => setFinFormStatus(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                      >
                        {FINANCIAL_STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s === "planned"
                              ? t("Planned", "Plánované", "Tervezett")
                              : s === "pending"
                              ? t("Pending", "Čaká na úhradu", "Függő")
                              : s === "partially_paid"
                              ? t("Partially Paid", "Čiastočne uhradené", "Részben fizetve")
                              : s === "paid"
                              ? t("Paid", "Uhradené", "Fizetve")
                              : s === "overdue"
                              ? t("Overdue", "Po splatnosti", "Lejárt")
                              : t("Cancelled", "Zrušené", "Törölve")}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase mb-1">{t("Issue Date", "Dátum vystavenia", "Kiállítás dátuma")}</label>
                      <input
                        type="date"
                        required
                        value={finFormIssueDate}
                        onChange={(e) => setFinFormIssueDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase mb-1">{t("Due Date", "Dátum splatnosti", "Esedékesség")}</label>
                      <input
                        type="date"
                        value={finFormDueDate}
                        onChange={(e) => setFinFormDueDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsFinModalOpen(false)}
                      className="px-4 py-2 rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
                    >
                      {t("Cancel", "Zrušiť", "Mégsem")}
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer shadow-sm"
                    >
                      {t("Save", "Uložiť", "Mentés")}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
