import type {
  Ticket,
  TicketPriority,
  TicketSettingsConfig,
  TicketStatusDef,
  SupportContract,
} from "../types";

export const DEFAULT_TICKET_STATUS_DEFS: TicketStatusDef[] = [
  {
    id: "new",
    key: "new",
    category: "new",
    labelSk: "Nový",
    labelEn: "New",
    labelHu: "Új",
    color: "#3b82f6",
    pausesSla: false,
    isTerminal: false,
    sortOrder: 1,
    order: 1,
  },
  {
    id: "open",
    key: "open",
    category: "open",
    labelSk: "V riešení",
    labelEn: "In Progress",
    labelHu: "Folyamatban",
    color: "#f59e0b",
    pausesSla: false,
    isTerminal: false,
    sortOrder: 2,
    order: 2,
  },
  {
    id: "waiting",
    key: "waiting",
    category: "waiting",
    labelSk: "Čaká na klienta",
    labelEn: "Waiting on Client",
    labelHu: "Ügyfélre vár",
    color: "#8b5cf6",
    pausesSla: true,
    isTerminal: false,
    sortOrder: 3,
    order: 3,
  },
  {
    id: "resolved",
    key: "resolved",
    category: "resolved",
    labelSk: "Vyriešený",
    labelEn: "Resolved",
    labelHu: "Megoldva",
    color: "#10b981",
    pausesSla: true,
    isTerminal: true,
    sortOrder: 4,
    order: 4,
  },
  {
    id: "closed",
    key: "closed",
    category: "closed",
    labelSk: "Uzavretý",
    labelEn: "Closed",
    labelHu: "Lezárva",
    color: "#64748b",
    pausesSla: true,
    isTerminal: true,
    sortOrder: 5,
    order: 5,
  },
];

export const DEFAULT_TICKET_STATUSES = DEFAULT_TICKET_STATUS_DEFS;

export const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: "#64748b",
  normal: "#3b82f6",
  high: "#f59e0b",
  critical: "#ef4444",
};

export const DEFAULT_TICKET_SETTINGS: TicketSettingsConfig = {
  imapEnabled: false,
  imapHost: "",
  imapPort: 993,
  imapEncryption: "ssl",
  imapUser: "",
  imapPassword: "",
  imapFolder: "INBOX",
  smtpHost: "",
  smtpPort: 465,
  smtpEncryption: "ssl",
  smtpUser: "",
  smtpPassword: "",
  fromName: "Support Desk",
  fromEmail: "",
  aiRoutingEnabled: true,
  openAiKey: "",
  businessHours: {
    timezone: "Europe/Bratislava",
    workDays: [1, 2, 3, 4, 5],
    startHour: "09:00",
    endHour: "17:00",
  },
  slaTargets: {
    critical: { firstResponseMins: 30, resolutionMins: 240 },
    high: { firstResponseMins: 120, resolutionMins: 480 },
    normal: { firstResponseMins: 240, resolutionMins: 1440 },
    low: { firstResponseMins: 480, resolutionMins: 2880 },
  },
  replyTemplates: [
    {
      id: "tpl-ack",
      title: "Potvrdenie prijatia / Acknowledged",
      shortcut: "/ack",
      body: "Dobrý deň,\n\nďakujeme za nahlásenie. Váš tiket sme prijali a náš tím sa mu už venuje. O ďalšom postupe vás budeme informovať.",
    },
    {
      id: "tpl-info",
      title: "Doplnenie informácií / Need Info",
      shortcut: "/info",
      body: "Dobrý deň,\n\npre doriešenie vašej požiadavky by sme potrebovali doplniť ešte niekoľko detailov (prípadne snímku obrazovky alebo presný postup krokov). Ďakujeme!",
    },
    {
      id: "tpl-resolved",
      title: "Vyriešené / Resolved",
      shortcut: "/resolved",
      body: "Dobrý deň,\n\nhlásený problém bol odstránený a nasadený. Prosím, overte funkčnosť na vašej strane. V prípade ďalších otázok môžete odpovedať priamo na tento tiket.",
    },
  ],
};

export const normalizeTicketStatuses = (
  raw: TicketStatusDef[] | null | undefined,
): TicketStatusDef[] => {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_TICKET_STATUS_DEFS;
  }
  return [...raw]
    .map((s, idx) => ({
      ...s,
      id: s.id || s.key || `status-${idx}`,
      key: s.key || s.id || `status-${idx}`,
      sortOrder: s.sortOrder ?? s.order ?? idx + 1,
      order: s.order ?? s.sortOrder ?? idx + 1,
    }))
    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
};

export const normalizeTicketSettings = (
  raw: Partial<TicketSettingsConfig> | null | undefined,
): TicketSettingsConfig => {
  if (!raw || typeof raw !== "object") return DEFAULT_TICKET_SETTINGS;
  return {
    ...DEFAULT_TICKET_SETTINGS,
    ...raw,
    businessHours: {
      ...DEFAULT_TICKET_SETTINGS.businessHours,
      ...(raw.businessHours || {}),
    },
    slaTargets: {
      ...DEFAULT_TICKET_SETTINGS.slaTargets,
      ...(raw.slaTargets || {}),
    },
    replyTemplates: Array.isArray(raw.replyTemplates)
      ? raw.replyTemplates
      : DEFAULT_TICKET_SETTINGS.replyTemplates,
  };
};

export const getTicketStatusLabel = (
  statusDef: TicketStatusDef | undefined,
  lang: "sk" | "en" | "hu" = "sk",
  fallbackId = "",
): string => {
  if (!statusDef) return fallbackId;
  if (lang === "hu") return statusDef.labelHu || statusDef.labelEn || statusDef.labelSk || statusDef.id;
  if (lang === "en") return statusDef.labelEn || statusDef.labelSk || statusDef.id;
  return statusDef.labelSk || statusDef.labelEn || statusDef.id;
};

export const ticketStatusColor = (
  status: string,
  statuses: TicketStatusDef[] = DEFAULT_TICKET_STATUS_DEFS,
): string => {
  const found = (statuses || DEFAULT_TICKET_STATUS_DEFS).find(
    (s) => s.id === status || s.key === status,
  );
  return found?.color || "#64748b";
};

export const ticketStatusLabel = (
  status: string,
  lang: "sk" | "en" | "hu" = "sk",
  statuses: TicketStatusDef[] = DEFAULT_TICKET_STATUS_DEFS,
): string => {
  const found = (statuses || DEFAULT_TICKET_STATUS_DEFS).find(
    (s) => s.id === status || s.key === status,
  );
  return getTicketStatusLabel(found, lang, status);
};

export const isClosedTicketStatus = (
  status: string,
  statuses: TicketStatusDef[] = DEFAULT_TICKET_STATUS_DEFS,
): boolean => {
  if (status === "resolved" || status === "closed") return true;
  const found = (statuses || DEFAULT_TICKET_STATUS_DEFS).find(
    (s) => s.id === status || s.key === status,
  );
  return Boolean(
    found?.isTerminal ||
      found?.category === "resolved" ||
      found?.category === "closed",
  );
};

export const nextTicketNumber = (tickets: Ticket[]): string => {
  let max = 0;
  for (const t of tickets) {
    const m = /TCK-(\d+)/i.exec(t.ticketNumber || "");
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `TCK-${String(max + 1).padStart(4, "0")}`;
};

export const generateTicketNumber = nextTicketNumber;

export const computeTicketSlaDueDates = (
  priority: TicketPriority,
  settings: TicketSettingsConfig,
  contract?: SupportContract | null,
): { firstResponseDueAt: string; resolutionDueAt: string } => {
  const target = settings?.slaTargets?.[priority] || settings?.slaTargets?.normal || DEFAULT_TICKET_SETTINGS.slaTargets.normal;
  const firstMins = contract?.slaFirstResponseMins || target.firstResponseMins || 240;
  const resMins = contract?.slaResolutionMins || target.resolutionMins || 1440;
  const now = Date.now();
  const fmt = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);
  return {
    firstResponseDueAt: fmt(now + firstMins * 60_000),
    resolutionDueAt: fmt(now + resMins * 60_000),
  };
};

export const computeSlaDueDates = (
  firstArg: string | TicketPriority,
  secondArg: TicketPriority | TicketSettingsConfig,
  thirdArg?: TicketSettingsConfig | SupportContract | null,
  fourthArg?: SupportContract | null,
): { firstResponseDueAt: string; resolutionDueAt: string } => {
  if (typeof secondArg === "string") {
    return computeTicketSlaDueDates(
      secondArg as TicketPriority,
      (thirdArg as TicketSettingsConfig) || DEFAULT_TICKET_SETTINGS,
      fourthArg,
    );
  }
  return computeTicketSlaDueDates(
    firstArg as TicketPriority,
    (secondArg as TicketSettingsConfig) || DEFAULT_TICKET_SETTINGS,
    thirdArg as SupportContract | null | undefined,
  );
};

export const formatDurationMinutes = (mins: number): string => {
  const total = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
};

export interface TicketSlaState {
  status: "met" | "paused" | "breached" | "warning" | "ok" | "none";
  state: "met" | "paused" | "breached" | "warning" | "ok" | "none";
  remainingMinutes: number | null;
  minutesRemaining: number | null;
  label: string;
}

export const evaluateTicketSla = (
  ticket: Ticket,
  statusDefs: TicketStatusDef[] = DEFAULT_TICKET_STATUS_DEFS,
): TicketSlaState => {
  const st = statusDefs.find((s) => s.id === ticket.status || s.key === ticket.status);
  if (st?.isTerminal || ticket.status === "resolved" || ticket.status === "closed") {
    return {
      status: "met",
      state: "met",
      remainingMinutes: null,
      minutesRemaining: null,
      label: "SLA OK",
    };
  }
  if (st?.pausesSla || ticket.slaPausedAt) {
    return {
      status: "paused",
      state: "paused",
      remainingMinutes: null,
      minutesRemaining: null,
      label: "SLA Paused",
    };
  }
  const respondedAt = ticket.slaFirstRespondedAt || ticket.firstRespondedAt;
  const firstDue = ticket.slaFirstResponseDueAt || ticket.firstResponseDueAt;
  const resDue = ticket.slaResolutionDueAt || ticket.resolutionDueAt;
  const dueStr = !respondedAt ? firstDue || resDue : resDue;
  if (!dueStr) {
    return {
      status: "none",
      state: "none",
      remainingMinutes: null,
      minutesRemaining: null,
      label: "—",
    };
  }
  const trimmed = dueStr.trim();
  const isoStr = trimmed.includes("T")
    ? trimmed
    : `${trimmed.replace(" ", "T")}Z`;
  const dueMs = new Date(isoStr).getTime();
  if (Number.isNaN(dueMs)) {
    return {
      status: "none",
      state: "none",
      remainingMinutes: null,
      minutesRemaining: null,
      label: "—",
    };
  }
  const diffMins = Math.round((dueMs - Date.now()) / 60_000);
  if (diffMins < 0) {
    const overH = Math.floor(Math.abs(diffMins) / 60);
    const overM = Math.abs(diffMins) % 60;
    return {
      status: "breached",
      state: "breached",
      remainingMinutes: diffMins,
      minutesRemaining: diffMins,
      label: overH > 0 ? `-${overH}h ${overM}m` : `-${overM}m`,
    };
  }
  const remH = Math.floor(diffMins / 60);
  const remM = diffMins % 60;
  const label = remH > 0 ? `${remH}h ${remM}m` : `${remM}m`;
  if (diffMins <= 45) {
    return {
      status: "warning",
      state: "warning",
      remainingMinutes: diffMins,
      minutesRemaining: diffMins,
      label,
    };
  }
  return {
    status: "ok",
    state: "ok",
    remainingMinutes: diffMins,
    minutesRemaining: diffMins,
    label,
  };
};

