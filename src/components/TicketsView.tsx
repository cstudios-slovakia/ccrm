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
  ExternalLink,
  CheckSquare,
  Timer,
  ShieldCheck,
  Terminal,
  Image as ImageIcon,
  X,
  RefreshCw,
  FileText,
} from "lucide-react";
import type {
  Ticket,
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
import type { Language } from "../utils/translations";
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
import { nowLocalStamp, todayLocalPlusDays } from "../utils/localTime";
import { PageHeader } from "./layout";
import { CustomSelect } from "./ui/CustomSelect";

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
    () => [...ticketStatuses].sort((a, b) => a.sortOrder - b.sortOrder),
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

  // Selected Ticket for Split Drawer
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(
    initialSelectedTicketId || null,
  );

  useEffect(() => {
    if (initialSelectedTicketId) {
      setSelectedTicketId(initialSelectedTicketId);
    }
  }, [initialSelectedTicketId]);

  const selectedTicket = useMemo(
    () => tickets.find((tk) => tk.id === selectedTicketId) || null,
    [tickets, selectedTicketId],
  );

  // Reply composer state
  const [replyTab, setReplyTab] = useState<"public" | "internal">("public");
  const [replyBody, setReplyBody] = useState("");
  const [sendViaEmail, setSendViaEmail] = useState(true);
  const [replyAttachments, setReplyAttachments] = useState<
    { name: string; path: string; size?: string }[]
  >([]);
  const [isUploadingReplyFile, setIsUploadingReplyFile] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Create Ticket Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newDescription, setNewDescription] = useState("");
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
    if (p.name) return p.name;
    const l = leads.find((ld) => ld.id === p.leadId || ld.id === p.clientId);
    return l ? l.name : p.id;
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
    const active = tickets.filter((tk) => !tk.archived);
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
    return { allOpen, unassigned, waitingClient, slaRisk, resolved, total: active.length };
  }, [tickets, ticketStatuses]);

  // Filtered Tickets
  const filteredTickets = useMemo(() => {
    return tickets
      .filter((tk) => {
        if (archiveScope === "active" && tk.archived) return false;
        if (archiveScope === "archived" && !tk.archived) return false;

        // KPI Bucket filter (when statusFilter === 'all')
        if (statusFilter === "all" && archiveScope === "active") {
          const closed = isClosedTicketStatus(tk.status, ticketStatuses);
          if (kpiBucket === "all_open" && closed) return false;
          if (kpiBucket === "unassigned" && (closed || (tk.assignedUsers && tk.assignedUsers.length > 0)))
            return false;
          if (kpiBucket === "waiting_client" && tk.status !== "waiting_client") return false;
          if (kpiBucket === "sla_risk") {
            const sla = evaluateTicketSla(tk, ticketStatuses);
            if (sla.state !== "warning" && sla.state !== "breached") return false;
          }
          if (kpiBucket === "resolved" && !closed) return false;
        }

        if (statusFilter !== "all" && tk.status !== statusFilter) return false;
        if (priorityFilter !== "all" && tk.priority !== priorityFilter) return false;
        if (projectFilter !== "all" && tk.projectId !== projectFilter) return false;
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
      .sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""));
  }, [
    tickets,
    archiveScope,
    statusFilter,
    kpiBucket,
    priorityFilter,
    projectFilter,
    assigneeFilter,
    searchQuery,
    ticketStatuses,
    projects,
    leads,
  ]);

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
    const newTicket: Ticket = {
      id: ticketId,
      ticketNumber: generateTicketNumber(tickets),
      subject: newSubject.trim(),
      description: newDescription.trim(),
      status: orderedStatuses[0]?.key || "open",
      priority: newPriority,
      type: newType,
      source: "manual",
      projectId: newProjectId || null,
      leadId: resolvedLeadId,
      clientId: resolvedLeadId,
      contractId: newContractId || null,
      reporterName: newReporterName.trim() || currentUser?.name || "Client",
      reporterEmail: newReporterEmail.trim(),
      assignedUsers: newAssignee ? [newAssignee] : [],
      firstResponseDueAt,
      resolutionDueAt,
      createdAt: now,
      updatedAt: now,
      archived: false,
      messages: newDescription.trim()
        ? [
            {
              id: `tmsg-${Date.now()}`,
              ticketId,
              authorType: "agent",
              authorName: currentUser?.name || "Support",
              authorEmail: currentUser?.email || "",
              body: newDescription.trim(),
              isInternal: false,
              attachments: [],
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
    setNewReporterName("");
    setNewReporterEmail("");
    handleSelectTicket(newTicket.id);
    (window as any).showToast?.(
      t("Support ticket created.", "Podporný tiket bol vytvorený.", "Támogatási jegy létrehozva."),
    );
  };

  const handleSendReply = async (nextStatusOverride?: string) => {
    if (!selectedTicket || !canEdit || !replyBody.trim()) return;
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
          firstRespondedAt: isFirstAgentPublicReply ? now : tk.firstRespondedAt,
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
        ? t("Internal note added.", "Interná poznámka pridaná.", "Belső jegyzet hozzáadva.")
        : t("Reply posted.", "Odpoveď bola odoslaná.", "Válasz elküldve."),
    );
  };

  const handleUploadReplyAttachment = async (file: File) => {
    if (!selectedTicket || !canEdit) return;
    setIsUploadingReplyFile(true);
    const eventId = `tktatt-${selectedTicket.id}-${Date.now()}`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("eventId", eventId);
    try {
      const res = await fetch("/upload.php", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        const sizeStr =
          file.size > 1024 * 1024
            ? (file.size / (1024 * 1024)).toFixed(1) + " MB"
            : Math.round(file.size / 1024) + " KB";
        setReplyAttachments((prev) => [
          ...prev,
          {
            name: data.fileName || file.name,
            path: data.filePath || `/uploads/${eventId}_${data.fileName || file.name}`,
            size: sizeStr,
          },
        ]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsUploadingReplyFile(false);
    }
  };

  const handleCreateTaskFromTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !canEdit || !newTaskTitle.trim()) return;
    const now = nowLocalStamp();
    const taskId = `task-${Date.now()}`;
    const newTask: Task = {
      id: taskId,
      title: `[${selectedTicket.ticketNumber}] ${newTaskTitle.trim()}`,
      description: `${selectedTicket.subject}\n\n${selectedTicket.description || ""}`.trim(),
      status: taskStates[0] || "New",
      priority:
        selectedTicket.priority === "critical" || selectedTicket.priority === "high"
          ? "high"
          : selectedTicket.priority === "low"
            ? "low"
            : "medium",
      deadline: todayLocalPlusDays(3),
      owner: newTaskAssignee || currentUser?.name || "",
      createdBy: currentUser?.name || "",
      assignedUsers: newTaskAssignee ? [newTaskAssignee] : [],
      relatedProjectId: selectedTicket.projectId || undefined,
      relatedLeadId: selectedTicket.leadId || selectedTicket.clientId || undefined,
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
      description: logDesc.trim() || t("Support work", "Podpora", "Támogatási munka"),
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
            ? { ...c, hoursUsedThisMonth: +((c.hoursUsedThisMonth || 0) + addHours).toFixed(2) }
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
      const res = await fetch("./api/tickets.php?action=poll_imap", { method: "POST" });
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
      t("Support contract created.", "Servisná zmluva vytvorená.", "Támogatási szerződés létrehozva."),
    );
  };

  return (
    <div className="space-y-5 text-left">
      <PageHeader
        icon={<TicketIcon className="h-6 w-6 text-indigo-600" />}
        title={t("Support Tickets & SLA", "Podporné tikety a SLA", "Támogatási jegyek és SLA")}
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
              <RefreshCw className={`w-4 h-4 text-indigo-600 ${isPollingImap ? "animate-spin" : ""}`} />
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
                {t("Retainers", "Paušály", "Átalányok")} ({supportContracts.length})
              </span>
            </button>
            {settingsAccess.view && (
              <button
                type="button"
                onClick={() => {
                  window.location.hash = "settings/tickets";
                }}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-heading font-bold text-ui transition-all cursor-pointer"
                title={t("Ticket Settings", "Nastavenia tiketov", "Jegy beállítások")}
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
              label: t("Waiting on Client", "Čaká na klienta", "Ügyfélre vár"),
              count: kpiCounts.waitingClient,
              tone: "border-purple-200 bg-purple-50/60 text-purple-700",
            },
            {
              key: "sla_risk",
              label: t("SLA Warning / Breached", "SLA riziko / porušené", "SLA kockázat / lejárt"),
              count: kpiCounts.slaRisk,
              tone: "border-rose-200 bg-rose-50/60 text-rose-700",
            },
            {
              key: "resolved",
              label: t("Resolved / Closed", "Vyriešené / Uzavreté", "Megoldva / Lezárva"),
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
              <div className="type-overline text-slate-500 mt-0.5">{card.label}</div>
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
              { value: "all", label: t("All Statuses", "Všetky stavy", "Minden állapot") },
              ...orderedStatuses.map((s) => ({
                value: s.key || s.id,
                label: ticketStatusLabel(s.key || s.id, userLanguage, ticketStatuses),
              })),
            ]}
          />
        </div>

        <div className="w-36">
          <CustomSelect
            value={priorityFilter}
            onChange={(v) => setPriorityFilter(v)}
            options={[
              { value: "all", label: t("All Priorities", "Všetky priority", "Minden prioritás") },
              { value: "urgent", label: t("Urgent", "Urgentná", "Sürgős") },
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
              { value: "all", label: t("All Projects", "Všetky projekty", "Minden projekt") },
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
              { value: "all", label: t("All Agents", "Všetci agenti", "Minden felelős") },
              { value: "__unassigned__", label: t("Unassigned", "Nepriradené", "Nincs felelős") },
              ...users.map((u) => ({ value: u.name, label: u.name })),
            ]}
          />
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={() => setArchiveScope((s) => (s === "active" ? "archived" : "active"))}
            className={`px-3 h-10 rounded-xl border text-caption font-bold flex items-center gap-1.5 cursor-pointer ${
              archiveScope === "archived"
                ? "bg-amber-50 border-amber-300 text-amber-700"
                : "bg-white border-slate-200 text-slate-500 hover:text-slate-800"
            }`}
          >
            <Archive className="w-4 h-4" />
            <span>{archiveScope === "archived" ? t("Archived", "Archív", "Archivált") : t("Active", "Aktívne", "Aktív")}</span>
          </button>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`p-2 rounded-lg cursor-pointer ${
                viewMode === "table" ? "bg-white text-indigo-600 shadow-2xs" : "text-slate-400"
              }`}
              title={t("Table view", "Tabuľka", "Táblázat")}
            >
              <Rows3 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("board")}
              className={`p-2 rounded-lg cursor-pointer ${
                viewMode === "board" ? "bg-white text-indigo-600 shadow-2xs" : "text-slate-400"
              }`}
              title={t("Kanban board", "Kanban tabuľa", "Kanban tábla")}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Table or Kanban Board + Split Detail View */}
      <div className="grid grid-cols-1 ws-lg:grid-cols-12 gap-5 items-start">
        <div className={selectedTicket ? "ws-lg:col-span-5" : "ws-lg:col-span-12"}>
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
                    const stLabel = ticketStatusLabel(tk.status, userLanguage, ticketStatuses);
                    const sla = evaluateTicketSla(tk, ticketStatuses);
                    const projName = getProjectName(tk.projectId);
                    const client = getClientForTicket(tk);
                    const isSelected = selectedTicket?.id === tk.id;

                    return (
                      <div
                        key={tk.id}
                        onClick={() => handleSelectTicket(tk.id)}
                        className={`p-4 transition-all cursor-pointer hover:bg-slate-50/90 flex flex-col gap-2 ${
                          isSelected ? "bg-indigo-50/50 border-l-4 border-l-indigo-600" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-mono text-micro font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                              {tk.ticketNumber}
                            </span>
                            <span
                              className="px-2 py-0.5 rounded-full text-micro font-bold uppercase"
                              style={{
                                backgroundColor: `${PRIORITY_COLORS[tk.priority]}18`,
                                color: PRIORITY_COLORS[tk.priority],
                              }}
                            >
                              {tk.priority}
                            </span>
                            <span className="text-micro font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                              {tk.source}
                            </span>
                            {sla.state === "breached" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-micro font-bold">
                                <AlertTriangle className="w-3 h-3" />
                                {t("SLA Breached", "SLA porušené", "SLA lejárt")}
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
                            <span>{String(tk.updatedAt || tk.createdAt || "").slice(0, 16)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Kanban Board View */
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
              {orderedStatuses.map((st) => {
                const stKey = st.key || st.id;
                const colTickets = filteredTickets.filter((tk) => tk.status === stKey);
                return (
                  <div
                    key={stKey}
                    className="w-72 shrink-0 bg-slate-50/90 rounded-2xl border border-slate-200 p-3 space-y-2.5"
                  >
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: st.color }}
                        />
                        <span className="font-heading font-bold text-caption text-slate-800">
                          {ticketStatusLabel(stKey, userLanguage, ticketStatuses)}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-micro font-bold text-slate-600">
                        {colTickets.length}
                      </span>
                    </div>

                    <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
                      {colTickets.map((tk) => {
                        const projName = getProjectName(tk.projectId);
                        return (
                          <div
                            key={tk.id}
                            onClick={() => handleSelectTicket(tk.id)}
                            className={`p-3 rounded-xl bg-white border shadow-2xs cursor-pointer transition-all hover:border-indigo-300 space-y-1.5 ${
                              selectedTicket?.id === tk.id
                                ? "border-indigo-600 ring-2 ring-indigo-500/20"
                                : "border-slate-200"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-micro font-bold text-indigo-600">
                                {tk.ticketNumber}
                              </span>
                              <span
                                className="px-1.5 py-0.5 rounded text-micro font-bold uppercase"
                                style={{
                                  backgroundColor: `${PRIORITY_COLORS[tk.priority]}18`,
                                  color: PRIORITY_COLORS[tk.priority],
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

        {/* Selected Ticket Detail Split Panel */}
        {selectedTicket && (
          <div className="ws-lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Ticket Header */}
            <div className="p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-caption font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                    {selectedTicket.ticketNumber}
                  </span>
                  <span className="text-micro font-bold uppercase px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-700">
                    {selectedTicket.source}
                  </span>
                  {(() => {
                    const sla = evaluateTicketSla(selectedTicket, ticketStatuses);
                    if (sla.state === "met") {
                      return (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-micro font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {t("SLA Met", "SLA splnené", "SLA teljesítve")}
                        </span>
                      );
                    }
                    if (sla.state === "breached") {
                      return (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-micro font-bold">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {t("SLA Breached", "SLA porušené", "SLA lejárt")} (
                          {formatDurationMinutes(Math.abs(sla.minutesRemaining || 0))} overdue)
                        </span>
                      );
                    }
                    if (sla.state === "warning") {
                      return (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-micro font-bold">
                          <Clock className="w-3.5 h-3.5" />
                          {t("SLA Due in", "SLA vyprší o", "SLA lejár")} {formatDurationMinutes(sla.minutesRemaining || 0)}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div className="flex items-center gap-1.5">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => updateSelectedTicket({ archived: !selectedTicket.archived })}
                      className="p-2 rounded-xl text-slate-400 hover:text-amber-600 hover:bg-amber-50 cursor-pointer"
                      title={
                        selectedTicket.archived
                          ? t("Restore Ticket", "Obnoviť tiket", "Jegy visszaállítása")
                          : t("Archive Ticket", "Archivovať tiket", "Jegy archiválása")
                      }
                    >
                      {selectedTicket.archived ? (
                        <ArchiveRestore className="w-4 h-4" />
                      ) : (
                        <Archive className="w-4 h-4" />
                      )}
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
                          setTickets((prev) => prev.filter((tk) => tk.id !== selectedTicket.id));
                          handleSelectTicket(null);
                        }
                      }}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSelectTicket(null)}
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="font-heading font-extrabold text-title-sm text-slate-900">
                {selectedTicket.subject}
              </h3>

              <div className="flex flex-wrap items-center gap-3 text-caption text-slate-500">
                <span>
                  {t("Reporter:", "Odosielateľ:", "Bejelentő:")}{" "}
                  <strong className="text-slate-800">
                    {selectedTicket.reporterName || "Client"}
                  </strong>{" "}
                  {selectedTicket.reporterEmail && `<${selectedTicket.reporterEmail}>`}
                </span>
                <span>•</span>
                <span>{selectedTicket.createdAt}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 ws-md:grid-cols-12 divide-y ws-md:divide-y-0 ws-md:divide-x divide-slate-200">
              {/* Left 7 cols: Diagnostics, Thread, Composer */}
              <div className="ws-md:col-span-7 p-4 space-y-4">
                {/* Widget Diagnostics & Screenshot Card */}
                {(selectedTicket.widgetMetadata || selectedTicket.screenshotPath) && (
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
                      {selectedTicket.widgetMetadata?.viewport && (
                        <span className="font-mono text-slate-400">
                          {selectedTicket.widgetMetadata.viewport}
                        </span>
                      )}
                    </div>
                    {selectedTicket.widgetMetadata?.url && (
                      <div className="font-mono text-slate-300 truncate">
                        URL:{" "}
                        <a
                          href={selectedTicket.widgetMetadata.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-300 underline"
                        >
                          {selectedTicket.widgetMetadata.url}
                        </a>
                      </div>
                    )}
                    {selectedTicket.widgetMetadata?.consoleErrors &&
                      selectedTicket.widgetMetadata.consoleErrors.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-rose-400 font-bold">
                            {t("Console / Runtime Errors:", "Chyby v konzole:", "Konzol / futási hibák:")} (
                            {selectedTicket.widgetMetadata.consoleErrors.length})
                          </span>
                          <pre className="p-2 rounded-lg bg-black/50 text-rose-200 font-mono text-micro overflow-x-auto max-h-32">
                            {selectedTicket.widgetMetadata.consoleErrors.join("\n")}
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
                          <span>{t("Open Attached Screenshot", "Otvoriť priložený screenshot", "Csatolt képernyőkép megnyitása")}</span>
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

                {/* Conversation Thread */}
                <div className="space-y-3 max-h-105 overflow-y-auto pr-1">
                  {(selectedTicket.messages || []).length === 0 && selectedTicket.description && (
                    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-caption text-slate-700 whitespace-pre-wrap">
                      {selectedTicket.description}
                    </div>
                  )}

                  {(selectedTicket.messages || []).map((msg) => {
                    const isInternal = msg.isInternal;
                    const isClient = msg.authorType === "client";
                    return (
                      <div
                        key={msg.id}
                        className={`p-3.5 rounded-2xl border space-y-1.5 ${
                          isInternal
                            ? "bg-amber-50/90 border-amber-300 text-amber-950"
                            : isClient
                              ? "bg-slate-50 border-slate-200 text-slate-800"
                              : "bg-indigo-50/50 border-indigo-200 text-slate-800"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-micro">
                          <div className="flex items-center gap-1.5 font-bold">
                            <span>{msg.authorName || (isClient ? "Client" : "Agent")}</span>
                            {isInternal && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900 text-micro font-extrabold uppercase">
                                <Lock className="w-2.5 h-2.5" />
                                {t("Internal Note", "Interná poznámka", "Belső jegyzet")}
                              </span>
                            )}
                          </div>
                          <span className="text-slate-400">{String(msg.createdAt || "").slice(0, 16)}</span>
                        </div>
                        <div className="text-caption whitespace-pre-wrap leading-relaxed">
                          {msg.body}
                        </div>
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {msg.attachments.map((att, idx) => (
                              <a
                                key={idx}
                                href={att.path}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-micro font-bold text-indigo-600 hover:underline"
                              >
                                <FileText className="w-3 h-3" />
                                <span>{att.name}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Reply Composer */}
                {canEdit && (
                  <div className="pt-2 border-t border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setReplyTab("public")}
                          className={`px-3 py-1 rounded-lg text-micro font-bold cursor-pointer ${
                            replyTab === "public"
                              ? "bg-white text-indigo-600 shadow-2xs"
                              : "text-slate-500"
                          }`}
                        >
                          {t("Public Reply", "Verejná odpoveď", "Nyilvános válasz")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setReplyTab("internal")}
                          className={`px-3 py-1 rounded-lg text-micro font-bold flex items-center gap-1 cursor-pointer ${
                            replyTab === "internal"
                              ? "bg-amber-500 text-white shadow-2xs"
                              : "text-slate-500"
                          }`}
                        >
                          <Lock className="w-3 h-3" />
                          <span>{t("Internal Note", "Interná poznámka", "Belső jegyzet")}</span>
                        </button>
                      </div>

                      {/* Canned Reply Template Picker */}
                      {(ticketSettings.cannedResponses || []).length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            const tpl = (ticketSettings.cannedResponses || []).find(
                              (c) => c.id === e.target.value,
                            );
                            if (tpl) {
                              setReplyBody((prev) => (prev ? `${prev}\n\n${tpl.body}` : tpl.body));
                            }
                          }}
                          className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-micro font-bold text-slate-600"
                        >
                          <option value="">
                            {t("+ Insert Template...", "+ Vložiť šablónu...", "+ Sablon beszúrása...")}
                          </option>
                          {(ticketSettings.cannedResponses || []).map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>
                              {tpl.title}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      rows={3}
                      placeholder={
                        replyTab === "internal"
                          ? t(
                              "Write an internal note visible only to team members...",
                              "Napíšte internú poznámku viditeľnú iba pre tím...",
                              "Írjon csak a csapat számára látható belső jegyzetet...",
                            )
                          : t(
                              "Write a reply to the client...",
                              "Napíšte odpoveď klientovi...",
                              "Írjon választ az ügyfélnek...",
                            )
                      }
                      className={`w-full p-3 rounded-xl border text-caption resize-none ${
                        replyTab === "internal"
                          ? "bg-amber-50/60 border-amber-300 focus:border-amber-500"
                          : "bg-white border-slate-200 focus:border-indigo-500"
                      }`}
                    />

                    {replyAttachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {replyAttachments.map((att, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-micro font-bold text-slate-700"
                          >
                            {att.name}
                            <button
                              type="button"
                              onClick={() =>
                                setReplyAttachments((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="text-slate-400 hover:text-rose-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-micro font-bold text-slate-600 cursor-pointer">
                          <FileText className="w-3.5 h-3.5" />
                          <span>
                            {isUploadingReplyFile
                              ? t("Uploading...", "Nahráva sa...", "Feltöltés...")
                              : t("Attach", "Príloha", "Melléklet")}
                          </span>
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadReplyAttachment(f);
                            }}
                          />
                        </label>

                        {replyTab === "public" && selectedTicket.reporterEmail && (
                          <label className="inline-flex items-center gap-1.5 text-micro font-semibold text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={sendViaEmail}
                              onChange={(e) => setSendViaEmail(e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600"
                            />
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            <span>{t("Send via email", "Odoslať aj e-mailom", "Küldés e-mailben is")}</span>
                          </label>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {replyTab === "public" && (
                          <button
                            type="button"
                            disabled={isSendingReply || !replyBody.trim()}
                            onClick={() => handleSendReply("resolved")}
                            className="px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-micro font-bold cursor-pointer disabled:opacity-40"
                          >
                            {t("Send & Resolve", "Odoslať a vyriešiť", "Küldés és megoldás")}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isSendingReply || !replyBody.trim()}
                          onClick={() => handleSendReply()}
                          className={`px-4 py-1.5 rounded-xl text-white text-caption font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 ${
                            replyTab === "internal"
                              ? "bg-amber-600 hover:bg-amber-700"
                              : "bg-indigo-600 hover:bg-indigo-700"
                          }`}
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>
                            {replyTab === "internal"
                              ? t("Save Note", "Uložiť poznámku", "Jegyzet mentése")
                              : t("Send Reply", "Odoslať odpoveď", "Válasz küldése")}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right 5 cols: Metadata, Project/Client links, Tasks, Time Tracking */}
              <div className="ws-md:col-span-5 p-4 space-y-4 bg-slate-50/40">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block type-overline text-slate-400 mb-1">
                      {t("Status", "Stav", "Állapot")}
                    </label>
                    <CustomSelect
                      value={selectedTicket.status}
                      onChange={(v) => updateSelectedTicket({ status: v })}
                      options={orderedStatuses.map((s) => ({
                        value: s.key || s.id,
                        label: ticketStatusLabel(s.key || s.id, userLanguage, ticketStatuses),
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block type-overline text-slate-400 mb-1">
                      {t("Priority", "Priorita", "Prioritás")}
                    </label>
                    <CustomSelect
                      value={selectedTicket.priority}
                      onChange={(v) => updateSelectedTicket({ priority: v as TicketPriority })}
                      options={[
                        { value: "low", label: t("Low", "Nízka", "Alacsony") },
                        { value: "normal", label: t("Normal", "Normálna", "Normál") },
                        { value: "high", label: t("High", "Vysoká", "Magas") },
                        { value: "urgent", label: t("Urgent", "Urgentná", "Sürgős") },
                      ]}
                    />
                  </div>
                </div>

                {/* Project Link */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="type-overline text-slate-400">
                      {t("Attached Project", "Priradený projekt", "Kapcsolt projekt")}
                    </label>
                    {selectedTicket.projectId && (
                      <a
                        href={`#projects/${selectedTicket.projectId}?tab=tickets`}
                        className="text-micro font-bold text-indigo-600 hover:underline flex items-center gap-0.5"
                      >
                        <span>{t("Open Project", "Otvoriť projekt", "Projekt megnyitása")}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <CustomSelect
                    value={selectedTicket.projectId || ""}
                    onChange={(projId) => {
                      const proj = projects.find((p) => p.id === projId);
                      const autoLeadId = proj?.leadId || proj?.clientId || selectedTicket.leadId || null;
                      updateSelectedTicket({
                        projectId: projId || null,
                        leadId: autoLeadId,
                        clientId: autoLeadId,
                      });
                    }}
                    options={[
                      { value: "", label: t("— No Project —", "— Žiadny projekt —", "— Nincs projekt —") },
                      ...projects.map((p) => ({
                        value: p.id,
                        label: getProjectName(p.id) || p.id,
                      })),
                    ]}
                  />
                </div>

                {/* Client Link (auto-shown from project or direct) */}
                {(() => {
                  const client = getClientForTicket(selectedTicket);
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="type-overline text-slate-400">
                          {t("Client", "Klient", "Ügyfél")}
                        </label>
                        {client && (
                          <a
                            href={`#client-${encodeURIComponent(client.name)}?tab=tickets`}
                            className="text-micro font-bold text-emerald-600 hover:underline flex items-center gap-0.5"
                          >
                            <span>{client.name}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <CustomSelect
                        value={selectedTicket.leadId || client?.id || ""}
                        onChange={(leadId) =>
                          updateSelectedTicket({
                            leadId: leadId || null,
                            clientId: leadId || null,
                          })
                        }
                        options={[
                          { value: "", label: t("— No Client —", "— Žiadny klient —", "— Nincs ügyfél —") },
                          ...leads.map((l) => ({ value: l.id, label: l.name })),
                        ]}
                      />
                    </div>
                  );
                })()}

                {/* Assigned Agent */}
                <div>
                  <label className="block type-overline text-slate-400 mb-1">
                    {t("Assigned Agent", "Priradený riešiteľ", "Felelős")}
                  </label>
                  <CustomSelect
                    value={selectedTicket.assignedUsers?.[0] || ""}
                    onChange={(uName) =>
                      updateSelectedTicket({ assignedUsers: uName ? [uName] : [] })
                    }
                    options={[
                      { value: "", label: t("Unassigned", "Nepriradené", "Nincs felelős") },
                      ...users.map((u) => ({ value: u.name, label: u.name })),
                    ]}
                  />
                </div>

                {/* Linked CRM Tasks (Dev Escalation) */}
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="type-overline text-slate-500 flex items-center gap-1">
                      <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                      {t("Linked CRM Tasks", "Prepojené úlohy", "Kapcsolt feladatok")}
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
                        {t("+ Create Task", "+ Vytvoriť úlohu", "+ Feladat létrehozása")}
                      </button>
                    )}
                  </div>

                  {showTaskForm && (
                    <form
                      onSubmit={handleCreateTaskFromTicket}
                      className="p-2.5 rounded-xl bg-white border border-indigo-200 space-y-2"
                    >
                      <input
                        type="text"
                        required
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder={t("Task title...", "Názov úlohy...", "Feladat címe...")}
                        className="w-full h-8 px-2.5 rounded-lg border border-slate-200 text-caption font-semibold"
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={newTaskAssignee}
                          onChange={(e) => setNewTaskAssignee(e.target.value)}
                          className="flex-1 h-8 px-2 rounded-lg border border-slate-200 text-micro font-semibold"
                        >
                          {users.map((u) => (
                            <option key={u.id} value={u.name}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="px-3 h-8 rounded-lg bg-indigo-600 text-white text-micro font-bold cursor-pointer"
                        >
                          {t("Create", "Vytvoriť", "Létrehozás")}
                        </button>
                      </div>
                      <p className="text-micro text-slate-400">
                        {t(
                          "Completing this task in Tasks automatically marks the ticket Resolved.",
                          "Dokončenie tejto úlohy automaticky označí tiket ako Vyriešený.",
                          "A feladat befejezése automatikusan Megoldottnak jelöli a jegyet.",
                        )}
                      </p>
                    </form>
                  )}

                  {(selectedTicket.taskLinks || []).length === 0 ? (
                    <div className="text-micro text-slate-400">
                      {t("No linked tasks yet.", "Zatiaľ žiadne prepojené úlohy.", "Még nincs kapcsolt feladat.")}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {(selectedTicket.taskLinks || []).map((link) => {
                        const tsk = tasks.find((tItem) => tItem.id === link.taskId);
                        const done = tsk ? isDoneTaskState(tsk.status, taskStates) : false;
                        return (
                          <div
                            key={link.id}
                            onClick={() => {
                              window.location.hash = "tasks";
                            }}
                            className="p-2 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2 text-micro cursor-pointer hover:border-indigo-300"
                          >
                            <span
                              className={`font-bold truncate ${
                                done ? "line-through text-slate-400" : "text-slate-700"
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
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="type-overline text-slate-500 flex items-center gap-1">
                      <Timer className="w-3.5 h-3.5 text-emerald-600" />
                      {t("Time Logged", "Zaznamenaný čas", "Rögzített idő")}
                    </span>
                    <span className="text-micro font-bold text-slate-700">
                      {formatDurationMinutes(
                        (selectedTicket.timeEntries || []).reduce((acc, e) => acc + e.minutes, 0),
                      )}
                    </span>
                  </div>

                  {canEdit && (
                    <form onSubmit={handleLogTime} className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        value={logMinutes}
                        onChange={(e) => setLogMinutes(e.target.value)}
                        className="w-16 h-8 px-2 rounded-lg border border-slate-200 bg-white text-micro font-bold"
                        placeholder="min"
                      />
                      <input
                        type="text"
                        value={logDesc}
                        onChange={(e) => setLogDesc(e.target.value)}
                        placeholder={t("Work note...", "Poznámka...", "Megjegyzés...")}
                        className="flex-1 h-8 px-2 rounded-lg border border-slate-200 bg-white text-micro"
                      />
                      <button
                        type="submit"
                        className="px-2.5 h-8 rounded-lg bg-emerald-600 text-white text-micro font-bold cursor-pointer"
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
                          className="flex items-center justify-between text-micro text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-100"
                        >
                          <span className="truncate">
                            <strong>{formatDurationMinutes(te.minutes)}</strong> • {te.userName}{" "}
                            {te.description ? `— ${te.description}` : ""}
                          </span>
                          <span className="text-slate-400 shrink-0">
                            {String(te.loggedAt || "").slice(5, 10)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-title-sm text-slate-900">
                {t("Create Support Ticket", "Vytvoriť podporný tiket", "Támogatási jegy létrehozása")}
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-3">
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

              <div className="grid grid-cols-2 gap-3">
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
                    <option value="">{t("— Select Project —", "— Vybrať projekt —", "— Projekt választása —")}</option>
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
                    <option value="">{t("— Auto / Select Client —", "— Automaticky / Klient —", "— Automatikus / Ügyfél —")}</option>
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
                    onChange={(e) => setNewPriority(e.target.value as TicketPriority)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-caption font-semibold bg-white"
                  >
                    <option value="low">{t("Low", "Nízka", "Alacsony")}</option>
                    <option value="normal">{t("Normal", "Normálna", "Normál")}</option>
                    <option value="high">{t("High", "Vysoká", "Magas")}</option>
                    <option value="urgent">{t("Urgent", "Urgentná", "Sürgős")}</option>
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
                    <option value="request">Feature Request</option>
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
                    <option value="">{t("Unassigned", "Nepriradené", "Nincs felelős")}</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.name}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                    {t("Reporter Email", "E-mail hlásateľa", "Bejelentő e-mail")}
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
                  {t("Description", "Popis", "Leírás")}
                </label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 text-caption resize-none"
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
                  placeholder={t("Contract name...", "Názov paušálu...", "Szerződés neve...")}
                  className="ws-sm:col-span-2 h-9 px-3 rounded-xl border border-slate-200 bg-white text-caption font-semibold"
                />
                <select
                  value={contractProjectId}
                  onChange={(e) => setContractProjectId(e.target.value)}
                  className="h-9 px-2.5 rounded-xl border border-slate-200 bg-white text-caption font-semibold"
                >
                  <option value="">{t("Any Project", "Ľubovoľný projekt", "Bármely projekt")}</option>
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
                    onChange={(e) => setContractHours(Number(e.target.value) || 10)}
                    className="w-20 h-9 px-2.5 rounded-xl border border-slate-200 bg-white text-caption font-bold"
                    title={t("Monthly hours", "Hodiny mesačne", "Havi óraszám")}
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
                  const inc = c.monthlyHoursIncluded || c.monthlyHours || 0;
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
                          <div className="font-bold text-ui text-slate-800">{c.name}</div>
                          <div className="text-micro text-slate-500">
                            {getProjectName(c.projectId) || t("General Retainer", "Všeobecný paušál", "Általános átalány")} •{" "}
                            {used} / {inc} h ({pct}%)
                          </div>
                        </div>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() =>
                              setSupportContracts((prev) => prev.filter((item) => item.id !== c.id))
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
                            pct >= 90 ? "bg-rose-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500"
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
