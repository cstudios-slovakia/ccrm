/*
  Unified External Connectors & Company Mailboxes (`#settings/email/mailboxes`):
  shared email accounts (`gmail`, `smtp`, `exchange`), WhatsApp (`whatsapp` via WAAI QR),
  and subscription-based AI agents (`claude`, `antigravity`, `chatgpt` via Marveen + CCRM MCP).
  Secrets never come back from the server in plaintext; the form shows a mask and sends it
  back unchanged, which the server reads as "keep the stored one".
*/

export const SECRET_MASK = "********";

export type BotManConnectorType =
  | "telegram"
  | "messenger"
  | "slack"
  | "discord"
  | "teams"
  | "viber"
  | "twilio"
  | "webchat";

export type ConnectorType =
  | "gmail"
  | "smtp"
  | "exchange"
  | "whatsapp"
  | BotManConnectorType
  | "claude"
  | "antigravity"
  | "chatgpt";

export const EMAIL_CONNECTOR_TYPES: readonly ConnectorType[] = ["gmail", "smtp", "exchange"];
export const BOTMAN_CONNECTOR_TYPES: readonly BotManConnectorType[] = [
  "telegram",
  "messenger",
  "slack",
  "discord",
  "teams",
  "viber",
  "twilio",
  "webchat",
];
export const AGENT_CONNECTOR_TYPES: readonly ConnectorType[] = ["claude", "antigravity", "chatgpt"];

export const isEmailConnector = (type?: string | null): boolean =>
  Boolean(type && (EMAIL_CONNECTOR_TYPES as readonly string[]).includes(type));

export const isBotManConnector = (type?: string | null): type is BotManConnectorType =>
  Boolean(type && (BOTMAN_CONNECTOR_TYPES as readonly string[]).includes(type));

export const isMessagingConnector = (type?: string | null): boolean =>
  type === "whatsapp" || isBotManConnector(type);

export const isAgentConnector = (type?: string | null): boolean =>
  Boolean(type && (AGENT_CONNECTOR_TYPES as readonly string[]).includes(type));

export interface MailboxFolderState {
  folder: string;
  lastUid: number;
  backfillDone: boolean;
  filedCount: number;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface MailboxSettings {
  connectorType?: ConnectorType;
  userIds?: string[];
  provider: "smtp" | "exchange";
  imapHost: string;
  imapPort: string;
  imapSecure: "ssl" | "tls" | "none";
  imapUsername: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: "ssl" | "tls" | "none";
  smtpUsername: string;
  smtpPassword: string;
  exchangeUrl: string;
  exchangeMode?: "imap" | "graph";
  graphTenantId?: string;
  graphClientId?: string;
  graphClientSecret?: string;
  imapAllowSelfSigned: boolean;
  // WhatsApp (WAAI QR) fields
  waAccountId?: string;
  waServiceUrl?: string;
  waStatus?: "connected" | "qr_required" | "disconnected";
  // Subscription AI Agent (Marveen) fields
  subscriptionToken?: string;
  subscriptionPlan?: string;
  agentModel?: string;
  agentEndpoint?: string;
  // BotMan Multi-Channel Driver fields
  botmanToken?: string;
  botmanAppId?: string;
  botmanAppSecret?: string;
  botmanSigningSecret?: string;
  botmanVerifyToken?: string;
  botmanChannelId?: string;
  botmanFromNumber?: string;
  botmanSenderName?: string;
  botmanServiceUrl?: string;
  botmanWebhookRegistered?: boolean;
}

export interface CompanyMailbox {
  id: string;
  name: string;
  address: string;
  connectorType?: ConnectorType;
  userIds?: string[];
  isActive: boolean;
  ownerUserId: string | null;
  backfillSince: string | null;
  settings: Partial<MailboxSettings>;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  folders: MailboxFolderState[];
  subagents?: AgentSubagent[];
  triggers?: AgentEventTrigger[];
}

export interface MailboxDraft {
  id: string;
  name: string;
  address: string;
  connectorType: ConnectorType;
  userIds: string[];
  isActive: boolean;
  ownerUserId: string;
  backfillSince: string;
  settings: MailboxSettings;
}

export interface ConnectorEnvironment {
  mode: "local_cli" | "remote_bridge" | "cloud_mcp";
  procOpen: boolean;
  python3: boolean;
  node: boolean;
  npm: boolean;
  remoteBridgeConfigured: boolean;
  clis: {
    claude: boolean;
    chatgpt: boolean;
    antigravity: boolean;
  };
}

export const inferConnectorType = (
  settings?: Partial<MailboxSettings>,
  address = "",
  topLevelType?: ConnectorType,
): ConnectorType => {
  const explicit = topLevelType || settings?.connectorType;
  if (
    explicit === "gmail" ||
    explicit === "smtp" ||
    explicit === "exchange" ||
    explicit === "whatsapp" ||
    explicit === "claude" ||
    explicit === "antigravity" ||
    explicit === "chatgpt" ||
    isBotManConnector(explicit)
  ) {
    return explicit;
  }
  if (settings?.provider === "exchange") return "exchange";
  const host = (settings?.imapHost || "").toLowerCase();
  if (host.includes("gmail.com") || host.includes("googlemail.com")) return "gmail";
  const addr = address.toLowerCase();
  if (addr.startsWith("whatsapp:")) return "whatsapp";
  for (const bm of BOTMAN_CONNECTOR_TYPES) {
    if (addr.startsWith(`${bm}:`)) return bm;
  }
  if (addr.startsWith("claude:")) return "claude";
  if (addr.startsWith("antigravity:")) return "antigravity";
  if (addr.startsWith("chatgpt:")) return "chatgpt";
  return "smtp";
};

export const emptyMailboxDraft = (connectorType: ConnectorType = "smtp"): MailboxDraft => ({
  id: "",
  name: "",
  address: "",
  connectorType,
  userIds: [],
  isActive: true,
  ownerUserId: "",
  backfillSince: "",
  settings: {
    connectorType,
    userIds: [],
    provider: connectorType === "exchange" ? "exchange" : "smtp",
    imapHost: connectorType === "gmail" ? "imap.gmail.com" : "",
    imapPort: "993",
    imapSecure: "ssl",
    imapUsername: "",
    imapPassword: "",
    smtpHost: connectorType === "gmail" ? "smtp.gmail.com" : "",
    smtpPort: connectorType === "exchange" ? "587" : "465",
    smtpSecure: connectorType === "exchange" ? "tls" : "ssl",
    smtpUsername: "",
    smtpPassword: "",
    exchangeUrl: connectorType === "exchange" ? "https://outlook.office365.com/EWS/Exchange.asmx" : "",
    exchangeMode: "imap",
    graphTenantId: "",
    graphClientId: "",
    graphClientSecret: "",
    imapAllowSelfSigned: false,
    waAccountId: "",
    waServiceUrl: "",
    waStatus: "qr_required",
    subscriptionToken: "",
    subscriptionPlan: "pro",
    agentModel: "",
    agentEndpoint: "",
    botmanToken: "",
    botmanAppId: "",
    botmanAppSecret: "",
    botmanSigningSecret: "",
    botmanVerifyToken: isBotManConnector(connectorType) ? `ccrm_${connectorType}_verify` : "",
    botmanChannelId: "",
    botmanFromNumber: "",
    botmanSenderName: connectorType === "webchat" ? "CCRM Live Support" : "",
    botmanServiceUrl: "",
    botmanWebhookRegistered: false,
  },
});

/** A stored connector/mailbox as the form edits it. Secrets arrive masked and are kept masked. */
export const draftFromMailbox = (box: CompanyMailbox): MailboxDraft => {
  const cType = inferConnectorType(box.settings, box.address, box.connectorType);
  const base = emptyMailboxDraft(cType);
  const rawUsers = box.userIds ?? box.settings?.userIds ?? (box.ownerUserId ? [box.ownerUserId] : []);
  const userIds = Array.from(new Set(rawUsers.map((u) => u.trim()).filter(Boolean)));
  const ownerUserId = box.ownerUserId ?? userIds[0] ?? "";
  return {
    id: box.id,
    name: box.name,
    address: box.address,
    connectorType: cType,
    userIds,
    isActive: box.isActive,
    ownerUserId,
    backfillSince: box.backfillSince ?? "",
    settings: {
      ...base.settings,
      ...box.settings,
      connectorType: cType,
      userIds,
    },
  };
};

/**
 * The request body for save / test. A blank SMTP login follows the IMAP one (most
 * providers use a single login), and a blank password/token is left out so the server keeps
 * the stored one rather than blanking it.
 */
export const mailboxPayload = (draft: MailboxDraft) => {
  const cType = draft.connectorType || draft.settings.connectorType || "smtp";
  const s: MailboxSettings = {
    ...draft.settings,
    connectorType: cType,
    provider: cType === "exchange" || draft.settings.provider === "exchange" ? "exchange" : "smtp",
  };
  const cleanAddress = draft.address.trim().toLowerCase();

  if (cType === "gmail") {
    if (!s.imapHost.trim()) s.imapHost = "imap.gmail.com";
    if (!s.imapPort.trim()) s.imapPort = "993";
    s.imapSecure = "ssl";
    if (!s.smtpHost.trim()) s.smtpHost = "smtp.gmail.com";
    if (!s.smtpPort.trim()) s.smtpPort = "465";
    s.smtpSecure = "ssl";
    if (!s.imapUsername.trim() && cleanAddress) s.imapUsername = cleanAddress;
  } else if (cType === "exchange" && !s.imapUsername.trim() && cleanAddress) {
    s.imapUsername = cleanAddress;
  }

  if (!s.smtpUsername.trim()) s.smtpUsername = s.imapUsername;

  const userIds = Array.from(
    new Set(
      (draft.userIds?.length ? draft.userIds : draft.ownerUserId ? [draft.ownerUserId] : [])
        .map((u) => u.trim())
        .filter(Boolean),
    ),
  );
  s.userIds = userIds;

  const settings: Partial<MailboxSettings> = { ...s };
  if (!s.imapPassword) delete settings.imapPassword;
  if (!s.smtpPassword) delete settings.smtpPassword;
  if (!s.subscriptionToken) delete settings.subscriptionToken;
  if (!s.graphClientSecret) delete settings.graphClientSecret;
  if (!s.botmanToken) delete settings.botmanToken;
  if (!s.botmanAppSecret) delete settings.botmanAppSecret;
  if (!s.botmanSigningSecret) delete settings.botmanSigningSecret;
  if (!s.botmanVerifyToken) delete settings.botmanVerifyToken;

  const ownerUserId = draft.ownerUserId || userIds[0] || "";

  return {
    id: draft.id || undefined,
    name: draft.name.trim(),
    address: cleanAddress,
    connectorType: cType,
    userIds,
    isActive: draft.isActive,
    ownerUserId,
    backfillSince: draft.backfillSince,
    settings,
  };
};

/** One line on the state of a mailbox's filing, from its folders. */
export const backlogSummary = (folders: readonly MailboxFolderState[] = []): { filed: number; caughtUp: boolean; started: boolean } => ({
  filed: folders.reduce((n, f) => n + f.filedCount, 0),
  started: folders.length > 0,
  caughtUp: folders.length > 0 && folders.every((f) => f.backfillDone),
});

type ApiResult<T> = T & { success?: boolean; error?: string };

const call = async <T>(action: string, body?: unknown): Promise<ApiResult<T>> => {
  const res = await fetch(`/api/company_mailboxes.php?action=${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: ApiResult<T> | null = null;
  try {
    data = (await res.json()) as ApiResult<T>;
  } catch {
    /* handled below */
  }
  if (!res.ok || !data || data.success === false) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
};

export interface MailboxList {
  mailboxes: CompanyMailbox[];
  userMailboxes: { id: string; name: string; email: string; folders: MailboxFolderState[] }[];
  imapAvailable: boolean;
  environment?: ConnectorEnvironment;
}

export const listMailboxes = () => call<MailboxList>("list");
export const listMyConnectors = () =>
  call<{ connectors?: CompanyMailbox[]; mailboxes?: CompanyMailbox[] }>("my");
export const saveMailbox = (draft: MailboxDraft) => call<{ mailbox: CompanyMailbox }>("save", mailboxPayload(draft));
export const testMailbox = (draft: MailboxDraft) =>
  call<{ success: boolean; detail?: string }> ("test", mailboxPayload(draft));
export const deleteMailbox = (id: string) => call<unknown>("delete", { id });
export const runMailbox = (id: string) =>
  call<{ run: { seen?: number; filed?: number; errors?: string[] } }>("run", { id });

export const startAgentSubscriptionLogin = (params: {
  id?: string;
  connectorType: ConnectorType;
  agentEndpoint?: string;
}) =>
  call<{
    ok: boolean;
    phase: string;
    mode: string;
    url: string;
    cliInstalled?: boolean;
  }>("agent_login_start", params);

export const submitAgentSubscriptionCode = (params: {
  id?: string;
  connectorType: ConnectorType;
  code: string;
  agentEndpoint?: string;
}) =>
  call<{
    ok: boolean;
    verified: boolean;
    token: string;
  }>("agent_login_code", params);

export const installAgentCli = (connectorType: ConnectorType) =>
  call<{
    ok: boolean;
    bin?: string;
    alreadyInstalled?: boolean;
    environment?: ConnectorEnvironment;
  }>("agent_install_cli", { connectorType });

export interface AgentStepTrace {
  id: string;
  kind: "memory" | "subagent" | "schedule" | "whatsapp" | "email" | "mcp";
  tool: string;
  label: string;
  detail?: string;
  subSteps?: AgentStepTrace[];
}

export interface AgentSubagent {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  memoryMd: string;
  avatarColor?: string;
  heartbeatEnabled?: boolean;
  heartbeatIntervalMinutes?: number;
  heartbeatInstructions?: string;
  lastHeartbeatAt?: string | null;
  lastHeartbeatStatus?: string | null;
  reactiveEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentEventTriggerFilter {
  chatMatch?: string;
  onlyGroup?: boolean;
  onlyDirect?: boolean;
  subjectContains?: string;
  fromContains?: string;
  keywordContains?: string;
  eventType?: string;
}

export interface AgentEventTrigger {
  id: string;
  name: string;
  sourceType: "whatsapp" | "email" | "crm_event";
  sourceConnectorId: string;
  targetConnectorId: string;
  targetSubagentId?: string | null;
  filter: AgentEventTriggerFilter;
  instructions: string;
  autoReply: boolean;
  enabled: boolean;
  lastWatermark?: string;
  triggerCount?: number;
  lastTriggeredAt?: string | null;
  lastStatus?: string | null;
  updatedAt?: string;
}

export interface AgentAutonomousTask {
  id: string;
  title: string;
  prompt: string;
  intervalMinutes: number;
  subagentId?: string | null;
  enabled: boolean;
  lastRunAt?: string | null;
  lastStatus?: string | null;
  updatedAt?: string;
}

export interface AgentChatMessage {
  id: string;
  role: "user" | "assistant";
  author?: string;
  subagentId?: string | null;
  autonomous?: boolean;
  reactive?: boolean;
  triggerId?: string;
  taskTitle?: string;
  text: string;
  steps?: AgentStepTrace[];
  timestamp: string;
  createdAt?: string;
}

export interface AgentArtifact {
  id: string;
  name?: string;
  title: string;
  content: string;
  updatedAt?: string;
}

export interface AgentAutonomousConfig {
  enabled: boolean;
  intervalMinutes: number;
  instructions: string;
  lastRunAt?: string | null;
  lastStatus?: string | null;
  cronCount?: number;
  updatedAt?: string;
}

export interface AgentConnectorState {
  connectorId: string;
  activeAgentId?: string;
  mcpConnected: boolean;
  mcpEndpoint?: string;
  memoryMd: string;
  memoryUpdatedAt?: string;
  subagentMemoryMd?: string;
  artifacts?: AgentArtifact[];
  subagents: AgentSubagent[];
  tasks: AgentAutonomousTask[];
  triggers?: AgentEventTrigger[];
  allTriggers?: AgentEventTrigger[];
  autonomousMode?: AgentAutonomousConfig;
  chatHistory: AgentChatMessage[];
}

export const runSubscriptionAgent = (params: {
  id: string;
  prompt: string;
  systemPrompt?: string;
  subagentId?: string;
}) =>
  call<
    AgentConnectorState & {
      ok: boolean;
      text: string;
      mode: string;
      provider: string;
      steps?: AgentStepTrace[];
    }
  >("agent_run", params);

export const getAgentConnectorState = (id: string, subagentId?: string) =>
  call<AgentConnectorState>("agent_state", { id, subagentId });

export const saveAgentMemory = (params: { id: string; memoryMd: string; subagentId?: string }) =>
  call<AgentConnectorState>("agent_memory_save", params);

export const saveAgentArtifact = (params: {
  id: string;
  name: string;
  title?: string;
  content: string;
}) => call<AgentConnectorState>("agent_artifact_save", params);

export const deleteAgentArtifact = (id: string, artifactId: string) =>
  call<AgentConnectorState>("agent_artifact_delete", { id, artifactId });

export const saveAgentSubagent = (params: {
  id: string;
  subagentId?: string;
  name: string;
  role: string;
  systemPrompt: string;
  memoryMd?: string;
  avatarColor?: string;
  heartbeatEnabled?: boolean;
  heartbeatIntervalMinutes?: number;
  heartbeatInstructions?: string;
  reactiveEnabled?: boolean;
}) =>
  call<AgentConnectorState & { subagent?: AgentSubagent }>("agent_subagent_save", {
    id: params.id,
    subagentId: params.subagentId,
    name: params.name,
    role: params.role,
    systemPrompt: params.systemPrompt,
    memoryMd: params.memoryMd,
    avatarColor: params.avatarColor,
    heartbeatEnabled: params.heartbeatEnabled,
    heartbeatIntervalMinutes: params.heartbeatIntervalMinutes,
    heartbeatInstructions: params.heartbeatInstructions,
    reactiveEnabled: params.reactiveEnabled,
  });

export const deleteAgentSubagent = (id: string, subagentId: string) =>
  call<AgentConnectorState>("agent_subagent_delete", { id, subagentId });

export const saveAgentTask = (params: {
  id: string;
  taskId?: string;
  title: string;
  prompt: string;
  intervalMinutes: number;
  subagentId?: string;
  enabled?: boolean;
}) =>
  call<AgentConnectorState>("agent_task_save", {
    id: params.id,
    title: params.title,
    prompt: params.prompt,
    intervalMinutes: params.intervalMinutes,
    subagentId: params.subagentId,
    enabled: params.enabled ?? true,
  });

export const deleteAgentTask = (id: string, taskId: string) =>
  call<AgentConnectorState>("agent_task_delete", { id, taskId });

export const runAgentTaskNow = (id: string, taskId?: string) =>
  call<AgentConnectorState>("agent_task_run", { id, taskId });

export const saveAgentAutonomousConfig = (params: {
  id: string;
  enabled?: boolean;
  intervalMinutes?: number;
  instructions?: string;
}) => call<AgentConnectorState>("agent_autonomous_save", params);

export const saveAgentTrigger = (params: {
  id: string;
  triggerId?: string;
  name: string;
  sourceType: "whatsapp" | "email" | "crm_event";
  sourceConnectorId: string;
  targetSubagentId?: string | null;
  filter?: AgentEventTriggerFilter;
  instructions?: string;
  autoReply?: boolean;
  enabled?: boolean;
}) =>
  call<AgentConnectorState & { trigger?: AgentEventTrigger }>("agent_trigger_save", {
    id: params.id,
    triggerId: params.triggerId,
    name: params.name,
    sourceType: params.sourceType,
    sourceConnectorId: params.sourceConnectorId,
    targetSubagentId: params.targetSubagentId,
    filter: params.filter,
    instructions: params.instructions,
    autoReply: params.autoReply,
    enabled: params.enabled,
  });

export const deleteAgentTrigger = (id: string, triggerId: string) =>
  call<AgentConnectorState>("agent_trigger_delete", { id, triggerId });

export const testAgentTrigger = (id: string, triggerId: string) =>
  call<AgentConnectorState & { testResult?: { ok: boolean; error?: string; result?: unknown } }>(
    "agent_trigger_test",
    { id, triggerId },
  );

export const runAgentHeartbeat = (id: string) =>
  call<AgentConnectorState>("agent_heartbeat", { id });

export const clearAgentChatHistory = (id: string, subagentId?: string) =>
  call<AgentConnectorState>("agent_chat_clear", { id, subagentId });

export interface WhatsAppDirectQrState {
  ok: boolean;
  accountId: string;
  status: "idle" | "starting" | "pending_qr" | "authenticated" | "connected" | "disconnected" | "expired" | "error";
  qr?: string | null;
  rawQr?: string | null;
  phone?: string | null;
  displayName?: string | null;
  error?: string | null;
}

export const startWhatsAppDirectQr = (params: { id?: string; accountId?: string; reset?: boolean }) =>
  call<WhatsAppDirectQrState>("wa_qr_start", params);

export const pollWhatsAppDirectQr = (params: { id?: string; accountId: string }) =>
  call<WhatsAppDirectQrState>("wa_qr_poll", params);

export const stopWhatsAppDirectQr = (params: { id?: string; accountId: string }) =>
  call<{ ok: boolean; accountId: string }>("wa_qr_stop", params);

export interface WhatsAppChatSummary {
  id: string;
  name: string;
  phone?: string;
  isGroup?: boolean;
  participantCount?: number;
  participantsPreview?: string;
  unreadCount?: number;
  pinned?: boolean;
  archived?: boolean;
  lastMessageText?: string;
  lastMessageAt?: string;
  lastMessageTs?: number;
}

export interface WhatsAppMessageItem {
  id: string;
  chatId: string;
  fromMe: boolean;
  senderName: string;
  text: string;
  mediaType?: "image" | "video" | "audio" | "document";
  mediaUrl?: string;
  mediaPreviewUrl?: string;
  fileName?: string;
  timestamp: string;
  createdAt?: string;
  tsMs: number;
}

export interface WhatsAppConnectorState {
  ok: boolean;
  accountId: string;
  status: string;
  qr?: string | null;
  phone?: string | null;
  displayName?: string | null;
  historySyncChunks?: number;
  lastHistorySyncAt?: string | null;
  chats: WhatsAppChatSummary[];
  messages: Record<string, WhatsAppMessageItem[]>;
  updatedAt?: string | null;
  error?: string | null;
}

export const getWhatsAppChats = (id: string) =>
  call<WhatsAppConnectorState>("wa_chats", { id });

export const sendWhatsAppChatMessage = (params: { id: string; chatId: string; text: string }) =>
  call<WhatsAppConnectorState>("wa_send", params);

export const resyncWhatsAppChats = (id: string, chatId?: string) =>
  call<WhatsAppConnectorState>("wa_resync", { id, chatId });

// -----------------------------------------------------------------------------
// Declarative BotMan Driver Registry (`botman/botman`) & Step-by-Step Setup Guides
// -----------------------------------------------------------------------------

export interface BotManDriverFieldSpec {
  key:
    | "botmanToken"
    | "botmanAppId"
    | "botmanAppSecret"
    | "botmanSigningSecret"
    | "botmanVerifyToken"
    | "botmanChannelId"
    | "botmanFromNumber"
    | "botmanSenderName"
    | "botmanServiceUrl";
  label: { en: string; sk: string; hu: string };
  placeholder: string;
  secret?: boolean;
  required?: boolean;
  hint?: { en: string; sk: string; hu: string };
}

export interface BotManDriverSpec {
  type: BotManConnectorType;
  driverClass: string;
  portalUrl: string;
  portalLabel: string;
  supportsAutoWebhook: boolean;
  supportsLocalPolling: boolean;
  isWebWidget?: boolean;
  usesMetaFallback?: boolean;
  summary: { en: string; sk: string; hu: string };
  setupSteps: { en: string[]; sk: string[]; hu: string[] };
  fields: BotManDriverFieldSpec[];
}

export const BOTMAN_DRIVER_SPECS: Record<BotManConnectorType, BotManDriverSpec> = {
  telegram: {
    type: "telegram",
    driverClass: "BotMan\\Drivers\\Telegram\\TelegramDriver",
    portalUrl: "https://t.me/BotFather",
    portalLabel: "Open @BotFather",
    supportsAutoWebhook: true,
    supportsLocalPolling: true,
    summary: {
      en: "Connect a Telegram Bot via BotFather HTTP API token (supports instant webhooks + local getUpdates polling).",
      sk: "Pripojte Telegram bota cez @BotFather HTTP API token (okamžité webhooky + lokálny getUpdates polling).",
      hu: "Telegram bot csatlakoztatása @BotFather HTTP API tokennel (azonnali webhook + helyi getUpdates lekérdezés).",
    },
    setupSteps: {
      en: [
        "Open Telegram, search for @BotFather, and send /newbot to create your bot.",
        "Copy the HTTP API Token (e.g. 123456789:ABC-DEF...) and paste it into Bot Token below.",
        "Click 'Test Connection' to verify via getMe. On public HTTPS servers click 'Register Webhook', or leave as-is for automatic local polling!",
      ],
      sk: [
        "Otvorte Telegram, vyhľadajte @BotFather a pošlite príkaz /newbot.",
        "Skopírujte vygenerovaný HTTP API Token (napr. 123456789:ABC-DEF...) a vložte ho nižšie.",
        "Kliknite na 'Otestovať' pre overenie cez getMe. Na verejnom HTTPS serveri kliknite na 'Registrovať Webhook' (na localhoste funguje automatický polling).",
      ],
      hu: [
        "Nyissa meg a Telegramot, keresse meg a @BotFather fiókot, és küldje el a /newbot parancsot.",
        "Másolja ki a kapott HTTP API Tokent (pl. 123456789:ABC-DEF...), és illessze be alább.",
        "Kattintson a 'Kapcsolat tesztelése' gombra (getMe), vagy nyilvános HTTPS szerveren a 'Webhook regisztrálása' gombra.",
      ],
    },
    fields: [
      {
        key: "botmanToken",
        label: { en: "Telegram Bot Token (@BotFather)", sk: "Telegram Bot Token (@BotFather)", hu: "Telegram Bot Token (@BotFather)" },
        placeholder: "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw",
        secret: true,
        required: true,
      },
    ],
  },

  messenger: {
    type: "messenger",
    driverClass: "BotMan\\Drivers\\Facebook\\FacebookDriver",
    portalUrl: "https://developers.facebook.com/apps/",
    portalLabel: "Meta for Developers",
    supportsAutoWebhook: false,
    supportsLocalPolling: true,
    usesMetaFallback: true,
    summary: {
      en: "Connect a Facebook Page via Meta Messenger API. Automatically falls back to your Meta credentials from Settings -> Integrations if left blank.",
      sk: "Pripojte Facebook stránku cez Meta Messenger API. Ak polia necháte prázdne, automaticky sa použijú Meta údaje z Nastavenia -> Integrácie.",
      hu: "Facebook oldal csatlakoztatása Meta Messenger API-val. Üresen hagyva automatikusan a Beállítások -> Integrációk Meta adatait használja.",
    },
    setupSteps: {
      en: [
        "Open Meta for Developers -> Your Business App -> Add the Messenger product (or leave blank to reuse your existing Meta token from Settings -> Integrations).",
        "Generate a Page Access Token for your Facebook Page and copy your App Secret.",
        "Copy the CCRM Webhook URL and Verify Token below into Meta's Messenger Webhook settings and subscribe to 'messages' & 'messaging_postbacks'.",
      ],
      sk: [
        "Otvorte Meta for Developers -> Vaša aplikácia -> Pridajte produkt Messenger (alebo nechajte prázdne pre použitie Meta tokenu z Nastavenia -> Integrácie).",
        "Vygenerujte Page Access Token pre vašu Facebook stránku a skopírujte App Secret.",
        "Vložte CCRM Webhook URL a Verify Token nižšie do sekcie Webhooks v Meta panely a povoľte 'messages' a 'messaging_postbacks'.",
      ],
      hu: [
        "Nyissa meg a Meta for Developers felületet -> Alkalmazás -> Messenger hozzáadása (vagy hagyja üresen a Beállítások -> Integrációk Meta token használatához).",
        "Generáljon Page Access Tokent az oldalhoz, és másolja ki az App Secret értéket.",
        "Másolja be a lenti CCRM Webhook URL-t és Verify Tokent a Meta Webhooks beállításaiba ('messages' és 'messaging_postbacks').",
      ],
    },
    fields: [
      {
        key: "botmanToken",
        label: { en: "Page Access Token (optional if set in Integrations)", sk: "Page Access Token (voliteľné ak je v Integráciách)", hu: "Page Access Token (opcionális)" },
        placeholder: "EAAGm0PX4ZBQBO...",
        secret: true,
      },
      {
        key: "botmanAppSecret",
        label: { en: "Meta App Secret", sk: "Meta App Secret", hu: "Meta App Secret" },
        placeholder: "a1b2c3d4e5f6...",
        secret: true,
      },
      {
        key: "botmanVerifyToken",
        label: { en: "Webhook Verify Token", sk: "Webhook Verify Token", hu: "Webhook Verify Token" },
        placeholder: "ccrm_messenger_verify",
      },
    ],
  },

  slack: {
    type: "slack",
    driverClass: "BotMan\\Drivers\\Slack\\SlackDriver",
    portalUrl: "https://api.slack.com/apps",
    portalLabel: "Slack API Apps",
    supportsAutoWebhook: false,
    supportsLocalPolling: true,
    summary: {
      en: "Connect a Slack Workspace Bot via Events API webhook or channel history polling.",
      sk: "Pripojte Slack bota cez Events API webhook alebo automatickú synchronizáciu kanálov.",
      hu: "Slack munkaterület bot csatlakoztatása Events API webhookon vagy csatorna lekérdezésen keresztül.",
    },
    setupSteps: {
      en: [
        "Go to api.slack.com/apps -> Create New App -> OAuth & Permissions.",
        "Add Bot Token Scopes: chat:write, channels:history, groups:history, im:history, users:read. Install to Workspace and copy the xoxb-... token.",
        "Paste the CCRM Webhook URL into Event Subscriptions (subscribe to message.channels & message.im) or enter Channel IDs below for local polling.",
      ],
      sk: [
        "Prejdite na api.slack.com/apps -> Create New App -> OAuth & Permissions.",
        "Pridajte oprávnenia: chat:write, channels:history, groups:history, im:history, users:read. Nainštalujte do Workspace a skopírujte xoxb-... token.",
        "Vložte CCRM Webhook URL do Event Subscriptions (message.channels, message.im) alebo zadajte ID kanálov pre lokálny polling.",
      ],
      hu: [
        "Lépjen az api.slack.com/apps oldalra -> Create New App -> OAuth & Permissions.",
        "Adja hozzá a chat:write, channels:history, groups:history, im:history, users:read jogosultságokat, telepítse a munkaterületre, és másolja ki az xoxb-... tokent.",
        "Illessze be a CCRM Webhook URL-t az Event Subscriptions részbe, vagy adja meg a csatorna ID-kat alább.",
      ],
    },
    fields: [
      {
        key: "botmanToken",
        label: { en: "Bot User OAuth Token (xoxb-...)", sk: "Bot User OAuth Token (xoxb-...)", hu: "Bot User OAuth Token (xoxb-...)" },
        placeholder: "xoxb-1234567890-...",
        secret: true,
        required: true,
      },
      {
        key: "botmanSigningSecret",
        label: { en: "Slack Signing Secret", sk: "Slack Signing Secret", hu: "Slack Signing Secret" },
        placeholder: "8f742231b10e8888abcd...",
        secret: true,
      },
      {
        key: "botmanChannelId",
        label: { en: "Monitored Channel IDs (comma-separated)", sk: "Sledované ID kanálov (oddelené čiarkou)", hu: "Figyelt csatorna ID-k (vesszővel elválasztva)" },
        placeholder: "C012AB3CD, C098ZY7XW",
      },
    ],
  },

  discord: {
    type: "discord",
    driverClass: "BotMan\\Drivers\\Discord\\DiscordDriver",
    portalUrl: "https://discord.com/developers/applications",
    portalLabel: "Discord Developer Portal",
    supportsAutoWebhook: false,
    supportsLocalPolling: true,
    summary: {
      en: "Monitor and reply in Discord server channels via BotMan Discord REST & Webhook driver.",
      sk: "Sledujte a odpovedajte v Discord kanáloch cez BotMan Discord REST a Webhook driver.",
      hu: "Discord szerver csatornák figyelése és megválaszolása a BotMan Discord driverrel.",
    },
    setupSteps: {
      en: [
        "Open Discord Developer Portal -> New Application -> Bot tab -> Reset Token and copy the Bot Token.",
        "Enable 'Message Content Intent' under Privileged Gateway Intents, then invite the bot to your server (OAuth2 -> URL Generator -> bot -> Send Messages & Read Message History).",
        "Right-click the Discord channel(s) you want CCRM to monitor, click 'Copy Channel ID', and paste below.",
      ],
      sk: [
        "Otvorte Discord Developer Portal -> New Application -> sekcia Bot -> Reset Token a skopírujte Bot Token.",
        "Zapnite 'Message Content Intent' a pozvite bota na váš server (OAuth2 -> URL Generator -> bot -> Send Messages & Read Message History).",
        "Kliknite pravým tlačidlom na Discord kanál, zvoľte 'Copy Channel ID' a vložte ho nižšie.",
      ],
      hu: [
        "Nyissa meg a Discord Developer Portalt -> New Application -> Bot fül -> Reset Token, és másolja ki a Bot Tokent.",
        "Kapcsolja be a 'Message Content Intent' opciót, majd hívja meg a botot a szerverre (Send Messages & Read Message History).",
        "Másolja ki a figyelni kívánt Discord csatorna ID-ját (Copy Channel ID), és illessze be alább.",
      ],
    },
    fields: [
      {
        key: "botmanToken",
        label: { en: "Discord Bot Token", sk: "Discord Bot Token", hu: "Discord Bot Token" },
        placeholder: "MTIzNDU2Nzg5MDEyMzQ1Njc4.G1a2b3...",
        secret: true,
        required: true,
      },
      {
        key: "botmanChannelId",
        label: { en: "Discord Channel ID(s)", sk: "ID Discord kanálov", hu: "Discord csatorna ID-k" },
        placeholder: "109283746510293847",
        required: true,
      },
    ],
  },

  teams: {
    type: "teams",
    driverClass: "BotMan\\Drivers\\BotFramework\\BotFrameworkDriver",
    portalUrl: "https://dev.teams.microsoft.com/bots",
    portalLabel: "Teams Developer Portal",
    supportsAutoWebhook: false,
    supportsLocalPolling: false,
    summary: {
      en: "Connect Microsoft Teams via Azure Bot Framework (App ID + Client Secret).",
      sk: "Pripojte Microsoft Teams cez Azure Bot Framework (App ID + Client Secret).",
      hu: "Microsoft Teams csatlakoztatása Azure Bot Framework segítségével (App ID + Client Secret).",
    },
    setupSteps: {
      en: [
        "Open Microsoft Teams Developer Portal (or Azure Bot Services) and create/select a Bot.",
        "Copy the Microsoft App ID (Client ID) and generate a Client Secret (App Password).",
        "Paste the CCRM Webhook URL below as the Bot's Endpoint Address and enable the Microsoft Teams channel.",
      ],
      sk: [
        "Otvorte Microsoft Teams Developer Portal (alebo Azure Bot Services) a vytvorte bota.",
        "Skopírujte Microsoft App ID a vygenerujte Client Secret (heslo aplikácie).",
        "Nastavte CCRM Webhook URL nižšie ako Messaging Endpoint bota.",
      ],
      hu: [
        "Nyissa meg a Microsoft Teams Developer Portalt (vagy Azure Bot Services-t), és hozzon létre egy botot.",
        "Másolja ki a Microsoft App ID-t, és generáljon egy Client Secret kulcsot.",
        "Állítsa be a lenti CCRM Webhook URL-t a bot végpontjaként (Messaging Endpoint).",
      ],
    },
    fields: [
      {
        key: "botmanAppId",
        label: { en: "Microsoft App ID", sk: "Microsoft App ID", hu: "Microsoft App ID" },
        placeholder: "00000000-0000-0000-0000-000000000000",
        required: true,
      },
      {
        key: "botmanAppSecret",
        label: { en: "Microsoft App Password / Client Secret", sk: "Microsoft Client Secret", hu: "Microsoft Client Secret" },
        placeholder: "Client secret value",
        secret: true,
        required: true,
      },
      {
        key: "botmanServiceUrl",
        label: { en: "Bot Framework Service URL (optional)", sk: "Service URL (voliteľné)", hu: "Service URL (opcionális)" },
        placeholder: "https://smba.trafficmanager.net/teams",
      },
    ],
  },

  viber: {
    type: "viber",
    driverClass: "BotMan\\Drivers\\Viber\\ViberDriver",
    portalUrl: "https://partners.viber.com/",
    portalLabel: "Viber Admin Panel",
    supportsAutoWebhook: true,
    supportsLocalPolling: false,
    summary: {
      en: "Connect a Viber Public / Bot Account with 1-click webhook registration.",
      sk: "Pripojte Viber Bot účet s registráciou webhooku na 1 kliknutie.",
      hu: "Viber Bot fiók csatlakoztatása 1-kattintásos webhook regisztrációval.",
    },
    setupSteps: {
      en: [
        "Log in to partners.viber.com and create or select your Viber Bot Account.",
        "Copy the Auth Token and paste it below, along with your Bot Sender Name.",
        "Click 'Test Connection' and 'Register Webhook' to activate live Viber messaging.",
      ],
      sk: [
        "Prihláste sa na partners.viber.com a vytvorte alebo vyberte Viber Bot účet.",
        "Skopírujte Auth Token a vložte ho nižšie spolu s menom odosielateľa.",
        "Kliknite na 'Otestovať' a 'Registrovať Webhook' pre aktiváciu Viber správ.",
      ],
      hu: [
        "Jelentkezzen be a partners.viber.com oldalon, és válassza ki a Viber Bot fiókot.",
        "Másolja be az Auth Tokent és a küldő nevét alább.",
        "Kattintson a 'Kapcsolat tesztelése' és 'Webhook regisztrálása' gombokra.",
      ],
    },
    fields: [
      {
        key: "botmanToken",
        label: { en: "Viber Auth Token", sk: "Viber Auth Token", hu: "Viber Auth Token" },
        placeholder: "445da6az1s345z78-d1234567890abcdef-...",
        secret: true,
        required: true,
      },
      {
        key: "botmanSenderName",
        label: { en: "Bot Sender Name", sk: "Meno odosielateľa (Bot)", hu: "Bot megjelenített neve" },
        placeholder: "CCRM Support",
      },
    ],
  },

  twilio: {
    type: "twilio",
    driverClass: "BotMan\\Drivers\\Twilio\\TwilioMessageDriver",
    portalUrl: "https://console.twilio.com/",
    portalLabel: "Twilio Console",
    supportsAutoWebhook: false,
    supportsLocalPolling: true,
    summary: {
      en: "2-way SMS messaging via Twilio Programmable Messaging (for WhatsApp, use the native WAAI QR connector).",
      sk: "Obojsmerné SMS správy cez Twilio Programmable Messaging (pre WhatsApp použite natívny WAAI QR konektor).",
      hu: "Kétirányú SMS üzenetküldés Twilio Programmable Messaging segítségével (WhatsApphoz használja a WAAI QR-t).",
    },
    setupSteps: {
      en: [
        "Open Twilio Console (console.twilio.com) and copy your Account SID (AC...) and Auth Token.",
        "Enter your active Twilio SMS phone number in E.164 format (e.g. +14155552671).",
        "Under Phone Numbers -> Manage -> Active Numbers, paste the CCRM Webhook URL into 'A message comes in (Webhook POST)'.",
      ],
      sk: [
        "Otvorte Twilio Console (console.twilio.com) a skopírujte Account SID (AC...) a Auth Token.",
        "Zadajte vaše Twilio SMS telefónne číslo vo formáte E.164 (napr. +421900123456).",
        "V sekcii Phone Numbers -> Active Numbers vložte CCRM Webhook URL do poľa 'A message comes in (Webhook POST)'.",
      ],
      hu: [
        "Nyissa meg a Twilio Console-t (console.twilio.com), és másolja ki az Account SID (AC...) és Auth Token értékeket.",
        "Adja meg az aktív Twilio SMS telefonszámát E.164 formátumban (pl. +36301234567).",
        "A Phone Numbers -> Active Numbers alatt illessze be a CCRM Webhook URL-t az 'A message comes in' mezőbe.",
      ],
    },
    fields: [
      {
        key: "botmanAppId",
        label: { en: "Twilio Account SID", sk: "Twilio Account SID", hu: "Twilio Account SID" },
        placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        required: true,
      },
      {
        key: "botmanToken",
        label: { en: "Twilio Auth Token", sk: "Twilio Auth Token", hu: "Twilio Auth Token" },
        placeholder: "your_auth_token",
        secret: true,
        required: true,
      },
      {
        key: "botmanFromNumber",
        label: { en: "Twilio SMS Phone Number", sk: "Twilio SMS číslo", hu: "Twilio SMS telefonszám" },
        placeholder: "+14155552671",
        required: true,
      },
    ],
  },

  webchat: {
    type: "webchat",
    driverClass: "BotMan\\Drivers\\Web\\WebDriver",
    portalUrl: "https://botman.io/2.0/driver-web",
    portalLabel: "BotMan WebDriver Docs",
    supportsAutoWebhook: false,
    supportsLocalPolling: false,
    isWebWidget: true,
    summary: {
      en: "Embeddable Live Chat Widget powered by BotMan WebDriver — paste 1 <script> tag on your website to chat with visitors & trigger AI Agents.",
      sk: "Vložiteľný Live Chat Widget (BotMan WebDriver) — vložte 1 <script> tag na váš web a komunikujte s návštevníkmi alebo AI agentmi.",
      hu: "Beágyazható Élő Chat Widget (BotMan WebDriver) — illesszen be 1 <script> kódot a weboldalába az élő ügyfélszolgálathoz.",
    },
    setupSteps: {
      en: [
        "Customize your chat widget header title below and click Save.",
        "Copy the generated <script> embed snippet below and paste it right before </body> on your website.",
        "Messages sent by website visitors appear instantly in CCRM's Communication Hub and can trigger any wired AI Agent!",
      ],
      sk: [
        "Upravte názov hlavičky chat widgetu nižšie a kliknite na Uložiť.",
        "Skopírujte vygenerovaný <script> kód a vložte ho pred značku </body> na vašej webstránke.",
        "Správy od návštevníkov webu sa okamžite zobrazia v CCRM a môžu spúšťať pripojených AI agentov!",
      ],
      hu: [
        "Adja meg a chat widget fejléc címét alább, majd kattintson a Mentés gombra.",
        "Másolja ki a generált <script> beágyazó kódot, és illessze be a weboldala </body> címkéje elé.",
        "A látogatók üzenetei azonnal megjelennek a CCRM-ben, és aktiválhatják a bekötött AI ügynököket!",
      ],
    },
    fields: [
      {
        key: "botmanSenderName",
        label: { en: "Widget Header Title", sk: "Názov hlavičky widgetu", hu: "Widget fejléc címe" },
        placeholder: "CCRM Live Support",
      },
      {
        key: "botmanVerifyToken",
        label: { en: "Widget Site Key", sk: "Kľúč widgetu (Site Key)", hu: "Widget oldalkulcs" },
        placeholder: "ccrm_webchat_verify",
      },
    ],
  },
};

export const getBotManWebhookUrl = (id: string, driver: BotManConnectorType): string => {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const cid = encodeURIComponent(id || "YOUR_CONNECTOR_ID");
  return `${origin}/api/botman_webhook.php?connector_id=${cid}&driver=${encodeURIComponent(driver)}`;
};

export const getBotManWidgetSnippet = (id: string): string => {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const cid = encodeURIComponent(id || "YOUR_CONNECTOR_ID");
  return `<script src="${origin}/api/botman_webhook.php?widget=js&connector_id=${cid}" async></script>`;
};

export const registerBotManWebhook = (draft: MailboxDraft, webhookUrl?: string) =>
  call<{ ok: boolean; detail?: string; error?: string; webhookUrl?: string }>("botman_register_webhook", {
    ...mailboxPayload(draft),
    webhookUrl,
  });
