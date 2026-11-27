import { CircleAlert, Search, Type, MessagesSquare, Loader2, Inbox, ArrowUpRight, ArrowDownLeft, Reply, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { PRODUCT_NAME } from "../../utils/brand";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import { EmailTicketLinker } from "./EmailTicketLinker";
import React from "react";
import type { Lead, Ticket, TicketStatusDef } from "../../types";

interface EmailMailLayoutProps {
  mailboxNeedsReconnect: boolean;
  t: (en: string, sk: string, hu: string) => string;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  filter: "all" | "unread";
  setFilter: (value: "all" | "unread" | ((prev: "all" | "unread") => "all" | "unread")) => void;
  unreadCount: number;
  setIsLargeFont: React.Dispatch<React.SetStateAction<boolean>>;
  isLargeFont: boolean;
  setIsThreadedMode: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedEmail: React.Dispatch<any>;
  setSelectedThreadId: React.Dispatch<React.SetStateAction<string | null>>;
  setExpandedEmailUids: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  closeDigest: () => void;
  isThreadedMode: boolean;
  onListScroll: () => void;
  isLoadingEmails: boolean;
  shownCount: number;
  visibleThreads: { id: string; subject: string; latestEmail: any; emails: any[]; seen: boolean; date: any; }[];
  renderListRow: (opts: { key: string; email: any; threadEmails?: any[]; subject: string; unread: boolean; selected: boolean; count?: number; digestKey: string; onOpen: () => void; }) => React.JSX.Element;
  selectedThreadId: string | null;
  toggleEmailExpand: (email: any) => Promise<void>;
  visibleIndividualEmails: any[];
  selectedEmail: any;
  expandThreadMessage: (email: any) => Promise<void>;
  plural: (n: number, en: [string, string], sk: [string, string, string], hu: string) => string;
  activeThread: { id: string; subject: string; latestEmail: any; emails: any[]; seen: boolean; date: any; } | null;
  threadContactOf: (thread: any) => { name: any; address: any; };
  findLead: (address?: string) => Lead | null;
  initialsOf: (name: string) => string;
  renderLeadChip: (lead: Lead | null) => React.JSX.Element | null;
  renderDigestButton: (rawKey: string | number, lead: Lead | null, size?: "sm" | "md") => React.JSX.Element | null;
  readToggleButton: (seen: boolean, onToggle: () => void) => React.JSX.Element;
  setThreadSeen: (thread: any, seen: boolean) => Promise<void>;
  renderInlineAiSummaryBanner: (rawKey: string | number, lead: Lead | null, onRefresh?: () => void) => React.JSX.Element;
  threadBodies: Record<string, any>;
  stripHtml: (html: string) => string;
  fetchSummary: (emailUid: string, folder: string, subject: string, body: string, isThread?: boolean, force?: boolean) => Promise<void>;
  emailThreadScrollRef: React.RefObject<HTMLDivElement | null>;
  expandedEmailUids: Record<string, boolean>;
  counterpartOf: (email: any) => { name: any; address: any; };
  formatFullDate: (value: string) => string;
  canEdit: boolean;
  openNewComposer: (defaultTo?: string, defaultSubject?: string, defaultBody?: string) => void;
  canDelete: boolean;
  systemLanguage: "en" | "sk" | "hu";
  handleDeleteEmail: (uid: any) => void;
  isLoadingDetail: boolean;
  renderMailFrame: (bodyObj: any, title: string, className: string) => React.JSX.Element;
  renderAttachments: (email: any, bodyObj: any, lead: Lead | null) => React.JSX.Element | null;
  primaryButtonClass: string;
  renderCrmActions: (lead: Lead | null, contact: { name: string; address: string; }) => React.JSX.Element | null;
  emptyPane: (text: string) => React.JSX.Element;
  emails: any[];
  renderPartyMeta: (email: any, lead: Lead | null) => React.JSX.Element;
  setSeenFlag: (email: any, seen: boolean) => Promise<boolean>;
  activeFolder: "INBOX";
  tickets?: Ticket[];
  ticketStatuses?: TicketStatusDef[];
  getLinkedTickets?: (emails: any[]) => Ticket[];
  onLinkEmailToTicket?: (ticketId: string, email: any) => void;
  onUnlinkEmailFromTicket?: (ticketId: string, emails: any[]) => void;
}

export const EmailMailLayout: React.FC<EmailMailLayoutProps> = ({
  mailboxNeedsReconnect, t, searchQuery, setSearchQuery, filter, setFilter, unreadCount, setIsLargeFont,
  isLargeFont, setIsThreadedMode, setSelectedEmail, setSelectedThreadId, setExpandedEmailUids, closeDigest,
  isThreadedMode, onListScroll, isLoadingEmails, shownCount, visibleThreads, renderListRow, selectedThreadId,
  toggleEmailExpand, visibleIndividualEmails, selectedEmail, expandThreadMessage, plural, activeThread,
  threadContactOf, findLead, initialsOf, renderLeadChip, renderDigestButton, readToggleButton, setThreadSeen,
  renderInlineAiSummaryBanner, threadBodies, stripHtml, fetchSummary, emailThreadScrollRef, expandedEmailUids,
  counterpartOf, formatFullDate, canEdit, openNewComposer, canDelete, systemLanguage, handleDeleteEmail,
  isLoadingDetail, renderMailFrame, renderAttachments, primaryButtonClass, renderCrmActions, emptyPane,
  emails, renderPartyMeta, setSeenFlag, activeFolder, tickets = [], ticketStatuses, getLinkedTickets,
  onLinkEmailToTicket, onUnlinkEmailFromTicket,
}) => {
  return (
        <div
          data-testid="communication-email-layout"
          className="flex-1 min-w-0 grid grid-cols-1 ws-lg:grid-cols-12 gap-5 h-full max-h-full overflow-hidden"
        >
      {/* COLUMN 1: Conversation list */}
      <div className="ws-lg:col-span-5 ws-xl:col-span-4  rounded-lg border border-gray-200 bg-white shadow-xs flex flex-col h-full max-h-full overflow-hidden">
        {mailboxNeedsReconnect && (
          <div role="alert" data-testid="mailbox-reconnect" className="m-4 mb-0 p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-ui font-semibold flex items-start gap-2 shrink-0">
            <CircleAlert size={16} className="mt-0.5 shrink-0" />
            <span>
              {t(
                "The Microsoft sign-in for your mailbox has expired or was revoked. Open Personal settings → E-mail and sign in with Microsoft again.",
                "Prihlásenie cez Microsoft pre vašu schránku vypršalo alebo bolo zrušené. Otvorte Osobné nastavenia → E-mail a prihláste sa cez Microsoft znova.",
                "A postafiókjához tartozó Microsoft-bejelentkezés lejárt vagy visszavonták. Nyissa meg a Személyes beállítások → E-mail részt, és jelentkezzen be újra a Microsofttal.",
              )}
            </span>
          </div>
        )}
        {/* Search & filters */}
        <div className="p-4 space-y-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={t("Search conversations...", "Hľadať konverzácie...", "Beszélgetések keresése...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-md bg-gray-50 border border-gray-200 text-body text-gray-700 focus:outline-none focus:bg-white focus:border-entity-border transition-colors"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex bg-gray-100 p-1 rounded-md border border-gray-200/50" role="tablist" aria-label={t("Mailbox filter", "Filter schránky", "Postafiók szűrő")}>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "all"}
                onClick={() => setFilter("all")}
                className={`px-3.5 py-1.5 rounded-lg text-body font-bold transition-all cursor-pointer ${filter === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
              >
                {t("All", "Všetky", "Összes")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "unread"}
                onClick={() => setFilter("unread")}
                className={`px-3.5 py-1.5 rounded-lg text-body font-bold transition-all flex items-center gap-1.5 cursor-pointer ${filter === "unread" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
              >
                {t("Unread", "Neprečítané", "Olvasatlan")}
                {unreadCount > 0 && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-entity-solid text-white text-ui font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsLargeFont(prev => !prev)}
                aria-pressed={isLargeFont}
                title={isLargeFont
                  ? t("Font size: large (click for normal)", "Veľkosť písma: veľké (kliknite pre normálne)", "Betűméret: nagy (kattintson a normálhoz)")
                  : t("Font size: normal (click for large)", "Veľkosť písma: normálne (kliknite pre veľké)", "Betűméret: normál (kattintson a nagyhoz)")}
                aria-label={t("Font size", "Veľkosť písma", "Betűméret")}
                className={`h-9 w-9 rounded-md border flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                  isLargeFont ? "bg-entity-subtle border-entity-border text-entity-text" : "bg-white border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <Type size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsThreadedMode(prev => !prev);
                  setSelectedEmail(null);
                  setSelectedThreadId(null);
                  setExpandedEmailUids({});
                  closeDigest();
                }}
                aria-pressed={isThreadedMode}
                title={isThreadedMode
                  ? t("Flow Mode: on — messages grouped into threads", "Režim toku: zapnutý — správy zoskupené do vlákien", "Folyam mód: be — üzenetek szálakba csoportosítva")
                  : t("Flow Mode: off — click to group messages into threads", "Režim toku: vypnutý — kliknite pre zoskupenie do vlákien", "Folyam mód: ki — kattintson a szálakba csoportosításhoz")}
                aria-label={t("Flow Mode", "Režim toku", "Folyam mód")}
                className={`h-9 w-9 rounded-md border flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                  isThreadedMode ? "bg-entity-subtle border-entity-border text-entity-text" : "bg-white border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <MessagesSquare size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Conversation rows */}
        <div className="flex-1 overflow-y-auto" onScroll={onListScroll}>
          {isLoadingEmails ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
              <Loader2 className="animate-spin text-entity-text" size={24} />
              <span className="text-body font-semibold">{t("Syncing Envelopes...", "Synchronizácia obálok...", "Borítékok szinkronizálása...")}</span>
            </div>
          ) : shownCount === 0 ? (
            <div className="text-center py-12 px-4 text-gray-400 text-body font-semibold">
              {filter === "unread"
                ? t("No unread messages.", "Žiadne neprečítané správy.", "Nincs olvasatlan üzenet.")
                : isThreadedMode
                  ? t("No threads found.", "Nenašli sa žiadne vlákna.", "Nincs találat a szálakra.")
                  : t("No conversations found.", "Nenašli sa žiadne konverzácie.", "Nincs találat a beszélgetésekre.")}
            </div>
          ) : isThreadedMode ? (
            visibleThreads.map(thread =>
              renderListRow({
                key: thread.id,
                email: thread.latestEmail,
                threadEmails: thread.emails,
                subject: thread.subject,
                unread: !thread.seen,
                selected: selectedThreadId === thread.id,
                count: thread.emails.length,
                digestKey: `thread-${thread.id}`,
                onOpen: () => {
                  setSelectedThreadId(thread.id);
                  setExpandedEmailUids({ [thread.latestEmail.uid]: true });
                  // Load details for latest message
                  toggleEmailExpand(thread.latestEmail);
                },
              })
            )
          ) : (
            visibleIndividualEmails.map(email =>
              renderListRow({
                key: String(email.uid),
                email,
                subject: email.subject,
                unread: !email.seen,
                selected: selectedEmail?.uid === email.uid,
                digestKey: email.uid,
                onOpen: () => expandThreadMessage(email),
              })
            )
          )}
        </div>

        {/* List footer */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-2 text-body text-gray-500 shrink-0">
          <span>
            {isThreadedMode
              ? plural(shownCount, ["conversation", "conversations"], ["konverzácia", "konverzácie", "konverzácií"], "beszélgetés")
              : plural(shownCount, ["message", "messages"], ["správa", "správy", "správ"], "üzenet")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Inbox size={15} /> {t("Inbox & Sent", "Doručené a odoslané", "Beérkezett és elküldött")}
          </span>
        </div>
      </div>

      {/* COLUMN 2: Mail detail / conversation flow */}
      <div className="ws-lg:col-span-7 ws-xl:col-span-8  rounded-lg border border-gray-200 bg-white shadow-xs flex flex-col h-full max-h-full overflow-hidden">
        {isThreadedMode ? (
          activeThread ? (() => {
            const contact = threadContactOf(activeThread);
            const threadLead = findLead(contact.address);
            const threadKey = `thread-${activeThread.id}`;
            return (
              <div className="h-full flex flex-col overflow-hidden">
                {/* Thread header */}
                <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-4 shrink-0 text-left">
                  <div className="min-w-0">
                    <h3 className="text-title font-heading font-extrabold text-gray-900 tracking-tight break-words">{activeThread.subject}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-body text-gray-500">
                      <span className="inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-md bg-gray-50 border border-gray-200 text-gray-800 font-bold max-w-full">
                        <span className="h-6 w-6 rounded-lg bg-white border border-gray-200 text-gray-600 text-caption font-bold flex items-center justify-center shrink-0">
                          {initialsOf(contact.name)}
                        </span>
                        <span className="truncate">{contact.name}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MessagesSquare size={15} />
                        {plural(activeThread.emails.length, ["message", "messages"], ["správa", "správy", "správ"], "üzenet")}
                      </span>
                      {threadLead ? renderLeadChip(threadLead) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-ui font-bold border bg-white text-gray-500 border-gray-200">
                          👤 {t(`Not in ${PRODUCT_NAME}`, `Nie je v ${PRODUCT_NAME}`, `Nincs a ${PRODUCT_NAME}-ben`)}
                        </span>
                      )}
                      {onLinkEmailToTicket && onUnlinkEmailFromTicket && (
                        <EmailTicketLinker
                          tickets={tickets}
                          ticketStatuses={ticketStatuses}
                          linkedTickets={getLinkedTickets ? getLinkedTickets(activeThread.emails) : []}
                          canEdit={canEdit}
                          onLinkTicket={(ticketId) => onLinkEmailToTicket(ticketId, activeThread.latestEmail)}
                          onUnlinkTicket={(ticketId) => onUnlinkEmailFromTicket(ticketId, activeThread.emails)}
                          t={t}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {renderDigestButton(threadKey, threadLead)}
                    {readToggleButton(activeThread.seen, () => setThreadSeen(activeThread, !activeThread.seen))}
                  </div>
                </div>

                {renderInlineAiSummaryBanner(threadKey, threadLead, () => {
                  const combinedText = activeThread.emails
                    .map((e) => {
                      const sender = e.isSent ? "Me" : e.from.name || e.from.address;
                      const bodyText = threadBodies[e.uid]
                        ? stripHtml(threadBodies[e.uid].html || threadBodies[e.uid].text || "")
                        : e.preview || "";
                      return `From: ${sender}\nDate: ${e.date}\nSubject: ${e.subject}\nContent: ${bodyText}`;
                    })
                    .join("\n\n---\n\n");
                  void fetchSummary(threadKey, "thread", activeThread.subject, combinedText, true, true);
                })}

                {/* Messages, oldest first */}
                <div
                  ref={emailThreadScrollRef}
                  className="flex-1 overflow-y-auto px-6 py-5 space-y-3 scrollbar-thin"
                  onScroll={onListScroll}
                >
                  {activeThread.emails.map((email) => {
                    const isExpanded = !!expandedEmailUids[email.uid];
                    const bodyObj = threadBodies[email.uid];
                    const party = counterpartOf(email);
                    const msgLead = findLead(party.address);

                    return (
                      <div
                        key={email.uid}
                        className={`border rounded-lg overflow-hidden transition-all duration-200 text-left ${
                          isExpanded ? "border-gray-200 shadow-sm" : "border-gray-100 hover:border-gray-200 bg-white"
                        }`}
                      >
                        {/* Message header line */}
                        <div
                          onClick={() => toggleEmailExpand(email)}
                          className={`px-4 py-3 flex items-center justify-between gap-3 cursor-pointer select-none ${
                            isExpanded ? "bg-gray-50 border-b border-gray-200/80" : "bg-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
                              email.isSent ? "bg-pink-100 text-entity-text" : "bg-indigo-100 text-indigo-700"
                            }`}>
                              {email.isSent ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                            </span>
                            <div className="min-w-0">
                              <span className="text-body font-bold text-gray-800 truncate block">
                                {email.isSent ? `${t("To:", "Komu:", "Címzett:")} ${party.name}` : party.name}
                              </span>
                              <span className="text-ui text-gray-500 block mt-0.5 truncate">
                                {formatFullDate(email.date)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {isExpanded && bodyObj && renderDigestButton(email.uid, msgLead, "sm")}
                            {isExpanded && canEdit && (
                              <button
                                type="button"
                                onClick={() => openNewComposer(party.address, `Re: ${email.subject}`)}
                                className="h-8 w-8 rounded-md flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all active:scale-95 cursor-pointer"
                                title={t("Reply", "Odpovedať", "Válasz")}
                                aria-label={t("Reply", "Odpovedať", "Válasz")}
                              >
                                <Reply size={15} />
                              </button>
                            )}
                            {isExpanded && canDelete && (
                              <HoldToConfirmButton
                                  tone="danger"
                                  lang={systemLanguage}
                                  what={email.subject}
                                  onConfirm={() => handleDeleteEmail(email.uid)}
                                  className="h-8 w-8 rounded-md flex items-center justify-center text-gray-500 hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95"
                                  title={t("Delete Message", "Odstrániť správu", "Üzenet törlése")}
                              >
                                <Trash2 size={15} />
                              </HoldToConfirmButton>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleEmailExpand(email)}
                              className="h-8 w-8 rounded-md flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all cursor-pointer"
                              aria-label={isExpanded ? t("Collapse", "Zbaliť", "Összecsukás") : t("Expand", "Rozbaliť", "Kibontás")}
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </div>
                        </div>

                        {/* Message body */}
                        {isExpanded && (
                          <div className="p-4 bg-white space-y-4">
                            {isLoadingDetail && !bodyObj ? (
                              <div className="flex items-center justify-center py-6 gap-2 text-gray-400">
                                <Loader2 className="animate-spin text-entity-text" size={16} />
                                <span className="text-body font-semibold">{t("Decoding part...", "Dekódovanie časti...", "Rész dekódolása...")}</span>
                              </div>
                            ) : bodyObj ? (
                              renderMailFrame(bodyObj, `Thread body ${email.uid}`, "w-full min-h-55 max-h-105 border-0 bg-transparent")
                            ) : (
                              <div className="text-center py-6 text-body font-semibold text-gray-400">
                                {t("Content not found.", "Obsah sa nenašiel.", "A tartalom nem található.")}
                              </div>
                            )}
                            {renderAttachments(email, bodyObj, msgLead)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Thread footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => openNewComposer(contact.address, `Re: ${activeThread.subject}`)}
                      className={primaryButtonClass}
                    >
                      <Reply size={16} /> {t("Reply Thread", "Odpovedať na vlákno", "Válasz a szálra")}
                    </button>
                  ) : <span />}
                  {renderCrmActions(threadLead, contact)}
                </div>
              </div>
            );
          })() : emptyPane(t("Select a threaded conversation flow", "Vyberte tok vlákna konverzácie", "Válasszon egy beszélgetésszálat"))
        ) : (
          isLoadingDetail ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
              <Loader2 className="animate-spin text-entity-text" size={32} />
              <span className="text-body font-semibold">{t("Decoding Message...", "Dekódovanie správy...", "Üzenet dekódolása...")}</span>
            </div>
          ) : selectedEmail ? (() => {
            const bodyObj = threadBodies[selectedEmail.uid];
            // `selectedEmail` is the row as it was when clicked; the read flag
            // lives in `emails`, which the toggle and the refresh keep current.
            const isSeen = emails.find(e => e.uid === selectedEmail.uid)?.seen ?? selectedEmail.seen;
            const party = counterpartOf(selectedEmail);
            const lead = findLead(party.address);

            return (
              <div className="h-full flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-4 shrink-0 text-left">
                  <div className="min-w-0">
                    <h3 className="text-title font-heading font-extrabold text-gray-900 tracking-tight break-words">
                      {selectedEmail.subject || t("(No Subject)", "(Bez predmetu)", "(Nincs tárgy)")}
                    </h3>
                    {renderPartyMeta(selectedEmail, lead)}
                    {onLinkEmailToTicket && onUnlinkEmailFromTicket && (
                      <div className="mt-2">
                        <EmailTicketLinker
                          tickets={tickets}
                          ticketStatuses={ticketStatuses}
                          linkedTickets={getLinkedTickets ? getLinkedTickets([selectedEmail]) : []}
                          canEdit={canEdit}
                          onLinkTicket={(ticketId) => onLinkEmailToTicket(ticketId, selectedEmail)}
                          onUnlinkTicket={(ticketId) => onUnlinkEmailFromTicket(ticketId, [selectedEmail])}
                          t={t}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {bodyObj && renderDigestButton(selectedEmail.uid, lead)}
                    {readToggleButton(isSeen, () => setSeenFlag(selectedEmail, !isSeen))}
                    {canDelete && (
                      <HoldToConfirmButton
                          tone="danger"
                          lang={systemLanguage}
                          what={selectedEmail.subject}
                          onConfirm={() => handleDeleteEmail(selectedEmail.uid)}
                          className="h-9 w-9 shrink-0 rounded-md flex items-center justify-center text-gray-500 hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95"
                          title={t("Delete Message", "Odstrániť správu", "Üzenet törlése")}
                      >
                        <Trash2 size={17} />
                      </HoldToConfirmButton>
                    )}
                  </div>
                </div>

                {renderInlineAiSummaryBanner(selectedEmail.uid, lead, () => {
                  const rawBody = bodyObj ? bodyObj.html || bodyObj.text || "" : selectedEmail.preview || "";
                  void fetchSummary(
                    selectedEmail.uid,
                    selectedEmail.isSent ? "Sent" : activeFolder,
                    selectedEmail.subject,
                    rawBody,
                    false,
                    true
                  );
                })}

                {/* Body + attachments */}
                <div className="flex-1 min-h-0 flex flex-col gap-5 px-6 py-5">
                  {bodyObj ? (
                    renderMailFrame(bodyObj, t("Parsed mail content", "Spracovaný obsah pošty", "Feldolgozott levéltartalom"), "w-full flex-1 min-h-50 border-0 bg-transparent")
                  ) : (
                    <div className="flex-1 text-center text-gray-400 py-12 text-body font-semibold">
                      {t("No message content.", "Žiadny obsah správy.", "Nincs üzenettartalom.")}
                    </div>
                  )}
                  {renderAttachments(selectedEmail, bodyObj, lead)}
                </div>

                {/* Footer actions */}
                <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => openNewComposer(party.address, `Re: ${selectedEmail.subject}`)}
                      className={primaryButtonClass}
                    >
                      <Reply size={16} /> {t("Reply", "Odpovedať", "Válasz")}
                    </button>
                  ) : <span />}
                  {renderCrmActions(lead, party)}
                </div>
              </div>
            );
          })() : emptyPane(t("Select a conversation thread", "Vyberte vlákno konverzácie", "Válasszon egy beszélgetésszálat"))
        )}
      </div>
      </div>
  );
};
