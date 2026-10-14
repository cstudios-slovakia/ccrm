import React, { useState, useMemo, useEffect } from "react";
import {
  Ticket as TicketIcon,
  Plus,
  Search,
  Mail,
  Settings,
  Rows3,
  LayoutGrid,
  Clock,
  AlertTriangle,
  CheckCircle2,
  User,
  Briefcase,
  Send,
  Lock,
  Trash2,
  Archive,
  ArchiveRestore,
  CheckSquare,
  Timer,
  ShieldCheck,
  Terminal,
  Image as ImageIcon,
  X,
  RefreshCw,
  Edit3,
  Phone,
  MapPin,
  Globe,
  Repeat,
  Unlink,
  ArrowLeft,
  MessageSquare,
  CloudCheck,
  Check,
} from "lucide-react";
import type {
  Ticket,
  TicketAttachment,
  TicketMessage,
  TicketPriority,
  TicketType,
  TicketStatusDefinition,
  TicketSettings,
  SupportContract,
  Project,
  ProjectType,
  Lead,
  Task,
  UserProfile,
} from "../types";
import { getTranslation, type Language } from "../utils/translations";
import type { ModuleAccess } from "../utils/permissions";
import { FULL_MODULE_ACCESS } from "../utils/permissions";
import {
  DEFAULT_TICKET_STATUSES,
  DEFAULT_TICKET_SETTINGS,
  PRIORITY_COLORS,
  ticketStatusColor,
  ticketStatusLabel,
  isClosedTicketStatus,
  evaluateTicketSla,
  computeSlaDueDates,
  generateTicketNumber,
  formatDurationMinutes,
} from "../utils/tickets";
import { isDoneTaskState } from "../utils/projectTasks";
import { projectDisplayName } from "../utils/projects";
import {
  nowLocalStamp,
  todayLocalPlusDays,
  formatTimestampLocalized,
} from "../utils/localTime";
import { EntityHeader, PageHeader } from "./layout";
import { CustomSelect } from "./ui/CustomSelect";
import { ClientSelect } from "./ui/ClientSelect";
import { PipelineStrip, type PipelineStripSegment } from "./ui/PipelineStrip";
import {
  TicketRichHtmlEditor,
  TicketHtmlContent,
  TicketAttachmentsList,
  isImageAttachment,
  isRichTextEmpty,
} from "./ui/TicketRichHtmlEditor";

interface TicketsViewProps {
  initialSelectedTicketId?: string;
  tickets: Ticket[];
  setTickets: React.Dispatch<React.SetStateAction<Ticket[]>>;
  supportContracts: SupportContract[];
  setSupportContracts: React.Dispatch<React.SetStateAction<SupportContract[]>>;
  ticketStatuses: TicketStatusDefinition[];
  ticketSettings: TicketSettings;
  projects: Project[];
  projectTypes?: ProjectType[];
  leads: Lead[];
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  taskStates: string[];
  users: UserProfile[];
  currentUser?: UserProfile | null;
  userLanguage: Language;
  access?: ModuleAccess;
  settingsAccess?: ModuleAccess;
  onRefreshSync?: () => void;
  onNavigate?: (route: string) => void;
}

export const TicketsView: React.FC<TicketsViewProps> = ({
  initialSelectedTicketId,
  tickets,
  setTickets,
  supportContracts,
  setSupportContracts,
  ticketStatuses = DEFAULT_TICKET_STATUSES,
  ticketSettings = DEFAULT_TICKET_SETTINGS,
  projects,
  projectTypes = [],
  leads,
  tasks,
  setTasks,
  taskStates,
  users,
  currentUser,
  userLanguage,
  access = FULL_MODULE_ACCESS,
  settingsAccess = FULL_MODULE_ACCESS,
  onRefreshSync,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  const canEdit = access.edit;
  const canDelete = access.edit && access.delete;

  const orderedStatuses = useMemo(
    () =>
      [...ticketStatuses].sort(
        (a, b) => (a.sortOrder ?? a.order ?? 0) - (b.sortOrder ?? b.order ?? 0),
      ),
    [ticketStatuses],
  );

  // Filters & view state
  const [searchQuery, setSearchQuery] = useState("");
  const [kpiBucket, setKpiBucket] = useState<
    "all_open" | "unassigned" | "waiting_client" | "sla_risk" | "resolved" | "all"
  >("all_open");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [archiveScope, setArchiveScope] = useState<"active" | "archived">("active");
  const [viewMode, setViewMode] = useState<"table" | "board">("table");

  // Selected Ticket for Full Detail View
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(
    initialSelectedTicketId || null,
  );

  useEffect(() => {
    setSelectedTicketId(initialSelectedTicketId || null);
  }, [initialSelectedTicketId]);

  const selectedTicket = useMemo(
    () => tickets.find((tk) => tk.id === selectedTicketId) || null,
    [tickets, selectedTicketId],
  );

  // In-place subject editing in EntityHeader
  const [isEditingSubject, setIsEditingSubject] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState("");

  // In-place description editing in Ticket Card
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionAttachmentsDraft, setDescriptionAttachmentsDraft] = useState<
    TicketAttachment[]
  >([]);

  // Pairing pickers in Left Column
  const [pickingProject, setPickingProject] = useState(false);
  const [pickingClient, setPickingClient] = useState(false);

  // Reset detail-local edit modes when switching tickets
  useEffect(() => {
    setIsEditingSubject(false);
    setIsEditingDescription(false);
    setPickingProject(false);
    setPickingClient(false);
  }, [selectedTicketId]);

  // Reply composer state
  const [replyTab, setReplyTab] = useState<"public" | "internal">("public");
  const [replyBody, setReplyBody] = useState("");
  const [sendViaEmail, setSendViaEmail] = useState(true);
  const [replyAttachments, setReplyAttachments] = useState<TicketAttachment[]>([]);
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Create Ticket Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTicketAttachments, setNewTicketAttachments] = useState<TicketAttachment[]>([]);
  const [newPriority, setNewPriority] = useState<TicketPriority>("normal");
  const [newType, setNewType] = useState<TicketType>("bug");
  const [newProjectId, setNewProjectId] = useState<string>("");
  const [newLeadId, setNewLeadId] = useState<string>("");
  const [newContractId] = useState<string>("");
  const [newReporterName, setNewReporterName] = useState("");
  const [newReporterEmail, setNewReporterEmail] = useState("");
  const [newAssignee, setNewAssignee] = useState<string>(currentUser?.name || "");

  // Support Contracts Modal state
  const [showContractsModal, setShowContractsModal] = useState(false);
  const [contractName, setContractName] = useState("");
  const [contractProjectId, setContractProjectId] = useState("");
  const [contractLeadId] = useState("");
  const [contractHours, setContractHours] = useState<number>(10);
  const [contractRate] = useState<number>(65);
  const [contractTier] = useState<"standard" | "priority" | "enterprise">("standard");

  // Task creation from ticket state
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState(currentUser?.name || "");
  const [showTaskForm, setShowTaskForm] = useState(false);

  // Time entry form state
  const [logMinutes, setLogMinutes] = useState<string>("30");
  const [logDesc, setLogDesc] = useState<string>("");
  const [logBillable] = useState<boolean>(true);

  // Email polling state
  const [isPollingImap, setIsPollingImap] = useState(false);

  // Helpers to resolve Project & Client names
  const getProjectName = (projectId?: string | null) => {
    if (!projectId) return null;
    const p = projects.find((pr) => pr.id === projectId);
    if (!p) return null;
    return projectDisplayName(
      p,
      leads,
      t("Untitled Project", "Projekt bez názvu", "Névtelen projekt"),
    );
  };

  const getClientForTicket = (tk: Ticket): Lead | null => {
    if (tk.leadId) {
      const direct = leads.find((l) => l.id === tk.leadId);
      if (direct) return direct;
    }
    if (tk.clientId) {
      const direct = leads.find((l) => l.id === tk.clientId);
      if (direct) return direct;
    }
    if (tk.projectId) {
      const proj = projects.find((p) => p.id === tk.projectId);
      if (proj?.leadId) {
        return leads.find((l) => l.id === proj.leadId) || null;
      }
      if (proj?.clientId) {
        return leads.find((l) => l.id === proj.clientId) || null;
      }
    }
    return null;
  };

  // KPI Counts
  const kpiCounts = useMemo(() => {
    const active = tickets.filter((tk) => !tk.archived && !tk.isArchived);
    let allOpen = 0;
    let unassigned = 0;
    let waitingClient = 0;
    let slaRisk = 0;
    let resolved = 0;

    for (const tk of active) {
      const closed = isClosedTicketStatus(tk.status, ticketStatuses);
      if (closed) {
        resolved++;
      } else {
        allOpen++;
        if (!tk.assignedUsers || tk.assignedUsers.length === 0) {
          unassigned++;
        }
        if (tk.status === "waiting_client") {
          waitingClient++;
        }
        const sla = evaluateTicketSla(tk, ticketStatuses);
        if (sla.state === "warning" || sla.state === "breached") {
          slaRisk++;
        }
      }
    }
    return {
      allOpen,
      unassigned,
      waitingClient,
      slaRisk,
      resolved,
      total: active.length,
    };
  }, [tickets, ticketStatuses]);

  // Filtered Tickets
  const filteredTickets = useMemo(() => {
    return tickets
      .filter((tk) => {
        const isArch = Boolean(tk.archived || tk.isArchived);
        if (archiveScope === "active" && isArch) return false;
        if (archiveScope === "archived" && !isArch) return false;

        // KPI Bucket filter (when statusFilter === 'all')
        // In Kanban board mode, show all status columns (including Resolved/Closed) when on the default "all_open" bucket
        if (statusFilter === "all" && archiveScope === "active") {
          const closed = isClosedTicketStatus(tk.status, ticketStatuses);
          if (kpiBucket === "all_open" && closed && viewMode !== "board")
            return false;
          if (
            kpiBucket === "unassigned" &&
            (closed || (tk.assignedUsers && tk.assignedUsers.length > 0))
          )
            return false;
          if (kpiBucket === "waiting_client" && tk.status !== "waiting_client")
            return false;
          if (kpiBucket === "sla_risk") {
            const sla = evaluateTicketSla(tk, ticketStatuses);
            if (sla.state !== "warning" && sla.state !== "breached") return false;
          }
          if (kpiBucket === "resolved" && !closed && viewMode !== "board")
            return false;
        }

        if (statusFilter !== "all" && tk.status !== statusFilter) return false;
        if (priorityFilter !== "all" && tk.priority !== priorityFilter)
          return false;
        if (projectFilter !== "all" && tk.projectId !== projectFilter)
          return false;
        if (assigneeFilter !== "all") {
          if (assigneeFilter === "__unassigned__") {
            if (tk.assignedUsers && tk.assignedUsers.length > 0) return false;
          } else if (!(tk.assignedUsers || []).includes(assigneeFilter)) {
            return false;
          }
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const projName = (getProjectName(tk.projectId) || "").toLowerCase();
          const clientName = (getClientForTicket(tk)?.name || "").toLowerCase();
          const matches =
            tk.ticketNumber.toLowerCase().includes(q) ||
            tk.subject.toLowerCase().includes(q) ||
            (tk.reporterEmail || "").toLowerCase().includes(q) ||
            (tk.reporterName || "").toLowerCase().includes(q) ||
            projName.includes(q) ||
            clientName.includes(q);
          if (!matches) return false;
        }

        return true;
      })
      .sort((a, b) =>
        (b.updatedAt || b.createdAt || "").localeCompare(
          a.updatedAt || a.createdAt || "",
        ),
      );
  }, [
    tickets,
    archiveScope,
    statusFilter,
    kpiBucket,
    viewMode,
    priorityFilter,
    projectFilter,
    assigneeFilter,
    searchQuery,
    ticketStatuses,
    projects,
    leads,
  ]);

  // Kanban drag-and-drop state
  const [draggedTicketId, setDraggedTicketId] = useState<string | null>(null);
  const [dragOverStatusKey, setDragOverStatusKey] = useState<string | null>(
    null,
  );

  const handleMoveTicketStatus = (ticketId: string, nextStatus: string) => {
    if (!canEdit) return;
    const target = tickets.find((tk) => tk.id === ticketId);
    if (!target || target.status === nextStatus) return;
    const now = nowLocalStamp();
    setTickets((prev) =>
      prev.map((tk) => {
        if (tk.id !== ticketId) return tk;
        const becomingClosed =
          !isClosedTicketStatus(tk.status, ticketStatuses) &&
          isClosedTicketStatus(nextStatus, ticketStatuses);
        return {
          ...tk,
          status: nextStatus,
          resolvedAt: becomingClosed ? tk.resolvedAt || now : tk.resolvedAt,
          updatedAt: now,
        };
      }),
    );
    (window as any).showToast?.(
      `${target.ticketNumber} → ${ticketStatusLabel(nextStatus, userLanguage, ticketStatuses)}`,
    );
  };

  // Handlers
  const handleSelectTicket = (tkId: string | null) => {
    setSelectedTicketId(tkId);
    if (tkId) {
      window.location.hash = `tickets/${tkId}`;
    } else {
      window.location.hash = "tickets";
    }
  };

  const updateSelectedTicket = (patch: Partial<Ticket>) => {
    if (!selectedTicket || !canEdit) return;
    const now = nowLocalStamp();
    setTickets((prev) =>
      prev.map((tk) => {
        if (tk.id !== selectedTicket.id) return tk;
        const nextStatus = patch.status ?? tk.status;
        const becomingClosed =
          !isClosedTicketStatus(tk.status, ticketStatuses) &&
          isClosedTicketStatus(nextStatus, ticketStatuses);
        return {
          ...tk,
          ...patch,
          resolvedAt: becomingClosed ? tk.resolvedAt || now : tk.resolvedAt,
          updatedAt: now,
        };
      }),
    );
  };

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !newSubject.trim()) return;
    const now = nowLocalStamp();
    const { firstResponseDueAt, resolutionDueAt } = computeSlaDueDates(
      now,
      newPriority,
      ticketSettings,
    );

    // If a project is chosen and has a paired client, automatically attach that client
    let resolvedLeadId = newLeadId || null;
    if (newProjectId && !resolvedLeadId) {
      const proj = projects.find((p) => p.id === newProjectId);
      if (proj?.leadId) resolvedLeadId = proj.leadId;
      else if (proj?.clientId) resolvedLeadId = proj.clientId;
    }

    const ticketId = `tkt-${Date.now()}`;
    const firstImg = newTicketAttachments.find(isImageAttachment);
    const hasDescContent =
      !isRichTextEmpty(newDescription) || newTicketAttachments.length > 0;

    const newTicket: Ticket = {
      id: ticketId,
      ticketNumber: generateTicketNumber(tickets),
      subject: newSubject.trim(),
      description: newDescription.trim(),
      status: orderedStatuses[0]?.key || orderedStatuses[0]?.id || "open",
      priority: newPriority,
      type: newType,
      source: "manual",
      channel: "manual",
      projectId: newProjectId || null,
      leadId: resolvedLeadId,
      clientId: resolvedLeadId,
      contractId: newContractId || null,
      reporterName: newReporterName.trim() || currentUser?.name || "Client",
      reporterEmail: newReporterEmail.trim(),
      assignedUsers: newAssignee ? [newAssignee] : [],
      firstResponseDueAt,
      resolutionDueAt,
      screenshotPath: firstImg
        ? firstImg.path || firstImg.url || firstImg.dataUrl || null
        : null,
      attachments: newTicketAttachments,
      createdAt: now,
      updatedAt: now,
      archived: false,
      messages: hasDescContent
        ? [
            {
              id: `tmsg-${Date.now()}`,
              ticketId,
              authorType: "agent",
              authorName: currentUser?.name || "Support",
              authorEmail: currentUser?.email || "",
              body: newDescription.trim() || newSubject.trim(),
              isInternal: false,
              attachments: newTicketAttachments,
              createdAt: now,
            },
          ]
        : [],
      taskLinks: [],
      timeEntries: [],
    };

    setTickets((prev) => [newTicket, ...prev]);
    setShowCreateModal(false);
    setNewSubject("");
    setNewDescription("");
    setNewTicketAttachments([]);
    setNewReporterName("");
    setNewReporterEmail("");
    handleSelectTicket(newTicket.id);
    (window as any).showToast?.(
      t(
        "Support ticket created.",
        "Podporný tiket bol vytvorený.",
        "Támogatási jegy létrehozva.",
      ),
    );
  };

  const handleSendReply = async (nextStatusOverride?: string) => {
    if (
      !selectedTicket ||
      !canEdit ||
      (isRichTextEmpty(replyBody) && replyAttachments.length === 0)
    )
      return;
    setIsSendingReply(true);
    const now = nowLocalStamp();
    const isInternal = replyTab === "internal";

    const newMsg: TicketMessage = {
      id: `tmsg-${Date.now()}`,
      ticketId: selectedTicket.id,
      authorType: "agent",
      authorName: currentUser?.name || "Support Agent",
      authorEmail: currentUser?.email || "",
      body: replyBody.trim(),
      isInternal,
      attachments: replyAttachments,
      createdAt: now,
    };

    const nextStatus = nextStatusOverride || selectedTicket.status;
    const isFirstAgentPublicReply =
      !isInternal && !selectedTicket.firstRespondedAt;

    // Optional outbound email dispatch
    if (!isInternal && sendViaEmail && selectedTicket.reporterEmail) {
      try {
        await fetch("./api/tickets.php?action=send_email_reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: selectedTicket.reporterEmail,
            ticketNumber: selectedTicket.ticketNumber,
            subject: selectedTicket.subject,
            body: replyBody.trim(),
          }),
        });
      } catch (err) {
        console.error("Failed to send ticket email reply", err);
      }
    }

    setTickets((prev) =>
      prev.map((tk) => {
        if (tk.id !== selectedTicket.id) return tk;
        const becomingClosed =
          !isClosedTicketStatus(tk.status, ticketStatuses) &&
          isClosedTicketStatus(nextStatus, ticketStatuses);
        return {
          ...tk,
          status: nextStatus,
          firstRespondedAt: isFirstAgentPublicReply
            ? now
            : tk.firstRespondedAt,
          resolvedAt: becomingClosed ? tk.resolvedAt || now : tk.resolvedAt,
          updatedAt: now,
          messages: [...(tk.messages || []), newMsg],
        };
      }),
    );

    setReplyBody("");
    setReplyAttachments([]);
    setIsSendingReply(false);
    (window as any).showToast?.(
      isInternal
        ? t(
            "Internal note added.",
            "Interná poznámka pridaná.",
            "Belső jegyzet hozzáadva.",
          )
        : t("Reply posted.", "Odpoveď bola odoslaná.", "Válasz elküldve."),
    );
  };

  const handleCreateTaskFromTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !canEdit || !newTaskTitle.trim()) return;
    const now = nowLocalStamp();
    const taskId = `task-${Date.now()}`;
    const plainDesc = (selectedTicket.description || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const newTask: Task = {
      id: taskId,
      title: `[${selectedTicket.ticketNumber}] ${newTaskTitle.trim()}`,
      description: `${selectedTicket.subject}\n\n${plainDesc}`.trim(),
      status: taskStates[0] || "New",
      priority:
        selectedTicket.priority === "critical" ||
        selectedTicket.priority === "high"
          ? "high"
          : selectedTicket.priority === "low"
            ? "low"
            : "medium",
      deadline: todayLocalPlusDays(3),
      owner: newTaskAssignee || currentUser?.name || "",
      createdBy: currentUser?.name || "",
      assignedUsers: newTaskAssignee ? [newTaskAssignee] : [],
      relatedProjectId: selectedTicket.projectId || undefined,
      relatedLeadId:
        selectedTicket.leadId || selectedTicket.clientId || undefined,
    };

    setTasks((prev) => [newTask, ...prev]);

    const newLink = {
      id: `ttl-${Date.now()}`,
      ticketId: selectedTicket.id,
      taskId,
      syncMode: "auto_resolve" as const,
      createdAt: now,
    };

    updateSelectedTicket({
      status:
        selectedTicket.status === "new" || selectedTicket.status === "open"
          ? "waiting_dev"
          : selectedTicket.status,
      taskLinks: [...(selectedTicket.taskLinks || []), newLink],
    });

    setNewTaskTitle("");
    setShowTaskForm(false);
    (window as any).showToast?.(
      t(
        "CRM Task created & linked (auto-resolves ticket when Done).",
        "Úloha vytvorená a prepojená (po dokončení automaticky vyrieši tiket).",
        "CRM feladat létrehozva és összekapcsolva (befejezéskor automatikusan megoldja a jegyet).",
      ),
    );
  };

  const handleLogTime = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !canEdit) return;
    const mins = parseInt(logMinutes, 10);
    if (!mins || mins <= 0) return;
    const now = nowLocalStamp();
    const entry = {
      id: `tte-${Date.now()}`,
      ticketId: selectedTicket.id,
      userName: currentUser?.name || "Agent",
      minutes: mins,
      billable: logBillable,
      description:
        logDesc.trim() || t("Support work", "Podpora", "Támogatási munka"),
      loggedAt: now,
    };

    updateSelectedTicket({
      timeEntries: [...(selectedTicket.timeEntries || []), entry],
    });

    if (logBillable && selectedTicket.contractId) {
      const addHours = +(mins / 60).toFixed(2);
      setSupportContracts((prev) =>
        prev.map((c) =>
          c.id === selectedTicket.contractId
            ? {
                ...c,
                hoursUsedThisMonth: +(
                  (c.hoursUsedThisMonth || 0) + addHours
                ).toFixed(2),
              }
            : c,
        ),
      );
    }

    setLogDesc("");
    (window as any).showToast?.(
      t("Time entry logged.", "Čas bol zaznamenaný.", "Időbejegyzés rögzítve."),
    );
  };

  const handlePollImap = async () => {
    setIsPollingImap(true);
    try {
      const res = await fetch("./api/tickets.php?action=poll_imap", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        (window as any).showToast?.(
          t(
            `Email poll complete (${data.imported || 0} new, ${data.updated || 0} replies).`,
            `Kontrola e-mailov dokončená (${data.imported || 0} nových, ${data.updated || 0} odpovedí).`,
            `E-mail lekérdezés kész (${data.imported || 0} új, ${data.updated || 0} válasz).`,
          ),
        );
        if ((data.imported || 0) > 0 || (data.updated || 0) > 0) {
          onRefreshSync?.();
        }
      } else {
        (window as any).showToast?.(data.error || "IMAP poll failed", "error");
      }
    } catch (e: any) {
      (window as any).showToast?.(e?.message || "Network error", "error");
    } finally {
      setIsPollingImap(false);
    }
  };

  const handleCreateContract = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !contractName.trim()) return;
    const next: SupportContract = {
      id: `sc-${Date.now()}`,
      name: contractName.trim(),
      projectId: contractProjectId || null,
      leadId: contractLeadId || null,
      monthlyHoursIncluded: Number(contractHours) || 10,
      hoursUsedThisMonth: 0,
      overageRate: Number(contractRate) || 65,
      currency: "EUR",
      slaTier: contractTier,
      active: true,
    };
    setSupportContracts((prev) => [next, ...prev]);
    setContractName("");
    (window as any).showToast?.(
      t(
        "Support contract created.",
        "Servisná zmluva vytvorená.",
        "Támogatási szerződés létrehozva.",
      ),
    );
  };

  // Build pipeline strip segments for a ticket status
  const buildTicketPipelineSegments = (
    currentStatus: string,
  ): PipelineStripSegment[] => {
    const activeIdx = orderedStatuses.findIndex(
      (s) => (s.key || s.id) === currentStatus,
    );
    return orderedStatuses.map((s, idx) => {
      const stKey = s.key || s.id;
      const label = ticketStatusLabel(stKey, userLanguage, ticketStatuses);
      return {
        key: stKey,
        title: label,
        tooltip: label,
        filled: activeIdx >= 0 ? idx <= activeIdx : idx === 0,
        colorClass: "bg-indigo-600",
        color: s.color || "#6366f1",
      };
    });
  };

  /* ═══════════════════════════════════════════════════════════════════════════
     FULL-PAGE TICKET DETAIL VIEW (matches ProjectDetailsView & rest of views)
     Left column: 1. Ticket Card (top), 2. Project Card (with View all tickets),
                  3. Client Relationship Card (bottom)
     Right column: Ticket Timeline (Composer + Chronological Feed)
     ═══════════════════════════════════════════════════════════════════════════ */
  if (selectedTicket) {
    const sla = evaluateTicketSla(selectedTicket, ticketStatuses);
    const stColor = ticketStatusColor(selectedTicket.status, ticketStatuses);
    const pairedProject = selectedTicket.projectId
      ? projects.find((p) => p.id === selectedTicket.projectId) || null
      : null;
    const pairedProjectType = pairedProject
      ? projectTypes.find((pt) => pt.id === pairedProject.projectTypeId) || null
      : null;
    const pairedLead = getClientForTicket(selectedTicket);
    const cannedTemplates =
      ticketSettings.cannedResponses || ticketSettings.replyTemplates || [];
    const widgetMeta =
      selectedTicket.widgetMetadata || selectedTicket.metadata || null;

    const commitSubject = () => {
      if (subjectDraft.trim() && subjectDraft.trim() !== selectedTicket.subject) {
        updateSelectedTicket({ subject: subjectDraft.trim() });
      }
      setIsEditingSubject(false);
    };

    const commitDescription = () => {
      const firstImg = descriptionAttachmentsDraft.find(isImageAttachment);
      updateSelectedTicket({
        description: descriptionDraft,
        attachments: descriptionAttachmentsDraft,
        screenshotPath: firstImg
          ? firstImg.path || firstImg.url || firstImg.dataUrl || selectedTicket.screenshotPath
          : selectedTicket.screenshotPath,
      });
      setIsEditingDescription(false);
    };

    return (
      <div className="w-full flex flex-col h-auto ws-lg:h-[calc(100vh-11rem)] animate-fade-in text-left">
        {/* Top EntityHeader */}
        <EntityHeader
          className="shrink-0 select-none"
          onBack={() => handleSelectTicket(null)}
          backLabel={t("Back to list", "Späť na zoznam", "Vissza a listához")}
          title={
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="shrink-0 text-indigo-600">
                <TicketIcon className="h-7 w-7" />
              </span>
              <span className="font-mono text-ui font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-xl border border-indigo-200 shrink-0">
                {selectedTicket.ticketNumber}
              </span>
              {isEditingSubject ? (
                <input
                  value={subjectDraft}
                  onChange={(e) => setSubjectDraft(e.target.value)}
                  onBlur={commitSubject}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitSubject();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setIsEditingSubject(false);
                    }
                  }}
                  autoFocus
                  maxLength={220}
                  className="select-text min-w-0 flex-1 max-w-xl px-2.5 py-0.5 -my-1 rounded-xl border border-indigo-300 bg-white type-entity-title text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              ) : (
                <>
                  <span className="truncate">{selectedTicket.subject}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setSubjectDraft(selectedTicket.subject);
                        setIsEditingSubject(true);
                      }}
                      className="shrink-0 p-1.5 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-95 cursor-pointer"
                      title={t(
                        "Rename ticket subject",
                        "Premenovať predmet tiketu",
                        "Jegy tárgyának átnevezése",
                      )}
                    >
                      <Edit3 className="h-5 w-5" />
                    </button>
                  )}
                </>
              )}
            </span>
          }
          meta={
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="uppercase font-bold text-slate-600">
                {selectedTicket.source || selectedTicket.channel || "manual"}
              </span>
              <span>•</span>
              <span>
                {t("Reporter:", "Hlásateľ:", "Bejelentő:")}{" "}
                <strong className="text-slate-700">
                  {selectedTicket.reporterName || "Client"}
                </strong>
                {selectedTicket.reporterEmail
                  ? ` <${selectedTicket.reporterEmail}>`
                  : ""}
              </span>
              {sla.state === "met" && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-micro font-bold">
                    <CheckCircle2 className="w-3 h-3" />
                    {t("SLA Met", "SLA splnené", "SLA teljesítve")}
                  </span>
                </>
              )}
              {sla.state === "breached" && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-micro font-bold">
                    <AlertTriangle className="w-3 h-3" />
                    {t("SLA Breached", "SLA porušené", "SLA lejárt")} (
                    {formatDurationMinutes(Math.abs(sla.minutesRemaining || 0))}{" "}
                    overdue)
                  </span>
                </>
              )}
              {sla.state === "warning" && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-micro font-bold">
                    <Clock className="w-3 h-3" />
                    {t("SLA Due in", "SLA vyprší o", "SLA lejár")}{" "}
                    {formatDurationMinutes(sla.minutesRemaining || 0)}
                  </span>
                </>
              )}
            </span>
          }
          actions={
            <>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    const nextArch = !selectedTicket.archived;
                    updateSelectedTicket({
                      archived: nextArch,
                      isArchived: nextArch,
                    });
                    (window as any).showToast?.(
                      nextArch
                        ? t(
                            "Ticket archived.",
                            "Tiket bol archivovaný.",
                            "Jegy archiválva.",
                          )
                        : t(
                            "Ticket restored.",
                            "Tiket bol obnovený.",
                            "Jegy visszaállítva.",
                          ),
                    );
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-amber-600 font-heading font-bold text-ui hover:bg-amber-50 hover:text-amber-800 transition-all active:scale-95 cursor-pointer"
                  title={
                    selectedTicket.archived
                      ? t(
                          "Restore Ticket",
                          "Obnoviť tiket",
                          "Jegy visszaállítása",
                        )
                      : t("Archive Ticket", "Archivovať tiket", "Jegy archiválása")
                  }
                >
                  {selectedTicket.archived ? (
                    <ArchiveRestore className="h-4 w-4 shrink-0" />
                  ) : (
                    <Archive className="h-4 w-4 shrink-0" />
                  )}
                  <span className="hidden ws-sm:inline">
                    {selectedTicket.archived
                      ? t("Restore", "Obnoviť", "Visszaállítás")
                      : t("Archive", "Archivovať", "Archiválás")}
                  </span>
                </button>
              )}

              {canDelete && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        t(
                          "Delete this ticket permanently?",
                          "Natrvalo vymazať tento tiket?",
                          "Véglegesen törli ezt a jegyet?",
                        ),
                      )
                    ) {
                      setTickets((prev) =>
                        prev.filter((tk) => tk.id !== selectedTicket.id),
                      );
                      handleSelectTicket(null);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-rose-500 font-heading font-bold text-ui hover:bg-rose-50 hover:text-rose-700 transition-all active:scale-95 cursor-pointer"
                  title={t("Delete Ticket", "Vymazať tiket", "Jegy törlése")}
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  <span className="hidden ws-sm:inline">
                    {t("Delete", "Vymazať", "Törlés")}
                  </span>
                </button>
              )}

              {canEdit ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 type-overline text-emerald-600 whitespace-nowrap">
                  <CloudCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {t(
                      "All changes saved",
                      "Všetko uložené",
                      "Minden mentve",
                    )}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 type-overline text-amber-700 whitespace-nowrap">
                  <Lock className="h-3 w-3 shrink-0" />
                  <span>
                    {t(
                      "Read-only access",
                      "Iba na čítanie",
                      "Csak olvasható",
                    )}
                  </span>
                </span>
              )}
            </>
          }
        />

        {/* Workspace Body: 12-column grid matching ProjectDetailsView */}
        <div className="flex-1 ws-lg:overflow-hidden grid grid-cols-1 ws-lg:grid-cols-12 gap-6 pt-6 min-h-0">
          {/* LEFT COLUMN (4 cols):
              1. Ticket Card Details (top)
              2. Attached Project Card with "View all tickets" (middle)
              3. Client Relationship Card (bottom) */}
          <div className="ws-lg:col-span-4 flex flex-col h-auto ws-lg:h-full min-h-0 ws-lg:overflow-y-auto gap-4 ws-lg:pr-1 scrollbar-thin text-left">
            {/* 1. TICKET CARD DETAILS (TOP) */}
            <div className="shrink-0 bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
              <div className="flex items-center justify-between gap-2 pb-3">
                <h4 className="text-ui font-heading font-bold text-slate-900">
                  {t(
                    "Ticket Card Details",
                    "Detaily karty tiketu",
                    "Jegy részletei",
                  )}
                </h4>
                <span className="text-micro font-mono text-slate-400">
                  {String(selectedTicket.createdAt || "").slice(0, 16)}
                </span>
              </div>

              {/* Status Pipeline Strip */}
              <PipelineStrip
                segments={buildTicketPipelineSegments(selectedTicket.status)}
                className="-mx-5 mb-4"
              />

              <div className="space-y-4">
                {/* Status */}
                <div>
                  <label className="block type-overline text-slate-400 mb-1">
                    {t("Status", "Stav", "Állapot")}
                  </label>
                  <CustomSelect
                    value={selectedTicket.status}
                    disabled={!canEdit}
                    onChange={(v) => updateSelectedTicket({ status: v })}
                    className="!font-black"
                    style={{
                      backgroundColor: `${stColor}15`,
                      color: stColor,
                      borderColor: `${stColor}45`,
                    }}
                    icon={
                      <span
                        className="h-2 w-2 rounded-full shrink-0 inline-block"
                        style={{ backgroundColor: stColor }}
                      />
                    }
                    options={orderedStatuses.map((s) => {
                      const sKey = s.key || s.id;
                      return {
                        value: sKey,
                        label: ticketStatusLabel(
                          sKey,
                          userLanguage,
                          ticketStatuses,
                        ),
                      };
                    })}
                  />
                </div>

                {/* Priority & Type */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block type-overline text-slate-400 mb-1">
                      {t("Priority", "Priorita", "Prioritás")}
                    </label>
                    <CustomSelect
                      value={selectedTicket.priority}
                      disabled={!canEdit}
                      onChange={(v) =>
                        updateSelectedTicket({ priority: v as TicketPriority })
                      }
                      options={[
                        { value: "low", label: t("Low", "Nízka", "Alacsony") },
                        {
                          value: "normal",
                          label: t("Normal", "Normálna", "Normál"),
                        },
                        { value: "high", label: t("High", "Vysoká", "Magas") },
                        {
                          value: "critical",
                          label: t("Critical", "Kritická", "Kritikus"),
                        },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="block type-overline text-slate-400 mb-1">
                      {t("Ticket Type", "Typ tiketu", "Jegy típusa")}
                    </label>
                    <CustomSelect
                      value={selectedTicket.type || "bug"}
                      disabled={!canEdit}
                      onChange={(v) =>
                        updateSelectedTicket({ type: v as TicketType })
                      }
                      options={[
                        {
                          value: "bug",
                          label: t("Bug / Error", "Chyba / Bug", "Hiba / Bug"),
                        },
                        {
                          value: "question",
                          label: t("Question", "Otázka", "Kérdés"),
                        },
                        {
                          value: "feature_request",
                          label: t(
                            "Feature Request",
                            "Požiadavka",
                            "Fejlesztési kérés",
                          ),
                        },
                        {
                          value: "incident",
                          label: t("Incident", "Incident", "Incidens"),
                        },
                        {
                          value: "billing",
                          label: t("Billing", "Fakturácia", "Számlázás"),
                        },
                      ]}
                    />
                  </div>
                </div>

                {/* Assigned Agents */}
                <div>
                  <label className="block type-overline text-slate-400 mb-1">
                    {t("Assigned Agent", "Priradený riešiteľ", "Felelős")}
                  </label>
                  <CustomSelect
                    value={selectedTicket.assignedUsers?.[0] || ""}
                    disabled={!canEdit}
                    onChange={(uName) =>
                      updateSelectedTicket({
                        assignedUser: uName || null,
                        assignedUsers: uName ? [uName] : [],
                      })
                    }
                    options={[
                      {
                        value: "",
                        label: t("Unassigned", "Nepriradené", "Nincs felelős"),
                      },
                      ...users.map((u) => ({ value: u.name, label: u.name })),
                    ]}
                  />
                </div>

                {/* Reporter Name & Email */}
                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block type-overline text-slate-400 mb-1">
                      {t("Reporter Name", "Meno hlásateľa", "Bejelentő neve")}
                    </label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={selectedTicket.reporterName || ""}
                      onChange={(e) =>
                        updateSelectedTicket({ reporterName: e.target.value })
                      }
                      placeholder={t("Client name", "Meno klienta", "Ügyfél neve")}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-caption font-semibold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block type-overline text-slate-400 mb-1">
                      {t("Reporter Email", "E-mail hlásateľa", "Bejelentő e-mail")}
                    </label>
                    <input
                      type="email"
                      disabled={!canEdit}
                      value={selectedTicket.reporterEmail || ""}
                      onChange={(e) =>
                        updateSelectedTicket({ reporterEmail: e.target.value })
                      }
                      placeholder="client@domain.com"
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-caption font-semibold text-slate-800"
                    />
                  </div>
                </div>

                {/* Ticket Description & Attachments (HTML Formatted + Editable) */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="type-overline text-slate-400">
                      {t(
                        "Description & Files",
                        "Popis a súbory",
                        "Leírás és fájlok",
                      )}
                    </span>
                    {canEdit && !isEditingDescription && (
                      <button
                        type="button"
                        onClick={() => {
                          setDescriptionDraft(selectedTicket.description || "");
                          setDescriptionAttachmentsDraft(
                            selectedTicket.attachments || [],
                          );
                          setIsEditingDescription(true);
                        }}
                        className="text-micro font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>
                          {t(
                            "Edit Description / Files",
                            "Upraviť popis / súbory",
                            "Leírás / fájlok szerkesztése",
                          )}
                        </span>
                      </button>
                    )}
                  </div>

                  {isEditingDescription ? (
                    <div className="space-y-2">
                      <TicketRichHtmlEditor
                        value={descriptionDraft}
                        onChange={setDescriptionDraft}
                        attachments={descriptionAttachmentsDraft}
                        onAttachmentsChange={setDescriptionAttachmentsDraft}
                        userLanguage={userLanguage}
                        placeholder={t(
                          "Format description with HTML, paste images, or attach files...",
                          "Naformátujte popis, prilepte obrázky alebo priložte súbory...",
                          "Formázza a leírást, illesszen be képeket vagy csatoljon fájlokat...",
                        )}
                        minRows={3}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setIsEditingDescription(false)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 text-micro font-bold text-slate-600 cursor-pointer"
                        >
                          {t("Cancel", "Zrušiť", "Mégse")}
                        </button>
                        <button
                          type="button"
                          onClick={commitDescription}
                          className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-micro font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{t("Save", "Uložiť", "Mentés")}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-2">
                      {selectedTicket.description ? (
                        <TicketHtmlContent
                          content={selectedTicket.description}
                          className="text-slate-700"
                        />
                      ) : (
                        <p className="text-micro italic text-slate-400">
                          {t(
                            "No description provided.",
                            "Bez popisu.",
                            "Nincs megadva leírás.",
                          )}
                        </p>
                      )}
                      <TicketAttachmentsList
                        attachments={selectedTicket.attachments}
                      />
                    </div>
                  )}
                </div>

                {/* Linked CRM Tasks (Dev Escalation) */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="type-overline text-slate-500 flex items-center gap-1">
                      <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                      {t(
                        "Linked CRM Tasks",
                        "Prepojené úlohy",
                        "Kapcsolt feladatok",
                      )}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setNewTaskTitle(selectedTicket.subject);
                          setShowTaskForm((v) => !v);
                        }}
                        className="text-micro font-bold text-indigo-600 hover:underline cursor-pointer"
                      >
                        {t(
                          "+ Create Task",
                          "+ Vytvoriť úlohu",
                          "+ Feladat létrehozása",
                        )}
                      </button>
                    )}
                  </div>

                  {showTaskForm && (
                    <form
                      onSubmit={handleCreateTaskFromTicket}
                      className="p-2.5 rounded-xl bg-slate-50 border border-indigo-200 space-y-2"
                    >
                      <input
                        type="text"
                        required
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder={t(
                          "Task title...",
                          "Názov úlohy...",
                          "Feladat címe...",
                        )}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-caption font-semibold"
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={newTaskAssignee}
                          onChange={(e) => setNewTaskAssignee(e.target.value)}
                          className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-micro font-semibold"
                        >
                          {users.map((u) => (
                            <option key={u.id} value={u.name}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-micro font-bold cursor-pointer"
                        >
                          {t("Create", "Vytvoriť", "Létrehozás")}
                        </button>
                      </div>
                    </form>
                  )}

                  {(selectedTicket.taskLinks || []).length === 0 ? (
                    <div className="text-micro text-slate-400">
                      {t(
                        "No linked tasks yet.",
                        "Zatiaľ žiadne prepojené úlohy.",
                        "Még nincs kapcsolt feladat.",
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {(selectedTicket.taskLinks || []).map((link) => {
                        const tsk = tasks.find(
                          (tItem) => tItem.id === link.taskId,
                        );
                        const done = tsk
                          ? isDoneTaskState(tsk.status, taskStates)
                          : false;
                        return (
                          <div
                            key={link.id}
                            onClick={() => {
                              window.location.hash = "tasks";
                            }}
                            className="p-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-micro cursor-pointer hover:border-indigo-300"
                          >
                            <span
                              className={`font-bold truncate ${
                                done
                                  ? "line-through text-slate-400"
                                  : "text-slate-700"
                              }`}
                            >
                              {tsk ? tsk.title : link.taskId}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold shrink-0 ${
                                done
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-indigo-50 text-indigo-700"
                              }`}
                            >
                              {tsk ? tsk.status : "Linked"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Time Tracking */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="type-overline text-slate-500 flex items-center gap-1">
                      <Timer className="w-3.5 h-3.5 text-emerald-600" />
                      {t("Time Logged", "Zaznamenaný čas", "Rögzített idő")}
                    </span>
                    <span className="text-micro font-bold text-slate-700">
                      {formatDurationMinutes(
                        (selectedTicket.timeEntries || []).reduce(
                          (acc, e) => acc + e.minutes,
                          0,
                        ),
                      )}
                    </span>
                  </div>

                  {canEdit && (
                    <form
                      onSubmit={handleLogTime}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="number"
                        min={1}
                        value={logMinutes}
                        onChange={(e) => setLogMinutes(e.target.value)}
                        className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-micro font-bold"
                        placeholder="min"
                      />
                      <input
                        type="text"
                        value={logDesc}
                        onChange={(e) => setLogDesc(e.target.value)}
                        placeholder={t(
                          "Work note...",
                          "Poznámka...",
                          "Megjegyzés...",
                        )}
                        className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-micro"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-micro font-bold cursor-pointer"
                      >
                        +
                      </button>
                    </form>
                  )}

                  {(selectedTicket.timeEntries || []).length > 0 && (
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {(selectedTicket.timeEntries || []).map((te) => (
                        <div
                          key={te.id}
                          className="flex items-center justify-between text-micro text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100"
                        >
                          <span className="truncate">
                            <strong>{formatDurationMinutes(te.minutes)}</strong>{" "}
                            • {te.userName}{" "}
                            {te.description || te.note
                              ? `— ${te.description || te.note}`
                              : ""}
                          </span>
                          <span className="text-slate-400 shrink-0">
                            {String(te.loggedAt || te.createdAt || "").slice(
                              5,
                              10,
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 2. ATTACHED PROJECT CARD (MIDDLE) — with "View all tickets" */}
            {(() => {
              const pairWithProject = (projId: string) => {
                const proj = projects.find((p) => p.id === projId);
                const autoLeadId =
                  proj?.leadId ||
                  proj?.clientId ||
                  selectedTicket.leadId ||
                  null;
                updateSelectedTicket({
                  projectId: projId || null,
                  leadId: autoLeadId,
                  clientId: autoLeadId,
                });
                setPickingProject(false);
              };

              if (!pairedProject || pickingProject) {
                if (!canEdit || !pickingProject) {
                  return (
                    <div className="shrink-0 bg-white border border-dashed border-slate-300 rounded-3xl p-5 shadow-sm text-center">
                      <Briefcase className="h-5 w-5 text-slate-300 mx-auto mb-2" />
                      <p className="text-caption font-bold text-slate-500 leading-snug">
                        {t(
                          "This ticket is not linked to any project.",
                          "Tento tiket nie je priradený k žiadnemu projektu.",
                          "Ez a jegy nincs projekthez kapcsolva.",
                        )}
                      </p>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setPickingProject(true)}
                          className="mt-2.5 px-3 py-1.5 rounded-xl type-overline text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                        >
                          {t(
                            "Link Project",
                            "Priradiť projekt",
                            "Projekt csatolása",
                          )}
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="shrink-0 bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-2">
                    <label className="block type-overline text-slate-400">
                      {t(
                        "Attached Project",
                        "Priradený projekt",
                        "Kapcsolt projekt",
                      )}
                    </label>
                    <CustomSelect
                      value={selectedTicket.projectId || ""}
                      onChange={pairWithProject}
                      options={[
                        {
                          value: "",
                          label: t(
                            "— No Project —",
                            "— Žiadny projekt —",
                            "— Nincs projekt —",
                          ),
                        },
                        ...projects.map((p) => ({
                          value: p.id,
                          label: getProjectName(p.id) || p.id,
                        })),
                      ]}
                    />
                    {pairedProject && (
                      <button
                        type="button"
                        onClick={() => setPickingProject(false)}
                        className="type-overline text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                      >
                        {t(
                          "Keep current project",
                          "Ponechať súčasný projekt",
                          "Jelenlegi projekt megtartása",
                        )}
                      </button>
                    )}
                  </div>
                );
              }

              const projDisplayName =
                getProjectName(pairedProject.id) || pairedProject.id;
              const allProjectTickets = tickets.filter(
                (tk) =>
                  tk.projectId === pairedProject.id &&
                  !tk.archived &&
                  !tk.isArchived,
              );
              const openProjectTickets = allProjectTickets.filter(
                (tk) => !isClosedTicketStatus(tk.status, ticketStatuses),
              );

              return (
                <div className="shrink-0 rounded-3xl border-2 border-indigo-300 bg-indigo-50/60 shadow-sm p-4 space-y-3 text-indigo-950">
                  <div className="border-b-2 border-indigo-200/60 pb-2 flex items-center justify-between gap-2 flex-wrap">
                    <span className="type-overline text-indigo-700 flex items-center gap-1.5 min-w-0">
                      <Briefcase className="h-4 w-4 text-indigo-600 stroke-[2.5] shrink-0" />
                      <span>
                        {t(
                          "Project Card",
                          "Karta projektu",
                          "Projekt kártya",
                        )}
                      </span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full type-overline bg-indigo-100 text-indigo-800 border border-indigo-200 shrink-0">
                      {pairedProject.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-xl text-white flex items-center justify-center font-heading font-bold text-body shadow shrink-0"
                      style={{
                        backgroundColor:
                          pairedProjectType?.color || "#4f46e5",
                      }}
                    >
                      <Briefcase className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-body font-bold text-slate-800 line-clamp-1">
                        {projDisplayName}
                      </h4>
                      <span className="type-overline text-indigo-700">
                        {pairedProjectType?.name ||
                          t("Project", "Projekt", "Projekt")}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-caption bg-white/80 p-3 rounded-xl border border-indigo-200/60">
                    <div>
                      <span className="type-overline text-indigo-700/60 block">
                        {t(
                          "Open Tickets",
                          "Otvorené tikety",
                          "Nyitott jegyek",
                        )}
                      </span>
                      <span className="font-extrabold text-slate-800">
                        {openProjectTickets.length} / {allProjectTickets.length}
                      </span>
                    </div>
                    <div>
                      <span className="type-overline text-indigo-700/60 block">
                        {t(
                          "Project Owner",
                          "Zodpovedný",
                          "Projekt felelős",
                        )}
                      </span>
                      <span className="font-extrabold text-slate-800 truncate block">
                        {(pairedProject.managers || []).join(", ") || "—"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setPickingProject(true)}
                          className="px-2.5 py-1.5 rounded-lg type-overline text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Repeat className="h-3 w-3" />
                          {t("Change", "Zmeniť", "Módosítás")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            updateSelectedTicket({ projectId: null });
                            setPickingProject(false);
                          }}
                          className="px-2.5 py-1.5 rounded-lg type-overline text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Unlink className="h-3 w-3" />
                          {t("Unpair", "Odpojiť", "Leválasztás")}
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 ml-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setProjectFilter(pairedProject.id);
                          setStatusFilter("all");
                          setKpiBucket("all");
                          handleSelectTicket(null);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-100 text-indigo-700 type-overline border border-indigo-200 shadow-2xs transition-all cursor-pointer flex items-center gap-1"
                      >
                        <TicketIcon className="h-3.5 w-3.5" />
                        <span>
                          {t(
                            "View all tickets",
                            "Zobraziť všetky tikety",
                            "Összes jegy megtekintése",
                          )}{" "}
                          ({allProjectTickets.length})
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          window.location.hash = `projects/${pairedProject.id}?tab=tickets`;
                        }}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white type-overline shadow transition-all active:scale-95 flex items-center gap-1 border border-indigo-700 cursor-pointer"
                      >
                        <span>
                          {t("Open Project", "Otvoriť projekt", "Projekt")}
                        </span>
                        <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 3. CLIENT RELATIONSHIP CARD (BOTTOM) — matching ProjectDetailsView */}
            {(() => {
              const pairWithClient = (id: string) => {
                updateSelectedTicket({
                  leadId: id || null,
                  clientId: id || null,
                });
                setPickingClient(false);
              };

              if (!pairedLead || pickingClient) {
                if (!canEdit || !pickingClient) {
                  return (
                    <div className="shrink-0 bg-white border border-dashed border-slate-300 rounded-3xl p-5 shadow-sm text-center">
                      <Unlink className="h-5 w-5 text-slate-300 mx-auto mb-2" />
                      <p className="text-caption font-bold text-slate-500 leading-snug">
                        {t(
                          "This ticket is not paired with any lead or client.",
                          "Tento tiket nie je spárovaný so žiadnym leadom ani klientom.",
                          "Ez a jegy nincs leaddel vagy ügyféllel párosítva.",
                        )}
                      </p>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setPickingClient(true)}
                          className="mt-2.5 px-3 py-1.5 rounded-xl type-overline text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                        >
                          {t("Pair now", "Spárovať", "Párosítás")}
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="shrink-0 bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
                    <label className="block type-overline text-slate-400 mb-1">
                      {t(
                        "Paired Lead / Client",
                        "Spárovaný lead / klient",
                        "Párosított lead / ügyfél",
                      )}
                    </label>
                    <ClientSelect
                      leads={leads}
                      value={selectedTicket.leadId || pairedLead?.id || ""}
                      onChange={pairWithClient}
                      noneLabel={t(
                        "No associated client",
                        "Žiadny klient",
                        "Nincs ügyfél",
                      )}
                      placeholder={t(
                        "Select Client...",
                        "Vybrať klienta...",
                        "Ügyfél választása...",
                      )}
                    />
                    {pairedLead && (
                      <button
                        type="button"
                        onClick={() => setPickingClient(false)}
                        className="mt-1.5 type-overline text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                      >
                        {t(
                          "Keep current pairing",
                          "Ponechať súčasné spárovanie",
                          "Jelenlegi párosítás megtartása",
                        )}
                      </button>
                    )}
                  </div>
                );
              }

              const initials =
                pairedLead.name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase() || "")
                  .join("") || "?";
              const clientTypeLabel =
                pairedLead.clientType === "business"
                  ? `🏢 ${t("Company / Business", "Firma / Podnikanie", "Cég / Vállalkozás")}`
                  : pairedLead.clientType === "partner"
                    ? `🤝 ${t("Dealer Partner", "Obchodný partner", "Kereskedő partner")}`
                    : `👤 ${t("Private Person", "Súkromná osoba", "Magánszemély")}`;
              const addr = pairedLead.address;
              const city = addr?.city || pairedLead.city || "";
              const addressText =
                [addr?.street, city].filter(Boolean).join(", ") +
                (addr?.postalCode ? ` (${addr.postalCode})` : "");
              const noneAdded = (
                <span className="text-slate-300 italic">
                  {getTranslation(userLanguage, "profile.none_added")}
                </span>
              );

              return (
                <div className="shrink-0 rounded-3xl border-2 border-emerald-400 bg-emerald-50/70 shadow-md p-4 space-y-3 text-emerald-950">
                  <div className="border-b-2 border-emerald-200/50 pb-2 flex items-center justify-between gap-2 flex-wrap">
                    <span className="type-overline text-emerald-700 flex items-center gap-1.5 min-w-0">
                      <Briefcase className="h-4 w-4 text-emerald-600 stroke-[2.5] shrink-0" />
                      <span>
                        {getTranslation(
                          userLanguage,
                          "common.client_relationship_card",
                        )}
                      </span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full type-overline bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                      {getTranslation(userLanguage, "common.synced_profile")}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-2 border-emerald-700 flex items-center justify-center font-heading font-bold text-body shadow shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-body font-bold text-slate-800 line-clamp-1">
                        {pairedLead.name}
                      </h4>
                      <span className="type-overline text-emerald-700">
                        {clientTypeLabel}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-caption bg-white/70 p-3 rounded-xl border border-emerald-200/50">
                    <div className="space-y-0.5 min-w-0">
                      <span className="type-overline text-emerald-700/60 block">
                        {getTranslation(userLanguage, "profile.phone_number")}
                      </span>
                      <span className="font-extrabold text-slate-700 block truncate">
                        {pairedLead.phone ? (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-emerald-600 shrink-0" />
                            {pairedLead.phone}
                          </span>
                        ) : (
                          noneAdded
                        )}
                      </span>
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <span className="type-overline text-emerald-700/60 block">
                        {getTranslation(userLanguage, "profile.email_address")}
                      </span>
                      <span className="font-extrabold text-slate-700 block truncate">
                        {pairedLead.email ? (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3 text-emerald-600 shrink-0" />
                            <span className="truncate">{pairedLead.email}</span>
                          </span>
                        ) : (
                          noneAdded
                        )}
                      </span>
                    </div>
                    <div className="space-y-0.5 col-span-2 border-t border-emerald-200/50 pt-2 mt-1">
                      <span className="type-overline text-emerald-700/60 block">
                        {getTranslation(
                          userLanguage,
                          "profile.location_address",
                        )}
                      </span>
                      <span className="font-extrabold text-slate-700 block">
                        {addressText ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span className="line-clamp-1">{addressText}</span>
                          </span>
                        ) : (
                          noneAdded
                        )}
                      </span>
                    </div>
                    {pairedLead.website && (
                      <div className="space-y-0.5 col-span-2 border-t border-emerald-200/50 pt-2 mt-1">
                        <span className="type-overline text-emerald-700/60 block">
                          {getTranslation(userLanguage, "profile.website_link")}
                        </span>
                        <a
                          href={`https://${pairedLead.website.replace(/^https?:\/\//, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-extrabold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Globe className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
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
                          className="px-2.5 py-1.5 rounded-lg type-overline text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Repeat className="h-3 w-3" />
                          {t("Change", "Zmeniť", "Módosítás")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            updateSelectedTicket({
                              leadId: null,
                              clientId: null,
                            });
                            setPickingClient(false);
                          }}
                          className="px-2.5 py-1.5 rounded-lg type-overline text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Unlink className="h-3 w-3" />
                          {t("Unpair", "Odpojiť", "Leválasztás")}
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        window.location.hash = `client-${encodeURIComponent(pairedLead.name)}`;
                      }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white type-overline shadow transition-all active:scale-95 flex items-center justify-center gap-1.5 border border-emerald-700 cursor-pointer ml-auto"
                    >
                      {getTranslation(userLanguage, "common.view_full_profile")}
                      <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* RIGHT COLUMN (8 cols): Ticket Timeline */}
          <div className="ws-lg:col-span-8 flex flex-col h-auto ws-lg:h-full ws-lg:overflow-hidden bg-white border border-slate-200 rounded-3xl p-4 ws-sm:p-5 shadow-sm text-left">
            {/* Timeline Header Bar */}
            <div className="flex items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Clock className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="font-heading font-bold text-ui text-slate-900">
                    {t(
                      "Ticket Timeline & Conversation",
                      "Časová os a komunikácia tiketu",
                      "Jegy idővonal és kommunikáció",
                    )}
                  </h4>
                  <p className="text-micro text-slate-400">
                    {t(
                      "Chronological thread of client messages, agent replies, internal notes, and diagnostics",
                      "Chronologické vlákno správ klienta, odpovedí agentov, interných poznámok a diagnostiky",
                      "Ügyfélüzenetek, válaszok, belső jegyzetek és diagnosztika időrendi folyamata",
                    )}
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-micro font-bold">
                {(selectedTicket.messages || []).length}{" "}
                {t("entries", "záznamov", "bejegyzés")}
              </span>
            </div>

            <div className="flex-1 ws-lg:overflow-hidden flex flex-col ws-lg:flex-row gap-6 min-h-0">
              {/* Left of Timeline: Reply / Internal Note Composer */}
              {canEdit && (
                <div className="ws-lg:w-5/12 flex flex-col shrink-0 bg-slate-50 p-4 border border-slate-200 rounded-2xl h-fit space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-white border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setReplyTab("public")}
                        className={`px-3 py-1 rounded-lg text-micro font-bold cursor-pointer ${
                          replyTab === "public"
                            ? "bg-indigo-600 text-white shadow-2xs"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {t(
                          "Public Reply",
                          "Verejná odpoveď",
                          "Nyilvános válasz",
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setReplyTab("internal")}
                        className={`px-3 py-1 rounded-lg text-micro font-bold flex items-center gap-1 cursor-pointer ${
                          replyTab === "internal"
                            ? "bg-amber-500 text-white shadow-2xs"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        <Lock className="w-3 h-3" />
                        <span>
                          {t(
                            "Internal Note",
                            "Interná poznámka",
                            "Belső jegyzet",
                          )}
                        </span>
                      </button>
                    </div>

                    {cannedTemplates.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          const tpl = cannedTemplates.find(
                            (c) => c.id === e.target.value,
                          );
                          if (tpl) {
                            setReplyBody((prev) =>
                              prev ? `${prev}<br/><br/>${tpl.body}` : tpl.body,
                            );
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-micro font-bold text-slate-600"
                      >
                        <option value="">
                          {t(
                            "+ Template...",
                            "+ Šablóna...",
                            "+ Sablon...",
                          )}
                        </option>
                        {cannedTemplates.map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <TicketRichHtmlEditor
                    value={replyBody}
                    onChange={setReplyBody}
                    attachments={replyAttachments}
                    onAttachmentsChange={setReplyAttachments}
                    userLanguage={userLanguage}
                    tone={replyTab === "internal" ? "internal" : "default"}
                    minRows={4}
                    placeholder={
                      replyTab === "internal"
                        ? t(
                            "Write an internal note visible only to team members...",
                            "Napíšte internú poznámku viditeľnú iba pre tím...",
                            "Írjon csak a csapat számára látható belső jegyzetet...",
                          )
                        : t(
                            "Write a formatted reply to the client (paste images or attach files)...",
                            "Napíšte formátovanú odpoveď klientovi (môžete vložiť obrázky a súbory)...",
                            "Írjon formázott választ az ügyfélnek (képek és fájlok csatolhatók)...",
                          )
                    }
                  />

                  {replyTab === "public" && selectedTicket.reporterEmail && (
                    <label className="inline-flex items-center gap-1.5 text-micro font-semibold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sendViaEmail}
                        onChange={(e) => setSendViaEmail(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {t(
                          "Send via email to reporter",
                          "Odoslať aj e-mailom hlásateľovi",
                          "Küldés e-mailben a bejelentőnek",
                        )}
                      </span>
                    </label>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    {replyTab === "public" && (
                      <button
                        type="button"
                        disabled={
                          isSendingReply ||
                          (isRichTextEmpty(replyBody) &&
                            replyAttachments.length === 0)
                        }
                        onClick={() => handleSendReply("resolved")}
                        className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-micro font-bold cursor-pointer disabled:opacity-40"
                      >
                        {t(
                          "Send & Resolve",
                          "Odoslať a vyriešiť",
                          "Küldés és megoldás",
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={
                        isSendingReply ||
                        (isRichTextEmpty(replyBody) &&
                          replyAttachments.length === 0)
                      }
                      onClick={() => handleSendReply()}
                      className={`px-4 py-2 rounded-xl text-white text-caption font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 ${
                        replyTab === "internal"
                          ? "bg-amber-600 hover:bg-amber-700"
                          : "bg-indigo-600 hover:bg-indigo-700"
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {replyTab === "internal"
                          ? t(
                              "Save Note",
                              "Uložiť poznámku",
                              "Jegyzet mentése",
                            )
                          : t(
                              "Send Reply",
                              "Odoslať odpoveď",
                              "Válasz küldése",
                            )}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Right of Timeline: Chronological Feed */}
              <div className="flex-1 ws-lg:overflow-y-auto ws-lg:pr-2 space-y-4 scrollbar-thin">
                {/* Widget Diagnostics & Screenshot Card */}
                {(widgetMeta || selectedTicket.screenshotPath) && (
                  <div className="p-3.5 rounded-2xl bg-slate-900 text-slate-100 space-y-2.5 text-micro">
                    <div className="flex items-center justify-between">
                      <span className="font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5" />
                        {t(
                          "Captured Widget Diagnostics",
                          "Diagnostika zachytená widgetom",
                          "Widget által rögzített diagnosztika",
                        )}
                      </span>
                      {widgetMeta?.viewport && (
                        <span className="font-mono text-slate-400">
                          {widgetMeta.viewport}
                        </span>
                      )}
                    </div>
                    {widgetMeta?.url && (
                      <div className="font-mono text-slate-300 truncate">
                        URL:{" "}
                        <a
                          href={widgetMeta.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-300 underline"
                        >
                          {widgetMeta.url}
                        </a>
                      </div>
                    )}
                    {widgetMeta?.consoleErrors &&
                      widgetMeta.consoleErrors.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-rose-400 font-bold">
                            {t(
                              "Console / Runtime Errors:",
                              "Chyby v konzole:",
                              "Konzol / futási hibák:",
                            )}{" "}
                            ({widgetMeta.consoleErrors.length})
                          </span>
                          <pre className="p-2 rounded-lg bg-black/50 text-rose-200 font-mono text-micro overflow-x-auto max-h-32">
                            {widgetMeta.consoleErrors.join("\n")}
                          </pre>
                        </div>
                      )}
                    {selectedTicket.screenshotPath && (
                      <div className="pt-1">
                        <a
                          href={selectedTicket.screenshotPath}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-indigo-300 hover:text-indigo-200 font-bold"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>
                            {t(
                              "Open Attached Screenshot",
                              "Otvoriť priložený screenshot",
                              "Csatolt képernyőkép megnyitása",
                            )}
                          </span>
                        </a>
                        <img
                          src={selectedTicket.screenshotPath}
                          alt="Ticket screenshot"
                          className="mt-1.5 rounded-xl border border-slate-700 max-h-44 object-contain bg-black/40"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Timeline Thread */}
                <div className="relative border-l-2 border-slate-100 pl-5 space-y-4">
                  {(selectedTicket.messages || []).length === 0 && (
                    <div className="relative">
                      <span className="absolute -left-7.5 top-1 h-5 w-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-2xs">
                        <TicketIcon className="w-3 h-3" />
                      </span>
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between text-micro">
                          <span className="font-bold text-slate-800">
                            {selectedTicket.reporterName || "Client"}
                          </span>
                          <span className="text-slate-400">
                            {formatTimestampLocalized(
                              selectedTicket.createdAt,
                              userLanguage,
                            )}
                          </span>
                        </div>
                        {selectedTicket.description ? (
                          <TicketHtmlContent
                            content={selectedTicket.description}
                            className="text-slate-700"
                          />
                        ) : (
                          <p className="text-caption text-slate-400 italic">
                            {t(
                              "Ticket created without message body.",
                              "Tiket vytvorený bez správy.",
                              "Jegy létrehozva üzenettörzs nélkül.",
                            )}
                          </p>
                        )}
                        <TicketAttachmentsList
                          attachments={selectedTicket.attachments}
                        />
                      </div>
                    </div>
                  )}

                  {(selectedTicket.messages || []).map((msg) => {
                    const isInternal = msg.isInternal;
                    const isClient = msg.authorType === "client";
                    const dotClass = isInternal
                      ? "bg-amber-500 text-white"
                      : isClient
                        ? "bg-emerald-600 text-white"
                        : "bg-indigo-600 text-white";

                    return (
                      <div key={msg.id} className="relative">
                        <span
                          className={`absolute -left-7.5 top-1.5 h-5 w-5 rounded-full flex items-center justify-center shadow-2xs ${dotClass}`}
                        >
                          {isInternal ? (
                            <Lock className="w-2.5 h-2.5" />
                          ) : isClient ? (
                            <User className="w-2.5 h-2.5" />
                          ) : (
                            <MessageSquare className="w-2.5 h-2.5" />
                          )}
                        </span>

                        <div
                          className={`p-3.5 rounded-2xl border space-y-2 ${
                            isInternal
                              ? "bg-amber-50/90 border-amber-300 text-amber-950"
                              : isClient
                                ? "bg-slate-50 border-slate-200 text-slate-800"
                                : "bg-indigo-50/40 border-indigo-200 text-slate-800"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-micro border-b border-slate-200/50 pb-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap font-bold">
                              <span>
                                {msg.authorName ||
                                  (isClient ? "Client" : "Support Agent")}
                              </span>
                              {isInternal ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 type-overline">
                                  <Lock className="w-2.5 h-2.5" />
                                  {t(
                                    "Internal Note",
                                    "Interná poznámka",
                                    "Belső jegyzet",
                                  )}
                                </span>
                              ) : isClient ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 type-overline">
                                  {t("Client", "Klient", "Ügyfél")}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 type-overline">
                                  {t("Support", "Podpora", "Támogatás")}
                                </span>
                              )}
                            </div>
                            <span className="text-slate-400 font-semibold">
                              {formatTimestampLocalized(
                                msg.createdAt,
                                userLanguage,
                              )}
                            </span>
                          </div>

                          <TicketHtmlContent content={msg.body} />
                          <TicketAttachmentsList
                            attachments={msg.attachments}
                          />
                        </div>
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
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     TICKETS LIST / KANBAN BOARD VIEW
     ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-5 text-left">
      <PageHeader
        icon={<TicketIcon className="h-6 w-6 text-indigo-600" />}
        title={t(
          "Support Tickets & SLA",
          "Podporné tikety a SLA",
          "Támogatási jegyek és SLA",
        )}
        subtitle={t(
          "Project-linked issue tracker, floating HTML widget reports, inbound support email & SLA timers",
          "Sledovanie požiadaviek k projektom, hlásenia z HTML widgetu, podpora cez e-mail a SLA",
          "Projektekhez kapcsolt hibajegyek, lebegő HTML widget bejelentések, e-mail támogatás és SLA",
        )}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-heading font-bold text-ui shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t("New Ticket", "Nový tiket", "Új jegy")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handlePollImap}
              disabled={isPollingImap}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-heading font-bold text-ui transition-all cursor-pointer disabled:opacity-50"
              title={t(
                "Poll Support IMAP Mailbox Now",
                "Skontrolovať e-mailovú schránku podpory",
                "Támogatási e-mail fiók lekérdezése",
              )}
            >
              <RefreshCw
                className={`w-4 h-4 text-indigo-600 ${
                  isPollingImap ? "animate-spin" : ""
                }`}
              />
              <span className="hidden ws-sm:inline">
                {t("Poll Email", "Načítať e-maily", "E-mail lekérdezés")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowContractsModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-heading font-bold text-ui transition-all cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="hidden ws-sm:inline">
                {t("Retainers", "Paušály", "Átalányok")} (
                {supportContracts.length})
              </span>
            </button>
            {settingsAccess.view && (
              <button
                type="button"
                onClick={() => {
                  window.location.hash = "settings/tickets";
                }}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-heading font-bold text-ui transition-all cursor-pointer"
                title={t(
                  "Ticket Settings",
                  "Nastavenia tiketov",
                  "Jegy beállítások",
                )}
              >
                <Settings className="w-4 h-4" />
                <span className="hidden ws-md:inline">
                  {t("Settings", "Nastavenia", "Beállítások")}
                </span>
              </button>
            )}
          </div>
        }
      />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 ws-sm:grid-cols-5 gap-3">
        {(
          [
            {
              key: "all_open",
              label: t("All Open", "Všetky otvorené", "Összes nyitott"),
              count: kpiCounts.allOpen,
              tone: "border-indigo-200 bg-indigo-50/60 text-indigo-700",
            },
            {
              key: "unassigned",
              label: t("Unassigned", "Nepriradené", "Nincs felelős"),
              count: kpiCounts.unassigned,
              tone: "border-amber-200 bg-amber-50/60 text-amber-700",
            },
            {
              key: "waiting_client",
              label: t(
                "Waiting on Client",
                "Čaká na klienta",
                "Ügyfélre vár",
              ),
              count: kpiCounts.waitingClient,
              tone: "border-purple-200 bg-purple-50/60 text-purple-700",
            },
            {
              key: "sla_risk",
              label: t(
                "SLA Warning / Breached",
                "SLA riziko / porušené",
                "SLA kockázat / lejárt",
              ),
              count: kpiCounts.slaRisk,
              tone: "border-rose-200 bg-rose-50/60 text-rose-700",
            },
            {
              key: "resolved",
              label: t(
                "Resolved / Closed",
                "Vyriešené / Uzavreté",
                "Megoldva / Lezárva",
              ),
              count: kpiCounts.resolved,
              tone: "border-emerald-200 bg-emerald-50/60 text-emerald-700",
            },
          ] as const
        ).map((card) => {
          const active = statusFilter === "all" && kpiBucket === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => {
                setStatusFilter("all");
                setKpiBucket(card.key);
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                active
                  ? `${card.tone} ring-2 ring-indigo-500/30 shadow-sm`
                  : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
              }`}
            >
              <div className="font-heading font-extrabold text-title-md tabular-nums">
                {card.count}
              </div>
              <div className="type-overline text-slate-500 mt-0.5">
                {card.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter Bar */}
      <div className="glass-panel flex flex-col ws-sm:flex-row ws-sm:flex-wrap items-stretch ws-sm:items-center gap-2.5 p-3 rounded-3xl border border-slate-200 bg-white/95 shadow-2xs">
        <div className="relative flex-1 min-w-50">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t(
              "Search ticket #, subject, email, project, client...",
              "Hľadať číslo tiketu, predmet, e-mail, projekt, klienta...",
              "Jegy #, tárgy, e-mail, projekt, ügyfél keresése...",
            )}
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-ui font-semibold bg-white"
          />
        </div>

        <div className="w-40">
          <CustomSelect
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
            options={[
              {
                value: "all",
                label: t("All Statuses", "Všetky stavy", "Minden állapot"),
              },
              ...orderedStatuses.map((s) => ({
                value: s.key || s.id,
                label: ticketStatusLabel(
                  s.key || s.id,
                  userLanguage,
                  ticketStatuses,
                ),
              })),
            ]}
          />
        </div>

        <div className="w-36">
          <CustomSelect
            value={priorityFilter}
            onChange={(v) => setPriorityFilter(v)}
            options={[
              {
                value: "all",
                label: t(
                  "All Priorities",
                  "Všetky priority",
                  "Minden prioritás",
                ),
              },
              {
                value: "critical",
                label: t("Critical", "Kritická", "Kritikus"),
              },
              { value: "high", label: t("High", "Vysoká", "Magas") },
              { value: "normal", label: t("Normal", "Normálna", "Normál") },
              { value: "low", label: t("Low", "Nízka", "Alacsony") },
            ]}
          />
        </div>

        <div className="w-44">
          <CustomSelect
            value={projectFilter}
            onChange={(v) => setProjectFilter(v)}
            options={[
              {
                value: "all",
                label: t("All Projects", "Všetky projekty", "Minden projekt"),
              },
              ...projects.map((p) => ({
                value: p.id,
                label: getProjectName(p.id) || p.id,
              })),
            ]}
          />
        </div>

        <div className="w-40">
          <CustomSelect
            value={assigneeFilter}
            onChange={(v) => setAssigneeFilter(v)}
            options={[
              {
                value: "all",
                label: t("All Agents", "Všetci agenti", "Minden felelős"),
              },
              {
                value: "__unassigned__",
                label: t("Unassigned", "Nepriradené", "Nincs felelős"),
              },
              ...users.map((u) => ({ value: u.name, label: u.name })),
            ]}
          />
        </div>

        {projectFilter !== "all" && (
          <button
            type="button"
            onClick={() => setProjectFilter("all")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-micro font-bold cursor-pointer"
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>{getProjectName(projectFilter) || projectFilter}</span>
            <X className="w-3 h-3" />
          </button>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={() =>
              setArchiveScope((s) => (s === "active" ? "archived" : "active"))
            }
            className={`px-3 h-10 rounded-xl border text-caption font-bold flex items-center gap-1.5 cursor-pointer ${
              archiveScope === "archived"
                ? "bg-amber-50 border-amber-300 text-amber-700"
                : "bg-white border-slate-200 text-slate-500 hover:text-slate-800"
            }`}
          >
            <Archive className="w-4 h-4" />
            <span>
              {archiveScope === "archived"
                ? t("Archived", "Archív", "Archivált")
                : t("Active", "Aktívne", "Aktív")}
            </span>
          </button>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`p-2 rounded-lg cursor-pointer ${
                viewMode === "table"
                  ? "bg-white text-indigo-600 shadow-2xs"
                  : "text-slate-400"
              }`}
              title={t("Table view", "Tabuľka", "Táblázat")}
            >
              <Rows3 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("board")}
              className={`p-2 rounded-lg cursor-pointer ${
                viewMode === "board"
                  ? "bg-white text-indigo-600 shadow-2xs"
                  : "text-slate-400"
              }`}
              title={t("Kanban board", "Kanban tabuľa", "Kanban tábla")}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Full-Width Table or Kanban Board */}
      <div>
        {viewMode === "table" ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
            {filteredTickets.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-ui font-semibold">
                {t(
                  "No support tickets match the current filters.",
                  "Žiadne podporné tikety nezodpovedajú filtrom.",
                  "Nincs a szűrőknek megfelelő támogatási jegy.",
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredTickets.map((tk) => {
                  const stColor = ticketStatusColor(tk.status, ticketStatuses);
                  const stLabel = ticketStatusLabel(
                    tk.status,
                    userLanguage,
                    ticketStatuses,
                  );
                  const sla = evaluateTicketSla(tk, ticketStatuses);
                  const projName = getProjectName(tk.projectId);
                  const client = getClientForTicket(tk);

                  return (
                    <div
                      key={tk.id}
                      onClick={() => handleSelectTicket(tk.id)}
                      className="p-4 transition-all cursor-pointer hover:bg-slate-50/90 flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-mono text-micro font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                            {tk.ticketNumber}
                          </span>
                          <span
                            className="px-2 py-0.5 rounded-full text-micro font-bold uppercase"
                            style={{
                              backgroundColor: `${PRIORITY_COLORS[tk.priority] || "#3b82f6"}18`,
                              color:
                                PRIORITY_COLORS[tk.priority] || "#3b82f6",
                            }}
                          >
                            {tk.priority}
                          </span>
                          <span className="text-micro font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            {tk.source || tk.channel || "manual"}
                          </span>
                          {sla.state === "breached" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-micro font-bold">
                              <AlertTriangle className="w-3 h-3" />
                              {t(
                                "SLA Breached",
                                "SLA porušené",
                                "SLA lejárt",
                              )}
                            </span>
                          )}
                          {sla.state === "warning" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-micro font-bold">
                              <Clock className="w-3 h-3" />
                              {sla.minutesRemaining}m
                            </span>
                          )}
                        </div>
                        <span
                          className="px-2.5 py-0.5 rounded-full text-micro font-bold border shrink-0"
                          style={{
                            backgroundColor: `${stColor}15`,
                            color: stColor,
                            borderColor: `${stColor}40`,
                          }}
                        >
                          {stLabel}
                        </span>
                      </div>

                      <div className="font-heading font-bold text-ui text-slate-800 line-clamp-1">
                        {tk.subject}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-micro text-slate-500">
                        <div className="flex items-center gap-2 flex-wrap">
                          {projName && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-bold">
                              <Briefcase className="w-3 h-3" />
                              {projName}
                            </span>
                          )}
                          {client && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                              <User className="w-3 h-3" />
                              {client.name}
                            </span>
                          )}
                          <span>{tk.reporterEmail || tk.reporterName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {(tk.assignedUsers || []).length > 0 ? (
                            <span className="font-bold text-slate-700">
                              {(tk.assignedUsers || []).join(", ")}
                            </span>
                          ) : (
                            <span className="text-amber-600 font-bold">
                              {t("Unassigned", "Nepriradené", "Nincs felelős")}
                            </span>
                          )}
                          <span>•</span>
                          <span>
                            {String(tk.updatedAt || tk.createdAt || "").slice(
                              0,
                              16,
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Kanban Board View (Drag & Drop + Quick Status Move) */
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
            {orderedStatuses.map((st) => {
              const stKey = st.key || st.id;
              const colTickets = filteredTickets.filter(
                (tk) => tk.status === stKey,
              );
              const isDropTarget = dragOverStatusKey === stKey;

              return (
                <div
                  key={stKey}
                  onDragOver={(e) => {
                    if (!canEdit || !draggedTicketId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverStatusKey !== stKey) {
                      setDragOverStatusKey(stKey);
                    }
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverStatusKey((prev) =>
                        prev === stKey ? null : prev,
                      );
                    }
                  }}
                  onDrop={(e) => {
                    if (!canEdit) return;
                    e.preventDefault();
                    const tkId =
                      e.dataTransfer.getData("text/plain") || draggedTicketId;
                    setDraggedTicketId(null);
                    setDragOverStatusKey(null);
                    if (tkId) {
                      handleMoveTicketStatus(tkId, stKey);
                    }
                  }}
                  className={`w-72 shrink-0 rounded-2xl border p-3 space-y-2.5 transition-all ${
                    isDropTarget
                      ? "bg-indigo-50/70 border-indigo-500 ring-2 ring-indigo-500/25"
                      : "bg-slate-50/90 border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: st.color }}
                      />
                      <span className="font-heading font-bold text-caption text-slate-800">
                        {ticketStatusLabel(
                          stKey,
                          userLanguage,
                          ticketStatuses,
                        )}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-micro font-bold text-slate-600">
                      {colTickets.length}
                    </span>
                  </div>

                  <div className="space-y-2 min-h-32 max-h-[65vh] overflow-y-auto pr-1">
                    {colTickets.length === 0 && (
                      <div className="py-8 px-3 rounded-xl border border-dashed border-slate-200 text-center text-micro text-slate-400">
                        {t(
                          "Drop ticket here",
                          "Presuňte tiket sem",
                          "Húzza ide a jegyet",
                        )}
                      </div>
                    )}
                    {colTickets.map((tk) => {
                      const projName = getProjectName(tk.projectId);
                      const isDragging = draggedTicketId === tk.id;
                      return (
                        <div
                          key={tk.id}
                          draggable={canEdit}
                          onDragStart={(e) => {
                            if (!canEdit) return;
                            setDraggedTicketId(tk.id);
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", tk.id);
                          }}
                          onDragEnd={() => {
                            setDraggedTicketId(null);
                            setDragOverStatusKey(null);
                          }}
                          onClick={() => handleSelectTicket(tk.id)}
                          className={`p-3 rounded-xl bg-white border shadow-2xs transition-all space-y-1.5 ${
                            canEdit
                              ? "cursor-grab active:cursor-grabbing"
                              : "cursor-pointer"
                          } ${
                            isDragging
                              ? "opacity-50 border-indigo-400 ring-2 ring-indigo-500/20"
                              : "border-slate-200 hover:border-indigo-300"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-micro font-bold text-indigo-600">
                              {tk.ticketNumber}
                            </span>
                            <span
                              className="px-1.5 py-0.5 rounded text-micro font-bold uppercase"
                              style={{
                                backgroundColor: `${PRIORITY_COLORS[tk.priority] || "#3b82f6"}18`,
                                color:
                                  PRIORITY_COLORS[tk.priority] || "#3b82f6",
                              }}
                            >
                              {tk.priority}
                            </span>
                          </div>
                          <div className="font-bold text-caption text-slate-800 line-clamp-2">
                            {tk.subject}
                          </div>
                          {projName && (
                            <div className="text-micro font-bold text-purple-700 truncate">
                              {projName}
                            </div>
                          )}
                          {canEdit && (
                            <div
                              className="pt-1 border-t border-slate-100 flex items-center justify-between gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-micro text-slate-400 truncate">
                                {(tk.assignedUsers || [])[0] ||
                                  t("Unassigned", "Nepriradené", "Nincs felelős")}
                              </span>
                              <select
                                value={tk.status}
                                onChange={(e) =>
                                  handleMoveTicketStatus(tk.id, e.target.value)
                                }
                                className="px-1.5 py-0.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-white text-micro font-bold text-slate-600 cursor-pointer"
                                title={t(
                                  "Move status",
                                  "Zmeniť stav",
                                  "Állapot módosítása",
                                )}
                              >
                                {orderedStatuses.map((opt) => {
                                  const optKey = opt.key || opt.id;
                                  return (
                                    <option key={optKey} value={optKey}>
                                      {ticketStatusLabel(
                                        optKey,
                                        userLanguage,
                                        ticketStatuses,
                                      )}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Ticket Modal (with Rich HTML Formatting + Image & File Upload) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-title-sm text-slate-900">
                {t(
                  "Create Support Ticket",
                  "Vytvoriť podporný tiket",
                  "Támogatási jegy létrehozása",
                )}
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-3.5">
              <div>
                <label className="block type-overline text-slate-400 mb-1">
                  {t("Subject *", "Predmet *", "Tárgy *")}
                </label>
                <input
                  type="text"
                  required
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-ui font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
                <div>
                  <label className="block type-overline text-slate-400 mb-1">
                    {t("Project", "Projekt", "Projekt")}
                  </label>
                  <select
                    value={newProjectId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      setNewProjectId(pid);
                      const proj = projects.find((p) => p.id === pid);
                      if (proj?.leadId) setNewLeadId(proj.leadId);
                      else if (proj?.clientId) setNewLeadId(proj.clientId);
                    }}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-caption font-semibold bg-white"
                  >
                    <option value="">
                      {t(
                        "— Select Project —",
                        "— Vybrať projekt —",
                        "— Projekt választása —",
                      )}
                    </option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {getProjectName(p.id) || p.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block type-overline text-slate-400 mb-1">
                    {t("Client", "Klient", "Ügyfél")}
                  </label>
                  <select
                    value={newLeadId}
                    onChange={(e) => setNewLeadId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-caption font-semibold bg-white"
                  >
                    <option value="">
                      {t(
                        "— Auto / Select Client —",
                        "— Automaticky / Klient —",
                        "— Automatikus / Ügyfél —",
                      )}
                    </option>
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block type-overline text-slate-400 mb-1">
                    {t("Priority", "Priorita", "Prioritás")}
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) =>
                      setNewPriority(e.target.value as TicketPriority)
                    }
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-caption font-semibold bg-white"
                  >
                    <option value="low">
                      {t("Low", "Nízka", "Alacsony")}
                    </option>
                    <option value="normal">
                      {t("Normal", "Normálna", "Normál")}
                    </option>
                    <option value="high">
                      {t("High", "Vysoká", "Magas")}
                    </option>
                    <option value="critical">
                      {t("Critical", "Kritická", "Kritikus")}
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block type-overline text-slate-400 mb-1">
                    {t("Type", "Typ", "Típus")}
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as TicketType)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-caption font-semibold bg-white"
                  >
                    <option value="bug">Bug</option>
                    <option value="question">Question</option>
                    <option value="feature_request">Feature Request</option>
                    <option value="incident">Incident</option>
                    <option value="billing">Billing</option>
                  </select>
                </div>
                <div>
                  <label className="block type-overline text-slate-400 mb-1">
                    {t("Assignee", "Riešiteľ", "Felelős")}
                  </label>
                  <select
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-caption font-semibold bg-white"
                  >
                    <option value="">
                      {t("Unassigned", "Nepriradené", "Nincs felelős")}
                    </option>
                    {users.map((u) => (
                      <option key={u.id} value={u.name}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 ws-sm:grid-cols-2 gap-3">
                <div>
                  <label className="block type-overline text-slate-400 mb-1">
                    {t("Reporter Name", "Meno hlásateľa", "Bejelentő neve")}
                  </label>
                  <input
                    type="text"
                    value={newReporterName}
                    onChange={(e) => setNewReporterName(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-caption font-semibold"
                  />
                </div>
                <div>
                  <label className="block type-overline text-slate-400 mb-1">
                    {t(
                      "Reporter Email",
                      "E-mail hlásateľa",
                      "Bejelentő e-mail",
                    )}
                  </label>
                  <input
                    type="email"
                    value={newReporterEmail}
                    onChange={(e) => setNewReporterEmail(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-caption font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block type-overline text-slate-400 mb-1">
                  {t(
                    "Description (HTML Formatting, Images & Files)",
                    "Popis (HTML formátovanie, obrázky a súbory)",
                    "Leírás (HTML formázás, képek és fájlok)",
                  )}
                </label>
                <TicketRichHtmlEditor
                  value={newDescription}
                  onChange={setNewDescription}
                  attachments={newTicketAttachments}
                  onAttachmentsChange={setNewTicketAttachments}
                  userLanguage={userLanguage}
                  minRows={4}
                  placeholder={t(
                    "Describe the issue with rich formatting, paste screenshots, or attach files...",
                    "Popíšte požiadavku s formátovaním, prilepte screenshoty alebo priložte súbory...",
                    "Írja le a problémát formázással, illesszen be képernyőképeket vagy csatoljon fájlokat...",
                  )}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-caption font-bold text-slate-600 cursor-pointer"
                >
                  {t("Cancel", "Zrušiť", "Mégse")}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-caption font-bold cursor-pointer"
                >
                  {t("Create Ticket", "Vytvoriť tiket", "Jegy létrehozása")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Support Contracts (Retainers) Modal */}
      {showContractsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-title-sm text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span>
                  {t(
                    "Support Contracts & Monthly Retainers",
                    "Servisné zmluvy a mesačné paušály",
                    "Támogatási szerződések és havi átalányok",
                  )}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setShowContractsModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {canEdit && (
              <form
                onSubmit={handleCreateContract}
                className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 ws-sm:grid-cols-4 gap-2.5"
              >
                <input
                  type="text"
                  required
                  value={contractName}
                  onChange={(e) => setContractName(e.target.value)}
                  placeholder={t(
                    "Contract name...",
                    "Názov paušálu...",
                    "Szerződés neve...",
                  )}
                  className="ws-sm:col-span-2 h-9 px-3 rounded-xl border border-slate-200 bg-white text-caption font-semibold"
                />
                <select
                  value={contractProjectId}
                  onChange={(e) => setContractProjectId(e.target.value)}
                  className="h-9 px-2.5 rounded-xl border border-slate-200 bg-white text-caption font-semibold"
                >
                  <option value="">
                    {t(
                      "Any Project",
                      "Ľubovoľný projekt",
                      "Bármely projekt",
                    )}
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {getProjectName(p.id) || p.id}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    value={contractHours}
                    onChange={(e) =>
                      setContractHours(Number(e.target.value) || 10)
                    }
                    className="w-20 h-9 px-2.5 rounded-xl border border-slate-200 bg-white text-caption font-bold"
                    title={t(
                      "Monthly hours",
                      "Hodiny mesačne",
                      "Havi óraszám",
                    )}
                  />
                  <button
                    type="submit"
                    className="flex-1 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-caption font-bold cursor-pointer"
                  >
                    {t("Add", "Pridať", "Hozzáadás")}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2.5">
              {supportContracts.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-caption">
                  {t(
                    "No support contracts configured yet.",
                    "Zatiaľ žiadne servisné zmluvy.",
                    "Még nincsenek támogatási szerződések.",
                  )}
                </div>
              ) : (
                supportContracts.map((c) => {
                  const inc =
                    c.monthlyHoursIncluded || c.monthlyHours || 0;
                  const used = c.hoursUsedThisMonth || 0;
                  const pct =
                    inc > 0
                      ? Math.min(100, Math.round((used / inc) * 100))
                      : 0;
                  return (
                    <div
                      key={c.id}
                      className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-ui text-slate-800">
                            {c.name}
                          </div>
                          <div className="text-micro text-slate-500">
                            {getProjectName(c.projectId) ||
                              t(
                                "General Retainer",
                                "Všeobecný paušál",
                                "Általános átalány",
                              )}{" "}
                            • {used} / {inc} h ({pct}%)
                          </div>
                        </div>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() =>
                              setSupportContracts((prev) =>
                                prev.filter((item) => item.id !== c.id),
                              )
                            }
                            className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            pct >= 90
                              ? "bg-rose-500"
                              : pct >= 75
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
