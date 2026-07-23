import React, { useState, useEffect, useMemo } from "react";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { 
  Send, Trash2, Search, Mail, Plus, X, Loader2, 
  Reply, CheckCircle2, CircleAlert, Clock, Phone, FileText, Calendar, TrendingUp,
  CornerDownLeft, CornerLeftDown, ChevronDown, ChevronUp, Brain
} from "lucide-react";
import type { Lead, Task, UserProfile } from "../types";
import { formatBytes } from "../utils/formatBytes";

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
  taskStates = ["New", "In progress", "Blocked", "Done"]
}) => {
  const t = (en: string, sk: string, hu: string) => systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;
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

  // Match current selected email to CRM client / lead
  const matchedClient = useMemo(() => {
    if (!selectedEmail) return null;
    const addr = selectedEmail.from?.address?.toLowerCase() || "";
    return leads.find(l => l.email && l.email.toLowerCase() === addr) || null;
  }, [selectedEmail, leads]);
  
  // Filtering & Pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  
  // UI Loaders
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
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
  const [collapsedSummaries, setCollapsedSummaries] = useState<Record<string, boolean>>({});
  const [isLargeFont, setIsLargeFont] = useState(false);

  const toggleSummaryCollapse = (uid: string) => {
    setCollapsedSummaries(prev => ({
      ...prev,
      [uid]: !prev[uid]
    }));
  };

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
            timestamp: new Date().toISOString().replace("T", " ").substring(0, 16),
            title: t("Email Attachment Saved", "Príloha e-mailu uložená", "E-mail melléklet mentve"),
            content: data.extractedText ? `${t("Saved email attachment:", "Uložená príloha e-mailu:", "Mentett e-mail melléklet:")} ${data.fileName}\n\n--- ${t("Document Content", "Obsah dokumentu", "Dokumentum tartalma")} ---\n${data.extractedText}` : `${t("Saved email attachment:", "Uložená príloha e-mailu:", "Mentett e-mail melléklet:")} ${data.fileName}`,
            amount: undefined,
            fileName: data.fileName,
            fileSize: formatBytes(att.size || 0),
            fileType: "offer" as const
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

  const stripHtml = (html: string) => {
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
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
            id: `email-${folderPrefix}-${mail.uid}`,
            type: "email",
            timestamp: mail.date.substring(0, 16),
            title: mail.subject || t("(No Subject)", "(Bez predmetu)", "(Nincs tárgy)"),
            content: `${t("From:", "Od:", "Feladó:")} ${mail.from.name || mail.from.address} <${mail.from.address}>\n\n${t("To view this email or reply, please open the Mail Client.", "Ak chcete zobraziť tento e-mail alebo naň odpovedať, otvorte poštového klienta.", "Az e-mail megtekintéséhez vagy megválaszolásához nyissa meg a levelezőklienst.")}`,
            seen: mail.seen,
            isOutgoing
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
  const loadEmails = async (currPage = 1, currFilter = filter) => {
    if (!userEmailSettings) return;
    setIsLoadingEmails(true);
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
    } catch (err) {
      notify(t("Mail server unreachable", "Poštový server je nedostupný", "A levelezőszerver nem elérhető"), "error");
    } finally {
      setIsLoadingEmails(false);
    }
  };

  // Expand Single message details
  const expandThreadMessage = async (email: any) => {
    if (threadBodies[email.uid]) {
      setSelectedEmail(email);
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
        
        // Mark as seen locally
        setEmails(prev => prev.map(e => e.uid === email.uid ? { ...e, seen: true } : e));
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
      loadEmails(1, filter);
    }, 60000); // UI updates every 60 seconds

    return () => clearInterval(interval);
  }, [userEmailSettings, filter]);

  // Compose a new email
  const openNewComposer = (defaultTo = "", defaultSubject = "", defaultBody = "") => {
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
        notify(t("Email sent successfully!", "E-mail bol úspešne odoslaný!", "Az e-mail sikeresen elküldve!"));
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

  const activeThread = useMemo(() => {
    if (!isThreadedMode || !selectedThreadId) return null;
    return threadedEmails.find(t => t.id === selectedThreadId) || null;
  }, [isThreadedMode, selectedThreadId, threadedEmails]);

  // Toggle expand/collapse inside conversation flow and load detail inline lazily
  const toggleEmailExpand = async (email: any) => {
    const isExpanded = !expandedEmailUids[email.uid];
    setExpandedEmailUids(prev => ({ ...prev, [email.uid]: isExpanded }));
    
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
          // Mark as seen locally
          setEmails(prev => prev.map(e => e.uid === email.uid ? { ...e, seen: true } : e));
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

  return (
    <div className="space-y-6 select-none animate-fade-in text-slate-800">
    {/* Title header */}
    <div className="flex flex-col border-b border-slate-100 pb-4">
      <h2 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
        <Mail className="h-6 w-6 text-pink-600" /> {t("Email Inbox", "Emailová schránka", "E-mail postafiók")}
      </h2>
      <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1">
        {t("Unified SMTP / IMAP inbox connected to your CRM contacts", "Jednotná SMTP / IMAP schránka prepojená s kontaktmi CRM", "Egységes SMTP / IMAP postafiók a CRM kapcsolatokhoz")}
      </p>
    </div>

    <div className={`grid grid-cols-1 lg:grid-cols-12 gap-5 select-none h-[calc(100vh-300px)] items-stretch overflow-hidden animate-slide-up email-view-root ${isLargeFont ? 'email-view-large' : ''}`}>
      <style>{`
        .email-view-large .text-\\[9px\\] { font-size: 12px !important; }
        .email-view-large .text-\\[8px\\] { font-size: 11px !important; }
        .email-view-large .text-\\[7\\.5px\\] { font-size: 10.5px !important; }
        .email-view-large .text-\\[10px\\] { font-size: 13px !important; }
        .email-view-large .text-\\[11px\\] { font-size: 14px !important; }
        .email-view-large .text-xs { font-size: 15px !important; }
        .email-view-large .text-sm { font-size: 17px !important; }
        .email-view-large .text-base { font-size: 19px !important; }
        .email-view-large .text-lg { font-size: 21px !important; }
        .email-view-large .text-xl { font-size: 23px !important; }
        .email-view-large .text-2xl { font-size: 27px !important; }
        .email-view-large h3 { font-size: 17px !important; }
        .email-view-large h4 { font-size: 13px !important; }
        .email-view-large h5 { font-size: 12px !important; }
        .email-view-large p { font-size: 14px !important; }
        .email-view-large button { font-size: 13px !important; }
        .email-view-large input { font-size: 14px !important; }
        .email-view-large select { font-size: 14px !important; }
      `}</style>
      {/* Notifications banner */}
      {notification && (
        <div className={`fixed bottom-4 right-4 z-50 px-5 py-3.5 rounded-2xl flex items-center gap-3 border shadow-2xl ${
          notification.type === "success" ? "bg-emerald-50 border-emerald-250 text-emerald-900" : "bg-rose-50 border-rose-250 text-rose-900"
        }`}>
          {notification.type === "success" ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
          <span className="text-xs font-bold">{notification.text}</span>
        </div>
      )}

      {/* COLUMN 1: Headers List */}
      <div className="lg:col-span-5 glass-panel p-4 rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col h-full max-h-full overflow-hidden">
        {/* Search & Filter Header */}
        <div className="space-y-3 pb-3 border-b border-slate-150">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder={t("Search conversations...", "Hľadať konverzácie...", "Beszélgetések keresése...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => openNewComposer()}
              className="py-2 px-3.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow shrink-0 cursor-pointer"
            >
              <Plus size={14} /> {t("New", "Nový", "Új")}
            </button>
          </div>
          
          <div className="flex items-center justify-between bg-slate-55 p-1 rounded-2xl border border-slate-200/40">
            <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/50 text-[10px] font-black uppercase tracking-wider flex-1 mr-3">
              <button
                onClick={() => setFilter("all")}
                className={`flex-1 py-1.5 rounded-lg transition-all ${filter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {t("All Threads", "Všetky vlákna", "Összes szál")}
              </button>
              <button
                onClick={() => setFilter("unread")}
                className={`flex-1 py-1.5 rounded-lg transition-all ${filter === "unread" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {t("Unread", "Neprečítané", "Olvasatlan")}
              </button>
            </div>
            
            {/* Font Size Toggle Switch */}
            <div className="flex items-center gap-2 select-none border-l border-slate-200 pl-3.5 mr-1">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{t("Font size", "Veľkosť písma", "Betűméret")}</span>
              <button
                type="button"
                onClick={() => setIsLargeFont(prev => !prev)}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-[9px] font-black text-slate-700 uppercase tracking-wider transition-all shadow-2xs flex items-center gap-1 cursor-pointer select-none"
              >
                <span>{isLargeFont ? t("A++ (Big)", "A++ (Veľké)", "A++ (Nagy)") : t("A- (Small)", "A- (Malé)", "A- (Kicsi)")}</span>
              </button>
            </div>

            {/* Threaded Toggle Switch */}
            <div className="flex items-center gap-2 select-none border-l border-slate-200 pl-3.5">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{t("Flow Mode", "Režim toku", "Folyam mód")}</span>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={isThreadedMode} 
                  onChange={(e) => {
                    setIsThreadedMode(e.target.checked);
                    setSelectedEmail(null);
                    setSelectedThreadId(null);
                    setExpandedEmailUids({});
                  }} 
                  className="sr-only peer" 
                />
                <div className="w-8 h-4.5 bg-slate-250 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-pink-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* List of Email Cards */}
        <div className="flex-1 overflow-y-auto space-y-2 pt-3">
          {isLoadingEmails ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
              <Loader2 className="animate-spin text-pink-500" size={24} />
              <span className="text-[10px] font-bold uppercase tracking-wider">{t("Syncing Envelopes...", "Synchronizácia obálok...", "Borítékok szinkronizálása...")}</span>
            </div>
          ) : isThreadedMode ? (
            /* Threaded List View */
            threadedEmails.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs font-semibold">
                {t("No threads found.", "Nenašli sa žiadne vlákna.", "Nincs találat a szálakra.")}
              </div>
            ) : (
              threadedEmails.map(thread => {
                const isSelected = selectedThreadId === thread.id;
                const latest = thread.latestEmail;
                const matchedClient = leads.find(l => l.email && l.email.toLowerCase() === latest.from.address.toLowerCase());
                
                return (
                  <div
                    key={thread.id}
                    onClick={() => {
                      setSelectedThreadId(thread.id);
                      setExpandedEmailUids({ [latest.uid]: true });
                      // Load details for latest message
                      toggleEmailExpand(latest);
                    }}
                    className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all flex flex-col gap-1.5 ${
                      isSelected 
                        ? "border-pink-300 bg-pink-50/20 shadow-sm" 
                        : !thread.seen 
                          ? "border-slate-200 bg-white font-black shadow-sm" 
                          : "border-slate-100 bg-white/40 text-slate-600"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-1">
                      <span className={`text-[12px] truncate max-w-[170px] ${!thread.seen ? "text-slate-900 font-extrabold" : "text-slate-800"}`}>
                        {latest.isSent ? (
                          <><span className="text-slate-400 font-bold">{t("To:", "Komu:", "Címzett:")}</span> {latest.to?.name || latest.to?.address || t("Unknown", "Neznámy", "Ismeretlen")}</>
                        ) : (
                          <><span className="text-slate-400 font-bold">{t("From:", "Od:", "Feladó:")}</span> {latest.from.name || latest.from.address}</>
                        )}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[8.5px] font-extrabold bg-pink-100/80 text-pink-700 px-1.5 py-0.5 rounded-md leading-none">
                          {thread.emails.length} msg
                        </span>
                        <span className="text-[8.5px] text-slate-400 font-semibold">
                          {new Date(thread.date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <GeometricIcon emailString={latest.isSent ? (latest.to?.address || "") : latest.from.address} />
                      <span className={`text-[11px] truncate max-w-[240px] ${!thread.seen ? "text-slate-900 font-bold" : "text-slate-700"}`}>
                        {thread.subject}
                      </span>
                    </div>

                    {matchedClient && (
                      <span className="w-fit text-[8px] font-black uppercase tracking-widest text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-250">
                        🤝 {t("CRM Match:", "Zhoda CRM:", "CRM egyezés:")} {matchedClient.name}
                      </span>
                    )}

                    {isOpenAiKeySet && (
                      <div className="mt-1.5 p-2 bg-purple-50/50 border border-purple-150 rounded-xl flex items-start gap-1.5 text-left animate-fade-in">
                        <Brain className="h-3.5 w-3.5 text-purple-650 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          {loadingSummaries[`thread-${thread.id}`] ? (
                            <span className="text-[8.5px] text-purple-600 font-bold uppercase tracking-wider animate-pulse block">{t("Analyzing flow...", "Analyzuje sa tok...", "Folyam elemzése...")}</span>
                          ) : summaries[`thread-${thread.id}`] ? (
                            <p className="text-[9.5px] text-purple-850 font-semibold leading-normal">{summaries[`thread-${thread.id}`]}</p>
                          ) : (
                            <span className="text-[8.5px] text-purple-400 italic">{t("No summary available.", "Súhrn nie je k dispozícii.", "Nincs elérhető összefoglaló.")}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )
          ) : (
            /* Unthreaded List View */
            filteredIndividualEmails.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs font-semibold">
                {t("No conversations found.", "Nenašli sa žiadne konverzácie.", "Nincs találat a beszélgetésekre.")}
              </div>
            ) : (
              filteredIndividualEmails.map(email => {
                const isSelected = selectedEmail?.uid === email.uid;
                const matchedClient = leads.find(l => l.email && l.email.toLowerCase() === email.from.address.toLowerCase());
                
                return (
                  <div
                    key={email.uid}
                    onClick={() => expandThreadMessage(email)}
                    className={`p-3 rounded-2xl border text-left cursor-pointer transition-all flex flex-col gap-1.5 ${
                      isSelected 
                        ? "border-pink-300 bg-pink-50/20 shadow-sm" 
                        : !email.seen 
                          ? "border-slate-200 bg-white font-black shadow-xs" 
                          : "border-slate-100 bg-white/30 text-slate-600"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-1">
                      <span className={`text-[12px] truncate max-w-[200px] ${!email.seen ? "text-slate-900 font-extrabold" : "text-slate-800"}`}>
                        {email.isSent ? (
                          <><span className="text-slate-400 font-bold">{t("To:", "Komu:", "Címzett:")}</span> {email.to?.name || email.to?.address || t("Unknown", "Neznámy", "Ismeretlen")}</>
                        ) : (
                          <><span className="text-slate-400 font-bold">{t("From:", "Od:", "Feladó:")}</span> {email.from.name || email.from.address}</>
                        )}
                      </span>
                      <span className="text-[9px] text-slate-400 font-medium shrink-0">
                        {new Date(email.date).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <GeometricIcon emailString={email.isSent ? (email.to?.address || "") : email.from.address} />
                      <span className={`text-[11px] truncate max-w-[260px] ${!email.seen ? "text-slate-900 font-bold" : "text-slate-700"}`}>
                        {email.isSent ? "📤 " : "📥 "}{email.subject || t("(No Subject)", "(Bez predmetu)", "(Nincs tárgy)")}
                      </span>
                    </div>

                    {matchedClient && (
                      <span className="w-fit text-[8px] font-black uppercase tracking-widest text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-250">
                        🤝 {t("CRM Match:", "Zhoda CRM:", "CRM egyezés:")} {matchedClient.name}
                      </span>
                    )}

                    {isOpenAiKeySet && (
                      <div className="mt-1.5 p-2 bg-purple-50/50 border border-purple-150 rounded-xl flex items-start gap-1.5 text-left animate-fade-in">
                        <Brain className="h-3.5 w-3.5 text-purple-650 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          {loadingSummaries[email.uid] ? (
                            <span className="text-[8.5px] text-purple-600 font-bold uppercase tracking-wider animate-pulse block">{t("Analyzing email...", "Analyzuje sa e-mail...", "E-mail elemzése...")}</span>
                          ) : summaries[email.uid] ? (
                            <p className="text-[9.5px] text-purple-850 font-semibold leading-normal">{summaries[email.uid]}</p>
                          ) : (
                            <span className="text-[8.5px] text-purple-400 italic">{t("No summary available.", "Súhrn nie je k dispozícii.", "Nincs elérhető összefoglaló.")}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )
          )}
        </div>
      </div>

      {/* COLUMN 2: Mail Detail / Conversation flow Detail Pane */}
      <div className="lg:col-span-7 glass-panel p-4 rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col h-full max-h-full overflow-hidden">
        {isThreadedMode ? (
          /* Render Thread Flow */
          activeThread ? (
            <div className="h-full flex flex-col justify-between overflow-hidden">
              {/* Thread Header */}
              <div className="border-b border-slate-150 pb-3 flex items-center justify-between shrink-0 text-left">
                <div>
                  <h3 className="text-sm font-heading font-black text-slate-900 uppercase tracking-tight">{activeThread.subject}</h3>
                  <span className="text-[9px] text-slate-400 font-bold tracking-wider uppercase block mt-1">
                    {t("Thread Flow", "Tok vlákna", "Szál folyama")} ({activeThread.emails.length} {t("correspondence units", "jednotiek korešpondencie", "levelezési egység")})
                  </span>
                </div>
                
                {/* Global reply button to latest sender */}
                <button
                  onClick={() => openNewComposer(activeThread.latestEmail.from.address, `Re: ${activeThread.subject}`)}
                  className="px-3.5 py-1.5 rounded-xl border border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100 hover:text-pink-800 text-[10px] font-black uppercase flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                >
                  <Reply size={13} />
                  {t("Reply Thread", "Odpovedať na vlákno", "Válasz a szálra")}
                </button>
              </div>

              {/* CRM Match Info card */}
              {(() => {
                const client = leads.find(l => l.email && l.email.toLowerCase() === activeThread.latestEmail.from.address.toLowerCase());
                if (!client) {
                  const latest = activeThread.latestEmail;
                  const senderEmail = latest.from.address;
                  const senderName = latest.from.name || "";
                  return (
                    <div className="bg-slate-50 border border-slate-205 p-3 rounded-2xl flex items-center justify-between gap-3 text-left mt-3 shrink-0 animate-fade-in shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">👤</span>
                        <div>
                          <h4 className="text-[9px] font-black text-slate-505 uppercase tracking-tight">{t("Unmatched Sender", "Nepriradený odosielateľ", "Nem párosított feladó")}</h4>
                          <p className="text-[10.5px] text-slate-655 font-bold mt-0.5">
                            {t("Email", "E-mail", "E-mail")} <span className="text-slate-900 font-extrabold">{senderEmail}</span> {t("is not registered.", "nie je registrovaný.", "nincs regisztrálva.")}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setClientFormEmail(senderEmail);
                          setClientFormName(senderName);
                          setClientFormCity("");
                          setClientFormPhone("");
                          setClientFormType("person");
                          setIsClientSlideoutOpen(true);
                        }}
                        style={{ backgroundColor: "#6366f1", color: "#ffffff" }}
                        className="px-2.5 py-1.5 hover:bg-indigo-700 rounded-xl text-[9px] font-black uppercase tracking-wider cursor-pointer transition-all shadow-sm"
                      >
                        {t("Create Client", "Vytvoriť klienta", "Ügyfél létrehozása")}
                      </button>
                    </div>
                  );
                }
                return (
                  <div className="bg-emerald-50 border border-emerald-250 p-3 rounded-2xl flex items-center justify-between gap-3 text-left mt-3 shrink-0 animate-fade-in shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🤝</span>
                      <div>
                        <h4 className="text-[9px] font-black text-emerald-950 uppercase tracking-tight">{t("CRM Client / Lead", "Klient CRM / Záujemca", "CRM ügyfél / Érdeklődő")}</h4>
                        <p className="text-[10.5px] text-emerald-850 font-extrabold mt-0.5">
                          {t("Name:", "Meno:", "Név:")} <span className="text-emerald-950 font-black">{client.name}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setSlideoutLead(client);
                          setIsTimelineSlideoutOpen(true);
                        }}
                        className="px-2.5 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 rounded-xl text-[9px] font-black uppercase tracking-wider cursor-pointer"
                      >
                        {t("Timeline", "Časová os", "Idővonal")}
                      </button>
                      <button
                        onClick={() => window.location.hash = `client-${encodeURIComponent(client.name)}`}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[9px] font-black uppercase tracking-wider cursor-pointer"
                      >
                        {t("Profile", "Profil", "Profil")}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Message cards chronological flow */}
              <div className="flex-1 overflow-y-auto space-y-3 py-4 pr-1 scrollbar-thin">
                {isOpenAiKeySet && activeThread && (
                  <div className="p-3.5 bg-purple-50/60 border border-purple-250 rounded-2xl flex flex-col gap-2.5 text-left animate-fade-in shadow-xs mb-1">
                    <div className="flex items-start gap-2.5">
                      <Brain className="h-4.5 w-4.5 text-purple-650 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 flex-1">
                        <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSummaryCollapse(`thread-${activeThread.id}`)}>
                          <h4 className="text-[10px] font-black text-purple-950 uppercase tracking-tight">{t("AI Flow Summary", "AI súhrn toku", "AI folyam összefoglaló")}</h4>
                          <span className="text-purple-600 hover:text-purple-800 transition-colors">
                            {collapsedSummaries[`thread-${activeThread.id}`] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                          </span>
                        </div>
                        {!collapsedSummaries[`thread-${activeThread.id}`] && (
                          <>
                            {loadingSummaries[`thread-${activeThread.id}`] ? (
                              <div className="flex items-center gap-1.5 py-1">
                                <Loader2 className="h-3 w-3 animate-spin text-purple-600" />
                                <span className="text-[10px] text-purple-700 font-bold uppercase tracking-wider">{t("Analyzing conversation flow...", "Analyzuje sa tok konverzácie...", "Beszélgetés folyamának elemzése...")}</span>
                              </div>
                            ) : summaries[`thread-${activeThread.id}`] ? (
                              <p className="text-[11.5px] text-purple-850 font-bold leading-relaxed">{summaries[`thread-${activeThread.id}`]}</p>
                            ) : (
                              <p className="text-[10.5px] text-purple-500 italic">{t("No summary generated yet.", "Zatiaľ nebol vygenerovaný žiadny súhrn.", "Még nem készült összefoglaló.")}</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    
                    {!collapsedSummaries[`thread-${activeThread.id}`] && actionItemsMap[`thread-${activeThread.id}`] && actionItemsMap[`thread-${activeThread.id}`].length > 0 && (
                      <div className="mt-2 pt-2.5 border-t border-purple-200/50 space-y-2">
                        <h5 className="text-[9px] font-black uppercase text-purple-955 tracking-wider flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-purple-600" />
                          {t("Suggested Tasks", "Navrhované úlohy", "Javasolt feladatok")}
                        </h5>
                        <div className="flex flex-wrap gap-1.5">
                          {actionItemsMap[`thread-${activeThread.id}`].map((item, idx) => {
                            const matchingTask = tasks.find(t => t.title === item);
                            const isCreated = !!matchingTask;
                            const assignedUser = matchingTask && matchingTask.assignedUsers && matchingTask.assignedUsers.length > 0
                              ? matchingTask.assignedUsers[0]
                              : null;
                            const threadLead = leads.find(l => l.email && l.email.toLowerCase() === activeThread.latestEmail.from.address.toLowerCase()) || null;
                            return (
                              <div key={idx} className="relative flex items-center gap-1.5 px-2.5 py-1 bg-white/70 border border-purple-150/40 rounded-full text-[10px] text-purple-900 font-bold hover:bg-white transition-all select-none">
                                <span>{item}</span>
                                {isCreated ? (
                                  <span className="shrink-0 flex items-center gap-1 text-[8px] font-black uppercase text-emerald-600 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                                    {assignedUser ? `✓ ${assignedUser.substring(0, 2).toUpperCase()}` : "✓"}
                                  </span>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => setAssigningActionItem(assigningActionItem?.item === item ? null : { item, emailUid: `thread-${activeThread.id}` })}
                                      className="shrink-0 text-[8.5px] font-black text-purple-700 hover:text-purple-900 bg-purple-100/80 hover:bg-purple-200/80 px-1.5 py-0.5 rounded-md border border-purple-250/30 cursor-pointer"
                                    >
                                      + {t("Assign", "Priradiť", "Hozzárendel")}
                                    </button>
                                    
                                    {assigningActionItem?.item === item && assigningActionItem?.emailUid === `thread-${activeThread.id}` && (
                                      <>
                                        <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setAssigningActionItem(null)} />
                                        <div className="absolute left-0 bottom-full mb-1.5 z-50 bg-white border border-slate-250 rounded-xl shadow-2xl p-1 w-[140px] max-h-[150px] overflow-y-auto">
                                          {users.map(u => (
                                            <button
                                              key={u.name}
                                              type="button"
                                              onClick={() => {
                                                handleAddEmailActionItemAsTask(item, `thread-${activeThread.id}`, threadLead, u.name);
                                                setAssigningActionItem(null);
                                              }}
                                              className="w-full text-left px-2 py-1 hover:bg-slate-50 rounded-lg text-[9px] font-black text-slate-700 uppercase tracking-wider cursor-pointer flex items-center gap-1.5"
                                            >
                                              <div className="h-4.5 w-4.5 rounded-full bg-indigo-50 border border-indigo-200/40 text-indigo-600 flex items-center justify-center text-[7.5px] font-black shrink-0">
                                                {u.name.substring(0, 2).toUpperCase()}
                                              </div>
                                              <span className="truncate">{u.name}</span>
                                            </button>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {activeThread.emails.map((email) => {
                  const isExpanded = !!expandedEmailUids[email.uid];
                  const bodyObj = threadBodies[email.uid];
                  const isOut = email.isSent;

                  return (
                    <div 
                      key={email.uid} 
                      className={`border rounded-2xl overflow-hidden shadow-sm transition-all duration-200 text-left ${
                        isExpanded ? "border-slate-205 bg-slate-50/10" : "border-slate-150 hover:bg-slate-50/20 bg-white"
                      }`}
                    >
                      {/* Email Header line */}
                      <div 
                        onClick={() => toggleEmailExpand(email)}
                        className={`p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none ${
                          isExpanded ? "bg-slate-50 border-b border-slate-200/80" : "bg-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 text-xs font-black ${
                            isOut ? "bg-pink-100 text-pink-700" : "bg-indigo-100 text-indigo-700"
                          }`}>
                            {isOut ? "📤" : "📥"}
                          </span>
                          <div className="min-w-0">
                            <span className="text-[11px] font-extrabold text-slate-800 truncate block">
                              {isOut ? `${t("To:", "Komu:", "Címzett:")} ${email.to?.name || email.to?.address}` : `${t("From:", "Od:", "Feladó:")} ${email.from.name || email.from.address}`}
                            </span>
                            <span className="text-[9px] text-slate-400 block mt-0.5">
                              {email.subject || t("(No Subject)", "(Bez predmetu)", "(Nincs tárgy)")}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3.5 shrink-0">
                          <span className="text-[9px] text-slate-400 font-bold">
                            {new Date(email.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                          
                          {/* Mini Expand Icon */}
                          <div className="text-slate-400 hover:text-slate-700">
                            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </div>
                        </div>
                      </div>

                      {/* Email Card Body content */}
                      {isExpanded && (
                        <div className="p-4 bg-white min-h-[150px]">
                          {isOpenAiKeySet && bodyObj && (
                            <div className="mb-3.5 p-3 bg-purple-50/60 border border-purple-200 rounded-xl flex flex-col gap-2.5 text-left animate-fade-in shadow-2xs">
                              <div className="flex items-start gap-2">
                                <Brain className="h-4.5 w-4.5 text-purple-650 shrink-0 mt-0.5" />
                                <div className="space-y-0.5 flex-1">
                                  <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSummaryCollapse(email.uid)}>
                                    <h4 className="text-[9px] font-black text-purple-950 uppercase tracking-tight">{t("AI Mail Summary", "AI súhrn e-mailu", "AI e-mail összefoglaló")}</h4>
                                    <span className="text-purple-600 hover:text-purple-800 transition-colors">
                                      {collapsedSummaries[email.uid] ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                                    </span>
                                  </div>
                                  {!collapsedSummaries[email.uid] && (
                                    <>
                                      {loadingSummaries[email.uid] ? (
                                        <div className="flex items-center gap-1.5 py-0.5">
                                          <Loader2 className="animate-spin text-purple-500" size={16} />
                                          <span className="text-[9px] text-purple-600 font-bold uppercase tracking-wider">{t("Analyzing email content...", "Analyzuje sa obsah e-mailu...", "E-mail tartalmának elemzése...")}</span>
                                        </div>
                                      ) : summaries[email.uid] ? (
                                        <p className="text-[10px] text-purple-850 font-bold leading-normal">{summaries[email.uid]}</p>
                                      ) : (
                                        <p className="text-[9.5px] text-purple-400 italic">{t("No summary available.", "Súhrn nie je k dispozícii.", "Nincs elérhető összefoglaló.")}</p>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>

                              {!collapsedSummaries[email.uid] && actionItemsMap[email.uid] && actionItemsMap[email.uid].length > 0 && (
                                <div className="mt-1.5 pt-2 border-t border-purple-200/50 space-y-2">
                                  <h5 className="text-[8px] font-black uppercase text-purple-955 tracking-wider flex items-center gap-1">
                                    <CheckCircle2 className="h-2.5 w-2.5 text-purple-600" />
                                    {t("Suggested Tasks", "Navrhované úlohy", "Javasolt feladatok")}
                                  </h5>
                                  <div className="flex flex-wrap gap-1.5">
                                    {actionItemsMap[email.uid].map((item, idx) => {
                                      const matchingTask = tasks.find(t => t.title === item);
                                      const isCreated = !!matchingTask;
                                      const assignedUser = matchingTask && matchingTask.assignedUsers && matchingTask.assignedUsers.length > 0
                                        ? matchingTask.assignedUsers[0]
                                        : null;
                                      const msgLead = leads.find(l => l.email && l.email.toLowerCase() === email.from.address.toLowerCase()) || null;
                                      return (
                                        <div key={idx} className="relative flex items-center gap-1.5 px-2 py-0.5 bg-white/70 border border-purple-150/40 rounded-full text-[9px] text-purple-900 font-bold hover:bg-white transition-all select-none">
                                          <span>{item}</span>
                                          {isCreated ? (
                                            <span className="shrink-0 text-[7.5px] font-black uppercase text-emerald-600 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded">
                                              {assignedUser ? `✓ ${assignedUser.substring(0, 2).toUpperCase()}` : "✓"}
                                            </span>
                                          ) : (
                                            <>
                                              <button
                                                onClick={() => setAssigningActionItem(assigningActionItem?.item === item ? null : { item, emailUid: email.uid })}
                                                className="shrink-0 text-[8px] font-black text-purple-700 hover:text-white bg-purple-100/80 hover:bg-purple-600 px-1.5 py-0.5 rounded-md border border-purple-200 transition-all cursor-pointer"
                                              >
                                                + {t("Add", "Pridať", "Hozzáad")}
                                              </button>
                                              
                                              {assigningActionItem?.item === item && assigningActionItem?.emailUid === email.uid && (
                                                <>
                                                  <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setAssigningActionItem(null)} />
                                                  <div className="absolute left-0 bottom-full mb-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl p-1 w-[130px] max-h-[140px] overflow-y-auto">
                                                    {users.map(u => (
                                                      <button
                                                        key={u.name}
                                                        type="button"
                                                        onClick={() => {
                                                          handleAddEmailActionItemAsTask(item, email.uid, msgLead, u.name);
                                                          setAssigningActionItem(null);
                                                        }}
                                                        className="w-full text-left px-2 py-1 hover:bg-slate-50 rounded-lg text-[8px] font-black text-slate-700 uppercase tracking-wider cursor-pointer flex items-center gap-1"
                                                      >
                                                        <div className="h-4.5 w-4.5 rounded-full bg-indigo-50 border border-indigo-200/40 text-indigo-600 flex items-center justify-center text-[7.5px] font-black shrink-0">
                                                          {u.name.substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <span className="truncate">{u.name}</span>
                                                      </button>
                                                    ))}
                                                  </div>
                                                </>
                                              )}
                                            </>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {bodyObj && bodyObj.attachments && bodyObj.attachments.length > 0 && (
                            <div className="mb-3.5 p-3 bg-amber-50/40 border border-amber-250 rounded-xl flex flex-col gap-2 text-left animate-fade-in shadow-2xs">
                              <h5 className="text-[9px] font-black uppercase text-amber-900 tracking-wider flex items-center gap-1">
                                <FileText className="h-3 w-3 text-amber-700" />
                                {t("Attachments", "Prílohy", "Mellékletek")} ({bodyObj.attachments.length})
                              </h5>
                              <div className="flex flex-wrap gap-2">
                                {bodyObj.attachments.map((att: any, attIdx: number) => {
                                  const msgLead = leads.find(l => l.email && l.email.toLowerCase() === email.from.address.toLowerCase()) || null;
                                  return (
                                    <div key={attIdx} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-amber-200 rounded-xl text-[10px] font-bold text-slate-800 shadow-3xs">
                                      <span className="truncate max-w-[150px]">{att.name} ({formatBytes(att.size)})</span>
                                      <button
                                        onClick={() => handleDownloadAttachment(email.uid, email.isSent ? 'Sent' : activeFolder, att)}
                                        className="text-amber-700 hover:text-amber-900 font-extrabold uppercase text-[8px] cursor-pointer"
                                      >
                                        {t("Download", "Stiahnuť", "Letöltés")}
                                      </button>
                                      <span className="text-slate-350">|</span>
                                      <button
                                        onClick={() => handleAddAttachmentToDocs(email.uid, email.isSent ? 'Sent' : activeFolder, att, msgLead)}
                                        className="text-emerald-700 hover:text-emerald-900 font-extrabold uppercase text-[8px] cursor-pointer"
                                      >
                                        {t("Add to Docs", "Pridať do dokumentov", "Hozzáadás a dokumentumokhoz")}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {isLoadingDetail && !bodyObj ? (
                            <div className="flex items-center justify-center py-6 gap-2 text-slate-400">
                              <Loader2 className="animate-spin text-pink-500" size={16} />
                              <span className="text-[9px] font-bold uppercase tracking-wider">{t("Decoding part...", "Dekódovanie časti...", "Rész dekódolása...")}</span>
                            </div>
                          ) : bodyObj ? (
                            <iframe 
                              className="w-full min-h-[220px] max-h-[400px] border-0 bg-transparent"
                              title={`Thread body ${email.uid}`}
                              sandbox=""
                              srcDoc={`
                                <html>
                                  <head>
                                    <style>
                                      body {
                                        font-family: system-ui, -apple-system, sans-serif;
                                        color: #1e293b;
                                        line-height: 1.5;
                                        font-size: ${isLargeFont ? '15.5px' : '12.5px'};
                                        margin: 0;
                                        padding: 4px;
                                      }
                                      a { color: #db2777; text-decoration: none; }
                                      blockquote { border-left: 2px solid #cbd5e1; padding-left: 10px; color: #64748b; margin: 8px 0; }
                                    </style>
                                  </head>
                                  <body>
                                    ${bodyObj.html || bodyObj.text || ''}
                                  </body>
                                </html>
                              `}
                            />
                          ) : (
                            <div className="text-center py-6 text-[10px] font-bold text-slate-400 uppercase">
                              {t("Content not found.", "Obsah sa nenašiel.", "A tartalom nem található.")}
                            </div>
                          )}
                          
                          {/* Footer Action items inside card */}
                          <div className="mt-3.5 pt-3 border-t border-slate-100 flex justify-end gap-2.5">
                            <button
                              onClick={() => openNewComposer(email.from.address, `Re: ${email.subject}`)}
                              className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-[9px] font-bold text-slate-600 hover:text-slate-800 rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <Reply size={11} /> {t("Reply", "Odpovedať", "Válasz")}
                            </button>
                            <button
                              onClick={() => handleDeleteEmail(email.uid)}
                              className="px-3 py-1.5 border border-rose-200 bg-white hover:bg-rose-50 text-[9px] font-bold text-rose-600 hover:text-rose-800 rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <Trash2 size={11} /> {t("Delete", "Odstrániť", "Törlés")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <Mail size={40} className="stroke-[1.5] text-slate-350 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("Select a threaded conversation flow", "Vyberte tok vlákna konverzácie", "Válasszon egy beszélgetésszálat")}</span>
            </div>
          )
        ) : (
          /* Render Traditional Unthreaded Details */
          isLoadingDetail ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
              <Loader2 className="animate-spin text-pink-500" size={32} />
              <span className="text-[10px] font-bold uppercase tracking-wider">{t("Decoding Message...", "Dekódovanie správy...", "Üzenet dekódolása...")}</span>
            </div>
          ) : selectedEmail ? (() => {
            const bodyObj = threadBodies[selectedEmail.uid];
            
            return (
              <div className="h-full flex flex-col justify-between overflow-hidden">
                {/* Header */}
                <div className="border-b border-slate-150 pb-3 flex items-center justify-between gap-3 shrink-0">
                  <div className="text-left">
                    <h3 className="text-sm font-heading font-black text-slate-900 uppercase tracking-tight">{selectedEmail.subject || t("(No Subject)", "(Bez predmetu)", "(Nincs tárgy)")}</h3>
                    <p className="text-[10px] text-slate-500 font-bold mt-1">
                      {t("From:", "Od:", "Feladó:")} <strong className="text-slate-800">{selectedEmail.from.name || selectedEmail.from.address}</strong> &lt;{selectedEmail.from.address}&gt;
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openNewComposer(selectedEmail.from.address, `Re: ${selectedEmail.subject}`)}
                      className="p-2 hover:bg-slate-100 text-slate-655 rounded-xl border border-slate-250 hover:text-slate-900 cursor-pointer"
                      title={t("Reply", "Odpovedať", "Válasz")}
                    >
                      <Reply size={15} />
                    </button>
                    <button
                      onClick={() => handleDeleteEmail(selectedEmail.uid)}
                      className="p-2 hover:bg-rose-50 text-rose-655 rounded-xl border border-rose-250 hover:text-rose-700 cursor-pointer"
                      title={t("Delete Message", "Odstrániť správu", "Üzenet törlése")}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* CRM Match Card */}
                {matchedClient ? (
                  <div className="bg-emerald-50 border border-emerald-250 p-3.5 rounded-2xl flex items-center justify-between gap-3 text-left mt-3 shrink-0 animate-fade-in shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🤝</span>
                      <div>
                        <h4 className="text-[10px] font-black text-emerald-950 uppercase tracking-tight">{t("CRM Client / Lead", "Klient CRM / Záujemca", "CRM ügyfél / Érdeklődő")}</h4>
                        <p className="text-[11px] text-emerald-850 font-extrabold mt-0.5">
                          {t("Name:", "Meno:", "Név:")} <span className="text-emerald-950 font-black">{matchedClient.name}</span> ({matchedClient.email})
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setSlideoutLead(matchedClient);
                          setIsTimelineSlideoutOpen(true);
                        }}
                        className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer"
                      >
                        {t("View Timeline", "Zobraziť časovú os", "Idővonal megtekintése")}
                      </button>
                      <button
                        onClick={() => {
                          window.location.hash = `client-${encodeURIComponent(matchedClient.name)}`;
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                      >
                        {t("Open Client", "Otvoriť klienta", "Ügyfél megnyitása")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-205 p-3.5 rounded-2xl flex items-center justify-between gap-3 text-left mt-3 shrink-0 animate-fade-in shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">👤</span>
                      <div>
                        <h4 className="text-[10px] font-black text-slate-505 uppercase tracking-tight">{t("Unmatched Sender", "Nepriradený odosielateľ", "Nem párosított feladó")}</h4>
                        <p className="text-[11px] text-slate-655 font-bold mt-0.5">
                          {t("Email", "E-mail", "E-mail")} <span className="text-slate-900 font-extrabold">{selectedEmail.from.address}</span> {t("is not registered in CRM.", "nie je registrovaný v CRM.", "nincs regisztrálva a CRM-ben.")}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setClientFormEmail(selectedEmail.from.address);
                        setClientFormName(selectedEmail.from.name || "");
                        setClientFormCity("");
                        setClientFormPhone("");
                        setClientFormType("person");
                        setIsClientSlideoutOpen(true);
                      }}
                      style={{ backgroundColor: "#6366f1", color: "#ffffff" }}
                      className="px-3 py-1.5 hover:bg-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                    >
                      {t("Create Client", "Vytvoriť klienta", "Ügyfél létrehozása")}
                    </button>
                  </div>
                )}

                {isOpenAiKeySet && bodyObj && (
                  <div className="mt-3 p-3.5 bg-purple-50/60 border border-purple-250 rounded-2xl flex flex-col gap-2.5 text-left animate-fade-in shadow-xs">
                    <div className="flex items-start gap-2.5">
                      <Brain className="h-4.5 w-4.5 text-purple-650 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 flex-1">
                        <div className="flex justify-between items-center cursor-pointer select-none" onClick={() => toggleSummaryCollapse(selectedEmail.uid)}>
                          <h4 className="text-[10px] font-black text-purple-955 uppercase tracking-tight">{t("AI Mail Summary", "AI súhrn e-mailu", "AI e-mail összefoglaló")}</h4>
                          <span className="text-purple-650 hover:text-purple-855 transition-colors">
                            {collapsedSummaries[selectedEmail.uid] ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                          </span>
                        </div>
                        {!collapsedSummaries[selectedEmail.uid] && (
                          <>
                            {loadingSummaries[selectedEmail.uid] ? (
                              <div className="flex items-center gap-1.5 py-1">
                                <Loader2 className="h-3 w-3 animate-spin text-purple-600" />
                                <span className="text-[10px] text-purple-700 font-bold uppercase tracking-wider">{t("Analyzing email content...", "Analyzuje sa obsah e-mailu...", "E-mail tartalmának elemzése...")}</span>
                              </div>
                            ) : summaries[selectedEmail.uid] ? (
                              <p className="text-[11px] text-purple-850 font-bold leading-relaxed">{summaries[selectedEmail.uid]}</p>
                            ) : (
                              <p className="text-[10.5px] text-purple-500 italic">{t("No summary available.", "Súhrn nie je k dispozícii.", "Nincs elérhető összefoglaló.")}</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {!collapsedSummaries[selectedEmail.uid] && actionItemsMap[selectedEmail.uid] && actionItemsMap[selectedEmail.uid].length > 0 && (
                      <div className="mt-2 pt-2.5 border-t border-purple-200/50 space-y-2">
                        <h5 className="text-[9px] font-black uppercase text-purple-955 tracking-wider flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-purple-600" />
                          {t("Suggested Tasks", "Navrhované úlohy", "Javasolt feladatok")}
                        </h5>
                        <div className="flex flex-wrap gap-1.5">
                          {actionItemsMap[selectedEmail.uid].map((item, idx) => {
                            const matchingTask = tasks.find(t => t.title === item);
                            const isCreated = !!matchingTask;
                            const assignedUser = matchingTask && matchingTask.assignedUsers && matchingTask.assignedUsers.length > 0
                              ? matchingTask.assignedUsers[0]
                              : null;
                            return (
                              <div key={idx} className="relative flex items-center gap-1.5 px-2.5 py-1 bg-white/70 border border-purple-150/40 rounded-full text-[10px] text-purple-900 font-bold hover:bg-white transition-all select-none">
                                <span>{item}</span>
                                {isCreated ? (
                                  <span className="shrink-0 flex items-center gap-1 text-[8px] font-black uppercase text-emerald-600 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md">
                                    {assignedUser ? `✓ ${assignedUser.substring(0, 2).toUpperCase()}` : "✓"}
                                  </span>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => setAssigningActionItem(assigningActionItem?.item === item ? null : { item, emailUid: selectedEmail.uid })}
                                      className="shrink-0 text-[8.5px] font-black text-purple-700 hover:text-purple-900 bg-purple-100/80 hover:bg-purple-200/80 px-1.5 py-0.5 rounded-md border border-purple-250/30 cursor-pointer"
                                    >
                                      + {t("Assign", "Priradiť", "Hozzárendel")}
                                    </button>
                                    
                                    {assigningActionItem?.item === item && assigningActionItem?.emailUid === selectedEmail.uid && (
                                      <>
                                        <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setAssigningActionItem(null)} />
                                        <div className="absolute left-0 bottom-full mb-1.5 z-50 bg-white border border-slate-250 rounded-xl shadow-2xl p-1 w-[140px] max-h-[150px] overflow-y-auto">
                                          {users.map(u => (
                                            <button
                                              key={u.name}
                                              type="button"
                                              onClick={() => {
                                                handleAddEmailActionItemAsTask(item, selectedEmail.uid, matchedClient, u.name);
                                                setAssigningActionItem(null);
                                              }}
                                              className="w-full text-left px-2 py-1 hover:bg-slate-50 rounded-lg text-[9px] font-black text-slate-700 uppercase tracking-wider cursor-pointer flex items-center gap-1.5"
                                            >
                                              <div className="h-4.5 w-4.5 rounded-full bg-indigo-50 border border-indigo-200/40 text-indigo-600 flex items-center justify-center text-[7.5px] font-black shrink-0">
                                                {u.name.substring(0, 2).toUpperCase()}
                                              </div>
                                              <span className="truncate">{u.name}</span>
                                            </button>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {bodyObj && bodyObj.attachments && bodyObj.attachments.length > 0 && (
                  <div className="mt-3 p-3.5 bg-amber-50/40 border border-amber-250 rounded-2xl flex flex-col gap-2 text-left animate-fade-in shadow-xs">
                    <h5 className="text-[9px] font-black uppercase text-amber-900 tracking-wider flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5 text-amber-700" />
                      {t("Attachments", "Prílohy", "Mellékletek")} ({bodyObj.attachments.length})
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      {bodyObj.attachments.map((att: any, attIdx: number) => {
                        return (
                          <div key={attIdx} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-amber-200 rounded-xl text-[10px] font-bold text-slate-800 shadow-2xs">
                            <span className="truncate max-w-[200px]">{att.name} ({formatBytes(att.size)})</span>
                            <button
                              onClick={() => handleDownloadAttachment(selectedEmail.uid, selectedEmail.isSent ? 'Sent' : activeFolder, att)}
                              className="text-amber-700 hover:text-amber-900 font-extrabold uppercase text-[8px] cursor-pointer"
                            >
                              {t("Download", "Stiahnuť", "Letöltés")}
                            </button>
                            <span className="text-slate-355">|</span>
                            <button
                              onClick={() => handleAddAttachmentToDocs(selectedEmail.uid, selectedEmail.isSent ? 'Sent' : activeFolder, att, matchedClient)}
                              className="text-emerald-700 hover:text-emerald-900 font-extrabold uppercase text-[8px] cursor-pointer"
                            >
                              {t("Add to Docs", "Pridať do dokumentov", "Hozzáadás a dokumentumokhoz")}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* parsed email iframe preview */}
                <div className="flex-1 overflow-y-auto py-4">
                  {bodyObj ? (
                    <iframe 
                      className="w-full h-full border-0 rounded-2xl bg-transparent"
                      title={t("Parsed mail content", "Spracovaný obsah pošty", "Feldolgozott levéltartalom")}
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
                                font-size: ${isLargeFont ? '16px' : '13px'};
                              }
                              a { color: #db2777; text-decoration: none; }
                              a:hover { text-decoration: underline; }
                              blockquote { border-left: 3px solid #cbd5e1; padding-left: 12px; color: #64748b; margin: 12px 0; }
                            </style>
                          </head>
                          <body>
                            ${bodyObj.html || bodyObj.text || ''}
                          </body>
                        </html>
                      `}
                    />
                  ) : (
                    <div className="text-center text-slate-400 py-12 text-xs font-semibold">
                      {t("No message content.", "Žiadny obsah správy.", "Nincs üzenettartalom.")}
                    </div>
                  )}
                </div>
              </div>
            );
          })() : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <Mail size={40} className="stroke-[1.5] text-slate-300 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("Select a conversation thread", "Vyberte vlákno konverzácie", "Válasszon egy beszélgetésszálat")}</span>
            </div>
          )
        )}
      </div>

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
                <div className="space-y-4 relative border-l-2 border-slate-150 pl-4 text-left">
                  {slideoutTimelineEvents.map((event: any) => {
                    const pmName = slideoutLead.owner || currentUser?.name || "";
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
                                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 tracking-wider">
                                  {event.type === "phone" ? t("Call Logs", "Záznam hovoru", "Hívásnapló")
                                    : event.type === "email" ? t("Email Sent", "E-mail odoslaný", "E-mail elküldve")
                                    : event.type === "note" ? t("Timeline Note", "Poznámka na časovej osi", "Idővonal jegyzet")
                                    : event.type === "offer" ? t("Proposal", "Cenová ponuka", "Ajánlat")
                                    : event.type === "appointment" ? t("Meeting Log", "Záznam stretnutia", "Találkozó napló")
                                    : event.type}
                                </span>
                              )}
                            </div>
                            <span className="text-[8px] text-slate-400 font-extrabold">{event.timestamp}</span>
                          </div>
                          {(() => {
                            const lines = event.content.split("\n");
                            const showGradient = lines.length > 5 || event.content.length > 250;
                            return (
                              <div className={`relative ${showGradient ? "max-h-[90px] overflow-hidden" : ""}`}>
                                <p className="text-[10.5px] text-slate-655 leading-[1.35] font-bold select-text whitespace-pre-wrap">
                                  {event.content}
                                </p>
                                {showGradient && (
                                  <div className="absolute bottom-0 left-0 right-0 h-[35px] bg-gradient-to-t from-slate-55 via-slate-55/70 to-transparent pointer-events-none" />
                                )}
                              </div>
                            );
                          })()}
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
            <div className="flex items-center justify-between border-b border-slate-150 pb-3 shrink-0">
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
            
            <form onSubmit={handleCreateClientSubmit} className="flex-1 flex flex-col justify-between text-xs font-bold text-slate-755 mt-6">
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
                    <select
                      value={clientFormType}
                      onChange={(e) => setClientFormType(e.target.value as any)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:bg-white font-semibold cursor-pointer"
                    >
                      <option value="person">{t("Person", "Osoba", "Személy")}</option>
                      <option value="business">{t("Business", "Firma", "Cég")}</option>
                      <option value="partner">{t("Partner", "Partner", "Partner")}</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-105 shrink-0">
                <button
                  type="button"
                  onClick={closeClientSlideout}
                  className="px-5 py-2.5 border border-slate-250 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
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
