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
} from "lucide-react";
import type {
  Project,
  ProjectType,
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
  computeTicketSlaDueDates,
  evaluateTicketSla,
  getTicketStatusLabel,
  nextTicketNumber,
} from "./../utils/tickets";
import { TicketRichHtmlEditor, isImageAttachment } from "./ui/TicketRichHtmlEditor";

interface ProjectTicketsPanelProps {
  project: Project;
  projectType?: ProjectType | null;
  onUpdateProject: (patch: Partial<Project>) => void;
  tickets: Ticket[];
  setTickets?: React.Dispatch<React.SetStateAction<Ticket[]>>;
  ticketStatuses: TicketStatusDef[];
  ticketSettings: TicketSettingsConfig;
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
  userLanguage = "sk",
  canEdit = true,
  currentUserName = "Admin",
  onOpenTicket,
}) => {
  const tr = (sk: string, en: string, hu: string) =>
    userLanguage === "en" ? en : userLanguage === "hu" ? hu : sk;

  const [subView, setSubView] = useState<"tickets" | "widget">("tickets");
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
      {/* Sub-navigation between Project Tickets and Widget Settings */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubView("tickets")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-caption font-bold transition-colors ${
              subView === "tickets"
                ? "bg-orange-500 text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
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
            onClick={() => setSubView("widget")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-caption font-bold transition-colors ${
              subView === "widget"
                ? "bg-orange-500 text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-caption font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ExternalLink className="w-3.5 h-3.5 text-orange-500" />
            {tr("Verejný stav tiketov", "Public Status Board", "Nyilvános státusz oldal")}
          </a>
          {canEdit && setTickets && (
            <button
              type="button"
              onClick={() => setShowNewModal((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-caption font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
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
          className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-3"
        >
          <div className="text-caption font-bold text-indigo-900 dark:text-indigo-200">
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
              className="md:col-span-2 px-3 py-2 text-caption rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as TicketType)}
              className="px-3 py-2 text-caption rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            >
              <option value="bug">{tr("Chyba / Bug", "Bug", "Hiba / Bug")}</option>
              <option value="question">{tr("Otázka", "Question", "Kérdés")}</option>
              <option value="feature_request">
                {tr("Požiadavka na funkciu", "Feature Request", "Fejlesztési kérés")}
              </option>
              <option value="incident">{tr("Výpadok / Incident", "Incident", "Incidens")}</option>
            </select>
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as TicketPriority)}
              className="px-3 py-2 text-caption rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            >
              <option value="low">{tr("Nízka priorita", "Low Priority", "Alacsony")}</option>
              <option value="normal">{tr("Normálna priorita", "Normal Priority", "Normál")}</option>
              <option value="high">{tr("Vysoká priorita", "High Priority", "Magas")}</option>
              <option value="critical">{tr("Kritická priorita", "Critical Priority", "Kritikus")}</option>
            </select>
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
              className="px-3 py-1.5 rounded-xl text-caption font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
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
        <div className="space-y-2.5">
          {projectTickets.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2">
              <TicketIcon className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-ui font-semibold text-slate-700 dark:text-slate-200">
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
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-orange-500/50 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="px-2 py-1 rounded-lg text-micro font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {tck.ticketNumber}
                    </span>
                    <div className="min-w-0">
                      <div className="text-ui font-bold text-slate-900 dark:text-white truncate">
                        {tck.subject}
                      </div>
                      <div className="flex items-center gap-2 text-micro text-slate-500">
                        <span>{tck.reporterName || tck.reporterEmail || "—"}</span>
                        <span>•</span>
                        <span className="uppercase">{tck.channel}</span>
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
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
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
      ) : (
        <div className="space-y-5">
          {/* Enable Widget Banner */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-ui font-bold text-slate-900 dark:text-white">
                  {tr(
                    "Plávajúci HTML Support Widget (Privátny na povolených doménach)",
                    "Floating HTML Support Widget (Private to Whitelisted Domains)",
                    "Lebegő HTML Támogatási Widget (Csak engedélyezett domaineken)",
                  )}
                </h4>
                <p className="text-caption text-slate-500 dark:text-slate-400 max-w-2xl">
                  {tr(
                    "Widget nikdy nie je verejný — načíta sa a umožní odosielať tikety či odpovede na existujúce tikety výhradne na doménach uvedených vo whiteliste nižšie.",
                    "The widget is never public — it renders and allows submitting issues or following up on existing tickets strictly on the whitelisted domains below.",
                    "A widget soha nem nyilvános — kizárólag az alább engedélyezett domaineken töltődik be és engedélyezi a jegyek követését.",
                  )}
                </p>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-caption font-bold text-slate-800 dark:text-slate-100 cursor-pointer">
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
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-500" />
                <span className="text-caption font-bold text-slate-900 dark:text-white">
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
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-caption font-mono font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
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
                    className="flex-1 px-3 py-1.5 text-caption rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
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
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-emerald-500" />
                <span className="text-caption font-bold text-slate-900 dark:text-white">
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
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-caption font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
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
                    className="flex-1 px-3 py-1.5 text-caption rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
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
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <div className="text-caption font-bold text-slate-900 dark:text-white">
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
                  className="w-full h-9 rounded-lg cursor-pointer border border-slate-200 dark:border-slate-700 bg-transparent"
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
                  className="w-full px-3 py-2 text-caption rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
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
                  className="w-full px-3 py-2 text-caption rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
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
                  className="w-full px-3 py-2 text-caption rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* HTML Embed Code & Public Hashed Status Link */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-caption font-bold text-slate-900 dark:text-white">
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
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-caption font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200"
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
              <pre className="p-3 rounded-xl bg-slate-950 text-slate-200 text-micro font-mono overflow-x-auto">
                {embedCode}
              </pre>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-caption font-bold text-slate-900 dark:text-white">
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
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
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
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-caption font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200"
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
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 text-micro font-mono break-all">
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
