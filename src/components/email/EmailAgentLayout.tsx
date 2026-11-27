import { PROVIDERS, ProviderLogo } from "../CompanyMailboxSettings";
import { isMessagingConnector, isEmailConnector, type ConnectorType, type CompanyMailbox, type AgentSubagent, type AgentEventTrigger, type AgentChatMessage, type AgentConnectorState, type WhatsAppConnectorState } from "../../utils/companyMailboxes";
import { Zap, Bot, Plus, MessageCircle, Mail, Activity, Loader2, Play, Trash2, Sparkles, Terminal, Send, CheckCircle2, X, FileText, Clock } from "lucide-react";
import { Markdown } from "../../utils/markdown";
import React from "react";

interface EmailAgentLayoutProps {
  selectedChannelType: ConnectorType;
  selectedAccount: { id: string; name: string; address: string; connectorType: ConnectorType; isPersonal?: boolean; settings?: CompanyMailbox["settings"]; subagents?: AgentSubagent[]; triggers?: AgentEventTrigger[]; };
  activeChatSubagentId: string;
  agentChats: Record<string, AgentChatMessage[]>;
  agentStates: Record<string, AgentConnectorState>;
  availableAccounts: { id: string; name: string; address: string; connectorType: ConnectorType; isPersonal?: boolean; settings?: CompanyMailbox["settings"]; subagents?: AgentSubagent[]; triggers?: AgentEventTrigger[]; }[];
  selectedArtifactKey: string | null;
  visualTriggersOpen: boolean;
  t: (en: string, sk: string, hu: string) => string;
  setNewSubagentOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openNewTriggerModal: (opts?: { sourceType?: "whatsapp" | "email" | "crm_event"; sourceConnectorId?: string; targetSubagentId?: string; }) => void;
  setVisualTriggersOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openEditTriggerModal: (trig: AgentEventTrigger) => void;
  handleTestTrigger: (triggerId: string) => Promise<void>;
  isTestingTriggerId: string | null;
  handleToggleTriggerEnabled: (trig: AgentEventTrigger) => Promise<void>;
  handleDeleteTrigger: (triggerId: string) => Promise<void>;
  setActiveChatSubagentId: React.Dispatch<React.SetStateAction<string>>;
  handleCancelFollowup: (followupId: string) => Promise<void>;
  setSelectedMailboxId: React.Dispatch<React.SetStateAction<string>>;
  handleToggleSubagentHeartbeat: (sub: AgentSubagent, patch: { heartbeatEnabled?: boolean; heartbeatIntervalMinutes?: number; }) => Promise<void>;
  handleSelectArtifact: (key: string | null) => void;
  handleSendAgentMessage: (promptText?: string) => Promise<void>;
  isAgentRunning: boolean;
  handleClearAgentChat: () => Promise<void>;
  agentChatScrollRef: React.RefObject<HTMLDivElement | null>;
  currentUser: any;
  setWaSelectedLeadId: React.Dispatch<React.SetStateAction<string>>;
  agentPrompt: string;
  setAgentPrompt: React.Dispatch<React.SetStateAction<string>>;
  isMemoryDirty: boolean;
  artifactTitleDraft: string;
  handleRunTaskNow: (taskId?: string) => Promise<void>;
  handleUpdateAutonomousCron: (patch: { enabled?: boolean; intervalMinutes?: number; }) => Promise<void>;
  handleToggleTask: (task: { id: string; title: string; prompt: string; intervalMinutes: number; subagentId?: string | null; enabled: boolean; }) => Promise<void>;
  handleSaveSelectedArtifact: () => Promise<void>;
  isSavingMemory: boolean;
  canEdit: boolean;
  handleDeleteArtifact: (artId: string) => Promise<void>;
  handleDeleteSubagent: (subagentId: string) => Promise<void>;
  handleDeleteTask: (taskId: string) => Promise<void>;
  subPromptDraft: string;
  setSubPromptDraft: React.Dispatch<React.SetStateAction<string>>;
  setIsMemoryDirty: React.Dispatch<React.SetStateAction<boolean>>;
  memoryDraft: string;
  setMemoryDraft: React.Dispatch<React.SetStateAction<string>>;
  setNewArtifactOpen: React.Dispatch<React.SetStateAction<boolean>>;
  newArtifactOpen: boolean;
  newArtifactName: string;
  setNewArtifactName: React.Dispatch<React.SetStateAction<string>>;
  handleCreateArtifact: () => Promise<void>;
  newSubagentOpen: boolean;
  newSubName: string;
  setNewSubName: React.Dispatch<React.SetStateAction<string>>;
  newSubRole: string;
  setNewSubRole: React.Dispatch<React.SetStateAction<string>>;
  newSubPrompt: string;
  setNewSubPrompt: React.Dispatch<React.SetStateAction<string>>;
  handleCreateSubagent: () => Promise<void>;
  setNewTaskOpen: React.Dispatch<React.SetStateAction<boolean>>;
  newTaskOpen: boolean;
  newTaskTitle: string;
  setNewTaskTitle: React.Dispatch<React.SetStateAction<string>>;
  newTaskInterval: string;
  setNewTaskInterval: React.Dispatch<React.SetStateAction<string>>;
  newTaskPrompt: string;
  setNewTaskPrompt: React.Dispatch<React.SetStateAction<string>>;
  handleCreateTask: () => Promise<void>;
  triggerModalOpen: boolean;
  setTriggerModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerDraftId: string;
  triggerDraftName: string;
  setTriggerDraftName: React.Dispatch<React.SetStateAction<string>>;
  triggerDraftSourceType: "whatsapp" | "email" | "crm_event";
  triggerDraftSourceConnectorId: string;
  setTriggerDraftSourceConnectorId: React.Dispatch<React.SetStateAction<string>>;
  setTriggerDraftSourceType: React.Dispatch<React.SetStateAction<"whatsapp" | "email" | "crm_event">>;
  triggerDraftTargetSubagentId: string;
  setTriggerDraftTargetSubagentId: React.Dispatch<React.SetStateAction<string>>;
  waState: WhatsAppConnectorState | null;
  setTriggerDraftChatMatch: React.Dispatch<React.SetStateAction<string>>;
  triggerDraftChatMatch: string;
  triggerDraftKeywordContains: string;
  setTriggerDraftKeywordContains: React.Dispatch<React.SetStateAction<string>>;
  triggerDraftOnlyGroup: boolean;
  setTriggerDraftOnlyGroup: React.Dispatch<React.SetStateAction<boolean>>;
  setTriggerDraftOnlyDirect: React.Dispatch<React.SetStateAction<boolean>>;
  triggerDraftOnlyDirect: boolean;
  triggerDraftFromContains: string;
  setTriggerDraftFromContains: React.Dispatch<React.SetStateAction<string>>;
  triggerDraftSubjectContains: string;
  setTriggerDraftSubjectContains: React.Dispatch<React.SetStateAction<string>>;
  triggerDraftEventType: string;
  setTriggerDraftEventType: React.Dispatch<React.SetStateAction<string>>;
  triggerDraftInstructions: string;
  setTriggerDraftInstructions: React.Dispatch<React.SetStateAction<string>>;
  triggerDraftAutoReply: boolean;
  setTriggerDraftAutoReply: React.Dispatch<React.SetStateAction<boolean>>;
  triggerDraftProactiveEnabled: boolean;
  setTriggerDraftProactiveEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  triggerDraftProactiveAfterMinutes: number;
  setTriggerDraftProactiveAfterMinutes: React.Dispatch<React.SetStateAction<number>>;
  triggerDraftProactiveMaxAttempts: number;
  setTriggerDraftProactiveMaxAttempts: React.Dispatch<React.SetStateAction<number>>;
  triggerDraftProactiveInstructions: string;
  setTriggerDraftProactiveInstructions: React.Dispatch<React.SetStateAction<string>>;
  handleSaveTriggerDraft: () => Promise<void>;
}

export const EmailAgentLayout: React.FC<EmailAgentLayoutProps> = ({
  selectedChannelType, selectedAccount, activeChatSubagentId, agentChats, agentStates, availableAccounts,
  selectedArtifactKey, visualTriggersOpen, t, setNewSubagentOpen, openNewTriggerModal, setVisualTriggersOpen,
  openEditTriggerModal, handleTestTrigger, isTestingTriggerId, handleToggleTriggerEnabled,
  handleDeleteTrigger, setActiveChatSubagentId, handleCancelFollowup, setSelectedMailboxId,
  handleToggleSubagentHeartbeat, handleSelectArtifact, handleSendAgentMessage, isAgentRunning,
  handleClearAgentChat, agentChatScrollRef, currentUser, setWaSelectedLeadId, agentPrompt, setAgentPrompt,
  isMemoryDirty, artifactTitleDraft, handleRunTaskNow, handleUpdateAutonomousCron, handleToggleTask,
  handleSaveSelectedArtifact, isSavingMemory, canEdit, handleDeleteArtifact, handleDeleteSubagent,
  handleDeleteTask, subPromptDraft, setSubPromptDraft, setIsMemoryDirty, memoryDraft, setMemoryDraft,
  setNewArtifactOpen, newArtifactOpen, newArtifactName, setNewArtifactName, handleCreateArtifact,
  newSubagentOpen, newSubName, setNewSubName, newSubRole, setNewSubRole, newSubPrompt, setNewSubPrompt,
  handleCreateSubagent, setNewTaskOpen, newTaskOpen, newTaskTitle, setNewTaskTitle, newTaskInterval,
  setNewTaskInterval, newTaskPrompt, setNewTaskPrompt, handleCreateTask, triggerModalOpen,
  setTriggerModalOpen, triggerDraftId, triggerDraftName, setTriggerDraftName, triggerDraftSourceType,
  triggerDraftSourceConnectorId, setTriggerDraftSourceConnectorId, setTriggerDraftSourceType,
  triggerDraftTargetSubagentId, setTriggerDraftTargetSubagentId, waState, setTriggerDraftChatMatch,
  triggerDraftChatMatch, triggerDraftKeywordContains, setTriggerDraftKeywordContains, triggerDraftOnlyGroup,
  setTriggerDraftOnlyGroup, setTriggerDraftOnlyDirect, triggerDraftOnlyDirect, triggerDraftFromContains,
  setTriggerDraftFromContains, triggerDraftSubjectContains, setTriggerDraftSubjectContains,
  triggerDraftEventType, setTriggerDraftEventType, triggerDraftInstructions, setTriggerDraftInstructions,
  triggerDraftAutoReply, setTriggerDraftAutoReply, triggerDraftProactiveEnabled,
  setTriggerDraftProactiveEnabled, triggerDraftProactiveAfterMinutes, setTriggerDraftProactiveAfterMinutes,
  triggerDraftProactiveMaxAttempts, setTriggerDraftProactiveMaxAttempts, triggerDraftProactiveInstructions,
  setTriggerDraftProactiveInstructions, handleSaveTriggerDraft,
}) => {
  return (
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
                      className=" rounded-lg border border-amber-300/80 bg-white shadow-xs flex flex-col h-full max-h-full overflow-hidden"
                    >
                      {/* Studio Header */}
                      <div className="px-5 py-3.5 border-b border-amber-200/70 bg-gradient-to-r from-amber-500/10 via-indigo-500/5 to-emerald-500/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-9 h-9 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
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
                            <h3 className="text-title-sm font-heading font-bold text-gray-900 truncate mt-0.5">
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
                            className="px-3 py-1.5 rounded-md bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-micro font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Bot size={13} /> + {t("Create Agent", "Vytvoriť agenta", "Ügynök létrehozása")}
                          </button>
                          <button
                            type="button"
                            data-testid="new-visual-trigger-btn"
                            onClick={() => openNewTriggerModal()}
                            className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-micro font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            <Plus size={13} /> {t("New Trigger Wire", "Nové prepojenie", "Új indító kapcsolat")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setVisualTriggersOpen(false);
                            }}
                            className="px-3 py-1.5 rounded-md bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 text-micro font-bold cursor-pointer"
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
                                    className={`p-4 rounded-lg border transition-all grid grid-cols-1 ws-lg:grid-cols-12 gap-4 items-center ${
                                      trig.enabled
                                        ? "bg-white border-amber-300/80 shadow-xs"
                                        : "bg-gray-50/80 border-gray-200 opacity-75"
                                    }`}
                                  >
                                    {/* LEFT (4 cols): SOURCE CONNECTION */}
                                    <div
                                      onClick={() => openEditTriggerModal(trig)}
                                      className={`ws-lg:col-span-4 p-3.5 rounded-lg border text-left transition-all flex items-start gap-3 cursor-pointer ${
                                        trig.sourceType === "whatsapp"
                                          ? "bg-emerald-50/40 hover:bg-emerald-50/80 border-emerald-200/90"
                                          : trig.sourceType === "email"
                                            ? "bg-entity-subtle hover:bg-entity-subtle border-entity-border"
                                            : "bg-indigo-50/40 hover:bg-indigo-50/80 border-indigo-200/90"
                                      }`}
                                    >
                                      <span
                                        className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
                                          trig.sourceType === "whatsapp"
                                            ? "bg-emerald-500/15 text-emerald-700"
                                            : trig.sourceType === "email"
                                              ? "bg-entity-solid/15 text-entity-text"
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
                                          <span className="px-2 py-0.5 rounded-md bg-white/90 border border-gray-200 text-gray-700 text-micro font-mono truncate">
                                            {filterSummary}
                                          </span>
                                        </div>
                                        <div className="text-caption font-bold text-gray-900 truncate mt-1">
                                          {sourceAcc?.name ||
                                            (trig.sourceType === "whatsapp"
                                              ? "WhatsApp / Messaging"
                                              : trig.sourceType === "email"
                                                ? "Email Inbox"
                                                : t("Leads, Projects & Tickets", "Príležitosti, Projekty a Tikety", "Érdeklődők, Projektek és Jegyek"))}
                                        </div>
                                        {sourceAcc?.address && (
                                          <div className="text-micro text-gray-500 font-mono truncate">{sourceAcc.address}</div>
                                        )}
                                      </div>
                                    </div>

                                    {/* MIDDLE (4 cols): SQUIGGLY LINE & WIRE CONTROLS */}
                                    <div className="ws-lg:col-span-4 flex flex-col items-center justify-center gap-2 px-2">
                                      <div className="flex items-center flex-wrap justify-center gap-1.5 text-micro font-bold text-gray-700">
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
                                        <div className="text-micro text-gray-500 line-clamp-1 max-w-full px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-100">
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
                                          className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-micro font-bold cursor-pointer"
                                        >
                                          {t("Edit", "Upraviť", "Szerk.")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleToggleTriggerEnabled(trig)}
                                          className={`px-2.5 py-1 rounded-lg text-micro font-bold cursor-pointer ${
                                            trig.enabled
                                              ? "bg-emerald-600 text-white"
                                              : "bg-gray-200 text-gray-600"
                                          }`}
                                        >
                                          {trig.enabled ? t("On", "Zap.", "Be") : t("Off", "Vyp.", "Ki")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleDeleteTrigger(trig.id)}
                                          className="p-1 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
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
                                          <span className="text-micro text-gray-400 font-mono truncate">
                                            {trig.lastStatus || "ok"}
                                          </span>
                                        )}
                                      </div>

                                      <div
                                        onClick={() => {
                                          setActiveChatSubagentId(targetSub ? targetSub.id : "");
                                          setVisualTriggersOpen(false);
                                        }}
                                        className="p-3.5 rounded-lg border border-indigo-200/90 bg-indigo-50/30 hover:bg-indigo-50/70 transition-all flex items-center justify-between gap-3 cursor-pointer"
                                      >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <span
                                            className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
                                              targetSub
                                                ? "bg-amber-500/15 text-amber-700"
                                                : "bg-indigo-500/15 text-indigo-700"
                                            }`}
                                          >
                                            {targetSub ? <Bot size={18} /> : <Sparkles size={18} />}
                                          </span>
                                          <div className="min-w-0">
                                            <div className="text-caption font-bold text-gray-900 truncate">
                                              {targetSub
                                                ? `🤖 ${targetSub.name}`
                                                : `✦ ${selectedAccount?.name} (${t("Main Agent", "Hlavný agent", "Fő ügynök")})`}
                                            </div>
                                            <div className="text-micro text-gray-500 truncate">
                                              {targetSub ? targetSub.role : meta.label}
                                            </div>
                                          </div>
                                        </div>
                                        <span className="px-2.5 py-1 rounded-md bg-white border border-gray-200 text-gray-700 text-micro font-bold shrink-0">
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
                                    <span className="text-micro font-bold uppercase tracking-wider text-gray-400">
                                      {t(
                                        "Available Source Connections — Click to Wire to Agent",
                                        "Dostupné zdrojové spojenia — Kliknutím prepojte s agentom",
                                        "Elérhető forráskapcsolatok — Kattintson az ügynökhöz kötéshez",
                                      )}
                                    </span>
                                    <span className="text-micro text-gray-400">
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
                                        className="p-4 rounded-lg border border-dashed border-gray-200/90 bg-gray-50/50 hover:bg-white hover:border-amber-300/80 transition-all grid grid-cols-1 ws-lg:grid-cols-12 gap-4 items-center"
                                      >
                                        {/* LEFT (4 cols): SOURCE CONNECTION */}
                                        <div
                                          onClick={() =>
                                            openNewTriggerModal({
                                              sourceType: sType,
                                              sourceConnectorId: acc.id,
                                            })
                                          }
                                          className={`ws-lg:col-span-4 p-3.5 rounded-lg border text-left transition-all flex items-start gap-3 cursor-pointer ${
                                            isMsg
                                              ? "bg-emerald-50/30 hover:bg-emerald-50/70 border-emerald-200/70"
                                              : "bg-entity-subtle hover:bg-entity-subtle border-entity-border"
                                          }`}
                                        >
                                          <span
                                            className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${
                                              isMsg
                                                ? "bg-emerald-500/15 text-emerald-700"
                                                : "bg-entity-solid/15 text-entity-text"
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
                                              <span className="px-2 py-0.5 rounded-md bg-white/90 border border-gray-200 text-gray-500 text-micro font-mono">
                                                {t("Not wired yet", "Zatiaľ neprepojené", "Még nincs bekötve")}
                                              </span>
                                            </div>
                                            <div className="text-caption font-bold text-gray-900 truncate mt-1">
                                              {acc.name}
                                            </div>
                                            {acc.address && (
                                              <div className="text-micro text-gray-500 font-mono truncate">{acc.address}</div>
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
                                            className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-micro font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                                          >
                                            <Plus size={12} />
                                            {t("Connect to Agent", "Prepojiť s agentom", "Bekötés ügynökhöz")}
                                          </button>
                                        </div>

                                        {/* RIGHT (4 cols): TARGET AGENT PREVIEW */}
                                        <div className="ws-lg:col-span-4 flex flex-col">
                                          <div className="flex items-center justify-between px-1 mb-1.5">
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 text-micro font-semibold">
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
                                            className="p-3.5 rounded-lg border border-dashed border-indigo-200/80 bg-indigo-50/20 hover:bg-indigo-50/50 transition-all flex items-center justify-between gap-3 cursor-pointer"
                                          >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                              <span className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 bg-indigo-500/10 text-indigo-600">
                                                {defaultTargetSub ? <Bot size={18} /> : <Sparkles size={18} />}
                                              </span>
                                              <div className="min-w-0">
                                                <div className="text-caption font-bold text-gray-800 truncate">
                                                  {defaultTargetSub
                                                    ? `🤖 ${defaultTargetSub.name}`
                                                    : `✦ ${selectedAccount?.name} (${t("Main Agent", "Hlavný agent", "Fő ügynök")})`}
                                                </div>
                                                <div className="text-micro text-gray-500 truncate">
                                                  {defaultTargetSub ? defaultTargetSub.role : meta.label}
                                                </div>
                                              </div>
                                            </div>
                                            <span className="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-micro font-bold shrink-0">
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
                                      className="p-4 rounded-lg border border-dashed border-gray-200/90 bg-gray-50/50 hover:bg-white hover:border-amber-300/80 transition-all grid grid-cols-1 ws-lg:grid-cols-12 gap-4 items-center"
                                    >
                                      {/* LEFT (4 cols): CRM EVENT SOURCE */}
                                      <div
                                        onClick={() =>
                                          openNewTriggerModal({
                                            sourceType: "crm_event",
                                            sourceConnectorId: "",
                                          })
                                        }
                                        className="ws-lg:col-span-4 p-3.5 rounded-lg border bg-indigo-50/30 hover:bg-indigo-50/70 border-indigo-200/70 text-left transition-all flex items-start gap-3 cursor-pointer"
                                      >
                                        <span className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 bg-indigo-500/15 text-indigo-700">
                                          <Activity size={19} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="px-1.5 py-0.5 rounded text-micro font-bold uppercase bg-indigo-100 text-indigo-800">
                                              CRM EVENT
                                            </span>
                                            <span className="px-2 py-0.5 rounded-md bg-white/90 border border-gray-200 text-gray-500 text-micro font-mono">
                                              {t("Not wired yet", "Zatiaľ neprepojené", "Még nincs bekötve")}
                                            </span>
                                          </div>
                                          <div className="text-caption font-bold text-gray-900 truncate mt-1">
                                            {t("Leads, Projects & Tickets", "Príležitosti, Projekty a Tikety", "Érdeklődők, Projektek és Jegyek")}
                                          </div>
                                          <div className="text-micro text-gray-500 font-mono truncate">
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
                                          className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-micro font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                                        >
                                          <Plus size={12} />
                                          {t("Connect to Agent", "Prepojiť s agentom", "Bekötés ügynökhöz")}
                                        </button>
                                      </div>

                                      {/* RIGHT (4 cols): TARGET AGENT PREVIEW */}
                                      <div className="ws-lg:col-span-4 flex flex-col">
                                        <div className="flex items-center justify-between px-1 mb-1.5">
                                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 text-micro font-semibold">
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
                                          className="p-3.5 rounded-lg border border-dashed border-indigo-200/80 bg-indigo-50/20 hover:bg-indigo-50/50 transition-all flex items-center justify-between gap-3 cursor-pointer"
                                        >
                                          <div className="flex items-center gap-2.5 min-w-0">
                                            <span className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 bg-indigo-500/10 text-indigo-600">
                                              {defaultTargetSub ? <Bot size={18} /> : <Sparkles size={18} />}
                                            </span>
                                            <div className="min-w-0">
                                              <div className="text-caption font-bold text-gray-800 truncate">
                                                {defaultTargetSub
                                                  ? `🤖 ${defaultTargetSub.name}`
                                                  : `✦ ${selectedAccount?.name} (${t("Main Agent", "Hlavný agent", "Fő ügynök")})`}
                                              </div>
                                              <div className="text-micro text-gray-500 truncate">
                                                {defaultTargetSub ? defaultTargetSub.role : meta.label}
                                              </div>
                                            </div>
                                          </div>
                                          <span className="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-micro font-bold shrink-0">
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
                                        className="p-3 rounded-lg border border-indigo-200 bg-indigo-50/40 flex flex-wrap items-center justify-between gap-3"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2 text-caption font-bold text-gray-900">
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
                                          <div className="text-micro text-gray-600 truncate mt-0.5">
                                            {fu.instructions}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => void handleCancelFollowup(fu.id)}
                                          className="px-2.5 py-1 rounded-md bg-white hover:bg-rose-50 text-gray-600 hover:text-rose-700 border border-gray-200 text-micro font-bold cursor-pointer"
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
                    className=" rounded-lg border border-gray-200 bg-white shadow-xs flex flex-col h-full max-h-full overflow-hidden"
                  >
                    {/* 1. AGENT HEADER */}
                    <div className={`px-5 py-3.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0 ${meta.modalHeaderBg}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.iconBg}`}>
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
                                  : "bg-white/80 text-gray-600 border-gray-200 hover:bg-gray-100"
                              }`}
                            >
                              💓 {activeHeartbeatEnabled ? `${activeHeartbeatInterval}m` : t("Heartbeat Off ($0)", "Heartbeat Vyp. ($0)", "Heartbeat Ki ($0)")}
                            </button>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <h3 className="text-title-sm font-heading font-bold text-gray-900 truncate">
                              {activeSubagentObj ? `🤖 ${activeSubagentObj.name}` : selectedAccount?.name}
                            </h3>
                            <select
                              value={activeChatSubagentId}
                              onChange={(e) => setActiveChatSubagentId(e.target.value)}
                              aria-label={t("Active agent or subagent", "Aktívny agent alebo subagent", "Aktív ügynök vagy alügynök")}
                              className="px-2 py-0.5 rounded-lg bg-white/90 border border-gray-200 text-micro font-bold text-gray-700 cursor-pointer"
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
                            className="px-2.5 py-1 rounded-md bg-white/90 hover:bg-white border border-gray-200 text-micro font-semibold text-gray-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-40"
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
                            className="px-2 py-1 rounded-md bg-white/80 hover:bg-rose-50 border border-gray-200 hover:border-rose-200 text-micro font-semibold text-gray-600 hover:text-rose-700 transition-colors cursor-pointer"
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
                        <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto gap-2.5 text-gray-500 py-4">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${meta.iconBg}`}>
                            <Bot size={22} />
                          </div>
                          <div className="text-title-sm font-bold text-gray-800">
                            {selectedAccount?.name} · {t("Autonomous CCRM MCP Agent", "Autonómny CCRM MCP Agent", "Autonóm CCRM MCP Ügynök")}
                          </div>
                          <p className="text-caption text-gray-500">
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
                              className={`max-w-xl p-3.5 rounded-lg space-y-1.5 ${
                                msg.role === "user"
                                  ? `${meta.accentBtn} shadow-xs`
                                  : "bg-gray-100 text-gray-800 border border-gray-200"
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
                                                : "bg-white text-gray-700 border-gray-200"
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
                        <div className="flex items-center gap-2 text-caption text-gray-500 font-semibold">
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
                    <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2 shrink-0 bg-white">
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
                        className="flex-1 px-3.5 py-2.5 rounded-md bg-gray-50 border border-gray-200 text-body text-gray-800 focus:outline-none focus:bg-white focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSendAgentMessage()}
                        disabled={!agentPrompt.trim() || isAgentRunning}
                        className={`px-4 py-2.5 rounded-md text-body font-bold flex items-center gap-2 disabled:opacity-40 cursor-pointer ${meta.accentBtn}`}
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
                      className=" rounded-lg border border-violet-200/80 bg-white shadow-xs flex flex-col h-full max-h-full overflow-hidden"
                    >
                      {/* Editor Header */}
                      <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
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
                          <div className="text-title-sm font-heading font-bold text-gray-900 truncate mt-0.5">
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
                                className="px-2.5 py-1.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-micro font-bold cursor-pointer disabled:opacity-40"
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
                                className="px-2 py-1.5 rounded-md bg-white border border-gray-200 text-micro font-bold text-gray-700 cursor-pointer"
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
                                className={`px-2.5 py-1.5 rounded-md text-micro font-bold cursor-pointer ${
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
                              className="px-2.5 py-1.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 text-micro font-bold cursor-pointer"
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
                                className="px-2.5 py-1.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-micro font-bold cursor-pointer disabled:opacity-40"
                              >
                                ▶ {t("Run now", "Spustiť", "Futtatás")}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleTask(selectedTaskObj)}
                                className={`px-2.5 py-1.5 rounded-md text-micro font-bold cursor-pointer ${
                                  selectedTaskObj.enabled
                                    ? "bg-gray-100 text-gray-700"
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
                            className={`px-3 py-1.5 rounded-md text-micro font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 ${
                              isMemoryDirty
                                ? "bg-violet-600 hover:bg-violet-500 text-white shadow-2xs"
                                : "bg-white hover:bg-gray-100 text-gray-700 border border-gray-200"
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
                              className="p-1.5 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          {selectedSubObj && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteSubagent(selectedSubObj.id)}
                              title={t("Delete subagent", "Odstrániť subagenta", "Alügynök törlése")}
                              className="p-1.5 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          {selectedTaskObj && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteTask(selectedTaskObj.id)}
                              title={t("Delete task", "Odstrániť úlohu", "Feladat törlése")}
                              className="p-1.5 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleSelectArtifact(null)}
                            data-testid="close-artifact-editor-btn"
                            title={t("Close editor", "Zavrieť editor", "Szerkesztő bezárása")}
                            className="p-1.5 rounded-md text-gray-400 hover:text-gray-800 hover:bg-gray-200/60 cursor-pointer"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>

                      {/* Optional Autonomous Cron Info Banner */}
                      {selectedArtifactKey === "cron:main" && (
                        <div className="px-5 py-2.5 border-b border-gray-100 bg-emerald-50/50 space-y-1 shrink-0">
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
                        <div className="px-5 py-2.5 border-b border-gray-100 bg-amber-50/40 space-y-1 shrink-0">
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
                            className="w-full px-3 py-1.5 rounded-md bg-white border border-amber-200 text-caption text-gray-800 focus:outline-none focus:border-amber-500"
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
                          className="w-full flex-1 p-3.5 rounded-lg bg-gray-50/70 focus:bg-white border border-gray-200 font-mono text-caption text-gray-800 focus:outline-none focus:border-violet-500 resize-none leading-relaxed overflow-y-auto"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT SIDEBAR: MEMORY & ARTIFACTS */}
                <div
                  data-testid="agent-artifacts-sidebar"
                  className="w-full ws-lg:w-64 shrink-0  rounded-lg border border-gray-200 bg-white shadow-xs flex flex-col h-full max-h-full overflow-hidden"
                >
                  <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <FileText size={14} className="text-violet-600" />
                      <span className="text-caption font-bold text-gray-900">
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
                      <div className="p-2.5 rounded-lg bg-violet-50/60 border border-violet-200 space-y-2">
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
                          className="w-full px-2.5 py-1.5 rounded-md bg-white border border-gray-200 text-caption"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setNewArtifactOpen(false)}
                            className="px-2 py-0.5 rounded-lg text-micro font-semibold text-gray-500 cursor-pointer"
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
                      <div className="px-1 text-micro font-bold uppercase tracking-wider text-gray-400">
                        {t("Files & Memory", "Súbory a pamäť", "Fájlok és memória")}
                      </div>

                      {/* Primary memory.md */}
                      <button
                        type="button"
                        data-testid="sidebar-artifact-memory-main"
                        onClick={() => handleSelectArtifact("memory:main")}
                        className={`w-full px-3 py-2 rounded-lg text-left flex items-center gap-2.5 transition-all cursor-pointer border ${
                          selectedArtifactKey === "memory:main"
                            ? "bg-violet-50/90 border-violet-300 text-violet-950 shadow-2xs"
                            : "bg-white hover:bg-gray-50 border-gray-100 text-gray-700"
                        }`}
                      >
                        <span className="w-7 h-7 rounded-md bg-violet-500/15 text-violet-700 flex items-center justify-center shrink-0">
                          <FileText size={14} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-caption font-bold truncate">memory.md</div>
                          <div className="text-micro text-gray-400 truncate">
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
                            className={`w-full px-3 py-2 rounded-lg text-left flex items-center gap-2.5 transition-all cursor-pointer border ${
                              active
                                ? "bg-indigo-50/90 border-indigo-300 text-indigo-950 shadow-2xs"
                                : "bg-white hover:bg-gray-50 border-gray-100 text-gray-700"
                            }`}
                          >
                            <span className="w-7 h-7 rounded-md bg-indigo-500/15 text-indigo-700 flex items-center justify-center shrink-0">
                              <FileText size={14} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-caption font-bold truncate">{art.name}</div>
                              <div className="text-micro text-gray-400 truncate">{art.title}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Section 2: Subagents */}
                    <div className="space-y-1.5 pt-2 border-t border-gray-100">
                      <div className="px-1 flex items-center justify-between">
                        <span className="text-micro font-bold uppercase tracking-wider text-gray-400">
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
                        <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200 space-y-1.5">
                          <input
                            type="text"
                            value={newSubName}
                            onChange={(e) => setNewSubName(e.target.value)}
                            placeholder={t("Name (e.g. Lead Qualifier)", "Názov", "Név")}
                            className="w-full px-2.5 py-1 rounded-md bg-white border border-gray-200 text-caption"
                          />
                          <input
                            type="text"
                            value={newSubRole}
                            onChange={(e) => setNewSubRole(e.target.value)}
                            placeholder={t("Role / Specialty", "Rola", "Szerepkör")}
                            className="w-full px-2.5 py-1 rounded-md bg-white border border-gray-200 text-caption"
                          />
                          <input
                            type="text"
                            value={newSubPrompt}
                            onChange={(e) => setNewSubPrompt(e.target.value)}
                            placeholder={t("System prompt...", "Systémový pokyn...", "Rendszerutasítás...")}
                            className="w-full px-2.5 py-1 rounded-md bg-white border border-gray-200 text-caption"
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setNewSubagentOpen(false)}
                              className="px-2 py-0.5 rounded-lg text-micro font-semibold text-gray-500 cursor-pointer"
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
                        <div className="px-2 py-2 text-micro text-gray-400">
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
                              className={`w-full px-3 py-2 rounded-lg text-left flex items-center gap-2.5 transition-all cursor-pointer border ${
                                active
                                  ? "bg-amber-50/90 border-amber-300 text-amber-950 shadow-2xs"
                                  : "bg-white hover:bg-gray-50 border-gray-100 text-gray-700"
                              }`}
                            >
                              <span className="w-7 h-7 rounded-md bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0">
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
                    <div className="space-y-1.5 pt-2 border-t border-gray-100">
                      <div className="px-1 flex items-center justify-between">
                        <span className="text-micro font-bold uppercase tracking-wider text-gray-400">
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
                          className="w-full px-3 py-2 rounded-lg border border-dashed border-violet-200 bg-violet-50/30 hover:bg-violet-50/70 text-left text-micro text-violet-700 font-semibold cursor-pointer transition-all"
                        >
                          ⚡ {t("Connect WhatsApp, Email or CRM event ($0 idle cost)", "Prepojiť WhatsApp, e-mail alebo CRM udalosť ($0 nečinné náklady)", "WhatsApp, e-mail vagy CRM esemény bekötése ($0 üresjárati költség)")}
                        </button>
                      ) : (
                        (st?.triggers || []).map((tr) => (
                          <button
                            key={tr.id}
                            type="button"
                            onClick={() => openEditTriggerModal(tr)}
                            className={`w-full px-3 py-2 rounded-lg text-left flex items-center gap-2.5 transition-all cursor-pointer border ${
                              tr.enabled
                                ? "bg-violet-50/70 hover:bg-violet-50 border-violet-200 text-gray-800"
                                : "bg-gray-50 border-gray-100 text-gray-400"
                            }`}
                          >
                            <span className="w-7 h-7 rounded-md bg-violet-500/15 text-violet-700 flex items-center justify-center shrink-0">
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
                    <div className="space-y-1.5 pt-2 border-t border-gray-100">
                      <div className="px-1 flex items-center justify-between">
                        <span className="text-micro font-bold uppercase tracking-wider text-gray-400">
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
                        className={`w-full px-3 py-2 rounded-lg text-left flex items-center gap-2.5 transition-all cursor-pointer border ${
                          selectedArtifactKey === "cron:main"
                            ? "bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-2xs"
                            : "bg-white hover:bg-gray-50 border-gray-100 text-gray-700"
                        }`}
                      >
                        <span className="w-7 h-7 rounded-md bg-emerald-500/15 text-emerald-700 flex items-center justify-center shrink-0">
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
                        <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200 space-y-1.5">
                          <input
                            type="text"
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            placeholder={t("Task title", "Názov úlohy", "Feladat címe")}
                            className="w-full px-2.5 py-1 rounded-md bg-white border border-gray-200 text-caption"
                          />
                          <input
                            type="number"
                            min={1}
                            value={newTaskInterval}
                            onChange={(e) => setNewTaskInterval(e.target.value)}
                            placeholder={t("Interval (min)", "Interval (min)", "Időköz (perc)")}
                            className="w-full px-2.5 py-1 rounded-md bg-white border border-gray-200 text-caption"
                          />
                          <input
                            type="text"
                            value={newTaskPrompt}
                            onChange={(e) => setNewTaskPrompt(e.target.value)}
                            placeholder={t("Instruction prompt...", "Pokyn...", "Utasítás...")}
                            className="w-full px-2.5 py-1 rounded-md bg-white border border-gray-200 text-caption"
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setNewTaskOpen(false)}
                              className="px-2 py-0.5 rounded-lg text-micro font-semibold text-gray-500 cursor-pointer"
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
                        <div className="px-2 py-2 text-micro text-gray-400">
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
                              className={`w-full px-3 py-2 rounded-lg text-left flex items-center gap-2.5 transition-all cursor-pointer border ${
                                active
                                  ? "bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-2xs"
                                  : "bg-white hover:bg-gray-50 border-gray-100 text-gray-700"
                              }`}
                            >
                              <span className="w-7 h-7 rounded-md bg-emerald-500/15 text-emerald-700 flex items-center justify-center shrink-0">
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
                    className="fixed inset-0 z-50 bg-gray-900/45  flex items-center justify-center p-4"
                    onClick={() => setTriggerModalOpen(false)}
                  >
                    <div
                      className="w-full max-w-xl rounded-lg bg-white border border-gray-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-violet-50/80 via-indigo-50/50 to-white flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-9 h-9 rounded-lg bg-violet-600 text-white flex items-center justify-center shadow-xs">
                            <Zap size={17} />
                          </span>
                          <div>
                            <div className="text-title-sm font-heading font-bold text-gray-900">
                              {triggerDraftId
                                ? t("Edit Reactive Event Trigger", "Upraviť reaktívny spúšťač", "Reaktív trigger szerkesztése")
                                : t("New Reactive Event Trigger", "Nový reaktívny spúšťač", "Új reaktív esemény trigger")}
                            </div>
                            <div className="text-micro text-gray-500">
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
                          className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="p-6 overflow-y-auto space-y-4">
                        {/* Trigger Name */}
                        <div>
                          <label className="block text-micro font-bold uppercase tracking-wider text-gray-500 mb-1">
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
                            className="w-full px-3.5 py-2 rounded-md bg-gray-50 focus:bg-white border border-gray-200 text-body text-gray-800 focus:outline-none focus:border-violet-500"
                          />
                        </div>

                        {/* Source Connection & Target Agent */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-micro font-bold uppercase tracking-wider text-gray-500 mb-1">
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
                              className="w-full px-3 py-2 rounded-md bg-gray-50 border border-gray-200 text-body font-semibold text-gray-800"
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
                            <label className="block text-micro font-bold uppercase tracking-wider text-gray-500 mb-1">
                              2. {t("Target Agent", "Cieľový agent", "Cél ügynök")}
                            </label>
                            <select
                              data-testid="trigger-target-agent-select"
                              value={triggerDraftTargetSubagentId}
                              onChange={(e) => setTriggerDraftTargetSubagentId(e.target.value)}
                              className="w-full px-3 py-2 rounded-md bg-violet-50/70 border border-violet-200 text-body font-bold text-violet-950"
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
                          <div className="p-3.5 rounded-lg bg-emerald-50/50 border border-emerald-200/80 space-y-3">
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
                                        className="w-full px-3 py-1.5 rounded-md bg-white border border-emerald-200 text-caption text-gray-800"
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
                                  className="w-full px-3 py-1.5 rounded-md bg-white border border-emerald-200 text-caption text-gray-800"
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
                                  className="w-full px-3 py-1.5 rounded-md bg-white border border-emerald-200 text-caption text-gray-800"
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
                          <div className="p-3.5 rounded-lg bg-sky-50/60 border border-sky-200/80 space-y-2.5">
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
                                  className="w-full px-3 py-1.5 rounded-md bg-white border border-sky-200 text-caption text-gray-800"
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
                                  className="w-full px-3 py-1.5 rounded-md bg-white border border-sky-200 text-caption text-gray-800"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {triggerDraftSourceType === "crm_event" && (
                          <div className="p-3.5 rounded-lg bg-amber-50/60 border border-amber-200/80 space-y-2">
                            <label className="block text-micro font-bold uppercase tracking-wider text-amber-800">
                              🔔 {t("CRM Event Type", "Typ CRM udalosti", "CRM esemény típusa")}
                            </label>
                            <select
                              value={triggerDraftEventType}
                              onChange={(e) => setTriggerDraftEventType(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-md bg-white border border-amber-200 text-caption font-semibold text-gray-800"
                            >
                              <option value="lead_created">✨ New Lead Created (lead_created)</option>
                              <option value="project_created">🚀 New Project Created (project_created)</option>
                              <option value="ticket_created">🎫 New Support Ticket Created (ticket_created)</option>
                              <option value="task_created">✅ New Task Created (task_created)</option>
                            </select>
                          </div>
                        )}

                        {/* Full Conversation Context Window Badge */}
                        <div className="px-3.5 py-2.5 rounded-lg bg-indigo-50/70 border border-indigo-200/80 flex items-center justify-between gap-2 text-micro text-indigo-950">
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
                          <label className="block text-micro font-bold uppercase tracking-wider text-gray-500 mb-1">
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
                            className="w-full p-3 rounded-lg bg-gray-50 focus:bg-white border border-gray-200 text-caption text-gray-800 focus:outline-none focus:border-violet-500"
                          />
                        </div>

                        {/* Auto-Reply Toggle */}
                        <label className="flex items-center justify-between gap-3 p-3 rounded-lg bg-violet-50/50 border border-violet-200/70 cursor-pointer">
                          <div>
                            <div className="text-caption font-bold text-gray-900">
                              {t(
                                "Authorize Automatic Reply Tools (send_whatsapp_message / send_email_reply)",
                                "Povoliť nástroje automatickej odpovede",
                                "Automatikus válasz eszközök engedélyezése (send_whatsapp_message / send_email_reply)",
                              )}
                            </div>
                            <div className="text-micro text-gray-500">
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
                          <div className="p-3.5 rounded-lg bg-indigo-50/60 border border-indigo-200/80 space-y-3">
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
                                <div className="text-micro text-gray-600">
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
                                      className="w-full px-3 py-1.5 rounded-md bg-white border border-indigo-200 text-caption font-semibold text-gray-800"
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
                                      className="w-full px-3 py-1.5 rounded-md bg-white border border-indigo-200 text-caption font-semibold text-gray-800"
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
                                    className="w-full p-2.5 rounded-md bg-white border border-indigo-200 text-caption text-gray-800 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="px-6 py-3.5 border-t border-gray-100 bg-gray-50/80 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setTriggerModalOpen(false)}
                          className="px-4 py-2 rounded-md text-caption font-semibold text-gray-600 hover:bg-gray-200/60 cursor-pointer"
                        >
                          {t("Cancel", "Zrušiť", "Mégse")}
                        </button>
                        <button
                          type="button"
                          data-testid="save-agent-trigger-btn"
                          onClick={() => void handleSaveTriggerDraft()}
                          className="px-5 py-2 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-caption font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
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
  );
};
