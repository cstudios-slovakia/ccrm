import { PageHeader } from "./layout";
import { SectionIcon } from "./icons/SectionIcon";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { Plus, CheckCircle2, CircleAlert, RefreshCw, Lock } from "lucide-react";
import { useEmailPresentation } from "./email/useEmailPresentation";
import { EmailAccountsSidebar } from "./email/EmailAccountsSidebar";
import { EmailMessagingLayout } from "./email/EmailMessagingLayout";
import { EmailAgentLayout } from "./email/EmailAgentLayout";
import { EmailMailLayout } from "./email/EmailMailLayout";
import { EmailComposerDrawer } from "./email/EmailComposerDrawer";
import { EmailTimelineSlideout } from "./email/EmailTimelineSlideout";
import { EmailClientSlideout } from "./email/EmailClientSlideout";
import type { Lead, Task, Ticket, TicketStatusDef, UserProfile } from "../types";
import { useEmailTicketLinks } from "./email/useEmailTicketLinks";
import type { ModuleAccess } from "../utils/permissions";
import { FULL_MODULE_ACCESS } from "../utils/permissions";
import { formatBytes } from "../utils/formatBytes";
import { nowLocalStamp, todayLocalPlusDays } from "../utils/localTime";
import { hasAiConfigured } from "../utils/aiConfig";
import { isOutgoingMail } from "../utils/mailTimeline";
import { runUndoable } from "../utils/undoable";
import { reinsertAt } from "../utils/undoableList";
import { singleMessage, undoLabel } from "../utils/undoMessages";
import { useListFilter } from "../hooks/useListFilter";
import { PRODUCT_NAME } from "../utils/brand";
import {
  cancelAgentFollowup,
  clearAgentChatHistory,
  deleteAgentArtifact,
  deleteAgentSubagent,
  deleteAgentTask,
  deleteAgentTrigger,
  getAgentConnectorState,
  getWhatsAppChats,
  inferConnectorType,
  isAgentConnector,
  isEmailConnector,
  isMessagingConnector,
  listMyConnectors,
  pollWhatsAppDirectQr,
  resyncWhatsAppChats,
  runAgentTaskNow,
  runSubscriptionAgent,
  saveAgentArtifact,
  saveAgentAutonomousConfig,
  saveAgentMemory,
  saveAgentSubagent,
  saveAgentTask,
  saveAgentTrigger,
  sendWhatsAppChatMessage,
  setWhatsAppChatAgentTakeover,
  startWhatsAppDirectQr,
  testAgentTrigger,
  type AgentChatMessage,
  type AgentConnectorState,
  type AgentEventTrigger,
  type AgentSubagent,
  type CompanyMailbox,
  type ConnectorType,
  type WhatsAppChatSummary,
  type WhatsAppConnectorState,
} from "../utils/companyMailboxes";

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
  tickets?: Ticket[];
  setTickets?: React.Dispatch<React.SetStateAction<Ticket[]>>;
  ticketStatuses?: TicketStatusDef[];
  /** Role access for the email module. `edit: false` makes the client read-only:
      mail can be read, searched and attachments opened, but nothing is sent,
      created or written into the CRM. */
  access?: ModuleAccess;
}

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
  tickets = [],
  setTickets,
  ticketStatuses,
  access = FULL_MODULE_ACCESS
}) => {
  const t = (en: string, sk: string, hu: string) => systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;
  const canEdit = access.edit;
  const canDelete = access.delete;
  // Folder & Email States
  const activeFolder = "INBOX";
  const [emails, setEmails] = useState<any[]>([]);
  // Mails deleted under an open undo window: the server still has them, so a
  // reload of the folder must not bring them back on screen meanwhile.
  const hiddenEmailKeysRef = React.useRef<Set<string>>(new Set());
  const emailKey = (m: any) => `${m.isSent ? "S" : "I"}:${m.uid}`;
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [threadBodies, setThreadBodies] = useState<Record<string, any>>({});
  
  // Thread mode configurations (enabled by default so incoming & sent emails stay grouped in conversation threads)
  const [isThreadedMode, setIsThreadedMode] = useState(true);
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
  const [filter, setFilter] = useListFilter<"all" | "unread">("email.filter", "all");
  
  // UI Loaders
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
  const [isSyncingEmails, setIsSyncingEmails] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Composers and notifications
  const [composers, setComposers] = useState<any[]>([]);
  const [notification, setNotification] = useState<any | null>(null);
  // A Microsoft 365 mailbox whose sign-in ran out: the server answers every mail request
  // with `reconnect`, and only the owner can fix it (Personal settings → E-mail).
  const [mailboxNeedsReconnect, setMailboxNeedsReconnect] = useState(false);

  // AI Email & Flow Summary States
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [loadingSummaries, setLoadingSummaries] = useState<Record<string, boolean>>({});
  const [problemsMap, setProblemsMap] = useState<Record<string, string[]>>({});
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
  const [pendingChatLinkKey, setPendingChatLinkKey] = useState("");
  const [chatClientLinks, setChatClientLinks] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("ccrm_chat_client_links") || "{}");
    } catch {
      return {};
    }
  });

  const saveChatClientLink = (chatKey: string, leadId: string) => {
    setChatClientLinks((prev) => {
      const next = { ...prev };
      if (leadId) next[chatKey] = leadId;
      else delete next[chatKey];
      try {
        localStorage.setItem("ccrm_chat_client_links", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // formatBytes is imported from ../utils/formatBytes

  const handleDownloadAttachment = async (uid: string, folder: string, att: any) => {
    try {
      const res = await fetch(`/api/mail_broker.php?action=get_attachment&folder=${encodeURIComponent(folder)}&uid=${encodeURIComponent(uid)}&part=${encodeURIComponent(att.part_num)}&name=${encodeURIComponent(att.name)}${mbParam}`, {
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
      const res = await fetch(`/api/mail_broker.php?action=save_attachment&folder=${encodeURIComponent(folder)}&uid=${encodeURIComponent(uid)}&part=${encodeURIComponent(att.part_num)}&name=${encodeURIComponent(att.name)}&eventId=${eventId}${mbParam}`, {
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
    return hasAiConfigured(integrationsConfig);
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

  const fetchSummary = async (emailUid: string, folder: string, subject: string, body: string, isThread: boolean = false, force: boolean = false) => {
    if ((!force && summaries[emailUid]) || loadingSummaries[emailUid]) return;
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
          is_thread: isThread,
          force
        })
      });
      const data = await res.json();
      if (data.success && data.summary) {
        setSummaries(prev => ({ ...prev, [emailUid]: data.summary }));
        if (Array.isArray(data.problems)) {
          setProblemsMap(prev => ({ ...prev, [emailUid]: data.problems }));
        }
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
      deadline: todayLocalPlusDays(3),
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
    if (!clientFormName.trim()) return;
    
    const newLeadId = `client-${Date.now()}`;
    const newLead: Lead = {
      id: newLeadId,
      name: clientFormName.trim(),
      email: clientFormEmail.trim(),
      phone: clientFormPhone.trim(),
      city: clientFormCity.trim(),
      clientType: clientFormType,
      status: "accepted",
      source: isMessagingConnector(selectedChannelType) ? selectedChannelType : "email",
      owner: currentUser?.name || "",
      value: 0,
      createdAt: new Date().toISOString().split("T")[0],
      timeline: []
    };
    
    setLeads((prev: any) => [...prev, newLead]);
    if (pendingChatLinkKey) {
      saveChatClientLink(pendingChatLinkKey, newLeadId);
      setPendingChatLinkKey("");
    }
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

  const [availableAccounts, setAvailableAccounts] = useState<
    Array<{
      id: string;
      name: string;
      address: string;
      connectorType: ConnectorType;
      isPersonal?: boolean;
      settings?: CompanyMailbox["settings"];
      subagents?: AgentSubagent[];
      triggers?: AgentEventTrigger[];
    }>
  >([]);
  const [selectedMailboxId, setSelectedMailboxId] = useState<string>("");

  // WhatsApp & Subscription AI Agent workspace state
  const [waSelectedLeadId, setWaSelectedLeadId] = useState<string>("");
  const [waSearchQuery, setWaSearchQuery] = useState<string>("");
  const [waDraftMessage, setWaDraftMessage] = useState<string>("");
  const [waState, setWaState] = useState<WhatsAppConnectorState | null>(null);
  const [waLoading, setWaLoading] = useState<boolean>(false);
  const [waSending, setWaSending] = useState<boolean>(false);
  const [waInlineQrOpen, setWaInlineQrOpen] = useState<boolean>(false);
  const [waInlineQrUrl, setWaInlineQrUrl] = useState<string | null>(null);
  const [waFilterType, setWaFilterType] = useState<"all" | "groups" | "contacts">("all");
  const waMessagesScrollRef = useRef<HTMLDivElement | null>(null);
  const agentChatScrollRef = useRef<HTMLDivElement | null>(null);
  const emailThreadScrollRef = useRef<HTMLDivElement | null>(null);
  const [agentChats, setAgentChats] = useState<Record<string, AgentChatMessage[]>>({});
  const [agentStates, setAgentStates] = useState<Record<string, AgentConnectorState>>({});
  const [agentPrompt, setAgentPrompt] = useState<string>("");
  const [isAgentRunning, setIsAgentRunning] = useState<boolean>(false);
  const [activeChatSubagentId, setActiveChatSubagentId] = useState<string>("");
  // Right-sidebar selected artifact key: null = full-width chat; "memory:main" | "artifact:<id>" | "subagent:<id>" | "task:<id>" = 50/50 split with Content Editor
  const [selectedArtifactKey, setSelectedArtifactKey] = useState<string | null>(null);
  const [memoryDraft, setMemoryDraft] = useState<string>("");
  const [artifactTitleDraft, setArtifactTitleDraft] = useState<string>("");
  const [subPromptDraft, setSubPromptDraft] = useState<string>("");
  const [isMemoryDirty, setIsMemoryDirty] = useState<boolean>(false);
  const [isSavingMemory, setIsSavingMemory] = useState<boolean>(false);
  const [newArtifactOpen, setNewArtifactOpen] = useState<boolean>(false);
  const [newArtifactName, setNewArtifactName] = useState<string>("");
  const [newSubagentOpen, setNewSubagentOpen] = useState<boolean>(false);
  const [newSubName, setNewSubName] = useState<string>("");
  const [newSubRole, setNewSubRole] = useState<string>("");
  const [newSubPrompt, setNewSubPrompt] = useState<string>("");
  const [newSubHeartbeat, setNewSubHeartbeat] = useState<boolean>(false);
  const [newTaskOpen, setNewTaskOpen] = useState<boolean>(false);
  const [newTaskTitle, setNewTaskTitle] = useState<string>("");
  const [newTaskPrompt, setNewTaskPrompt] = useState<string>("");
  const [newTaskInterval, setNewTaskInterval] = useState<string>("60");
  const [newTaskSubagentId, setNewTaskSubagentId] = useState<string>("");

  // Visual Trigger Studio & Event-Driven Routing State
  const [visualTriggersOpen, setVisualTriggersOpen] = useState<boolean>(false);
  const [triggerModalOpen, setTriggerModalOpen] = useState<boolean>(false);
  const [triggerDraftId, setTriggerDraftId] = useState<string>("");
  const [triggerDraftName, setTriggerDraftName] = useState<string>("");
  const [triggerDraftSourceType, setTriggerDraftSourceType] = useState<"whatsapp" | "email" | "crm_event">("whatsapp");
  const [triggerDraftSourceConnectorId, setTriggerDraftSourceConnectorId] = useState<string>("");
  const [triggerDraftTargetSubagentId, setTriggerDraftTargetSubagentId] = useState<string>("");
  const [triggerDraftChatMatch, setTriggerDraftChatMatch] = useState<string>("");
  const [triggerDraftOnlyGroup, setTriggerDraftOnlyGroup] = useState<boolean>(false);
  const [triggerDraftOnlyDirect, setTriggerDraftOnlyDirect] = useState<boolean>(false);
  const [triggerDraftSubjectContains, setTriggerDraftSubjectContains] = useState<string>("");
  const [triggerDraftFromContains, setTriggerDraftFromContains] = useState<string>("");
  const [triggerDraftKeywordContains, setTriggerDraftKeywordContains] = useState<string>("");
  const [triggerDraftEventType, setTriggerDraftEventType] = useState<string>("lead_created");
  const [triggerDraftInstructions, setTriggerDraftInstructions] = useState<string>("");
  const [triggerDraftAutoReply, setTriggerDraftAutoReply] = useState<boolean>(true);
  const [triggerDraftProactiveEnabled, setTriggerDraftProactiveEnabled] = useState<boolean>(false);
  const [triggerDraftProactiveAfterMinutes, setTriggerDraftProactiveAfterMinutes] = useState<number>(120);
  const [triggerDraftProactiveMaxAttempts, setTriggerDraftProactiveMaxAttempts] = useState<number>(1);
  const [triggerDraftProactiveInstructions, setTriggerDraftProactiveInstructions] = useState<string>("");
  const [triggerDraftEnabled, setTriggerDraftEnabled] = useState<boolean>(true);
  const [isTestingTriggerId, setIsTestingTriggerId] = useState<string | null>(null);
  const [waTakeoverBusyChatId, setWaTakeoverBusyChatId] = useState<string | null>(null);

  const loadAuthorizedAccounts = useCallback(async () => {
    const mergedMap = new Map<
      string,
      {
        id: string;
        name: string;
        address: string;
        connectorType: ConnectorType;
        isPersonal?: boolean;
        settings?: CompanyMailbox["settings"];
        subagents?: AgentSubagent[];
        triggers?: AgentEventTrigger[];
      }
    >();

    // 1. Personal mailbox from user metadata if configured
    if (userEmailSettings?.imapHost || userEmailSettings?.smtpHost) {
      mergedMap.set("personal", {
        id: "personal",
        name: currentUser?.name ? `${currentUser.name} (Personal)` : "Personal Mailbox",
        address: currentUser?.email || "",
        connectorType: inferConnectorType(userEmailSettings, currentUser?.email || "", "smtp"),
        isPersonal: true,
      });
    }

    // 2. Shared connectors authorized for this user (email, whatsapp, claude, antigravity, chatgpt)
    try {
      const my = await listMyConnectors();
      for (const box of my.mailboxes ?? my.connectors ?? []) {
        const cType = inferConnectorType(box.settings, box.address, box.connectorType);
        mergedMap.set(box.id, {
          id: box.id,
          name: box.name || box.address,
          address: box.address,
          connectorType: cType,
          isPersonal: box.id === "personal",
          settings: box.settings,
          subagents: box.subagents,
          triggers: box.triggers,
        });
      }
    } catch {
      /* ignore if offline or mocked */
    }

    // 3. Fallback / merge from mail_broker accounts
    if (currentUser?.email) {
      try {
        const res = await fetch("/api/mail_broker.php?action=accounts", {
          headers: { "X-User-Email": currentUser.email },
        });
        const data = await res.json();
        if (data?.success && Array.isArray(data.accounts)) {
          for (const acc of data.accounts) {
            if (!mergedMap.has(acc.id)) {
              mergedMap.set(acc.id, {
                id: acc.id,
                name: acc.name || acc.address,
                address: acc.address,
                connectorType: inferConnectorType(undefined, acc.address, acc.connectorType),
                isPersonal: Boolean(acc.isPersonal),
              });
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    const list = Array.from(mergedMap.values());
    setAvailableAccounts(list);
    const hashParams = new URLSearchParams((window.location.hash.split("?")[1] || ""));
    const reqChannel = hashParams.get("channel") || "";
    const reqChat = hashParams.get("chat") || "";
    if (reqChat) {
      setWaSelectedLeadId(reqChat);
    }
    setSelectedMailboxId((prev) => {
      if (reqChannel && list.some((a) => a.id === reqChannel)) return reqChannel;
      if (prev && list.some((a) => a.id === prev)) return prev;
      return list[0]?.id || "";
    });
  }, [currentUser?.email, currentUser?.name, userEmailSettings]);

  useEffect(() => {
    void loadAuthorizedAccounts();
    const onUpdated = () => {
      void loadAuthorizedAccounts();
    };
    window.addEventListener("ccrm:connectors-updated", onUpdated);
    return () => window.removeEventListener("ccrm:connectors-updated", onUpdated);
  }, [loadAuthorizedAccounts]);

  const selectedAccount = useMemo(
    () => availableAccounts.find((a) => a.id === selectedMailboxId) ?? availableAccounts[0] ?? null,
    [availableAccounts, selectedMailboxId],
  );
  const selectedChannelType: ConnectorType = selectedAccount?.connectorType ?? "smtp";
  const isSelectedEmailChannel = isEmailConnector(selectedChannelType);

  const hasMailAccount =
    Boolean(userEmailSettings) || availableAccounts.some((a) => isEmailConnector(a.connectorType));
  const mbParam =
    selectedMailboxId && selectedMailboxId !== "personal" && isSelectedEmailChannel
      ? `&mailbox_id=${encodeURIComponent(selectedMailboxId)}`
      : "";

  // Load timeline emails for the slideout lead
  useEffect(() => {
    if (!slideoutLead || !slideoutLead.email || !hasMailAccount) {
      setSlideoutEmails([]);
      return;
    }

    const fetchLeadMails = async () => {
      setIsLoadingSlideoutEmails(true);
      try {
        const inboxRes = await fetch(
          `/api/mail_broker.php?action=get_emails&folder=INBOX&email=${encodeURIComponent(slideoutLead.email || "")}${mbParam}`,
          { headers: { "X-User-Email": currentUser.email } }
        );
        const inboxData = await inboxRes.json();
        
        let sentEmails: any[] = [];
        try {
          const sentRes = await fetch(
            `/api/mail_broker.php?action=get_emails&folder=Sent&email=${encodeURIComponent(slideoutLead.email || "")}${mbParam}`,
            { headers: { "X-User-Email": currentUser.email } }
          );
          const sentData = await sentRes.json();
          if (sentData.success && Array.isArray(sentData.emails)) {
            sentEmails = sentData.emails;
          }
        } catch (e) {}

        const combinedEmails: any[] = [];
        const processMail = (mail: any) => {
          const isOutgoing = isOutgoingMail(mail, currentUser?.email);
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
  }, [slideoutLead, hasMailAccount, mbParam, currentUser]);

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
    if (!hasMailAccount) return;
    let showedCached = false;
    if (!silent) {
      try {
        const [cachedInboxRes, cachedSentRes] = await Promise.all([
          fetch(`/api/mail_broker.php?action=get_emails&folder=INBOX&page=${currPage}&filter=${currFilter}&cached_only=1${mbParam}`, {
            headers: { "X-User-Email": currentUser.email }
          }),
          fetch(`/api/mail_broker.php?action=get_emails&folder=Sent&page=${currPage}&filter=${currFilter}&cached_only=1${mbParam}`, {
            headers: { "X-User-Email": currentUser.email }
          })
        ]);
        const [cachedInbox, cachedSent] = await Promise.all([
          cachedInboxRes.json().catch(() => ({})),
          cachedSentRes.json().catch(() => ({}))
        ]);
        const cInboxMails = cachedInbox?.success && Array.isArray(cachedInbox.emails)
          ? cachedInbox.emails.map((m: any) => ({ ...m, isSent: false }))
          : [];
        const cSentMails = cachedSent?.success && Array.isArray(cachedSent.emails)
          ? cachedSent.emails.map((m: any) => ({ ...m, isSent: true }))
          : [];
        const cachedCombined = [...cInboxMails, ...cSentMails].sort((a: any, b: any) => {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
        if (cachedCombined.length > 0) {
          setEmails(hiddenEmailKeysRef.current.size ? cachedCombined.filter((m: any) => !hiddenEmailKeysRef.current.has(emailKey(m))) : cachedCombined);
          setIsLoadingEmails(false);
          showedCached = true;
        }
      } catch {
        // Ignore cache probe error and fall back to live IMAP fetch
      }
      if (!showedCached) {
        setIsLoadingEmails(true);
      }
    }
    setIsSyncingEmails(true);
    try {
      // Fetch Inbox folder emails
      const resInbox = await fetch(`/api/mail_broker.php?action=get_emails&folder=INBOX&page=${currPage}&filter=${currFilter}${mbParam}`, {
        headers: { "X-User-Email": currentUser.email }
      });
      const dataInbox = await resInbox.json();
      setMailboxNeedsReconnect(dataInbox?.reconnect === true);
      
      let inboxMails: any[] = [];
      if (dataInbox.success && Array.isArray(dataInbox.emails)) {
        inboxMails = dataInbox.emails.map((m: any) => ({ ...m, isSent: false }));
      }

      // Fetch Sent folder emails
      let sentMails: any[] = [];
      try {
        const resSent = await fetch(`/api/mail_broker.php?action=get_emails&folder=Sent&page=${currPage}&filter=${currFilter}${mbParam}`, {
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

      if (combined.length > 0 || !showedCached) {
        setEmails(hiddenEmailKeysRef.current.size ? combined.filter((m: any) => !hiddenEmailKeysRef.current.has(emailKey(m))) : combined);
      }
      setLastSyncAt(new Date());
    } catch (err) {
      if (!showedCached) {
        notify(t("Mail server unreachable", "Poštový server je nedostupný", "A levelezőszerver nem elérhető"), "error");
      }
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
      const res = await fetch(`/api/mail_broker.php?action=set_seen${mbParam}`, {
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
      return;
    }
    setIsLoadingDetail(true);
    const folderToUse = email.isSent ? "Sent" : activeFolder;
    try {
      const res = await fetch(`/api/mail_broker.php?action=get_email_detail&uid=${encodeURIComponent(email.uid)}&folder=${encodeURIComponent(folderToUse)}${mbParam}`, {
        headers: { "X-User-Email": currentUser.email }
      });
      const data = await res.json();
      if (data.success) {
        setThreadBodies(prev => ({ ...prev, [email.uid]: data.email }));
        setSelectedEmail(email);

        if (typeof data.email?.seen === "boolean") {
          setEmails(prev => prev.map(e => e.uid === email.uid ? { ...e, seen: data.email.seen } : e));
        }
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
    if (!hasMailAccount || !isSelectedEmailChannel) return;

    loadEmails(1, filter);

    const interval = setInterval(() => {
      loadEmails(1, filter, true);
    }, 60000); // UI updates every 60 seconds

    return () => clearInterval(interval);
  }, [hasMailAccount, isSelectedEmailChannel, selectedMailboxId, filter]);

  const syncSelectedArtifactDraft = useCallback(
    (state: AgentConnectorState, key: string | null) => {
      if (!key) return;
      if (key === "memory:main") {
        setMemoryDraft(state.memoryMd ?? "");
        setArtifactTitleDraft("memory.md");
      } else if (key === "cron:main") {
        setMemoryDraft(
          state.autonomousMode?.instructions ??
            "Review your memory.md, artifacts, and CCRM state via MCP. Execute any pending autonomous goals, follow-ups, or subagent delegations recorded in memory.md. Update memory.md with your progress. If no autonomous actions are needed right now, reply with [IDLE].",
        );
        setArtifactTitleDraft("Autonomous Cron (cron.php)");
      } else if (key.startsWith("artifact:")) {
        const artId = key.slice("artifact:".length);
        const found = (state.artifacts ?? []).find((a) => a.id === artId);
        if (found) {
          setMemoryDraft(found.content ?? "");
          setArtifactTitleDraft(found.title || found.id);
        }
      } else if (key.startsWith("subagent:")) {
        const subId = key.slice("subagent:".length);
        const found = (state.subagents ?? []).find((s) => s.id === subId);
        if (found) {
          setMemoryDraft(found.memoryMd ?? "");
          setSubPromptDraft(found.systemPrompt ?? "");
          setArtifactTitleDraft(`${found.name} (${found.id})`);
        }
      } else if (key.startsWith("task:")) {
        const taskId = key.slice("task:".length);
        const found = (state.tasks ?? []).find((tk) => tk.id === taskId);
        if (found) {
          setMemoryDraft(found.prompt ?? "");
          setArtifactTitleDraft(found.title || found.id);
        }
      }
    },
    [],
  );

  const applyAgentState = useCallback(
    (accId: string, state: AgentConnectorState, overrideKey?: string | null, subIdOverride?: string) => {
      setAgentStates((prev) => ({ ...prev, [accId]: state }));
      const effectiveSubId = subIdOverride !== undefined ? subIdOverride : (state.activeAgentId && state.activeAgentId !== "main" ? state.activeAgentId : activeChatSubagentId);
      const chatKey = effectiveSubId ? `${accId}:${effectiveSubId}` : accId;
      if (Array.isArray(state.chatHistory)) {
        setAgentChats((prev) => ({ ...prev, [chatKey]: state.chatHistory }));
      }
      // Keep sidebar subagents & triggers in sync
      setAvailableAccounts((prev) =>
        prev.map((a) =>
          a.id === accId
            ? {
                ...a,
                subagents: state.subagents ?? a.subagents,
                triggers: state.triggers ?? a.triggers,
              }
            : a,
        ),
      );
      const keyToUse = overrideKey !== undefined ? overrideKey : selectedArtifactKey;
      if (!isMemoryDirty && keyToUse) {
        syncSelectedArtifactDraft(state, keyToUse);
      }
    },
    [activeChatSubagentId, isMemoryDirty, selectedArtifactKey, syncSelectedArtifactDraft],
  );

  // Load persistent agent state (memory.md, artifacts, subagents, triggers, autonomous tasks, scoped chat history)
  // & poll read-only state every 15s to display work executed by the server cronjob (`cron.php`) or reactive triggers.
  useEffect(() => {
    if (!selectedAccount || !isAgentConnector(selectedChannelType)) return;
    const accId = selectedAccount.id;
    const subId = activeChatSubagentId || undefined;
    const chatKey = subId ? `${accId}:${subId}` : accId;
    let cancelled = false;

    setIsMemoryDirty(false);

    void getAgentConnectorState(accId, subId)
      .then((st) => {
        if (cancelled) return;
        setAgentStates((prev) => ({ ...prev, [accId]: st }));
        if (Array.isArray(st.chatHistory)) {
          setAgentChats((prev) => ({ ...prev, [chatKey]: st.chatHistory }));
        }
        setAvailableAccounts((prev) =>
          prev.map((a) =>
            a.id === accId
              ? {
                  ...a,
                  subagents: st.subagents ?? a.subagents,
                  triggers: st.triggers ?? a.triggers,
                }
              : a,
          ),
        );
        if (!selectedArtifactKey) {
          setMemoryDraft(subId ? (st.subagentMemoryMd ?? "") : (st.memoryMd ?? ""));
        } else {
          syncSelectedArtifactDraft(st, selectedArtifactKey);
        }
      })
      .catch(() => {
        /* ignore offline/mock */
      });

    const syncInterval = setInterval(() => {
      void getAgentConnectorState(accId, subId)
        .then((st) => {
          if (!cancelled) applyAgentState(accId, st, undefined, subId || "");
        })
        .catch(() => {
          /* ignore */
        });
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(syncInterval);
    };
  }, [selectedAccount?.id, selectedChannelType, activeChatSubagentId]);

  // Preload sibling WhatsApp / BotMan chats when in Agent Workspace so the Trigger Studio dropdown has live groups/chats
  useEffect(() => {
    if (!isAgentConnector(selectedChannelType)) return;
    const waAcc = availableAccounts.find((a) => isMessagingConnector(a.connectorType));
    if (!waAcc || waState) return;
    void getWhatsAppChats(waAcc.id)
      .then((st) => setWaState(st))
      .catch(() => {
        /* ignore */
      });
  }, [selectedChannelType, availableAccounts, waState]);

  const handleSelectArtifact = (key: string | null) => {
    if (!selectedAccount) return;
    if (key === null || key === selectedArtifactKey) {
      setSelectedArtifactKey(null);
      setIsMemoryDirty(false);
      return;
    }
    setSelectedArtifactKey(key);
    setIsMemoryDirty(false);
    const st = agentStates[selectedAccount.id];
    if (st) {
      syncSelectedArtifactDraft(st, key);
    }
  };

  const handleSaveSelectedArtifact = async () => {
    if (!selectedAccount || !selectedArtifactKey || isSavingMemory) return;
    setIsSavingMemory(true);
    try {
      let st: AgentConnectorState;
      if (selectedArtifactKey === "memory:main") {
        st = await saveAgentMemory({
          id: selectedAccount.id,
          memoryMd: memoryDraft,
        });
      } else if (selectedArtifactKey === "cron:main") {
        const autoCfg = agentStates[selectedAccount.id]?.autonomousMode;
        st = await saveAgentAutonomousConfig({
          id: selectedAccount.id,
          enabled: autoCfg?.enabled ?? false,
          intervalMinutes: autoCfg?.intervalMinutes ?? 15,
          instructions: memoryDraft,
        });
      } else if (selectedArtifactKey.startsWith("artifact:")) {
        const artId = selectedArtifactKey.slice("artifact:".length);
        st = await saveAgentArtifact({
          id: selectedAccount.id,
          name: artId,
          title: artifactTitleDraft || artId,
          content: memoryDraft,
        });
      } else if (selectedArtifactKey.startsWith("subagent:")) {
        const subId = selectedArtifactKey.slice("subagent:".length);
        const existingSub = (agentStates[selectedAccount.id]?.subagents ?? []).find((s) => s.id === subId);
        st = await saveAgentSubagent({
          id: selectedAccount.id,
          subagentId: subId,
          name: existingSub?.name || subId,
          role: existingSub?.role || "Subagent",
          systemPrompt: subPromptDraft || existingSub?.systemPrompt || "",
          memoryMd: memoryDraft,
          heartbeatEnabled: existingSub?.heartbeatEnabled ?? false,
          heartbeatIntervalMinutes: existingSub?.heartbeatIntervalMinutes ?? 15,
          heartbeatInstructions: existingSub?.heartbeatInstructions ?? "",
          reactiveEnabled: existingSub?.reactiveEnabled ?? true,
        });
      } else if (selectedArtifactKey.startsWith("task:")) {
        const taskId = selectedArtifactKey.slice("task:".length);
        const existingTask = (agentStates[selectedAccount.id]?.tasks ?? []).find((tk) => tk.id === taskId);
        st = await saveAgentTask({
          id: selectedAccount.id,
          title: artifactTitleDraft || existingTask?.title || taskId,
          prompt: memoryDraft,
          intervalMinutes: existingTask?.intervalMinutes || 60,
          subagentId: existingTask?.subagentId || undefined,
          enabled: existingTask?.enabled ?? true,
        });
      } else {
        return;
      }
      setIsMemoryDirty(false);
      applyAgentState(selectedAccount.id, st, selectedArtifactKey);
      notify(
        t(
          "Artifact saved — the agent will use the updated content immediately.",
          "Artefakt uložený — agent okamžite použije aktualizovaný obsah.",
          "Artefaktum mentve — az ügynök azonnal használja a frissített tartalmat.",
        ),
      );
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setIsSavingMemory(false);
    }
  };

  const handleUpdateAutonomousCron = async (patch: { enabled?: boolean; intervalMinutes?: number }) => {
    if (!selectedAccount) return;
    try {
      const autoCfg = agentStates[selectedAccount.id]?.autonomousMode;
      const st = await saveAgentAutonomousConfig({
        id: selectedAccount.id,
        enabled: patch.enabled ?? autoCfg?.enabled ?? false,
        intervalMinutes: patch.intervalMinutes ?? autoCfg?.intervalMinutes ?? 15,
        instructions: selectedArtifactKey === "cron:main" ? memoryDraft : autoCfg?.instructions,
      });
      applyAgentState(selectedAccount.id, st, selectedArtifactKey);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleToggleSubagentHeartbeat = async (sub: AgentSubagent, patch: { heartbeatEnabled?: boolean; heartbeatIntervalMinutes?: number }) => {
    if (!selectedAccount) return;
    try {
      const st = await saveAgentSubagent({
        id: selectedAccount.id,
        subagentId: sub.id,
        name: sub.name,
        role: sub.role,
        systemPrompt: sub.systemPrompt,
        memoryMd: sub.memoryMd,
        heartbeatEnabled: patch.heartbeatEnabled ?? !(sub.heartbeatEnabled ?? false),
        heartbeatIntervalMinutes: patch.heartbeatIntervalMinutes ?? (sub.heartbeatIntervalMinutes ?? 15),
        heartbeatInstructions: sub.heartbeatInstructions,
        reactiveEnabled: sub.reactiveEnabled ?? true,
      });
      applyAgentState(selectedAccount.id, st, selectedArtifactKey);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleCreateArtifact = async () => {
    if (!selectedAccount || !newArtifactName.trim()) return;
    const raw = newArtifactName.trim();
    const fileName = raw.includes(".") ? raw : `${raw.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}.md`;
    try {
      const initialContent = `# ${raw}\n\n`;
      const st = await saveAgentArtifact({
        id: selectedAccount.id,
        name: fileName,
        title: raw,
        content: initialContent,
      });
      const newKey = `artifact:${fileName}`;
      setSelectedArtifactKey(newKey);
      setIsMemoryDirty(false);
      applyAgentState(selectedAccount.id, st, newKey);
      setNewArtifactName("");
      setNewArtifactOpen(false);
      notify(t("Artifact created!", "Artefakt vytvorený!", "Artefaktum létrehozva!"));
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleDeleteArtifact = async (artId: string) => {
    if (!selectedAccount) return;
    try {
      const st = await deleteAgentArtifact(selectedAccount.id, artId);
      const nextKey = selectedArtifactKey === `artifact:${artId}` ? null : selectedArtifactKey;
      setSelectedArtifactKey(nextKey);
      applyAgentState(selectedAccount.id, st, nextKey);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleCreateSubagent = async () => {
    if (!selectedAccount || !newSubName.trim() || !newSubRole.trim()) return;
    try {
      const st = await saveAgentSubagent({
        id: selectedAccount.id,
        name: newSubName.trim(),
        role: newSubRole.trim(),
        systemPrompt:
          newSubPrompt.trim() ||
          `You are ${newSubName.trim()} (${newSubRole.trim()}), a specialized CCRM agent.`,
        heartbeatEnabled: newSubHeartbeat,
        heartbeatIntervalMinutes: 15,
        reactiveEnabled: true,
      });
      const createdSub = st.subagent ?? (st.subagents ?? [])[st.subagents.length - 1];
      if (createdSub) {
        setActiveChatSubagentId(createdSub.id);
      }
      const nextKey = createdSub ? `subagent:${createdSub.id}` : selectedArtifactKey;
      setSelectedArtifactKey(nextKey);
      applyAgentState(selectedAccount.id, st, nextKey, createdSub?.id || "");
      setNewSubName("");
      setNewSubRole("");
      setNewSubPrompt("");
      setNewSubHeartbeat(false);
      setNewSubagentOpen(false);
      notify(t("Agent created!", "Agent vytvorený!", "Ügynök létrehozva!"));
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleDeleteSubagent = async (subagentId: string) => {
    if (!selectedAccount) return;
    try {
      const st = await deleteAgentSubagent(selectedAccount.id, subagentId);
      if (activeChatSubagentId === subagentId) setActiveChatSubagentId("");
      const nextKey = selectedArtifactKey === `subagent:${subagentId}` ? null : selectedArtifactKey;
      setSelectedArtifactKey(nextKey);
      applyAgentState(selectedAccount.id, st, nextKey, "");
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const openNewTriggerModal = (opts?: {
    sourceType?: "whatsapp" | "email" | "crm_event";
    sourceConnectorId?: string;
    targetSubagentId?: string;
  }) => {
    const defaultWa = availableAccounts.find((a) => isMessagingConnector(a.connectorType));
    const defaultEmail = availableAccounts.find((a) => isEmailConnector(a.connectorType));
    const sType = opts?.sourceType ?? (defaultWa ? "whatsapp" : defaultEmail ? "email" : "crm_event");
    const sConnId =
      opts?.sourceConnectorId ??
      (sType === "whatsapp" ? defaultWa?.id || "" : sType === "email" ? defaultEmail?.id || "" : "");

    setTriggerDraftId("");
    setTriggerDraftName("");
    setTriggerDraftSourceType(sType);
    setTriggerDraftSourceConnectorId(sConnId);
    setTriggerDraftTargetSubagentId(opts?.targetSubagentId ?? activeChatSubagentId ?? "");
    setTriggerDraftChatMatch("");
    setTriggerDraftOnlyGroup(false);
    setTriggerDraftOnlyDirect(false);
    setTriggerDraftSubjectContains("");
    setTriggerDraftFromContains("");
    setTriggerDraftKeywordContains("");
    setTriggerDraftEventType("lead_created");
    setTriggerDraftInstructions("");
    setTriggerDraftAutoReply(true);
    setTriggerDraftProactiveEnabled(false);
    setTriggerDraftProactiveAfterMinutes(120);
    setTriggerDraftProactiveMaxAttempts(1);
    setTriggerDraftProactiveInstructions("");
    setTriggerDraftEnabled(true);
    setTriggerModalOpen(true);
  };

  const openEditTriggerModal = (trig: AgentEventTrigger) => {
    setTriggerDraftId(trig.id);
    setTriggerDraftName(trig.name || "");
    setTriggerDraftSourceType(trig.sourceType || "whatsapp");
    setTriggerDraftSourceConnectorId(trig.sourceConnectorId || "");
    setTriggerDraftTargetSubagentId(trig.targetSubagentId || "");
    setTriggerDraftChatMatch(trig.filter?.chatMatch || "");
    setTriggerDraftOnlyGroup(Boolean(trig.filter?.onlyGroup));
    setTriggerDraftOnlyDirect(Boolean(trig.filter?.onlyDirect));
    setTriggerDraftSubjectContains(trig.filter?.subjectContains || "");
    setTriggerDraftFromContains(trig.filter?.fromContains || "");
    setTriggerDraftKeywordContains(trig.filter?.keywordContains || "");
    setTriggerDraftEventType(trig.filter?.eventType || "lead_created");
    setTriggerDraftInstructions(trig.instructions || "");
    setTriggerDraftAutoReply(trig.autoReply ?? true);
    setTriggerDraftProactiveEnabled(Boolean(trig.proactiveEnabled));
    setTriggerDraftProactiveAfterMinutes(trig.proactiveAfterMinutes ?? 120);
    setTriggerDraftProactiveMaxAttempts(trig.proactiveMaxAttempts ?? 1);
    setTriggerDraftProactiveInstructions(trig.proactiveInstructions || "");
    setTriggerDraftEnabled(trig.enabled ?? true);
    setTriggerModalOpen(true);
  };

  const handleSaveTriggerDraft = async () => {
    if (!selectedAccount) return;
    const selectedSourceAcc = availableAccounts.find((a) => a.id === triggerDraftSourceConnectorId);
    const sourceDisplayName =
      selectedSourceAcc?.name ||
      (triggerDraftSourceType === "whatsapp" ? "Messaging" : triggerDraftSourceType === "email" ? "Email" : "CRM Event");
    const autoName =
      triggerDraftName.trim() ||
      (triggerDraftSourceType === "whatsapp"
        ? `${sourceDisplayName} ${triggerDraftChatMatch ? `(${triggerDraftChatMatch})` : "Auto-Responder"}`
        : triggerDraftSourceType === "email"
          ? `${sourceDisplayName} ${triggerDraftSubjectContains || triggerDraftFromContains || "Auto-Responder"}`
          : `CRM Event (${triggerDraftEventType})`);
    try {
      const st = await saveAgentTrigger({
        id: selectedAccount.id,
        triggerId: triggerDraftId || undefined,
        name: autoName,
        sourceType: triggerDraftSourceType,
        sourceConnectorId: triggerDraftSourceConnectorId,
        targetSubagentId: triggerDraftTargetSubagentId || null,
        filter: {
          chatMatch: triggerDraftChatMatch.trim(),
          onlyGroup: triggerDraftOnlyGroup,
          onlyDirect: triggerDraftOnlyDirect,
          subjectContains: triggerDraftSubjectContains.trim(),
          fromContains: triggerDraftFromContains.trim(),
          keywordContains: triggerDraftKeywordContains.trim(),
          eventType: triggerDraftEventType,
        },
        instructions: triggerDraftInstructions.trim(),
        autoReply: triggerDraftAutoReply,
        proactiveEnabled: triggerDraftProactiveEnabled,
        proactiveAfterMinutes: triggerDraftProactiveAfterMinutes,
        proactiveMaxAttempts: triggerDraftProactiveMaxAttempts,
        proactiveInstructions: triggerDraftProactiveInstructions.trim(),
        enabled: triggerDraftEnabled,
      });
      applyAgentState(selectedAccount.id, st);
      setTriggerModalOpen(false);
      notify(
        t(
          "Reactive event trigger saved! Zero-cost idle mode is active.",
          "Reaktívny spúšťač uložený! Režim nulových nákladov v nečinnosti je aktívny.",
          "Reaktív eseményindító mentve! Nulla költségű üresjárati mód aktív.",
        ),
      );
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleToggleTriggerEnabled = async (trig: AgentEventTrigger) => {
    if (!selectedAccount) return;
    try {
      const st = await saveAgentTrigger({
        id: selectedAccount.id,
        triggerId: trig.id,
        name: trig.name,
        sourceType: trig.sourceType,
        sourceConnectorId: trig.sourceConnectorId,
        targetSubagentId: trig.targetSubagentId,
        filter: trig.filter,
        instructions: trig.instructions,
        autoReply: trig.autoReply,
        proactiveEnabled: trig.proactiveEnabled,
        proactiveAfterMinutes: trig.proactiveAfterMinutes,
        proactiveMaxAttempts: trig.proactiveMaxAttempts,
        proactiveInstructions: trig.proactiveInstructions,
        enabled: !trig.enabled,
      });
      applyAgentState(selectedAccount.id, st);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleCancelFollowup = async (followupId: string) => {
    if (!selectedAccount) return;
    try {
      const st = await cancelAgentFollowup(selectedAccount.id, followupId);
      applyAgentState(selectedAccount.id, st);
      notify(t("Scheduled follow-up cancelled.", "Naplánovaný follow-up zrušený.", "Ütemezett utánkövetés törölve."));
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleDeleteTrigger = async (triggerId: string) => {
    if (!selectedAccount) return;
    try {
      const st = await deleteAgentTrigger(selectedAccount.id, triggerId);
      applyAgentState(selectedAccount.id, st);
      notify(t("Trigger removed.", "Spúšťač odstránený.", "Indító eltávolítva."));
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleTestTrigger = async (triggerId: string) => {
    if (!selectedAccount || isTestingTriggerId) return;
    setIsTestingTriggerId(triggerId);
    try {
      const res = await testAgentTrigger(selectedAccount.id, triggerId);
      applyAgentState(selectedAccount.id, res);
      if (res.testResult?.ok) {
        const alreadyMsg = (res.testResult as { alreadyReplied?: boolean; text?: string }).alreadyReplied
          ? (res.testResult as { text?: string }).text
          : null;
        notify(
          alreadyMsg ||
            t(
              "Trigger test executed with 50-msg / 5-day context!",
              "Test spúšťača vykonaný s kontextom 50 správ / 5 dní!",
              "Indító teszt végrehajtva 50 üzenet / 5 nap kontextussal!",
            ),
        );
      } else {
        notify(res.testResult?.error || t("Trigger test failed.", "Test spúšťača zlyhal.", "Indító teszt sikertelen."), "error");
      }
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setIsTestingTriggerId(null);
    }
  };

  const handleCreateTask = async () => {
    if (!selectedAccount || !newTaskTitle.trim() || !newTaskPrompt.trim()) return;
    try {
      const st = await saveAgentTask({
        id: selectedAccount.id,
        title: newTaskTitle.trim(),
        prompt: newTaskPrompt.trim(),
        intervalMinutes: Math.max(1, parseInt(newTaskInterval, 10) || 60),
        subagentId: newTaskSubagentId || undefined,
        enabled: true,
      });
      const createdTask = (st.tasks ?? [])[st.tasks.length - 1];
      const nextKey = createdTask ? `task:${createdTask.id}` : selectedArtifactKey;
      setSelectedArtifactKey(nextKey);
      applyAgentState(selectedAccount.id, st, nextKey);
      setNewTaskTitle("");
      setNewTaskPrompt("");
      setNewTaskInterval("60");
      setNewTaskSubagentId("");
      setNewTaskOpen(false);
      notify(t("Autonomous task scheduled!", "Autonómna úloha naplánovaná!", "Autonóm feladat ütemezve!"));
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleToggleTask = async (task: {
    id: string;
    title: string;
    prompt: string;
    intervalMinutes: number;
    subagentId?: string | null;
    enabled: boolean;
  }) => {
    if (!selectedAccount) return;
    try {
      const st = await saveAgentTask({
        id: selectedAccount.id,
        title: task.title,
        prompt: task.prompt,
        intervalMinutes: task.intervalMinutes,
        subagentId: task.subagentId || undefined,
        enabled: !task.enabled,
      });
      applyAgentState(selectedAccount.id, st);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!selectedAccount) return;
    try {
      const st = await deleteAgentTask(selectedAccount.id, taskId);
      const nextKey = selectedArtifactKey === `task:${taskId}` ? null : selectedArtifactKey;
      setSelectedArtifactKey(nextKey);
      applyAgentState(selectedAccount.id, st, nextKey);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleRunTaskNow = async (taskId?: string) => {
    if (!selectedAccount || isAgentRunning) return;
    setIsAgentRunning(true);
    try {
      const st = await runAgentTaskNow(selectedAccount.id, taskId);
      applyAgentState(selectedAccount.id, st);
      notify(t("Autonomous task executed!", "Autonómna úloha vykonaná!", "Autonóm feladat végrehajtva!"));
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setIsAgentRunning(false);
    }
  };

  const handleClearAgentChat = async () => {
    if (!selectedAccount) return;
    try {
      const st = await clearAgentChatHistory(selectedAccount.id, activeChatSubagentId || undefined);
      applyAgentState(selectedAccount.id, st);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleSendAgentMessage = async (promptText?: string) => {
    const text = (promptText ?? agentPrompt).trim();
    if (!text || !selectedAccount || isAgentRunning) return;
    const accId = selectedAccount.id;
    const subId = activeChatSubagentId || "";
    const chatKey = subId ? `${accId}:${subId}` : accId;
    const userMsg: AgentChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      subagentId: subId || null,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setAgentChats((prev) => ({
      ...prev,
      [chatKey]: [...(prev[chatKey] ?? []), userMsg],
    }));
    if (!promptText) setAgentPrompt("");
    setIsAgentRunning(true);
    try {
      const res = await runSubscriptionAgent({
        id: accId,
        prompt: text,
        subagentId: subId || undefined,
      });
      if (res.memoryMd !== undefined) {
        applyAgentState(accId, res, undefined, subId);
      } else {
        const botMsg: AgentChatMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          subagentId: subId || null,
          text: res.text || "Completed via CCRM MCP.",
          steps: res.steps ?? [],
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setAgentChats((prev) => ({
          ...prev,
          [chatKey]: [...(prev[chatKey] ?? []), botMsg],
        }));
      }
    } catch (e: unknown) {
      const errMsg: AgentChatMessage = {
        id: `e-${Date.now()}`,
        role: "assistant",
        text: `⚠️ ${e instanceof Error ? e.message : String(e)}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setAgentChats((prev) => ({
        ...prev,
        [chatKey]: [...(prev[chatKey] ?? []), errMsg],
      }));
    } finally {
      setIsAgentRunning(false);
    }
  };

  // Load & poll live WhatsApp / BotMan chats/groups/messages when a Messaging connector is active
  useEffect(() => {
    if (!selectedAccount || !isMessagingConnector(selectedChannelType)) return;
    let cancelled = false;
    setWaLoading(true);

    const fetchChats = () => {
      void getWhatsAppChats(selectedAccount.id)
        .then((st) => {
          if (cancelled) return;
          setWaState(st);
          if (st.qr && st.status === "pending_qr") {
            setWaInlineQrUrl(st.qr);
            setWaInlineQrOpen(true);
          } else if (st.status === "connected") {
            setWaInlineQrOpen(false);
            setWaInlineQrUrl(null);
          }
        })
        .catch(() => {
          /* ignore */
        })
        .finally(() => {
          if (!cancelled) setWaLoading(false);
        });
    };

    fetchChats();
    const timer = setInterval(fetchChats, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedAccount?.id, selectedChannelType]);

  // Auto-scroll WhatsApp / BotMan conversation pane to the newest message at the bottom
  const activeWaChatId = waSelectedLeadId || waState?.chats?.[0]?.id || "";
  const activeWaMsgCount = activeWaChatId ? (waState?.messages?.[activeWaChatId]?.length ?? 0) : 0;
  useEffect(() => {
    if (!isMessagingConnector(selectedChannelType)) return;
    const scrollToBottom = () => {
      const el = waMessagesScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    scrollToBottom();
    const raf = requestAnimationFrame(scrollToBottom);
    const timer = setTimeout(scrollToBottom, 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [selectedAccount?.id, selectedChannelType, activeWaChatId, activeWaMsgCount]);

  // Auto-scroll AI Agent chat pane to the newest message at the bottom by default
  const activeAgentChatKey = selectedAccount
    ? activeChatSubagentId
      ? `${selectedAccount.id}:${activeChatSubagentId}`
      : selectedAccount.id
    : "";
  const activeAgentMsgCount = activeAgentChatKey ? (agentChats[activeAgentChatKey]?.length ?? 0) : 0;
  useEffect(() => {
    if (!isAgentConnector(selectedChannelType) || visualTriggersOpen) return;
    const scrollToBottom = () => {
      const el = agentChatScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    scrollToBottom();
    const raf = requestAnimationFrame(scrollToBottom);
    const timer = setTimeout(scrollToBottom, 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [selectedAccount?.id, selectedChannelType, activeChatSubagentId, visualTriggersOpen, activeAgentMsgCount, isAgentRunning]);

  const handleToggleWaChatAgentTakeover = async (
    chat: WhatsAppChatSummary,
    nextMode: "active" | "paused" | "auto",
    preferredAgentId?: string,
    preferredSubagentId?: string | null,
  ) => {
    if (!selectedAccount || waTakeoverBusyChatId === chat.id) return;
    setWaTakeoverBusyChatId(chat.id);
    try {
      const st = await setWhatsAppChatAgentTakeover({
        id: selectedAccount.id,
        chatId: chat.id,
        chatName: chat.name,
        mode: nextMode,
        agentConnectorId: preferredAgentId,
        subagentId: preferredSubagentId,
      });
      setWaState(st);
      if (nextMode === "auto") {
        notify(
          t(
            `Visual Trigger automation resumed for "${chat.name}".`,
            `Automatizácia vizuálneho spúšťača obnovená pre „${chat.name}“.`,
            `Vizuális trigger automatizáció visszaállítva a(z) „${chat.name}” beszélgetéshez.`,
          ),
        );
      } else if (nextMode === "active") {
        notify(
          t(
            `AI Agent took over "${chat.name}" for this session.`,
            `AI Agent prevzal konverzáciu „${chat.name}“ pre túto reláciu.`,
            `Az AI ügynök átvette a(z) „${chat.name}” beszélgetést erre a munkamenetre.`,
          ),
        );
      } else {
        notify(
          t(
            `AI Agent turned off for "${chat.name}" in this session.`,
            `AI Agent bol pre konverzáciu „${chat.name}“ v tejto relácii vypnutý.`,
            `Az AI ügynök kikapcsolva a(z) „${chat.name}” beszélgetésben erre a munkamenetre.`,
          ),
        );
      }
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setWaTakeoverBusyChatId(null);
    }
  };

  const handleResyncWhatsApp = async (chatId?: string) => {
    if (!selectedAccount || waLoading) return;
    setWaLoading(true);
    try {
      const st = await resyncWhatsAppChats(selectedAccount.id, chatId);
      setWaState(st);
      notify(
        t(
          `Synced ${st.chats?.length ?? 0} WhatsApp chats & groups.`,
          `Synchronizovaných ${st.chats?.length ?? 0} WhatsApp konverzácií a skupín.`,
          `${st.chats?.length ?? 0} WhatsApp beszélgetés és csoport szinkronizálva.`,
        ),
      );
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setWaLoading(false);
    }
  };

  const handleStartInlineWaQr = async () => {
    if (!selectedAccount) return;
    setWaInlineQrOpen(true);
    setWaInlineQrUrl(null);
    try {
      const started = await startWhatsAppDirectQr({
        id: selectedAccount.id,
        accountId: selectedAccount.settings?.waAccountId || waState?.accountId || `wa-${selectedAccount.id}`,
        reset: true,
      });
      if (started.qr) {
        setWaInlineQrUrl(started.qr);
      }
      const accId = started.accountId;
      const pollTimer = setInterval(async () => {
        try {
          const p = await pollWhatsAppDirectQr({ id: selectedAccount.id, accountId: accId });
          if (p.qr) setWaInlineQrUrl(p.qr);
          if (p.status === "connected") {
            clearInterval(pollTimer);
            setWaInlineQrOpen(false);
            setWaInlineQrUrl(null);
            notify(
              t(
                "WhatsApp linked! Syncing chats & groups…",
                "WhatsApp prepojený! Synchronizujem konverzácie a skupiny…",
                "WhatsApp összekapcsolva! Beszélgetések szinkronizálása…",
              ),
            );
            void handleResyncWhatsApp();
          }
        } catch {
          clearInterval(pollTimer);
        }
      }, 1800);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const handleSendWhatsAppMessage = async (
    targetChat: WhatsAppChatSummary,
    matchedLead: Lead | null,
  ) => {
    const text = waDraftMessage.trim();
    if (!text || !selectedAccount || waSending) return;
    setWaDraftMessage("");
    setWaSending(true);

    // Log to CRM lead timeline if matched
    if (matchedLead && canEdit) {
      const newEvent = {
        id: `wa-${Date.now()}`,
        type: "note" as const,
        timestamp: nowLocalStamp(),
        title: `WhatsApp (${selectedAccount?.name || "WhatsApp"})`,
        content: `📤 WhatsApp → ${matchedLead.phone || matchedLead.name}:\n${text}`,
        author: currentUser?.name || "",
      };
      setLeads((prev: Lead[]) =>
        prev.map((l) => (l.id === matchedLead.id ? { ...l, timeline: [newEvent, ...(l.timeline || [])] } : l)),
      );
    }

    try {
      const nextState = await sendWhatsAppChatMessage({
        id: selectedAccount.id,
        chatId: targetChat.id,
        text,
      });
      setWaState(nextState);
      notify(
        t(
          "WhatsApp message sent!",
          "WhatsApp správa odoslaná!",
          "WhatsApp üzenet elküldve!",
        ),
      );
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setWaSending(false);
    }
  };

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
      const res = await fetch(`/api/mail_broker.php?action=send_email${mbParam}`, {
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

  // Strategy C: hidden at once, deleted on the mail server when the undo window
  // closes. A failure puts the mail back with the server's message.
  const handleDeleteEmail = (uid: any) => {
    if (!canDelete) return;
    const index = emails.findIndex((e) => e.uid === uid);
    const target = emails[index] ?? (selectedEmail?.uid === uid ? selectedEmail : null);
    if (!target) return;
    const key = emailKey(target);
    const folder = activeFolder;
    runUndoable({
      message: singleMessage(systemLanguage, "email", "delete", target.subject || t("(No Subject)", "(Bez predmetu)", "(Nincs tárgy)")),
      undoLabel: undoLabel(systemLanguage),
      apply: () => {
        hiddenEmailKeysRef.current.add(key);
        setEmails(prev => prev.filter(e => e.uid !== uid));
        setSelectedEmail((cur: any) => (cur && cur.uid === uid ? null : cur));
      },
      revert: () => {
        hiddenEmailKeysRef.current.delete(key);
        if (index >= 0) setEmails(prev => reinsertAt(prev, [{ item: target, index }], (e: any) => `${e.isSent ? "S" : "I"}:${e.uid}`));
      },
      failureMessage: t("Failed to remove email", "Nepodarilo sa odstrániť e-mail", "Az e-mail eltávolítása nem sikerült"),
      onCommit: async () => {
        const res = await fetch(`/api/mail_broker.php?action=delete_email&uid=${encodeURIComponent(uid)}&folder=${encodeURIComponent(folder)}${mbParam}`, {
          method: "DELETE",
          headers: { "X-User-Email": currentUser.email }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "");
        hiddenEmailKeysRef.current.delete(key);
        loadEmails(1, filter);
      },
    });
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
    const msgIdToThreadKey: Record<string, string> = {};

    const normalizeSubject = (raw: string) => {
      let s = (raw || "").trim();
      const prefixRe = /^(?:(?:re|fwd|fw|odp|odpověď|rehg|ref|odpověd|válasz|aw|wg|sv|vs)(?:\[\d+\])?:\s*)+/i;
      while (prefixRe.test(s)) {
        s = s.replace(prefixRe, "").trim();
      }
      return s || t("(No Subject)", "(Bez predmetu)", "(Nincs tárgy)");
    };

    // Sort oldest to newest first so `in_reply_to` / `references` can link to earlier messages' `message_id`
    const chronological = [...filtered].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    chronological.forEach((email) => {
      const normSubj = normalizeSubject(email.subject || "");
      let threadKey = "";

      const inReplyTo = (email.in_reply_to || "").trim();
      if (inReplyTo && msgIdToThreadKey[inReplyTo]) {
        threadKey = msgIdToThreadKey[inReplyTo];
      }
      if (!threadKey && email.references) {
        const refs = String(email.references).split(/\s+/).filter(Boolean);
        for (let i = refs.length - 1; i >= 0; i--) {
          if (msgIdToThreadKey[refs[i]]) {
            threadKey = msgIdToThreadKey[refs[i]];
            break;
          }
        }
      }
      if (!threadKey) {
        threadKey = normSubj;
      }

      if (email.message_id) {
        msgIdToThreadKey[String(email.message_id).trim()] = threadKey;
      }

      if (!threadsMap[threadKey]) {
        threadsMap[threadKey] = [];
      }
      threadsMap[threadKey].push(email);
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

  // Auto-scroll Email Thread conversation pane to the newest message at the bottom by default
  const activeThreadEmailCount = activeThread?.emails?.length ?? 0;
  const latestThreadUid = activeThread?.latestEmail?.uid;
  const latestThreadBodyLoaded = Boolean(latestThreadUid && threadBodies[latestThreadUid]);
  useEffect(() => {
    if (!isSelectedEmailChannel || !isThreadedMode || !activeThread) return;
    const scrollToBottom = () => {
      const el = emailThreadScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    scrollToBottom();
    const raf = requestAnimationFrame(scrollToBottom);
    const timer = setTimeout(scrollToBottom, 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [isSelectedEmailChannel, isThreadedMode, activeThread?.id, activeThreadEmailCount, latestThreadBodyLoaded]);

  // Toggle expand/collapse inside conversation flow and load detail inline lazily
  const toggleEmailExpand = async (email: any) => {
    const isExpanded = !expandedEmailUids[email.uid];
    setExpandedEmailUids(prev => ({ ...prev, [email.uid]: isExpanded }));

    if (isExpanded && !threadBodies[email.uid]) {
      setIsLoadingDetail(true);
      const folderToUse = email.isSent ? "Sent" : activeFolder;
      try {
        const res = await fetch(`/api/mail_broker.php?action=get_email_detail&uid=${encodeURIComponent(email.uid)}&folder=${encodeURIComponent(folderToUse)}${mbParam}`, {
          headers: { "X-User-Email": currentUser.email }
        });
        const data = await res.json();
        if (data.success) {
          setThreadBodies(prev => ({ ...prev, [email.uid]: data.email }));
          if (typeof data.email?.seen === "boolean") {
            setEmails(prev => prev.map(e => e.uid === email.uid ? { ...e, seen: data.email.seen } : e));
          }
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
    const initialProblems: Record<string, string[]> = {};
    const initialActionItems: Record<string, string[]> = {};
    emails.forEach(e => {
      if (e.summary) {
        try {
          if (e.summary.trim().startsWith('{')) {
            const parsed = JSON.parse(e.summary);
            initialSummaries[e.uid] = parsed.summary || '';
            if (Array.isArray(parsed.problems)) {
              initialProblems[e.uid] = parsed.problems;
            }
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
    setProblemsMap(prev => ({ ...initialProblems, ...prev }));
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

  const { getLinkedTickets, handleLinkEmailToTicket, handleUnlinkEmailFromTicket } = useEmailTicketLinks({
    tickets, setTickets, canEdit, selectedMailboxId, setSelectedMailboxId, availableAccounts,
    isSelectedEmailChannel, isLoadingEmails, emails, lastSyncAt, isThreadedMode, setIsThreadedMode,
    threadedEmails, setSelectedThreadId, setExpandedEmailUids, setSelectedEmail, setThreadBodies,
    setIsLoadingDetail, expandThreadMessage, activeFolder, mbParam, userEmail: currentUser?.email || "", notify, t,
  });

  const {
    locale, primaryButtonClass, initialsOf, formatListDate, emptyPane, renderCrmActions,
    renderInlineAiSummaryBanner, unreadCount, closeDigest, onListScroll, shownCount, renderListRow, plural,
    threadContactOf, findLead, renderLeadChip, renderDigestButton, readToggleButton, counterpartOf,
    formatFullDate, renderMailFrame, renderAttachments, renderPartyMeta, renderDigestPopover,
  } = useEmailPresentation({
    systemLanguage, t, leads, setClientFormEmail, setClientFormName, setClientFormCity, setClientFormPhone,
    setClientFormType, setIsClientSlideoutOpen, setSlideoutLead, setIsTimelineSlideoutOpen, canEdit,
    activeFolder, handleDownloadAttachment, handleAddAttachmentToDocs, isLargeFont, digestHideTimer, setDigest,
    setAssigningActionItem, isOpenAiKeySet, digest, problemsMap, loadingSummaries, summaries, actionItemsMap,
    tasks, users, handleAddEmailActionItemAsTask, currentUser, assigningActionItem, isThreadedMode,
    threadedEmails, filteredIndividualEmails, visibleThreads, visibleIndividualEmails, getLinkedTickets,
  });

  return (
    <div className="space-y-5 select-none animate-fade-in text-gray-800">
    {/* Module header (docs/VIEW-SIZE.md §6.2) */}
    <PageHeader
      icon={<SectionIcon id="email" />}
      title={t("Email Inbox", "Emailová schránka", "E-mail postafiók")}
      subtitle={t(`Unified SMTP / IMAP inbox connected to your ${PRODUCT_NAME} contacts`, `Jednotná SMTP / IMAP schránka prepojená s kontaktmi ${PRODUCT_NAME}`, `Egységes SMTP / IMAP postafiók a ${PRODUCT_NAME} kapcsolatokhoz`)}
      actions={
        <>
          {availableAccounts.length > 1 && (
            <select
              value={selectedMailboxId || availableAccounts[0]?.id || ""}
              onChange={(e) => {
                setSelectedMailboxId(e.target.value);
                setSelectedEmail(null);
                setSelectedThreadId(null);
              }}
              aria-label={t("Active mailbox", "Aktívna schránka", "Aktív postafiók")}
              className="px-3.5 py-2 rounded-md bg-white border border-gray-200 text-body font-semibold text-gray-700 shadow-2xs cursor-pointer focus:outline-none focus:border-entity-border"
            >
              {availableAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.address})
                </option>
              ))}
            </select>
          )}
          {!canEdit && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-body font-bold shrink-0"
              title={t(`Your role can read mail but not send it or write into ${PRODUCT_NAME} from here.`, `Vaša rola môže poštu čítať, ale nie odosielať ani odtiaľto zapisovať do ${PRODUCT_NAME}.`, `A szerepköre olvashatja a leveleket, de nem küldhet, és innen nem írhat a ${PRODUCT_NAME}-be.`)}
            >
              <Lock className="h-4 w-4" />
              {t("Read-only access", "Iba na čítanie", "Csak olvasható")}
            </span>
          )}
          <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-white border border-gray-200 text-body font-semibold text-gray-600 shadow-2xs">
            <span className={`h-2 w-2 rounded-full shrink-0 ${isSyncingEmails ? "bg-entity-solid animate-pulse" : "bg-emerald-500"}`} />
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
            className="h-10 w-10 bg-white hover:bg-gray-50 active:scale-95 border border-gray-200 text-gray-600 hover:text-entity-text rounded-md transition-all flex items-center justify-center shadow-2xs shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
          >
            <RefreshCw size={16} className={isSyncingEmails ? "animate-spin" : ""} />
          </button>
          {canEdit && (
            <button type="button" onClick={() => openNewComposer()} className={`${primaryButtonClass} shrink-0`}>
              <Plus size={16} /> {t("New Message", "Nová správa", "Új üzenet")}
            </button>
          )}
        </>
      }
    />

    <div className={`flex flex-col ws-lg:flex-row gap-4 select-none h-[calc(100vh-280px)] min-h-130 items-stretch overflow-hidden animate-slide-up email-view-root ${isLargeFont ? 'email-view-large' : ''}`}>
      <style>{`
        /* Large-text mode lifts the role tokens for this subtree only (docs/VIEW-SIZE.md). */
        .email-view-large {
          --text-micro: 0.8125rem; --text-caption: 0.875rem; --text-ui: 0.9375rem;
          --text-body: 1.0625rem; --text-title-sm: 1.1875rem; --text-title: 1.3125rem;
          --text-heading: 1.6875rem;
        }
        .email-view-large input { font-size: 17px !important; }
        .email-view-large select { font-size: 17px !important; }
      `}</style>
      {/* Notifications banner */}
      {notification && (
        <div className={`fixed bottom-4 right-4 z-50 px-5 py-3.5 rounded-lg flex items-center gap-3 border shadow-xl ${
          notification.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-rose-50 border-rose-200 text-rose-900"
        }`}>
          {notification.type === "success" ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
          <span className="text-body font-bold">{notification.text}</span>
        </div>
      )}

      {/* SECOND SIDEBAR: Authorized Communication Accounts */}
      <EmailAccountsSidebar
        t={t} availableAccounts={availableAccounts} selectedAccount={selectedAccount}
        agentStates={agentStates} setSelectedMailboxId={setSelectedMailboxId}
        setActiveChatSubagentId={setActiveChatSubagentId} setSelectedEmail={setSelectedEmail}
        setSelectedThreadId={setSelectedThreadId} setNewSubagentOpen={setNewSubagentOpen}
        setVisualTriggersOpen={setVisualTriggersOpen} activeChatSubagentId={activeChatSubagentId}
        visualTriggersOpen={visualTriggersOpen}
      />

      {/* RIGHT WORKSPACE: Dynamic Layout Depending on Selected Communication Channel */}
      {isMessagingConnector(selectedChannelType) ? (
        /* WHATSAPP & BOTMAN MESSAGING LAYOUT */
        <EmailMessagingLayout
        waState={waState} selectedChannelType={selectedChannelType} leads={leads} waFilterType={waFilterType}
        waSearchQuery={waSearchQuery} waSelectedLeadId={waSelectedLeadId} selectedAccount={selectedAccount}
        chatClientLinks={chatClientLinks} availableAccounts={availableAccounts} agentStates={agentStates}
        t={t} handleResyncWhatsApp={handleResyncWhatsApp} waLoading={waLoading}
        handleStartInlineWaQr={handleStartInlineWaQr} waInlineQrOpen={waInlineQrOpen}
        setWaInlineQrOpen={setWaInlineQrOpen} waInlineQrUrl={waInlineQrUrl}
        setWaSearchQuery={setWaSearchQuery} setWaFilterType={setWaFilterType}
        setWaSelectedLeadId={setWaSelectedLeadId} initialsOf={initialsOf} formatListDate={formatListDate}
        emptyPane={emptyPane} waTakeoverBusyChatId={waTakeoverBusyChatId}
        handleToggleWaChatAgentTakeover={handleToggleWaChatAgentTakeover} canEdit={canEdit}
        setPendingChatLinkKey={setPendingChatLinkKey} setClientFormName={setClientFormName}
        setClientFormPhone={setClientFormPhone} setClientFormEmail={setClientFormEmail}
        setClientFormCity={setClientFormCity} setClientFormType={setClientFormType}
        setIsClientSlideoutOpen={setIsClientSlideoutOpen} saveChatClientLink={saveChatClientLink}
        renderCrmActions={renderCrmActions} renderInlineAiSummaryBanner={renderInlineAiSummaryBanner}
        fetchSummary={fetchSummary} summaries={summaries} waMessagesScrollRef={waMessagesScrollRef}
        currentUser={currentUser} waDraftMessage={waDraftMessage} setWaDraftMessage={setWaDraftMessage}
        handleSendWhatsAppMessage={handleSendWhatsAppMessage} waSending={waSending}
        />
      ) : isAgentConnector(selectedChannelType) ? (
        /* SUBSCRIPTION AI AGENT: CENTER (100% CHAT OR 50/50 SPLIT WITH ARTIFACT EDITOR) + RIGHT SIDEBAR (MEMORY & ARTIFACTS) */
        <EmailAgentLayout
        selectedChannelType={selectedChannelType} selectedAccount={selectedAccount}
        activeChatSubagentId={activeChatSubagentId} agentChats={agentChats} agentStates={agentStates}
        availableAccounts={availableAccounts} selectedArtifactKey={selectedArtifactKey}
        visualTriggersOpen={visualTriggersOpen} t={t} setNewSubagentOpen={setNewSubagentOpen}
        openNewTriggerModal={openNewTriggerModal} setVisualTriggersOpen={setVisualTriggersOpen}
        openEditTriggerModal={openEditTriggerModal} handleTestTrigger={handleTestTrigger}
        isTestingTriggerId={isTestingTriggerId} handleToggleTriggerEnabled={handleToggleTriggerEnabled}
        handleDeleteTrigger={handleDeleteTrigger} setActiveChatSubagentId={setActiveChatSubagentId}
        handleCancelFollowup={handleCancelFollowup} setSelectedMailboxId={setSelectedMailboxId}
        handleToggleSubagentHeartbeat={handleToggleSubagentHeartbeat}
        handleSelectArtifact={handleSelectArtifact} handleSendAgentMessage={handleSendAgentMessage}
        isAgentRunning={isAgentRunning} handleClearAgentChat={handleClearAgentChat}
        agentChatScrollRef={agentChatScrollRef} currentUser={currentUser}
        setWaSelectedLeadId={setWaSelectedLeadId} agentPrompt={agentPrompt} setAgentPrompt={setAgentPrompt}
        isMemoryDirty={isMemoryDirty} artifactTitleDraft={artifactTitleDraft}
        handleRunTaskNow={handleRunTaskNow} handleUpdateAutonomousCron={handleUpdateAutonomousCron}
        handleToggleTask={handleToggleTask} handleSaveSelectedArtifact={handleSaveSelectedArtifact}
        isSavingMemory={isSavingMemory} canEdit={canEdit} handleDeleteArtifact={handleDeleteArtifact}
        handleDeleteSubagent={handleDeleteSubagent} handleDeleteTask={handleDeleteTask}
        subPromptDraft={subPromptDraft} setSubPromptDraft={setSubPromptDraft}
        setIsMemoryDirty={setIsMemoryDirty} memoryDraft={memoryDraft} setMemoryDraft={setMemoryDraft}
        setNewArtifactOpen={setNewArtifactOpen} newArtifactOpen={newArtifactOpen}
        newArtifactName={newArtifactName} setNewArtifactName={setNewArtifactName}
        handleCreateArtifact={handleCreateArtifact} newSubagentOpen={newSubagentOpen} newSubName={newSubName}
        setNewSubName={setNewSubName} newSubRole={newSubRole} setNewSubRole={setNewSubRole}
        newSubPrompt={newSubPrompt} setNewSubPrompt={setNewSubPrompt}
        handleCreateSubagent={handleCreateSubagent} setNewTaskOpen={setNewTaskOpen} newTaskOpen={newTaskOpen}
        newTaskTitle={newTaskTitle} setNewTaskTitle={setNewTaskTitle} newTaskInterval={newTaskInterval}
        setNewTaskInterval={setNewTaskInterval} newTaskPrompt={newTaskPrompt}
        setNewTaskPrompt={setNewTaskPrompt} handleCreateTask={handleCreateTask}
        triggerModalOpen={triggerModalOpen} setTriggerModalOpen={setTriggerModalOpen}
        triggerDraftId={triggerDraftId} triggerDraftName={triggerDraftName}
        setTriggerDraftName={setTriggerDraftName} triggerDraftSourceType={triggerDraftSourceType}
        triggerDraftSourceConnectorId={triggerDraftSourceConnectorId}
        setTriggerDraftSourceConnectorId={setTriggerDraftSourceConnectorId}
        setTriggerDraftSourceType={setTriggerDraftSourceType}
        triggerDraftTargetSubagentId={triggerDraftTargetSubagentId}
        setTriggerDraftTargetSubagentId={setTriggerDraftTargetSubagentId} waState={waState}
        setTriggerDraftChatMatch={setTriggerDraftChatMatch} triggerDraftChatMatch={triggerDraftChatMatch}
        triggerDraftKeywordContains={triggerDraftKeywordContains}
        setTriggerDraftKeywordContains={setTriggerDraftKeywordContains}
        triggerDraftOnlyGroup={triggerDraftOnlyGroup} setTriggerDraftOnlyGroup={setTriggerDraftOnlyGroup}
        setTriggerDraftOnlyDirect={setTriggerDraftOnlyDirect} triggerDraftOnlyDirect={triggerDraftOnlyDirect}
        triggerDraftFromContains={triggerDraftFromContains}
        setTriggerDraftFromContains={setTriggerDraftFromContains}
        triggerDraftSubjectContains={triggerDraftSubjectContains}
        setTriggerDraftSubjectContains={setTriggerDraftSubjectContains}
        triggerDraftEventType={triggerDraftEventType} setTriggerDraftEventType={setTriggerDraftEventType}
        triggerDraftInstructions={triggerDraftInstructions}
        setTriggerDraftInstructions={setTriggerDraftInstructions}
        triggerDraftAutoReply={triggerDraftAutoReply} setTriggerDraftAutoReply={setTriggerDraftAutoReply}
        triggerDraftProactiveEnabled={triggerDraftProactiveEnabled}
        setTriggerDraftProactiveEnabled={setTriggerDraftProactiveEnabled}
        triggerDraftProactiveAfterMinutes={triggerDraftProactiveAfterMinutes}
        setTriggerDraftProactiveAfterMinutes={setTriggerDraftProactiveAfterMinutes}
        triggerDraftProactiveMaxAttempts={triggerDraftProactiveMaxAttempts}
        setTriggerDraftProactiveMaxAttempts={setTriggerDraftProactiveMaxAttempts}
        triggerDraftProactiveInstructions={triggerDraftProactiveInstructions}
        setTriggerDraftProactiveInstructions={setTriggerDraftProactiveInstructions}
        handleSaveTriggerDraft={handleSaveTriggerDraft}
        />
      ) : (
        /* EMAIL COMMUNICATION LAYOUT (Gmail, SMTP/IMAP, MS Exchange, Personal) */
        <EmailMailLayout
        mailboxNeedsReconnect={mailboxNeedsReconnect} t={t} searchQuery={searchQuery}
        setSearchQuery={setSearchQuery} filter={filter} setFilter={setFilter} unreadCount={unreadCount}
        setIsLargeFont={setIsLargeFont} isLargeFont={isLargeFont} setIsThreadedMode={setIsThreadedMode}
        setSelectedEmail={setSelectedEmail} setSelectedThreadId={setSelectedThreadId}
        setExpandedEmailUids={setExpandedEmailUids} closeDigest={closeDigest} isThreadedMode={isThreadedMode}
        onListScroll={onListScroll} isLoadingEmails={isLoadingEmails} shownCount={shownCount}
        visibleThreads={visibleThreads} renderListRow={renderListRow} selectedThreadId={selectedThreadId}
        toggleEmailExpand={toggleEmailExpand} visibleIndividualEmails={visibleIndividualEmails}
        selectedEmail={selectedEmail} expandThreadMessage={expandThreadMessage} plural={plural}
        activeThread={activeThread} threadContactOf={threadContactOf} findLead={findLead}
        initialsOf={initialsOf} renderLeadChip={renderLeadChip} renderDigestButton={renderDigestButton}
        readToggleButton={readToggleButton} setThreadSeen={setThreadSeen}
        renderInlineAiSummaryBanner={renderInlineAiSummaryBanner} threadBodies={threadBodies}
        stripHtml={stripHtml} fetchSummary={fetchSummary} emailThreadScrollRef={emailThreadScrollRef}
        expandedEmailUids={expandedEmailUids} counterpartOf={counterpartOf} formatFullDate={formatFullDate}
        canEdit={canEdit} openNewComposer={openNewComposer} canDelete={canDelete}
        systemLanguage={systemLanguage} handleDeleteEmail={handleDeleteEmail}
        isLoadingDetail={isLoadingDetail} renderMailFrame={renderMailFrame}
        renderAttachments={renderAttachments} primaryButtonClass={primaryButtonClass}
        renderCrmActions={renderCrmActions} emptyPane={emptyPane} emails={emails}
        renderPartyMeta={renderPartyMeta} setSeenFlag={setSeenFlag} activeFolder={activeFolder}
        tickets={tickets} ticketStatuses={ticketStatuses} getLinkedTickets={getLinkedTickets}
        onLinkEmailToTicket={handleLinkEmailToTicket} onUnlinkEmailFromTicket={handleUnlinkEmailFromTicket}
        />
      )}

      {renderDigestPopover()}

      {/* COMPOSERS OVERLAY DRAWER */}
      {composers.map(comp => (
        <EmailComposerDrawer key={comp.id}
        comp={comp} t={t} closeComposer={closeComposer} setComposers={setComposers}
        handleSendEmail={handleSendEmail} isSending={isSending}
        />
      ))}

      {/* TIMELINE SLIDEOUT OVERLAY */}
      {(isTimelineSlideoutOpen || isClosingTimeline) && slideoutLead && (
        <EmailTimelineSlideout
        isClosingTimeline={isClosingTimeline} closeTimelineSlideout={closeTimelineSlideout} t={t}
        slideoutLead={slideoutLead} isLoadingSlideoutEmails={isLoadingSlideoutEmails}
        slideoutTimelineEvents={slideoutTimelineEvents} currentUser={currentUser}
        projectManagerColors={projectManagerColors} systemLanguage={systemLanguage}
        expandedTimelineEventIds={expandedTimelineEventIds}
        toggleTimelineEventExpanded={toggleTimelineEventExpanded}
        />
      )}

      {/* CLIENT CREATION SLIDEOUT DRAWER (slides up from bottom) */}
      {(isClientSlideoutOpen || isClosingClient) && (
        <EmailClientSlideout
        isClosingClient={isClosingClient} closeClientSlideout={closeClientSlideout} t={t}
        pendingChatLinkKey={pendingChatLinkKey} handleCreateClientSubmit={handleCreateClientSubmit}
        clientFormName={clientFormName} setClientFormName={setClientFormName}
        clientFormEmail={clientFormEmail} setClientFormEmail={setClientFormEmail}
        clientFormPhone={clientFormPhone} setClientFormPhone={setClientFormPhone}
        clientFormCity={clientFormCity} setClientFormCity={setClientFormCity} clientFormType={clientFormType}
        setClientFormType={setClientFormType}
        />
      )}
    </div>
    </div>
  );
};
