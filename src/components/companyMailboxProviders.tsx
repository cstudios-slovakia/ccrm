import React from "react";
import { MessageCircle, Server } from "lucide-react";
import { isApiKeyAgentConnector, type ConnectorType } from "../utils/companyMailboxes";

export interface ProviderMeta {
  type: ConnectorType;
  label: string;
  shortDesc: string;
  category: "email" | "whatsapp" | "agents";
  rowBorder: string;
  rowBg: string;
  rowTint: string;
  badgeClass: string;
  iconBg: string;
  modalBorder: string;
  modalHeaderBg: string;
  accentBtn: string;
  accentRing: string;
}

export const PROVIDERS: Record<ConnectorType, ProviderMeta> = {
  gmail: {
    type: "gmail",
    label: "Gmail",
    shortDesc: "Google Workspace / Gmail App Password",
    category: "email",
    rowBorder: "border-l-4 border-l-rose-500",
    rowBg: "bg-gradient-to-r from-rose-500/[0.06] via-white/80 to-white/80 dark:from-rose-500/[0.10] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-rose-500/[0.11]",
    badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30",
    iconBg: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-rose-500",
    modalHeaderBg: "bg-gradient-to-r from-rose-500/15 via-rose-500/5 to-transparent border-b border-rose-500/20",
    accentBtn: "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/20",
    accentRing: "ring-2 ring-rose-500/50",
  },
  smtp: {
    type: "smtp",
    label: "SMTP / IMAP",
    shortDesc: "Custom Mail Server (IMAP + SMTP)",
    category: "email",
    rowBorder: "border-l-4 border-l-sky-500",
    rowBg: "bg-gradient-to-r from-sky-500/[0.06] via-white/80 to-white/80 dark:from-sky-500/[0.10] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-sky-500/[0.11]",
    badgeClass: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30",
    iconBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-sky-500",
    modalHeaderBg: "bg-gradient-to-r from-sky-500/15 via-sky-500/5 to-transparent border-b border-sky-500/20",
    accentBtn: "bg-sky-600 hover:bg-sky-500 text-white shadow-sky-500/20",
    accentRing: "ring-2 ring-sky-500/50",
  },
  exchange: {
    type: "exchange",
    label: "MS Exchange",
    shortDesc: "Microsoft 365 / Exchange Server",
    category: "email",
    rowBorder: "border-l-4 border-l-blue-600",
    rowBg: "bg-gradient-to-r from-blue-600/[0.06] via-white/80 to-white/80 dark:from-blue-600/[0.10] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-blue-600/[0.11]",
    badgeClass: "bg-blue-600/15 text-blue-700 dark:text-blue-300 border border-blue-600/30",
    iconBg: "bg-blue-600/15 text-blue-600 dark:text-blue-400 border border-blue-600/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-blue-600",
    modalHeaderBg: "bg-gradient-to-r from-blue-600/15 via-blue-600/5 to-transparent border-b border-blue-600/20",
    accentBtn: "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20",
    accentRing: "ring-2 ring-blue-600/50",
  },
  whatsapp: {
    type: "whatsapp",
    label: "WhatsApp",
    shortDesc: "WAAI QR Code Bridge",
    category: "whatsapp",
    rowBorder: "border-l-4 border-l-emerald-500",
    rowBg: "bg-gradient-to-r from-emerald-500/[0.07] via-white/80 to-white/80 dark:from-emerald-500/[0.12] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-emerald-500/[0.13]",
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
    iconBg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-emerald-500",
    modalHeaderBg: "bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-transparent border-b border-emerald-500/20",
    accentBtn: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20",
    accentRing: "ring-2 ring-emerald-500/50",
  },
  telegram: {
    type: "telegram",
    label: "Telegram Bot",
    shortDesc: "BotMan TelegramDriver (@BotFather)",
    category: "whatsapp",
    rowBorder: "border-l-4 border-l-sky-500",
    rowBg: "bg-gradient-to-r from-sky-500/[0.07] via-white/80 to-white/80 dark:from-sky-500/[0.12] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-sky-500/[0.13]",
    badgeClass: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30",
    iconBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-sky-500",
    modalHeaderBg: "bg-gradient-to-r from-sky-500/15 via-sky-500/5 to-transparent border-b border-sky-500/20",
    accentBtn: "bg-sky-600 hover:bg-sky-500 text-white shadow-sky-500/20",
    accentRing: "ring-2 ring-sky-500/50",
  },
  messenger: {
    type: "messenger",
    label: "FB Messenger",
    shortDesc: "BotMan FacebookDriver (Meta Graph)",
    category: "whatsapp",
    rowBorder: "border-l-4 border-l-blue-600",
    rowBg: "bg-gradient-to-r from-blue-600/[0.07] via-white/80 to-white/80 dark:from-blue-600/[0.12] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-blue-600/[0.13]",
    badgeClass: "bg-blue-600/15 text-blue-700 dark:text-blue-300 border border-blue-600/30",
    iconBg: "bg-blue-600/15 text-blue-600 dark:text-blue-400 border border-blue-600/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-blue-600",
    modalHeaderBg: "bg-gradient-to-r from-blue-600/15 via-blue-600/5 to-transparent border-b border-blue-600/20",
    accentBtn: "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20",
    accentRing: "ring-2 ring-blue-600/50",
  },
  slack: {
    type: "slack",
    label: "Slack Bot",
    shortDesc: "BotMan SlackDriver (Workspace App)",
    category: "whatsapp",
    rowBorder: "border-l-4 border-l-fuchsia-600",
    rowBg: "bg-gradient-to-r from-fuchsia-600/[0.07] via-white/80 to-white/80 dark:from-fuchsia-600/[0.12] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-fuchsia-600/[0.13]",
    badgeClass: "bg-fuchsia-600/15 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-600/30",
    iconBg: "bg-fuchsia-600/15 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-600/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-fuchsia-600",
    modalHeaderBg: "bg-gradient-to-r from-fuchsia-600/15 via-fuchsia-600/5 to-transparent border-b border-fuchsia-600/20",
    accentBtn: "bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-fuchsia-600/20",
    accentRing: "ring-2 ring-fuchsia-600/50",
  },
  discord: {
    type: "discord",
    label: "Discord Bot",
    shortDesc: "BotMan DiscordDriver (Server Channels)",
    category: "whatsapp",
    rowBorder: "border-l-4 border-l-indigo-500",
    rowBg: "bg-gradient-to-r from-indigo-500/[0.07] via-white/80 to-white/80 dark:from-indigo-500/[0.12] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-indigo-500/[0.13]",
    badgeClass: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30",
    iconBg: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-indigo-500",
    modalHeaderBg: "bg-gradient-to-r from-indigo-500/15 via-indigo-500/5 to-transparent border-b border-indigo-500/20",
    accentBtn: "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20",
    accentRing: "ring-2 ring-indigo-500/50",
  },
  teams: {
    type: "teams",
    label: "MS Teams",
    shortDesc: "BotMan BotFrameworkDriver (Azure Bot)",
    category: "whatsapp",
    rowBorder: "border-l-4 border-l-violet-600",
    rowBg: "bg-gradient-to-r from-violet-600/[0.07] via-white/80 to-white/80 dark:from-violet-600/[0.12] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-violet-600/[0.13]",
    badgeClass: "bg-violet-600/15 text-violet-700 dark:text-violet-300 border border-violet-600/30",
    iconBg: "bg-violet-600/15 text-violet-600 dark:text-violet-400 border border-violet-600/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-violet-600",
    modalHeaderBg: "bg-gradient-to-r from-violet-600/15 via-violet-600/5 to-transparent border-b border-violet-600/20",
    accentBtn: "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-600/20",
    accentRing: "ring-2 ring-violet-600/50",
  },
  viber: {
    type: "viber",
    label: "Viber Bot",
    shortDesc: "BotMan ViberDriver (Public Account)",
    category: "whatsapp",
    rowBorder: "border-l-4 border-l-purple-600",
    rowBg: "bg-gradient-to-r from-purple-600/[0.07] via-white/80 to-white/80 dark:from-purple-600/[0.12] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-purple-600/[0.13]",
    badgeClass: "bg-purple-600/15 text-purple-700 dark:text-purple-300 border border-purple-600/30",
    iconBg: "bg-purple-600/15 text-purple-600 dark:text-purple-400 border border-purple-600/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-purple-600",
    modalHeaderBg: "bg-gradient-to-r from-purple-600/15 via-purple-600/5 to-transparent border-b border-purple-600/20",
    accentBtn: "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/20",
    accentRing: "ring-2 ring-purple-600/50",
  },
  twilio: {
    type: "twilio",
    label: "Twilio SMS",
    shortDesc: "BotMan TwilioMessageDriver (2-Way SMS)",
    category: "whatsapp",
    rowBorder: "border-l-4 border-l-red-600",
    rowBg: "bg-gradient-to-r from-red-600/[0.07] via-white/80 to-white/80 dark:from-red-600/[0.12] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-red-600/[0.13]",
    badgeClass: "bg-red-600/15 text-red-700 dark:text-red-300 border border-red-600/30",
    iconBg: "bg-red-600/15 text-red-600 dark:text-red-400 border border-red-600/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-red-600",
    modalHeaderBg: "bg-gradient-to-r from-red-600/15 via-red-600/5 to-transparent border-b border-red-600/20",
    accentBtn: "bg-red-600 hover:bg-red-500 text-white shadow-red-600/20",
    accentRing: "ring-2 ring-red-600/50",
  },
  webchat: {
    type: "webchat",
    label: "Web Chat Widget",
    shortDesc: "BotMan WebDriver (Embeddable Live Chat)",
    category: "whatsapp",
    rowBorder: "border-l-4 border-l-cyan-500",
    rowBg: "bg-gradient-to-r from-cyan-500/[0.07] via-white/80 to-white/80 dark:from-cyan-500/[0.12] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-cyan-500/[0.13]",
    badgeClass: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30",
    iconBg: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-cyan-500",
    modalHeaderBg: "bg-gradient-to-r from-cyan-500/15 via-cyan-500/5 to-transparent border-b border-cyan-500/20",
    accentBtn: "bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-500/20",
    accentRing: "ring-2 ring-cyan-500/50",
  },
  claude: {
    type: "claude",
    label: "Claude (Subscription)",
    shortDesc: "Claude Pro / Max / Team via Marveen + MCP",
    category: "agents",
    rowBorder: "border-l-4 border-l-amber-500",
    rowBg: "bg-gradient-to-r from-amber-500/[0.07] via-white/80 to-white/80 dark:from-amber-500/[0.12] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-amber-500/[0.13]",
    badgeClass: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30",
    iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-amber-500",
    modalHeaderBg: "bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border-b border-amber-500/20",
    accentBtn: "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20",
    accentRing: "ring-2 ring-amber-500/50",
  },
  antigravity: {
    type: "antigravity",
    label: "Google Antigravity",
    shortDesc: "Google Gemini / Antigravity Subscription via Marveen + MCP",
    category: "agents",
    rowBorder: "border-l-4 border-l-violet-500",
    rowBg: "bg-gradient-to-r from-violet-500/[0.07] via-white/80 to-white/80 dark:from-violet-500/[0.12] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-violet-500/[0.13]",
    badgeClass: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30",
    iconBg: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-violet-500",
    modalHeaderBg: "bg-gradient-to-r from-violet-500/15 via-violet-500/5 to-transparent border-b border-violet-500/20",
    accentBtn: "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-500/20",
    accentRing: "ring-2 ring-violet-500/50",
  },
    chatgpt: {
    type: "chatgpt",
    label: "ChatGPT (Subscription)",
    shortDesc: "ChatGPT Plus / Pro / Team via Marveen + MCP",
    category: "agents",
    rowBorder: "border-l-4 border-l-teal-500",
    rowBg: "bg-gradient-to-r from-teal-500/[0.07] via-white/80 to-white/80 dark:from-teal-500/[0.12] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-teal-500/[0.13]",
    badgeClass: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30",
    iconBg: "bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-teal-500",
    modalHeaderBg: "bg-gradient-to-r from-teal-500/15 via-teal-500/5 to-transparent border-b border-teal-500/20",
    accentBtn: "bg-teal-600 hover:bg-teal-500 text-white shadow-teal-500/20",
    accentRing: "ring-2 ring-teal-500/50",
  },
  claude_api: {
    type: "claude_api",
    label: "Claude (API Key)",
    shortDesc: "Anthropic Messages API key (sk-ant-api03-…) — pure HTTPS cURL, works on any hosting",
    category: "agents",
    rowBorder: "border-l-4 border-l-amber-500",
    rowBg: "bg-gradient-to-r from-amber-500/[0.07] via-white/80 to-white/80 dark:from-amber-500/[0.12] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-amber-500/[0.13]",
    badgeClass: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30",
    iconBg: "bg-[#D97757] text-white border border-amber-500/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-amber-500",
    modalHeaderBg: "bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border-b border-amber-500/20",
    accentBtn: "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20",
    accentRing: "ring-2 ring-amber-500/50",
  },
  gemini_api: {
    type: "gemini_api",
    label: "Google Gemini (API Key)",
    shortDesc: "Google AI Studio API key (AIzaSy…) — pure HTTPS cURL, works on any hosting",
    category: "agents",
    rowBorder: "border-l-4 border-l-violet-500",
    rowBg: "bg-gradient-to-r from-violet-500/[0.07] via-white/80 to-white/80 dark:from-violet-500/[0.12] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-violet-500/[0.13]",
    badgeClass: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/30",
    iconBg: "bg-gradient-to-br from-indigo-500 via-violet-500 to-sky-500 text-white border border-violet-500/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-violet-500",
    modalHeaderBg: "bg-gradient-to-r from-violet-500/15 via-violet-500/5 to-transparent border-b border-violet-500/20",
    accentBtn: "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-500/20",
    accentRing: "ring-2 ring-violet-500/50",
  },
  openai_api: {
    type: "openai_api",
    label: "ChatGPT / OpenAI (API Key)",
    shortDesc: "OpenAI Platform API key (sk-proj-…) — pure HTTPS cURL, works on any hosting",
    category: "agents",
    rowBorder: "border-l-4 border-l-teal-500",
    rowBg: "bg-gradient-to-r from-teal-500/[0.07] via-white/80 to-white/80 dark:from-teal-500/[0.12] dark:via-slate-900/60 dark:to-slate-900/60",
    rowTint: "hover:from-teal-500/[0.13]",
    badgeClass: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30",
    iconBg: "bg-[#10A37F] text-white border border-teal-500/30 shadow-2xs",
    modalBorder: "border-t-4 border-t-teal-500",
    modalHeaderBg: "bg-gradient-to-r from-teal-500/15 via-teal-500/5 to-transparent border-b border-teal-500/20",
    accentBtn: "bg-teal-600 hover:bg-teal-500 text-white shadow-teal-500/20",
    accentRing: "ring-2 ring-teal-500/50",
  },
};

export const ALL_PROVIDER_TYPES: ConnectorType[] = [
  "gmail",
  "smtp",
  "exchange",
  "whatsapp",
  "telegram",
  "messenger",
  "slack",
  "discord",
  "teams",
  "viber",
  "twilio",
  "webchat",
  "claude",
  "antigravity",
  "chatgpt",
  "claude_api",
  "gemini_api",
  "openai_api",
];

export const CONNECTOR_MENU_GROUPS: Array<{
  key: "email" | "whatsapp" | "agents_sub" | "agents_api";
  filter: (p: ConnectorType) => boolean;
}> = [
  { key: "email", filter: (p) => PROVIDERS[p].category === "email" },
  { key: "whatsapp", filter: (p) => PROVIDERS[p].category === "whatsapp" },
  { key: "agents_sub", filter: (p) => PROVIDERS[p].category === "agents" && !isApiKeyAgentConnector(p) },
  { key: "agents_api", filter: (p) => PROVIDERS[p].category === "agents" && isApiKeyAgentConnector(p) },
];

export const getConnectorGroupTitle = (
  key: "email" | "whatsapp" | "agents_sub" | "agents_api",
  t: { filterEmail: string; filterWhatsapp: string; filterAgents: string }
): string => {
  switch (key) {
    case "email":
      return t.filterEmail;
    case "whatsapp":
      return `${t.filterWhatsapp} & BotMan`;
    case "agents_sub":
      return `${t.filterAgents} — Subscription`;
    case "agents_api":
      return `${t.filterAgents} — API Key`;
  }
};

export const ProviderLogo: React.FC<{ type: ConnectorType; className?: string }> = ({
  type,
  className = "w-4 h-4",
}) => {
  switch (type) {
    case "gmail":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M3 6.75A1.75 1.75 0 0 1 4.75 5h14.5A1.75 1.75 0 0 1 21 6.75v10.5A1.75 1.75 0 0 1 19.25 19H4.75A1.75 1.75 0 0 1 3 17.25V6.75Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="m4 7 8 6 8-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "smtp":
      return <Server className={className} />;
    case "exchange":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
          <rect x="3" y="3" width="8.2" height="8.2" rx="1.4" />
          <rect x="12.8" y="3" width="8.2" height="8.2" rx="1.4" opacity="0.85" />
          <rect x="3" y="12.8" width="8.2" height="8.2" rx="1.4" opacity="0.7" />
          <rect x="12.8" y="12.8" width="8.2" height="8.2" rx="1.4" opacity="0.55" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.7-1.2A9 9 0 1 0 12 3Z"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9.5 9.2c.2-.4.5-.5.8-.5h.6c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .5-.1.7l-.5.6c.5.9 1.3 1.6 2.2 2.1l.6-.5c.2-.2.5-.2.7-.1l1.6.7c.3.1.4.3.4.5v.6c0 .3-.1.6-.5.8-.5.3-1.4.4-2.6-.1-1.9-.7-3.7-2.4-4.5-4.3-.5-1.1-.4-2-.1-2.5Z"
            fill="currentColor"
          />
        </svg>
      );
    case "claude":
    case "claude_api":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M12 2.5v19M4.2 7l15.6 10M19.8 7 4.2 17M7.5 3.3l9 17.4M16.5 3.3l-9 17.4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "antigravity":
    case "gemini_api":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M12 2.5 14.9 9l6.6 2.9-6.6 2.9L12 21.5l-2.9-6.7L2.5 11.9 9.1 9 12 2.5Z"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      );
    case "chatgpt":
    case "openai_api":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 3.5v17M4.6 7.8l14.8 8.4M19.4 7.8 4.6 16.2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "telegram":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M21 4 3.5 11.2c-.8.3-.8 1.4 0 1.7l4.5 1.5 1.8 5.3c.2.7 1.1.8 1.5.3l2.7-3.1 4.6 3.4c.6.4 1.5.1 1.7-.7L22.3 5.2c.2-.9-.6-1.6-1.3-1.2Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "messenger":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M12 3C6.8 3 3 6.6 3 11.4c0 2.6 1.3 4.9 3.4 6.4V21l3.1-1.7c.8.2 1.6.3 2.5.3 5.2 0 9-3.6 9-8.2S17.2 3 12 3Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="m7.5 13.2 3.2-3.4 2.4 2 3.4-3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "slack":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path d="M9 4v16M15 4v16M4 9h16M4 15h16" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </svg>
      );
    case "discord":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M7.5 6.5c2.8-1 6.2-1 9 0 1.8 2.4 2.5 5.6 2.2 9.2-1.5 1.4-3.2 2.2-5 2.5l-.8-1.6c-1.2.2-2.4.2-3.6 0L8.5 18.2c-1.8-.3-3.5-1.1-5-2.5-.3-3.6.4-6.8 2.2-9.2Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="9.5" cy="12" r="1.2" fill="currentColor" />
          <circle cx="14.5" cy="12" r="1.2" fill="currentColor" />
        </svg>
      );
    default:
      return <MessageCircle className={className} />;
  }
};
