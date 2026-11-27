import { GeometricIcon } from "./GeometricIcon";
import { localeCodeFor } from "../../utils/localTime";
import type { Lead, Task, Ticket, UserProfile } from "../../types";
import { PRODUCT_NAME } from "../../utils/brand";
import { buildTicketHash } from "../../utils/ticketEmailLinks";
import { History, ExternalLink, UserPlus, FileText, FileSpreadsheet, FileImage, Paperclip, Download, FolderPlus, Loader2, Brain, Sparkles, RefreshCw, CircleAlert, X, CheckCircle2, ArrowUpRight, MessagesSquare, Mail, MailOpen, Ticket as TicketIcon } from "lucide-react";
import { formatBytes } from "../../utils/formatBytes";
import React from "react";

interface useEmailPresentationDeps {
  systemLanguage: "en" | "sk" | "hu";
  t: (en: string, sk: string, hu: string) => string;
  leads: Lead[];
  setClientFormEmail: React.Dispatch<React.SetStateAction<string>>;
  setClientFormName: React.Dispatch<React.SetStateAction<string>>;
  setClientFormCity: React.Dispatch<React.SetStateAction<string>>;
  setClientFormPhone: React.Dispatch<React.SetStateAction<string>>;
  setClientFormType: React.Dispatch<React.SetStateAction<"person" | "business" | "partner">>;
  setIsClientSlideoutOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSlideoutLead: React.Dispatch<any>;
  setIsTimelineSlideoutOpen: React.Dispatch<React.SetStateAction<boolean>>;
  canEdit: boolean;
  activeFolder: "INBOX";
  handleDownloadAttachment: (uid: string, folder: string, att: any) => Promise<void>;
  handleAddAttachmentToDocs: (uid: string, folder: string, att: any, matchedClientObj: any) => Promise<void>;
  isLargeFont: boolean;
  digestHideTimer: React.RefObject<number | null>;
  setDigest: React.Dispatch<React.SetStateAction<{ key: string; lead: Lead | null; rect: DOMRect; pinned: boolean; } | null>>;
  setAssigningActionItem: React.Dispatch<React.SetStateAction<{ item: string; emailUid: string; } | null>>;
  isOpenAiKeySet: boolean;
  digest: { key: string; lead: Lead | null; rect: DOMRect; pinned: boolean; } | null;
  problemsMap: Record<string, string[]>;
  loadingSummaries: Record<string, boolean>;
  summaries: Record<string, string>;
  actionItemsMap: Record<string, string[]>;
  tasks: Task[];
  users: UserProfile[];
  handleAddEmailActionItemAsTask: (actionItem: string, emailUid: string, matchedLead: Lead | null, assignedUser: string) => void;
  currentUser: any;
  assigningActionItem: { item: string; emailUid: string; } | null;
  isThreadedMode: boolean;
  threadedEmails: { id: string; subject: string; latestEmail: any; emails: any[]; seen: boolean; date: any; }[];
  filteredIndividualEmails: any[];
  visibleThreads: { id: string; subject: string; latestEmail: any; emails: any[]; seen: boolean; date: any; }[];
  visibleIndividualEmails: any[];
  getLinkedTickets?: (emails: any[]) => Ticket[];
}

/** Plain presentation helpers of EmailView; no hooks inside (pure move). */
export function useEmailPresentation({
  systemLanguage, t, leads, setClientFormEmail, setClientFormName, setClientFormCity, setClientFormPhone,
  setClientFormType, setIsClientSlideoutOpen, setSlideoutLead, setIsTimelineSlideoutOpen, canEdit,
  activeFolder, handleDownloadAttachment, handleAddAttachmentToDocs, isLargeFont, digestHideTimer, setDigest,
  setAssigningActionItem, isOpenAiKeySet, digest, problemsMap, loadingSummaries, summaries, actionItemsMap,
  tasks, users, handleAddEmailActionItemAsTask, currentUser, assigningActionItem, isThreadedMode,
  threadedEmails, filteredIndividualEmails, visibleThreads, visibleIndividualEmails, getLinkedTickets,
}: useEmailPresentationDeps) {
  // --- Presentation helpers -------------------------------------------------

  const locale = localeCodeFor(systemLanguage);

  const plural = (n: number, en: [string, string], sk: [string, string, string], hu: string) => {
    if (systemLanguage === "sk") return `${n} ${n === 1 ? sk[0] : n >= 2 && n <= 4 ? sk[1] : sk[2]}`;
    if (systemLanguage === "hu") return `${n} ${hu}`;
    return `${n} ${n === 1 ? en[0] : en[1]}`;
  };

  // The other party of a message: whoever wrote it, or whoever it went to when we sent it.
  const counterpartOf = (email: any) =>
    email.isSent
      ? { name: email.to?.name || email.to?.address || t("Unknown", "Neznámy", "Ismeretlen"), address: email.to?.address || "" }
      : { name: email.from?.name || email.from?.address || t("Unknown", "Neznámy", "Ismeretlen"), address: email.from?.address || "" };

  // A thread's contact is the newest person who wrote to us, falling back to
  // whoever we last wrote to — never ourselves.
  const threadContactOf = (thread: any) => {
    for (let i = thread.emails.length - 1; i >= 0; i--) {
      if (!thread.emails[i].isSent) return counterpartOf(thread.emails[i]);
    }
    return counterpartOf(thread.latestEmail);
  };

  const findLead = (address?: string) =>
    address ? leads.find(l => l.email && l.email.toLowerCase() === address.toLowerCase()) || null : null;

  const initialsOf = (name: string) => {
    const words = (name || "").replace(/@.*$/, "").split(/[\s._-]+/).filter(w => /^\p{L}/u.test(w));
    if (words.length === 0) return (name || "?").charAt(0).toUpperCase();
    return words.slice(0, 2).map(w => w.charAt(0).toUpperCase()).join("");
  };

  const formatListDate = (value: string) => {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((dayStart(now) - dayStart(d)) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return t("Yesterday", "Včera", "Tegnap");
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(locale, { day: "numeric", month: "numeric" });
    return d.toLocaleDateString(locale);
  };

  const formatFullDate = (value: string) => {
    const d = new Date(value);
    return isNaN(d.getTime()) ? "" : d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  };

  const isClientLead = (lead: Lead) => lead.status === "accepted";

  const iconButtonClass = "h-9 w-9 shrink-0 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all active:scale-95 cursor-pointer";
  const secondaryButtonClass = "px-4 py-2.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 hover:text-gray-900 rounded-md text-body font-bold flex items-center gap-2 transition-all shadow-2xs active:scale-95 cursor-pointer";
  const primaryButtonClass = "px-4 py-2.5 bg-entity-solid hover:bg-entity-solid-hover text-white rounded-md text-body font-bold flex items-center gap-2 transition-all shadow active:scale-95 cursor-pointer";

  const renderLeadChip = (lead: Lead | null) =>
    lead ? (
      <span
        title={`${t(`${PRODUCT_NAME} Match:`, `Zhoda ${PRODUCT_NAME}:`, `${PRODUCT_NAME} egyezés:`)} ${lead.name}`}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-ui font-bold border ${
          isClientLead(lead) ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-600 border-gray-200"
        }`}
      >
        🤝 {isClientLead(lead) ? t("Client", "Klient", "Ügyfél") : t("Lead", "Záujemca", "Érdeklődő")}
      </span>
    ) : null;

  const openCreateClient = (address: string, name: string) => {
    setClientFormEmail(address);
    setClientFormName(name);
    setClientFormCity("");
    setClientFormPhone("");
    setClientFormType("person");
    setIsClientSlideoutOpen(true);
  };

  // CRM actions for the conversation's contact: timeline + profile when matched,
  // "create client" when the sender is not in the CRM yet.
  const renderCrmActions = (lead: Lead | null, contact: { name: string; address: string }) =>
    lead ? (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSlideoutLead(lead);
            setIsTimelineSlideoutOpen(true);
          }}
          className={secondaryButtonClass}
        >
          <History size={16} /> {t("View Timeline", "Zobraziť časovú os", "Idővonal megtekintése")}
        </button>
        <button
          type="button"
          onClick={() => { window.location.hash = `client-${encodeURIComponent(lead.name)}`; }}
          className={secondaryButtonClass}
          title={lead.name}
        >
          <ExternalLink size={16} /> {t("Open Client", "Otvoriť klienta", "Ügyfél megnyitása")}
        </button>
      </div>
    ) : canEdit && contact.address ? (
      <button type="button" onClick={() => openCreateClient(contact.address, contact.name === contact.address ? "" : contact.name)} className={secondaryButtonClass}>
        <UserPlus size={16} /> {t("Create Client", "Vytvoriť klienta", "Ügyfél létrehozása")}
      </button>
    ) : null;

  // Sender line under the subject: avatar chip, address, date, CRM state.
  const renderPartyMeta = (email: any, lead: Lead | null) => {
    const party = counterpartOf(email);
    return (
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-body text-gray-500">
        <span className="inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-md bg-gray-50 border border-gray-200 text-gray-800 font-bold max-w-full">
          <span className="h-6 w-6 rounded-lg bg-white border border-gray-200 text-gray-600 text-caption font-bold flex items-center justify-center shrink-0">
            {initialsOf(party.name)}
          </span>
          {email.isSent && <span className="text-gray-400 font-semibold">{t("To:", "Komu:", "Címzett:")}</span>}
          <span className="truncate">{party.name}</span>
        </span>
        {party.address && party.address !== party.name && <span className="truncate">{party.address}</span>}
        <span className="text-gray-300" aria-hidden>|</span>
        <span>{formatFullDate(email.date)}</span>
        {lead ? (
          renderLeadChip(lead)
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-ui font-bold border bg-white text-gray-500 border-gray-200">
            👤 {t(`Not in ${PRODUCT_NAME}`, `Nie je v ${PRODUCT_NAME}`, `Nincs a ${PRODUCT_NAME}-ben`)}
          </span>
        )}
      </div>
    );
  };

  const attachmentVisual = (name: string) => {
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (ext === "pdf") return { Icon: FileText, cls: "bg-rose-50 text-rose-600" };
    if (["xls", "xlsx", "csv", "ods"].includes(ext)) return { Icon: FileSpreadsheet, cls: "bg-emerald-50 text-emerald-600" };
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "heic"].includes(ext)) return { Icon: FileImage, cls: "bg-sky-50 text-sky-600" };
    return { Icon: Paperclip, cls: "bg-amber-50 text-amber-700" };
  };

  const renderAttachments = (email: any, bodyObj: any, lead: Lead | null) => {
    const attachments: any[] = bodyObj?.attachments || [];
    if (attachments.length === 0) return null;
    const folder = email.isSent ? "Sent" : activeFolder;
    return (
      <div className="shrink-0">
        <div className="text-ui font-bold text-gray-500 mb-2 flex items-center gap-1.5">
          <Paperclip size={14} /> {t("Attachments", "Prílohy", "Mellékletek")} · {attachments.length}
        </div>
        <div className="flex flex-wrap gap-2.5">
          {attachments.map((att: any, attIdx: number) => {
            const { Icon, cls } = attachmentVisual(att.name || "");
            return (
              <div key={attIdx} className="flex items-center gap-3 pl-2.5 pr-1.5 py-2 bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm rounded-lg transition-all">
                <span className={`h-10 w-10 rounded-md flex items-center justify-center shrink-0 ${cls}`}>
                  <Icon size={18} />
                </span>
                <button
                  type="button"
                  onClick={() => handleDownloadAttachment(email.uid, folder, att)}
                  className="min-w-0 text-left cursor-pointer"
                  title={t("Download", "Stiahnuť", "Letöltés")}
                >
                  <span className="block text-body font-bold text-gray-800 truncate max-w-50">{att.name}</span>
                  <span className="block text-ui text-gray-500">{formatBytes(att.size)}</span>
                </button>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => handleDownloadAttachment(email.uid, folder, att)}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-800 transition-all active:scale-95 cursor-pointer"
                    title={t("Download", "Stiahnuť", "Letöltés")}
                    aria-label={t("Download", "Stiahnuť", "Letöltés")}
                  >
                    <Download size={16} />
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleAddAttachmentToDocs(email.uid, folder, att, lead)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-emerald-50 hover:text-emerald-700 transition-all active:scale-95 cursor-pointer"
                      title={t("Add to Docs", "Pridať do dokumentov", "Hozzáadás a dokumentumokhoz")}
                      aria-label={t("Add to Docs", "Pridať do dokumentov", "Hozzáadás a dokumentumokhoz")}
                    >
                      <FolderPlus size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderMailFrame = (bodyObj: any, title: string, className: string) => (
    <iframe
      className={className}
      title={title}
      sandbox=""
      srcDoc={`
        <html>
          <head>
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                color: #0f172a;
                background-color: transparent;
                line-height: 1.6;
                font-size: ${isLargeFont ? "17px" : "14px"};
                margin: 0;
                padding: 2px;
              }
              a { color: #db2777; text-decoration: none; }
              a:hover { text-decoration: underline; }
              blockquote { border-left: 3px solid #cbd5e1; padding-left: 12px; color: #64748b; margin: 12px 0; }
            </style>
          </head>
          <body>
            ${bodyObj.html || bodyObj.text || ""}
          </body>
        </html>
      `}
    />
  );

  // AI digest: hidden behind a brain icon; hovering previews it, clicking pins it open.
  const clearDigestHide = () => {
    if (digestHideTimer.current !== null) {
      window.clearTimeout(digestHideTimer.current);
      digestHideTimer.current = null;
    }
  };
  const scheduleDigestHide = () => {
    clearDigestHide();
    digestHideTimer.current = window.setTimeout(() => {
      setDigest(d => (d && !d.pinned ? null : d));
    }, 180);
  };
  const closeDigest = () => {
    clearDigestHide();
    setDigest(null);
    setAssigningActionItem(null);
  };

  // IMAP uids arrive as numbers; the digest key must be a string (the popover
  // tells threads from single mails with key.startsWith("thread-")).
  const renderDigestButton = (rawKey: string | number, lead: Lead | null, size: "sm" | "md" = "md") => {
    if (!isOpenAiKeySet) return null;
    const key = String(rawKey);
    const isActive = digest?.key === key;
    const hasProblems = (problemsMap[key] || []).length > 0;
    const iconSize = size === "sm" ? 15 : 17;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          clearDigestHide();
          const rect = e.currentTarget.getBoundingClientRect();
          if (digest?.key === key && digest.pinned) {
            closeDigest();
          } else {
            setAssigningActionItem(null);
            setDigest({ key, lead, rect, pinned: true });
          }
        }}
        onMouseEnter={(e) => {
          if (digest?.pinned) return;
          clearDigestHide();
          setDigest({ key, lead, rect: e.currentTarget.getBoundingClientRect(), pinned: false });
        }}
        onMouseLeave={() => {
          if (!digest?.pinned) scheduleDigestHide();
        }}
        title={t("AI summary", "AI súhrn", "AI összefoglaló")}
        aria-label={t("AI summary", "AI súhrn", "AI összefoglaló")}
        aria-expanded={isActive}
        className={`relative ${size === "sm" ? "h-8 w-8" : "h-9 w-9"} shrink-0 rounded-md flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
          isActive
            ? hasProblems
              ? "bg-rose-100 text-rose-700"
              : "bg-purple-100 text-purple-700"
            : hasProblems
              ? "text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              : "text-purple-500 hover:bg-purple-50 hover:text-purple-700"
        }`}
      >
        {loadingSummaries[key] ? <Loader2 size={iconSize} className="animate-spin" /> : <Brain size={iconSize} />}
        {hasProblems && !loadingSummaries[key] && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-rose-600 ring-2 ring-white" />
        )}
      </button>
    );
  };

  const renderInlineAiSummaryBanner = (
    rawKey: string | number,
    lead: Lead | null,
    onRefresh?: () => void
  ) => {
    const key = String(rawKey);
    const summaryText = summaries[key];
    const problems = problemsMap[key] || [];
    const items = actionItemsMap[key] || [];
    const isLoading = Boolean(loadingSummaries[key]);

    if (!isOpenAiKeySet && !summaryText) {
      return (
        <div
          data-testid="comm-ai-summary-banner"
          className="mx-6 mt-3 flex items-center gap-2.5 px-4 py-2.5 rounded-md bg-purple-50/50 border border-purple-100 text-caption font-medium italic text-purple-600 shrink-0"
        >
          <Brain className="h-4 w-4 text-purple-400 shrink-0" />
          {t(
            "AI summary unavailable. Configure AI provider in Settings.",
            "AI zhrnutie nie je k dispozícii. Nastavte AI poskytovateľa v nastaveniach.",
            "Az AI összefoglaló nem érhető el. Állítsa be az AI szolgáltatót a beállításokban."
          )}
        </div>
      );
    }

    if (!summaryText && !isLoading) {
      return (
        <div
          data-testid="comm-ai-summary-banner"
          className="mx-6 mt-3 flex items-center justify-between gap-2.5 px-4 py-2.5 rounded-md bg-purple-50/50 border border-purple-200/70 text-purple-900 shrink-0"
        >
          <div className="flex items-center gap-2 text-caption font-semibold">
            <Brain className="h-4 w-4 text-purple-600 shrink-0" />
            <span>
              {t(
                "Generate AI summary & problem detection for this conversation",
                "Vygenerovať AI zhrnutie a detekciu problémov pre túto konverzáciu",
                "AI összefoglaló és problémaészlelés generálása ehhez a beszélgetéshez"
              )}
            </span>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              data-testid="comm-ai-summary-generate-btn"
              className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-micro font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Sparkles size={12} />
              {t("Summarize", "Zhrnúť", "Összefoglalás")}
            </button>
          )}
        </div>
      );
    }

    const hasProblems = problems.length > 0;
    return (
      <div
        data-testid="comm-ai-summary-banner"
        className={`mx-6 mt-3 px-4 py-3 rounded-lg border transition-all animate-fade-in shrink-0 text-left space-y-2 ${
          hasProblems
            ? "bg-rose-50/75 border-rose-200 text-rose-950"
            : "bg-purple-50/70 border-purple-200 text-purple-950"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <Brain
              className={`h-4.5 w-4.5 mt-0.5 shrink-0 ${
                hasProblems ? "text-rose-600" : "text-purple-600"
              } ${isLoading ? "animate-pulse" : ""}`}
            />
            <div className="min-w-0 flex-1">
              {isLoading && !summaryText ? (
                <span className="text-caption text-purple-600 italic animate-pulse flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-600" />
                  {t(
                    "Generating AI summary & checking for problems...",
                    "Generuje sa AI zhrnutie a kontrola problémov...",
                    "AI összefoglaló generálása és problémák keresése..."
                  )}
                </span>
              ) : (
                <p className="text-caption leading-relaxed font-semibold">
                  {summaryText}
                  {isLoading && (
                    <span className="ml-1.5 text-micro text-purple-500 animate-pulse">
                      ({t("Updating...", "Aktualizuje sa...", "Frissítés...")})
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              title={t("Regenerate AI summary", "Prepočítať AI zhrnutie", "AI összefoglaló újragenerálása")}
              className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-white/80 hover:text-gray-800 cursor-pointer shrink-0 disabled:opacity-40"
            >
              <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
            </button>
          )}
        </div>

        {hasProblems && (
          <div
            data-testid="comm-ai-summary-problems"
            className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-rose-200/70"
          >
            <span className="inline-flex items-center gap-1 text-micro font-extrabold uppercase tracking-wider text-rose-700 mr-1">
              <CircleAlert size={13} className="shrink-0" />
              {t("Problems highlighted:", "Zistené problémy:", "Kiemelt problémák:")}
            </span>
            {problems.map((prob, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-white/90 border border-rose-300 text-rose-800 text-micro font-bold shadow-2xs"
              >
                ⚠️ {prob}
              </span>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-purple-200/50">
            <span className="text-micro font-bold text-purple-800 mr-1">
              {t("Suggested actions:", "Navrhované kroky:", "Javasolt lépések:")}
            </span>
            {items.slice(0, 3).map((item, idx) => {
              const matchingTask = tasks.find((task) => task.title === item);
              return (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/80 border border-purple-200 text-gray-800 text-micro font-semibold"
                >
                  <span>{item}</span>
                  {matchingTask ? (
                    <span className="text-emerald-700 font-bold">✓</span>
                  ) : canEdit && users[0] ? (
                    <button
                      type="button"
                      onClick={() =>
                        handleAddEmailActionItemAsTask(
                          item,
                          key,
                          lead,
                          currentUser?.name || users[0].name
                        )
                      }
                      className="text-purple-700 hover:text-purple-950 font-bold cursor-pointer"
                      title={t("Create task", "Vytvoriť úlohu", "Feladat létrehozása")}
                    >
                      + {t("Task", "Úloha", "Feladat")}
                    </button>
                  ) : null}
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderDigestPopover = () => {
    if (!digest) return null;
    const { key, lead, rect, pinned } = digest;
    const width = Math.min(380, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const openUp = rect.bottom + 340 > window.innerHeight && rect.top > 340;
    const position: React.CSSProperties = openUp
      ? { left, width, bottom: window.innerHeight - rect.top + 6 }
      : { left, width, top: rect.bottom + 6 };
    const isThread = key.startsWith("thread-") || key.startsWith("wa-");
    const problems = problemsMap[key] || [];
    const items = actionItemsMap[key] || [];

    return (
      <>
        {pinned && <div className="fixed inset-0 z-40 bg-transparent" onClick={closeDigest} />}
        <div
          role="dialog"
          aria-label={t("AI summary", "AI súhrn", "AI összefoglaló")}
          style={position}
          onMouseEnter={clearDigestHide}
          onMouseLeave={() => { if (!pinned) scheduleDigestHide(); }}
          className="fixed z-50 max-h-[min(440px,70vh)] overflow-y-auto bg-white border border-purple-200 rounded-lg shadow-xl p-4 text-left animate-fade-in select-text"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Brain size={15} />
              </span>
              <span className="text-body font-bold text-purple-950">
                {isThread ? t("AI Flow Summary", "AI súhrn toku", "AI folyam összefoglaló") : t("AI Mail Summary", "AI súhrn e-mailu", "AI e-mail összefoglaló")}
              </span>
            </div>
            {pinned && (
              <button
                type="button"
                onClick={closeDigest}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all cursor-pointer"
                aria-label={t("Close", "Zavrieť", "Bezárás")}
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="mt-3">
            {loadingSummaries[key] ? (
              <div className="flex items-center gap-2 text-body text-purple-700 font-semibold">
                <Loader2 size={15} className="animate-spin" />
                {isThread
                  ? t("Analyzing conversation flow...", "Analyzuje sa tok konverzácie...", "Beszélgetés folyamának elemzése...")
                  : t("Analyzing email content...", "Analyzuje sa obsah e-mailu...", "E-mail tartalmának elemzése...")}
              </div>
            ) : summaries[key] ? (
              <p className="text-body text-gray-700 leading-relaxed">{summaries[key]}</p>
            ) : (
              <p className="text-body text-gray-400 italic">{t("No summary available.", "Súhrn nie je k dispozícii.", "Nincs elérhető összefoglaló.")}</p>
            )}
          </div>

          {problems.length > 0 && (
            <div className="mt-3 pt-3 border-t border-rose-100 space-y-1.5">
              <div className="text-ui font-bold text-rose-800 flex items-center gap-1.5">
                <CircleAlert size={14} className="text-rose-600" />
                {t("Problems Highlighted", "Zistené problémy", "Kiemelt problémák")}
              </div>
              <ul className="space-y-1">
                {problems.map((prob, idx) => (
                  <li
                    key={idx}
                    className="rounded-md bg-rose-50/80 border border-rose-200 px-3 py-1.5 text-caption font-bold text-rose-900"
                  >
                    ⚠️ {prob}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {items.length > 0 && (
            <div className="mt-4 pt-3 border-t border-purple-100 space-y-2">
              <div className="text-ui font-bold text-purple-900 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-purple-600" />
                {t("Suggested Tasks", "Navrhované úlohy", "Javasolt feladatok")}
              </div>
              <ul className="space-y-1.5">
                {items.map((item, idx) => {
                  const matchingTask = tasks.find(task => task.title === item);
                  const assignedUser = matchingTask?.assignedUsers?.[0] || null;
                  const isAssigning = assigningActionItem?.item === item && assigningActionItem?.emailUid === key;
                  return (
                    <li key={idx} className="rounded-md bg-purple-50/60 border border-purple-100 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-body text-gray-800">{item}</span>
                        {matchingTask ? (
                          <span className="shrink-0 text-ui font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg" title={assignedUser || undefined}>
                            {assignedUser ? `✓ ${assignedUser.substring(0, 2).toUpperCase()}` : "✓"}
                          </span>
                        ) : canEdit ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDigest(d => (d ? { ...d, pinned: true } : d));
                              setAssigningActionItem(isAssigning ? null : { item, emailUid: key });
                            }}
                            className="shrink-0 text-ui font-bold text-purple-700 hover:text-white bg-white hover:bg-purple-600 border border-purple-200 px-2 py-0.5 rounded-lg transition-all cursor-pointer"
                          >
                            + {t("Assign", "Priradiť", "Hozzárendel")}
                          </button>
                        ) : null}
                      </div>
                      {isAssigning && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {users.map(u => (
                            <button
                              key={u.name}
                              type="button"
                              onClick={() => {
                                handleAddEmailActionItemAsTask(item, key, lead, u.name);
                                setAssigningActionItem(null);
                              }}
                              className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg text-ui font-bold text-gray-700 cursor-pointer transition-all"
                            >
                              <span className="h-5 w-5 rounded-full bg-indigo-50 border border-indigo-200/40 text-indigo-600 flex items-center justify-center text-micro font-bold shrink-0">
                                {u.name.substring(0, 2).toUpperCase()}
                              </span>
                              {u.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {!pinned && (
            <p className="mt-3 text-ui text-gray-400">{t("Click the icon to keep it open.", "Kliknutím na ikonu ho necháte otvorený.", "Kattintson az ikonra, hogy nyitva maradjon.")}</p>
          )}
        </div>
      </>
    );
  };

  const unreadCount = isThreadedMode
    ? threadedEmails.filter(th => !th.seen).length
    : filteredIndividualEmails.filter(e => !e.seen).length;
  const shownCount = isThreadedMode ? visibleThreads.length : visibleIndividualEmails.length;

  const onListScroll = () => {
    if (digest) closeDigest();
  };

  // One row of the conversation list. Same shape for a single message and a thread.
  const renderListRow = (opts: {
    key: string;
    email: any;
    threadEmails?: any[];
    subject: string;
    unread: boolean;
    selected: boolean;
    count?: number;
    digestKey: string;
    onOpen: () => void;
  }) => {
    const party = counterpartOf(opts.email);
    const lead = findLead(party.address);
    const linkedTickets = getLinkedTickets ? getLinkedTickets(opts.threadEmails || [opts.email]) : [];
    return (
      <div
        key={opts.key}
        role="button"
        tabIndex={0}
        onClick={opts.onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            opts.onOpen();
          }
        }}
        className={`relative flex gap-3 px-4 py-3.5 border-b border-gray-100 text-left cursor-pointer transition-colors outline-none focus-visible:bg-gray-50 ${
          opts.selected ? "bg-entity-subtle" : "hover:bg-gray-50/80"
        }`}
      >
        {opts.selected && <span className="absolute left-0 top-0 bottom-0 w-0.75 bg-entity-solid rounded-r" aria-hidden />}
        <span className="h-9 w-9 rounded-md bg-gray-100 text-gray-600 text-ui font-bold flex items-center justify-center shrink-0">
          {initialsOf(party.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={`flex items-center min-w-0 text-ui font-medium ${opts.unread ? "text-gray-700" : "text-gray-500"}`}>
              <GeometricIcon emailString={party.address} />
              {opts.email.isSent && <span className="text-gray-400 font-semibold mr-1 shrink-0">{t("To:", "Komu:", "Címzett:")}</span>}
              <span className="truncate">{party.name}</span>
            </span>
            <span className={`text-ui shrink-0 ${opts.unread ? "text-entity-text font-bold" : "text-gray-500"}`}>{formatListDate(opts.email.date)}</span>
          </div>
          <div className={`mt-0.5 text-title-sm font-bold truncate ${opts.unread ? "text-gray-900" : "text-gray-700"}`}>
            {opts.subject || t("(No Subject)", "(Bez predmetu)", "(Nincs tárgy)")}
          </div>
          {opts.email.preview && (
            <p className="mt-0.5 text-body text-gray-500 line-clamp-2 break-words">{opts.email.preview}</p>
          )}
          <div className="mt-2 flex items-center gap-1.5 min-h-6">
            {opts.email.attachment_count > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-ui font-bold bg-amber-50 text-amber-700 border border-amber-100"
                title={plural(opts.email.attachment_count, ["attachment", "attachments"], ["príloha", "prílohy", "príloh"], "melléklet")}
              >
                <Paperclip size={12} /> {opts.email.attachment_count}
              </span>
            )}
            {opts.email.isSent ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-ui font-bold bg-gray-50 text-gray-500 border border-gray-200">
                <ArrowUpRight size={12} /> {t("Sent", "Odoslané", "Elküldve")}
              </span>
            ) : null}
            {opts.count !== undefined && opts.count > 1 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-ui font-bold bg-entity-subtle text-entity-text border border-pink-100">
                <MessagesSquare size={12} /> {opts.count}
              </span>
            )}
            {renderLeadChip(lead)}
            {linkedTickets.slice(0, 2).map((tk) => (
              <button
                key={tk.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.hash = buildTicketHash(tk.id);
                }}
                title={`${tk.ticketNumber} · ${tk.subject}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-ui font-bold bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 cursor-pointer shrink-0"
              >
                <TicketIcon size={12} /> {tk.ticketNumber}
              </button>
            ))}
            <span className="flex-1" />
            {renderDigestButton(opts.digestKey, lead, "sm")}
            {opts.unread && <span className="h-2 w-2 rounded-full bg-entity-solid shrink-0" aria-label={t("Unread", "Neprečítané", "Olvasatlan")} />}
          </div>
        </div>
      </div>
    );
  };

  const readToggleButton = (seen: boolean, onToggle: () => void) => {
    const label = seen
      ? t("Mark as unread", "Označiť ako neprečítané", "Megjelölés olvasatlanként")
      : t("Mark as read", "Označiť ako prečítané", "Megjelölés olvasottként");
    return (
      <button type="button" onClick={onToggle} className={iconButtonClass} title={label} aria-label={label}>
        {seen ? <Mail size={17} /> : <MailOpen size={17} />}
      </button>
    );
  };

  const emptyPane = (text: string) => (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 px-6 text-center">
      <span className="h-14 w-14 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center">
        <Mail size={26} className="stroke-[1.5] text-gray-300" />
      </span>
      <span className="text-body font-semibold text-gray-500">{text}</span>
    </div>
  );


  return {
    locale, primaryButtonClass, initialsOf, formatListDate, emptyPane, renderCrmActions,
    renderInlineAiSummaryBanner, unreadCount, closeDigest, onListScroll, shownCount, renderListRow, plural,
    threadContactOf, findLead, renderLeadChip, renderDigestButton, readToggleButton, counterpartOf,
    formatFullDate, renderMailFrame, renderAttachments, renderPartyMeta, renderDigestPopover,
  };
}
