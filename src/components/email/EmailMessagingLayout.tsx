import { type WhatsAppChatSummary, isAgentConnector, type AgentEventTrigger, type WhatsAppConnectorState, type ConnectorType, type CompanyMailbox, type AgentSubagent, type AgentConnectorState } from "../../utils/companyMailboxes";
import { PROVIDERS, ProviderLogo } from "../CompanyMailboxSettings";
import { RefreshCw, QrCode, Search, Users, Loader2, Bot, UserPlus, Send } from "lucide-react";
import type { Lead } from "../../types";
import React from "react";

interface EmailMessagingLayoutProps {
  waState: WhatsAppConnectorState | null;
  selectedChannelType: ConnectorType;
  leads: Lead[];
  waFilterType: "all" | "groups" | "contacts";
  waSearchQuery: string;
  waSelectedLeadId: string;
  selectedAccount: { id: string; name: string; address: string; connectorType: ConnectorType; isPersonal?: boolean; settings?: CompanyMailbox["settings"]; subagents?: AgentSubagent[]; triggers?: AgentEventTrigger[]; };
  chatClientLinks: Record<string, string>;
  availableAccounts: { id: string; name: string; address: string; connectorType: ConnectorType; isPersonal?: boolean; settings?: CompanyMailbox["settings"]; subagents?: AgentSubagent[]; triggers?: AgentEventTrigger[]; }[];
  agentStates: Record<string, AgentConnectorState>;
  t: (en: string, sk: string, hu: string) => string;
  handleResyncWhatsApp: (chatId?: string) => Promise<void>;
  waLoading: boolean;
  handleStartInlineWaQr: () => Promise<void>;
  waInlineQrOpen: boolean;
  setWaInlineQrOpen: React.Dispatch<React.SetStateAction<boolean>>;
  waInlineQrUrl: string | null;
  setWaSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setWaFilterType: React.Dispatch<React.SetStateAction<"all" | "groups" | "contacts">>;
  setWaSelectedLeadId: React.Dispatch<React.SetStateAction<string>>;
  initialsOf: (name: string) => string;
  formatListDate: (value: string) => string;
  emptyPane: (text: string) => React.JSX.Element;
  waTakeoverBusyChatId: string | null;
  handleToggleWaChatAgentTakeover: (chat: WhatsAppChatSummary, nextMode: "active" | "paused" | "auto", preferredAgentId?: string, preferredSubagentId?: string | null) => Promise<void>;
  canEdit: boolean;
  setPendingChatLinkKey: React.Dispatch<React.SetStateAction<string>>;
  setClientFormName: React.Dispatch<React.SetStateAction<string>>;
  setClientFormPhone: React.Dispatch<React.SetStateAction<string>>;
  setClientFormEmail: React.Dispatch<React.SetStateAction<string>>;
  setClientFormCity: React.Dispatch<React.SetStateAction<string>>;
  setClientFormType: React.Dispatch<React.SetStateAction<"person" | "business" | "partner">>;
  setIsClientSlideoutOpen: React.Dispatch<React.SetStateAction<boolean>>;
  saveChatClientLink: (chatKey: string, leadId: string) => void;
  renderCrmActions: (lead: Lead | null, contact: { name: string; address: string; }) => React.JSX.Element | null;
  renderInlineAiSummaryBanner: (rawKey: string | number, lead: Lead | null, onRefresh?: () => void) => React.JSX.Element;
  fetchSummary: (emailUid: string, folder: string, subject: string, body: string, isThread?: boolean, force?: boolean) => Promise<void>;
  summaries: Record<string, string>;
  waMessagesScrollRef: React.RefObject<HTMLDivElement | null>;
  currentUser: any;
  waDraftMessage: string;
  setWaDraftMessage: React.Dispatch<React.SetStateAction<string>>;
  handleSendWhatsAppMessage: (targetChat: WhatsAppChatSummary, matchedLead: Lead | null) => Promise<void>;
  waSending: boolean;
}

export const EmailMessagingLayout: React.FC<EmailMessagingLayoutProps> = ({
  waState, selectedChannelType, leads, waFilterType, waSearchQuery, waSelectedLeadId, selectedAccount,
  chatClientLinks, availableAccounts, agentStates, t, handleResyncWhatsApp, waLoading, handleStartInlineWaQr,
  waInlineQrOpen, setWaInlineQrOpen, waInlineQrUrl, setWaSearchQuery, setWaFilterType, setWaSelectedLeadId,
  initialsOf, formatListDate, emptyPane, waTakeoverBusyChatId, handleToggleWaChatAgentTakeover, canEdit,
  setPendingChatLinkKey, setClientFormName, setClientFormPhone, setClientFormEmail, setClientFormCity,
  setClientFormType, setIsClientSlideoutOpen, saveChatClientLink, renderCrmActions,
  renderInlineAiSummaryBanner, fetchSummary, summaries, waMessagesScrollRef, currentUser, waDraftMessage,
  setWaDraftMessage, handleSendWhatsAppMessage, waSending,
}) => {
  return (
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
            const activeChatLinkKey =
              activeChat && selectedAccount ? `${selectedAccount.id}::${activeChat.id}` : "";
            const explicitLeadId = activeChatLinkKey ? chatClientLinks[activeChatLinkKey] : "";
            const matchedLead = activeChat
              ? ((explicitLeadId ? leads.find((l) => l.id === explicitLeadId) : null) ??
                leads.find((l) => {
                  const lDigits = (l.phone || "").replace(/\D/g, "");
                  if (activeDigits && lDigits && activeDigits === lDigits) return true;
                  return (l.name || "").toLowerCase() === (activeChat.name || "").toLowerCase();
                }) ??
                null)
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
                  isManualSessionActive: false,
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

              const effectiveAgentAcc =
                (sessionOverride?.agentConnectorId
                  ? aiAccounts.find((a) => a.id === sessionOverride.agentConnectorId)
                  : null) ?? matchedAgentAcc;
              const targetSubId =
                sessionOverride?.mode === "active"
                  ? (sessionOverride.subagentId ?? null)
                  : (matchedTrig?.targetSubagentId ?? null);
              const targetSub =
                targetSubId && effectiveAgentAcc
                  ? (agentStates[effectiveAgentAcc.id]?.subagents ?? effectiveAgentAcc.subagents ?? []).find(
                      (s) => s.id === targetSubId,
                    )
                  : null;
              const agentName = targetSub
                ? targetSub.name
                : effectiveAgentAcc?.name || t("AI Agent", "AI Agent", "AI Ügynök");

                              return {
                                isAgentActive,
                                isAutoTakenOver,
                                isPausedForSession,
                                isManualSessionActive: sessionOverride?.mode === "active",
                                agentName,
                                agentConnectorId: effectiveAgentAcc?.id || "",
                                subagentId: targetSubId,
                              };
            };

            const activeChatTakeover = getChatTakeoverInfo(activeChat);
            const adapterMeta = PROVIDERS[selectedChannelType] ?? PROVIDERS.whatsapp;
            const channelDisplayName = selectedAccount?.name || adapterMeta.label || "WhatsApp";
            const adapterLabel = adapterMeta.label || "WhatsApp";

            const adapterPalette = (() => {
              switch (selectedChannelType) {
                case "messenger":
                  return {
                    panelBorder: "border-blue-500/30",
                    headerGrad: "border-blue-500/20 bg-gradient-to-r from-blue-600/12 to-transparent",
                    liveDot: "bg-blue-600",
                    liveText: "text-blue-700",
                    softBtn: "bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200",
                    pillActive: "bg-blue-600 text-white",
                    pillInactiveHover: "hover:bg-blue-50",
                    activeRowBg: "bg-blue-50/85",
                    avatarBg: "bg-blue-600/15 text-blue-700",
                    groupAvatarBg: "bg-indigo-500/15 text-indigo-700",
                    groupBadge: "bg-indigo-50 text-indigo-700 border-indigo-200",
                    bubbleOut: "bg-blue-600 text-white",
                    bubbleOutMeta: "text-blue-100",
                    canvasTint: "bg-blue-500/[0.02]",
                    inputFocus: "focus:border-blue-500",
                    sendBtn: "bg-blue-600 hover:bg-blue-500 text-white",
                  };
                case "telegram":
                  return {
                    panelBorder: "border-sky-500/30",
                    headerGrad: "border-sky-500/20 bg-gradient-to-r from-sky-500/12 to-transparent",
                    liveDot: "bg-sky-500",
                    liveText: "text-sky-700",
                    softBtn: "bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-200",
                    pillActive: "bg-sky-600 text-white",
                    pillInactiveHover: "hover:bg-sky-50",
                    activeRowBg: "bg-sky-50/85",
                    avatarBg: "bg-sky-500/15 text-sky-700",
                    groupAvatarBg: "bg-cyan-500/15 text-cyan-700",
                    groupBadge: "bg-cyan-50 text-cyan-700 border-cyan-200",
                    bubbleOut: "bg-sky-600 text-white",
                    bubbleOutMeta: "text-sky-100",
                    canvasTint: "bg-sky-500/[0.02]",
                    inputFocus: "focus:border-sky-500",
                    sendBtn: "bg-sky-600 hover:bg-sky-500 text-white",
                  };
                case "viber":
                  return {
                    panelBorder: "border-purple-500/30",
                    headerGrad: "border-purple-500/20 bg-gradient-to-r from-purple-600/12 to-transparent",
                    liveDot: "bg-purple-600",
                    liveText: "text-purple-700",
                    softBtn: "bg-purple-50 hover:bg-purple-100 text-purple-800 border-purple-200",
                    pillActive: "bg-purple-600 text-white",
                    pillInactiveHover: "hover:bg-purple-50",
                    activeRowBg: "bg-purple-50/85",
                    avatarBg: "bg-purple-600/15 text-purple-700",
                    groupAvatarBg: "bg-fuchsia-500/15 text-fuchsia-700",
                    groupBadge: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
                    bubbleOut: "bg-purple-600 text-white",
                    bubbleOutMeta: "text-purple-100",
                    canvasTint: "bg-purple-500/[0.02]",
                    inputFocus: "focus:border-purple-500",
                    sendBtn: "bg-purple-600 hover:bg-purple-500 text-white",
                  };
                case "slack":
                  return {
                    panelBorder: "border-fuchsia-500/30",
                    headerGrad: "border-fuchsia-500/20 bg-gradient-to-r from-fuchsia-600/12 to-transparent",
                    liveDot: "bg-fuchsia-600",
                    liveText: "text-fuchsia-700",
                    softBtn: "bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
                    pillActive: "bg-fuchsia-600 text-white",
                    pillInactiveHover: "hover:bg-fuchsia-50",
                    activeRowBg: "bg-fuchsia-50/85",
                    avatarBg: "bg-fuchsia-600/15 text-fuchsia-700",
                    groupAvatarBg: "bg-purple-500/15 text-purple-700",
                    groupBadge: "bg-purple-50 text-purple-700 border-purple-200",
                    bubbleOut: "bg-fuchsia-600 text-white",
                    bubbleOutMeta: "text-fuchsia-100",
                    canvasTint: "bg-fuchsia-500/[0.02]",
                    inputFocus: "focus:border-fuchsia-500",
                    sendBtn: "bg-fuchsia-600 hover:bg-fuchsia-500 text-white",
                  };
                case "discord":
                  return {
                    panelBorder: "border-indigo-500/30",
                    headerGrad: "border-indigo-500/20 bg-gradient-to-r from-indigo-500/12 to-transparent",
                    liveDot: "bg-indigo-600",
                    liveText: "text-indigo-700",
                    softBtn: "bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200",
                    pillActive: "bg-indigo-600 text-white",
                    pillInactiveHover: "hover:bg-indigo-50",
                    activeRowBg: "bg-indigo-50/85",
                    avatarBg: "bg-indigo-500/15 text-indigo-700",
                    groupAvatarBg: "bg-violet-500/15 text-violet-700",
                    groupBadge: "bg-violet-50 text-violet-700 border-violet-200",
                    bubbleOut: "bg-indigo-600 text-white",
                    bubbleOutMeta: "text-indigo-100",
                    canvasTint: "bg-indigo-500/[0.02]",
                    inputFocus: "focus:border-indigo-500",
                    sendBtn: "bg-indigo-600 hover:bg-indigo-500 text-white",
                  };
                case "teams":
                  return {
                    panelBorder: "border-violet-500/30",
                    headerGrad: "border-violet-500/20 bg-gradient-to-r from-violet-600/12 to-transparent",
                    liveDot: "bg-violet-600",
                    liveText: "text-violet-700",
                    softBtn: "bg-violet-50 hover:bg-violet-100 text-violet-800 border-violet-200",
                    pillActive: "bg-violet-600 text-white",
                    pillInactiveHover: "hover:bg-violet-50",
                    activeRowBg: "bg-violet-50/85",
                    avatarBg: "bg-violet-600/15 text-violet-700",
                    groupAvatarBg: "bg-indigo-500/15 text-indigo-700",
                    groupBadge: "bg-indigo-50 text-indigo-700 border-indigo-200",
                    bubbleOut: "bg-violet-600 text-white",
                    bubbleOutMeta: "text-violet-100",
                    canvasTint: "bg-violet-500/[0.02]",
                    inputFocus: "focus:border-violet-500",
                    sendBtn: "bg-violet-600 hover:bg-violet-500 text-white",
                  };
                case "twilio":
                  return {
                    panelBorder: "border-red-500/30",
                    headerGrad: "border-red-500/20 bg-gradient-to-r from-red-600/12 to-transparent",
                    liveDot: "bg-red-600",
                    liveText: "text-red-700",
                    softBtn: "bg-red-50 hover:bg-red-100 text-red-800 border-red-200",
                    pillActive: "bg-red-600 text-white",
                    pillInactiveHover: "hover:bg-red-50",
                    activeRowBg: "bg-red-50/85",
                    avatarBg: "bg-red-600/15 text-red-700",
                    groupAvatarBg: "bg-rose-500/15 text-rose-700",
                    groupBadge: "bg-rose-50 text-rose-700 border-rose-200",
                    bubbleOut: "bg-red-600 text-white",
                    bubbleOutMeta: "text-red-100",
                    canvasTint: "bg-red-500/[0.02]",
                    inputFocus: "focus:border-red-500",
                    sendBtn: "bg-red-600 hover:bg-red-500 text-white",
                  };
                case "webchat":
                  return {
                    panelBorder: "border-cyan-500/30",
                    headerGrad: "border-cyan-500/20 bg-gradient-to-r from-cyan-500/12 to-transparent",
                    liveDot: "bg-cyan-600",
                    liveText: "text-cyan-700",
                    softBtn: "bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-cyan-200",
                    pillActive: "bg-cyan-600 text-white",
                    pillInactiveHover: "hover:bg-cyan-50",
                    activeRowBg: "bg-cyan-50/85",
                    avatarBg: "bg-cyan-500/15 text-cyan-700",
                    groupAvatarBg: "bg-teal-500/15 text-teal-700",
                    groupBadge: "bg-teal-50 text-teal-700 border-teal-200",
                    bubbleOut: "bg-cyan-600 text-white",
                    bubbleOutMeta: "text-cyan-100",
                    canvasTint: "bg-cyan-500/[0.02]",
                    inputFocus: "focus:border-cyan-500",
                    sendBtn: "bg-cyan-600 hover:bg-cyan-500 text-white",
                  };
                default:
                  return {
                    panelBorder: "border-emerald-500/30",
                    headerGrad: "border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 to-transparent",
                    liveDot: "bg-emerald-500",
                    liveText: "text-emerald-700",
                    softBtn: "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200",
                    pillActive: "bg-emerald-600 text-white",
                    pillInactiveHover: "hover:bg-emerald-50",
                    activeRowBg: "bg-emerald-50/80",
                    avatarBg: "bg-emerald-500/15 text-emerald-700",
                    groupAvatarBg: "bg-teal-500/15 text-teal-700",
                    groupBadge: "bg-teal-50 text-teal-700 border-teal-200",
                    bubbleOut: "bg-emerald-600 text-white",
                    bubbleOutMeta: "text-emerald-100",
                    canvasTint: "bg-emerald-500/[0.02]",
                    inputFocus: "focus:border-emerald-500",
                    sendBtn: "bg-emerald-600 hover:bg-emerald-500 text-white",
                  };
              }
            })();

            return (
              <>
                {/* Messaging Chats, Groups & Contacts Column */}
                <div className={`ws-lg:col-span-4  rounded-lg border ${adapterPalette.panelBorder} bg-white shadow-xs flex flex-col h-full overflow-hidden text-left`}>
                  <div className={`p-4 border-b ${adapterPalette.headerGrad} space-y-3 shrink-0`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-8 h-8 rounded-md ${adapterMeta.iconBg} flex items-center justify-center shrink-0`}>
                          <ProviderLogo type={selectedChannelType} className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-ui font-bold text-gray-900 truncate">{selectedAccount?.name}</div>
                          <div className="text-micro font-mono truncate flex items-center gap-1.5">
                            {waState?.status === "connected" ? (
                              <>
                                <span className={`w-1.5 h-1.5 rounded-full ${adapterPalette.liveDot} shrink-0`} />
                                <span className={`${adapterPalette.liveText} truncate`}>
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
                          title={t(
                            `Sync ${channelDisplayName} chats & groups`,
                            `Synchronizovať ${channelDisplayName} konverzácie`,
                            `${channelDisplayName} beszélgetések szinkronizálása`,
                          )}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-micro font-bold cursor-pointer disabled:opacity-50 ${adapterPalette.softBtn}`}
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
                      <div className="p-3 rounded-lg bg-amber-50/60 border border-emerald-300 shadow-xs space-y-2">
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
                              className="text-gray-400 hover:text-gray-600 text-micro font-bold cursor-pointer"
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
                              className="w-44 h-44 rounded-md bg-white p-1.5 border border-emerald-200 object-contain shadow-2xs"
                            />
                          ) : (
                            <div className="w-44 h-44 rounded-md bg-white border border-emerald-100 flex items-center justify-center text-micro text-gray-400">
                              <RefreshCw size={18} className="animate-spin text-emerald-600 mr-1.5" />
                              {t("Generating QR…", "Generujem QR…", "QR generálása…")}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={waSearchQuery}
                        onChange={(e) => setWaSearchQuery(e.target.value)}
                        placeholder={t(
                          `Search ${channelDisplayName} chats & groups...`,
                          `Hľadať ${channelDisplayName} chaty a skupiny...`,
                          `${channelDisplayName} beszélgetések és csoportok keresése...`,
                        )}
                        className={`w-full pl-9 pr-3 py-2 rounded-md bg-white border border-gray-200 text-caption text-gray-700 focus:outline-none ${adapterPalette.inputFocus}`}
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
                                ? adapterPalette.pillActive
                                : `bg-white/80 text-gray-600 ${adapterPalette.pillInactiveHover} border border-gray-200/80`
                            }`}
                          >
                            {tab.label} ({tab.count})
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                    {filteredWaChats.length === 0 ? (
                      <div className="p-6 text-center text-caption text-gray-400 space-y-2">
                        <div>
                          {waLoading
                            ? t(
                                `Syncing ${channelDisplayName} chats…`,
                                `Synchronizujem ${channelDisplayName} konverzácie…`,
                                `${channelDisplayName} beszélgetések szinkronizálása…`,
                              )
                            : t(
                                `No ${channelDisplayName} chats match your filter.`,
                                `Žiadne ${channelDisplayName} konverzácie nezodpovedajú filtru.`,
                                `Nincs a szűrőnek megfelelő ${channelDisplayName} beszélgetés.`,
                              )}
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
                              active ? adapterPalette.activeRowBg : "hover:bg-gray-50"
                            }`}
                          >
                            <span
                              className={`h-9 w-9 rounded-md text-caption font-bold flex items-center justify-center shrink-0 ${
                                chat.isGroup
                                  ? adapterPalette.groupAvatarBg
                                  : adapterPalette.avatarBg
                              }`}
                            >
                              {chat.isGroup ? <Users size={15} /> : initialsOf(chat.name)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-ui font-bold text-gray-900 truncate flex items-center gap-1.5">
                                  <span className="truncate">{chat.name}</span>
                                  {chatTk.isAgentActive && (
                                    <span
                                      title={t(
                                        `Handled by ${chatTk.agentName}`,
                                        `Obsluhuje ${chatTk.agentName}`,
                                        `Kezeli: ${chatTk.agentName}`,
                                      )}
                                      className="px-1.5 py-0.2 rounded-md bg-violet-100 text-violet-800 border border-violet-200 text-micro font-bold shrink-0 max-w-28 truncate"
                                    >
                                      🤖 {chatTk.agentName}
                                    </span>
                                  )}
                                  {!chatTk.isAgentActive && chatTk.isPausedForSession && (
                                    <span
                                      title={t(
                                        "Agent turned off for this session",
                                        "Agent vypnutý pre túto reláciu",
                                        "Ügynök kikapcsolva erre a munkamenetre",
                                      )}
                                      className="px-1.5 py-0.2 rounded-md bg-gray-100 text-gray-500 border border-gray-200 text-micro font-semibold shrink-0"
                                    >
                                      ⏸ Off
                                    </span>
                                  )}
                                </span>
                                {chat.lastMessageAt && (
                                  <span className="text-micro text-gray-400 shrink-0">
                                    {formatListDate(chat.lastMessageAt)}
                                  </span>
                                )}
                              </div>
                              <div className="text-micro text-gray-500 truncate mt-0.5">
                                {chat.lastMessageText ? (
                                  chat.lastMessageText
                                ) : chat.isGroup ? (
                                  t(`${adapterLabel} Group`, `${adapterLabel} skupina`, `${adapterLabel} csoport`)
                                ) : (
                                  <span className="font-mono">
                                    {chat.phone || t(`${adapterLabel} Contact`, `${adapterLabel} kontakt`, `${adapterLabel} kapcsolat`)}
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

                {/* Messaging Conversation & Composer Column */}
                <div className={`ws-lg:col-span-8  rounded-lg border ${adapterPalette.panelBorder} bg-white shadow-xs flex flex-col h-full overflow-hidden text-left`}>
                  {!activeChat ? (
                    emptyPane(
                      t(
                        `Select a ${channelDisplayName} chat or group`,
                        `Vyberte ${channelDisplayName} konverzáciu alebo skupinu`,
                        `Válasszon egy ${channelDisplayName} beszélgetést vagy csoportot`,
                      ),
                    )
                  ) : (
                    <>
                      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 shrink-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-title font-heading font-bold text-gray-900 truncate">
                              {activeChat.name}
                            </h3>
                            {activeChat.isGroup && (
                              <span className={`px-2 py-0.5 rounded-md border text-micro font-bold uppercase shrink-0 ${adapterPalette.groupBadge}`}>
                                {t("Group", "Skupina", "Csoport")}
                              </span>
                            )}
                          </div>
                          <div className={`text-caption ${adapterPalette.liveText} font-mono truncate`}>
                            {activeChat.participantsPreview ||
                              activeChat.phone ||
                              (activeChat.isGroup
                                ? t(`${adapterLabel} Group Chat`, `Skupinová konverzácia ${adapterLabel}`, `${adapterLabel} csoportos csevegés`)
                                : activeChat.id)}{" "}
                            · {selectedAccount?.name}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          <div
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all ${
                              activeChatTakeover.isAgentActive
                                ? "bg-violet-600 text-white border-violet-700 shadow-xs"
                                : activeChatTakeover.isPausedForSession
                                  ? "bg-amber-50 text-amber-900 border-amber-300"
                                  : "bg-violet-50/80 text-violet-900 border-violet-200"
                            }`}
                          >
                            {waTakeoverBusyChatId === activeChat.id ? (
                              <Loader2 size={13} className="animate-spin shrink-0" />
                            ) : (
                              <Bot size={14} className="shrink-0" />
                            )}
                            {activeChatTakeover.isAgentActive && (
                              <span
                                title={
                                  activeChatTakeover.isAutoTakenOver
                                    ? t("Auto-assigned by trigger", "Automaticky priradené spúšťačom", "Trigger által automatikusan hozzárendelve")
                                    : t("Active for this session", "Aktívne pre túto reláciu", "Aktív ebben a munkamenetben")
                                }
                                className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse shrink-0"
                              />
                            )}
                            <select
                              data-testid="wa-agent-takeover-btn"
                              disabled={waTakeoverBusyChatId === activeChat.id || aiAccounts.length === 0}
                              value={
                                activeChatTakeover.isManualSessionActive && activeChatTakeover.agentConnectorId
                                  ? `${activeChatTakeover.agentConnectorId}:${activeChatTakeover.subagentId || "main"}`
                                  : activeChatTakeover.isAutoTakenOver && !activeChatTakeover.isPausedForSession
                                    ? "auto"
                                    : "off"
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "auto") {
                                  void handleToggleWaChatAgentTakeover(activeChat, "auto");
                                } else if (val === "off") {
                                  void handleToggleWaChatAgentTakeover(activeChat, "paused");
                                } else {
                                  const [agId, subRaw] = val.split(":");
                                  void handleToggleWaChatAgentTakeover(
                                    activeChat,
                                    "active",
                                    agId,
                                    subRaw && subRaw !== "main" ? subRaw : null,
                                  );
                                }
                              }}
                              className={`bg-transparent text-caption font-bold focus:outline-none cursor-pointer pr-1 ${
                                activeChatTakeover.isAgentActive ? "text-white" : "text-gray-800"
                              }`}
                            >
                              {activeChatTakeover.isAutoTakenOver && (
                                <option value="auto" className="text-gray-900 bg-white">
                                  ⚡{" "}
                                  {t(
                                    `Auto (Visual Trigger · ${activeChatTakeover.agentName})`,
                                    `Auto (Vizuálny spúšťač · ${activeChatTakeover.agentName})`,
                                    `Auto (Vizuális trigger · ${activeChatTakeover.agentName})`,
                                  )}
                                </option>
                              )}
                              <option value="off" className="text-gray-900 bg-white">
                                🚫{" "}
                                {activeChatTakeover.isPausedForSession
                                  ? t(
                                      "Not handled by AI (Turned off for session)",
                                      "Neobsluhované AI (Vypnuté pre reláciu)",
                                      "AI nem kezeli (Munkamenetre kikapcsolva)",
                                    )
                                  : t(
                                      "Not handled by AI",
                                      "Neobsluhované AI",
                                      "AI nem kezeli",
                                    )}
                              </option>
                              {aiAccounts.map((agAcc) => {
                                const subs = agentStates[agAcc.id]?.subagents ?? agAcc.subagents ?? [];
                                return (
                                  <optgroup
                                    key={agAcc.id}
                                    label={`${agAcc.name} (${(agAcc.connectorType || "AI").toUpperCase()})`}
                                    className="text-gray-900 bg-white"
                                  >
                                    <option value={`${agAcc.id}:main`} className="text-gray-900 bg-white">
                                      ✦ {agAcc.name} — {t("Main Agent", "Hlavný agent", "Fő ügynök")}
                                    </option>
                                    {subs.map((sub) => (
                                      <option key={sub.id} value={`${agAcc.id}:${sub.id}`} className="text-gray-900 bg-white">
                                        🤖 {sub.name} ({sub.role})
                                      </option>
                                    ))}
                                  </optgroup>
                                );
                              })}
                            </select>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleResyncWhatsApp(activeChat.id)}
                            disabled={waLoading}
                            className={`px-3 py-1.5 rounded-md border text-caption font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${adapterPalette.softBtn}`}
                          >
                            <RefreshCw size={13} className={waLoading ? "animate-spin" : ""} />
                            {t("Sync latest", "Synchronizovať najnovšie", "Legfrissebbek szinkronizálása")}
                          </button>
                          {canEdit && (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-gray-200 bg-white shadow-2xs">
                              <Users size={13} className="text-gray-500 shrink-0" />
                              <select
                                data-testid="wa-client-select"
                                value={matchedLead?.id || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "__new__") {
                                    setPendingChatLinkKey(activeChatLinkKey);
                                    setClientFormName(activeChat.name || "");
                                    setClientFormPhone(activeDigits ? activeChat.phone || "" : "");
                                    setClientFormEmail("");
                                    setClientFormCity("");
                                    setClientFormType("person");
                                    setIsClientSlideoutOpen(true);
                                  } else {
                                    saveChatClientLink(activeChatLinkKey, val);
                                  }
                                }}
                                className="bg-transparent text-caption font-bold text-gray-800 focus:outline-none cursor-pointer max-w-44 truncate"
                              >
                                <option value="">
                                  {t("🔗 Select or create client...", "🔗 Vybrať alebo vytvoriť klienta...", "🔗 Ügyfél kiválasztása vagy létrehozása...")}
                                </option>
                                <option value="__new__">
                                  ➕ {t("+ Create New Client", "+ Vytvoriť nového klienta", "+ Új ügyfél létrehozása")}
                                </option>
                                {leads
                                  .filter((l) => !l.archived)
                                  .map((l) => (
                                    <option key={l.id} value={l.id}>
                                      {l.id.startsWith("client-") ? "🏢" : "👤"} {l.name}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}
                          {matchedLead ? (
                            renderCrmActions(matchedLead, {
                              name: matchedLead.name,
                              address: matchedLead.email || "",
                            })
                          ) : canEdit ? (
                            <button
                              type="button"
                              data-testid="wa-create-client-btn"
                              onClick={() => {
                                setPendingChatLinkKey(activeChatLinkKey);
                                setClientFormName(activeChat.name || "");
                                setClientFormPhone(activeDigits ? activeChat.phone || "" : "");
                                setClientFormEmail("");
                                setClientFormCity("");
                                setClientFormType("person");
                                setIsClientSlideoutOpen(true);
                              }}
                              className={`px-3 py-1.5 rounded-md border text-caption font-bold flex items-center gap-1.5 cursor-pointer ${adapterPalette.softBtn}`}
                            >
                              <UserPlus size={13} />
                              {t("Create Client", "Vytvoriť klienta", "Ügyfél létrehozása")}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {(liveMessages.length > 0 || crmWaEvents.length > 0) &&
                        renderInlineAiSummaryBanner(`wa-${activeChat.id}`, matchedLead, () => {
                          const combinedWaText =
                            liveMessages.length > 0
                              ? liveMessages
                                  .slice(-30)
                                  .map(
                                    (m) =>
                                      `${m.fromMe ? "Me" : m.senderName || activeChat.name} (${m.timestamp || ""}): ${m.text || ""}`
                                  )
                                  .join("\n")
                              : crmWaEvents
                                  .slice(-20)
                                  .map((ev: any) => `${ev.author || ""}: ${ev.content || ""}`)
                                  .join("\n");
                          void fetchSummary(
                            `wa-${activeChat.id}`,
                            "thread",
                            `${channelDisplayName}: ${activeChat.name}`,
                            combinedWaText,
                            true,
                            Boolean(summaries[`wa-${activeChat.id}`])
                          );
                        })}

                      <div
                        ref={waMessagesScrollRef}
                        className={`flex-1 overflow-y-auto p-6 space-y-3 ${adapterPalette.canvasTint}`}
                      >
                        {liveMessages.length === 0 && crmWaEvents.length === 0 ? (
                          <div className="text-center py-12 text-gray-400 text-body">
                            {t(
                              `No messages in this ${activeChat.name} (${channelDisplayName}) conversation yet. Write a message below.`,
                              `V tejto konverzácii ${activeChat.name} (${channelDisplayName}) zatiaľ nie sú žiadne správy. Napíšte správu nižšie.`,
                              `Ebben a(z) ${activeChat.name} (${channelDisplayName}) beszélgetésben még nincs üzenet. Írjon üzenetet alább.`,
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
                                  className={`max-w-xl p-3.5 rounded-lg shadow-xs space-y-1.5 ${
                                    msg.fromMe
                                      ? `ml-auto ${adapterPalette.bubbleOut}`
                                      : "mr-auto bg-white border border-gray-200 text-gray-800"
                                  }`}
                                >
                                  <div
                                    className={`text-micro flex items-center justify-between gap-3 ${
                                      msg.fromMe ? adapterPalette.bubbleOutMeta : "text-gray-400"
                                    }`}
                                  >
                                    <span
                                      className={`font-bold ${
                                        msg.fromMe ? "text-white" : adapterPalette.liveText
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
                                      className="block overflow-hidden rounded-md border border-black/10"
                                    >
                                      <img
                                        src={imgSrc}
                                        alt={msg.text || `${adapterLabel} media`}
                                        className="max-h-72 w-full object-cover rounded-md"
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
                                  className={`max-w-xl ml-auto p-3.5 rounded-lg ${adapterPalette.bubbleOut} shadow-xs space-y-1`}
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

                      <div className="p-4 border-t border-gray-100 flex items-center gap-2 shrink-0">
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
                            `Write a ${channelDisplayName} message to ${activeChat.name}...`,
                            `Napíšte ${channelDisplayName} správu pre ${activeChat.name}...`,
                            `Írjon ${channelDisplayName} üzenetet neki: ${activeChat.name}...`,
                          )}
                          className={`flex-1 px-4 py-2.5 rounded-md bg-gray-50 border border-gray-200 text-body text-gray-800 focus:outline-none focus:bg-white ${adapterPalette.inputFocus}`}
                        />
                        <button
                          type="button"
                          onClick={() => void handleSendWhatsAppMessage(activeChat, matchedLead)}
                          disabled={!waDraftMessage.trim() || !canEdit || waSending}
                          className={`px-4 py-2.5 rounded-md ${adapterPalette.sendBtn} text-body font-bold flex items-center gap-2 disabled:opacity-40 cursor-pointer`}
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
  );
};
