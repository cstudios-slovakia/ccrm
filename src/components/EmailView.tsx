import { PageHeader } from "./layout";
import { SectionIcon } from "./icons/SectionIcon";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import {
  Send, Trash2, Search, Mail, Plus, X, Loader2,
  Reply, CheckCircle2, CircleAlert, Clock, Phone, FileText, Calendar, TrendingUp,
  CornerDownLeft, CornerLeftDown, ChevronDown, ChevronUp, Brain, RefreshCw, Lock, MailOpen,
  Type, MessagesSquare, Inbox, Paperclip, UserPlus, ExternalLink, History, Download, FolderPlus,
  FileSpreadsheet, FileImage, ArrowUpRight, ArrowDownLeft, Bot, MessageCircle, QrCode, Settings, Sparkles, Terminal, Users,
  Zap, Activity, Play
} from "lucide-react";
import type { Lead, Task, UserProfile } from "../types";
import type { ModuleAccess } from "../utils/permissions";
import { FULL_MODULE_ACCESS } from "../utils/permissions";
import { formatBytes } from "../utils/formatBytes";
import { nowLocalStamp, localeCodeFor, formatTimestampLocalized, todayLocalPlusDays } from "../utils/localTime";
import { getTranslation } from "../utils/translations";
import { Markdown } from "../utils/markdown";
import { CustomSelect } from "./ui/CustomSelect";
import { TimelineAuthorBadge } from "./TimelineAuthorBadge";
import { TimelineCollapsible } from "./TimelineCollapsible";
import { isOutgoingMail } from "../utils/mailTimeline";
import { HoldToConfirmButton } from "./ui/HoldToConfirm";
import { runUndoable } from "../utils/undoable";
import { reinsertAt } from "../utils/undoableList";
import { singleMessage, undoLabel } from "../utils/undoMessages";
import { useListFilter } from "../hooks/useListFilter";
import { PROVIDERS, ProviderLogo } from "./CompanyMailboxSettings";
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
      const res = await fetch(`/api/mail_broker.php?action=get_attachment&folder=${encodeURIComponent(folder)}&uid=${uid}&part=${att.part_num}&name=${encodeURIComponent(att.name)}${mbParam}`, {
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
      const res = await fetch(`/api/mail_broker.php?action=save_attachment&folder=${encodeURIComponent(folder)}&uid=${uid}&part=${att.part_num}&name=${encodeURIComponent(att.name)}&eventId=${eventId}${mbParam}`, {
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
    setSelectedMailboxId((prev) => {
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
      const res = await fetch(`/api/mail_broker.php?action=get_email_detail&uid=${email.uid}&folder=${encodeURIComponent(folderToUse)}${mbParam}`, {
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
    nextMode: "active" | "paused",
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
      if (nextMode === "active") {
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
        const res = await fetch(`/api/mail_broker.php?action=delete_email&uid=${uid}&folder=${encodeURIComponent(folder)}${mbParam}`, {
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
        const res = await fetch(`/api/mail_broker.php?action=get_email_detail&uid=${email.uid}&folder=${encodeURIComponent(folderToUse)}${mbParam}`, {
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
  const secondaryButtonClass = "px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-xl text-body font-bold flex items-center gap-2 transition-all shadow-2xs active:scale-95 cursor-pointer";
  const primaryButtonClass = "px-4 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-body font-bold flex items-center gap-2 transition-all shadow active:scale-95 cursor-pointer";

  const renderLeadChip = (lead: Lead | null) =>
    lead ? (
      <span
        title={`${t("CRM Match:", "Zhoda CRM:", "CRM egyezés:")} ${lead.name}`}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-ui font-bold border ${
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
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-body text-slate-500">
        <span className="inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-bold max-w-full">
          <span className="h-6 w-6 rounded-lg bg-white border border-slate-200 text-slate-600 text-caption font-bold flex items-center justify-center shrink-0">
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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-ui font-bold border bg-white text-slate-500 border-slate-200">
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
        <div className="text-ui font-bold text-slate-500 mb-2 flex items-center gap-1.5">
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
                  <span className="block text-body font-bold text-slate-800 truncate max-w-50">{att.name}</span>
                  <span className="block text-ui text-slate-500">{formatBytes(att.size)}</span>
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
              <span className="text-body font-bold text-purple-950">
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
              <div className="flex items-center gap-2 text-body text-purple-700 font-semibold">
                <Loader2 size={15} className="animate-spin" />
                {isThread
                  ? t("Analyzing conversation flow...", "Analyzuje sa tok konverzácie...", "Beszélgetés folyamának elemzése...")
                  : t("Analyzing email content...", "Analyzuje sa obsah e-mailu...", "E-mail tartalmának elemzése...")}
              </div>
            ) : summaries[key] ? (
              <p className="text-body text-slate-700 leading-relaxed">{summaries[key]}</p>
            ) : (
              <p className="text-body text-slate-400 italic">{t("No summary available.", "Súhrn nie je k dispozícii.", "Nincs elérhető összefoglaló.")}</p>
            )}
          </div>

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
                    <li key={idx} className="rounded-xl bg-purple-50/60 border border-purple-100 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-body text-slate-800">{item}</span>
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
                              className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-ui font-bold text-slate-700 cursor-pointer transition-all"
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
            <p className="mt-3 text-ui text-slate-400">{t("Click the icon to keep it open.", "Kliknutím na ikonu ho necháte otvorený.", "Kattintson az ikonra, hogy nyitva maradjon.")}</p>
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
        {opts.selected && <span className="absolute left-0 top-0 bottom-0 w-0.75 bg-pink-600 rounded-r" aria-hidden />}
        <span className="h-9 w-9 rounded-xl bg-slate-100 text-slate-600 text-ui font-bold flex items-center justify-center shrink-0">
          {initialsOf(party.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={`flex items-center min-w-0 text-ui font-medium ${opts.unread ? "text-slate-700" : "text-slate-500"}`}>
              <GeometricIcon emailString={party.address} />
              {opts.email.isSent && <span className="text-slate-400 font-semibold mr-1 shrink-0">{t("To:", "Komu:", "Címzett:")}</span>}
              <span className="truncate">{party.name}</span>
            </span>
            <span className={`text-ui shrink-0 ${opts.unread ? "text-pink-600 font-bold" : "text-slate-500"}`}>{formatListDate(opts.email.date)}</span>
          </div>
          <div className={`mt-0.5 text-title-sm font-bold truncate ${opts.unread ? "text-slate-900" : "text-slate-700"}`}>
            {opts.subject || t("(No Subject)", "(Bez predmetu)", "(Nincs tárgy)")}
          </div>
          {opts.email.preview && (
            <p className="mt-0.5 text-body text-slate-500 line-clamp-2 break-words">{opts.email.preview}</p>
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
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-ui font-bold bg-slate-50 text-slate-500 border border-slate-200">
                <ArrowUpRight size={12} /> {t("Sent", "Odoslané", "Elküldve")}
              </span>
            ) : null}
            {opts.count !== undefined && opts.count > 1 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-ui font-bold bg-pink-50 text-pink-700 border border-pink-100">
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
      <span className="text-body font-semibold text-slate-500">{text}</span>
    </div>
  );

  return (
    <div className="space-y-5 select-none animate-fade-in text-slate-800">
    {/* Module header (docs/VIEW-SIZE.md §6.2) */}
    <PageHeader
      icon={<SectionIcon id="email" />}
      title={t("Email Inbox", "Emailová schránka", "E-mail postafiók")}
      subtitle={t("Unified SMTP / IMAP inbox connected to your CRM contacts", "Jednotná SMTP / IMAP schránka prepojená s kontaktmi CRM", "Egységes SMTP / IMAP postafiók a CRM kapcsolatokhoz")}
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
              className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-body font-semibold text-slate-700 shadow-2xs cursor-pointer focus:outline-none focus:border-pink-300"
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
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-body font-bold shrink-0"
              title={t("Your role can read mail but not send it or write into the CRM from here.", "Vaša rola môže poštu čítať, ale nie odosielať ani odtiaľto zapisovať do CRM.", "A szerepköre olvashatja a leveleket, de nem küldhet, és innen nem írhat a CRM-be.")}
            >
              <Lock className="h-4 w-4" />
              {t("Read-only access", "Iba na čítanie", "Csak olvasható")}
            </span>
          )}
          <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-body font-semibold text-slate-600 shadow-2xs">
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
        <div className={`fixed bottom-4 right-4 z-50 px-5 py-3.5 rounded-2xl flex items-center gap-3 border shadow-2xl ${
          notification.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-rose-50 border-rose-200 text-rose-900"
        }`}>
          {notification.type === "success" ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
          <span className="text-body font-bold">{notification.text}</span>
        </div>
      )}

      {/* SECOND SIDEBAR: Authorized Communication Accounts */}
      <aside
        data-testid="communication-accounts-sidebar"
        className="w-full ws-lg:w-64 shrink-0 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col h-auto ws-lg:h-full max-h-full overflow-hidden text-left"
      >
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
          <div>
            <div className="type-overline text-slate-400">
              {t("Authorized Channels", "Autorizované kanály", "Engedélyezett csatornák")}
            </div>
            <div className="text-ui font-bold text-slate-900">
              {t("Accounts", "Účty", "Fiókok")} ({availableAccounts.length})
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              window.location.hash = "settings/email/mailboxes";
            }}
            title={t("Manage External Connectors", "Spravovať externé konektory", "Külső konektorok kezelése")}
            className="h-8 w-8 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Settings size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {availableAccounts.length === 0 ? (
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 text-caption text-slate-500 space-y-2">
              <p>{t("No active channels assigned yet.", "Zatiaľ nie sú priradené žiadne kanály.", "Még nincs hozzárendelt csatorna.")}</p>
              <button
                type="button"
                onClick={() => {
                  window.location.hash = "settings/email/mailboxes";
                }}
                className="w-full px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-micro font-bold"
              >
                + {t("Connect Channel", "Pripojiť kanál", "Csatorna csatlakoztatása")}
              </button>
            </div>
          ) : (
            availableAccounts.map((acc) => {
              const meta = PROVIDERS[acc.connectorType] ?? PROVIDERS.smtp;
              const isSelected = (selectedAccount?.id ?? "") === acc.id;
              const isAiConn = isAgentConnector(acc.connectorType);
              const connSubagents = agentStates[acc.id]?.subagents ?? acc.subagents ?? [];
              const connTriggers = agentStates[acc.id]?.triggers ?? acc.triggers ?? [];
              const connHeartbeatOn = Boolean(agentStates[acc.id]?.autonomousMode?.enabled);

              return (
                <div key={acc.id} className="space-y-1">
                  <button
                    type="button"
                    data-testid={`comm-account-${acc.id}`}
                    onClick={() => {
                      setSelectedMailboxId(acc.id);
                      if (isAiConn) {
                        setActiveChatSubagentId("");
                      } else {
                        setSelectedEmail(null);
                        setSelectedThreadId(null);
                      }
                    }}
                    className={`w-full p-2.5 rounded-2xl border text-left transition-all flex items-start gap-2.5 cursor-pointer ${meta.rowBorder} ${
                      isSelected
                        ? `${meta.rowBg} ${meta.accentRing} border-slate-300 shadow-xs`
                        : "bg-white hover:bg-slate-50/90 border-slate-200/70"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.iconBg}`}>
                      <ProviderLogo type={acc.connectorType} className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`px-1.5 py-0.5 rounded text-micro font-bold uppercase ${meta.badgeClass}`}>
                          {meta.label.split(" ")[0]}
                        </span>
                        {isAiConn ? (
                          <div className="flex items-center gap-1">
                            {connTriggers.filter((tr) => tr.enabled).length > 0 && (
                              <span
                                title={t("Active reactive triggers", "Aktívne reaktívne spúšťače", "Aktív reaktív indítók")}
                                className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-micro font-bold"
                              >
                                ⚡ {connTriggers.filter((tr) => tr.enabled).length}
                              </span>
                            )}
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMailboxId(acc.id);
                                setNewSubagentOpen(true);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.stopPropagation();
                                  setSelectedMailboxId(acc.id);
                                  setNewSubagentOpen(true);
                                }
                              }}
                              title={t("Create new agent from this connection", "Vytvoriť nového agenta z tohto pripojenia", "Új ügynök létrehozása ebből a kapcsolatból")}
                              className="px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 text-micro font-bold"
                            >
                              + {t("Agent", "Agent", "Ügynök")}
                            </span>
                          </div>
                        ) : (
                          acc.isPersonal && (
                            <span className="text-micro font-semibold text-slate-400">
                              {t("Personal", "Osobný", "Személyes")}
                            </span>
                          )
                        )}
                      </div>
                      <div className="text-ui font-bold text-slate-900 truncate mt-0.5">{acc.name}</div>
                      <div className="text-micro text-slate-500 font-mono truncate">{acc.address}</div>
                    </div>
                  </button>

                  {/* Multi-Agent Tree under AI Connection */}
                  {isAiConn && (isSelected || connSubagents.length > 0) && (
                    <div className="pl-3.5 pr-1 py-0.5 space-y-1 border-l-2 border-indigo-100 ml-4">
                      {/* Main Agent */}
                      <button
                        type="button"
                        data-testid={`comm-agent-${acc.id}-main`}
                        onClick={() => {
                          setSelectedMailboxId(acc.id);
                          setActiveChatSubagentId("");
                          setVisualTriggersOpen(false);
                        }}
                        className={`w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between gap-1.5 transition-all cursor-pointer border ${
                          isSelected && activeChatSubagentId === "" && !visualTriggersOpen
                            ? "bg-indigo-50/90 border-indigo-300 text-indigo-950 font-bold shadow-2xs"
                            : "bg-slate-50/70 hover:bg-slate-100/80 border-slate-200/60 text-slate-700"
                        }`}
                      >
                        <span className="text-micro truncate flex items-center gap-1.5">
                          <Sparkles size={11} className="text-indigo-600 shrink-0" />
                          <span className="truncate">{t("Main Agent", "Hlavný agent", "Fő ügynök")}</span>
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          {connTriggers.some((tr) => tr.enabled && (!tr.targetSubagentId || tr.targetSubagentId === "main")) && (
                            <span title={t("Reactive trigger active", "Reaktívny spúšťač aktívny", "Reaktív indító aktív")} className="text-micro">
                              ⚡
                            </span>
                          )}
                          {connHeartbeatOn && (
                            <span title={t("Heartbeat active", "Heartbeat aktívny", "Heartbeat aktív")} className="text-micro">
                              💓
                            </span>
                          )}
                        </span>
                      </button>

                      {/* Created Independent Agents from this Connection */}
                      {connSubagents.map((sub) => {
                        const subActive = isSelected && activeChatSubagentId === sub.id && !visualTriggersOpen;
                        const subHasTrig = connTriggers.some((tr) => tr.enabled && tr.targetSubagentId === sub.id);
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            data-testid={`comm-agent-${acc.id}-${sub.id}`}
                            onClick={() => {
                              setSelectedMailboxId(acc.id);
                              setActiveChatSubagentId(sub.id);
                              setVisualTriggersOpen(false);
                            }}
                            className={`w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between gap-1.5 transition-all cursor-pointer border ${
                              subActive
                                ? "bg-amber-50/95 border-amber-300 text-amber-950 font-bold shadow-2xs"
                                : "bg-white hover:bg-amber-50/40 border-slate-200/70 text-slate-700"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-micro font-bold truncate flex items-center gap-1">
                                <Bot size={11} className="text-amber-600 shrink-0" />
                                <span className="truncate">{sub.name}</span>
                              </div>
                              <div className="text-micro text-slate-400 truncate pl-4">{sub.role}</div>
                            </div>
                            <span className="flex items-center gap-1 shrink-0">
                              {subHasTrig && (
                                <span title={t("Reactive trigger active", "Reaktívny spúšťač aktívny", "Reaktív indító aktív")} className="text-micro">
                                  ⚡
                                </span>
                              )}
                              {sub.heartbeatEnabled && (
                                <span title={t("Heartbeat active", "Heartbeat aktívny", "Heartbeat aktív")} className="text-micro">
                                  💓
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}

                      {/* Quick Visual Triggers Studio launcher under connection */}
                      <button
                        type="button"
                        data-testid={`comm-agent-triggers-${acc.id}`}
                        onClick={() => {
                          setSelectedMailboxId(acc.id);
                          setVisualTriggersOpen(true);
                        }}
                        className={`w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between gap-1.5 transition-all cursor-pointer border ${
                          isSelected && visualTriggersOpen
                            ? "bg-amber-500 text-white border-amber-600 font-bold shadow-2xs"
                            : "bg-amber-50/60 hover:bg-amber-100/70 border-amber-200/80 text-amber-900 font-semibold"
                        }`}
                      >
                        <span className="text-micro truncate flex items-center gap-1.5">
                          <Zap size={11} className="shrink-0" />
                          <span className="truncate">{t("Visual Triggers", "Vizuálne spúšťače", "Vizuális indítók")}</span>
                        </span>
                        <span className="text-micro px-1.5 py-0.2 rounded-full bg-black/10 font-bold">
                          {connTriggers.length}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* RIGHT WORKSPACE: Dynamic Layout Depending on Selected Communication Channel */}
      {isMessagingConnector(selectedChannelType) ? (
        /* WHATSAPP & BOTMAN MESSAGING LAYOUT */
        <div
          data-testid="communication-whatsapp-layout"
          className="flex-1 min-w-0 grid grid-cols-1 ws-lg:grid-cols-12 gap-4 h-full max-h-full overflow-hidden"
        >
          {(() => {
            // Merge live WAAI WhatsApp / BotMan chats with CRM leads (phone fallback only for WhatsApp / Twilio SMS)
            const liveChats: WhatsAppChatSummary[] = Array.isArray(waState?.chats) ? waState!.chats : [];
            const seenPhones = new Set(
              liveChats
                .map((c) => (c.phone || "").replace(/\D/g, ""))
                .filter(Boolean),
            );
            const crmFallbackChats: WhatsAppChatSummary[] =
              selectedChannelType === "whatsapp" || selectedChannelType === "twilio"
                ? leads
                    .filter((l) => {
                      const digits = (l.phone || "").replace(/\D/g, "");
                      return !digits || !seenPhones.has(digits);
                    })
                    .map((l) => {
                      const digits = (l.phone || "").replace(/\D/g, "");
                      return {
                        id: digits ? `${digits}@s.whatsapp.net` : `lead-${l.id}`,
                        name: l.name || l.phone || "Contact",
                        phone: l.phone || "",
                        isGroup: false,
                        unreadCount: 0,
                        lastMessageText: "",
                        lastMessageTs: 0,
                      };
                    })
                : [];

            const allWaChats = [...liveChats, ...crmFallbackChats];
            const filteredWaChats = allWaChats.filter((ch) => {
              if (waFilterType === "groups" && !ch.isGroup) return false;
              if (waFilterType === "contacts" && ch.isGroup) return false;
              const q = waSearchQuery.trim().toLowerCase();
              if (!q) return true;
              return (
                (ch.name || "").toLowerCase().includes(q) ||
                (ch.phone || "").toLowerCase().includes(q) ||
                (ch.lastMessageText || "").toLowerCase().includes(q)
              );
            });

            const activeChat =
              filteredWaChats.find((c) => c.id === waSelectedLeadId) ??
              allWaChats.find((c) => c.id === waSelectedLeadId) ??
              filteredWaChats[0] ??
              null;

            const activeDigits = (activeChat?.phone || "").replace(/\D/g, "");
            const matchedLead = activeChat
              ? (leads.find((l) => {
                  const lDigits = (l.phone || "").replace(/\D/g, "");
                  if (activeDigits && lDigits && activeDigits === lDigits) return true;
                  return (l.name || "").toLowerCase() === (activeChat.name || "").toLowerCase();
                }) ?? null)
              : null;

            const liveMessages = activeChat ? (waState?.messages?.[activeChat.id] ?? []) : [];
            const crmWaEvents = matchedLead
              ? (matchedLead.timeline ?? []).filter(
                  (ev: any) =>
                    (ev.title || "").toLowerCase().includes("whatsapp") ||
                    (ev.content || "").toLowerCase().includes("whatsapp"),
                )
              : [];

            const aiAccounts = availableAccounts.filter((a) => isAgentConnector(a.connectorType));
            const getChatTakeoverInfo = (chat: WhatsAppChatSummary | null) => {
              if (!chat || !selectedAccount) {
                return {
                  isAgentActive: false,
                  isAutoTakenOver: false,
                  isPausedForSession: false,
                  agentName: "AI Agent",
                  agentConnectorId: aiAccounts[0]?.id || "",
                  subagentId: null as string | null,
                };
              }
              const sessionOverride = waState?.agentTakeover?.[chat.id];
              let matchedTrig: AgentEventTrigger | null = null;
              let matchedAgentAcc = aiAccounts[0] ?? null;

              for (const agAcc of aiAccounts) {
                const trigs = agentStates[agAcc.id]?.triggers ?? agAcc.triggers ?? [];
                for (const tr of trigs) {
                  if (!tr.enabled || tr.sourceType !== "whatsapp") continue;
                  if (tr.sourceConnectorId && tr.sourceConnectorId !== selectedAccount.id) continue;
                  const f = tr.filter ?? {};
                  if (f.onlyGroup && !chat.isGroup) continue;
                  if (f.onlyDirect && chat.isGroup) continue;
                  const cm = (f.chatMatch || "").trim().toLowerCase();
                  if (cm && cm !== "*") {
                    const cIdLower = (chat.id || "").toLowerCase();
                    const cNameLower = (chat.name || "").toLowerCase();
                    if (cIdLower !== cm && !cNameLower.includes(cm)) continue;
                  }
                  matchedTrig = tr;
                  matchedAgentAcc = agAcc;
                  break;
                }
                if (matchedTrig) break;
              }

              const isAutoTakenOver = Boolean(matchedTrig && matchedTrig.autoReply !== false);
              const isPausedForSession = sessionOverride?.mode === "paused";
              const isAgentActive =
                sessionOverride?.mode === "active" || (isAutoTakenOver && !isPausedForSession);

              const targetSubId = sessionOverride?.subagentId ?? matchedTrig?.targetSubagentId ?? null;
              const targetSub =
                targetSubId && matchedAgentAcc
                  ? (agentStates[matchedAgentAcc.id]?.subagents ?? matchedAgentAcc.subagents ?? []).find(
                      (s) => s.id === targetSubId,
                    )
                  : null;
              const agentName = targetSub
                ? targetSub.name
                : matchedAgentAcc?.name || t("AI Agent", "AI Agent", "AI Ügynök");

              return {
                isAgentActive,
                isAutoTakenOver,
                isPausedForSession,
                agentName,
                agentConnectorId: sessionOverride?.agentConnectorId || matchedAgentAcc?.id || "",
                subagentId: targetSubId,
              };
            };

            const activeChatTakeover = getChatTakeoverInfo(activeChat);

            return (
              <>
                {/* WhatsApp Chats, Groups & Contacts Column */}
                <div className="ws-lg:col-span-4 glass-panel rounded-3xl border border-emerald-500/30 bg-white/95 shadow-glass flex flex-col h-full overflow-hidden text-left">
                  <div className="p-4 border-b border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 to-transparent space-y-3 shrink-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
                          <ProviderLogo type={selectedChannelType} className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-ui font-bold text-slate-900 truncate">{selectedAccount?.name}</div>
                          <div className="text-micro font-mono truncate flex items-center gap-1.5">
                            {waState?.status === "connected" ? (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                <span className="text-emerald-700 truncate">
                                  {t("Live", "Naživo", "Élő")} · {waState?.phone || selectedAccount?.address}
                                  {waState?.historySyncChunks ? ` · ${waState.historySyncChunks} sync` : ""}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                                <span className="text-amber-700 truncate">
                                  {t(
                                    "Scan QR for live messages",
                                    "Naskenujte QR pre živé správy",
                                    "Olvassa be a QR-t az élő üzenetekhez",
                                  )}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleResyncWhatsApp(activeChat?.id)}
                          disabled={waLoading}
                          title={t("Sync WhatsApp chats & groups", "Synchronizovať WhatsApp konverzácie", "WhatsApp beszélgetések szinkronizálása")}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 text-micro font-bold cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw size={11} className={waLoading ? "animate-spin" : ""} />
                          {t("Sync", "Sync", "Szinkron")}
                        </button>
                        {selectedChannelType === "whatsapp" && (
                          <button
                            type="button"
                            onClick={() => void handleStartInlineWaQr()}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-micro font-bold cursor-pointer"
                          >
                            <QrCode size={12} /> QR
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline QR Pairing Banner when requested or when session requires re-link */}
                    {(waInlineQrOpen || waState?.status === "pending_qr") && (
                      <div className="p-3 rounded-2xl bg-amber-50/60 border border-emerald-300 shadow-xs space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-micro font-bold text-emerald-900">
                            {t(
                              "Scan with WhatsApp → Linked Devices to sync today's live messages",
                              "Naskenujte cez WhatsApp → Prepojené zariadenia pre synchronizáciu dnešných správ",
                              "Olvassa be (WhatsApp → Kapcsolt eszközök) a mai élő üzenetek szinkronizálásához",
                            )}
                          </span>
                          {waInlineQrOpen && waState?.status === "connected" && (
                            <button
                              type="button"
                              onClick={() => setWaInlineQrOpen(false)}
                              className="text-slate-400 hover:text-slate-600 text-micro font-bold cursor-pointer"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <div className="flex items-center justify-center py-1">
                          {waInlineQrUrl || waState?.qr ? (
                            <img
                              src={waInlineQrUrl || waState?.qr || ""}
                              alt="WhatsApp QR"
                              className="w-44 h-44 rounded-xl bg-white p-1.5 border border-emerald-200 object-contain shadow-2xs"
                            />
                          ) : (
                            <div className="w-44 h-44 rounded-xl bg-white border border-emerald-100 flex items-center justify-center text-micro text-slate-400">
                              <RefreshCw size={18} className="animate-spin text-emerald-600 mr-1.5" />
                              {t("Generating QR…", "Generujem QR…", "QR generálása…")}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={waSearchQuery}
                        onChange={(e) => setWaSearchQuery(e.target.value)}
                        placeholder={t("Search WhatsApp chats & groups...", "Hľadať WhatsApp chaty a skupiny...", "WhatsApp beszélgetések és csoportok keresése...")}
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-caption text-slate-700 focus:outline-none focus:border-emerald-400"
                      />
                    </div>

                    {/* Filter Pills: All / Groups / Contacts */}
                    <div className="flex items-center justify-between gap-1 pt-0.5">
                      <div className="flex items-center gap-1">
                        {(
                          [
                            { id: "all", label: t("All", "Všetko", "Összes"), count: allWaChats.length },
                            {
                              id: "groups",
                              label: t("Groups", "Skupiny", "Csoportok"),
                              count: allWaChats.filter((c) => c.isGroup).length,
                            },
                            {
                              id: "contacts",
                              label: t("Contacts", "Kontakty", "Kapcsolatok"),
                              count: allWaChats.filter((c) => !c.isGroup).length,
                            },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setWaFilterType(tab.id)}
                            className={`px-2.5 py-1 rounded-lg text-micro font-bold transition-colors cursor-pointer ${
                              waFilterType === tab.id
                                ? "bg-emerald-600 text-white"
                                : "bg-white/80 text-slate-600 hover:bg-emerald-50 border border-slate-200/80"
                            }`}
                          >
                            {tab.label} ({tab.count})
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                    {filteredWaChats.length === 0 ? (
                      <div className="p-6 text-center text-caption text-slate-400 space-y-2">
                        <div>
                          {waLoading
                            ? t("Syncing WhatsApp chats…", "Synchronizujem WhatsApp konverzácie…", "WhatsApp beszélgetések szinkronizálása…")
                            : t("No WhatsApp chats match your filter.", "Žiadne WhatsApp konverzácie nezodpovedajú filtru.", "Nincs a szűrőnek megfelelő WhatsApp beszélgetés.")}
                        </div>
                      </div>
                    ) : (
                      filteredWaChats.map((chat) => {
                        const active = activeChat?.id === chat.id;
                        const chatTk = getChatTakeoverInfo(chat);
                        return (
                          <button
                            key={chat.id}
                            type="button"
                            onClick={() => setWaSelectedLeadId(chat.id)}
                            className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors cursor-pointer ${
                              active ? "bg-emerald-50/80" : "hover:bg-slate-50"
                            }`}
                          >
                            <span
                              className={`h-9 w-9 rounded-xl text-caption font-bold flex items-center justify-center shrink-0 ${
                                chat.isGroup
                                  ? "bg-teal-500/15 text-teal-700"
                                  : "bg-emerald-500/15 text-emerald-700"
                              }`}
                            >
                              {chat.isGroup ? <Users size={15} /> : initialsOf(chat.name)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-ui font-bold text-slate-900 truncate flex items-center gap-1.5">
                                  <span className="truncate">{chat.name}</span>
                                  {chatTk.isAgentActive && (
                                    <span
                                      title={t(
                                        `Handled by ${chatTk.agentName}`,
                                        `Obsluhuje ${chatTk.agentName}`,
                                        `Kezeli: ${chatTk.agentName}`,
                                      )}
                                      className="px-1.5 py-0.2 rounded-md bg-violet-100 text-violet-800 border border-violet-200 text-micro font-bold shrink-0"
                                    >
                                      🤖 AI
                                    </span>
                                  )}
                                  {!chatTk.isAgentActive && chatTk.isPausedForSession && (
                                    <span
                                      title={t(
                                        "Agent turned off for this session",
                                        "Agent vypnutý pre túto reláciu",
                                        "Ügynök kikapcsolva erre a munkamenetre",
                                      )}
                                      className="px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-500 border border-slate-200 text-micro font-semibold shrink-0"
                                    >
                                      ⏸ Off
                                    </span>
                                  )}
                                </span>
                                {chat.lastMessageAt && (
                                  <span className="text-micro text-slate-400 shrink-0">
                                    {formatListDate(chat.lastMessageAt)}
                                  </span>
                                )}
                              </div>
                              <div className="text-micro text-slate-500 truncate mt-0.5">
                                {chat.lastMessageText ? (
                                  chat.lastMessageText
                                ) : chat.isGroup ? (
                                  t("WhatsApp Group", "WhatsApp skupina", "WhatsApp csoport")
                                ) : (
                                  <span className="font-mono">
                                    {chat.phone || t("WhatsApp Contact", "WhatsApp kontakt", "WhatsApp kapcsolat")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* WhatsApp Conversation & Composer Column */}
                <div className="ws-lg:col-span-8 glass-panel rounded-3xl border border-emerald-500/30 bg-white/95 shadow-glass flex flex-col h-full overflow-hidden text-left">
                  {!activeChat ? (
                    emptyPane(
                      t(
                        "Select a WhatsApp chat or group",
                        "Vyberte WhatsApp konverzáciu alebo skupinu",
                        "Válasszon egy WhatsApp beszélgetést vagy csoportot",
                      ),
                    )
                  ) : (
                    <>
                      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-title font-heading font-bold text-slate-900 truncate">
                              {activeChat.name}
                            </h3>
                            {activeChat.isGroup && (
                              <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200 text-micro font-bold uppercase shrink-0">
                                {t("Group", "Skupina", "Csoport")}
                              </span>
                            )}
                          </div>
                          <div className="text-caption text-emerald-700 font-mono truncate">
                            {activeChat.participantsPreview ||
                              activeChat.phone ||
                              (activeChat.isGroup
                                ? t("WhatsApp Group Chat", "Skupinová konverzácia WhatsApp", "WhatsApp csoportos csevegés")
                                : activeChat.id)}{" "}
                            · {selectedAccount?.name}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          <button
                            type="button"
                            data-testid="wa-agent-takeover-btn"
                            disabled={waTakeoverBusyChatId === activeChat.id}
                            onClick={() =>
                              void handleToggleWaChatAgentTakeover(
                                activeChat,
                                activeChatTakeover.isAgentActive ? "paused" : "active",
                                activeChatTakeover.agentConnectorId,
                                activeChatTakeover.subagentId,
                              )
                            }
                            title={
                              activeChatTakeover.isAgentActive
                                ? t(
                                    `${activeChatTakeover.agentName} is currently handling this conversation (${activeChatTakeover.isAutoTakenOver ? "auto-taken over" : "session takeover"}). Click to turn off the agent for this session.`,
                                    `${activeChatTakeover.agentName} momentálne obsluhuje túto konverzáciu. Kliknutím vypnete agenta pre túto reláciu.`,
                                    `Jelenleg ${activeChatTakeover.agentName} kezeli ezt a beszélgetést. Kattintson az ügynök kikapcsolásához erre a munkamenetre.`,
                                  )
                                : t(
                                    `Let ${activeChatTakeover.agentName} take over and automatically reply in this conversation.`,
                                    `Nechajte ${activeChatTakeover.agentName} prevziať túto konverzáciu a automaticky odpovedať.`,
                                    `Vegye át a beszélgetést ${activeChatTakeover.agentName}, és válaszoljon automatikusan.`,
                                  )
                            }
                            className={`px-3 py-1.5 rounded-xl text-caption font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 ${
                              activeChatTakeover.isAgentActive
                                ? "bg-violet-600 hover:bg-rose-600 text-white shadow-xs border border-violet-700"
                                : activeChatTakeover.isPausedForSession
                                  ? "bg-amber-50 hover:bg-violet-50 text-amber-900 hover:text-violet-800 border border-amber-300"
                                  : "bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200"
                            }`}
                          >
                            {waTakeoverBusyChatId === activeChat.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Bot size={14} />
                            )}
                            {activeChatTakeover.isAgentActive ? (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                                {t(
                                  "Agent Active · Turn Off",
                                  "Agent aktívny · Vypnúť",
                                  "Ügynök aktív · Kikapcsolás",
                                )}
                              </>
                            ) : activeChatTakeover.isPausedForSession ? (
                              t(
                                "Agent Off (Session) · Take Over",
                                "Agent vypnutý · Prevziať",
                                "Ügynök kikapcsolva · Átvétel",
                              )
                            ) : (
                              t(
                                "Agent Takeover",
                                "Prevziať agentom",
                                "Ügynök átveszi",
                              )
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleResyncWhatsApp(activeChat.id)}
                            disabled={waLoading}
                            className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-caption font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw size={13} className={waLoading ? "animate-spin" : ""} />
                            {t("Sync latest", "Synchronizovať najnovšie", "Legfrissebbek szinkronizálása")}
                          </button>
                          {matchedLead &&
                            renderCrmActions(matchedLead, {
                              name: matchedLead.name,
                              address: matchedLead.email || "",
                            })}
                        </div>
                      </div>

                      <div
                        ref={waMessagesScrollRef}
                        className="flex-1 overflow-y-auto p-6 space-y-3 bg-emerald-500/[0.02]"
                      >
                        {liveMessages.length === 0 && crmWaEvents.length === 0 ? (
                          <div className="text-center py-12 text-slate-400 text-body">
                            {t(
                              "No messages in this WhatsApp conversation yet. Write a message below.",
                              "V tejto WhatsApp konverzácii zatiaľ nie sú žiadne správy. Napíšte správu nižšie.",
                              "Ebben a WhatsApp beszélgetésben még nincs üzenet. Írjon üzenetet alább.",
                            )}
                          </div>
                        ) : (
                          <>
                            {liveMessages.map((msg) => {
                              const imgSrc = msg.mediaUrl || msg.mediaPreviewUrl || "";
                              const showCaption =
                                msg.text &&
                                !(imgSrc && (msg.text === "📷 Photo" || msg.text === "🏷️ Sticker"));
                              return (
                                <div
                                  key={msg.id}
                                  className={`max-w-xl p-3.5 rounded-2xl shadow-xs space-y-1.5 ${
                                    msg.fromMe
                                      ? "ml-auto bg-emerald-600 text-white"
                                      : "mr-auto bg-white border border-slate-200 text-slate-800"
                                  }`}
                                >
                                  <div
                                    className={`text-micro flex items-center justify-between gap-3 ${
                                      msg.fromMe ? "text-emerald-100" : "text-slate-400"
                                    }`}
                                  >
                                    <span
                                      className={`font-bold ${
                                        msg.fromMe ? "text-white" : "text-rose-600"
                                      }`}
                                    >
                                      {msg.fromMe ? currentUser?.name || "Me" : msg.senderName || activeChat.name}
                                    </span>
                                    <span>{msg.timestamp}</span>
                                  </div>
                                  {imgSrc && (
                                    <a
                                      href={msg.mediaUrl || imgSrc}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block overflow-hidden rounded-xl border border-black/10"
                                    >
                                      <img
                                        src={imgSrc}
                                        alt={msg.text || "WhatsApp media"}
                                        className="max-h-72 w-full object-cover rounded-xl"
                                      />
                                    </a>
                                  )}
                                  {showCaption && (
                                    <div className="text-body whitespace-pre-wrap break-words">{msg.text}</div>
                                  )}
                                </div>
                              );
                            })}
                            {liveMessages.length === 0 &&
                              crmWaEvents.map((ev: any) => (
                                <div
                                  key={ev.id}
                                  className="max-w-xl ml-auto p-3.5 rounded-2xl bg-emerald-600 text-white shadow-xs space-y-1"
                                >
                                  <div className="text-micro opacity-80 flex items-center justify-between gap-2">
                                    <span>{ev.author || currentUser?.name}</span>
                                    <span>{ev.timestamp}</span>
                                  </div>
                                  <div className="text-body whitespace-pre-wrap">{ev.content}</div>
                                </div>
                              ))}
                          </>
                        )}
                      </div>

                      <div className="p-4 border-t border-slate-100 flex items-center gap-2 shrink-0">
                        <input
                          type="text"
                          value={waDraftMessage}
                          onChange={(e) => setWaDraftMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              void handleSendWhatsAppMessage(activeChat, matchedLead);
                            }
                          }}
                          placeholder={t(
                            "Write a WhatsApp message...",
                            "Napíšte WhatsApp správu...",
                            "Írjon WhatsApp üzenetet...",
                          )}
                          className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-body text-slate-800 focus:outline-none focus:bg-white focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSendWhatsAppMessage(activeChat, matchedLead)}
                          disabled={!waDraftMessage.trim() || !canEdit || waSending}
                          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-body font-bold flex items-center gap-2 disabled:opacity-40 cursor-pointer"
                        >
                          <Send size={15} /> {t("Send", "Odoslať", "Küldés")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      ) : isAgentConnector(selectedChannelType) ? (
        /* SUBSCRIPTION AI AGENT: CENTER (100% CHAT OR 50/50 SPLIT WITH ARTIFACT EDITOR) + RIGHT SIDEBAR (MEMORY & ARTIFACTS) */
        <div
          data-testid="communication-agent-layout"
          className="flex-1 min-w-0 flex flex-col ws-lg:flex-row gap-4 h-full max-h-full overflow-hidden text-left"
        >
          {(() => {
            const meta = PROVIDERS[selectedChannelType] ?? PROVIDERS.claude;
            const accId = selectedAccount?.id || "";
            const chatKey = activeChatSubagentId ? `${accId}:${activeChatSubagentId}` : accId;
            const history = agentChats[chatKey] ?? [];
            const st = agentStates[accId];
            const artifactsList = st?.artifacts ?? [];
            const subagents = st?.subagents ?? selectedAccount?.subagents ?? [];
            const triggersList = st?.triggers ?? selectedAccount?.triggers ?? [];
            const autonomousTasks = st?.tasks ?? [];
            const activeSubagentObj = subagents.find((s) => s.id === activeChatSubagentId) ?? null;
            const siblingWaAccount =
              availableAccounts.find((a) => isMessagingConnector(a.connectorType)) ?? null;

            const isArtSelected = Boolean(selectedArtifactKey);
            const selectedSubObj =
              selectedArtifactKey?.startsWith("subagent:")
                ? subagents.find((s) => `subagent:${s.id}` === selectedArtifactKey) ?? null
                : null;
            const selectedTaskObj =
              selectedArtifactKey?.startsWith("task:")
                ? autonomousTasks.find((tk) => `task:${tk.id}` === selectedArtifactKey) ?? null
                : null;
            const selectedNamedArt =
              selectedArtifactKey?.startsWith("artifact:")
                ? artifactsList.find((a) => `artifact:${a.id}` === selectedArtifactKey) ?? null
                : null;

            const activeHeartbeatEnabled = activeSubagentObj
              ? Boolean(activeSubagentObj.heartbeatEnabled)
              : Boolean(st?.autonomousMode?.enabled);
            const activeHeartbeatInterval = activeSubagentObj
              ? (activeSubagentObj.heartbeatIntervalMinutes ?? 15)
              : (st?.autonomousMode?.intervalMinutes ?? 15);
            const activeTriggersForCurrentAgent = triggersList.filter((tr) =>
              activeSubagentObj
                ? tr.targetSubagentId === activeSubagentObj.id
                : !tr.targetSubagentId || tr.targetSubagentId === "main",
            );

            return (
              <>
                {/* CENTER AREA: VISUAL TRIGGER STUDIO OR (100% CHAT / 50-50 SPLIT WITH ARTIFACT EDITOR) */}
                <div
                  data-testid="agent-center-split-container"
                  className={`flex-1 min-w-0 grid grid-cols-1 ${
                    !visualTriggersOpen && isArtSelected ? "ws-lg:grid-cols-2" : "ws-lg:grid-cols-1"
                  } gap-4 h-full max-h-full overflow-hidden`}
                >
                  {visualTriggersOpen ? (
                    /* VISUAL TRIGGER STUDIO (REACTIVE EVENT-DRIVEN WIRING CANVAS) */
                    <div
                      data-testid="visual-trigger-studio"
                      className="glass-panel rounded-3xl border border-amber-300/80 bg-white/95 shadow-glass flex flex-col h-full max-h-full overflow-hidden"
                    >
                      {/* Studio Header */}
                      <div className="px-5 py-3.5 border-b border-amber-200/70 bg-gradient-to-r from-amber-500/10 via-indigo-500/5 to-emerald-500/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-9 h-9 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                            <Zap size={18} />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-900 border border-amber-300/70 text-micro font-bold uppercase">
                                {t("Visual Trigger Studio", "Štúdio vizuálnych spúšťačov", "Vizuális Indító Stúdió")}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-800 border border-emerald-300/60 text-micro font-bold">
                                💰 {t("$0 Idle Cost (Event-Driven)", "$0 v nečinnosti (Riadené udalosťami)", "$0 üresjárati költség (Eseményvezérelt)")}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-800 border border-indigo-300/60 text-micro font-bold">
                                📚 {t("Context: Last 50 msgs ∪ 5 days (16k cap)", "Kontext: Posledných 50 správ ∪ 5 dní (16k limit)", "Kontextus: Utolsó 50 üzenet ∪ 5 nap (16k limit)")}
                              </span>
                            </div>
                            <h3 className="text-title-sm font-heading font-bold text-slate-900 truncate mt-0.5">
                              {t(
                                "Connect WhatsApp, Email & CRM Events to your AI Agents",
                                "Prepojte WhatsApp, E-mail a CRM udalosti s vašimi AI agentmi",
                                "Kösse össze a WhatsApp, E-mail és CRM eseményeket AI ügynökeivel",
                              )}
                            </h3>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setNewSubagentOpen(true)}
                            className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-micro font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Bot size={13} /> + {t("Create Agent", "Vytvoriť agenta", "Ügynök létrehozása")}
                          </button>
                          <button
                            type="button"
                            data-testid="new-visual-trigger-btn"
                            onClick={() => openNewTriggerModal()}
                            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-micro font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            <Plus size={13} /> {t("New Trigger Wire", "Nové prepojenie", "Új indító kapcsolat")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setVisualTriggersOpen(false);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-micro font-bold cursor-pointer"
                          >
                            ← {t("Back to Chat", "Späť na chat", "Vissza a csevegéshez")}
                          </button>
                        </div>
                      </div>

                      {/* Connections Canvas: Source on Left ➔ Squiggly Line in Middle ➔ Which Agent Runs on Right (with Events Ran on Top) */}
                      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
                        {(() => {
                          const allSourceAccounts = availableAccounts.filter(
                            (a) => isMessagingConnector(a.connectorType) || isEmailConnector(a.connectorType),
                          );
                          const wiredConnectorIds = new Set(
                            triggersList.map((tr) => tr.sourceConnectorId).filter(Boolean),
                          );
                          const hasGenericWaWire = triggersList.some(
                            (tr) => tr.sourceType === "whatsapp" && !tr.sourceConnectorId,
                          );
                          const hasGenericEmailWire = triggersList.some(
                            (tr) => tr.sourceType === "email" && !tr.sourceConnectorId,
                          );
                          const hasCrmEventWire = triggersList.some((tr) => tr.sourceType === "crm_event");

                          const unwiredAccounts = allSourceAccounts.filter((acc) => {
                            if (wiredConnectorIds.has(acc.id)) return false;
                            if (isMessagingConnector(acc.connectorType) && hasGenericWaWire && allSourceAccounts.filter((x) => isMessagingConnector(x.connectorType)).length === 1) {
                              return false;
                            }
                            if (isEmailConnector(acc.connectorType) && hasGenericEmailWire && allSourceAccounts.filter((x) => isEmailConnector(x.connectorType)).length === 1) {
                              return false;
                            }
                            return true;
                          });

                          const defaultTargetSub = subagents.find((s) => s.id === activeChatSubagentId);

                          return (
                            <>
                              {triggersList.map((trig) => {
                                const targetSub = subagents.find((s) => s.id === trig.targetSubagentId);
                                const sourceAcc =
                                  availableAccounts.find((a) => a.id === trig.sourceConnectorId) ||
                                  (trig.sourceType === "whatsapp"
                                    ? availableAccounts.find((a) => isMessagingConnector(a.connectorType))
                                    : trig.sourceType === "email"
                                      ? availableAccounts.find((a) => isEmailConnector(a.connectorType))
                                      : undefined);
                                const eventsRanCount = trig.triggerCount ?? 0;
                                const channelBadge =
                                  trig.sourceType === "whatsapp"
                                    ? (sourceAcc?.connectorType || "WHATSAPP").toUpperCase()
                                    : trig.sourceType === "email"
                                      ? (sourceAcc?.connectorType || "SMTP").toUpperCase()
                                      : "CRM EVENT";
                                const filterSummary =
                                  trig.sourceType === "whatsapp"
                                    ? trig.filter?.chatMatch
                                      ? `Chat: ${trig.filter.chatMatch}`
                                      : trig.filter?.onlyGroup
                                        ? t("All Groups", "Všetky skupiny", "Minden csoport")
                                        : trig.filter?.onlyDirect
                                          ? t("Direct Chats", "Priame chaty", "Közvetlen csevegések")
                                          : t("All Messages", "Všetky správy", "Minden üzenet")
                                    : trig.sourceType === "email"
                                      ? trig.filter?.subjectContains ||
                                        trig.filter?.fromContains ||
                                        t("All New Emails", "Všetky nové e-maily", "Minden új e-mail")
                                      : trig.filter?.eventType || "lead_created";

                                return (
                                  <div
                                    key={trig.id}
                                    data-testid={`trigger-wire-card-${trig.id}`}
                                    className={`p-4 rounded-3xl border transition-all grid grid-cols-1 ws-lg:grid-cols-12 gap-4 items-center ${
                                      trig.enabled
                                        ? "bg-white border-amber-300/80 shadow-xs"
                                        : "bg-slate-50/80 border-slate-200 opacity-75"
                                    }`}
                                  >
                                    {/* LEFT (4 cols): SOURCE CONNECTION */}
                                    <div
                                      onClick={() => openEditTriggerModal(trig)}
                                      className={`ws-lg:col-span-4 p-3.5 rounded-2xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                                        trig.sourceType === "whatsapp"
                                          ? "bg-emerald-50/40 hover:bg-emerald-50/80 border-emerald-200/90"
                                          : trig.sourceType === "email"
                                            ? "bg-pink-50/40 hover:bg-pink-50/80 border-pink-200/90"
                                            : "bg-indigo-50/40 hover:bg-indigo-50/80 border-indigo-200/90"
                                      }`}
                                    >
                                      <span
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                          trig.sourceType === "whatsapp"
                                            ? "bg-emerald-500/15 text-emerald-700"
                                            : trig.sourceType === "email"
                                              ? "bg-pink-500/15 text-pink-700"
                                              : "bg-indigo-500/15 text-indigo-700"
                                        }`}
                                      >
                                        {trig.sourceType === "whatsapp" ? (
                                          <MessageCircle size={19} />
                                        ) : trig.sourceType === "email" ? (
                                          <Mail size={19} />
                                        ) : (
                                          <Activity size={19} />
                                        )}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span
                                            className={`px-1.5 py-0.5 rounded text-micro font-bold uppercase ${
                                              trig.sourceType === "whatsapp"
                                                ? "bg-emerald-100 text-emerald-800"
                                                : trig.sourceType === "email"
                                                  ? "bg-pink-100 text-pink-800"
                                                  : "bg-indigo-100 text-indigo-800"
                                            }`}
                                          >
                                            {channelBadge}
                                          </span>
                                          <span className="px-2 py-0.5 rounded-md bg-white/90 border border-slate-200 text-slate-700 text-micro font-mono truncate">
                                            {filterSummary}
                                          </span>
                                        </div>
                                        <div className="text-caption font-bold text-slate-900 truncate mt-1">
                                          {sourceAcc?.name ||
                                            (trig.sourceType === "whatsapp"
                                              ? "WhatsApp / Messaging"
                                              : trig.sourceType === "email"
                                                ? "Email Inbox"
                                                : t("Leads, Projects & Tickets", "Príležitosti, Projekty a Tikety", "Érdeklődők, Projektek és Jegyek"))}
                                        </div>
                                        {sourceAcc?.address && (
                                          <div className="text-micro text-slate-500 font-mono truncate">{sourceAcc.address}</div>
                                        )}
                                      </div>
                                    </div>

                                    {/* MIDDLE (4 cols): SQUIGGLY LINE & WIRE CONTROLS */}
                                    <div className="ws-lg:col-span-4 flex flex-col items-center justify-center gap-2 px-2">
                                      <div className="flex items-center flex-wrap justify-center gap-1.5 text-micro font-bold text-slate-700">
                                        <span>{trig.name}</span>
                                        {trig.autoReply && (
                                          <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-micro font-bold">
                                            ↩ Auto-Reply
                                          </span>
                                        )}
                                        {trig.proactiveEnabled && (
                                          <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-micro font-bold">
                                            🔄 Proactive ({trig.proactiveAfterMinutes ?? 120}m)
                                          </span>
                                        )}
                                      </div>

                                      {/* Prominent Squiggly Bezier Wire */}
                                      <svg width="100%" height="34" viewBox="0 0 240 34" className="w-full max-w-60 overflow-visible">
                                        <circle cx="6" cy="17" r="4" fill={trig.enabled ? "#10b981" : "#94a3b8"} />
                                        <path
                                          d="M 10 17 C 48 2, 76 32, 120 17 C 164 2, 192 32, 230 17"
                                          fill="none"
                                          stroke={trig.enabled ? "#f59e0b" : "#94a3b8"}
                                          strokeWidth="2.5"
                                          strokeDasharray={trig.enabled ? "6 4" : undefined}
                                        />
                                        <circle cx="234" cy="17" r="4.5" fill={trig.enabled ? "#f59e0b" : "#94a3b8"} />
                                      </svg>

                                      {trig.instructions && (
                                        <div className="text-micro text-slate-500 line-clamp-1 max-w-full px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100">
                                          {trig.instructions}
                                        </div>
                                      )}

                                      {/* Compact Wire Controls */}
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => void handleTestTrigger(trig.id)}
                                          disabled={isTestingTriggerId === trig.id}
                                          title={t("Test trigger now with real 50-msg / 5-day conversation context", "Otestovať spúšťač teraz", "Indító tesztelése most")}
                                          className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-micro font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                                        >
                                          {isTestingTriggerId === trig.id ? (
                                            <Loader2 size={11} className="animate-spin" />
                                          ) : (
                                            <Play size={11} />
                                          )}
                                          {t("Test", "Test", "Teszt")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => openEditTriggerModal(trig)}
                                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-micro font-bold cursor-pointer"
                                        >
                                          {t("Edit", "Upraviť", "Szerk.")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleToggleTriggerEnabled(trig)}
                                          className={`px-2.5 py-1 rounded-lg text-micro font-bold cursor-pointer ${
                                            trig.enabled
                                              ? "bg-emerald-600 text-white"
                                              : "bg-slate-200 text-slate-600"
                                          }`}
                                        >
                                          {trig.enabled ? t("On", "Zap.", "Be") : t("Off", "Vyp.", "Ki")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleDeleteTrigger(trig.id)}
                                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    </div>

                                    {/* RIGHT (4 cols): WHICH AGENT RUNS (WITH NUMBER OF EVENTS RAN ON TOP) */}
                                    <div className="ws-lg:col-span-4 flex flex-col">
                                      {/* Top of the Agent: Number of Events Ran */}
                                      <div className="flex items-center justify-between px-1 mb-1.5">
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-micro font-bold">
                                          ⚡ {eventsRanCount}{" "}
                                          {eventsRanCount === 1
                                            ? t("event ran", "spustená udalosť", "lefutott esemény")
                                            : t("events ran", "spustených udalostí", "lefutott esemény")}
                                        </span>
                                        {trig.lastTriggeredAt && (
                                          <span className="text-micro text-slate-400 font-mono truncate">
                                            {trig.lastStatus || "ok"}
                                          </span>
                                        )}
                                      </div>

                                      <div
                                        onClick={() => {
                                          setActiveChatSubagentId(targetSub ? targetSub.id : "");
                                          setVisualTriggersOpen(false);
                                        }}
                                        className="p-3.5 rounded-2xl border border-indigo-200/90 bg-indigo-50/30 hover:bg-indigo-50/70 transition-all flex items-center justify-between gap-3 cursor-pointer"
                                      >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <span
                                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                              targetSub
                                                ? "bg-amber-500/15 text-amber-700"
                                                : "bg-indigo-500/15 text-indigo-700"
                                            }`}
                                          >
                                            {targetSub ? <Bot size={18} /> : <Sparkles size={18} />}
                                          </span>
                                          <div className="min-w-0">
                                            <div className="text-caption font-bold text-slate-900 truncate">
                                              {targetSub
                                                ? `🤖 ${targetSub.name}`
                                                : `✦ ${selectedAccount?.name} (${t("Main Agent", "Hlavný agent", "Fő ügynök")})`}
                                            </div>
                                            <div className="text-micro text-slate-500 truncate">
                                              {targetSub ? targetSub.role : meta.label}
                                            </div>
                                          </div>
                                        </div>
                                        <span className="px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-slate-700 text-micro font-bold shrink-0">
                                          💬 {t("Chat", "Chat", "Chat")}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}

                              {/* UNWIRED CONNECTIONS: Show every connected Messaging / BotMan / Email / CRM source so the user sees all connections on the left */}
                              {(unwiredAccounts.length > 0 || !hasCrmEventWire) && (
                                <div className="pt-2 space-y-3">
                                  <div className="flex items-center justify-between px-1">
                                    <span className="text-micro font-bold uppercase tracking-wider text-slate-400">
                                      {t(
                                        "Available Source Connections — Click to Wire to Agent",
                                        "Dostupné zdrojové spojenia — Kliknutím prepojte s agentom",
                                        "Elérhető forráskapcsolatok — Kattintson az ügynökhöz kötéshez",
                                      )}
                                    </span>
                                    <span className="text-micro text-slate-400">
                                      {unwiredAccounts.length + (hasCrmEventWire ? 0 : 1)}{" "}
                                      {t("unwired sources", "neprepojené zdroje", "bekötetlen forrás")}
                                    </span>
                                  </div>

                                  {unwiredAccounts.map((acc) => {
                                    const isMsg = isMessagingConnector(acc.connectorType);
                                    const sType: "whatsapp" | "email" = isMsg ? "whatsapp" : "email";
                                    const badgeLabel = (acc.connectorType || (isMsg ? "whatsapp" : "smtp")).toUpperCase();

                                    return (
                                      <div
                                        key={`unwired-${acc.id}`}
                                        data-testid={`unwired-source-card-${acc.id}`}
                                        className="p-4 rounded-3xl border border-dashed border-slate-200/90 bg-slate-50/50 hover:bg-white hover:border-amber-300/80 transition-all grid grid-cols-1 ws-lg:grid-cols-12 gap-4 items-center"
                                      >
                                        {/* LEFT (4 cols): SOURCE CONNECTION */}
                                        <div
                                          onClick={() =>
                                            openNewTriggerModal({
                                              sourceType: sType,
                                              sourceConnectorId: acc.id,
                                            })
                                          }
                                          className={`ws-lg:col-span-4 p-3.5 rounded-2xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                                            isMsg
                                              ? "bg-emerald-50/30 hover:bg-emerald-50/70 border-emerald-200/70"
                                              : "bg-pink-50/30 hover:bg-pink-50/70 border-pink-200/70"
                                          }`}
                                        >
                                          <span
                                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                              isMsg
                                                ? "bg-emerald-500/15 text-emerald-700"
                                                : "bg-pink-500/15 text-pink-700"
                                            }`}
                                          >
                                            {isMsg ? <MessageCircle size={19} /> : <Mail size={19} />}
                                          </span>
                                          <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                              <span
                                                className={`px-1.5 py-0.5 rounded text-micro font-bold uppercase ${
                                                  isMsg
                                                    ? "bg-emerald-100 text-emerald-800"
                                                    : "bg-pink-100 text-pink-800"
                                                }`}
                                              >
                                                {badgeLabel}
                                              </span>
                                              <span className="px-2 py-0.5 rounded-md bg-white/90 border border-slate-200 text-slate-500 text-micro font-mono">
                                                {t("Not wired yet", "Zatiaľ neprepojené", "Még nincs bekötve")}
                                              </span>
                                            </div>
                                            <div className="text-caption font-bold text-slate-900 truncate mt-1">
                                              {acc.name}
                                            </div>
                                            {acc.address && (
                                              <div className="text-micro text-slate-500 font-mono truncate">{acc.address}</div>
                                            )}
                                          </div>
                                        </div>

                                        {/* MIDDLE (4 cols): UNWIRED SQUIGGLY LINE & CONNECT BUTTON */}
                                        <div className="ws-lg:col-span-4 flex flex-col items-center justify-center gap-2 px-2">
                                          <svg width="100%" height="28" viewBox="0 0 240 28" className="w-full max-w-60 overflow-visible opacity-60">
                                            <circle cx="6" cy="14" r="3.5" fill="#94a3b8" />
                                            <path
                                              d="M 10 14 C 48 2, 76 26, 120 14 C 164 2, 192 26, 230 14"
                                              fill="none"
                                              stroke="#cbd5e1"
                                              strokeWidth="2"
                                              strokeDasharray="4 4"
                                            />
                                            <circle cx="234" cy="14" r="3.5" fill="#94a3b8" />
                                          </svg>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              openNewTriggerModal({
                                                sourceType: sType,
                                                sourceConnectorId: acc.id,
                                              })
                                            }
                                            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-micro font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                                          >
                                            <Plus size={12} />
                                            {t("Connect to Agent", "Prepojiť s agentom", "Bekötés ügynökhöz")}
                                          </button>
                                        </div>

                                        {/* RIGHT (4 cols): TARGET AGENT PREVIEW */}
                                        <div className="ws-lg:col-span-4 flex flex-col">
                                          <div className="flex items-center justify-between px-1 mb-1.5">
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-micro font-semibold">
                                              ⚡ 0 {t("events ran", "spustených udalostí", "lefutott esemény")}
                                            </span>
                                          </div>
                                          <div
                                            onClick={() =>
                                              openNewTriggerModal({
                                                sourceType: sType,
                                                sourceConnectorId: acc.id,
                                              })
                                            }
                                            className="p-3.5 rounded-2xl border border-dashed border-indigo-200/80 bg-indigo-50/20 hover:bg-indigo-50/50 transition-all flex items-center justify-between gap-3 cursor-pointer"
                                          >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-indigo-500/10 text-indigo-600">
                                                {defaultTargetSub ? <Bot size={18} /> : <Sparkles size={18} />}
                                              </span>
                                              <div className="min-w-0">
                                                <div className="text-caption font-bold text-slate-800 truncate">
                                                  {defaultTargetSub
                                                    ? `🤖 ${defaultTargetSub.name}`
                                                    : `✦ ${selectedAccount?.name} (${t("Main Agent", "Hlavný agent", "Fő ügynök")})`}
                                                </div>
                                                <div className="text-micro text-slate-500 truncate">
                                                  {defaultTargetSub ? defaultTargetSub.role : meta.label}
                                                </div>
                                              </div>
                                            </div>
                                            <span className="px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-micro font-bold shrink-0">
                                              + {t("Wire", "Prepojiť", "Bekötés")}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {!hasCrmEventWire && (
                                    <div
                                      data-testid="unwired-source-card-crm_event"
                                      className="p-4 rounded-3xl border border-dashed border-slate-200/90 bg-slate-50/50 hover:bg-white hover:border-amber-300/80 transition-all grid grid-cols-1 ws-lg:grid-cols-12 gap-4 items-center"
                                    >
                                      {/* LEFT (4 cols): CRM EVENT SOURCE */}
                                      <div
                                        onClick={() =>
                                          openNewTriggerModal({
                                            sourceType: "crm_event",
                                            sourceConnectorId: "",
                                          })
                                        }
                                        className="ws-lg:col-span-4 p-3.5 rounded-2xl border bg-indigo-50/30 hover:bg-indigo-50/70 border-indigo-200/70 text-left transition-all flex items-start gap-3 cursor-pointer"
                                      >
                                        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-indigo-500/15 text-indigo-700">
                                          <Activity size={19} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="px-1.5 py-0.5 rounded text-micro font-bold uppercase bg-indigo-100 text-indigo-800">
                                              CRM EVENT
                                            </span>
                                            <span className="px-2 py-0.5 rounded-md bg-white/90 border border-slate-200 text-slate-500 text-micro font-mono">
                                              {t("Not wired yet", "Zatiaľ neprepojené", "Még nincs bekötve")}
                                            </span>
                                          </div>
                                          <div className="text-caption font-bold text-slate-900 truncate mt-1">
                                            {t("Leads, Projects & Tickets", "Príležitosti, Projekty a Tikety", "Érdeklődők, Projektek és Jegyek")}
                                          </div>
                                          <div className="text-micro text-slate-500 font-mono truncate">
                                            lead_created · project_created · ticket_created
                                          </div>
                                        </div>
                                      </div>

                                      {/* MIDDLE (4 cols): UNWIRED SQUIGGLY LINE & CONNECT BUTTON */}
                                      <div className="ws-lg:col-span-4 flex flex-col items-center justify-center gap-2 px-2">
                                        <svg width="100%" height="28" viewBox="0 0 240 28" className="w-full max-w-60 overflow-visible opacity-60">
                                          <circle cx="6" cy="14" r="3.5" fill="#94a3b8" />
                                          <path
                                            d="M 10 14 C 48 2, 76 26, 120 14 C 164 2, 192 26, 230 14"
                                            fill="none"
                                            stroke="#cbd5e1"
                                            strokeWidth="2"
                                            strokeDasharray="4 4"
                                          />
                                          <circle cx="234" cy="14" r="3.5" fill="#94a3b8" />
                                        </svg>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openNewTriggerModal({
                                              sourceType: "crm_event",
                                              sourceConnectorId: "",
                                            })
                                          }
                                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-micro font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                                        >
                                          <Plus size={12} />
                                          {t("Connect to Agent", "Prepojiť s agentom", "Bekötés ügynökhöz")}
                                        </button>
                                      </div>

                                      {/* RIGHT (4 cols): TARGET AGENT PREVIEW */}
                                      <div className="ws-lg:col-span-4 flex flex-col">
                                        <div className="flex items-center justify-between px-1 mb-1.5">
                                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-micro font-semibold">
                                            ⚡ 0 {t("events ran", "spustených udalostí", "lefutott esemény")}
                                          </span>
                                        </div>
                                        <div
                                          onClick={() =>
                                            openNewTriggerModal({
                                              sourceType: "crm_event",
                                              sourceConnectorId: "",
                                            })
                                          }
                                          className="p-3.5 rounded-2xl border border-dashed border-indigo-200/80 bg-indigo-50/20 hover:bg-indigo-50/50 transition-all flex items-center justify-between gap-3 cursor-pointer"
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0">
                                            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-indigo-500/10 text-indigo-600">
                                              {defaultTargetSub ? <Bot size={18} /> : <Sparkles size={18} />}
                                            </span>
                                            <div className="min-w-0">
                                              <div className="text-caption font-bold text-slate-800 truncate">
                                                {defaultTargetSub
                                                  ? `🤖 ${defaultTargetSub.name}`
                                                  : `✦ ${selectedAccount?.name} (${t("Main Agent", "Hlavný agent", "Fő ügynök")})`}
                                              </div>
                                              <div className="text-micro text-slate-500 truncate">
                                                {defaultTargetSub ? defaultTargetSub.role : meta.label}
                                              </div>
                                            </div>
                                          </div>
                                          <span className="px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-micro font-bold shrink-0">
                                            + {t("Wire", "Prepojiť", "Bekötés")}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* PENDING PROACTIVE FOLLOW-UPS (Self-scheduled via schedule_conversation_followup) */}
                              {(st?.followups ?? []).filter((f) => f.status === "pending").length > 0 && (
                                <div className="pt-2 space-y-2">
                                  <div className="flex items-center justify-between px-1">
                                    <span className="text-micro font-bold uppercase tracking-wider text-indigo-700">
                                      🔄{" "}
                                      {t(
                                        "Pending Proactive Follow-Ups ($0 Idle until Due)",
                                        "Čakajúce proaktívne follow-upy ($0 v nečinnosti)",
                                        "Ütemezett proaktív utánkövetések ($0 üresjárati költség)",
                                      )}
                                    </span>
                                  </div>
                                  {(st?.followups ?? [])
                                    .filter((f) => f.status === "pending")
                                    .map((fu) => (
                                      <div
                                        key={fu.id}
                                        className="p-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 flex flex-wrap items-center justify-between gap-3"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2 text-caption font-bold text-slate-900">
                                            <span>{fu.targetName || fu.targetChat}</span>
                                            <span className="px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-800 text-micro font-mono">
                                              {t("Due:", "Termín:", "Esedékes:")} {fu.dueAt}
                                            </span>
                                            {fu.cancelIfReplied && (
                                              <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-micro font-semibold">
                                                {t("Auto-cancels on reply", "Zruší sa pri odpovedi", "Válasznál automatikusan törlődik")}
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-micro text-slate-600 truncate mt-0.5">
                                            {fu.instructions}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => void handleCancelFollowup(fu.id)}
                                          className="px-2.5 py-1 rounded-xl bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 text-micro font-bold cursor-pointer"
                                        >
                                          {t("Cancel", "Zrušiť", "Törlés")}
                                        </button>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                  /* LEFT HALF (OR FULL WIDTH): AGENT CHAT CARD */
                  <div
                    data-testid="agent-chat-pane"
                    className="glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col h-full max-h-full overflow-hidden"
                  >
                    {/* 1. AGENT HEADER */}
                    <div className={`px-5 py-3.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0 ${meta.modalHeaderBg}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${meta.iconBg}`}>
                          <ProviderLogo type={selectedChannelType} className="w-4.5 h-4.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded-md text-micro font-bold ${meta.badgeClass}`}>
                              {meta.label}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 text-micro font-bold">
                              <Terminal size={11} /> CCRM MCP
                            </span>
                            {siblingWaAccount && (
                              <button
                                type="button"
                                onClick={() => setSelectedMailboxId(siblingWaAccount.id)}
                                title={t(
                                  `Linked to ${siblingWaAccount.name} (${siblingWaAccount.address}) — agent can read & reply on WhatsApp`,
                                  `Prepojené s ${siblingWaAccount.name} (${siblingWaAccount.address}) — agent môže čítať a odpovedať cez WhatsApp`,
                                  `Összekapcsolva: ${siblingWaAccount.name} (${siblingWaAccount.address}) — az ügynök olvashat és válaszolhat WhatsAppon`,
                                )}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-800 border border-emerald-300/70 text-micro font-bold transition-colors cursor-pointer"
                              >
                                <MessageCircle size={11} /> {siblingWaAccount.name}
                              </button>
                            )}
                            {/* Dual Mode Indicator & Toggle: Reactive Triggers + Heartbeat */}
                            <button
                              type="button"
                              data-testid="toggle-visual-triggers-btn"
                              onClick={() => setVisualTriggersOpen((v) => !v)}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-micro font-bold shadow-2xs transition-colors cursor-pointer"
                            >
                              <Zap size={11} />
                              {t("Visual Triggers", "Vizuálne spúšťače", "Vizuális Indítók")} ({triggersList.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (activeSubagentObj) {
                                  void handleToggleSubagentHeartbeat(activeSubagentObj, {
                                    heartbeatEnabled: !activeSubagentObj.heartbeatEnabled,
                                  });
                                } else {
                                  handleSelectArtifact("cron:main");
                                }
                              }}
                              title={t(
                                "Heartbeat Mode (periodic cron vs $0 idle reactive mode)",
                                "Režim Heartbeat (periodický cron vs $0 nečinný reaktívny režim)",
                                "Heartbeat mód (időszakos cron vs $0 üresjárati reaktív mód)",
                              )}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-micro font-bold border transition-colors cursor-pointer ${
                                activeHeartbeatEnabled
                                  ? "bg-emerald-500/15 text-emerald-800 border-emerald-300"
                                  : "bg-white/80 text-slate-600 border-slate-200 hover:bg-slate-100"
                              }`}
                            >
                              💓 {activeHeartbeatEnabled ? `${activeHeartbeatInterval}m` : t("Heartbeat Off ($0)", "Heartbeat Vyp. ($0)", "Heartbeat Ki ($0)")}
                            </button>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <h3 className="text-title-sm font-heading font-bold text-slate-900 truncate">
                              {activeSubagentObj ? `🤖 ${activeSubagentObj.name}` : selectedAccount?.name}
                            </h3>
                            <select
                              value={activeChatSubagentId}
                              onChange={(e) => setActiveChatSubagentId(e.target.value)}
                              aria-label={t("Active agent or subagent", "Aktívny agent alebo subagent", "Aktív ügynök vagy alügynök")}
                              className="px-2 py-0.5 rounded-lg bg-white/90 border border-slate-200 text-micro font-bold text-slate-700 cursor-pointer"
                            >
                              <option value="">
                                ✦ {t("Main Agent", "Hlavný agent", "Fő ügynök")} ({selectedAccount?.name})
                              </option>
                              {subagents.map((s) => (
                                <option key={s.id} value={s.id}>
                                  🤖 {s.name} ({s.role})
                                </option>
                              ))}
                            </select>
                            {activeTriggersForCurrentAgent.length > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-micro font-bold">
                                ⚡ {activeTriggersForCurrentAgent.length} {t("trigger(s)", "spúšťač(e)", "indító")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Quick Autonomous & CRM MCP Action Chips */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[
                          ...(siblingWaAccount
                            ? [
                                t(
                                  "Summarize latest WhatsApp chats",
                                  "Zhrnúť posledné WhatsApp správy",
                                  "Legutóbbi WhatsApp üzenetek összegzése",
                                ),
                              ]
                            : []),
                          t("Summarize open leads", "Zhrnúť otvorené príležitosti", "Nyitott érdeklődők összegzése"),
                          t("List overdue tasks", "Vypísať omeškané úlohy", "Lejárt feladatok listázása"),
                        ].map((quickPrompt) => (
                          <button
                            key={quickPrompt}
                            type="button"
                            onClick={() => void handleSendAgentMessage(quickPrompt)}
                            disabled={isAgentRunning}
                            className="px-2.5 py-1 rounded-xl bg-white/90 hover:bg-white border border-slate-200 text-micro font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-40"
                          >
                            <Sparkles size={11} className="inline mr-1 text-amber-500" />
                            {quickPrompt}
                          </button>
                        ))}
                        {history.length > 0 && (
                          <button
                            type="button"
                            onClick={() => void handleClearAgentChat()}
                            disabled={isAgentRunning}
                            title={t("Clear chat history", "Vymazať históriu chatu", "Csevegési előzmények törlése")}
                            className="px-2 py-1 rounded-xl bg-white/80 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-micro font-semibold text-slate-600 hover:text-rose-700 transition-colors cursor-pointer"
                          >
                            <Trash2 size={11} className="inline mr-1" />
                            {t("Clear", "Vymazať", "Törlés")}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 2. CHAT MESSAGES AREA */}
                    <div
                      ref={agentChatScrollRef}
                      className="flex-1 min-h-40 overflow-y-auto px-5 py-4 space-y-3"
                    >
                      {history.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto gap-2.5 text-slate-500 py-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${meta.iconBg}`}>
                            <Bot size={22} />
                          </div>
                          <div className="text-title-sm font-bold text-slate-800">
                            {selectedAccount?.name} · {t("Autonomous CCRM MCP Agent", "Autonómny CCRM MCP Agent", "Autonóm CCRM MCP Ügynök")}
                          </div>
                          <p className="text-caption text-slate-500">
                            {t(
                              "Instruct the agent in chat. Select memory.md or any artifact in the right sidebar to halve the chat and open the live content editor.",
                              "Zadajte agentovi pokyn v chate. Kliknutím na memory.md alebo artefakt v pravom paneli rozdelíte chat na polovicu a otvoríte editor obsahu.",
                              "Utasítsa az ügynököt a csevegésben. Válassza ki a memory.md fájlt vagy bármely artefaktumot a jobb oldali sávban a felezett szerkesztő megnyitásához.",
                            )}
                          </p>
                        </div>
                      ) : (
                        history.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-xl p-3.5 rounded-2xl space-y-1.5 ${
                                msg.role === "user"
                                  ? `${meta.accentBtn} shadow-xs`
                                  : "bg-slate-100 text-slate-800 border border-slate-200"
                              }`}
                            >
                              <div className="text-micro opacity-80 flex flex-wrap items-center justify-between gap-2">
                                <span className="font-bold flex items-center gap-1.5">
                                  {msg.role === "user"
                                    ? msg.author || currentUser?.name || "You"
                                    : selectedAccount?.name}
                                  {msg.subagentId && (
                                    <span className="px-1.5 py-0.5 rounded bg-black/10 text-micro font-mono">
                                      🤖 {msg.subagentId}
                                    </span>
                                  )}
                                  {msg.autonomous && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-900 text-micro font-bold">
                                      ⏰ {msg.taskTitle || t("Autonomous", "Autonómne", "Autonóm")}
                                    </span>
                                  )}
                                </span>
                                <span>{msg.timestamp}</span>
                              </div>

                              {/* Autonomous Step Badges (clickable to open the corresponding artifact or WhatsApp chat) */}
                              {msg.steps && msg.steps.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {msg.steps.map((stItem) => (
                                    <button
                                      key={stItem.id}
                                      type="button"
                                      onClick={() => {
                                        if (stItem.kind === "memory") {
                                          if (stItem.tool?.startsWith("artifact_") && stItem.detail) {
                                            handleSelectArtifact(`artifact:${stItem.detail}`);
                                          } else {
                                            handleSelectArtifact("memory:main");
                                          }
                                        } else if (
                                          stItem.kind === "whatsapp" &&
                                          siblingWaAccount &&
                                          stItem.detail &&
                                          stItem.detail.includes("@")
                                        ) {
                                          setWaSelectedLeadId(stItem.detail);
                                          setSelectedMailboxId(siblingWaAccount.id);
                                        }
                                      }}
                                      title={stItem.detail || stItem.tool}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-micro font-bold border cursor-pointer ${
                                        stItem.kind === "memory"
                                          ? "bg-violet-50 hover:bg-violet-100 text-violet-800 border-violet-200"
                                          : stItem.kind === "subagent"
                                            ? "bg-amber-50 text-amber-800 border-amber-200"
                                            : stItem.kind === "schedule"
                                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                              : stItem.kind === "whatsapp"
                                                ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300"
                                                : "bg-white text-slate-700 border-slate-200"
                                      }`}
                                    >
                                      {stItem.kind === "memory"
                                        ? "📝"
                                        : stItem.kind === "subagent"
                                          ? "🤖"
                                          : stItem.kind === "schedule"
                                            ? "⏰"
                                            : stItem.kind === "whatsapp"
                                              ? stItem.tool === "whatsapp_send_message"
                                                ? "📤"
                                                : "💬"
                                              : "⚡"}{" "}
                                      {stItem.label}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {msg.role === "assistant" ? (
                                <Markdown content={msg.text} className="text-body leading-relaxed space-y-1.5" />
                              ) : (
                                <div className="text-body whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                      {isAgentRunning && (
                        <div className="flex items-center gap-2 text-caption text-slate-500 font-semibold">
                          <Loader2 size={15} className="animate-spin text-indigo-600" />
                          {t(
                            "Agent is working autonomously via CCRM MCP...",
                            "Agent pracuje autonómne cez CCRM MCP...",
                            "Az ügynök önállóan dolgozik a CCRM MCP-n keresztül...",
                          )}
                        </div>
                      )}
                    </div>

                    {/* 3. CHAT PROMPT INPUT BAR */}
                    <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-2 shrink-0 bg-white">
                      <input
                        type="text"
                        value={agentPrompt}
                        onChange={(e) => setAgentPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void handleSendAgentMessage();
                          }
                        }}
                        placeholder={
                          activeSubagentObj
                            ? `${t("Instruct subagent", "Zadajte pokyn subagentovi", "Utasítsa az alügynököt")} ${activeSubagentObj.name}...`
                            : t(
                                "Instruct the agent what to do, write to memory.md, or create an artifact...",
                                "Zadajte agentovi, čo má urobiť, zapísať do memory.md alebo vytvoriť artefakt...",
                                "Utasítsa az ügynököt, mit tegyen, írjon a memory.md-be vagy hozzon létre artefaktumot...",
                              )
                        }
                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-body text-slate-800 focus:outline-none focus:bg-white focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSendAgentMessage()}
                        disabled={!agentPrompt.trim() || isAgentRunning}
                        className={`px-4 py-2.5 rounded-xl text-body font-bold flex items-center gap-2 disabled:opacity-40 cursor-pointer ${meta.accentBtn}`}
                      >
                        {isAgentRunning ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        {t("Send", "Odoslať", "Küldés")}
                      </button>
                    </div>
                  </div>
                  )}

                  {/* RIGHT HALF OF CENTER (50% WIDTH): ARTIFACT CONTENT EDITOR (SHOWN WHEN AN ARTIFACT IS SELECTED) */}
                  {isArtSelected && (
                    <div
                      data-testid="agent-artifact-editor-pane"
                      className="glass-panel rounded-3xl border border-violet-200/80 bg-white/95 shadow-glass flex flex-col h-full max-h-full overflow-hidden"
                    >
                      {/* Editor Header */}
                      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded-md text-micro font-bold ${
                                selectedArtifactKey === "memory:main"
                                  ? "bg-violet-100 text-violet-800"
                                  : selectedArtifactKey === "cron:main"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : selectedSubObj
                                      ? "bg-amber-100 text-amber-800"
                                      : selectedTaskObj
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-indigo-100 text-indigo-800"
                              }`}
                            >
                              {selectedArtifactKey === "memory:main"
                                ? "MEMORY"
                                : selectedArtifactKey === "cron:main"
                                  ? "AUTONOMOUS CRONJOB"
                                  : selectedSubObj
                                    ? "SUBAGENT"
                                    : selectedTaskObj
                                      ? "AUTONOMOUS TASK"
                                      : "ARTIFACT"}
                            </span>
                            {isMemoryDirty && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-micro font-semibold">
                                {t("Unsaved", "Neuložené", "Mentetlen")}
                              </span>
                            )}
                          </div>
                          <div className="text-title-sm font-heading font-bold text-slate-900 truncate mt-0.5">
                            {selectedArtifactKey === "memory:main"
                              ? `${selectedAccount?.name} / memory.md`
                              : selectedArtifactKey === "cron:main"
                                ? `⏰ ${t("Autonomous Cron (api/cron.php)", "Autonómny Cron (api/cron.php)", "Autonóm Cron (api/cron.php)")}`
                                : selectedSubObj
                                  ? `🤖 ${selectedSubObj.name} · memory.md`
                                  : selectedTaskObj
                                    ? `⏰ ${selectedTaskObj.title}`
                                    : selectedNamedArt
                                      ? `📄 ${selectedNamedArt.name}`
                                      : artifactTitleDraft}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {selectedArtifactKey === "cron:main" && (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleRunTaskNow("__autonomous__")}
                                disabled={isAgentRunning}
                                className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-micro font-bold cursor-pointer disabled:opacity-40"
                              >
                                ▶ {t("Trigger Cron Now", "Spustiť Cron teraz", "Cron indítása most")}
                              </button>
                              <select
                                value={String(st?.autonomousMode?.intervalMinutes ?? 15)}
                                onChange={(e) =>
                                  void handleUpdateAutonomousCron({
                                    intervalMinutes: Math.max(1, parseInt(e.target.value, 10) || 15),
                                  })
                                }
                                aria-label={t("Cron interval", "Interval cronu", "Cron időköz")}
                                className="px-2 py-1.5 rounded-xl bg-white border border-slate-200 text-micro font-bold text-slate-700 cursor-pointer"
                              >
                                <option value="1">1m</option>
                                <option value="5">5m</option>
                                <option value="15">15m</option>
                                <option value="30">30m</option>
                                <option value="60">60m</option>
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleUpdateAutonomousCron({
                                    enabled: !Boolean(st?.autonomousMode?.enabled),
                                  })
                                }
                                className={`px-2.5 py-1.5 rounded-xl text-micro font-bold cursor-pointer ${
                                  Boolean(st?.autonomousMode?.enabled)
                                    ? "bg-emerald-600 text-white"
                                    : "bg-amber-50 text-amber-700"
                                }`}
                              >
                                {Boolean(st?.autonomousMode?.enabled)
                                  ? t("Cron Active", "Cron aktívny", "Cron aktív")
                                  : t("Paused", "Pozastavené", "Szünetel")}
                              </button>
                            </>
                          )}
                          {selectedSubObj && (
                            <button
                              type="button"
                              onClick={() => setActiveChatSubagentId(selectedSubObj.id)}
                              className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-micro font-bold cursor-pointer"
                            >
                              💬 {t("Instruct", "Pokyn", "Utasítás")}
                            </button>
                          )}
                          {selectedTaskObj && (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleRunTaskNow(selectedTaskObj.id)}
                                disabled={isAgentRunning}
                                className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-micro font-bold cursor-pointer disabled:opacity-40"
                              >
                                ▶ {t("Run now", "Spustiť", "Futtatás")}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleTask(selectedTaskObj)}
                                className={`px-2.5 py-1.5 rounded-xl text-micro font-bold cursor-pointer ${
                                  selectedTaskObj.enabled
                                    ? "bg-slate-100 text-slate-700"
                                    : "bg-amber-50 text-amber-700"
                                }`}
                              >
                                {selectedTaskObj.enabled
                                  ? t("Active", "Aktívne", "Aktív")
                                  : t("Paused", "Pozastavené", "Szünetel")}
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleSaveSelectedArtifact()}
                            disabled={isSavingMemory || !canEdit}
                            data-testid="save-agent-memory-btn"
                            className={`px-3 py-1.5 rounded-xl text-micro font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 ${
                              isMemoryDirty
                                ? "bg-violet-600 hover:bg-violet-500 text-white shadow-2xs"
                                : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {isSavingMemory ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                            {t("Save", "Uložiť", "Mentés")}
                          </button>
                          {selectedNamedArt && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteArtifact(selectedNamedArt.id)}
                              title={t("Delete artifact", "Odstrániť artefakt", "Artefaktum törlése")}
                              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          {selectedSubObj && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteSubagent(selectedSubObj.id)}
                              title={t("Delete subagent", "Odstrániť subagenta", "Alügynök törlése")}
                              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          {selectedTaskObj && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteTask(selectedTaskObj.id)}
                              title={t("Delete task", "Odstrániť úlohu", "Feladat törlése")}
                              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleSelectArtifact(null)}
                            data-testid="close-artifact-editor-btn"
                            title={t("Close editor", "Zavrieť editor", "Szerkesztő bezárása")}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 cursor-pointer"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>

                      {/* Optional Autonomous Cron Info Banner */}
                      {selectedArtifactKey === "cron:main" && (
                        <div className="px-5 py-2.5 border-b border-slate-100 bg-emerald-50/50 space-y-1 shrink-0">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-micro text-emerald-900 font-semibold">
                            <span>
                              {t(
                                "Executed autonomously by server cronjob:",
                                "Spúšťané autonómne serverovým cronjobom:",
                                "A szerver cronjob önállóan futtatja:",
                              )}{" "}
                              <code className="px-1.5 py-0.5 rounded bg-white border border-emerald-200 font-mono text-emerald-800">
                                * * * * * php /var/www/html/api/cron.php
                              </code>
                            </span>
                            {st?.autonomousMode?.lastRunAt && (
                              <span className="font-mono text-emerald-700">
                                {t("Last cron tick:", "Posledný beh cronu:", "Utolsó cron futás:")}{" "}
                                {new Date(st.autonomousMode.lastRunAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                })}{" "}
                                ({st.autonomousMode.lastStatus || "ok"})
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Optional Subagent System Prompt Field */}
                      {selectedSubObj && (
                        <div className="px-5 py-2.5 border-b border-slate-100 bg-amber-50/40 space-y-1 shrink-0">
                          <label className="block text-micro font-bold text-amber-900">
                            {t("Subagent System Instructions", "Systémové pokyny subagenta", "Alügynök rendszerutasításai")} ({selectedSubObj.role})
                          </label>
                          <input
                            type="text"
                            value={subPromptDraft}
                            onChange={(e) => {
                              setSubPromptDraft(e.target.value);
                              setIsMemoryDirty(true);
                            }}
                            className="w-full px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-caption text-slate-800 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      )}

                      {/* Full-height Content Editor Textarea */}
                      <div className="flex-1 p-4 flex flex-col min-h-0 overflow-hidden">
                        <textarea
                          data-testid="agent-memory-textarea"
                          value={memoryDraft}
                          onChange={(e) => {
                            setMemoryDraft(e.target.value);
                            setIsMemoryDirty(true);
                          }}
                          onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
                              e.preventDefault();
                              void handleSaveSelectedArtifact();
                            }
                          }}
                          placeholder="# Markdown artifact content..."
                          className="w-full flex-1 p-3.5 rounded-2xl bg-slate-50/70 focus:bg-white border border-slate-200 font-mono text-caption text-slate-800 focus:outline-none focus:border-violet-500 resize-none leading-relaxed overflow-y-auto"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT SIDEBAR: MEMORY & ARTIFACTS */}
                <div
                  data-testid="agent-artifacts-sidebar"
                  className="w-full ws-lg:w-64 shrink-0 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col h-full max-h-full overflow-hidden"
                >
                  <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <FileText size={14} className="text-violet-600" />
                      <span className="text-caption font-bold text-slate-900">
                        {t("Memory & Artifacts", "Pamäť a artefakty", "Memória és artefaktumok")}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewArtifactOpen((v) => !v)}
                      title={t("New artifact", "Nový artefakt", "Új artefaktum")}
                      className="px-2 py-0.5 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 text-micro font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={11} /> {t("New", "Nový", "Új")}
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-4">
                    {/* New Artifact Inline Form */}
                    {newArtifactOpen && (
                      <div className="p-2.5 rounded-2xl bg-violet-50/60 border border-violet-200 space-y-2">
                        <input
                          type="text"
                          value={newArtifactName}
                          onChange={(e) => setNewArtifactName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleCreateArtifact();
                            }
                          }}
                          placeholder={t("e.g. playbook.md", "napr. playbook.md", "pl. playbook.md")}
                          className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-caption"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setNewArtifactOpen(false)}
                            className="px-2 py-0.5 rounded-lg text-micro font-semibold text-slate-500 cursor-pointer"
                          >
                            {t("Cancel", "Zrušiť", "Mégse")}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCreateArtifact()}
                            className="px-2.5 py-0.5 rounded-lg bg-violet-600 text-white text-micro font-bold cursor-pointer"
                          >
                            {t("Create", "Vytvoriť", "Létrehozás")}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Section 1: Memory & Named Artifacts */}
                    <div className="space-y-1">
                      <div className="px-1 text-micro font-bold uppercase tracking-wider text-slate-400">
                        {t("Files & Memory", "Súbory a pamäť", "Fájlok és memória")}
                      </div>

                      {/* Primary memory.md */}
                      <button
                        type="button"
                        data-testid="sidebar-artifact-memory-main"
                        onClick={() => handleSelectArtifact("memory:main")}
                        className={`w-full px-3 py-2 rounded-2xl text-left flex items-center gap-2.5 transition-all cursor-pointer border ${
                          selectedArtifactKey === "memory:main"
                            ? "bg-violet-50/90 border-violet-300 text-violet-950 shadow-2xs"
                            : "bg-white hover:bg-slate-50 border-slate-100 text-slate-700"
                        }`}
                      >
                        <span className="w-7 h-7 rounded-xl bg-violet-500/15 text-violet-700 flex items-center justify-center shrink-0">
                          <FileText size={14} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-caption font-bold truncate">memory.md</div>
                          <div className="text-micro text-slate-400 truncate">
                            {t("Core agent memory", "Hlavná pamäť agenta", "Ügynök fő memóriája")}
                          </div>
                        </div>
                      </button>

                      {/* Additional named artifacts */}
                      {artifactsList.map((art) => {
                        const key = `artifact:${art.id}`;
                        const active = selectedArtifactKey === key;
                        return (
                          <button
                            key={art.id}
                            type="button"
                            onClick={() => handleSelectArtifact(key)}
                            className={`w-full px-3 py-2 rounded-2xl text-left flex items-center gap-2.5 transition-all cursor-pointer border ${
                              active
                                ? "bg-indigo-50/90 border-indigo-300 text-indigo-950 shadow-2xs"
                                : "bg-white hover:bg-slate-50 border-slate-100 text-slate-700"
                            }`}
                          >
                            <span className="w-7 h-7 rounded-xl bg-indigo-500/15 text-indigo-700 flex items-center justify-center shrink-0">
                              <FileText size={14} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-caption font-bold truncate">{art.name}</div>
                              <div className="text-micro text-slate-400 truncate">{art.title}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Section 2: Subagents */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <div className="px-1 flex items-center justify-between">
                        <span className="text-micro font-bold uppercase tracking-wider text-slate-400">
                          {t("Subagents", "Subagenti", "Alügynökök")} ({subagents.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => setNewSubagentOpen((v) => !v)}
                          className="text-micro font-bold text-amber-700 hover:text-amber-800 cursor-pointer"
                        >
                          + {t("Add", "Pridať", "Hozzáadás")}
                        </button>
                      </div>

                      {newSubagentOpen && (
                        <div className="p-2.5 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-1.5">
                          <input
                            type="text"
                            value={newSubName}
                            onChange={(e) => setNewSubName(e.target.value)}
                            placeholder={t("Name (e.g. Lead Qualifier)", "Názov", "Név")}
                            className="w-full px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-caption"
                          />
                          <input
                            type="text"
                            value={newSubRole}
                            onChange={(e) => setNewSubRole(e.target.value)}
                            placeholder={t("Role / Specialty", "Rola", "Szerepkör")}
                            className="w-full px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-caption"
                          />
                          <input
                            type="text"
                            value={newSubPrompt}
                            onChange={(e) => setNewSubPrompt(e.target.value)}
                            placeholder={t("System prompt...", "Systémový pokyn...", "Rendszerutasítás...")}
                            className="w-full px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-caption"
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setNewSubagentOpen(false)}
                              className="px-2 py-0.5 rounded-lg text-micro font-semibold text-slate-500 cursor-pointer"
                            >
                              {t("Cancel", "Zrušiť", "Mégse")}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCreateSubagent()}
                              className="px-2.5 py-0.5 rounded-lg bg-amber-600 text-white text-micro font-bold cursor-pointer"
                            >
                              {t("Create", "Vytvoriť", "Létrehozás")}
                            </button>
                          </div>
                        </div>
                      )}

                      {subagents.length === 0 ? (
                        <div className="px-2 py-2 text-micro text-slate-400">
                          {t("No subagents yet.", "Zatiaľ žiadni subagenti.", "Még nincs alügynök.")}
                        </div>
                      ) : (
                        subagents.map((sub) => {
                          const key = `subagent:${sub.id}`;
                          const active = selectedArtifactKey === key;
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => handleSelectArtifact(key)}
                              className={`w-full px-3 py-2 rounded-2xl text-left flex items-center gap-2.5 transition-all cursor-pointer border ${
                                active
                                  ? "bg-amber-50/90 border-amber-300 text-amber-950 shadow-2xs"
                                  : "bg-white hover:bg-slate-50 border-slate-100 text-slate-700"
                              }`}
                            >
                              <span className="w-7 h-7 rounded-xl bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0">
                                <Bot size={14} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="text-caption font-bold truncate">{sub.name}</div>
                                <div className="text-micro text-amber-700 truncate">{sub.role}</div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>

                    {/* Section 2b: Reactive Event Triggers */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <div className="px-1 flex items-center justify-between">
                        <span className="text-micro font-bold uppercase tracking-wider text-slate-400">
                          ⚡ {t("Reactive Triggers", "Reaktívne spúšťače", "Reaktív triggerek")} ({(st?.triggers || []).length})
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setVisualTriggersOpen(true)}
                            className="text-micro font-bold text-indigo-700 hover:text-indigo-800 cursor-pointer"
                          >
                            {t("Studio", "Štúdio", "Stúdió")}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              openNewTriggerModal({
                                sourceType: "whatsapp",
                                targetSubagentId: activeChatSubagentId,
                              })
                            }
                            className="text-micro font-bold text-violet-700 hover:text-violet-800 cursor-pointer"
                          >
                            + {t("Add", "Pridať", "Hozzáadás")}
                          </button>
                        </div>
                      </div>

                      {(st?.triggers || []).length === 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            openNewTriggerModal({
                              sourceType: "whatsapp",
                              targetSubagentId: activeChatSubagentId,
                            })
                          }
                          className="w-full px-3 py-2 rounded-2xl border border-dashed border-violet-200 bg-violet-50/30 hover:bg-violet-50/70 text-left text-micro text-violet-700 font-semibold cursor-pointer transition-all"
                        >
                          ⚡ {t("Connect WhatsApp, Email or CRM event ($0 idle cost)", "Prepojiť WhatsApp, e-mail alebo CRM udalosť ($0 nečinné náklady)", "WhatsApp, e-mail vagy CRM esemény bekötése ($0 üresjárati költség)")}
                        </button>
                      ) : (
                        (st?.triggers || []).map((tr) => (
                          <button
                            key={tr.id}
                            type="button"
                            onClick={() => openEditTriggerModal(tr)}
                            className={`w-full px-3 py-2 rounded-2xl text-left flex items-center gap-2.5 transition-all cursor-pointer border ${
                              tr.enabled
                                ? "bg-violet-50/70 hover:bg-violet-50 border-violet-200 text-slate-800"
                                : "bg-slate-50 border-slate-100 text-slate-400"
                            }`}
                          >
                            <span className="w-7 h-7 rounded-xl bg-violet-500/15 text-violet-700 flex items-center justify-center shrink-0">
                              <Zap size={13} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-caption font-bold truncate">{tr.name}</div>
                              <div className="text-micro text-violet-700 truncate">
                                {tr.sourceType === "whatsapp"
                                  ? `WhatsApp${tr.filter?.chatMatch ? ` · ${tr.filter.chatMatch}` : ""}`
                                  : tr.sourceType === "email"
                                    ? "Email"
                                    : `CRM · ${tr.filter?.eventType || "event"}`}
                                {" → "}
                                {!tr.targetSubagentId || tr.targetSubagentId === "main"
                                  ? "Main"
                                  : subagents.find((s) => s.id === tr.targetSubagentId)?.name || tr.targetSubagentId}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>

                    {/* Section 3: Autonomous Loop (Cronjob) */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <div className="px-1 flex items-center justify-between">
                        <span className="text-micro font-bold uppercase tracking-wider text-slate-400">
                          💓 {t("Heartbeat Cron", "Heartbeat Cron", "Heartbeat Cron")}
                        </span>
                        <button
                          type="button"
                          onClick={() => setNewTaskOpen((v) => !v)}
                          className="text-micro font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                        >
                          + {t("Task", "Úloha", "Feladat")}
                        </button>
                      </div>

                      {/* Primary Server Cronjob Autonomous Mode */}
                      <button
                        type="button"
                        data-testid="sidebar-artifact-cron-main"
                        onClick={() => handleSelectArtifact("cron:main")}
                        className={`w-full px-3 py-2 rounded-2xl text-left flex items-center gap-2.5 transition-all cursor-pointer border ${
                          selectedArtifactKey === "cron:main"
                            ? "bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-2xs"
                            : "bg-white hover:bg-slate-50 border-slate-100 text-slate-700"
                        }`}
                      >
                        <span className="w-7 h-7 rounded-xl bg-emerald-500/15 text-emerald-700 flex items-center justify-center shrink-0">
                          <Clock size={14} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-caption font-bold truncate">
                            {t("Autonomous Cron", "Autonómny Cron", "Autonóm Cron")}
                          </div>
                          <div className="text-micro text-emerald-700 truncate">
                            {t("Every", "Každých", "Minden")} {st?.autonomousMode?.intervalMinutes ?? 15}m ·{" "}
                            {Boolean(st?.autonomousMode?.enabled)
                              ? t("Cron Active", "Cron aktívny", "Cron aktív")
                              : t("Paused ($0 idle)", "Pozastavené ($0)", "Szünetel ($0)")}
                          </div>
                        </div>
                      </button>

                      {newTaskOpen && (
                        <div className="p-2.5 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-1.5">
                          <input
                            type="text"
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            placeholder={t("Task title", "Názov úlohy", "Feladat címe")}
                            className="w-full px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-caption"
                          />
                          <input
                            type="number"
                            min={1}
                            value={newTaskInterval}
                            onChange={(e) => setNewTaskInterval(e.target.value)}
                            placeholder={t("Interval (min)", "Interval (min)", "Időköz (perc)")}
                            className="w-full px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-caption"
                          />
                          <input
                            type="text"
                            value={newTaskPrompt}
                            onChange={(e) => setNewTaskPrompt(e.target.value)}
                            placeholder={t("Instruction prompt...", "Pokyn...", "Utasítás...")}
                            className="w-full px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-caption"
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setNewTaskOpen(false)}
                              className="px-2 py-0.5 rounded-lg text-micro font-semibold text-slate-500 cursor-pointer"
                            >
                              {t("Cancel", "Zrušiť", "Mégse")}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCreateTask()}
                              className="px-2.5 py-0.5 rounded-lg bg-emerald-600 text-white text-micro font-bold cursor-pointer"
                            >
                              {t("Schedule", "Naplánovať", "Ütemezés")}
                            </button>
                          </div>
                        </div>
                      )}

                      {autonomousTasks.length === 0 ? (
                        <div className="px-2 py-2 text-micro text-slate-400">
                          {t("No standing tasks.", "Žiadne trvalé úlohy.", "Nincs állandó feladat.")}
                        </div>
                      ) : (
                        autonomousTasks.map((tk) => {
                          const key = `task:${tk.id}`;
                          const active = selectedArtifactKey === key;
                          return (
                            <button
                              key={tk.id}
                              type="button"
                              onClick={() => handleSelectArtifact(key)}
                              className={`w-full px-3 py-2 rounded-2xl text-left flex items-center gap-2.5 transition-all cursor-pointer border ${
                                active
                                  ? "bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-2xs"
                                  : "bg-white hover:bg-slate-50 border-slate-100 text-slate-700"
                              }`}
                            >
                              <span className="w-7 h-7 rounded-xl bg-emerald-500/15 text-emerald-700 flex items-center justify-center shrink-0">
                                <Clock size={14} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="text-caption font-bold truncate">{tk.title}</div>
                                <div className="text-micro text-emerald-700 truncate">
                                  {t("Every", "Každých", "Minden")} {tk.intervalMinutes}m ·{" "}
                                  {tk.enabled ? t("Active", "Aktívne", "Aktív") : t("Paused", "Pozastavené", "Szünetel")}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* REACTIVE TRIGGER CONFIGURATION MODAL */}
                {triggerModalOpen && (
                  <div
                    data-testid="agent-trigger-modal"
                    className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-4"
                    onClick={() => setTriggerModalOpen(false)}
                  >
                    <div
                      className="w-full max-w-xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-50/80 via-indigo-50/50 to-white flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-9 h-9 rounded-2xl bg-violet-600 text-white flex items-center justify-center shadow-xs">
                            <Zap size={17} />
                          </span>
                          <div>
                            <div className="text-title-sm font-heading font-bold text-slate-900">
                              {triggerDraftId
                                ? t("Edit Reactive Event Trigger", "Upraviť reaktívny spúšťač", "Reaktív trigger szerkesztése")
                                : t("New Reactive Event Trigger", "Nový reaktívny spúšťač", "Új reaktív esemény trigger")}
                            </div>
                            <div className="text-micro text-slate-500">
                              {t(
                                "Runs the agent immediately when an event matches ($0 idle cost)",
                                "Spustí agenta okamžite pri zhode udalosti ($0 pri nečinnosti)",
                                "Azonnal futtatja az ügynököt esemény egyezésekor ($0 üresjárati költség)",
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTriggerModalOpen(false)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="p-6 overflow-y-auto space-y-4">
                        {/* Trigger Name */}
                        <div>
                          <label className="block text-micro font-bold uppercase tracking-wider text-slate-500 mb-1">
                            {t("Trigger Name", "Názov spúšťača", "Trigger neve")}
                          </label>
                          <input
                            type="text"
                            data-testid="trigger-name-input"
                            value={triggerDraftName}
                            onChange={(e) => setTriggerDraftName(e.target.value)}
                            placeholder={t(
                              "e.g. Managment Cstudios Haiku Auto-Reply",
                              "napr. Automatická odpoveď WhatsApp",
                              "pl. Managment Cstudios Haiku válaszoló",
                            )}
                            className="w-full px-3.5 py-2 rounded-xl bg-slate-50 focus:bg-white border border-slate-200 text-body text-slate-800 focus:outline-none focus:border-violet-500"
                          />
                        </div>

                        {/* Source Connection & Target Agent */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-micro font-bold uppercase tracking-wider text-slate-500 mb-1">
                              1. {t("Event Source Connection", "Zdrojové spojenie", "Esemény forráskapcsolata")}
                            </label>
                            <select
                              data-testid="trigger-source-type-select"
                              value={
                                triggerDraftSourceType !== "crm_event" &&
                                triggerDraftSourceConnectorId &&
                                availableAccounts.some((a) => a.id === triggerDraftSourceConnectorId)
                                  ? `conn:${triggerDraftSourceConnectorId}`
                                  : triggerDraftSourceType
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val.startsWith("conn:")) {
                                  const accId = val.slice(5);
                                  const acc = availableAccounts.find((a) => a.id === accId);
                                  setTriggerDraftSourceConnectorId(accId);
                                  setTriggerDraftSourceType(
                                    isMessagingConnector(acc?.connectorType) ? "whatsapp" : "email",
                                  );
                                } else {
                                  const nextType = val as "whatsapp" | "email" | "crm_event";
                                  setTriggerDraftSourceType(nextType);
                                  if (nextType === "whatsapp") {
                                    const waAcc = availableAccounts.find((a) => isMessagingConnector(a.connectorType));
                                    setTriggerDraftSourceConnectorId(waAcc?.id || "");
                                  } else if (nextType === "email") {
                                    const emAcc = availableAccounts.find((a) => isEmailConnector(a.connectorType));
                                    setTriggerDraftSourceConnectorId(emAcc?.id || "");
                                  } else {
                                    setTriggerDraftSourceConnectorId("");
                                  }
                                }
                              }}
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-body font-semibold text-slate-800"
                            >
                              <optgroup label={t("Messaging & BotMan Connections", "Messaging & BotMan spojenia", "Messaging és BotMan kapcsolatok")}>
                                {availableAccounts
                                  .filter((a) => isMessagingConnector(a.connectorType))
                                  .map((acc) => (
                                    <option key={acc.id} value={`conn:${acc.id}`}>
                                      💬 {acc.name} ({(acc.connectorType || "whatsapp").toUpperCase()}
                                      {acc.address ? ` · ${acc.address}` : ""})
                                    </option>
                                  ))}
                                <option value="whatsapp">
                                  💬 {t("Any Messaging / BotMan Channel", "Akýkoľvek Messaging / BotMan kanál", "Bármely Messaging / BotMan csatorna")}
                                </option>
                              </optgroup>
                              <optgroup label={t("Email Mailboxes", "E-mailové schránky", "E-mail postafiókok")}>
                                {availableAccounts
                                  .filter((a) => isEmailConnector(a.connectorType))
                                  .map((acc) => (
                                    <option key={acc.id} value={`conn:${acc.id}`}>
                                      ✉️ {acc.name} ({(acc.connectorType || "smtp").toUpperCase()}
                                      {acc.address ? ` · ${acc.address}` : ""})
                                    </option>
                                  ))}
                                <option value="email">
                                  ✉️ {t("Any Email Mailbox", "Akákoľvek e-mailová schránka", "Bármely e-mail postafiók")}
                                </option>
                              </optgroup>
                              <optgroup label={t("CRM System Events", "Systémové udalosti CRM", "CRM rendszeresemények")}>
                                <option value="crm_event">🔔 CRM Event (Lead / Project / Task)</option>
                              </optgroup>
                            </select>
                          </div>

                          <div>
                            <label className="block text-micro font-bold uppercase tracking-wider text-slate-500 mb-1">
                              2. {t("Target Agent", "Cieľový agent", "Cél ügynök")}
                            </label>
                            <select
                              data-testid="trigger-target-agent-select"
                              value={triggerDraftTargetSubagentId}
                              onChange={(e) => setTriggerDraftTargetSubagentId(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-violet-50/70 border border-violet-200 text-body font-bold text-violet-950"
                            >
                              <option value="">✦ {selectedAccount?.name} (Main Agent)</option>
                              {subagents.map((sub) => (
                                <option key={sub.id} value={sub.id}>
                                  🤖 {sub.name} ({sub.role})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Source-Specific Filters */}
                        {triggerDraftSourceType === "whatsapp" && (
                          <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 space-y-3">
                            {(() => {
                              const draftSourceAcc = availableAccounts.find(
                                (a) => a.id === triggerDraftSourceConnectorId,
                              );
                              const isNativeWa =
                                !draftSourceAcc || (draftSourceAcc.connectorType || "whatsapp") === "whatsapp";
                              const channelHeaderLabel = draftSourceAcc
                                ? `${draftSourceAcc.name} (${(draftSourceAcc.connectorType || "whatsapp").toUpperCase()})`
                                : "WhatsApp / BotMan";
                              return (
                                <>
                                  <div className="text-micro font-bold uppercase tracking-wider text-emerald-800">
                                    💬 {channelHeaderLabel} —{" "}
                                    {t("Conversation Filter", "Filter konverzácie", "Beszélgetés szűrő")}
                                  </div>

                                  {isNativeWa && waState?.chats && waState.chats.length > 0 && (
                                    <div>
                                      <label className="block text-micro font-semibold text-emerald-900 mb-1">
                                        {t(
                                          "Quick-pick synced WhatsApp chat / group:",
                                          "Rýchly výber chatu / skupiny:",
                                          "Szinkronizált csoport / chat gyorsválasztó:",
                                        )}
                                      </label>
                                      <select
                                        value=""
                                        onChange={(e) => {
                                          if (e.target.value) setTriggerDraftChatMatch(e.target.value);
                                        }}
                                        className="w-full px-3 py-1.5 rounded-xl bg-white border border-emerald-200 text-caption text-slate-800"
                                      >
                                        <option value="">
                                          {t(
                                            "— Select a WhatsApp chat or group —",
                                            "— Vyberte chat alebo skupinu —",
                                            "— Válassz WhatsApp chatet vagy csoportot —",
                                          )}
                                        </option>
                                        {waState.chats.map((c) => (
                                          <option key={c.id} value={c.name || c.id}>
                                            {c.isGroup ? "👥 " : "👤 "}
                                            {c.name} ({c.id})
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  )}
                                </>
                              );
                            })()}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div>
                                <label className="block text-micro font-semibold text-emerald-900 mb-1">
                                  {t("Chat / Group Name or JID contains", "Názov chatu / skupiny obsahuje", "Chat / Csoport neve vagy JID tartalmazza")}
                                </label>
                                <input
                                  type="text"
                                  data-testid="trigger-chat-match-input"
                                  value={triggerDraftChatMatch}
                                  onChange={(e) => setTriggerDraftChatMatch(e.target.value)}
                                  placeholder={t("e.g. Managment Cstudios (blank = all)", "napr. Managment Cstudios", "pl. Managment Cstudios (üres = mind)")}
                                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-emerald-200 text-caption text-slate-800"
                                />
                              </div>
                              <div>
                                <label className="block text-micro font-semibold text-emerald-900 mb-1">
                                  {t("Message Keyword Filter (optional)", "Kľúčové slovo v správe", "Üzenet kulcsszó szűrő (opcionális)")}
                                </label>
                                <input
                                  type="text"
                                  value={triggerDraftKeywordContains}
                                  onChange={(e) => setTriggerDraftKeywordContains(e.target.value)}
                                  placeholder={t("Any message if blank", "Akákoľvek správa ak prázdne", "Üresen minden üzenet")}
                                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-emerald-200 text-caption text-slate-800"
                                />
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 pt-1">
                              <label className="inline-flex items-center gap-1.5 text-micro font-semibold text-emerald-900 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={triggerDraftOnlyGroup}
                                  onChange={(e) => {
                                    setTriggerDraftOnlyGroup(e.target.checked);
                                    if (e.target.checked) setTriggerDraftOnlyDirect(false);
                                  }}
                                />
                                {t("Only Group Chats (@g.us)", "Iba skupinové chaty", "Csak csoportos chatek (@g.us)")}
                              </label>
                              <label className="inline-flex items-center gap-1.5 text-micro font-semibold text-emerald-900 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={triggerDraftOnlyDirect}
                                  onChange={(e) => {
                                    setTriggerDraftOnlyDirect(e.target.checked);
                                    if (e.target.checked) setTriggerDraftOnlyGroup(false);
                                  }}
                                />
                                {t("Only Direct 1-on-1 Chats", "Iba priame 1-na-1 správy", "Csak privát 1-1 beszélgetések")}
                              </label>
                            </div>
                          </div>
                        )}

                        {triggerDraftSourceType === "email" && (
                          <div className="p-3.5 rounded-2xl bg-sky-50/60 border border-sky-200/80 space-y-2.5">
                            <div className="text-micro font-bold uppercase tracking-wider text-sky-800">
                              ✉️ {t("Incoming Email Filter", "Filter prichádzajúcich e-mailov", "Bejövő e-mail szűrő")}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div>
                                <label className="block text-micro font-semibold text-sky-900 mb-1">
                                  {t("Sender (From) contains", "Odosielateľ obsahuje", "Feladó tartalmazza")}
                                </label>
                                <input
                                  type="text"
                                  value={triggerDraftFromContains}
                                  onChange={(e) => setTriggerDraftFromContains(e.target.value)}
                                  placeholder={t("e.g. @client.com (blank = all)", "napr. @klient.sk", "pl. @ugyfel.hu (üres = mind)")}
                                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-sky-200 text-caption text-slate-800"
                                />
                              </div>
                              <div>
                                <label className="block text-micro font-semibold text-sky-900 mb-1">
                                  {t("Subject contains", "Predmet obsahuje", "Tárgy tartalmazza")}
                                </label>
                                <input
                                  type="text"
                                  value={triggerDraftSubjectContains}
                                  onChange={(e) => setTriggerDraftSubjectContains(e.target.value)}
                                  placeholder={t("e.g. Quote / Urgent (blank = all)", "napr. Dopyt", "pl. Árajánlat (üres = mind)")}
                                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-sky-200 text-caption text-slate-800"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {triggerDraftSourceType === "crm_event" && (
                          <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-2">
                            <label className="block text-micro font-bold uppercase tracking-wider text-amber-800">
                              🔔 {t("CRM Event Type", "Typ CRM udalosti", "CRM esemény típusa")}
                            </label>
                            <select
                              value={triggerDraftEventType}
                              onChange={(e) => setTriggerDraftEventType(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-caption font-semibold text-slate-800"
                            >
                              <option value="lead_created">✨ New Lead Created (lead_created)</option>
                              <option value="project_created">🚀 New Project Created (project_created)</option>
                              <option value="ticket_created">🎫 New Support Ticket Created (ticket_created)</option>
                              <option value="task_created">✅ New Task Created (task_created)</option>
                            </select>
                          </div>
                        )}

                        {/* Full Conversation Context Window Badge */}
                        <div className="px-3.5 py-2.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 flex items-center justify-between gap-2 text-micro text-indigo-950">
                          <span className="font-semibold">
                            📚 {t(
                              "Full Conversation History: Agent automatically receives the last 50 messages AND at least the last 5 days of history (capped at 16,000 chars).",
                              "Plná história konverzácie: Agent automaticky dostane posledných 50 správ A aspoň posledných 5 dní histórie (limit 16 000 znakov).",
                              "Teljes beszélgetési előzmény: Az ügynök automatikusan megkapja az utolsó 50 üzenetet ÉS legalább az elmúlt 5 nap üzeneteit (16 000 karakteres limittel).",
                            )}
                          </span>
                        </div>

                        {/* Agent Instructions when Triggered */}
                        <div>
                          <label className="block text-micro font-bold uppercase tracking-wider text-slate-500 mb-1">
                            3. {t("Instructions for the Agent when Triggered", "Pokyny pre agenta pri spustení", "Utasítások az ügynök számára aktiváláskor")}
                          </label>
                          <textarea
                            rows={3}
                            data-testid="trigger-instructions-textarea"
                            value={triggerDraftInstructions}
                            onChange={(e) => setTriggerDraftInstructions(e.target.value)}
                            placeholder={t(
                              "e.g. Read the full conversation context and reply in a Hungarian haiku (5-7-5) to the latest message.",
                              "napr. Prečítaj si celú konverzáciu a odpovedz na najnovšiu správu.",
                              "pl. Olvasd el a teljes beszélgetést, és válaszolj magyar haikuban (5-7-5) a legújabb üzenetre.",
                            )}
                            className="w-full p-3 rounded-2xl bg-slate-50 focus:bg-white border border-slate-200 text-caption text-slate-800 focus:outline-none focus:border-violet-500"
                          />
                        </div>

                        {/* Auto-Reply Toggle */}
                        <label className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-violet-50/50 border border-violet-200/70 cursor-pointer">
                          <div>
                            <div className="text-caption font-bold text-slate-900">
                              {t(
                                "Authorize Automatic Reply Tools (send_whatsapp_message / send_email_reply)",
                                "Povoliť nástroje automatickej odpovede",
                                "Automatikus válasz eszközök engedélyezése (send_whatsapp_message / send_email_reply)",
                              )}
                            </div>
                            <div className="text-micro text-slate-500">
                              {t(
                                "Includes loop-protection so the agent never replies to its own messages.",
                                "Zahŕňa ochranu proti slučkám, aby agent nikdy neodpovedal na vlastné správy.",
                                "Végtelen ciklus elleni védelemmel (az ügynök sosem válaszol a saját üzenetére).",
                              )}
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={triggerDraftAutoReply}
                            onChange={(e) => setTriggerDraftAutoReply(e.target.checked)}
                            className="w-4 h-4 accent-violet-600"
                          />
                        </label>

                        {/* Proactive Conversation Re-Initiation ($0 Idle Cost) */}
                        {triggerDraftSourceType !== "crm_event" && (
                          <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200/80 space-y-3">
                            <label className="flex items-center justify-between gap-3 cursor-pointer">
                              <div>
                                <div className="text-caption font-bold text-indigo-950 flex items-center gap-1.5">
                                  🔄{" "}
                                  {t(
                                    "Proactive Conversation Re-Initiation ($0 Idle Cost)",
                                    "Proaktívne znovuotvorenie konverzácie ($0 v nečinnosti)",
                                    "Proaktív beszélgetés-újraindítás ($0 üresjárati költség)",
                                  )}
                                </div>
                                <div className="text-micro text-slate-600">
                                  {t(
                                    "Automatically re-initiate conversation if the contact stops replying after an agent message, or when the agent calls schedule_conversation_followup.",
                                    "Automaticky nadviaže kontakt, ak klient prestane odpovedať, alebo keď agent naplánuje follow-up.",
                                    "Automatikusan újraindítja a beszélgetést, ha az ügyfél nem válaszol az ügynök üzenetére, vagy ha az ügynök follow-upot ütemez.",
                                  )}
                                </div>
                              </div>
                              <input
                                type="checkbox"
                                data-testid="trigger-proactive-toggle"
                                checked={triggerDraftProactiveEnabled}
                                onChange={(e) => setTriggerDraftProactiveEnabled(e.target.checked)}
                                className="w-4 h-4 accent-indigo-600"
                              />
                            </label>

                            {triggerDraftProactiveEnabled && (
                              <div className="space-y-2.5 pt-2 border-t border-indigo-200/60">
                                <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-2.5">
                                  <div>
                                    <label className="block text-micro font-bold uppercase tracking-wider text-indigo-900 mb-1">
                                      {t(
                                        "Follow up after silence (minutes)",
                                        "Ozvanie po tichu (minúty)",
                                        "Utánkövetés csend után (perc)",
                                      )}
                                    </label>
                                    <input
                                      type="number"
                                      min={5}
                                      max={10080}
                                      value={triggerDraftProactiveAfterMinutes}
                                      onChange={(e) =>
                                        setTriggerDraftProactiveAfterMinutes(
                                          Math.max(5, Math.min(10080, Number(e.target.value) || 120)),
                                        )
                                      }
                                      className="w-full px-3 py-1.5 rounded-xl bg-white border border-indigo-200 text-caption font-semibold text-slate-800"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-micro font-bold uppercase tracking-wider text-indigo-900 mb-1">
                                      {t(
                                        "Max unprompted follow-ups",
                                        "Max. počet pripomenutí",
                                        "Max. proaktív üzenet",
                                      )}
                                    </label>
                                    <select
                                      value={triggerDraftProactiveMaxAttempts}
                                      onChange={(e) => setTriggerDraftProactiveMaxAttempts(Number(e.target.value) || 1)}
                                      className="w-full px-3 py-1.5 rounded-xl bg-white border border-indigo-200 text-caption font-semibold text-slate-800"
                                    >
                                      <option value={1}>1 {t("attempt (Recommended)", "pokus (Odporúčané)", "alkalom (Ajánlott)")}</option>
                                      <option value={2}>2 {t("attempts", "pokusy", "alkalom")}</option>
                                      <option value={3}>3 {t("attempts", "pokusy", "alkalom")}</option>
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-micro font-bold uppercase tracking-wider text-indigo-900 mb-1">
                                    {t(
                                      "Proactive Follow-Up Instructions",
                                      "Pokyny pre proaktívne oslovenie",
                                      "Proaktív utánkövetési utasítások",
                                    )}
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={triggerDraftProactiveInstructions}
                                    onChange={(e) => setTriggerDraftProactiveInstructions(e.target.value)}
                                    placeholder={t(
                                      "e.g. Check if they still need help with their quote or have any questions. If the conversation ended naturally, reply with [SKIP_FOLLOWUP].",
                                      "napr. Spýtaj sa, či ešte potrebujú pomoc s ponukou. Ak sa rozhovor prirodzene skončil, odpovedz [SKIP_FOLLOWUP].",
                                      "pl. Kérdezd meg udvariasan, tudunk-e még segíteni az ajánlattal kapcsolatban. Ha a beszélgetés természetesen lezárult, válaszolj [SKIP_FOLLOWUP]-pal.",
                                    )}
                                    className="w-full p-2.5 rounded-xl bg-white border border-indigo-200 text-caption text-slate-800 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setTriggerModalOpen(false)}
                          className="px-4 py-2 rounded-xl text-caption font-semibold text-slate-600 hover:bg-slate-200/60 cursor-pointer"
                        >
                          {t("Cancel", "Zrušiť", "Mégse")}
                        </button>
                        <button
                          type="button"
                          data-testid="save-agent-trigger-btn"
                          onClick={() => void handleSaveTriggerDraft()}
                          className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-caption font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Zap size={13} />
                          {triggerDraftId
                            ? t("Save Trigger", "Uložiť spúšťač", "Trigger mentése")
                            : t("Connect Trigger", "Prepojiť spúšťač", "Trigger bekötése")}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : (
        /* EMAIL COMMUNICATION LAYOUT (Gmail, SMTP/IMAP, MS Exchange, Personal) */
        <div
          data-testid="communication-email-layout"
          className="flex-1 min-w-0 grid grid-cols-1 ws-lg:grid-cols-12 gap-5 h-full max-h-full overflow-hidden"
        >
      {/* COLUMN 1: Conversation list */}
      <div className="ws-lg:col-span-5 ws-xl:col-span-4 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col h-full max-h-full overflow-hidden">
        {/* Search & filters */}
        <div className="p-4 space-y-3 border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder={t("Search conversations...", "Hľadať konverzácie...", "Beszélgetések keresése...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-body text-slate-700 focus:outline-none focus:bg-white focus:border-pink-300 transition-colors"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50" role="tablist" aria-label={t("Mailbox filter", "Filter schránky", "Postafiók szűrő")}>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "all"}
                onClick={() => setFilter("all")}
                className={`px-3.5 py-1.5 rounded-lg text-body font-bold transition-all cursor-pointer ${filter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {t("All", "Všetky", "Összes")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === "unread"}
                onClick={() => setFilter("unread")}
                className={`px-3.5 py-1.5 rounded-lg text-body font-bold transition-all flex items-center gap-1.5 cursor-pointer ${filter === "unread" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {t("Unread", "Neprečítané", "Olvasatlan")}
                {unreadCount > 0 && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-pink-600 text-white text-ui font-bold flex items-center justify-center">
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
              <span className="text-body font-semibold">{t("Syncing Envelopes...", "Synchronizácia obálok...", "Borítékok szinkronizálása...")}</span>
            </div>
          ) : shownCount === 0 ? (
            <div className="text-center py-12 px-4 text-slate-400 text-body font-semibold">
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
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-2 text-body text-slate-500 shrink-0">
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
      <div className="ws-lg:col-span-7 ws-xl:col-span-8 glass-panel rounded-3xl border border-white/60 bg-white/95 shadow-glass flex flex-col h-full max-h-full overflow-hidden">
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
                    <h3 className="text-title font-heading font-extrabold text-slate-900 tracking-tight break-words">{activeThread.subject}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-body text-slate-500">
                      <span className="inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-bold max-w-full">
                        <span className="h-6 w-6 rounded-lg bg-white border border-slate-200 text-slate-600 text-caption font-bold flex items-center justify-center shrink-0">
                          {initialsOf(contact.name)}
                        </span>
                        <span className="truncate">{contact.name}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MessagesSquare size={15} />
                        {plural(activeThread.emails.length, ["message", "messages"], ["správa", "správy", "správ"], "üzenet")}
                      </span>
                      {threadLead ? renderLeadChip(threadLead) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-ui font-bold border bg-white text-slate-500 border-slate-200">
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
                              <span className="text-body font-bold text-slate-800 truncate block">
                                {email.isSent ? `${t("To:", "Komu:", "Címzett:")} ${party.name}` : party.name}
                              </span>
                              <span className="text-ui text-slate-500 block mt-0.5 truncate">
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
                              <HoldToConfirmButton
                                  tone="danger"
                                  lang={systemLanguage}
                                  what={email.subject}
                                  onConfirm={() => handleDeleteEmail(email.uid)}
                                  className="h-8 w-8 rounded-xl flex items-center justify-center text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95"
                                  title={t("Delete Message", "Odstrániť správu", "Üzenet törlése")}
                              >
                                <Trash2 size={15} />
                              </HoldToConfirmButton>
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
                                <span className="text-body font-semibold">{t("Decoding part...", "Dekódovanie časti...", "Rész dekódolása...")}</span>
                              </div>
                            ) : bodyObj ? (
                              renderMailFrame(bodyObj, `Thread body ${email.uid}`, "w-full min-h-55 max-h-105 border-0 bg-transparent")
                            ) : (
                              <div className="text-center py-6 text-body font-semibold text-slate-400">
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
                <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0 text-left">
                  <div className="min-w-0">
                    <h3 className="text-title font-heading font-extrabold text-slate-900 tracking-tight break-words">
                      {selectedEmail.subject || t("(No Subject)", "(Bez predmetu)", "(Nincs tárgy)")}
                    </h3>
                    {renderPartyMeta(selectedEmail, lead)}
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
                          className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95"
                          title={t("Delete Message", "Odstrániť správu", "Üzenet törlése")}
                      >
                        <Trash2 size={17} />
                      </HoldToConfirmButton>
                    )}
                  </div>
                </div>

                {/* Body + attachments */}
                <div className="flex-1 min-h-0 flex flex-col gap-5 px-6 py-5">
                  {bodyObj ? (
                    renderMailFrame(bodyObj, t("Parsed mail content", "Spracovaný obsah pošty", "Feldolgozott levéltartalom"), "w-full flex-1 min-h-50 border-0 bg-transparent")
                  ) : (
                    <div className="flex-1 text-center text-slate-400 py-12 text-body font-semibold">
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
      </div>
      )}

      {renderDigestPopover()}

      {/* COMPOSERS OVERLAY DRAWER */}
      {composers.map(comp => (
        <div key={comp.id} className={`fixed bottom-0 right-10 w-96 bg-white border-t border-x border-slate-300 rounded-t-2xl shadow-2xl z-50 flex flex-col ${comp.isClosing ? "animate-slide-out-bottom" : "animate-slide-in-bottom"}`}>
          <div className="bg-slate-900 text-white p-3 rounded-t-2xl flex items-center justify-between">
            <span className="text-ui font-bold">{t("New Email", "Nový e-mail", "Új e-mail")}</span>
            <button
              onClick={() => closeComposer(comp.id)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          <div className="p-4 space-y-3 text-left">
            <div className="space-y-1">
              <label className="type-overline text-slate-400 block">{t("To Address", "Adresa príjemcu", "Címzett címe")}</label>
              <input
                type="email"
                value={comp.to}
                onChange={(e) => setComposers(prev => prev.map(c => c.id === comp.id ? { ...c, to: e.target.value } : c))}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-ui"
              />
            </div>
            <div className="space-y-1">
              <label className="type-overline text-slate-400 block">{t("Subject", "Predmet", "Tárgy")}</label>
              <input
                type="text"
                value={comp.subject}
                onChange={(e) => setComposers(prev => prev.map(c => c.id === comp.id ? { ...c, subject: e.target.value } : c))}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-ui font-bold"
              />
            </div>
            <div className="space-y-1">
              <label className="type-overline text-slate-400 block">{t("Message Body", "Telo správy", "Üzenet törzse")}</label>
              <textarea
                rows={6}
                value={comp.body}
                onChange={(e) => setComposers(prev => prev.map(c => c.id === comp.id ? { ...c, body: e.target.value } : c))}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-ui focus:bg-white resize-none"
              />
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => handleSendEmail(comp)}
                disabled={isSending}
                className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-ui font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow"
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
          
          <div className={`w-125 max-w-full bg-white h-full shadow-2xl flex flex-col relative ${isClosingTimeline ? "animate-slide-out-right" : "animate-slide-in-right"}`}>
            {/* Header */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
              <div className="text-left">
                <span className="type-overline text-pink-500">{t("CRM Detail Timeline", "Detailná časová os CRM", "Részletes CRM idővonal")}</span>
                <h3 className="text-body font-heading font-bold">{slideoutLead.name}</h3>
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
                  <span className="type-overline">{t("Loading correspondences...", "Načítavanie korešpondencie...", "Levelezés betöltése...")}</span>
                </div>
              )}
              {slideoutTimelineEvents.length === 0 ? (
                <div className="text-center text-slate-400 py-12 text-ui font-semibold">
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
                        <span className={`absolute -left-6.75 top-1 h-5.5 w-5.5 rounded-full border flex items-center justify-center shadow ${dotColor}`}>
                          {icon}
                        </span>
                        
                        <div className={`border p-3.5 rounded-2xl shadow-xs ${cardBorder}`}>
                           <div className="flex justify-between items-center border-b border-slate-200/50 pb-1 mb-1.5 flex-wrap gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="type-overline text-slate-900">{event.title}</span>
                              {event.type === "email" ? (
                                <>
                                  <span className="type-overline px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 flex items-center gap-1">
                                    {event.isOutgoing ? `📤 ${t("Outgoing", "Odchádzajúce", "Kimenő")}` : `📥 ${t("Incoming", "Prichádzajúce", "Bejövő")}`}
                                  </span>
                                  <span 
                                    className="inline-flex items-center gap-1 type-overline px-2.5 py-0.5 rounded-full border shadow-sm text-white"
                                    style={{ backgroundColor: pmColor, borderColor: pmColor }}
                                  >
                                    @ {pmName}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="type-overline px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700">
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
                            <span className="text-micro text-slate-400 font-extrabold">{formatTimestampLocalized(event.timestamp, systemLanguage)}</span>
                          </div>
                          <TimelineCollapsible
                            language={systemLanguage}
                            isExpanded={expandedTimelineEventIds.has(event.id)}
                            onToggle={() => toggleTimelineEventExpanded(event.id)}
                            fadeClassName="from-slate-50 via-slate-50/70"
                          >
                            <p className="text-micro text-slate-600 leading-[1.35] font-bold select-text whitespace-pre-wrap">
                              {event.content}
                            </p>
                          </TimelineCollapsible>
                          {event.amount && (
                            <span className="block mt-1 type-overline text-emerald-800">
                              {t("Worth:", "Hodnota:", "Érték:")} &euro; {event.amount.toLocaleString()}
                            </span>
                          )}
                          {event.extraTime && (
                            <span className="block mt-1 type-overline text-rose-800">
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
                <span className="type-overline text-pink-500">{t("CRM Client Registration", "Registrácia klienta CRM", "CRM ügyfél regisztráció")}</span>
                <h3 className="text-body font-heading font-bold">{t("Create New Client from Email", "Vytvoriť nového klienta z e-mailu", "Új ügyfél létrehozása e-mailből")}</h3>
              </div>
              <button
                onClick={closeClientSlideout}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleCreateClientSubmit} className="flex-1 flex flex-col justify-between text-ui font-bold text-slate-700 mt-6">
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="type-overline text-slate-500">{t("Client Name / Business Name", "Meno klienta / Názov firmy", "Ügyfél neve / Cégnév")}</label>
                    <input
                      type="text"
                      required
                      value={clientFormName}
                      onChange={(e) => setClientFormName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui focus:outline-none focus:bg-white font-semibold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="type-overline text-slate-500">{t("Email Address", "E-mailová adresa", "E-mail cím")}</label>
                    <input
                      type="email"
                      required
                      value={clientFormEmail}
                      onChange={(e) => setClientFormEmail(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui focus:outline-none focus:bg-white font-semibold"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-1.5">
                    <label className="type-overline text-slate-500">{t("Phone Number", "Telefónne číslo", "Telefonszám")}</label>
                    <input
                      type="tel"
                      value={clientFormPhone}
                      onChange={(e) => setClientFormPhone(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui focus:outline-none focus:bg-white font-semibold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="type-overline text-slate-500">{t("City", "Mesto", "Város")}</label>
                    <input
                      type="text"
                      required
                      value={clientFormCity}
                      onChange={(e) => setClientFormCity(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-ui focus:outline-none focus:bg-white font-semibold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="type-overline text-slate-500">{t("Client Type", "Typ klienta", "Ügyfél típusa")}</label>
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
                  className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-ui font-bold transition-all cursor-pointer"
                >
                  {t("Cancel", "Zrušiť", "Mégse")}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-ui font-bold transition-all shadow cursor-pointer"
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
