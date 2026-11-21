import React from "react";
import { MessageCircle, ExternalLink, X } from "lucide-react";
import type { Lead } from "../../types";
import { PROVIDERS, ProviderLogo } from "../CompanyMailboxSettings";
import type { ConnectorType, WhatsAppChatSummary } from "../../utils/companyMailboxes";
import { entityAccentStyle } from "../../utils/entityAccent";

interface ClientContactChatsProps {
  activeClient: { name: string; phone: string; associatedLeads: Lead[] };
  messagingChannels: Array<{ id: string; name: string; connectorType: ConnectorType; chats: WhatsAppChatSummary[] }>;
  chatClientLinks: Record<string, string>;
  updateChatClientLink: (chatKey: string, leadId: string) => void;
  t: (en: string, sk: string, hu: string) => string;
}

export const ClientContactChats: React.FC<ClientContactChatsProps> = ({
  activeClient,
  messagingChannels,
  chatClientLinks,
  updateChatClientLink,
  t,
}) => {
                const clientLeadIds = new Set((activeClient.associatedLeads || []).map((l) => l.id));
                const primaryLeadId =
                  activeClient.associatedLeads.find((l) => (l.id || "").startsWith("client-"))?.id ??
                  activeClient.associatedLeads[0]?.id ??
                  "";
                const clientDigits = (activeClient.phone || "").replace(/\D/g, "");
                const clientNameLower = (activeClient.name || "").trim().toLowerCase();

                const matchedChats: Array<{
                  channelId: string;
                  channelName: string;
                  connectorType: ConnectorType;
                  chat: WhatsAppChatSummary;
                  linkKey: string;
                  isExplicit: boolean;
                }> = [];

                for (const ch of messagingChannels) {
                  for (const chat of ch.chats) {
                    const linkKey = `${ch.id}::${chat.id}`;
                    const explicitId = chatClientLinks[linkKey];
                    const isExplicit = Boolean(explicitId && clientLeadIds.has(explicitId));
                    const chatDigits = (chat.phone || "").replace(/\D/g, "");
                    const isAutoMatch =
                      !explicitId &&
                      ((clientDigits && chatDigits && clientDigits === chatDigits) ||
                        (chat.name || "").trim().toLowerCase() === clientNameLower);
                    if (isExplicit || isAutoMatch) {
                      matchedChats.push({
                        channelId: ch.id,
                        channelName: ch.name,
                        connectorType: ch.connectorType,
                        chat,
                        linkKey,
                        isExplicit,
                      });
                    }
                  }
                }

                const availableUnlinkedChats = messagingChannels.flatMap((ch) =>
                  ch.chats
                    .filter((chat) => !matchedChats.some((m) => m.linkKey === `${ch.id}::${chat.id}`))
                    .map((chat) => ({
                      channelId: ch.id,
                      channelName: ch.name,
                      connectorType: ch.connectorType,
                      chat,
                      linkKey: `${ch.id}::${chat.id}`,
                    })),
                );

                return (
                  <div style={entityAccentStyle("whatsapp")} className="border-t border-gray-200 pt-4 space-y-2.5" data-testid="client-contact-chats-section">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="type-overline text-entity-text flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" />
                        {t("Chats & Instant Messaging", "Chaty a komunikátory", "Csevegések és üzenetküldők")}
                      </span>
                      {primaryLeadId && availableUnlinkedChats.length > 0 && (
                        <select
                          data-testid="client-link-chat-select"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              updateChatClientLink(e.target.value, primaryLeadId);
                            }
                          }}
                          className="px-2.5 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-caption font-semibold text-gray-700 focus:outline-none focus:border-entity-solid cursor-pointer max-w-52 truncate"
                        >
                          <option value="">
                            ➕ {t("Link existing chat...", "Prepojiť existujúci chat...", "Meglévő csevegés összekapcsolása...")}
                          </option>
                          {availableUnlinkedChats.map((item) => (
                            <option key={item.linkKey} value={item.linkKey}>
                              {PROVIDERS[item.connectorType]?.label || item.connectorType.toUpperCase()} · {item.chat.name} ({item.channelName})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {matchedChats.length === 0 ? (
                      <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-between gap-2 text-caption text-gray-600">
                        <span>
                          {t(
                            "No linked chats yet. Select a chat above or start one from Communications.",
                            "Zatiaľ žiadne prepojené chaty. Vyberte chat vyššie alebo začnite konverzáciu v Komunikácii.",
                            "Még nincs összekapcsolt csevegés. Válasszon fentebb, vagy indítson egyet a Kommunikációban.",
                          )}
                        </span>
                        <a
                          href="#email"
                          className="shrink-0 px-2.5 py-1 rounded-md bg-entity-subtle hover:bg-entity-muted text-entity-text border border-entity-border font-semibold transition-colors"
                        >
                          {t("Open Chats", "Otvoriť chaty", "Csevegések megnyitása")}
                        </a>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {matchedChats.map((item) => {
                          const pMeta = PROVIDERS[item.connectorType] ?? PROVIDERS.whatsapp;
                          return (
                            <div
                              key={item.linkKey}
                              className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-gray-50 border border-gray-200 hover:border-entity-border transition-all"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${pMeta.iconBg}`}
                                >
                                  <ProviderLogo type={item.connectorType} className="w-3.5 h-3.5" />
                                </span>
                                <div className="min-w-0">
                                  <div className="text-ui font-bold text-slate-900 truncate flex items-center gap-1.5">
                                    <span className="truncate">{item.chat.name}</span>
                                    <span className={`px-1.5 py-0.5 rounded-md text-micro font-extrabold ${pMeta.badgeClass}`}>
                                      {pMeta.label}
                                    </span>
                                  </div>
                                  <div className="text-micro text-slate-500 truncate">
                                    {item.channelName}
                                    {item.chat.lastMessageText ? ` · ${item.chat.lastMessageText}` : ""}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <a
                                  href={`#email?channel=${encodeURIComponent(item.channelId)}&chat=${encodeURIComponent(item.chat.id)}`}
                                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 text-caption font-bold flex items-center gap-1 transition-all shadow-2xs"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  {t("Open Chat", "Otvoriť chat", "Megnyitás")}
                                </a>
                                {item.isExplicit && (
                                  <button
                                    type="button"
                                    onClick={() => updateChatClientLink(item.linkKey, "")}
                                    title={t("Unlink chat", "Odpojiť chat", "Leválasztás")}
                                    className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
};
