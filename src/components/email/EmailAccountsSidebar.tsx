import { Settings, Sparkles, Bot, Zap } from "lucide-react";
import { PROVIDERS, ProviderLogo } from "../CompanyMailboxSettings";
import { isAgentConnector, type ConnectorType, type CompanyMailbox, type AgentSubagent, type AgentEventTrigger, type AgentConnectorState } from "../../utils/companyMailboxes";
import React from "react";

interface EmailAccountsSidebarProps {
  t: (en: string, sk: string, hu: string) => string;
  availableAccounts: { id: string; name: string; address: string; connectorType: ConnectorType; isPersonal?: boolean; settings?: CompanyMailbox["settings"]; subagents?: AgentSubagent[]; triggers?: AgentEventTrigger[]; }[];
  selectedAccount: { id: string; name: string; address: string; connectorType: ConnectorType; isPersonal?: boolean; settings?: CompanyMailbox["settings"]; subagents?: AgentSubagent[]; triggers?: AgentEventTrigger[]; };
  agentStates: Record<string, AgentConnectorState>;
  setSelectedMailboxId: React.Dispatch<React.SetStateAction<string>>;
  setActiveChatSubagentId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedEmail: React.Dispatch<any>;
  setSelectedThreadId: React.Dispatch<React.SetStateAction<string | null>>;
  setNewSubagentOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setVisualTriggersOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeChatSubagentId: string;
  visualTriggersOpen: boolean;
}

export const EmailAccountsSidebar: React.FC<EmailAccountsSidebarProps> = ({
  t, availableAccounts, selectedAccount, agentStates, setSelectedMailboxId, setActiveChatSubagentId,
  setSelectedEmail, setSelectedThreadId, setNewSubagentOpen, setVisualTriggersOpen, activeChatSubagentId,
  visualTriggersOpen,
}) => {
  return (
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
  );
};
