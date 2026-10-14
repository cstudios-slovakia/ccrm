import React, { useState } from "react";
import {
  Ticket as TicketIcon,
  Plus,
  Code2,
  Globe,
  Mail,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  ShieldCheck,
  MessageSquare,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Minus,
  Flame,
  Bug,
  HelpCircle,
  Sparkles,
  AlertTriangle,
  CreditCard,
  Clock,
  CalendarClock,
} from "lucide-react";
import type {
  Project,
  ProjectRetainerConfig,
  ProjectType,
  SupportContract,
  Ticket,
  TicketAttachment,
  TicketPriority,
  TicketStatusDef,
  TicketType,
  TicketSettingsConfig,
  UserProfile,
} from "../types";
import type { Language } from "../utils/translations";
import {
  clampRetainerResetDay,
  computeProjectRetainerUsage,
  computeTicketSlaDueDates,
  evaluateTicketSla,
  formatDurationMinutes,
  getTicketStatusLabel,
  nextTicketNumber,
  resolveProjectRetainer,
} from "./../utils/tickets";
import { CustomSelect } from "./ui/CustomSelect";
import { TicketRichHtmlEditor, isImageAttachment } from "./ui/TicketRichHtmlEditor";

interface ProjectTicketsPanelProps {
  project: Project;
  projectType?: ProjectType | null;
  onUpdateProject: (patch: Partial<Project>) => void;
  tickets: Ticket[];
  setTickets?: React.Dispatch<React.SetStateAction<Ticket[]>>;
  ticketStatuses: TicketStatusDef[];
  ticketSettings: TicketSettingsConfig;
  supportContracts?: SupportContract[];
  setSupportContracts?: React.Dispatch<React.SetStateAction<SupportContract[]>>;
  currencyCode?: string | null;
  users?: UserProfile[];
  currentUser?: UserProfile | null;
  userLanguage?: Language;
  canEdit?: boolean;
  currentUserName?: string;
  onOpenTicket?: (ticketId: string) => void;
}

export const ProjectTicketsPanel: React.FC<ProjectTicketsPanelProps> = ({
  project,
  onUpdateProject,
  tickets,
  setTickets,
  ticketStatuses,
  ticketSettings,
  supportContracts = [],
  setSupportContracts,
  currencyCode = "EUR",
  userLanguage = "sk",
  canEdit = true,
  currentUserName = "Admin",
  onOpenTicket,
}) => {
  const tr = (sk: string, en: string, hu: string) =>
    userLanguage === "en" ? en : userLanguage === "hu" ? hu : sk;

  const [subView, setSubView] = useState<"tickets" | "retainer" | "widget">("tickets");
  const [domainDraft, setDomainDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false);

  // Quick create ticket form
  const [showNewModal, setShowNewModal] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAttachments, setNewAttachments] = useState<TicketAttachment[]>([]);
  const [newPriority, setNewPriority] = useState<TicketPriority>("normal");
  const [newType, setNewType] = useState<TicketType>("bug");

  const projectTickets = tickets.filter(
    (t) => t.projectId === project.id && !t.isArchived && !t.archived,
  );

  const allowedDomains = project.ticketAllowedDomains || [];
  const allowedEmails = project.ticketAllowedEmails || [];
  const widgetCfg = project.ticketWidgetConfig || {};

  const retainerCfg = resolveProjectRetainer(project, supportContracts);
  const retainerUsage = computeProjectRetainerUsage(
    project,
    tickets,
    supportContracts,
  );

  const handleUpdateRetainer = (patch: Partial<ProjectRetainerConfig>) => {
    if (!canEdit) return;
    const nextRetainer: ProjectRetainerConfig = {
      ...retainerCfg,
      ...patch,
      monthlyHours: Math.max(
        0,
        Number(
          patch.monthlyHours !== undefined
            ? patch.monthlyHours
            : retainerCfg.monthlyHours,
        ) || 0,
      ),
      resetDay: clampRetainerResetDay(
        patch.resetDay !== undefined ? patch.resetDay : retainerCfg.resetDay,
      ),
      currency: patch.currency || retainerCfg.currency || currencyCode || "EUR",
    };

    onUpdateProject({
      ticketRetainer: nextRetainer,
      ticketWidgetConfig: {
        ...widgetCfg,
        retainer: nextRetainer,
      },
    });

    if (setSupportContracts) {
      setSupportContracts((prev) => {
        const existingIdx = prev.findIndex((c) => c.projectId === project.id);
        if (!nextRetainer.enabled) {
          return existingIdx >= 0
            ? prev.filter((c) => c.projectId !== project.id)
            : prev;
        }
        const contractName =
          nextRetainer.name?.trim() ||
          `${project.name || project.id} — ${tr("Mesačný paušál", "Monthly Retainer", "Havi átalány")}`;
        const updatedContract: SupportContract = {
          ...(existingIdx >= 0 ? prev[existingIdx] : { id: `sc-${project.id}` }),
          projectId: project.id,
          leadId: project.leadId || project.clientId || null,
          clientId: project.leadId || project.clientId || null,
          name: contractName,
          monthlyHours: nextRetainer.monthlyHours,
          monthlyHoursIncluded: nextRetainer.monthlyHours,
          resetDay: nextRetainer.resetDay,
          overageRate: nextRetainer.overageRate ?? 65,
          hourlyOverageRate: nextRetainer.overageRate ?? 65,
          hourlyRate: nextRetainer.overageRate ?? 65,
          currency: nextRetainer.currency || currencyCode || "EUR",
          slaTier: nextRetainer.slaTier || "standard",
          tier: nextRetainer.slaTier || "standard",
          active: true,
          isActive: true,
        };
        if (existingIdx >= 0) {
          const copy = [...prev];
          copy[existingIdx] = updatedContract;
          return copy;
        }
        return [updatedContract, ...prev];
      });
    }
  };

  const publicHash =
    project.ticketPublicHash ||
    `pub_${project.id.replace(/[^a-zA-Z0-9]/g, "")}_status`;

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://crm.local";
  const pathname =
    typeof window !== "undefined"
      ? window.location.pathname.replace(/\/+$/, "")
      : "";
  const baseUrl = `${origin}${pathname}`;
  const widgetScriptUrl = `${baseUrl}/api/ticket_widget.php?project=${encodeURIComponent(project.id)}`;
  const embedCode = `<!-- Koperniq Floating Support Widget (${project.name || project.id}) -->\n<script src="${widgetScriptUrl}" async></script>`;
  const publicStatusUrl = `${baseUrl}/#public-tickets/${encodeURIComponent(publicHash)}`;

  const handleAddDomain = () => {
    if (!canEdit) return;
    const clean = domainDraft
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!clean || allowedDomains.includes(clean)) {
      setDomainDraft("");
      return;
    }
    onUpdateProject({
      ticketAllowedDomains: [...allowedDomains, clean],
      ticketWidgetEnabled: true,
    });
    setDomainDraft("");
  };

  const handleRemoveDomain = (dom: string) => {
    if (!canEdit) return;
    onUpdateProject({
      ticketAllowedDomains: allowedDomains.filter((d) => d !== dom),
    });
  };

  const handleAddEmail = () => {
    if (!canEdit) return;
    const clean = emailDraft.trim().toLowerCase();
    if (!clean || allowedEmails.includes(clean)) {
      setEmailDraft("");
      return;
    }
    onUpdateProject({
      ticketAllowedEmails: [...allowedEmails, clean],
    });
    setEmailDraft("");
  };

  const handleRemoveEmail = (em: string) => {
    if (!canEdit) return;
    onUpdateProject({
      ticketAllowedEmails: allowedEmails.filter((e) => e !== em),
    });
  };

  const handleRegenerateHash = () => {
    if (!canEdit) return;
    const bytes = new Uint8Array(16);
    if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    }
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    onUpdateProject({
      ticketPublicHash: hex || `hash_${Date.now().toString(36)}`,
    });
  };

  const handleCreateQuickTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !setTickets || !newSubject.trim()) return;
    const nowStr = new Date().toISOString().replace("T", " ").slice(0, 19);
    const tckNum = nextTicketNumber(tickets);
    const sla = computeTicketSlaDueDates(newPriority, ticketSettings);
    const tckId = `tck-${Date.now().toString(36)}`;
    const firstImg = newAttachments.find(isImageAttachment);
    const newTicket: Ticket = {
      id: tckId,
      ticketNumber: tckNum,
      subject: newSubject.trim(),
      description: newDesc.trim() || null,
      status: ticketStatuses[0]?.id || "new",
      priority: newPriority,
      type: newType,
      channel: "manual",
      source: "manual",
      projectId: project.id,
      leadId: project.leadId || project.clientId || null,
      clientId: project.leadId || project.clientId || null,
      assignedUser: currentUserName,
      assignedUsers: [currentUserName],
      tags: [],
      slaFirstResponseDueAt: sla.firstResponseDueAt,
      firstResponseDueAt: sla.firstResponseDueAt,
      slaResolutionDueAt: sla.resolutionDueAt,
      resolutionDueAt: sla.resolutionDueAt,
      slaPausedTotalSeconds: 0,
      billable: true,
      loggedMinutes: 0,
      screenshotPath: firstImg ? firstImg.path || firstImg.url || firstImg.dataUrl || null : null,
      attachments: newAttachments,
      createdAt: nowStr,
      updatedAt: nowStr,
      messages: [
        {
          id: `tmsg-${Date.now().toString(36)}`,
          ticketId: tckId,
          authorType: "agent",
          authorName: currentUserName,
          isInternal: false,
          body: newDesc.trim() || newSubject.trim(),
          attachments: newAttachments,
          createdAt: nowStr,
        },
      ],
      taskLinks: [],
      timeEntries: [],
    };
    setTickets((prev) => [newTicket, ...prev]);
    setNewSubject("");
    setNewDesc("");
    setNewAttachments([]);
    setShowNewModal(false);
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation between Project Tickets, Monthly Retainer, and Widget Settings */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubView("tickets")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-caption font-bold transition-colors cursor-pointer ${
              subView === "tickets"
                ? "bg-orange-500 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <TicketIcon className="w-4 h-4" />
            <span>
              {tr("Tikety projektu", "Project Tickets", "Projekt jegyek")} (
              {projectTickets.length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSubView("retainer")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-caption font-bold transition-colors cursor-pointer ${
              subView === "retainer"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>
              {tr(
                "Mesačný paušál (Retainer)",
                "Monthly Retainer",
                "Havi átalány (Retainer)",
              )}
            </span>
            {retainerUsage.enabled && (
              <span
                className={`px-1.5 py-0.5 rounded-md text-micro font-mono font-bold ${
                  subView === "retainer"
                    ? "bg-white/20 text-white"
                    : retainerUsage.rawPercent >= 90
                      ? "bg-rose-500/15 text-rose-600"
                      : retainerUsage.rawPercent >= 75
                        ? "bg-amber-500/15 text-amber-600"
                        : "bg-emerald-500/15 text-emerald-600"
                }`}
              >
                {formatDurationMinutes(retainerUsage.usedMinutes)} /{" "}
                {formatDurationMinutes(retainerUsage.monthlyMinutes)}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSubView("widget")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-caption font-bold transition-colors cursor-pointer ${
              subView === "widget"
                ? "bg-orange-500 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span>
              {tr(
                "Nastavenia HTML Widgetu & Whitelist",
                "HTML Widget Settings & Whitelist",
                "HTML Widget & Whitelist beállítások",
              )}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={publicStatusUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-caption font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink className="w-3.5 h-3.5 text-orange-500" />
            {tr("Verejný stav tiketov", "Public Status Board", "Nyilvános státusz oldal")}
          </a>
          {canEdit && setTickets && (
            <button
              type="button"
              onClick={() => setShowNewModal((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-caption font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {tr("Nový tiket", "New Ticket", "Új jegy")}
            </button>
          )}
        </div>
      </div>

      {/* Quick Create Ticket Inline Form */}
      {showNewModal && (
        <form
          onSubmit={handleCreateQuickTicket}
          className="p-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 space-y-3"
        >
          <div className="text-caption font-bold text-slate-900">
            {tr(
              "Vytvoriť tiket pre tento projekt",
              "Create Ticket for this Project",
              "Jegy létrehozása ehhez a projekthez",
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="text"
              required
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder={tr("Predmet tiketu *", "Ticket Subject *", "Jegy tárgya *")}
              className="md:col-span-2 px-3 py-2 text-caption rounded-xl border border-slate-200 bg-white text-slate-900"
            />
            <CustomSelect
              value={newType}
              onChange={(v) => setNewType(v as TicketType)}
              options={[
                {
                  value: "bug",
                  label: tr("Chyba / Bug", "Bug / Error", "Hiba / Bug"),
                  icon: <Bug className="h-3.5 w-3.5 text-rose-500 shrink-0" />,
                },
                {
                  value: "question",
                  label: tr("Otázka", "Question", "Kérdés"),
                  icon: <HelpCircle className="h-3.5 w-3.5 text-sky-500 shrink-0" />,
                },
                {
                  value: "feature_request",
                  label: tr("Požiadavka na funkciu", "Feature Request", "Fejlesztési kérés"),
                  icon: <Sparkles className="h-3.5 w-3.5 text-purple-500 shrink-0" />,
                },
                {
                  value: "incident",
                  label: tr("Výpadok / Incident", "Incident", "Incidens"),
                  icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />,
                },
                {
                  value: "billing",
                  label: tr("Fakturácia", "Billing", "Számlázás"),
                  icon: <CreditCard className="h-3.5 w-3.5 text-emerald-500 shrink-0" />,
                },
              ]}
            />
            <CustomSelect
              value={newPriority}
              onChange={(v) => setNewPriority(v as TicketPriority)}
              options={[
                {
                  value: "low",
                  label: tr("Nízka priorita", "Low Priority", "Alacsony"),
                  icon: <ArrowDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />,
                },
                {
                  value: "normal",
                  label: tr("Normálna priorita", "Normal Priority", "Normál"),
                  icon: <Minus className="h-3.5 w-3.5 text-sky-500 shrink-0" />,
                },
                {
                  value: "high",
                  label: tr("Vysoká priorita", "High Priority", "Magas"),
                  icon: <ArrowUp className="h-3.5 w-3.5 text-amber-500 shrink-0" />,
                },
                {
                  value: "critical",
                  label: tr("Kritická priorita", "Critical Priority", "Kritikus"),
                  icon: <Flame className="h-3.5 w-3.5 text-rose-600 shrink-0" />,
                },
              ]}
            />
          </div>
          <div>
            <label className="block type-overline text-slate-500 mb-1">
              {tr("Popis (HTML formátovanie, obrázky a súbory)", "Description (HTML formatting, images & files)", "Leírás (HTML formázás, képek és fájlok)")}
            </label>
            <TicketRichHtmlEditor
              value={newDesc}
              onChange={setNewDesc}
              attachments={newAttachments}
              onAttachmentsChange={setNewAttachments}
              userLanguage={userLanguage}
              placeholder={tr(
                "Podrobný popis problému (môžete prilepiť aj screenshot zo schránky)...",
                "Detailed description (you can also paste screenshots or drop files)...",
                "Részletes leírás (képernyőképet is beilleszthet vagy fájlokat csatolhat)...",
              )}
              minRows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewModal(false)}
              className="px-3 py-1.5 rounded-xl text-caption font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            >
              {tr("Zrušiť", "Cancel", "Mégse")}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl text-caption font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {tr("Vytvoriť tiket", "Create Ticket", "Létrehozás")}
            </button>
          </div>
        </form>
      )}

      {subView === "tickets" ? (
        <div className="space-y-3">
          {/* Project Monthly Retainer Status Strip */}
          {retainerUsage.enabled ? (
            <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-caption font-bold text-slate-900">
                        {retainerUsage.name ||
                          tr(
                            "Mesačný servisný paušál",
                            "Monthly Support Retainer",
                            "Havi támogatási átalány",
                          )}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-micro font-semibold bg-slate-100 text-slate-600 inline-flex items-center gap-1">
                        <CalendarClock className="w-3 h-3 text-emerald-600" />
                        {tr(
                          `Reset: ${retainerUsage.resetDay}. deň v mesiaci (${retainerUsage.periodStart} → ${retainerUsage.nextResetDate})`,
                          `Resets on day ${retainerUsage.resetDay} of month (${retainerUsage.periodStart} → ${retainerUsage.nextResetDate})`,
                          `Nullázódás: hó ${retainerUsage.resetDay}. napján (${retainerUsage.periodStart} → ${retainerUsage.nextResetDate})`,
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-ui font-extrabold font-mono text-slate-900">
                      {formatDurationMinutes(retainerUsage.usedMinutes)}
                    </span>
                    <span className="text-caption text-slate-500 font-mono">
                      {" "}
                      / {formatDurationMinutes(retainerUsage.monthlyMinutes)} h (
                      {retainerUsage.rawPercent}%)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubView("retainer")}
                    className="px-2.5 py-1 rounded-lg text-micro font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    {tr("Upraviť paušál", "Configure", "Beállítás")}
                  </button>
                </div>
              </div>

              <div className="h-2 rounded-full bg-slate-200/70 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    retainerUsage.rawPercent >= 90
                      ? "bg-rose-500"
                      : retainerUsage.rawPercent >= 75
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                  style={{ width: `${retainerUsage.percent}%` }}
                />
              </div>
            </div>
          ) : (
            canEdit && (
              <div className="px-4 py-2.5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-caption text-slate-500">
                  <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>
                    {tr(
                      "Pre tento projekt zatiaľ nie je zapnutý mesačný paušál (Retainer).",
                      "No monthly support retainer is configured for this project yet.",
                      "Ehhez a projekthez még nincs beállítva havi támogatási átalány (Retainer).",
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSubView("retainer")}
                  className="px-3 py-1 rounded-xl text-micro font-bold bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 cursor-pointer"
                >
                  +{" "}
                  {tr(
                    "Nastaviť paušál",
                    "Set Up Retainer",
                    "Átalány beállítása",
                  )}
                </button>
              </div>
            )
          )}

          {projectTickets.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-slate-200 bg-white/50 text-center space-y-2">
              <TicketIcon className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-ui font-semibold text-slate-700">
                {tr(
                  "Zatiaľ žiadne tikety pre tento projekt",
                  "No tickets for this project yet",
                  "Még nincsenek jegyek ehhez a projekthez",
                )}
              </div>
              <p className="text-caption text-slate-500 max-w-md mx-auto">
                {tr(
                  "Vytvorte tiket manuálne alebo prejdite na kartu Nastavenia HTML Widgetu a vložte plávajúci widget na web klienta.",
                  "Create a ticket manually or switch to HTML Widget Settings to embed the floating issue reporter on the client's site.",
                  "Hozzon létre jegyet manuálisan, vagy ágyazza be a lebegő HTML widgetet az ügyfél weboldalára.",
                )}
              </p>
            </div>
          ) : (
            projectTickets.map((tck) => {
              const stDef = ticketStatuses.find((s) => s.id === tck.status || s.key === tck.status);
              const sla = evaluateTicketSla(tck, ticketStatuses);
              return (
                <div
                  key={tck.id}
                  onClick={() => {
                    if (onOpenTicket) {
                      onOpenTicket(tck.id);
                    } else {
                      window.location.hash = `tickets/${encodeURIComponent(tck.id)}`;
                    }
                  }}
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-orange-500/50 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="px-2 py-1 rounded-lg text-micro font-mono font-bold bg-slate-100 text-slate-700">
                      {tck.ticketNumber}
                    </span>
                    <div className="min-w-0">
                      <div className="text-ui font-bold text-slate-900 truncate">
                        {tck.subject || tck.title}
                      </div>
                      <div className="flex items-center gap-2 text-micro text-slate-500">
                        <span>{tck.reporterName || tck.reporterEmail || "—"}</span>
                        <span>•</span>
                        <span className="uppercase">{tck.channel || tck.source}</span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {(tck.messages || []).length}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span
                      className={`px-2 py-0.5 rounded-md text-micro font-bold uppercase ${
                        tck.priority === "critical"
                          ? "bg-red-500/15 text-red-600"
                          : tck.priority === "high"
                            ? "bg-orange-500/15 text-orange-600"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {tck.priority}
                    </span>
                    <span
                      className="px-2.5 py-1 rounded-full text-micro font-bold"
                      style={{
                        backgroundColor: `${stDef?.color || "#3b82f6"}20`,
                        color: stDef?.color || "#3b82f6",
                      }}
                    >
                      {getTicketStatusLabel(stDef, userLanguage, tck.status)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-micro font-mono font-semibold ${
                        sla.status === "breached"
                          ? "bg-red-500/15 text-red-600"
                          : sla.status === "warning"
                            ? "bg-amber-500/15 text-amber-600"
                            : "text-slate-400"
                      }`}
                    >
                      {sla.label}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : subView === "retainer" ? (
        <div className="space-y-5">
          {/* Enable Monthly Retainer Banner */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-ui font-bold text-slate-900">
                  {tr(
                    "Mesačný servisný paušál a podpora projektu (Monthly Retainer)",
                    "Project Monthly Support Retainer & SLA Contract",
                    "Projekt havi támogatási átalány (Monthly Retainer)",
                  )}
                </h4>
                <p className="text-caption text-slate-500 max-w-2xl">
                  {tr(
                    "Nastavte počet predplatených hodín podpory mesačne a deň v mesiaci, kedy sa čerpanie paušálu automaticky vynuluje. Všetok zaznamenaný čas na tiketoch tohto projektu v aktuálnom období sa automaticky odpočítava z paušálu.",
                    "Configure the monthly prepaid support hours and the monthly reset day for this project. All billable time logged on this project's tickets within the active cycle is automatically counted against the retainer.",
                    "Állítsa be a projekt havi előre fizetett támogatási óráit és a havi nullázási napot. A projekt jegyein rögzített idő automatikusan levonódik az aktuális havi keretből.",
                  )}
                </p>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-caption font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(retainerCfg.enabled)}
                disabled={!canEdit}
                onChange={(e) =>
                  handleUpdateRetainer({ enabled: e.target.checked })
                }
                className="w-4 h-4 rounded accent-emerald-600"
              />
              <span>
                {tr(
                  "Mesačný paušál aktívny",
                  "Monthly Retainer Enabled",
                  "Havi átalány engedélyezve",
                )}
              </span>
            </label>
          </div>

          {/* Retainer Settings Grid */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
            <div className="text-caption font-bold text-slate-900 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-emerald-600" />
              <span>
                {tr(
                  "Parametre mesačného paušálu a deň resetovania",
                  "Retainer Parameters & Monthly Reset Day",
                  "Havi átalány paraméterei és nullázási napja",
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-micro font-semibold text-slate-500 mb-1">
                  {tr(
                    "Názov paušálu / Servisnej zmluvy",
                    "Retainer / Contract Name",
                    "Átalány / Szerződés megnevezése",
                  )}
                </label>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={retainerCfg.name || ""}
                  onChange={(e) =>
                    handleUpdateRetainer({
                      name: e.target.value,
                      enabled: true,
                    })
                  }
                  placeholder={tr(
                    "Napr. Prioritná podpora SLA Pro",
                    "E.g. Priority Web & SLA Care",
                    "Pl. Kiemelt SLA támogatás",
                  )}
                  className="w-full px-3 py-2 text-caption rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block text-micro font-semibold text-slate-500 mb-1">
                  {tr(
                    "Predplatené hodiny mesačne (h)",
                    "Monthly Included Hours (h)",
                    "Havi előre fizetett órák (óra)",
                  )}
                </label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  disabled={!canEdit}
                  value={retainerCfg.monthlyHours}
                  onChange={(e) =>
                    handleUpdateRetainer({
                      monthlyHours: Math.max(0, parseFloat(e.target.value) || 0),
                      enabled: true,
                    })
                  }
                  className="w-full px-3 py-2 text-caption rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-bold tabular-nums"
                />
              </div>

              <div>
                <label className="block text-micro font-semibold text-slate-500 mb-1">
                  {tr(
                    "Deň resetovania v mesiaci (1 – 31)",
                    "Reset Day of Month (1 – 31)",
                    "Havi nullázási nap (1 – 31)",
                  )}
                </label>
                <select
                  disabled={!canEdit}
                  value={retainerCfg.resetDay}
                  onChange={(e) =>
                    handleUpdateRetainer({
                      resetDay: clampRetainerResetDay(e.target.value),
                      enabled: true,
                    })
                  }
                  className="w-full px-3 py-2 text-caption rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-bold"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      {tr(
                        `${day}. deň v mesiaci`,
                        `Day ${day} of every month`,
                        `Minden hónap ${day}. napja`,
                      )}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-micro font-semibold text-slate-500 mb-1">
                  {tr(
                    `Sadzba nad rámec (${retainerUsage.currency}/h)`,
                    `Overage Rate (${retainerUsage.currency}/h)`,
                    `Túlóra díj (${retainerUsage.currency}/óra)`,
                  )}
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  disabled={!canEdit}
                  value={retainerCfg.overageRate ?? 65}
                  onChange={(e) =>
                    handleUpdateRetainer({
                      overageRate: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full px-3 py-2 text-caption rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-bold tabular-nums"
                />
              </div>

              <div>
                <label className="block text-micro font-semibold text-slate-500 mb-1">
                  {tr("Úroveň SLA", "SLA Tier", "SLA szint")}
                </label>
                <select
                  disabled={!canEdit}
                  value={retainerCfg.slaTier || "standard"}
                  onChange={(e) =>
                    handleUpdateRetainer({ slaTier: e.target.value })
                  }
                  className="w-full px-3 py-2 text-caption rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-semibold"
                >
                  <option value="standard">Standard</option>
                  <option value="priority">Priority / Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
            </div>
          </div>

          {/* Current Cycle Live Usage Summary */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span className="text-caption font-bold text-slate-900">
                  {tr(
                    "Čerpanie v aktuálnom zúčtovacom období",
                    "Current Retainer Cycle Usage",
                    "Aktuális időszak felhasználása",
                  )}
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-lg text-micro font-mono font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                {tr("Aktuálne obdobie", "Active Period", "Aktuális időszak")}:{" "}
                {retainerUsage.periodStart} → {retainerUsage.nextResetDate}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
                <span className="block text-micro text-slate-500">
                  {tr("Vyčerpané v období", "Used in Period", "Felhasználva")}
                </span>
                <span className="text-title-sm font-extrabold font-mono text-slate-900">
                  {formatDurationMinutes(retainerUsage.usedMinutes)} h
                </span>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
                <span className="block text-micro text-slate-500">
                  {tr("Mesačný limit", "Monthly Limit", "Havi keret")}
                </span>
                <span className="text-title-sm font-extrabold font-mono text-slate-900">
                  {formatDurationMinutes(retainerUsage.monthlyMinutes)} h
                </span>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
                <span className="block text-micro text-slate-500">
                  {retainerUsage.overageMinutes > 0
                    ? tr("Nad rámec paušálu", "Overage Time", "Kerettúllépés")
                    : tr("Zostáva v paušále", "Remaining Time", "Hátralévő keret")}
                </span>
                <span
                  className={`text-title-sm font-extrabold font-mono ${
                    retainerUsage.overageMinutes > 0
                      ? "text-rose-600"
                      : "text-emerald-600"
                  }`}
                >
                  {retainerUsage.overageMinutes > 0
                    ? `+${formatDurationMinutes(retainerUsage.overageMinutes)} h`
                    : `${formatDurationMinutes(retainerUsage.remainingMinutes)} h`}
                </span>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
                <span className="block text-micro text-slate-500">
                  {tr("Najbližší reset", "Next Reset Date", "Következő nullázás")}
                </span>
                <span className="text-ui font-extrabold font-mono text-slate-900 block mt-0.5">
                  {retainerUsage.nextResetDate}{" "}
                  <span className="text-micro font-semibold text-slate-500">
                    ({retainerUsage.resetDay}.)
                  </span>
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-micro font-bold text-slate-600">
                <span>
                  {tr("Využitie kapacity paušálu", "Retainer Capacity Used", "Kapacitás kihasználtsága")}
                </span>
                <span>{retainerUsage.rawPercent}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    retainerUsage.rawPercent >= 90
                      ? "bg-rose-500"
                      : retainerUsage.rawPercent >= 75
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                  style={{ width: `${retainerUsage.percent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Enable Widget Banner */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-ui font-bold text-slate-900">
                  {tr(
                    "Plávajúci HTML Support Widget (Privátny na povolených doménach)",
                    "Floating HTML Support Widget (Private to Whitelisted Domains)",
                    "Lebegő HTML Támogatási Widget (Csak engedélyezett domaineken)",
                  )}
                </h4>
                <p className="text-caption text-slate-500 max-w-2xl">
                  {tr(
                    "Widget nikdy nie je verejný — načíta sa a umožní odosielať tikety či odpovede na existujúce tikety výhradne na doménach uvedených vo whiteliste nižšie.",
                    "The widget is never public — it renders and allows submitting issues or following up on existing tickets strictly on the whitelisted domains below.",
                    "A widget soha nem nyilvános — kizárólag az alább engedélyezett domaineken töltődik be és engedélyezi a jegyek követését.",
                  )}
                </p>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-caption font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(project.ticketWidgetEnabled)}
                disabled={!canEdit}
                onChange={(e) =>
                  onUpdateProject({
                    ticketWidgetEnabled: e.target.checked,
                    ticketPublicHash: project.ticketPublicHash || publicHash,
                  })
                }
                className="w-4 h-4 rounded accent-orange-500"
              />
              <span>
                {tr("Widget aktívny", "Widget Enabled", "Widget engedélyezve")}
              </span>
            </label>
          </div>

          {/* Domain Whitelist & Email Whitelist Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Domain Whitelist */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-500" />
                <span className="text-caption font-bold text-slate-900">
                  {tr(
                    "Povolené domény pre HTML widget (Povinné)",
                    "Whitelisted Domains for HTML Widget (Required)",
                    "Engedélyezett domainek a HTML widgethez (Kötelező)",
                  )}
                </span>
              </div>
              <p className="text-micro text-slate-500">
                {tr(
                  "Napr. app.klient.sk, *.klient.sk alebo localhost. Bez povolenej domény sa widget nikomu nezobrazí.",
                  "E.g. app.client.sk, *.client.sk, or localhost. Without a whitelisted domain, the widget refuses to load.",
                  "Pl. app.ugyfel.hu, *.ugyfel.hu vagy localhost. Engedélyezett domain nélkül a widget nem töltődik be.",
                )}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {allowedDomains.length === 0 ? (
                  <span className="inline-flex items-center gap-1 text-micro text-amber-600 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {tr(
                      "Pridajte aspoň jednu doménu pre aktiváciu widgetu",
                      "Add at least one domain to activate the widget",
                      "Adjon hozzá legalább egy domaint a widget aktiválásához",
                    )}
                  </span>
                ) : (
                  allowedDomains.map((dom) => (
                    <span
                      key={dom}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-caption font-mono font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20"
                    >
                      <span>{dom}</span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDomain(dom)}
                          className="hover:text-red-500"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))
                )}
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={domainDraft}
                    onChange={(e) => setDomainDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddDomain();
                      }
                    }}
                    placeholder="app.klient.sk, *.klient.sk, localhost"
                    className="flex-1 px-3 py-1.5 text-caption rounded-xl border border-slate-200 bg-slate-50 text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={handleAddDomain}
                    className="px-3 py-1.5 rounded-xl text-caption font-bold bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {tr("Pridať", "Add", "Hozzáadás")}
                  </button>
                </div>
              )}
            </div>

            {/* Email Whitelist */}
            <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-emerald-500" />
                <span className="text-caption font-bold text-slate-900">
                  {tr(
                    "Povolené e-maily projektu (Whitelist odosielateľov)",
                    "Project Allowed Sender Emails (Optional Whitelist)",
                    "Engedélyezett küldő e-mail címek (Opcionális)",
                  )}
                </span>
              </div>
              <p className="text-micro text-slate-500">
                {tr(
                  "Ak nie je vybraný žiadny e-mail (prázdny zoznam), support tikety sa prijímajú bez obmedzenia. Môžete zadať konkrétny e-mail alebo @domena.sk.",
                  "If none is selected (empty list), support ticket requests are accepted verbatim. Add specific emails or @domain.com patterns to restrict.",
                  "Ha nincs megadva e-mail (üres lista), a rendszer minden bejövő támogatási jegyet elfogad.",
                )}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {allowedEmails.length === 0 ? (
                  <span className="text-micro text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-lg font-medium">
                    {tr(
                      "✓ Prázdny whitelist — prijímajú sa všetky support požiadavky",
                      "✓ Empty whitelist — all support requests accepted verbatim",
                      "✓ Üres whitelist — minden támogatási kérés elfogadva",
                    )}
                  </span>
                ) : (
                  allowedEmails.map((em) => (
                    <span
                      key={em}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-caption font-mono font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                    >
                      <span>{em}</span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleRemoveEmail(em)}
                          className="hover:text-red-500"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))
                )}
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddEmail();
                      }
                    }}
                    placeholder="klient@firma.sk alebo @firma.sk"
                    className="flex-1 px-3 py-1.5 text-caption rounded-xl border border-slate-200 bg-slate-50 text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={handleAddEmail}
                    className="px-3 py-1.5 rounded-xl text-caption font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {tr("Pridať", "Add", "Hozzáadás")}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Widget Customization */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
            <div className="text-caption font-bold text-slate-900">
              {tr("Vzhľad a správanie widgetu", "Widget Appearance & Behavior", "Widget megjelenése és működése")}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-micro text-slate-500 mb-1">
                  {tr("Farba tlačidla", "Primary Color", "Elsődleges szín")}
                </label>
                <input
                  type="color"
                  disabled={!canEdit}
                  value={widgetCfg.primaryColor || "#f97316"}
                  onChange={(e) =>
                    onUpdateProject({
                      ticketWidgetConfig: {
                        ...widgetCfg,
                        primaryColor: e.target.value,
                      },
                    })
                  }
                  className="w-full h-9 rounded-lg cursor-pointer border border-slate-200 bg-transparent"
                />
              </div>
              <div>
                <label className="block text-micro text-slate-500 mb-1">
                  {tr("Pozícia", "Position", "Pozíció")}
                </label>
                <select
                  disabled={!canEdit}
                  value={widgetCfg.position || "bottom-right"}
                  onChange={(e) =>
                    onUpdateProject({
                      ticketWidgetConfig: {
                        ...widgetCfg,
                        position: e.target.value as "bottom-right" | "bottom-left",
                      },
                    })
                  }
                  className="w-full px-3 py-2 text-caption rounded-xl border border-slate-200 bg-slate-50 text-slate-900"
                >
                  <option value="bottom-right">
                    {tr("Vpravo dole", "Bottom Right", "Jobb alul")}
                  </option>
                  <option value="bottom-left">
                    {tr("Vľavo dole", "Bottom Left", "Bal alul")}
                  </option>
                </select>
              </div>
              <div>
                <label className="block text-micro text-slate-500 mb-1">
                  {tr("Text tlačidla", "Button Label", "Gomb felirata")}
                </label>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={widgetCfg.buttonLabel || ""}
                  onChange={(e) =>
                    onUpdateProject({
                      ticketWidgetConfig: {
                        ...widgetCfg,
                        buttonLabel: e.target.value,
                      },
                    })
                  }
                  placeholder="Podpora / Support"
                  className="w-full px-3 py-2 text-caption rounded-xl border border-slate-200 bg-slate-50 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-micro text-slate-500 mb-1">
                  {tr("Nadpis okna", "Modal Title", "Ablak címe")}
                </label>
                <input
                  type="text"
                  disabled={!canEdit}
                  value={widgetCfg.title || ""}
                  onChange={(e) =>
                    onUpdateProject({
                      ticketWidgetConfig: {
                        ...widgetCfg,
                        title: e.target.value,
                      },
                    })
                  }
                  placeholder={`${project.name || "Project"} — Support`}
                  className="w-full px-3 py-2 text-caption rounded-xl border border-slate-200 bg-slate-50 text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* HTML Embed Code & Public Hashed Status Link */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-caption font-bold text-slate-900">
                  {tr(
                    "HTML Kód pre vloženie na web (Embed Code)",
                    "HTML Embed Snippet",
                    "Beágyazható HTML kód",
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(embedCode);
                    setCopiedEmbed(true);
                    setTimeout(() => setCopiedEmbed(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-caption font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  {copiedEmbed ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {copiedEmbed
                      ? tr("Skopírované", "Copied", "Másolva")
                      : tr("Kopírovať HTML", "Copy HTML", "HTML másolása")}
                  </span>
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 text-micro font-mono overflow-x-auto">
                {embedCode}
              </pre>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-caption font-bold text-slate-900">
                  {tr(
                    "Verejná (zahashovaná) URL stavov tiketov projektu",
                    "Public (Hashed) Project Ticket Status URL",
                    "Nyilvános (hashelt) projekt jegystátusz URL",
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleRegenerateHash}
                      title={tr("Pregenerovať hash", "Regenerate hash", "Hash újragenerálása")}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(publicStatusUrl);
                      setCopiedPublicUrl(true);
                      setTimeout(() => setCopiedPublicUrl(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-caption font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
                  >
                    {copiedPublicUrl ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {copiedPublicUrl
                        ? tr("Skopírované", "Copied", "Másolva")
                        : tr("Kopírovať URL", "Copy URL", "URL másolása")}
                    </span>
                  </button>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-micro font-mono break-all">
                {publicStatusUrl}
              </div>
              <p className="text-micro text-slate-500">
                {tr(
                  "Táto URL je prepojená aj priamo v pätičke plávajúceho widgetu. Zobrazuje stav tiketov tohto projektu bez interných poznámok.",
                  "This URL is also linked directly in the floating widget footer. It shows the state of each ticket for this project without internal notes.",
                  "Ez az URL a lebegő widget láblécében is megtalálható. Megjeleníti a projekt jegyeinek állapotát belső jegyzetek nélkül.",
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
