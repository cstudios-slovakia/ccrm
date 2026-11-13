import React, { useState } from "react";
import { Plus, Ticket as TicketIcon, ArrowUpRight } from "lucide-react";
import type {
  Lead,
  Project,
  Task,
  Ticket,
  TicketPriority,
  TicketStatusDef,
  UserProfile,
} from "../../types";
import type { Language } from "../../utils/translations";
import type { AgencyWorkerDetailPayload } from "../../types/agency";
import type { TaskAccess } from "../../utils/taskSelectors";
import { localDateStr, localStampStr } from "../../utils/projectTasks";
import { EntityTasksPanel } from "../EntityTasksPanel";

interface WorkerTasksTicketsTabProps {
  detail: AgencyWorkerDetailPayload;
  lang: Language;
  currentUser?: UserProfile;
  leads: Lead[];
  projects: Project[];
  users: UserProfile[];
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  taskStates: string[];
  taskStateColors?: Record<string, string>;
  taskAccess: TaskAccess;
  tickets: Ticket[];
  setTickets: React.Dispatch<React.SetStateAction<Ticket[]>>;
  ticketStatuses?: TicketStatusDef[];
  mailConfigured?: boolean;
  onNavigate: (route: string) => void;
}

export const WorkerTasksTicketsTab: React.FC<WorkerTasksTicketsTabProps> = ({
  detail,
  lang,
  currentUser,
  leads,
  projects,
  users,
  tasks,
  setTasks,
  taskStates,
  taskStateColors,
  taskAccess,
  tickets,
  setTickets,
  ticketStatuses = [],
  mailConfigured,
  onNavigate,
}) => {
  const t = (en: string, sk: string, hu: string) =>
    lang === "sk" ? sk : lang === "hu" ? hu : en;

  const activePlacement = detail.placements.find((p) => p.status === "active");
  const companyClientId = activePlacement?.companyClientId || undefined;
  const workerTickets = tickets.filter((tk) => tk.agencyWorkerId === detail.worker.id);

  const [addingTicket, setAddingTicket] = useState(false);
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [description, setDescription] = useState("");

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    const nowStamp = localStampStr(new Date());
    const ticketId = `tkt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const maxNum = tickets.reduce((acc, tk) => {
      const m = String(tk.ticketNumber || "").match(/(\d+)$/);
      return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
    }, 100);
    const ticketNumber = `TCK-${String(maxNum + 1).padStart(3, "0")}`;
    const defaultStatus = ticketStatuses[0]?.key || ticketStatuses[0]?.id || "new";
    const assignee = currentUser?.name || users[0]?.name || "";

    const created: Ticket = {
      id: ticketId,
      ticketNumber,
      subject: subject.trim(),
      title: subject.trim(),
      description: description.trim(),
      status: defaultStatus,
      priority,
      type: "question",
      source: "manual",
      channel: "manual",
      projectId: null,
      leadId: companyClientId || null,
      clientId: companyClientId || null,
      agencyWorkerId: detail.worker.id,
      reporterName: detail.worker.fullName,
      reporterEmail: detail.worker.email || "",
      reporterPhone: detail.worker.phone || "",
      assignedUser: assignee || null,
      assignedUsers: assignee ? [assignee] : [],
      createdAt: `${localDateStr(new Date())} ${nowStamp.slice(11, 16)}:00`,
      updatedAt: `${localDateStr(new Date())} ${nowStamp.slice(11, 16)}:00`,
      archived: false,
      messages: description.trim()
        ? [
            {
              id: `tmsg-${Date.now()}`,
              ticketId,
              authorType: "agent",
              authorName: currentUser?.name || "Support",
              authorEmail: currentUser?.email || "",
              body: description.trim(),
              isInternal: false,
              eventType: "ticket_created",
              createdAt: `${localDateStr(new Date())} ${nowStamp.slice(11, 16)}:00`,
            },
          ]
        : [],
      taskLinks: [],
      timeEntries: [],
    };

    setTickets((prev) => [created, ...prev]);
    setSubject("");
    setDescription("");
    setPriority("normal");
    setAddingTicket(false);
    (window as unknown as { showToast?: (m: string, type?: string) => void }).showToast?.(
      t("Support ticket created", "Podporný tiket vytvorený", "Támogatási jegy létrehozva"),
      "success"
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="worker-tasks-tickets-tab">
      <div className="glass-panel rounded-2xl p-4">
        <EntityTasksPanel
          entityType="agency_worker"
          entityId={detail.worker.id}
          entityName={detail.worker.fullName}
          tasks={tasks}
          setTasks={setTasks}
          projects={projects}
          leads={leads}
          users={users}
          userLanguage={lang}
          taskStates={taskStates}
          taskStateColors={taskStateColors}
          taskAccess={taskAccess}
          currentUser={currentUser}
          mailConfigured={mailConfigured}
          relatedAgencyWorkerId={detail.worker.id}
          relatedLeadId={companyClientId}
          agencyEnabled
        />
      </div>

      <div className="glass-panel rounded-2xl p-4 space-y-3" data-testid="worker-tickets-panel">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TicketIcon className="size-4 text-indigo-600" />
            <h3 className="text-body font-bold text-slate-900">
              {t("Support Tickets", "Podporné tikety", "Támogatási jegyek")} ({workerTickets.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setAddingTicket((v) => !v)}
            data-testid="worker-new-ticket-btn"
            className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-caption font-semibold inline-flex items-center gap-1 hover:bg-indigo-700 cursor-pointer"
          >
            <Plus className="size-3.5" />
            <span>{t("New Support Ticket", "Nový podporný tiket", "Új támogatási jegy")}</span>
          </button>
        </div>

        {addingTicket && (
          <form onSubmit={handleCreateTicket} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div>
              <label className="block type-overline text-slate-500 mb-1">
                {t("Subject", "Predmet", "Tárgy")}
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                data-testid="worker-ticket-subject"
                placeholder={t("e.g. Residence permit renewal check", "napr. Kontrola obnovenia pobytu", "pl. Tartózkodási engedély hosszabbítás")}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-ui"
              />
            </div>
            <div>
              <label className="block type-overline text-slate-500 mb-1">
                {t("Priority", "Priorita", "Prioritás")}
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-ui"
              >
                <option value="low">{t("Low", "Nízka", "Alacsony")}</option>
                <option value="normal">{t("Normal", "Normálna", "Normál")}</option>
                <option value="high">{t("High", "Vysoká", "Magas")}</option>
                <option value="urgent">{t("Urgent", "Urgentná", "Sürgős")}</option>
              </select>
            </div>
            <div>
              <label className="block type-overline text-slate-500 mb-1">
                {t("Details", "Popis", "Leírás")}
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-ui"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddingTicket(false)}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-caption font-semibold text-slate-600 cursor-pointer"
              >
                {t("Cancel", "Zrušiť", "Mégse")}
              </button>
              <button
                type="submit"
                data-testid="worker-ticket-submit"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-caption font-semibold hover:bg-indigo-700 cursor-pointer"
              >
                {t("Create Ticket", "Vytvoriť tiket", "Jegy létrehozása")}
              </button>
            </div>
          </form>
        )}

        {workerTickets.length === 0 ? (
          <div className="py-8 text-center text-caption text-slate-400">
            {t("No support tickets linked to this worker yet.", "K tomuto pracovníkovi zatiaľ nie sú priradené žiadne tikety.", "Ehhez a dolgozóhoz még nincs támogatási jegy.")}
          </div>
        ) : (
          <div className="space-y-2">
            {workerTickets.map((tk) => (
              <button
                key={tk.id}
                type="button"
                onClick={() => onNavigate(`tickets/${encodeURIComponent(tk.id)}`)}
                data-testid={`worker-ticket-row-${tk.id}`}
                className="w-full text-left p-3 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 transition-colors flex items-center justify-between gap-2 cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-micro font-bold text-indigo-600">{tk.ticketNumber}</span>
                    <span className="text-ui font-semibold text-slate-900 truncate">{tk.subject || tk.title}</span>
                  </div>
                  <div className="text-micro text-slate-500 flex items-center gap-2 mt-0.5">
                    <span className="uppercase font-bold">{tk.status}</span>
                    <span>·</span>
                    <span>{tk.priority}</span>
                  </div>
                </div>
                <ArrowUpRight className="size-4 text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
