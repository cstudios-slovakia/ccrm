import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
  MessageCircle,
  Pencil,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Server,
  Sparkles,
  Terminal,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  BOTMAN_DRIVER_SPECS,
  backlogSummary,
  deleteMailbox,
  draftFromMailbox,
  emptyMailboxDraft,
  getBotManWebhookUrl,
  getBotManWidgetSnippet,
  inferConnectorType,
  installAgentCli,
  isAgentConnector,
  isBotManConnector,
  isEmailConnector,
  listMailboxes,
  registerBotManWebhook,
  runMailbox,
  runSubscriptionAgent,
  saveMailbox,
  startAgentSubscriptionLogin,
  startWhatsAppDirectQr,
  pollWhatsAppDirectQr,
  stopWhatsAppDirectQr,
  submitAgentSubscriptionCode,
  testMailbox,
  type CompanyMailbox,
  type ConnectorEnvironment,
  type ConnectorType,
  type MailboxDraft,
  type MailboxFolderState,
  type MailboxList,
} from "../utils/companyMailboxes";
import { fetchModuleConfig, fetchSsoToken } from "./whatsapp/api/crmConnection";
import { WaaiClient } from "./whatsapp/api/waaiClient";
import { SectionCard } from "./settings/SectionCard";

interface Props {
  userLanguage?: "sk" | "hu" | "en";
  systemLanguage?: "sk" | "hu" | "en";
  users: { id?: string; name: string; email?: string; role?: string }[];
  showToast?: (message: string, type?: "success" | "error") => void;
}

type CategoryFilter = "all" | "email" | "whatsapp" | "agents";

const COPY = {
  en: {
    title: "External Connectors & Mailboxes",
    subtitle:
      "Connect Gmail, SMTP/IMAP, MS Exchange, WhatsApp (QR scan), and subscription-based AI agents (Claude, Google Antigravity, ChatGPT) in one unified list. Assign which CRM users can access each connection.",
    add: "Add Connector",
    none: "No external connectors configured yet. Click Add Connector to link Gmail, Exchange, WhatsApp, or an AI subscription.",
    filterAll: "All Connectors",
    filterEmail: "Email Channels",
    filterWhatsapp: "WhatsApp",
    filterAgents: "AI Agents (MCP)",
    catEmail: "EMAIL CHANNEL",
    catWhatsapp: "WHATSAPP MESSAGING",
    catAgents: "AI AGENT · MCP",
    edit: "Edit",
    remove: "Remove",
    confirmRemove: "Remove this connector? Existing filed timeline items remain intact.",
    fileNow: "File now",
    test: "Test connection",
    testing: "Testing…",
    testOk: "Connection verified.",
    saving: "Saving…",
    save: "Save Connector",
    cancel: "Cancel",
    active: "Active",
    paused: "Paused",
    name: "Display name",
    namePlaceholder: "Sales Gmail / Main WhatsApp / Claude Max Team",
    address: "Address",
    addressEmailPlaceholder: "sales@company.com",
    addressPhonePlaceholder: "+421 905 123 456",
    addressHandlePlaceholder: "team-subscription",
    connectorTypeLabel: "Select Connector Type",
    usersLabel: "Assigned CRM Users",
    usersHint: "Choose who can see and use this email, WhatsApp, or AI agent connection in the Communication view.",
    selectAllUsers: "Select all",
    clearUsers: "Clear",
    allAdminsDefault: "Admins only (no specific users selected)",
    since: "Backfill from date",
    sinceHint: "Leave empty to file the whole mailbox.",
    incoming: "Incoming mail (IMAP)",
    outgoing: "Outgoing mail (SMTP)",
    imapHost: "IMAP Server",
    smtpHost: "SMTP Server",
    port: "Port",
    security: "Encryption",
    login: "Username / Login",
    password: "Password",
    appPassword: "App Password",
    gmailHint:
      "Use a 16-character Google App Password (myaccount.google.com/apppasswords). IMAP and SMTP hosts are configured automatically.",
    exchangeModeLabel: "Exchange Auth Mode",
    exchangeModeImap: "Exchange IMAP / SMTP",
    exchangeModeGraph: "Microsoft 365 Graph (OAuth2 App)",
    exchangeUrlLabel: "Exchange / Office 365 Server URL",
    tenantId: "Azure Tenant ID",
    clientId: "App Client ID",
    clientSecret: "Client Secret",
    passwordKeep: "Leave unchanged to keep stored secret",
    selfSigned: "Accept self-signed certificate",
    caughtUp: "Caught up",
    backfilling: "Backfilling",
    idle: "Waiting for first run",
    filed: "filed",
    personalHeading: "Personal mailboxes (filing status)",
    noImap: "The PHP imap extension is not loaded on this server; IMAP mail filing cannot run until it is enabled.",
    waSectionTitle: "WhatsApp QR Code Pairing (WAAI)",
    waSectionDesc:
      "Scan the WhatsApp QR code with your phone (WhatsApp → Linked Devices → Link a Device) to start syncing messages.",
    waScanBtn: "Scan WhatsApp QR Code",
    waRescanBtn: "Re-pair via QR Code",
    waMarkPairedBtn: "Confirm QR Scanned & Connected",
    waConnectedBadge: "WhatsApp Linked",
    waQrRequiredBadge: "QR Scan Needed",
    waServiceUrlLabel: "WAAI Bridge URL (optional override)",
    agentSectionTitle: "Subscription Authentication (Marveen Runtime + CCRM MCP)",
    agentSectionDesc:
      "Runs on your subscription plan (not paid API billing) and operates on CCRM through CCRM's internal MCP server using each assigned user's permissions.",
    agentStartLogin: "Sign in with Subscription (OAuth)",
    agentOpenAuthUrl: "1. Open Provider Login Page",
    agentCodeLabel: "2. Paste Verification Code, Callback URL, or Subscription Token",
    agentCodePlaceholder: "Paste code / URL from login page or sk-ant-oat01-…",
    agentVerifyCode: "Verify & Connect",
    agentTokenLabel: "Subscription Token / Session (sk-ant-oat01-… or OAuth session)",
    agentModelLabel: "Preferred Model (optional)",
    agentEndpointLabel: "Remote Marveen Runner URL (optional, for shared hosting)",
    agentInstallCli: "Install CLI Binary",
    agentTestPromptBtn: "Test MCP Agent Run",
    agentReadyBadge: "Subscription Active",
    agentSetupNeededBadge: "Sign-in Needed",
    envLocalCli: "Runtime: Local Embedded Runner",
    envRemoteBridge: "Runtime: Remote Marveen Bridge",
    envCloudMcp: "Runtime: Cloud MCP + OAuth",
  },
  sk: {
    title: "Externé konektory a schránky",
    subtitle:
      "Pripojte Gmail, SMTP/IMAP, MS Exchange, WhatsApp (cez QR kód) a predplatených AI agentov (Claude, Google Antigravity, ChatGPT) v jednom farebne odlíšenom zozname a priraďte k nim používateľov.",
    add: "Pridať schránku",
    none: "Zatiaľ nie sú nastavené žiadne externé konektory. Kliknite na Pridať schránku pre prepojenie Gmailu, Exchange, WhatsAppu alebo AI predplatného.",
    filterAll: "Všetky",
    filterEmail: "E-mail",
    filterWhatsapp: "WhatsApp",
    filterAgents: "AI Agenti (MCP)",
    catEmail: "E-MAILOVÝ KANÁL",
    catWhatsapp: "WHATSAPP KOMUNIKÁCIA",
    catAgents: "AI AGENT · MCP",
    edit: "Upraviť",
    remove: "Odstrániť",
    confirmRemove: "Odstrániť tento konektor? Už založené položky na časových osiach zostanú zachované.",
    fileNow: "Spracovať teraz",
    test: "Otestovať spojenie",
    testing: "Testujem…",
    testOk: "Spojenie je funkčné.",
    saving: "Ukladám…",
    save: "Uložiť schránku",
    cancel: "Zrušiť",
    active: "Aktívny",
    paused: "Pozastavený",
    name: "Názov",
    namePlaceholder: "Obchod Gmail / Hlavný WhatsApp / Claude Max",
    address: "Adresa",
    addressEmailPlaceholder: "obchod@firma.sk",
    addressPhonePlaceholder: "+421 905 123 456",
    addressHandlePlaceholder: "firemne-predplatne",
    connectorTypeLabel: "Typ konektora",
    usersLabel: "Priradení používatelia CRM",
    usersHint: "Vyberte, ktorí používatelia uvidia a môžu používať tento e-mail, WhatsApp alebo AI agenta v Komunikácii.",
    selectAllUsers: "Vybrať všetkých",
    clearUsers: "Vyčistiť",
    allAdminsDefault: "Iba administrátori (žiadni priradení používatelia)",
    since: "Evidovať poštu od dátumu",
    sinceHint: "Nechajte prázdne pre celú schránku.",
    incoming: "Prichádzajúca pošta (IMAP)",
    outgoing: "Odchádzajúca pošta (SMTP)",
    imapHost: "Server IMAP",
    smtpHost: "Server SMTP",
    port: "Port",
    security: "Šifrovanie",
    login: "Prihlasovacie meno",
    password: "Heslo",
    appPassword: "Heslo aplikácie (App Password)",
    gmailHint:
      "Použite 16-miestne heslo aplikácie Google (myaccount.google.com/apppasswords). IMAP a SMTP servery sú prednastavené.",
    exchangeModeLabel: "Režim autentifikácie Exchange",
    exchangeModeImap: "Exchange IMAP / SMTP",
    exchangeModeGraph: "Microsoft 365 Graph (OAuth2 aplikácia)",
    exchangeUrlLabel: "Adresa servera Exchange / Office 365",
    tenantId: "Azure Tenant ID",
    clientId: "App Client ID",
    clientSecret: "Client Secret",
    passwordKeep: "Nechajte nezmenené pre zachovanie uloženého tajomstva",
    selfSigned: "Povoliť certifikát s vlastným podpisom",
    caughtUp: "Aktuálne",
    backfilling: "Dopĺňa sa história",
    idle: "Čaká na prvé spustenie",
    filed: "založených",
    personalHeading: "Osobné schránky (stav zakladania)",
    noImap: "Rozšírenie PHP imap nie je na serveri načítané; zakladanie e-mailov nemôže bežať.",
    waSectionTitle: "Párovanie WhatsApp cez QR kód (WAAI)",
    waSectionDesc:
      "Naskenujte QR kód telefónom (WhatsApp → Pripojené zariadenia → Pripojiť zariadenie) a spojenie sa okamžite spustí.",
    waScanBtn: "Naskenovať WhatsApp QR kód",
    waRescanBtn: "Znova spárovať cez QR kód",
    waMarkPairedBtn: "Potvrdiť naskenovanie QR kódu",
    waConnectedBadge: "WhatsApp pripojený",
    waQrRequiredBadge: "Vyžaduje QR kód",
    waServiceUrlLabel: "Adresa WAAI služby (voliteľné)",
    agentSectionTitle: "Prihlásenie cez predplatné (Marveen Runtime + CCRM MCP)",
    agentSectionDesc:
      "Beží na vašom predplatnom (nie cez platené API) a pracuje s CRM cez interný CCRM MCP server s oprávneniami priradených používateľov.",
    agentStartLogin: "Prihlásiť sa cez predplatné (OAuth)",
    agentOpenAuthUrl: "1. Otvoriť prihlasovaciu stránku",
    agentCodeLabel: "2. Vložte overovací kód alebo token predplatného",
    agentCodePlaceholder: "Vložte kód z prihlásenia alebo sk-ant-oat01-…",
    agentVerifyCode: "Overiť a pripojiť",
    agentTokenLabel: "Token predplatného / relácie (sk-ant-oat01-… alebo OAuth)",
    agentModelLabel: "Preferovaný model (voliteľné)",
    agentEndpointLabel: "Vzdialený Marveen Runner URL (voliteľné pre zdieľaný hosting)",
    agentInstallCli: "Nainštalovať CLI",
    agentTestPromptBtn: "Otestovať MCP agenta",
    agentReadyBadge: "Predplatné aktívne",
    agentSetupNeededBadge: "Vyžaduje prihlásenie",
    envLocalCli: "Runtime: Lokálny vstavaný runner",
    envRemoteBridge: "Runtime: Vzdialený Marveen Bridge",
    envCloudMcp: "Runtime: Cloud MCP + OAuth",
  },
  hu: {
    title: "Külső konektorok és postafiókok",
    subtitle:
      "Kapcsolja össze a Gmail, SMTP/IMAP, MS Exchange, WhatsApp (QR-kódos) és előfizetés-alapú AI ügynököket (Claude, Google Antigravity, ChatGPT) egyetlen színkódolt listában, felhasználói jogosultságokkal.",
    add: "Konektor hozzáadása",
    none: "Még nincs külső konektor beállítva. Kattintson a Konektor hozzáadása gombra Gmail, Exchange, WhatsApp vagy AI előfizetés bekötéséhez.",
    filterAll: "Összes",
    filterEmail: "E-mail",
    filterWhatsapp: "WhatsApp",
    filterAgents: "AI Előfizetések",
    catEmail: "E-MAIL CSATORNA",
    catWhatsapp: "WHATSAPP ÜZENETKÜLDÉS",
    catAgents: "AI ÜGYNÖK · MCP",
    edit: "Szerkesztés",
    remove: "Eltávolítás",
    confirmRemove: "Eltávolítja ezt a konektort? A már iktatott idővonal-elemek megmaradnak.",
    fileNow: "Iktatás most",
    test: "Kapcsolat tesztelése",
    testing: "Tesztelés…",
    testOk: "A kapcsolat működik.",
    saving: "Mentés…",
    save: "Konektor mentése",
    cancel: "Mégse",
    active: "Aktív",
    paused: "Szüneteltetve",
    name: "Megjelenített név",
    namePlaceholder: "Értékesítés Gmail / Központi WhatsApp / Claude Max",
    address: "Cím",
    addressEmailPlaceholder: "iroda@ceg.hu",
    addressPhonePlaceholder: "+36 30 123 4567",
    addressHandlePlaceholder: "csapat-elofizetes",
    connectorTypeLabel: "Konektor típusa",
    usersLabel: "Hozzárendelt CRM felhasználók",
    usersHint: "Állítsa be, mely felhasználók láthatják és használhatják ezt az e-mailt, WhatsAppot vagy AI ügynököt.",
    selectAllUsers: "Összes kijelölése",
    clearUsers: "Kijelölés törlése",
    allAdminsDefault: "Csak adminisztrátorok (nincs külön kijelölt felhasználó)",
    since: "Visszamenőleges iktatás kezdete",
    sinceHint: "Hagyja üresen a teljes postafiókhoz.",
    incoming: "Bejövő levelek (IMAP)",
    outgoing: "Kimenő levelek (SMTP)",
    imapHost: "IMAP kiszolgáló",
    smtpHost: "SMTP kiszolgáló",
    port: "Port",
    security: "Titkosítás",
    login: "Felhasználónév",
    password: "Jelszó",
    appPassword: "Alkalmazásjelszó (App Password)",
    gmailHint:
      "Használjon 16 karakteres Google Alkalmazásjelszót (myaccount.google.com/apppasswords). Az IMAP és SMTP szerverek automatikusan be vannak állítva.",
    exchangeModeLabel: "Exchange hitelesítési mód",
    exchangeModeImap: "Exchange IMAP / SMTP",
    exchangeModeGraph: "Microsoft 365 Graph (OAuth2 alkalmazás)",
    exchangeUrlLabel: "Exchange / Office 365 szerver URL",
    tenantId: "Azure Tenant ID",
    clientId: "App Client ID",
    clientSecret: "Client Secret",
    passwordKeep: "Hagyja változatlanul a mentett titok megtartásához",
    selfSigned: "Önaláírt tanúsítvány elfogadása",
    caughtUp: "Naprakész",
    backfilling: "Előzmények betöltése",
    idle: "Első futásra vár",
    filed: "iktatva",
    personalHeading: "Személyes postafiókok (iktatási állapot)",
    noImap: "A PHP imap kiterjesztés nincs betöltve a szerveren; az e-mail iktatás nem tud futni.",
    waSectionTitle: "WhatsApp QR-kódos párosítás (WAAI)",
    waSectionDesc:
      "Olvassa be a QR-kódot telefonjával (WhatsApp → Kapcsolt eszközök → Eszköz csatlakoztatása), és a kapcsolat azonnal elindul.",
    waScanBtn: "WhatsApp QR-kód beolvasása",
    waRescanBtn: "Újrapárosítás QR-kóddal",
    waMarkPairedBtn: "QR-kód beolvasás megerősítése",
    waConnectedBadge: "WhatsApp csatlakoztatva",
    waQrRequiredBadge: "QR-kód szükséges",
    waServiceUrlLabel: "WAAI szolgáltatás URL (opcionális)",
    agentSectionTitle: "Előfizetéses hitelesítés (Marveen Runtime + CCRM MCP)",
    agentSectionDesc:
      "Az Ön előfizetésével fut (nem fizetős API kulccsal), és a CCRM belső MCP szerverén keresztül dolgozik a hozzárendelt felhasználók jogosultságaival.",
    agentStartLogin: "Bejelentkezés előfizetéssel (OAuth)",
    agentOpenAuthUrl: "1. Bejelentkezési oldal megnyitása",
    agentCodeLabel: "2. Ellenőrző kód vagy előfizetési token beillesztése",
    agentCodePlaceholder: "Illessze be a kapott kódot vagy sk-ant-oat01-… tokent",
    agentVerifyCode: "Ellenőrzés és csatlakozás",
    agentTokenLabel: "Előfizetési token / munkamenet (sk-ant-oat01-… vagy OAuth)",
    agentModelLabel: "Preferált modell (opcionális)",
    agentEndpointLabel: "Távoli Marveen Runner URL (opcionális, megosztott tárhelyhez)",
    agentInstallCli: "CLI telepítése",
    agentTestPromptBtn: "MCP ügynök tesztelése",
    agentReadyBadge: "Előfizetés aktív",
    agentSetupNeededBadge: "Bejelentkezés szükséges",
    envLocalCli: "Runtime: Helyi beágyazott Marveen",
    envRemoteBridge: "Runtime: Távoli Marveen Bridge",
    envCloudMcp: "Runtime: Cloud MCP + OAuth",
  },
} as const;

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
];

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

export const CompanyMailboxSettings: React.FC<Props> = ({ userLanguage, systemLanguage, users, showToast }) => {
  const lang = userLanguage ?? systemLanguage ?? "en";
  const t = COPY[lang] ?? COPY.en;
  const [data, setData] = useState<MailboxList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [editing, setEditing] = useState<MailboxDraft | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "login" | "cli" | "agent_test" | string | null>(null);
  const [formMsg, setFormMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // WhatsApp direct WAAI QR pairing state
  const [waQrModalOpen, setWaQrModalOpen] = useState(false);
  const [waQrDataUrl, setWaQrDataUrl] = useState<string | null>(null);
  const [waPairingStatus, setWaPairingStatus] = useState<
    "idle" | "starting" | "pending_qr" | "authenticated" | "connected" | "error"
  >("idle");
  const [waPairingNote, setWaPairingNote] = useState<string | null>(null);
  const waStreamStopRef = useRef<(() => void) | null>(null);

  // Marveen Subscription OAuth wizard state
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [oauthCode, setOauthCode] = useState("");
  const [agentTestOutput, setAgentTestOutput] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [modalTypeMenuOpen, setModalTypeMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const modalTypeMenuRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listMailboxes());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    return () => {
      waStreamStopRef.current?.();
    };
  }, []);

  // Close slide-up modal on Escape
  useEffect(() => {
    if (!editing && !addMenuOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        if (modalTypeMenuOpen) {
          setModalTypeMenuOpen(false);
          return;
        }
        if (addMenuOpen) {
          setAddMenuOpen(false);
          return;
        }
        setEditing(null);
        setWaQrModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, addMenuOpen, modalTypeMenuOpen]);

  useEffect(() => {
    if (!addMenuOpen && !modalTypeMenuOpen) return;
    const onDocClick = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (addMenuOpen && addMenuRef.current && !addMenuRef.current.contains(target)) {
        setAddMenuOpen(false);
      }
      if (modalTypeMenuOpen && modalTypeMenuRef.current && !modalTypeMenuRef.current.contains(target)) {
        setModalTypeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [addMenuOpen, modalTypeMenuOpen]);

  const userMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string; email?: string; role?: string }>();
    for (const u of users) {
      const uid = u.id || u.name;
      m.set(uid, { ...u, id: uid });
    }
    return m;
  }, [users]);

  const connectors = useMemo(() => {
    const list = data?.mailboxes ?? [];
    return list.map((b) => ({
      ...b,
      connectorType: inferConnectorType(b.settings, b.address, b.connectorType),
      userIds:
        b.userIds && b.userIds.length > 0
          ? b.userIds
          : b.settings?.userIds && b.settings.userIds.length > 0
            ? b.settings.userIds
            : b.ownerUserId
              ? [b.ownerUserId]
              : [],
    }));
  }, [data]);

  const filteredConnectors = useMemo(() => {
    if (categoryFilter === "all") return connectors;
    return connectors.filter((c) => PROVIDERS[c.connectorType]?.category === categoryFilter);
  }, [connectors, categoryFilter]);

  const counts = useMemo(() => {
    let email = 0;
    let whatsapp = 0;
    let agents = 0;
    for (const c of connectors) {
      const cat = PROVIDERS[c.connectorType]?.category;
      if (cat === "email") email++;
      else if (cat === "whatsapp") whatsapp++;
      else if (cat === "agents") agents++;
    }
    return { all: connectors.length, email, whatsapp, agents };
  }, [connectors]);

  const setField = <K extends keyof MailboxDraft>(k: K, v: MailboxDraft[K]) =>
    setEditing((d) => (d ? { ...d, [k]: v } : d));

  const setSetting = <K extends keyof MailboxDraft["settings"]>(k: K, v: MailboxDraft["settings"][K]) =>
    setEditing((d) => (d ? { ...d, settings: { ...d.settings, [k]: v } } : d));

  const switchConnectorType = (nextType: ConnectorType) => {
    setFormMsg(null);
    setOauthUrl(null);
    setOauthCode("");
    setAgentTestOutput(null);
    setWaQrModalOpen(false);
    setEditing((prev) => {
      const fresh = emptyMailboxDraft(nextType);
      if (!prev) return fresh;
      return {
        ...fresh,
        id: prev.id,
        name: prev.name,
        userIds: prev.userIds,
        ownerUserId: prev.ownerUserId,
        isActive: prev.isActive,
      };
    });
  };

  const toggleUserId = (uid: string) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const exists = prev.userIds.includes(uid);
      const next = exists ? prev.userIds.filter((id) => id !== uid) : [...prev.userIds, uid];
      return {
        ...prev,
        userIds: next,
        ownerUserId: next[0] || "",
        settings: { ...prev.settings, userIds: next },
      };
    });
  };

  const cancelWhatsAppQrPairing = () => {
    waStreamStopRef.current?.();
    waStreamStopRef.current = null;
    if (editing?.settings.waAccountId) {
      void stopWhatsAppDirectQr({
        id: editing.id || undefined,
        accountId: editing.settings.waAccountId,
      }).catch(() => undefined);
    }
    setWaQrModalOpen(false);
    setWaPairingStatus("idle");
  };

  const startWhatsAppQrPairing = async () => {
    if (!editing) return;
    waStreamStopRef.current?.();
    waStreamStopRef.current = null;
    setWaQrModalOpen(true);
    setWaQrDataUrl(null);
    setWaPairingStatus("starting");
    setWaPairingNote("Connecting to WhatsApp via WAAI & requesting live multi-device QR code…");
    setFormMsg(null);

    // 1. Try external WAAI module API (/wa-accounts + /wa-accounts/:id/stream) if configured
    try {
      const cfg = await fetchModuleConfig();
      const customBase = editing.settings.waServiceUrl?.trim();
      const base = customBase
        ? customBase.startsWith("http") && !customBase.includes("/api/ccrm/v1")
          ? `${customBase.replace(/\/+$/, "")}/api/ccrm/v1`
          : customBase
        : cfg.configured
          ? cfg.base
          : null;

      if (base && cfg.configured) {
        const client = new WaaiClient({ base, fetchSsoToken: () => fetchSsoToken() });
        const started = await client.post<{ account_id: string; worker_offline: boolean }>("/wa-accounts");
        if (!started.worker_offline && started.account_id) {
          const accId = started.account_id;
          setSetting("waAccountId", accId);
          const ctrl = new AbortController();
          waStreamStopRef.current = () => ctrl.abort();

          void client
            .stream(
              `/wa-accounts/${encodeURIComponent(accId)}/stream`,
              (event) => {
                if (event.event === "qr") {
                  try {
                    const parsed = JSON.parse(event.data) as { qr?: string } | string;
                    const rawQr = typeof parsed === "string" ? parsed : parsed.qr ?? event.data;
                    const dataUrl = rawQr.startsWith("data:") ? rawQr : `data:image/png;base64,${rawQr}`;
                    setWaQrDataUrl(dataUrl);
                    setWaPairingStatus("pending_qr");
                    setWaPairingNote("Live WAAI WhatsApp QR ready — scan with WhatsApp on your phone.");
                  } catch {
                    const dataUrl = event.data.startsWith("data:")
                      ? event.data
                      : `data:image/png;base64,${event.data}`;
                    setWaQrDataUrl(dataUrl);
                    setWaPairingStatus("pending_qr");
                  }
                }
                if (event.event === "status") {
                  try {
                    const st = JSON.parse(event.data) as { status?: string; phone_number?: string; display_name?: string };
                    if (st.status === "connected") {
                      ctrl.abort();
                      setEditing((prev) =>
                        prev
                          ? {
                              ...prev,
                              name: prev.name.trim() || st.display_name || "WhatsApp (WAAI)",
                              address: prev.address.trim() || st.phone_number || `whatsapp:${accId}`,
                              settings: {
                                ...prev.settings,
                                waAccountId: accId,
                                waStatus: "connected",
                              },
                            }
                          : prev,
                      );
                      setWaPairingStatus("connected");
                      setWaQrModalOpen(false);
                      setFormMsg({ kind: "ok", text: "WhatsApp device linked and connected via WAAI." });
                    }
                  } catch {
                    /* ignore */
                  }
                }
              },
              { signal: ctrl.signal },
            )
            .catch(() => undefined);
          return;
        }
      }
    } catch {
      // External WAAI server not configured or unreachable — use CCRM's built-in WAAI Baileys QR worker
    }

    // 2. Direct WAAI Baileys Multi-Device QR Worker (wss://web.whatsapp.com/ws/chat)
    try {
      const candidateAccId =
        editing.settings.waAccountId?.trim() ||
        (editing.id ? `wa-${editing.id}` : `wa-${Date.now().toString(36)}`);

      const started = await startWhatsAppDirectQr({
        id: editing.id || undefined,
        accountId: candidateAccId,
        reset: true,
      });

      const accId = started.accountId || candidateAccId;
      setSetting("waAccountId", accId);

      if (started.qr) {
        setWaQrDataUrl(started.qr);
        setWaPairingStatus("pending_qr");
        setWaPairingNote("Live WhatsApp QR code active — point your phone camera (Linked Devices) at the QR code.");
      } else if (started.status === "connected") {
        setSetting("waStatus", "connected");
        setWaPairingStatus("connected");
        setWaQrModalOpen(false);
        setFormMsg({ kind: "ok", text: "WhatsApp account is connected via WAAI." });
        return;
      } else if (started.status === "error") {
        setWaPairingStatus("error");
        setWaPairingNote(started.error || "Failed to generate WhatsApp QR code.");
        return;
      }

      let stopped = false;
      const timer = window.setInterval(async () => {
        if (stopped) return;
        try {
          const poll = await pollWhatsAppDirectQr({
            id: editing.id || undefined,
            accountId: accId,
          });
          if (stopped) return;

          if (poll.qr) {
            setWaQrDataUrl(poll.qr);
            setWaPairingStatus("pending_qr");
            setWaPairingNote("Live WhatsApp QR code active (auto-refreshes every 20s) — scan with WhatsApp.");
          }
          if (poll.status === "authenticated") {
            setWaPairingStatus("authenticated");
            setWaPairingNote("QR code scanned on phone! Finalizing WhatsApp multi-device link…");
          }
          if (poll.status === "connected") {
            stopped = true;
            window.clearInterval(timer);
            setEditing((prev) =>
              prev
                ? {
                    ...prev,
                    name: prev.name.trim() || poll.displayName || "WhatsApp (WAAI)",
                    address:
                      !prev.address.trim() || prev.address.startsWith("whatsapp:")
                        ? poll.phone || `whatsapp:${accId}`
                        : prev.address,
                    settings: {
                      ...prev.settings,
                      waAccountId: accId,
                      waStatus: "connected",
                    },
                  }
                : prev,
            );
            setWaPairingStatus("connected");
            setWaQrModalOpen(false);
            setFormMsg({
              kind: "ok",
              text: `WhatsApp connected via WAAI${poll.phone ? ` (${poll.phone})` : ""}! Click Save Connector to finish.`,
            });
          } else if (poll.status === "error" || poll.status === "expired") {
            stopped = true;
            window.clearInterval(timer);
            setWaPairingStatus("error");
            setWaPairingNote(poll.error || "QR code expired. Click Refresh QR Code to generate a new one.");
          }
        } catch {
          // ignore transient poll network hiccup
        }
      }, 1800);

      waStreamStopRef.current = () => {
        stopped = true;
        window.clearInterval(timer);
      };
    } catch (err: unknown) {
      setWaPairingStatus("error");
      setWaPairingNote(err instanceof Error ? err.message : "Failed to start WAAI WhatsApp QR worker.");
    }
  };

  const onStartSubscriptionOAuth = async () => {
    if (!editing) return;
    setBusy("login");
    setFormMsg(null);
    try {
      const res = await startAgentSubscriptionLogin({
        id: editing.id || undefined,
        connectorType: editing.connectorType,
        agentEndpoint: editing.settings.agentEndpoint,
      });
      setOauthUrl(res.url);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e: unknown) {
      setFormMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const onSubmitSubscriptionCode = async () => {
    if (!editing || !oauthCode.trim()) return;
    setBusy("login");
    setFormMsg(null);
    try {
      const res = await submitAgentSubscriptionCode({
        id: editing.id || undefined,
        connectorType: editing.connectorType,
        code: oauthCode.trim(),
        agentEndpoint: editing.settings.agentEndpoint,
      });
      setSetting("subscriptionToken", res.token || oauthCode.trim());
      setOauthCode("");
      setOauthUrl(null);
      setFormMsg({ kind: "ok", text: "Subscription authenticated and verified with Marveen runtime." });
    } catch (e: unknown) {
      setFormMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const onInstallCli = async (provider: ConnectorType) => {
    setBusy("cli");
    setFormMsg(null);
    try {
      const res = await installAgentCli(provider);
      if (res.environment && data) {
        setData({ ...data, environment: res.environment });
      }
      setFormMsg({ kind: "ok", text: `${PROVIDERS[provider].label} CLI binary is ready.` });
    } catch (e: unknown) {
      setFormMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const onTest = async () => {
    if (!editing) return;
    setBusy("test");
    setFormMsg(null);
    try {
      const res = await testMailbox(editing);
      setFormMsg({ kind: "ok", text: res.detail || t.testOk });
    } catch (e: unknown) {
      setFormMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const onRegisterBotManWebhook = async () => {
    if (!editing || !isBotManConnector(editing.connectorType)) return;
    setBusy("webhook");
    setFormMsg(null);
    try {
      const webhookUrl = getBotManWebhookUrl(editing.id || "draft", editing.connectorType);
      const res = await registerBotManWebhook(editing, webhookUrl);
      setSetting("botmanWebhookRegistered", true);
      setFormMsg({ kind: "ok", text: res.detail || `Webhook registered: ${webhookUrl}` });
    } catch (e: unknown) {
      setFormMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy("save");
    setFormMsg(null);
    try {
      await saveMailbox(editing);
      setEditing(null);
      setWaQrModalOpen(false);
      showToast?.(t.save, "success");
      await reload();
      window.dispatchEvent(new Event("ccrm:connectors-updated"));
    } catch (err: unknown) {
      setFormMsg({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async (box: CompanyMailbox) => {
    if (!window.confirm(t.confirmRemove)) return;
    setBusy(box.id);
    try {
      await deleteMailbox(box.id);
      await reload();
      window.dispatchEvent(new Event("ccrm:connectors-updated"));
    } catch (e: unknown) {
      showToast?.(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const onRunNow = async (box: CompanyMailbox) => {
    setBusy(box.id);
    try {
      const res = await runMailbox(box.id);
      const err = res.run?.errors?.[0];
      if (err) showToast?.(err, "error");
      else showToast?.(`${res.run?.filed ?? 0} ${t.filed}`, "success");
      await reload();
    } catch (e: unknown) {
      showToast?.(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const onTestSavedAgentMcp = async (box: CompanyMailbox) => {
    setBusy(box.id);
    try {
      const res = await runSubscriptionAgent({
        id: box.id,
        prompt: "Verify CCRM MCP connection and reply with OK.",
      });
      showToast?.(res.text || "Agent MCP connection verified.", "success");
      await reload();
    } catch (e: unknown) {
      showToast?.(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const renderCategoryPill = (cat: "email" | "whatsapp" | "agents") => {
    if (cat === "email") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-micro font-bold tracking-wider uppercase bg-slate-900/5 dark:bg-white/10 text-slate-700 dark:text-slate-200">
          <Mail className="w-3 h-3 opacity-80" /> {t.catEmail}
        </span>
      );
    }
    if (cat === "whatsapp") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-micro font-bold tracking-wider uppercase bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
          <MessageCircle className="w-3 h-3" /> {t.catWhatsapp}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-micro font-bold tracking-wider uppercase bg-violet-500/15 text-violet-800 dark:text-violet-300">
        <Bot className="w-3 h-3" /> {t.catAgents}
      </span>
    );
  };

  const renderTechnicalSpec = (box: CompanyMailbox & { connectorType: ConnectorType }) => {
    if (box.connectorType === "gmail") {
      return "IMAP · imap.gmail.com:993 · App Password";
    }
    if (box.connectorType === "exchange") {
      return box.settings?.exchangeMode === "graph"
        ? "Microsoft 365 Graph API (OAuth2)"
        : `Exchange · ${box.settings?.imapHost || "outlook.office365.com"}`;
    }
    if (box.connectorType === "smtp") {
      return `IMAP · ${box.settings?.imapHost || "custom"}:${box.settings?.imapPort || "993"}`;
    }
    if (box.connectorType === "whatsapp") {
      return `WAAI QR Session · ${box.settings?.waAccountId || "Ready to pair"}`;
    }
    if (isBotManConnector(box.connectorType)) {
      const spec = BOTMAN_DRIVER_SPECS[box.connectorType];
      return `${spec.driverClass.replace("BotMan\\Drivers\\", "BotMan · ")} · ${spec.supportsLocalPolling ? "Webhook + Poll" : "Webhook"}`;
    }
    return `Subscription OAuth · CCRM MCP${box.settings?.agentModel ? ` · ${box.settings.agentModel}` : ""}`;
  };

  const renderStatusPill = (box: CompanyMailbox & { connectorType: ConnectorType }) => {
    const folders = box.folders ?? [];
    const folderErr = folders.find((f) => f.lastError)?.lastError;
    const err = box.lastError || folderErr;
    if (err) {
      return (
        <span
          data-testid="company-mailbox-error"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-micro font-semibold text-rose-600 dark:text-rose-400"
          title={err}
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate max-w-[24ch]">{err}</span>
        </span>
      );
    }

    if (box.connectorType === "whatsapp") {
      const connected = box.settings?.waStatus === "connected" || Boolean(box.settings?.waAccountId);
      return connected ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-micro font-semibold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5" /> {t.waConnectedBadge}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-micro font-semibold text-amber-700 dark:text-amber-300">
          <QrCode className="w-3.5 h-3.5" /> {t.waQrRequiredBadge}
        </span>
      );
    }

    if (isBotManConnector(box.connectorType)) {
      const ready =
        box.connectorType === "webchat" ||
        box.connectorType === "messenger" ||
        Boolean(box.settings?.botmanToken || box.settings?.botmanAppId);
      return ready ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-micro font-semibold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5" /> BotMan Active
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-micro font-semibold text-amber-700 dark:text-amber-300">
          <KeyRound className="w-3.5 h-3.5" /> Token Needed
        </span>
      );
    }

    if (isAgentConnector(box.connectorType)) {
      const hasToken = Boolean(box.settings?.subscriptionToken);
      return hasToken ? (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-micro font-semibold text-emerald-700 dark:text-emerald-300">
          <Sparkles className="w-3.5 h-3.5" /> {t.agentReadyBadge}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-micro font-semibold text-amber-700 dark:text-amber-300">
          <KeyRound className="w-3.5 h-3.5" /> {t.agentSetupNeededBadge}
        </span>
      );
    }

    const s = backlogSummary(folders);
    if (!s.started) {
      return <span className="text-micro text-slate-400">{t.idle}</span>;
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-micro text-slate-700 dark:text-slate-300">
        {s.caughtUp ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        ) : (
          <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
        )}
        <span>{s.caughtUp ? t.caughtUp : t.backfilling}</span>
        <span className="text-slate-400">
          · {s.filed} {t.filed}
        </span>
      </span>
    );
  };

  const renderEnvBadge = (env?: ConnectorEnvironment) => {
    if (!env) return null;
    const label =
      env.mode === "local_cli"
        ? t.envLocalCli
        : env.mode === "remote_bridge"
          ? t.envRemoteBridge
          : t.envCloudMcp;
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-micro font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700">
        <Terminal className="w-3 h-3 text-indigo-500" />
        {label}
      </span>
    );
  };

  const inp =
    "mt-1 w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-ui text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-normal";
  const lbl = "block type-overline text-slate-600 dark:text-slate-300";

  const activeMeta = editing ? PROVIDERS[editing.connectorType] ?? PROVIDERS.smtp : PROVIDERS.smtp;

  return (
    <div className="space-y-4" data-testid="company-mailboxes">
      <SectionCard
        title={t.title}
        description={t.subtitle}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {renderEnvBadge(data?.environment)}
            <button
              type="button"
              onClick={() => {
                setFormMsg(null);
                setEditing(emptyMailboxDraft("smtp"));
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-caption font-semibold shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> {t.add}
            </button>
          </div>
        }
      >
        {data && data.imapAvailable === false && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-caption">
            <AlertCircle className="w-4 h-4 shrink-0" /> {t.noImap}
          </div>
        )}

        {error && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-caption">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* Filter Bar & Add Connection Dropdown */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/60 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "all", label: `${t.filterAll} (${counts.all})` },
                { id: "email", label: `${t.filterEmail} (${counts.email})` },
                { id: "whatsapp", label: `${t.filterWhatsapp} (${counts.whatsapp})` },
                { id: "agents", label: `${t.filterAgents} (${counts.agents})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-micro font-semibold transition-colors ${
                  categoryFilter === tab.id
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700/70"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative" ref={addMenuRef}>
            <button
              type="button"
              data-testid="add-connector-dropdown-btn"
              onClick={() => setAddMenuOpen((v) => !v)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 text-caption font-semibold text-slate-800 dark:text-slate-100 shadow-2xs transition-all"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>{t.add}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${addMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {addMenuOpen && (
              <div
                data-testid="add-connector-dropdown-menu"
                className="absolute right-0 mt-1.5 w-72 max-h-96 overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 shadow-xl z-50 p-1.5 space-y-1.5"
              >
                {(
                  [
                    { cat: "email" as const, title: t.filterEmail },
                    { cat: "whatsapp" as const, title: `${t.filterWhatsapp} & BotMan` },
                    { cat: "agents" as const, title: t.filterAgents },
                  ]
                ).map((group) => {
                  const items = ALL_PROVIDER_TYPES.filter((p) => PROVIDERS[p].category === group.cat);
                  return (
                    <div key={group.cat}>
                      <div className="px-2.5 py-1 text-micro font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {group.title}
                      </div>
                      <div className="space-y-0.5">
                        {items.map((pType) => {
                          const meta = PROVIDERS[pType];
                          return (
                            <button
                              key={pType}
                              type="button"
                              data-testid={`quick-add-${pType}`}
                              onClick={() => {
                                setAddMenuOpen(false);
                                setFormMsg(null);
                                setEditing(emptyMailboxDraft(pType));
                              }}
                              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                            >
                              <div
                                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${meta.iconBg}`}
                              >
                                <ProviderLogo type={pType} className="w-3.5 h-3.5" />
                              </div>
                              <span className="text-caption font-semibold text-slate-800 dark:text-slate-100 truncate">
                                {meta.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Unified Color-Coded Connector List with High Visual Distinction */}
        {loading && !data ? (
          <div className="py-6 flex items-center justify-center text-slate-400 text-caption gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : filteredConnectors.length === 0 ? (
          <p className="text-caption text-slate-500 dark:text-slate-400 py-3">{t.none}</p>
        ) : (
          <div className="space-y-2.5">
            {filteredConnectors.map((box) => {
              const meta = PROVIDERS[box.connectorType] ?? PROVIDERS.smtp;
              const assignedUsers = box.userIds
                .map((uid) => userMap.get(uid))
                .filter((u): u is NonNullable<typeof u> => Boolean(u));

              return (
                <div
                  key={box.id}
                  data-testid={`company-mailbox-${box.id}`}
                  className={`p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 ${meta.rowBorder} ${meta.rowBg} ${meta.rowTint} flex flex-wrap items-center justify-between gap-3 transition-all shadow-2xs`}
                >
                  {/* Left: Distinct Logo + Category Pill + Provider Pill + Name + Spec + Users */}
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${meta.iconBg}`}
                      title={meta.label}
                    >
                      <ProviderLogo type={box.connectorType} className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      {/* Top badge strip: Category + Provider + Technical Spec */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {renderCategoryPill(meta.category)}
                        <span className={`px-2 py-0.5 rounded-md text-micro font-bold ${meta.badgeClass}`}>
                          {meta.label}
                        </span>
                        <span className="text-micro text-slate-400 dark:text-slate-500 font-mono hidden sm:inline">
                          {renderTechnicalSpec(box)}
                        </span>
                      </div>

                      {/* Main Title & Account Handle */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body font-bold text-slate-900 dark:text-white truncate">
                          {box.name}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900/5 dark:bg-white/5 text-caption text-slate-600 dark:text-slate-300 font-mono truncate">
                          {box.address}
                        </span>
                        {!box.isActive && (
                          <span className="px-2 py-0.5 rounded-full text-micro font-semibold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {t.paused}
                          </span>
                        )}
                      </div>

                      {/* Assigned Users Chips */}
                      <div className="pt-0.5 flex flex-wrap items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {assignedUsers.length === 0 ? (
                          <span className="text-micro text-slate-400">{t.allAdminsDefault}</span>
                        ) : (
                          assignedUsers.map((u) => (
                            <span
                              key={u.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-semibold bg-white/90 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/90 dark:border-slate-700 shadow-2xs"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                              {u.name}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Status + Context Actions */}
                  <div className="flex items-center gap-3">
                    {renderStatusPill(box)}
                    <div className="flex items-center gap-1">
                      {isEmailConnector(box.connectorType) && (
                        <button
                          type="button"
                          onClick={() => onRunNow(box)}
                          disabled={busy === box.id}
                          title={t.fileNow}
                          className="p-2 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-white/80 dark:hover:bg-slate-800 disabled:opacity-40"
                        >
                          {busy === box.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      {box.connectorType === "whatsapp" && (
                        <button
                          type="button"
                          onClick={() => {
                            const d = draftFromMailbox(box);
                            setEditing(d);
                            setTimeout(() => void startWhatsAppQrPairing(), 50);
                          }}
                          title={t.waScanBtn}
                          className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-500/15"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                      )}
                      {isAgentConnector(box.connectorType) && (
                        <button
                          type="button"
                          onClick={() => onTestSavedAgentMcp(box)}
                          disabled={busy === box.id}
                          title={t.agentTestPromptBtn}
                          className="p-2 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 disabled:opacity-40"
                        >
                          {busy === box.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setFormMsg(null);
                          setEditing(draftFromMailbox(box));
                        }}
                        title={t.edit}
                        className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white/80 dark:hover:bg-slate-800"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(box)}
                        disabled={busy === box.id}
                        title={t.remove}
                        className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-500/10 disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Personal Mailboxes Filing Status Footer */}
        {data && Array.isArray(data.userMailboxes) && data.userMailboxes.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-800">
            <div className="type-overline text-slate-500 dark:text-slate-400 mb-2">
              {t.personalHeading}
            </div>
            <div className="space-y-1.5">
              {data.userMailboxes.map((u) => {
                const uFolders = u.folders ?? [];
                const err = uFolders.find((f: MailboxFolderState) => f.lastError)?.lastError;
                const s = backlogSummary(uFolders);
                return (
                  <div key={u.id} className="flex items-center justify-between text-caption">
                    <span className="text-slate-700 dark:text-slate-300">
                      {u.name} <span className="text-slate-400 font-mono">({u.email})</span>
                    </span>
                    {err ? (
                      <span
                        className="inline-flex items-center gap-1 text-micro text-rose-600 dark:text-rose-400"
                        title={err}
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span className="truncate max-w-[28ch]">{err}</span>
                      </span>
                    ) : (
                      <span className="text-micro text-slate-500">
                        {s.caughtUp ? t.caughtUp : t.backfilling} · {s.filed} {t.filed}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Color-Coded Bottom Slide-Up Popup Modal for Creating / Editing Credentials */}
      {editing && (
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditing(null);
              setWaQrModalOpen(false);
            }
          }}
        >
          <form
            data-testid="company-mailbox-form"
            onSubmit={onSave}
            className={`w-full max-w-4xl max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200/80 dark:border-slate-800 ${activeMeta.modalBorder} overflow-hidden animate-slide-up`}
          >
            {/* Color-Coded Modal Header */}
            <div className={`shrink-0 px-6 py-4 flex items-center justify-between gap-3 ${activeMeta.modalHeaderBg}`}>
              <div className="flex items-center gap-3.5 min-w-0">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${activeMeta.iconBg}`}>
                  <ProviderLogo type={editing.connectorType} className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {renderCategoryPill(activeMeta.category)}
                    <span className={`px-2 py-0.5 rounded-md text-micro font-bold ${activeMeta.badgeClass}`}>
                      {activeMeta.label}
                    </span>
                  </div>
                  <h3 className="text-body font-bold text-slate-900 dark:text-white truncate mt-0.5">
                    {editing.id
                      ? `${t.edit}: ${editing.name || editing.address}`
                      : `${t.add} — ${activeMeta.label}`}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setWaQrModalOpen(false);
                }}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="p-6 min-h-0 overflow-y-auto space-y-5 flex-1">
              {/* Connector Type Dropdown Selector */}
              <div className="relative" ref={modalTypeMenuRef}>
                <span className={lbl}>{t.connectorTypeLabel}</span>
                <button
                  type="button"
                  data-testid="modal-connector-type-dropdown"
                  onClick={() => setModalTypeMenuOpen((v) => !v)}
                  className="mt-1.5 w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 text-left transition-all shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${activeMeta.iconBg}`}>
                      <ProviderLogo type={editing.connectorType} className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex flex-wrap items-center gap-2">
                      <span className="text-ui font-bold text-slate-900 dark:text-white truncate">
                        {activeMeta.label}
                      </span>
                      {renderCategoryPill(activeMeta.category)}
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${modalTypeMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {modalTypeMenuOpen && (
                  <div
                    data-testid="modal-connector-type-menu"
                    className="absolute left-0 right-0 mt-1.5 max-h-80 overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 shadow-2xl z-50 p-2 space-y-2"
                  >
                    {(
                      [
                        { cat: "email" as const, title: t.filterEmail },
                        { cat: "whatsapp" as const, title: `${t.filterWhatsapp} & BotMan` },
                        { cat: "agents" as const, title: t.filterAgents },
                      ]
                    ).map((group) => {
                      const items = ALL_PROVIDER_TYPES.filter((p) => PROVIDERS[p].category === group.cat);
                      return (
                        <div key={group.cat}>
                          <div className="px-2.5 py-1 text-micro font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {group.title}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                            {items.map((pType) => {
                              const meta = PROVIDERS[pType];
                              const selected = editing.connectorType === pType;
                              return (
                                <button
                                  key={pType}
                                  type="button"
                                  data-testid={`connector-type-${pType}`}
                                  onClick={() => {
                                    setModalTypeMenuOpen(false);
                                    switchConnectorType(pType);
                                  }}
                                  className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-left transition-all ${
                                    selected
                                      ? `${meta.badgeClass} ${meta.accentRing}`
                                      : "hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-100"
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div
                                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.iconBg}`}
                                    >
                                      <ProviderLogo type={pType} className="w-4 h-4" />
                                    </div>
                                    <span className="text-caption font-semibold truncate">{meta.label}</span>
                                  </div>
                                  {selected && <Check className="w-4 h-4 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Common Identity Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={lbl}>
                    {t.name}
                    <input
                      className={inp}
                      autoComplete="off"
                      value={editing.name}
                      onChange={(e) => setField("name", e.target.value)}
                      placeholder={t.namePlaceholder}
                      required
                    />
                  </label>
                </div>
                <div>
                  <label className={lbl}>
                    {t.address}
                    <input
                      className={inp}
                      autoComplete="off"
                      type={isEmailConnector(editing.connectorType) ? "email" : "text"}
                      value={editing.address}
                      onChange={(e) => {
                        const addr = e.target.value;
                        setEditing((d) =>
                          d
                            ? {
                                ...d,
                                address: addr,
                                settings: {
                                  ...d.settings,
                                  imapUsername: d.settings.imapUsername || addr,
                                },
                              }
                            : d,
                        );
                      }}
                      placeholder={
                        isEmailConnector(editing.connectorType)
                          ? t.addressEmailPlaceholder
                          : editing.connectorType === "whatsapp"
                            ? t.addressPhonePlaceholder
                            : t.addressHandlePlaceholder
                      }
                      required={isEmailConnector(editing.connectorType)}
                    />
                  </label>
                </div>
                {isEmailConnector(editing.connectorType) && (
                  <div>
                    <label className={lbl}>
                      {t.since}
                      <input
                        className={inp}
                        type="date"
                        value={editing.backfillSince}
                        onChange={(e) => setField("backfillSince", e.target.value)}
                      />
                    </label>
                    <p className="text-micro text-slate-400 mt-0.5">{t.sinceHint}</p>
                  </div>
                )}
              </div>

              {/* Multi-User Assignment Picker (`userIds[]`) */}
              <div className="p-3.5 rounded-2xl bg-slate-50/90 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="type-label text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-indigo-500" />
                      {t.usersLabel} ({editing.userIds.length})
                    </div>
                    <p className="text-micro text-slate-500 dark:text-slate-400">{t.usersHint}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const allIds = users.map((u) => u.id || u.name).filter(Boolean);
                        setEditing((d) =>
                          d
                            ? {
                                ...d,
                                userIds: allIds,
                                ownerUserId: allIds[0] || "",
                                settings: { ...d.settings, userIds: allIds },
                              }
                            : d,
                        );
                      }}
                      className="px-2.5 py-1 rounded-lg text-micro font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100"
                    >
                      {t.selectAllUsers}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditing((d) =>
                          d
                            ? {
                                ...d,
                                userIds: [],
                                ownerUserId: "",
                                settings: { ...d.settings, userIds: [] },
                              }
                            : d,
                        )
                      }
                      className="px-2.5 py-1 rounded-lg text-micro font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100"
                    >
                      {t.clearUsers}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {users.map((u) => {
                    const uid = u.id || u.name;
                    const selected = editing.userIds.includes(uid);
                    return (
                      <button
                        key={uid}
                        type="button"
                        data-testid={`assign-user-${uid}`}
                        onClick={() => toggleUserId(uid)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold border transition-all ${
                          selected
                            ? `${activeMeta.accentBtn} border-transparent shadow-2xs`
                            : "bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400"
                        }`}
                      >
                        {selected && <Check className="w-3.5 h-3.5" />}
                        <span>{u.name}</span>
                        {u.role && <span className="text-micro opacity-75">({u.role})</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 1. GMAIL FORM */}
              {editing.connectorType === "gmail" && (
                <div className="p-4 rounded-2xl bg-rose-500/[0.05] border border-rose-500/25 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="type-label text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                      <Mail className="w-4 h-4" /> Gmail App Password Setup
                    </span>
                    <a
                      href="https://myaccount.google.com/apppasswords"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-micro font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                    >
                      Google App Passwords <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-micro text-slate-600 dark:text-slate-300">{t.gmailHint}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>
                        {t.login}
                        <input
                          className={inp}
                          value={editing.settings.imapUsername || editing.address}
                          onChange={(e) => {
                            setSetting("imapUsername", e.target.value);
                            setSetting("smtpUsername", e.target.value);
                          }}
                          placeholder="you@gmail.com"
                        />
                      </label>
                    </div>
                    <div>
                      <label className={lbl}>
                        {t.appPassword}
                        <input
                          className={inp}
                          type="password"
                          value={editing.settings.imapPassword}
                          onChange={(e) => {
                            setSetting("imapPassword", e.target.value);
                            setSetting("smtpPassword", e.target.value);
                          }}
                          placeholder={editing.id ? t.passwordKeep : "xxxx xxxx xxxx xxxx"}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. SMTP / IMAP FORM */}
              {editing.connectorType === "smtp" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2.5 p-3.5 rounded-2xl bg-sky-500/[0.04] dark:bg-slate-800/40 border border-sky-500/20">
                    <div className="type-label text-sky-700 dark:text-sky-300">{t.incoming}</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className={lbl}>
                          {t.imapHost}
                          <input
                            className={inp}
                            value={editing.settings.imapHost}
                            onChange={(e) => setSetting("imapHost", e.target.value)}
                            placeholder="imap.domain.tld"
                            required
                          />
                        </label>
                      </div>
                      <div>
                        <label className={lbl}>
                          {t.port}
                          <input
                            className={inp}
                            value={editing.settings.imapPort}
                            onChange={(e) => setSetting("imapPort", e.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className={lbl}>
                          {t.security}
                          <select
                            className={inp}
                            value={editing.settings.imapSecure}
                            onChange={(e) => setSetting("imapSecure", e.target.value as "ssl" | "tls" | "none")}
                          >
                            <option value="ssl">SSL/TLS</option>
                            <option value="tls">STARTTLS</option>
                            <option value="none">None</option>
                          </select>
                        </label>
                      </div>
                      <div>
                        <label className={lbl}>
                          {t.login}
                          <input
                            className={inp}
                            value={editing.settings.imapUsername}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditing((d) =>
                                d
                                  ? {
                                      ...d,
                                      settings: {
                                        ...d.settings,
                                        imapUsername: v,
                                        smtpUsername:
                                          !d.settings.smtpUsername || d.settings.smtpUsername === d.settings.imapUsername
                                            ? v
                                            : d.settings.smtpUsername,
                                      },
                                    }
                                  : d,
                              );
                            }}
                            required
                          />
                        </label>
                      </div>
                      <div>
                        <label className={lbl}>
                          {t.password}
                          <input
                            className={inp}
                            type="password"
                            value={editing.settings.imapPassword}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditing((d) =>
                                d
                                  ? {
                                      ...d,
                                      settings: {
                                        ...d.settings,
                                        imapPassword: v,
                                        smtpPassword:
                                          d.settings.smtpPassword === d.settings.imapPassword
                                            ? v
                                            : d.settings.smtpPassword,
                                      },
                                    }
                                  : d,
                              );
                            }}
                            placeholder={editing.id ? t.passwordKeep : ""}
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5 p-3.5 rounded-2xl bg-sky-500/[0.04] dark:bg-slate-800/40 border border-sky-500/20">
                    <div className="type-label text-sky-700 dark:text-sky-300">{t.outgoing}</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className={lbl}>
                          {t.smtpHost}
                          <input
                            className={inp}
                            value={editing.settings.smtpHost}
                            onChange={(e) => setSetting("smtpHost", e.target.value)}
                            placeholder="smtp.domain.tld"
                          />
                        </label>
                      </div>
                      <div>
                        <label className={lbl}>
                          {t.port}
                          <input
                            className={inp}
                            value={editing.settings.smtpPort}
                            onChange={(e) => setSetting("smtpPort", e.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className={lbl}>
                        {t.security}
                        <select
                          className={inp}
                          value={editing.settings.smtpSecure}
                          onChange={(e) => setSetting("smtpSecure", e.target.value as "ssl" | "tls" | "none")}
                        >
                          <option value="ssl">SSL/TLS</option>
                          <option value="tls">STARTTLS</option>
                          <option value="none">None</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. MS EXCHANGE FORM */}
              {editing.connectorType === "exchange" && (
                <div className="p-4 rounded-2xl bg-blue-600/[0.05] border border-blue-600/25 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="type-label text-blue-700 dark:text-blue-300">{t.exchangeModeLabel}</span>
                    <div className="flex items-center gap-1.5">
                      {(["imap", "graph"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setSetting("exchangeMode", m)}
                          className={`px-2.5 py-1 rounded-lg text-micro font-semibold ${
                            (editing.settings.exchangeMode ?? "imap") === m
                              ? "bg-blue-600 text-white"
                              : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          {m === "imap" ? t.exchangeModeImap : t.exchangeModeGraph}
                        </button>
                      ))}
                    </div>
                  </div>

                  {(editing.settings.exchangeMode ?? "imap") === "graph" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className={lbl}>
                          {t.tenantId}
                          <input
                            className={inp}
                            value={editing.settings.graphTenantId || ""}
                            onChange={(e) => setSetting("graphTenantId", e.target.value)}
                            placeholder="00000000-0000-0000-0000-000000000000"
                          />
                        </label>
                      </div>
                      <div>
                        <label className={lbl}>
                          {t.clientId}
                          <input
                            className={inp}
                            value={editing.settings.graphClientId || ""}
                            onChange={(e) => setSetting("graphClientId", e.target.value)}
                            placeholder="00000000-0000-0000-0000-000000000000"
                          />
                        </label>
                      </div>
                      <div>
                        <label className={lbl}>
                          {t.clientSecret}
                          <input
                            className={inp}
                            type="password"
                            value={editing.settings.graphClientSecret || ""}
                            onChange={(e) => setSetting("graphClientSecret", e.target.value)}
                            placeholder={editing.id ? t.passwordKeep : "Client secret value"}
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className={lbl}>
                          {t.exchangeUrlLabel}
                          <input
                            className={inp}
                            value={editing.settings.exchangeUrl}
                            onChange={(e) => setSetting("exchangeUrl", e.target.value)}
                            placeholder="https://outlook.office365.com/EWS/Exchange.asmx"
                          />
                        </label>
                      </div>
                      <div>
                        <label className={lbl}>
                          {t.login}
                          <input
                            className={inp}
                            value={editing.settings.imapUsername || editing.address}
                            onChange={(e) => {
                              setSetting("imapUsername", e.target.value);
                              setSetting("smtpUsername", e.target.value);
                            }}
                          />
                        </label>
                      </div>
                      <div>
                        <label className={lbl}>
                          {t.password}
                          <input
                            className={inp}
                            type="password"
                            value={editing.settings.imapPassword}
                            onChange={(e) => {
                              setSetting("imapPassword", e.target.value);
                              setSetting("smtpPassword", e.target.value);
                            }}
                            placeholder={editing.id ? t.passwordKeep : ""}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 4. WHATSAPP (WAAI QR CODE) FORM */}
              {editing.connectorType === "whatsapp" && (
                <div className="p-4 rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/25 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="type-label text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <QrCode className="w-4 h-4" /> {t.waSectionTitle}
                        {editing.settings.waStatus === "connected" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-micro font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {t.waConnectedBadge}
                          </span>
                        )}
                      </div>
                      <p className="text-micro text-slate-600 dark:text-slate-300 mt-0.5">{t.waSectionDesc}</p>
                    </div>
                    <button
                      type="button"
                      data-testid="whatsapp-scan-qr-btn"
                      onClick={() => void startWhatsAppQrPairing()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-caption font-semibold shadow-xs"
                    >
                      <QrCode className="w-4 h-4" />
                      {editing.settings.waStatus === "connected" ? t.waRescanBtn : t.waScanBtn}
                    </button>
                  </div>

                  {waQrModalOpen && (
                    <div
                      data-testid="whatsapp-qr-panel"
                      className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-emerald-500/30 flex flex-col sm:flex-row items-center gap-4"
                    >
                      <div className="shrink-0">
                        {waQrDataUrl ? (
                          <img
                            src={waQrDataUrl}
                            alt="WhatsApp QR Code"
                            className="w-52 h-52 rounded-xl border border-slate-200 p-2 bg-white shadow-xs"
                          />
                        ) : (
                          <div className="w-52 h-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex flex-col items-center justify-center p-4 text-center gap-2">
                            {waPairingStatus === "error" ? (
                              <>
                                <AlertCircle className="w-7 h-7 text-rose-500" />
                                <span className="text-micro text-rose-600 dark:text-rose-400">
                                  {waPairingNote || "QR code unavailable"}
                                </span>
                              </>
                            ) : (
                              <>
                                <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
                                <span className="text-micro text-slate-600 dark:text-slate-300">
                                  {waPairingStatus === "authenticated"
                                    ? "Completing WhatsApp handshake…"
                                    : "Requesting live WhatsApp QR code from WAAI…"}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 text-center sm:text-left">
                        <div className="text-ui font-semibold text-slate-900 dark:text-white">
                          Scan with WhatsApp on your phone
                        </div>
                        <ol className="text-caption text-slate-600 dark:text-slate-300 list-decimal list-inside space-y-1">
                          <li>Open WhatsApp on your phone</li>
                          <li>Tap Menu / Settings → Linked Devices</li>
                          <li>Tap Link a Device and point your camera at this QR code</li>
                        </ol>
                        {waPairingNote && (
                          <div className="flex items-center gap-1.5 text-micro text-emerald-700 dark:text-emerald-300 font-medium pt-0.5">
                            {waPairingStatus === "authenticated" || waPairingStatus === "starting" ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span>{waPairingNote}</span>
                          </div>
                        )}
                        <div className="pt-1 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            data-testid="whatsapp-refresh-qr-btn"
                            onClick={() => void startWhatsAppQrPairing()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-caption font-semibold"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> Refresh QR Code
                          </button>
                          <button
                            type="button"
                            onClick={cancelWhatsAppQrPairing}
                            className="px-2.5 py-1.5 rounded-lg text-caption text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            {t.cancel}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={lbl}>
                      {t.waServiceUrlLabel}
                      <input
                        className={inp}
                        value={editing.settings.waServiceUrl || ""}
                        onChange={(e) => setSetting("waServiceUrl", e.target.value)}
                        placeholder="/waai-api (default same-domain proxy)"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* 4b. BOTMAN MULTI-CHANNEL DRIVERS (TELEGRAM / MESSENGER / SLACK / DISCORD / TEAMS / VIBER / TWILIO / WEBCHAT) */}
              {isBotManConnector(editing.connectorType) && (() => {
                const bmSpec = BOTMAN_DRIVER_SPECS[editing.connectorType];
                const webhookUrl = getBotManWebhookUrl(editing.id || "NEW_ID", editing.connectorType);
                const widgetSnippet = bmSpec.isWebWidget ? getBotManWidgetSnippet(editing.id || "NEW_ID") : null;
                return (
                  <div
                    data-testid={`botman-setup-${editing.connectorType}`}
                    className={`p-4 rounded-2xl border space-y-4 ${activeMeta.badgeClass}`}
                  >
                    {/* Header + Official Developer Portal Link */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="type-label text-slate-900 dark:text-white flex items-center gap-2">
                          <MessageCircle className="w-4 h-4" />
                          <span>{activeMeta.label} — BotMan Setup Guide</span>
                          <span className="px-2 py-0.5 rounded bg-slate-900/10 dark:bg-white/10 font-mono text-micro">
                            {bmSpec.driverClass}
                          </span>
                        </div>
                        <p className="text-micro text-slate-600 dark:text-slate-300 mt-1">
                          {bmSpec.summary[lang] ?? bmSpec.summary.en}
                        </p>
                      </div>
                      <a
                        href={bmSpec.portalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-micro font-bold shadow-2xs ${activeMeta.accentBtn}`}
                      >
                        <span>{bmSpec.portalLabel}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    {/* User-Friendly Step-by-Step Setup Instructions */}
                    <div className="p-3.5 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 space-y-2">
                      <div className="type-overline text-slate-700 dark:text-slate-200">
                        {lang === "sk"
                          ? "Ako nastaviť tento konektor (Krok za krokom)"
                          : lang === "hu"
                            ? "Beállítás lépésről lépésre"
                            : "How to Set Up (Step-by-Step Guide)"}
                      </div>
                      <ol className="list-decimal list-inside space-y-1.5 text-caption text-slate-700 dark:text-slate-200">
                        {(bmSpec.setupSteps[lang] ?? bmSpec.setupSteps.en).map((stepText, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {stepText}
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Dynamic BotMan Driver Credential Fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {bmSpec.fields.map((f) => (
                        <div key={f.key} className={bmSpec.fields.length === 1 ? "sm:col-span-2" : ""}>
                          <label className={lbl}>
                            {f.label[lang] ?? f.label.en}
                            <input
                              className={inp}
                              type={f.secret ? "password" : "text"}
                              autoComplete={f.secret ? "new-password" : "off"}
                              value={(editing.settings[f.key] as string) || ""}
                              onChange={(e) => setSetting(f.key, e.target.value)}
                              placeholder={editing.id && f.secret ? t.passwordKeep : f.placeholder}
                              required={Boolean(f.required && !editing.id)}
                            />
                          </label>
                        </div>
                      ))}
                    </div>

                    {/* Copyable Webhook URL / Web Widget Embed Snippet + 1-Click Webhook Registration */}
                    <div className="p-3 rounded-xl bg-slate-900/5 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="type-overline text-slate-500 dark:text-slate-400">
                            {widgetSnippet ? "Embeddable Website <script> Snippet" : "CCRM BotMan Webhook Callback URL"}
                          </div>
                          <code className="block font-mono text-micro text-slate-800 dark:text-slate-200 truncate mt-0.5">
                            {widgetSnippet || webhookUrl}
                          </code>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard?.writeText(widgetSnippet || webhookUrl);
                              setCopiedKey(true);
                              setTimeout(() => setCopiedKey(false), 1800);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-micro font-semibold"
                          >
                            {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{widgetSnippet ? "Copy <script>" : "Copy Webhook URL"}</span>
                          </button>
                          {bmSpec.supportsAutoWebhook && (
                            <button
                              type="button"
                              onClick={() => void onRegisterBotManWebhook()}
                              disabled={busy !== null}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-micro font-bold disabled:opacity-40 ${activeMeta.accentBtn}`}
                            >
                              {busy === "webhook" ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="w-3.5 h-3.5" />
                              )}
                              <span>Register Webhook</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 5, 6, 7. SUBSCRIPTION AI AGENTS (CLAUDE / ANTIGRAVITY / CHATGPT via MARVEEN + CCRM MCP) */}
              {isAgentConnector(editing.connectorType) && (
                <div className={`p-4 rounded-2xl border space-y-3 ${activeMeta.badgeClass}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="type-label text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" /> {t.agentSectionTitle}
                      </div>
                      <p className="text-micro text-slate-600 dark:text-slate-300 mt-0.5">{t.agentSectionDesc}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {data?.environment?.mode === "local_cli" &&
                        !data.environment.clis[editing.connectorType as "claude" | "chatgpt" | "antigravity"] && (
                          <button
                            type="button"
                            onClick={() => void onInstallCli(editing.connectorType)}
                            disabled={busy !== null}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-micro font-semibold disabled:opacity-40"
                          >
                            {busy === "cli" ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Terminal className="w-3.5 h-3.5" />
                            )}
                            {t.agentInstallCli}
                          </button>
                        )}
                      <button
                        type="button"
                        data-testid="agent-start-oauth-btn"
                        onClick={() => void onStartSubscriptionOAuth()}
                        disabled={busy !== null}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-caption font-semibold shadow-xs disabled:opacity-40 ${activeMeta.accentBtn}`}
                      >
                        {busy === "login" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <KeyRound className="w-3.5 h-3.5" />
                        )}
                        {t.agentStartLogin}
                      </button>
                    </div>
                  </div>

                  {/* Interactive PKCE / PTY OAuth Step */}
                  {oauthUrl && (
                    <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <a
                          href={oauthUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-caption font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          {t.agentOpenAuthUrl} <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className={`${inp} flex-1 mt-0`}
                          value={oauthCode}
                          onChange={(e) => setOauthCode(e.target.value)}
                          placeholder={t.agentCodePlaceholder}
                        />
                        <button
                          type="button"
                          onClick={() => void onSubmitSubscriptionCode()}
                          disabled={busy !== null || !oauthCode.trim()}
                          className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-caption font-semibold disabled:opacity-40"
                        >
                          {t.agentVerifyCode}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={lbl}>
                        {t.agentTokenLabel}
                        <input
                          className={inp}
                          type="password"
                          value={editing.settings.subscriptionToken || ""}
                          onChange={(e) => setSetting("subscriptionToken", e.target.value)}
                          placeholder={
                            editing.id
                              ? t.passwordKeep
                              : editing.connectorType === "claude"
                                ? "sk-ant-oat01-…"
                                : "OAuth session token"
                          }
                        />
                      </label>
                    </div>
                    <div>
                      <label className={lbl}>
                        {t.agentModelLabel}
                        <input
                          className={inp}
                          value={editing.settings.agentModel || ""}
                          onChange={(e) => setSetting("agentModel", e.target.value)}
                          placeholder={
                            editing.connectorType === "claude"
                              ? "claude-sonnet-4-5"
                              : editing.connectorType === "antigravity"
                                ? "gemini-3.5-flash-lite"
                                : "gpt-5"
                          }
                        />
                      </label>
                    </div>
                    <div>
                      <label className={lbl}>
                        {t.agentEndpointLabel}
                        <input
                          className={inp}
                          value={editing.settings.agentEndpoint || ""}
                          onChange={(e) => setSetting("agentEndpoint", e.target.value)}
                          placeholder="Local embedded Marveen (default)"
                        />
                      </label>
                    </div>
                  </div>

                  {/* CCRM MCP Endpoint Info */}
                  <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-micro text-slate-600 dark:text-slate-300">
                    <span>
                      CCRM MCP Endpoint:{" "}
                      <code className="font-mono text-slate-800 dark:text-slate-100">
                        {typeof window !== "undefined" ? `${window.location.origin}/api/mcp.php` : "/api/mcp.php"}
                      </code>{" "}
                      (auto-provisioned per assigned user)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}/api/mcp.php`;
                        void navigator.clipboard?.writeText(url);
                        setCopiedKey(true);
                        setTimeout(() => setCopiedKey(false), 1800);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/80 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-700"
                    >
                      {copiedKey ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      Copy MCP URL
                    </button>
                  </div>

                  {agentTestOutput && (
                    <div className="p-2.5 rounded-lg bg-slate-900 text-emerald-300 font-mono text-micro">
                      {agentTestOutput}
                    </div>
                  )}
                </div>
              )}

              {/* Active & Self-Signed Toggles */}
              <div className="flex flex-wrap items-center gap-4">
                {isEmailConnector(editing.connectorType) &&
                  (editing.settings.exchangeMode ?? "imap") !== "graph" && (
                    <label className="inline-flex items-center gap-2 text-caption text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editing.settings.imapAllowSelfSigned}
                        onChange={(e) => setSetting("imapAllowSelfSigned", e.target.checked)}
                      />
                      {t.selfSigned}
                    </label>
                  )}
                <label className="inline-flex items-center gap-2 text-caption text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editing.isActive}
                    onChange={(e) => setField("isActive", e.target.checked)}
                  />
                  {t.active}
                </label>
              </div>

              {formMsg && (
                <div
                  className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-caption font-medium ${
                    formMsg.kind === "ok"
                      ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                      : "bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300"
                  }`}
                >
                  {formMsg.kind === "ok" ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  {formMsg.text}
                </div>
              )}
            </div>

            {/* Sticky Color-Coded Modal Footer */}
            <div className="shrink-0 px-6 py-4 bg-slate-50/90 dark:bg-slate-900/90 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={onTest}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-caption font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                {busy === "test" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {busy === "test" ? t.testing : t.test}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setWaQrModalOpen(false);
                  }}
                  className="px-3.5 py-2 rounded-xl text-caption font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={busy !== null}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-caption font-bold shadow-sm transition-all disabled:opacity-40 ${activeMeta.accentBtn}`}
                >
                  {busy === "save" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {busy === "save" ? t.saving : t.save}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
