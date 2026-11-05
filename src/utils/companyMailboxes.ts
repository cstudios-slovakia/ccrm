/*
  Unified External Connectors & Company Mailboxes (`#settings/email/mailboxes`):
  shared email accounts (`gmail`, `smtp`, `exchange`), WhatsApp (`whatsapp` via WAAI QR),
  and subscription-based AI agents (`claude`, `antigravity`, `chatgpt` via Marveen + CCRM MCP).
  Secrets never come back from the server in plaintext; the form shows a mask and sends it
  back unchanged, which the server reads as "keep the stored one".
*/

export const SECRET_MASK = "********";

export type ConnectorType =
  | "gmail"
  | "smtp"
  | "exchange"
  | "whatsapp"
  | "claude"
  | "antigravity"
  | "chatgpt";

export const EMAIL_CONNECTOR_TYPES: readonly ConnectorType[] = ["gmail", "smtp", "exchange"];
export const AGENT_CONNECTOR_TYPES: readonly ConnectorType[] = ["claude", "antigravity", "chatgpt"];

export const isEmailConnector = (type: ConnectorType): boolean =>
  EMAIL_CONNECTOR_TYPES.includes(type);

export const isAgentConnector = (type: ConnectorType): boolean =>
  AGENT_CONNECTOR_TYPES.includes(type);

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
    explicit === "chatgpt"
  ) {
    return explicit;
  }
  if (settings?.provider === "exchange") return "exchange";
  const host = (settings?.imapHost || "").toLowerCase();
  if (host.includes("gmail.com") || host.includes("googlemail.com")) return "gmail";
  const addr = address.toLowerCase();
  if (addr.startsWith("whatsapp:")) return "whatsapp";
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
  kind: "memory" | "subagent" | "schedule" | "mcp";
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
  createdAt?: string;
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
  mcpConnected: boolean;
  mcpEndpoint?: string;
  memoryMd: string;
  memoryUpdatedAt?: string;
  subagentMemoryMd?: string;
  artifacts?: AgentArtifact[];
  subagents: AgentSubagent[];
  tasks: AgentAutonomousTask[];
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
}) =>
  call<AgentConnectorState>("agent_subagent_save", {
    id: params.id,
    name: params.name,
    role: params.role,
    systemPrompt: params.systemPrompt,
    memoryMd: params.memoryMd,
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

export const runAgentHeartbeat = (id: string) =>
  call<AgentConnectorState>("agent_heartbeat", { id });

export const clearAgentChatHistory = (id: string) =>
  call<AgentConnectorState>("agent_chat_clear", { id });

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
