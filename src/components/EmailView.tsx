import React, { useState, useEffect, useMemo, useRef } from "react";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import {
  Send, Trash2, Search, Mail, Plus, X, Loader2,
  Reply, CheckCircle2, CircleAlert, Clock, Phone, FileText, Calendar, TrendingUp,
  CornerDownLeft, CornerLeftDown, ChevronDown, ChevronUp, Brain, RefreshCw, Lock, MailOpen,
  Type, MessagesSquare, Inbox, Paperclip, UserPlus, ExternalLink, History, Download, FolderPlus,
  FileSpreadsheet, FileImage, ArrowUpRight, ArrowDownLeft
} from "lucide-react";
import type { Lead, Task, UserProfile } from "../types";
import type { ModuleAccess } from "../utils/permissions";
import { FULL_MODULE_ACCESS } from "../utils/permissions";
import { formatBytes } from "../utils/formatBytes";
import { nowLocalStamp, localeCodeFor, formatTimestampLocalized } from "../utils/localTime";
import { getTranslation } from "../utils/translations";
import { CustomSelect } from "./ui/CustomSelect";
import { TimelineAuthorBadge } from "./TimelineAuthorBadge";
import { TimelineCollapsible } from "./TimelineCollapsible";

interface EmailViewProps {
  currentUser: any;
  leads: Lead[];
  setLeads: any;
  systemLanguage: "en" | "sk" | "hu";
  projectManagerColors?: Record<string, string>;
  integrationsConfig?: any;
  tasks: Task[];
  setTasks: (newTasks: Task[] | ((prev: Task[]) => Task[])) => void;
  users: UserProfile[];
  taskStates?: string[];
  /** Role access for the email module. `edit: false` makes the client read-only:
      mail can be read, searched and attachments opened, but nothing is sent,
      created or written into the CRM. */
  access?: ModuleAccess;
}

// Geometric Icon component from AuroraMail
const GeometricIcon: React.FC<{ emailString?: string }> = ({ emailString }) => {
  if (!emailString) return null;
  let hash = 0;
  for (let i = 0; i < emailString.length; i++) {
    hash = emailString.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  
  const hue = hash % 360;
  const color = `hsl(${hue}, 70%, 60%)`;
  const shapes = ['circle', 'square', 'triangle', 'diamond', 'hexagon'];
  const shape = shapes[hash % shapes.length];

  return (
    <svg width="12" height="12" viewBox="0 0 20 20" style={{ marginRight: '6px', flexShrink: 0 }}>
      {shape === 'circle' && <circle cx="10" cy="10" r="9" fill={color} />}
      {shape === 'square' && <rect x="2" y="2" width="16" height="16" rx="4" fill={color} />}
      {shape === 'triangle' && <polygon points="10,2 18,18 2,18" fill={color} strokeLinejoin="round" />}
      {shape === 'diamond' && <polygon points="10,2 18,10 10,18 2,10" fill={color} />}
      {shape === 'hexagon' && <polygon points="10,1 18,5 18,15 10,19 2,15 2,5" fill={color} />}
    </svg>
  );
};

export const EmailView: React.FC<EmailViewProps> = ({
  currentUser,
  leads,
  setLeads,
  systemLanguage,
  projectManagerColors = {},
  integrationsConfig,
  tasks,
  setTasks,
  users,
  taskStates = ["New", "In progress", "Blocked", "Done"],
  access = FULL_MODULE_ACCESS
}) => {
  const t = (en: string, sk: string, hu: string) => systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;
  const canEdit = access.edit;
  const canDelete = access.delete;
  // Folder & Email States
  const activeFolder = "INBOX";
  const [emails, setEmails] = useState<any[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [threadBodies, setThreadBodies] = useState<Record<string, any>>({});
  
  // Thread mode configurations
  const [isThreadedMode, setIsThreadedMode] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [expandedEmailUids, setExpandedEmailUids] = useState<Record<string, boolean>>({});

  // Slideout timeline state
  const [slideoutLead, setSlideoutLead] = useState<any | null>(null);
  const [isTimelineSlideoutOpen, setIsTimelineSlideoutOpen] = useState(false);
  const [isClosingTimeline, setIsClosingTimeline] = useState(false);

  const closeTimelineSlideout = () => {
    setIsClosingTimeline(true);
    setTimeout(() => {
      setIsTimelineSlideoutOpen(false);
      setIsClosingTimeline(false);
    }, 350);
  };

  const [slideoutEmails, setSlideoutEmails] = useState<any[]>([]);
  const [isLoadingSlideoutEmails, setIsLoadingSlideoutEmails] = useState(false);

  // Timeline events whose truncated content the user expanded via "Show more"
  const [expandedTimelineEventIds, setExpandedTimelineEventIds] = useState<Set<string>>(new Set());
  const toggleTimelineEventExpanded = (eventId: string) => {
    setExpandedTimelineEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  // Filtering & Pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  
  // UI Loaders
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
  const [isSyncingEmails, setIsSyncingEmails] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Composers and notifications
  const [composers, setComposers] = useState<any[]>([]);
  const [notification, setNotification] = useState<any | null>(null);

  // AI Email & Flow Summary States
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [loadingSummaries, setLoadingSummaries] = useState<Record<string, boolean>>({});
  const [actionItemsMap, setActionItemsMap] = useState<Record<string, string[]>>({});
  const [assigningActionItem, setAssigningActionItem] = useState<{ item: string; emailUid: string } | null>(null);
  const [isLargeFont, setIsLargeFont] = useState(false);

  // The AI digest popover: which summary, anchored where, and whether a click
  // pinned it open (hover-only previews close when the pointer leaves).
  const [digest, setDigest] = useState<{ key: string; lead: Lead | null; rect: DOMRect; pinned: boolean } | null>(null);
  const digestHideTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!digest) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDigest(null);
        setAssigningActionItem(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [digest]);

  const [isClientSlideoutOpen, setIsClientSlideoutOpen] = useState(false);
  const [isClosingClient, setIsClosingClient] = useState(false);

  const closeClientSlideout = () => {
    setIsClosingClient(true);
    setTimeout(() => {
      setIsClientSlideoutOpen(false);
      setIsClosingClient(false);
    }, 350);
  };
  const [clientFormEmail, setClientFormEmail] = useState("");
  const [clientFormName, setClientFormName] = useState("");
  const [clientFormCity, setClientFormCity] = useState("");
  const [clientFormPhone, setClientFormPhone] = useState("");
  const [clientFormType, setClientFormType] = useState<"person" | "business" | "partner">("person");

  // formatBytes is imported from ../utils/formatBytes

  const handleDownloadAttachment = async (uid: string, folder: string, att: any) => {
    try {
      const res = await fetch(`/api/mail_broker.php?action=get_attachment&folder=${encodeURIComponent(folder)}&uid=${uid}&part=${att.part_num}&name=${encodeURIComponent(att.name)}`, {
        headers: {
          "X-User-Email": currentUser.email
        }
      });
      if (!res.ok) throw new Error(t("Failed to download attachment.", "Nepodarilo sa stiahnuť prílohu.", "A melléklet letöltése nem sikerült."));
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(err.message || t("Failed to download attachment.", "Nepodarilo sa stiahnuť prílohu.", "A melléklet letöltése nem sikerült."));
      }
    }
  };

  const handleAddAttachmentToDocs = async (uid: string, folder: string, att: any, matchedClientObj: any) => {
    if (!canEdit) return;
    try {
      const eventId = `ev-doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t("Adding attachment to documents database...", "Pridáva sa príloha do databázy dokumentov...", "Melléklet hozzáadása a dokumentum-adatbázishoz..."));
      }
      const res = await fetch(`/api/mail_broker.php?action=save_attachment&folder=${encodeURIComponent(folder)}&uid=${uid}&part=${att.part_num}&name=${encodeURIComponent(att.name)}&eventId=${eventId}`, {
        method: "POST",
        headers: {
          "X-User-Email": currentUser.email
        }
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || t("Failed to save attachment.", "Nepodarilo sa uložiť prílohu.", "A melléklet mentése nem sikerült."));
      }

      setLeads((prevLeads: Lead[]) => {
        const targetLeadId = matchedClientObj ? String(matchedClientObj.id) : "unassigned-docs";
        const hasUnassigned = prevLeads.some(l => l.id === "unassigned-docs");
        let baseLeads = prevLeads;
        if (!hasUnassigned && targetLeadId === "unassigned-docs") {
          baseLeads = [...prevLeads, {
            id: "unassigned-docs",
            name: t("Unassigned Documents", "Nepriradené dokumenty", "Nem hozzárendelt dokumentumok"),
            city: "",
            clientType: "person",
            status: "unassigned-docs",
            source: "system",
            owner: "System",
            value: 0,
            createdAt: new Date().toISOString().split("T")[0],
            timeline: []
          }];
        }

        return baseLeads.map(lead => {
          if (lead.id !== targetLeadId) return lead;

          const newEvent = {
            id: eventId,
            type: "offer" as const,
            timestamp: nowLocalStamp(),
            title: t("Email Attachment Saved", "Príloha e-mailu uložená", "E-mail melléklet mentve"),
            content: data.extractedText ? `${t("Saved email attachment:", "Uložená príloha e-mailu:", "Mentett e-mail melléklet:")} ${data.fileName}\n\n--- ${t("Document Content", "Obsah dokumentu", "Dokumentum tartalma")} ---\n${data.extractedText}` : `${t("Saved email attachment:", "Uložená príloha e-mailu:", "Mentett e-mail melléklet:")} ${data.fileName}`,
            amount: undefined,
            fileName: data.fileName,
            fileSize: formatBytes(att.size || 0),
            fileType: "offer" as const,
            author: currentUser?.name || ""
          };

          return {
            ...lead,
            timeline: [newEvent, ...(lead.timeline || [])]
          };
        });
      });

      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(t(`Attachment "${att.name}" successfully added to documents!`, `Príloha "${att.name}" bola úspešne pridaná do dokumentov!`, `A(z) "${att.name}" melléklet sikeresen hozzáadva a dokumentumokhoz!`));
      }
    } catch (err: any) {
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(err.message || t("Failed to add attachment to documents.", "Nepodarilo sa pridať prílohu do dokumentov.", "A melléklet hozzáadása a dokumentumokhoz nem sikerült."));
      }
    }
  };

  const isOpenAiKeySet = useMemo(() => {
    return !!(integrationsConfig?.openAiKey && integrationsConfig.openAiKey.trim() !== "");
  }, [integrationsConfig]);

  // Parse into an INERT document rather than assigning to a live element's
  // innerHTML. The old version built a detached <div> and set innerHTML on it,
  // which still resolves resource URLs — so a mail containing
  // `<img src=x onerror=...>` executed script in the app's origin the moment the
  // body was summarized. DOMParser produces a document that never loads anything
  // and never runs handlers.
  const stripHtml = (html: string) => {
    if (!html) return "";
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      return doc.body?.textContent?.trim() || "";
    } catch {
      // Last resort: strip tags textually rather than touching the live DOM.
      return html.replace(/<[^>]*>/g, "").trim();
    }
  };

  const fetchSummary = async (emailUid: string, folder: string, subject: string, body: string, isThread: boolean = false) => {
    if (summaries[emailUid] || loadingSummaries[emailUid]) return;
    setLoadingSummaries(prev => ({ ...prev, [emailUid]: true }));
    try {
      const res = await fetchWithTimeout("/api/summarize_email.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Email": currentUser.email
        },
        body: JSON.stringify({
          email_uid: emailUid,
          folder,
          subject,
          body,
          is_thread: isThread
        })
      });
      const data = await res.json();
      if (data.success && data.summary) {
        setSummaries(prev => ({ ...prev, [emailUid]: data.summary }));
        if (data.actionItems) {
          setActionItemsMap(prev => ({ ...prev, [emailUid]: data.actionItems }));
        }
      }
    } catch (err) {
      console.error("Failed to fetch email summary", err);
    } finally {
      setLoadingSummaries(prev => ({ ...prev, [emailUid]: false }));
    }
  };

  const handleAddEmailActionItemAsTask = (actionItem: string, emailUid: string, matchedLead: Lead | null, assignedUser: string) => {
    if (!canEdit) return;
    const newCrmTask: Task = {
      id: `task-ai-${Date.now()}`,
      title: actionItem,
      description: t(`AI suggested task from email (UID: ${emailUid}): "${actionItem}"`, `Úloha navrhnutá AI z e-mailu (UID: ${emailUid}): "${actionItem}"`, `AI által javasolt feladat e-mailből (UID: ${emailUid}): "${actionItem}"`),
      status: taskStates[0] || "New",
      priority: "medium",
      startDate: new Date().toISOString().split("T")[0],
      deadline: new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0],
      deadlineTime: "23:59",
      owner: assignedUser,
      createdBy: currentUser?.name || "",
      assignedUsers: [assignedUser],
      relatedLeadId: matchedLead ? String(matchedLead.id) : undefined
    };
    
    setTasks(prev => [newCrmTask, ...prev]);
    
    if (typeof (window as any).showToast === "function") {
      (window as any).showToast(t(`Task assigned to ${assignedUser}!`, `Úloha priradená používateľovi ${assignedUser}!`, `A feladat hozzárendelve: ${assignedUser}!`));
    }
  };

  const handleCreateClientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!clientFormName.trim() || !clientFormEmail.trim() || !clientFormCity.trim()) return;
    
    const newLead: Lead = {
      id: `client-${Date.now()}`,
      name: clientFormName,
      email: clientFormEmail,
      phone: clientFormPhone,
      city: clientFormCity,
      clientType: clientFormType,
      status: "accepted",
      source: "email",
      owner: currentUser?.name || "",
      value: 0,
      createdAt: new Date().toISOString().split("T")[0],
      timeline: []
    };
    
    setLeads((prev: any) => [...prev, newLead]);
    closeClientSlideout();
    
    if (typeof (window as any).showToast === "function") {
      (window as any).showToast(t(`Client ${clientFormName} created and matched successfully!`, `Klient ${clientFormName} bol úspešne vytvorený a priradený!`, `${clientFormName} ügyfél sikeresen létrehozva és párosítva!`));
    }
  };



  const closeComposer = (composerId: number) => {
    setComposers(prev => prev.map(c => c.id === composerId ? { ...c, isClosing: true } : c));
    setTimeout(() => {
      setComposers(prev => prev.filter(c => c.id !== composerId));
    }, 350);
  };

  // Connection config references
  const userEmailSettings = useMemo(() => {
    try {
      if (currentUser && currentUser.metadata_json) {
        const metadata = typeof currentUser.metadata_json === 'string' 
          ? JSON.parse(currentUser.metadata_json) 
          : currentUser.metadata_json;
        return metadata.emailSettings || null;
      }
    } catch (e) {
      console.warn("Error parsing user emailSettings", e);
    }
    return null;
  }, [currentUser]);

  // Load timeline emails for the slideout lead
  useEffect(() => {
    if (!slideoutLead || !slideoutLead.email || !userEmailSettings || !userEmailSettings.isValidated) {
      setSlideoutEmails([]);
      return;
    }

    const fetchLeadMails = async () => {
      setIsLoadingSlideoutEmails(true);
      try {
        const inboxRes = await fetch(
          `/api/mail_broker.php?action=get_emails&folder=INBOX&email=${encodeURIComponent(slideoutLead.email || "")}`,
          { headers: { "X-User-Email": currentUser.email } }
        );
        const inboxData = await inboxRes.json();
        
        let sentEmails: any[] = [];
        try {
          const sentRes = await fetch(
            `/api/mail_broker.php?action=get_emails&folder=Sent&email=${encodeURIComponent(slideoutLead.email || "")}`,
            { headers: { "X-User-Email": currentUser.email } }
          );
          const sentData = await sentRes.json();
          if (sentData.success && Array.isArray(sentData.emails)) {
            sentEmails = sentData.emails;
          }
        } catch (e) {}

        const combinedEmails: any[] = [];
        const processMail = (mail: any) => {
          const isOutgoing = mail.from?.address?.toLowerCase() === currentUser?.email?.toLowerCase();
          const folderPrefix = isOutgoing ? "sent" : "inbox";
          return {
            // Server-issued id, so the merge below recognises the row it already
            // stored for this message instead of rendering it a second time.
            id: mail.event_id || `email-${folderPrefix}-${mail.uid}`,
            type: "email",
            timestamp: mail.date.substring(0, 16),
            title: mail.subject || t("(No Subject)", "(Bez predmetu)", "(Nincs tárgy)"),
            content: `${t("From:", "Od:", "Feladó:")} ${mail.from.name || mail.from.address} <${mail.from.address}>\n\n${t("To view this email or reply, please open the Mail Client.", "Ak chcete zobraziť tento e-mail alebo naň odpovedať, otvorte poštového klienta.", "Az e-mail megtekintéséhez vagy megválaszolásához nyissa meg a levelezőklienst.")}`,
            seen: mail.seen,
            isOutgoing,
            // Only a sent mail has an author inside the CRM. What the client
            // wrote to us was nobody's action here, so it stays unattributed.
            author: isOutgoing ? currentUser?.name || "" : ""
          };
        };

        if (inboxData.success && Array.isArray(inboxData.emails)) {
          inboxData.emails.forEach((m: any) => combinedEmails.push(processMail(m)));
        }
        sentEmails.forEach((m: any) => combinedEmails.push(processMail(m)));
        setSlideoutEmails(combinedEmails);
      } catch (err) {
        console.error("Failed to load slideout timeline emails", err);
      } finally {
        setIsLoadingSlideoutEmails(false);
      }
    };

    fetchLeadMails();
  }, [slideoutLead, userEmailSettings, currentUser]);

  const slideoutTimelineEvents = useMemo(() => {
    if (!slideoutLead) return [];
    const standardEvents = slideoutLead.timeline || [];
    const emailIds = new Set(slideoutEmails.map(e => e.id));
    const merged = [
      ...standardEvents.filter((e: any) => !emailIds.has(e.id)),
      ...slideoutEmails
    ];
    return merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [slideoutLead, slideoutEmails]);

  const notify = (text: string, type: "success" | "error" = "success") => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Load Emails headers list
  // silent = background refresh: keep the current list visible instead of swapping it for the spinner
  const loadEmails = async (currPage = 1, currFilter = filter, silent = false) => {
    if (!userEmailSettings) return;
    if (!silent) setIsLoadingEmails(true);
    setIsSyncingEmails(true);
    try {
      // Fetch Inbox folder emails
      const resInbox = await fetch(`/api/mail_broker.php?action=get_emails&folder=INBOX&page=${currPage}&filter=${currFilter}`, {
        headers: { "X-User-Email": currentUser.email }
      });
      const dataInbox = await resInbox.json();
      
      let inboxMails: any[] = [];
      if (dataInbox.success && Array.isArray(dataInbox.emails)) {
        inboxMails = dataInbox.emails.map((m: any) => ({ ...m, isSent: false }));
      }

      // Fetch Sent folder emails
      let sentMails: any[] = [];
      try {
        const resSent = await fetch(`/api/mail_broker.php?action=get_emails&folder=Sent&page=${currPage}&filter=${currFilter}`, {
          headers: { "X-User-Email": currentUser.email }
        });
        const dataSent = await resSent.json();
        if (dataSent.success && Array.isArray(dataSent.emails)) {
          sentMails = dataSent.emails.map((m: any) => ({ ...m, isSent: true }));
        }
      } catch (e) {
        console.warn("Could not fetch Sent folder emails", e);
      }

      // Merge both folders and sort chronologically (newest first)
      const combined = [...inboxMails, ...sentMails].sort((a: any, b: any) => {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      setEmails(combined);
      setLastSyncAt(new Date());
    } catch (err) {
      notify(t("Mail server unreachable", "Poštový server je nedostupný", "A levelezőszerver nem elérhető"), "error");
    } finally {
      setIsLoadingEmails(false);
      setIsSyncingEmails(false);
    }
  };

  // Manual IMAP sync triggered from the toolbar
  const handleManualSync = async () => {
    if (isSyncingEmails) return;
    await loadEmails(1, filter, true);
  };

  // The IMAP \Seen flag is the only read state there is: the mail client shows
  // it, the list refresh reads it back, and this is the one call that changes
  // it on purpose. The list is updated with the flag the server reports, not
  // with what we asked for, so the two can never drift apart silently.
  const setSeenFlag = async (email: any, seen: boolean): Promise<boolean> => {
    const folderToUse = email.isSent ? "Sent" : activeFolder;
    try {
      const res = await fetch("/api/mail_broker.php?action=set_seen", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Email": currentUser.email },
        body: JSON.stringify({ uid: email.uid, folder: folderToUse, seen })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "set_seen failed");
      setEmails(prev => prev.map(e => e.uid === email.uid ? { ...e, seen: !!data.seen } : e));
      return true;
    } catch (err) {
      notify(
        seen
          ? t("Could not mark the message as read", "Správu sa nepodarilo označiť ako prečítanú", "Az üzenetet nem sikerült olvasottnak jelölni")
          : t("Could not mark the message as unread", "Správu sa nepodarilo označiť ako neprečítanú", "Az üzenetet nem sikerült olvasatlannak jelölni"),
        "error"
      );
      return false;
    }
  };

  // Whole-thread toggle: reading marks every unread message; "unread" lifts
  // only the newest one, which is what the mail client does for a conversation.
  const setThreadSeen = async (thread: any, seen: boolean) => {
    const targets = seen ? thread.emails.filter((e: any) => !e.seen) : [thread.latestEmail];
    for (const email of targets) {
      await setSeenFlag(email, seen);
    }
  };

  // Expand Single message details
  const expandThreadMessage = async (email: any) => {
    if (threadBodies[email.uid]) {
      setSelectedEmail(email);
      // The body is cached but the mail client has since marked it unread:
      // opening it again is reading it again.
      if (!email.seen) setSeenFlag(email, true);
      return;
    }
    setIsLoadingDetail(true);
    const folderToUse = email.isSent ? "Sent" : activeFolder;
    try {
      const res = await fetch(`/api/mail_broker.php?action=get_email_detail&uid=${email.uid}&folder=${encodeURIComponent(folderToUse)}`, {
        headers: { "X-User-Email": currentUser.email }
      });
      const data = await res.json();
      if (data.success) {
        setThreadBodies(prev => ({ ...prev, [email.uid]: data.email }));
        setSelectedEmail(email);

        // Opening the message marked it read on the server; mirror the flag it reports.
        const seenNow = data.email?.seen !== false;
        setEmails(prev => prev.map(e => e.uid === email.uid ? { ...e, seen: seenNow } : e));
      } else {
        notify(data.error || t("Could not retrieve email contents", "Nepodarilo sa načítať obsah e-mailu", "Az e-mail tartalmát nem sikerült lekérni"), "error");
      }
    } catch (err) {
      notify(t("Connection to mail broker lost", "Spojenie s poštovým sprostredkovateľom bolo prerušené", "A kapcsolat a levelezőközvetítővel megszakadt"), "error");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Initial loads
  useEffect(() => {
    if (!userEmailSettings) return;

    loadEmails(1, filter);

    const interval = setInterval(() => {
      loadEmails(1, filter, true);
    }, 60000); // UI updates every 60 seconds

    return () => clearInterval(interval);
  }, [userEmailSettings, filter]);

  // Compose a new email
  const openNewComposer = (defaultTo = "", defaultSubject = "", defaultBody = "") => {
    if (!canEdit) return;
    const newComp = {
      id: Date.now(),
      to: defaultTo,
      subject: defaultSubject,
      body: defaultBody,
      isMinimized: false
    };
    setComposers(prev => [...prev, newComp]);
  };

  const handleSendEmail = async (composer: any) => {
    if (!canEdit) return;
    setIsSending(true);
    try {
      const res = await fetch("/api/mail_broker.php?action=send_email", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-User-Email": currentUser.email
        },
        body: JSON.stringify({
          to: composer.to,
          subject: composer.subject,
          html: composer.body
        })
      });
      const data = await res.json();
      if (data.success) {
        // The message is delivered either way. But a copy that could not be filed
        // into Sent is invisible to the timeline importer, so the mail will never
        // appear on the customer's history — say so rather than let it vanish.
        if (data.filed_to_sent === false) {
          notify(
            t(
              "Sent — but the copy could not be saved to your Sent folder, so it will not appear on the client's timeline.",
              "Odoslané — kópiu sa však nepodarilo uložiť do priečinka Odoslané, takže sa nezobrazí v histórii klienta.",
              "Elküldve — a másolatot azonban nem sikerült a Küldött elemek mappába menteni, így nem jelenik meg az ügyfél előzményei között.",
            ),
            "error",
          );
        } else {
          notify(t("Email sent successfully!", "E-mail bol úspešne odoslaný!", "Az e-mail sikeresen elküldve!"));
        }
        closeComposer(composer.id);
        loadEmails(1, filter);
      } else {
        notify(data.error || t("Failed to transmit message via SMTP", "Nepodarilo sa odoslať správu cez SMTP", "Az üzenet SMTP-n keresztüli küldése nem sikerült"), "error");
      }
    } catch (err) {
      notify(t("Failed to connect to SMTP transmission agent", "Nepodarilo sa pripojiť k prenosovému agentovi SMTP", "Nem sikerült csatlakozni az SMTP továbbító ügynökhöz"), "error");
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteEmail = async (uid: any) => {
    if (!canDelete) return;
    if (!confirm(t("Are you sure you want to delete this email?", "Naozaj chcete odstrániť tento e-mail?", "Biztosan törölni szeretné ezt az e-mailt?"))) return;
    try {
      const res = await fetch(`/api/mail_broker.php?action=delete_email&uid=${uid}&folder=${encodeURIComponent(activeFolder)}`, {
        method: "DELETE",
        headers: { "X-User-Email": currentUser.email }
      });
      const data = await res.json();
      if (data.success) {
        notify(t("Email deleted successfully.", "E-mail bol úspešne odstránený.", "Az e-mail sikeresen törölve."));
        setSelectedEmail(null);
        loadEmails(1, filter);
      } else {
        notify(data.error || t("Failed to remove email", "Nepodarilo sa odstrániť e-mail", "Az e-mail eltávolítása nem sikerült"), "error");
      }
    } catch (err) {
      notify(t("Communication block error.", "Chyba komunikačného bloku.", "Kommunikációs blokk hiba."), "error");
    }
  };

  // Group emails to Conversation flows (threads)
  const threadedEmails = useMemo(() => {
    const query = searchQuery.toLowerCase();
    
    // First, filter individual emails by search query
    const filtered = emails.filter(e => {
      if (!query) return true;
      return (
        (e.subject || "").toLowerCase().includes(query) ||
        (e.from.name || "").toLowerCase().includes(query) ||
        (e.from.address || "").toLowerCase().includes(query) ||
        (e.to?.name || "").toLowerCase().includes(query) ||
        (e.to?.address || "").toLowerCase().includes(query)
      );
    });

    const threadsMap: Record<string, any[]> = {};
    
    filtered.forEach(email => {
      // Strips Re:, Fwd:, etc.
      let normSubject = (email.subject || "")
        .replace(/^(re|fwd|fw|odp|odpověď|rehg|ref|odpověd|odp):\s*/i, "")
        .trim();
      if (!normSubject) {
        normSubject = t("(No Subject)", "(Bez predmetu)", "(Nincs tárgy)");
      }
      
      if (!threadsMap[normSubject]) {
        threadsMap[normSubject] = [];
      }
      threadsMap[normSubject].push(email);
    });
    
    const threadsList = Object.keys(threadsMap).map(subject => {
      const list = threadsMap[subject];
      // Sort oldest to newest
      list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      const latestEmail = list[list.length - 1];
      const hasUnseen = list.some(e => !e.seen);
      
      return {
        id: subject,
        subject: subject,
        latestEmail,
        emails: list,
        seen: !hasUnseen,
        date: latestEmail.date
      };
    });
    
    // Sort threads by latest message date DESC
    threadsList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return threadsList;
  }, [emails, searchQuery]);

  const visibleThreads = useMemo(
    () => (filter === "unread" ? threadedEmails.filter((t) => !t.seen) : threadedEmails),
    [threadedEmails, filter],
  );

  const activeThread = useMemo(() => {
    if (!isThreadedMode || !selectedThreadId) return null;
    return threadedEmails.find(t => t.id === selectedThreadId) || null;
  }, [isThreadedMode, selectedThreadId, threadedEmails]);

  // Toggle expand/collapse inside conversation flow and load detail inline lazily
  const toggleEmailExpand = async (email: any) => {
    const isExpanded = !expandedEmailUids[email.uid];
    setExpandedEmailUids(prev => ({ ...prev, [email.uid]: isExpanded }));

    if (isExpanded && threadBodies[email.uid] && !email.seen) {
      // Cached body, but the message is unread again (the mail client can do
      // that): expanding it is reading it.
      setSeenFlag(email, true);
    }

    if (isExpanded && !threadBodies[email.uid]) {
      setIsLoadingDetail(true);
      const folderToUse = email.isSent ? "Sent" : activeFolder;
      try {
        const res = await fetch(`/api/mail_broker.php?action=get_email_detail&uid=${email.uid}&folder=${encodeURIComponent(folderToUse)}`, {
          headers: { "X-User-Email": currentUser.email }
        });
        const data = await res.json();
        if (data.success) {
          setThreadBodies(prev => ({ ...prev, [email.uid]: data.email }));
          // Opening the message marked it read on the server; mirror the flag it reports.
          const seenNow = data.email?.seen !== false;
          setEmails(prev => prev.map(e => e.uid === email.uid ? { ...e, seen: seenNow } : e));
        }
      } catch (err) {
        console.warn("Failed to retrieve threaded email detail", err);
      } finally {
        setIsLoadingDetail(false);
      }
    }
  };

  // Filtered individual emails for unthreaded mode
  const filteredIndividualEmails = useMemo(() => {
    return emails.filter(e => {
      const query = searchQuery.toLowerCase();
      if (!query) return true;
      return (
        (e.subject || "").toLowerCase().includes(query) ||
        (e.from.name || "").toLowerCase().includes(query) ||
        (e.from.address || "").toLowerCase().includes(query)
      );
    });
  }, [emails, searchQuery]);

  const visibleIndividualEmails = useMemo(
    () => (filter === "unread" ? filteredIndividualEmails.filter((e) => !e.seen) : filteredIndividualEmails),
    [filteredIndividualEmails, filter],
  );

  // Fetch thread flow summary when active thread changes or thread bodies load
  useEffect(() => {
    if (isOpenAiKeySet && activeThread) {
      const combinedText = activeThread.emails.map(e => {
        const sender = e.isSent ? "Me" : (e.from.name || e.from.address);
        const bodyText = threadBodies[e.uid] ? stripHtml(threadBodies[e.uid].html || threadBodies[e.uid].text || "") : "";
        return `From: ${sender}\nDate: ${e.date}\nSubject: ${e.subject}\nContent: ${bodyText}`;
      }).join("\n\n---\n\n");
      
      fetchSummary(`thread-${activeThread.id}`, "thread", activeThread.subject, combinedText, true);
    }
  }, [activeThread, threadBodies, isOpenAiKeySet]);

  // Fetch individual expanded emails' summaries in thread mode
  useEffect(() => {
    if (!isOpenAiKeySet || !activeThread) return;
    activeThread.emails.forEach(email => {
      const isExpanded = expandedEmailUids[email.uid];
      const bodyObj = threadBodies[email.uid];
      if (isExpanded && bodyObj) {
        fetchSummary(email.uid, email.isSent ? "Sent" : activeFolder, email.subject, bodyObj.html || bodyObj.text, false);
      }
    });
  }, [activeThread, expandedEmailUids, threadBodies, isOpenAiKeySet]);

  // Fetch individual email summary in traditional unthreaded mode
  useEffect(() => {
    if (!isOpenAiKeySet || isThreadedMode) return;
    if (selectedEmail) {
      const bodyObj = threadBodies[selectedEmail.uid];
      if (bodyObj) {
        fetchSummary(selectedEmail.uid, selectedEmail.isSent ? "Sent" : activeFolder, selectedEmail.subject, bodyObj.html || bodyObj.text, false);
      }
    }
  }, [selectedEmail, threadBodies, isOpenAiKeySet, isThreadedMode]);

  // Sync initial summaries from fetched emails list payload
  useEffect(() => {
    const initialSummaries: Record<string, string> = {};
    const initialActionItems: Record<string, string[]> = {};
    emails.forEach(e => {
      if (e.summary) {
        try {
          if (e.summary.trim().startsWith('{')) {
            const parsed = JSON.parse(e.summary);
            initialSummaries[e.uid] = parsed.summary || '';
            initialActionItems[e.uid] = parsed.actionItems || [];
          } else {
            initialSummaries[e.uid] = e.summary;
          }
        } catch (err) {
          initialSummaries[e.uid] = e.summary;
        }
      }
    });
    setSummaries(prev => ({ ...initialSummaries, ...prev }));
    setActionItemsMap(prev => ({ ...initialActionItems, ...prev }));
  }, [emails]);

  // Background pre-fetch summaries for visible items in the lists
  useEffect(() => {
    if (!isOpenAiKeySet) return;
    
    if (isThreadedMode) {
      threadedEmails.forEach(thread => {
        const threadId = `thread-${thread.id}`;
        if (!summaries[threadId] && !loadingSummaries[threadId]) {
          const combinedText = thread.emails.map(e => {
            const sender = e.isSent ? "Me" : (e.from.name || e.from.address);
            return `From: ${sender}\nDate: ${e.date}\nSubject: ${e.subject}`;
          }).join("\n");
          fetchSummary(threadId, "thread", thread.subject, combinedText, true);
        }
      });
    } else {
      filteredIndividualEmails.forEach(email => {
        if (!summaries[email.uid] && !loadingSummaries[email.uid]) {
          fetchSummary(email.uid, email.isSent ? "Sent" : activeFolder, email.subject, "", false);
        }
      });
    }
  }, [emails, isThreadedMode, isOpenAiKeySet, threadedEmails, filteredIndividualEmails]);

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

  const iconButtonClass = "h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-all active:scale-95 cursor-pointer";
  const secondaryButtonClass = "px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-2xs active:scale-95 cursor-pointer";
  const primaryButtonClass = "px-4 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow active:scale-95 cursor-pointer";

  const renderLeadChip = (lead: Lead | null) =>
    lead ? (
      <span
        title={`${t("CRM Match:", "Zhoda CRM:", "CRM egyezés:")} ${lead.name}`}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold border ${
          isClientLead(lead) ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"
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
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-500">
        <span className="inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-bold max-w-full">
          <span className="h-6 w-6 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold flex items-center justify-center shrink-0">
            {initialsOf(party.name)}
          </span>
          {email.isSent && <span className="text-slate-400 font-semibold">{t("To:", "Komu:", "Címzett:")}</span>}
          <span className="truncate">{party.name}</span>
        </span>
        {party.address && party.address !== party.name && <span className="truncate">{party.address}</span>}
        <span className="text-slate-300" aria-hidden>|</span>
        <span>{formatFullDate(email.date)}</span>
        {lead ? (
          renderLeadChip(lead)
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold border bg-white text-slate-500 border-slate-200">
            👤 {t("Not in CRM", "Nie je v CRM", "Nincs a CRM-ben")}
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
        <div className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1.5">
          <Paperclip size={14} /> {t("Attachments", "Prílohy", "Mellékletek")} · {attachments.length}
        </div>
        <div className="flex flex-wrap gap-2.5">
          {attachments.map((att: any, attIdx: number) => {
            const { Icon, cls } = attachmentVisual(att.name || "");
            return (
              <div key={attIdx} className="flex items-center gap-3 pl-2.5 pr-1.5 py-2 bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm rounded-2xl transition-all">
                <span className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${cls}`}>
                  <Icon size={18} />
                </span>
                <button
                  type="button"
                  onClick={() => handleDownloadAttachment(email.uid, folder, att)}
                  className="min-w-0 text-left cursor-pointer"
                  title={t("Download", "Stiahnuť", "Letöltés")}
                >
                  <span className="block text-sm font-bold text-slate-800 truncate max-w-[200px]">{att.name}</span>
                  <span className="block text-xs text-slate-500">{formatBytes(att.size)}</span>
                </button>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => handleDownloadAttachment(email.uid, folder, att)}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-all active:scale-95 cursor-pointer"
                    title={t("Download", "Stiahnuť", "Letöltés")}
                    aria-label={t("Download", "Stiahnuť", "Letöltés")}
                  >
                    <Download size={16} />
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleAddAttachmentToDocs(email.uid, folder, att, lead)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-emerald-50 hover:text-emerald-700 transition-all active:scale-95 cursor-pointer"
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
        className={`${size === "sm" ? "h-8 w-8" : "h-9 w-9"} shrink-0 rounded-xl flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
          isActive ? "bg-purple-100 text-purple-700" : "text-purple-500 hover:bg-purple-50 hover:text-purple-700"
        }`}
      >
        {loadingSummaries[key] ? <Loader2 size={iconSize} className="animate-spin" /> : <Brain size={iconSize} />}
      </button>
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
    const isThread = key.startsWith("thread-");
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
          className="fixed z-50 max-h-[min(440px,70vh)] overflow-y-auto bg-white border border-purple-200 rounded-2xl shadow-2xl p-4 text-left animate-fade-in select-text"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                <Brain size={15} />
              </span>
              <span className="text-sm font-bold text-purple-950">
                {isThread ? t("AI Flow Summary", "AI súhrn toku", "AI folyam összefoglaló") : t("AI Mail Summary", "AI súhrn e-mailu", "AI e-mail összefoglaló")}
              </span>
            </div>
            {pinned && (
              <button
                type="button"
                onClick={closeDigest}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all cursor-pointer"
                aria-label={t("Close", "Zavrieť", "Bezárás")}
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="mt-3">
            {loadingSummaries[key] ? (
              <div className="flex items-center gap-2 text-sm text-purple-700 font-semibold">
                <Loader2 size={15} className="animate-spin" />
                {isThread
                  ? t("Analyzing conversation flow...", "Analyzuje sa tok konverzácie...", "Beszélgetés folyamának elemzése...")
                  : t("Analyzing email content...", "Analyzuje sa obsah e-mailu...", "E-mail tartalmának elemzése...")}
              </div>
            ) : summaries[key] ? (
              <p className="text-sm text-slate-700 leading-relaxed">{summaries[key]}</p>
            ) : (
              <p className="text-sm text-slate-400 italic">{t("No summary available.", "Súhrn nie je k dispozícii.", "Nincs elérhető összefoglaló.")}</p>
            )}
          </div>

          {items.length > 0 && (
            <div className="mt-4 pt-3 border-t border-purple-100 space-y-2">
              <div className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-purple-600" />
                {t("Suggested Tasks", "Navrhované úlohy", "Javasolt feladatok")}
              </div>
              <ul className="space-y-1.5">
                {items.map((item, idx) => {
                  const matchingTask = tasks.find(task => task.title === item);
                  const assignedUser = matchingTask?.assignedUsers?.[0] || null;
                  const isAssigning = assigningActionItem?.item === item && assigningActionItem?.emailUid === key;
                  return (
                    <li key={idx} className="rounded-xl bg-purple-50/60 border border-purple-100 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm text-slate-800">{item}</span>
                        {matchingTask ? (
                          <span className="shrink-0 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg" title={assignedUser || undefined}>
                            {assignedUser ? `✓ ${assignedUser.substring(0, 2).toUpperCase()}` : "✓"}
                          </span>
                        ) : canEdit ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDigest(d => (d ? { ...d, pinned: true } : d));
                              setAssigningActionItem(isAssigning ? null : { item, emailUid: key });
                            }}
                            className="shrink-0 text-xs font-bold text-purple-700 hover:text-white bg-white hover:bg-purple-600 border border-purple-200 px-2 py-0.5 rounded-lg transition-all cursor-pointer"
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
                              className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 cursor-pointer transition-all"
                            >
                              <span className="h-5 w-5 rounded-full bg-indigo-50 border border-indigo-200/40 text-indigo-600 flex items-center justify-center text-[10px] font-bold shrink-0">
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
            <p className="mt-3 text-xs text-slate-400">{t("Click the icon to keep it open.", "Kliknutím na ikonu ho necháte otvorený.", "Kattintson az ikonra, hogy nyitva maradjon.")}</p>
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
    subject: string;
    unread: boolean;
    selected: boolean;
    count?: number;
    digestKey: string;
    onOpen: () => void;
  }) => {
    const party = counterpartOf(opts.email);
    const lead = findLead(party.address);
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
        className={`relative flex gap-3 px-4 py-3.5 border-b border-slate-100 text-left cursor-pointer transition-colors outline-none focus-visible:bg-slate-50 ${
          opts.selected ? "bg-pink-50/40" : "hover:bg-slate-50/80"
        }`}
      >
        {opts.selected && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-pink-600 rounded-r" aria-hidden />}
        <span className="h-9 w-9 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
          {initialsOf(party.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={`flex items-center min-w-0 text-sm ${opts.unread ? "font-extrabold text-slate-900" : "font-semibold text-slate-700"}`}>
              <GeometricIcon emailString={party.address} />
              {opts.email.isSent && <span className="text-slate-400 font-semibold mr-1 shrink-0">{t("To:", "Komu:", "Címzett:")}</span>}
              <span className="truncate">{party.name}</span>
            </span>
            <span className={`text-xs shrink-0 ${opts.unread ? "text-pink-600 font-bold" : "text-slate-500"}`}>{formatListDate(opts.email.date)}</span>
          </div>
          <div className={`mt-0.5 text-sm truncate ${opts.unread ? "font-bold text-slate-900" : "text-slate-600"}`}>
            {opts.subject || t("(No Subject)", "(Bez predmetu)", "(Nincs tárgy)")}
          </div>
          {opts.email.preview && (
            <p className="mt-0.5 text-sm text-slate-500 line-clamp-2 break-words">{opts.email.preview}</p>
          )}
          <div className="mt-2 flex items-center gap-1.5 min-h-[24px]">
            {opts.email.attachment_count > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100"
                title={plural(opts.email.attachment_count, ["attachment", "attachments"], ["príloha", "prílohy", "príloh"], "melléklet")}
              >
                <Paperclip size={12} /> {opts.email.attachment_count}
              </span>
            )}
            {opts.email.isSent ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-50 text-slate-500 border border-slate-200">
                <ArrowUpRight size={12} /> {t("Sent", "Odoslané", "Elküldve")}
              </span>
            ) : null}
            {opts.count !== undefined && opts.count > 1 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-pink-50 text-pink-700 border border-pink-100">
                <MessagesSquare size={12} /> {opts.count}
              </span>
            )}
            {renderLeadChip(lead)}
            <span className="flex-1" />
            {renderDigestButton(opts.digestKey, lead, "sm")}
            {opts.unread && <span className="h-2 w-2 rounded-full bg-pink-600 shrink-0" aria-label={t("Unread", "Neprečítané", "Olvasatlan")} />}
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
    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 px-6 text-center">
      <span className="h-14 w-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
        <Mail size={26} className="stroke-[1.5] text-slate-300" />
      </span>
      <span className="text-sm font-semibold text-slate-500">{text}</span>
    </div>
  );

  return (
    <div className="space-y-5 select-none animate-fade-in text-slate-800">
    {/* Title header */}
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <span className="h-12 w-12 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center shrink-0">
          <Mail className="h-6 w-6 text-pink-600" />
        </span>
        <div className="min-w-0">
          <h2 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight">
            {t("Email Inbox", "Emailová schránka", "E-mail postafiók")}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("Unified SMTP / IMAP inbox connected to your CRM contacts", "Jednotná SMTP / IMAP schránka prepojená s kontaktmi CRM", "Egységes SMTP / IMAP postafiók a CRM kapcsolatokhoz")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!canEdit && (
          <span
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-bold shrink-0"
            title={t("Your role can read mail but not send it or write into the CRM from here.", "Vaša rola môže poštu čítať, ale nie odosielať ani odtiaľto zapisovať do CRM.", "A szerepköre olvashatja a leveleket, de nem küldhet, és innen nem írhat a CRM-be.")}
          >
            <Lock className="h-4 w-4" />
            {t("Read-only access", "Iba na čítanie", "Csak olvasható")}
          </span>
        )}
        <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 shadow-2xs">
          <span className={`h-2 w-2 rounded-full shrink-0 ${isSyncingEmails ? "bg-pink-500 animate-pulse" : "bg-emerald-500"}`} />
          {isSyncingEmails
            ? t("Syncing with mailbox...", "Synchronizuje sa so schránkou...", "Szinkronizálás a postafiókkal...")
            : lastSyncAt
              ? `${t("Synced", "Synchronizované", "Szinkronizálva")} ${lastSyncAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} · ${t("every 60 s", "každých 60 s", "60 mp-enként")}`
              : t("Auto-sync every 60s", "Automatická synchronizácia každých 60 s", "Automatikus szinkronizálás 60 mp-enként")}
        </span>
        <button
          type="button"
          onClick={handleManualSync}
          disabled={isSyncingEmails}
          title={
            lastSyncAt
              ? `${t("Last synced", "Naposledy synchronizované", "Utoljára szinkronizálva")}: ${lastSyncAt.toLocaleTimeString()}`
              : t("Sync now", "Synchronizovať teraz", "Szinkronizálás most")
          }
          aria-label={t("Sync now", "Synchronizovať teraz", "Szinkronizálás most")}
          className="h-10 w-10 bg-white hover:bg-slate-50 active:scale-95 border border-slate-200 text-slate-600 hover:text-pink-600 rounded-xl transition-all flex items-center justify-center shadow-2xs shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
        >
          <RefreshCw size={16} className={isSyncingEmails ? "animate-spin" : ""} />
        </button>
        {canEdit && (
          <button type="button" onClick={() => openNewComposer()} className={`${primaryButtonClass} shrink-0`}>
            <Plus size={16} /> {t("New Message", "Nová správa", "Új üzenet")}
          </button>
        )}
      </div>
    </div>

    <div className={`grid grid-cols-1 lg:grid-cols-12 gap-5 select-none h-[calc(100vh-280px)] min-h-[520px] items-stretch overflow-hidden animate-slide-up email-view-root ${isLargeFont ? 'email-view-large' : ''}`}>
      <style>{`
        .email-view-large .text-\\[10px\\] { font-size: 13px !important; }
        .email-view-large .text-\\[11px\\] { font-size: 14px !important; }
        .email-view-large .text-xs { font-size: 15px !important; }
        .email-view-large .text-sm { font-size: 17px !important; }
        .email-view-large .text-base { font-size: 19px !important; }
        .email-view-large .text-lg { font-size: 21px !important; }
        .email-view-large .text-xl { font-size: 23px !important; }
        .email-view-large .text-2xl { font-size: 27px !important; }
        .email-view-large input { font-size: 17px !important; }
        .email-view-large select { font-size: 17px !important; }
      `}</style>
      {/* Notifications banner */}
      {notification && (
        <div className={`fixed bottom-4 right-4 z-50 px-5 py-3.5 rounded-2xl flex items-center gap-3 border shadow-2xl ${
          notification.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-rose-50 border-rose-200 text-rose-900"
        }`}>
          {notification.type === "success" ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
          <span className="text-sm font-bold">{notification.text}</span>
        </div>
      )}

      {/* COLUMN 1: Conversation list */}
      <div className="lg:col-span-5 xl:col-span-4 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col h-full max-h-full overflow-hidden">
        {/* Search & filters */}
        <div className="p-4 space-y-3 border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder={t("Search conversations...", "Hľadať konverzácie...", "Beszélgetések keresése...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 focus:outline-none focus:bg-white focus:border-pink-300 transition-colors"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50" role="tablist" aria-label={t("Mailbox filter", "Filter schránky", "Postafiók szűrő")}>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "all"}
                onClick={() => setFilter("all")}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition-all cursor-pointer ${filter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {t("All", "Všetky", "Összes")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "unread"}
                onClick={() => setFilter("unread")}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer ${filter === "unread" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {t("Unread", "Neprečítané", "Olvasatlan")}
                {unreadCount > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-pink-600 text-white text-xs font-bold flex items-center justify-center">
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
                className={`h-9 w-9 rounded-xl border flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                  isLargeFont ? "bg-pink-50 border-pink-200 text-pink-700" : "bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50"
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
                className={`h-9 w-9 rounded-xl border flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                  isThreadedMode ? "bg-pink-50 border-pink-200 text-pink-700" : "bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50"
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
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
              <Loader2 className="animate-spin text-pink-500" size={24} />
              <span className="text-sm font-semibold">{t("Syncing Envelopes...", "Synchronizácia obálok...", "Borítékok szinkronizálása...")}</span>
            </div>
          ) : shownCount === 0 ? (
            <div className="text-center py-12 px-4 text-slate-400 text-sm font-semibold">
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
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-2 text-sm text-slate-500 shrink-0">
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
      <div className="lg:col-span-7 xl:col-span-8 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col h-full max-h-full overflow-hidden">
        {isThreadedMode ? (
          activeThread ? (() => {
            const contact = threadContactOf(activeThread);
            const threadLead = findLead(contact.address);
            const threadKey = `thread-${activeThread.id}`;
            return (
              <div className="h-full flex flex-col overflow-hidden">
                {/* Thread header */}
                <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0 text-left">
                  <div className="min-w-0">
                    <h3 className="text-xl font-heading font-extrabold text-slate-900 tracking-tight break-words">{activeThread.subject}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-bold max-w-full">
                        <span className="h-6 w-6 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold flex items-center justify-center shrink-0">
                          {initialsOf(contact.name)}
                        </span>
                        <span className="truncate">{contact.name}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MessagesSquare size={15} />
                        {plural(activeThread.emails.length, ["message", "messages"], ["správa", "správy", "správ"], "üzenet")}
                      </span>
                      {threadLead ? renderLeadChip(threadLead) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold border bg-white text-slate-500 border-slate-200">
                          👤 {t("Not in CRM", "Nie je v CRM", "Nincs a CRM-ben")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {renderDigestButton(threadKey, threadLead)}
                    {readToggleButton(activeThread.seen, () => setThreadSeen(activeThread, !activeThread.seen))}
                  </div>
                </div>

                {/* Messages, oldest first */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3 scrollbar-thin" onScroll={onListScroll}>
                  {activeThread.emails.map((email) => {
                    const isExpanded = !!expandedEmailUids[email.uid];
                    const bodyObj = threadBodies[email.uid];
                    const party = counterpartOf(email);
                    const msgLead = findLead(party.address);

                    return (
                      <div
                        key={email.uid}
                        className={`border rounded-2xl overflow-hidden transition-all duration-200 text-left ${
                          isExpanded ? "border-slate-200 shadow-sm" : "border-slate-100 hover:border-slate-200 bg-white"
                        }`}
                      >
                        {/* Message header line */}
                        <div
                          onClick={() => toggleEmailExpand(email)}
                          className={`px-4 py-3 flex items-center justify-between gap-3 cursor-pointer select-none ${
                            isExpanded ? "bg-slate-50 border-b border-slate-200/80" : "bg-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${
                              email.isSent ? "bg-pink-100 text-pink-700" : "bg-indigo-100 text-indigo-700"
                            }`}>
                              {email.isSent ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                            </span>
                            <div className="min-w-0">
                              <span className="text-sm font-bold text-slate-800 truncate block">
                                {email.isSent ? `${t("To:", "Komu:", "Címzett:")} ${party.name}` : party.name}
                              </span>
                              <span className="text-xs text-slate-500 block mt-0.5 truncate">
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
                                className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-all active:scale-95 cursor-pointer"
                                title={t("Reply", "Odpovedať", "Válasz")}
                                aria-label={t("Reply", "Odpovedať", "Válasz")}
                              >
                                <Reply size={15} />
                              </button>
                            )}
                            {isExpanded && canDelete && (
                              <button
                                type="button"
                                onClick={() => handleDeleteEmail(email.uid)}
                                className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95 cursor-pointer"
                                title={t("Delete Message", "Odstrániť správu", "Üzenet törlése")}
                                aria-label={t("Delete Message", "Odstrániť správu", "Üzenet törlése")}
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleEmailExpand(email)}
                              className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all cursor-pointer"
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
                              <div className="flex items-center justify-center py-6 gap-2 text-slate-400">
                                <Loader2 className="animate-spin text-pink-500" size={16} />
                                <span className="text-sm font-semibold">{t("Decoding part...", "Dekódovanie časti...", "Rész dekódolása...")}</span>
                              </div>
                            ) : bodyObj ? (
                              renderMailFrame(bodyObj, `Thread body ${email.uid}`, "w-full min-h-[220px] max-h-[420px] border-0 bg-transparent")
                            ) : (
                              <div className="text-center py-6 text-sm font-semibold text-slate-400">
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
                <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
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
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
              <Loader2 className="animate-spin text-pink-500" size={32} />
              <span className="text-sm font-semibold">{t("Decoding Message...", "Dekódovanie správy...", "Üzenet dekódolása...")}</span>
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
                <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0 text-left">
                  <div className="min-w-0">
                    <h3 className="text-xl font-heading font-extrabold text-slate-900 tracking-tight break-words">
                      {selectedEmail.subject || t("(No Subject)", "(Bez predmetu)", "(Nincs tárgy)")}
                    </h3>
                    {renderPartyMeta(selectedEmail, lead)}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {bodyObj && renderDigestButton(selectedEmail.uid, lead)}
                    {readToggleButton(isSeen, () => setSeenFlag(selectedEmail, !isSeen))}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteEmail(selectedEmail.uid)}
                        className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95 cursor-pointer"
                        title={t("Delete Message", "Odstrániť správu", "Üzenet törlése")}
                        aria-label={t("Delete Message", "Odstrániť správu", "Üzenet törlése")}
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Body + attachments */}
                <div className="flex-1 min-h-0 flex flex-col gap-5 px-6 py-5">
                  {bodyObj ? (
                    renderMailFrame(bodyObj, t("Parsed mail content", "Spracovaný obsah pošty", "Feldolgozott levéltartalom"), "w-full flex-1 min-h-[200px] border-0 bg-transparent")
                  ) : (
                    <div className="flex-1 text-center text-slate-400 py-12 text-sm font-semibold">
                      {t("No message content.", "Žiadny obsah správy.", "Nincs üzenettartalom.")}
                    </div>
                  )}
                  {renderAttachments(selectedEmail, bodyObj, lead)}
                </div>

                {/* Footer actions */}
                <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
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

      {renderDigestPopover()}

      {/* COMPOSERS OVERLAY DRAWER */}
      {composers.map(comp => (
        <div key={comp.id} className={`fixed bottom-0 right-10 w-96 bg-white border-t border-x border-slate-300 rounded-t-2xl shadow-2xl z-50 flex flex-col ${comp.isClosing ? "animate-slide-out-bottom" : "animate-slide-in-bottom"}`}>
          <div className="bg-slate-900 text-white p-3 rounded-t-2xl flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider">{t("New Email", "Nový e-mail", "Új e-mail")}</span>
            <button
              onClick={() => closeComposer(comp.id)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          <div className="p-4 space-y-3 text-left">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 block">{t("To Address", "Adresa príjemcu", "Címzett címe")}</label>
              <input
                type="email"
                value={comp.to}
                onChange={(e) => setComposers(prev => prev.map(c => c.id === comp.id ? { ...c, to: e.target.value } : c))}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 block">{t("Subject", "Predmet", "Tárgy")}</label>
              <input
                type="text"
                value={comp.subject}
                onChange={(e) => setComposers(prev => prev.map(c => c.id === comp.id ? { ...c, subject: e.target.value } : c))}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 block">{t("Message Body", "Telo správy", "Üzenet törzse")}</label>
              <textarea
                rows={6}
                value={comp.body}
                onChange={(e) => setComposers(prev => prev.map(c => c.id === comp.id ? { ...c, body: e.target.value } : c))}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white resize-none"
              />
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => handleSendEmail(comp)}
                disabled={isSending}
                className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow"
              >
                {isSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} {t("Send Email", "Odoslať e-mail", "E-mail küldése")}
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* TIMELINE SLIDEOUT OVERLAY */}
      {(isTimelineSlideoutOpen || isClosingTimeline) && slideoutLead && (
        <div className={`fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex justify-end ${isClosingTimeline ? "animate-fade-out" : "animate-fade-in"}`}>
          {/* Backdrop click close */}
          <div className="flex-1" onClick={closeTimelineSlideout} />
          
          <div className={`w-[500px] max-w-full bg-white h-full shadow-2xl flex flex-col relative ${isClosingTimeline ? "animate-slide-out-right" : "animate-slide-in-right"}`}>
            {/* Header */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
              <div className="text-left">
                <span className="text-[10px] font-black uppercase text-pink-500 tracking-wider">{t("CRM Detail Timeline", "Detailná časová os CRM", "Részletes CRM idővonal")}</span>
                <h3 className="text-sm font-heading font-black uppercase tracking-tight">{slideoutLead.name}</h3>
              </div>
              <button
                onClick={closeTimelineSlideout}
                className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Timeline List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {isLoadingSlideoutEmails && (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-slate-400">
                  <Loader2 className="animate-spin text-pink-500" size={20} />
                  <span className="text-[9px] font-bold uppercase tracking-wider">{t("Loading correspondences...", "Načítavanie korešpondencie...", "Levelezés betöltése...")}</span>
                </div>
              )}
              {slideoutTimelineEvents.length === 0 ? (
                <div className="text-center text-slate-400 py-12 text-xs font-semibold">
                  {t("No activities or email records logged on timeline.", "Na časovej osi nie sú zaznamenané žiadne aktivity ani e-maily.", "Nincsenek tevékenységek vagy e-mail bejegyzések az idővonalon.")}
                </div>
              ) : (
                <div className="space-y-4 relative border-l-2 border-slate-100 pl-4 text-left">
                  {slideoutTimelineEvents.map((event: any) => {
                    const pmName = event.author || slideoutLead.owner || currentUser?.name || "";
                    const pmColor = projectManagerColors[pmName] || "#6366f1";
                    let dotColor = "bg-blue-600 text-white border-blue-700";
                    let cardBorder = "border-slate-200 bg-slate-50/50";
                    let icon = <Clock size={12} />;

                    if (event.type === "phone") {
                      dotColor = "bg-blue-600 text-white border-blue-700";
                      icon = <Phone size={12} />;
                    } else if (event.type === "email") {
                      dotColor = "bg-indigo-600 text-white border-indigo-700";
                      icon = event.isOutgoing 
                        ? <CornerDownLeft size={12} /> 
                        : <CornerLeftDown size={12} />;
                    } else if (event.type === "note") {
                      dotColor = "bg-amber-500 text-white border-amber-600";
                      icon = <FileText size={12} />;
                    } else if (event.type === "offer") {
                      dotColor = "bg-emerald-600 text-white border-emerald-700";
                      icon = <TrendingUp size={12} />;
                    } else if (event.type === "appointment") {
                      dotColor = "bg-purple-600 text-white border-purple-700";
                      icon = <Calendar size={12} />;
                    }

                    return (
                      <div key={event.id} className="relative space-y-1 pb-1">
                        {/* Dot */}
                        <span className={`absolute -left-[27px] top-1 h-[22px] w-[22px] rounded-full border flex items-center justify-center shadow ${dotColor}`}>
                          {icon}
                        </span>
                        
                        <div className={`border p-3.5 rounded-2xl shadow-xs ${cardBorder}`}>
                           <div className="flex justify-between items-center border-b border-slate-200/50 pb-1 mb-1.5 flex-wrap gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight">{event.title}</span>
                              {event.type === "email" ? (
                                <>
                                  <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 tracking-wider flex items-center gap-1">
                                    {event.isOutgoing ? `📤 ${t("Outgoing", "Odchádzajúce", "Kimenő")}` : `📥 ${t("Incoming", "Prichádzajúce", "Bejövő")}`}
                                  </span>
                                  <span 
                                    className="inline-flex items-center gap-1 text-[8px] font-black uppercase px-2.5 py-0.5 rounded-full border shadow-sm text-white"
                                    style={{ backgroundColor: pmColor, borderColor: pmColor }}
                                  >
                                    @ {pmName}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 tracking-wider">
                                    {event.type === "phone" ? t("Call Logs", "Záznam hovoru", "Hívásnapló")
                                      : event.type === "email" ? t("Email Sent", "E-mail odoslaný", "E-mail elküldve")
                                      : event.type === "note" ? t("Timeline Note", "Poznámka na časovej osi", "Idővonal jegyzet")
                                      : event.type === "offer" ? t("Proposal", "Cenová ponuka", "Ajánlat")
                                      : event.type === "appointment" ? t("Meeting Log", "Záznam stretnutia", "Találkozó napló")
                                      : getTranslation(systemLanguage, `timeline.badge.${event.type}`)}
                                  </span>
                                  <TimelineAuthorBadge
                                    name={event.author}
                                    color={projectManagerColors[event.author || ""]}
                                  />
                                </>
                              )}
                            </div>
                            <span className="text-[8px] text-slate-400 font-extrabold">{formatTimestampLocalized(event.timestamp, systemLanguage)}</span>
                          </div>
                          <TimelineCollapsible
                            language={systemLanguage}
                            isExpanded={expandedTimelineEventIds.has(event.id)}
                            onToggle={() => toggleTimelineEventExpanded(event.id)}
                            fadeClassName="from-slate-50 via-slate-50/70"
                          >
                            <p className="text-[10.5px] text-slate-600 leading-[1.35] font-bold select-text whitespace-pre-wrap">
                              {event.content}
                            </p>
                          </TimelineCollapsible>
                          {event.amount && (
                            <span className="block mt-1 text-[9px] font-black text-emerald-800 uppercase tracking-wider">
                              {t("Worth:", "Hodnota:", "Érték:")} &euro; {event.amount.toLocaleString()}
                            </span>
                          )}
                          {event.extraTime && (
                            <span className="block mt-1 text-[9px] font-black text-rose-800 uppercase tracking-wider">
                              {t("Time:", "Čas:", "Idő:")} {event.extraTime}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CLIENT CREATION SLIDEOUT DRAWER (slides up from bottom) */}
      {(isClientSlideoutOpen || isClosingClient) && (
        <div className={`fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-end justify-center ${isClosingClient ? "animate-fade-out" : "animate-fade-in"}`}>
          {/* Backdrop click close */}
          <div className="fixed inset-0 -z-10" onClick={closeClientSlideout} />
          
          <div className={`w-full max-w-5xl h-[70vh] bg-white rounded-t-[32px] border-t border-slate-200/80 shadow-2xl p-8 flex flex-col justify-between text-left ${isClosingClient ? "animate-slide-out-bottom" : "animate-slide-in-bottom"}`}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div>
                <span className="text-[10px] font-black uppercase text-pink-500 tracking-wider">{t("CRM Client Registration", "Registrácia klienta CRM", "CRM ügyfél regisztráció")}</span>
                <h3 className="text-sm font-heading font-black uppercase tracking-tight">{t("Create New Client from Email", "Vytvoriť nového klienta z e-mailu", "Új ügyfél létrehozása e-mailből")}</h3>
              </div>
              <button
                onClick={closeClientSlideout}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleCreateClientSubmit} className="flex-1 flex flex-col justify-between text-xs font-bold text-slate-700 mt-6">
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("Client Name / Business Name", "Meno klienta / Názov firmy", "Ügyfél neve / Cégnév")}</label>
                    <input
                      type="text"
                      required
                      value={clientFormName}
                      onChange={(e) => setClientFormName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:bg-white font-semibold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("Email Address", "E-mailová adresa", "E-mail cím")}</label>
                    <input
                      type="email"
                      required
                      value={clientFormEmail}
                      onChange={(e) => setClientFormEmail(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:bg-white font-semibold"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("Phone Number", "Telefónne číslo", "Telefonszám")}</label>
                    <input
                      type="tel"
                      value={clientFormPhone}
                      onChange={(e) => setClientFormPhone(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:bg-white font-semibold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("City", "Mesto", "Város")}</label>
                    <input
                      type="text"
                      required
                      value={clientFormCity}
                      onChange={(e) => setClientFormCity(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:bg-white font-semibold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("Client Type", "Typ klienta", "Ügyfél típusa")}</label>
                    <CustomSelect
                      value={clientFormType}
                      onChange={(v) => setClientFormType(v as any)}
                      options={[
                        { value: "person", label: t("Person", "Osoba", "Személy") },
                        { value: "business", label: t("Business", "Firma", "Cég") },
                        { value: "partner", label: t("Partner", "Partner", "Partner") },
                      ]}
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={closeClientSlideout}
                  className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  {t("Cancel", "Zrušiť", "Mégse")}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
                >
                  {t("Save & Match Client", "Uložiť a priradiť klienta", "Mentés és ügyfél párosítása")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};
