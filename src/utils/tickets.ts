import type {
  Project,
  ProjectRetainerConfig,
  Ticket,
  TicketPriority,
  TicketSettingsConfig,
  TicketStatusCategory,
  TicketStatusDef,
  SupportContract,
} from "../types";

export const TICKET_STATUS_GROUPS: readonly TicketStatusCategory[] = [
  "new",
  "open",
  "waiting",
  "resolved",
  "closed",
];

export const NEW_TICKET_STATUS_COLOR = "#6366f1";

const NAMED_COLOR_HEX: Record<string, string> = {
  blue: "#0ea5e9",
  sky: "#0ea5e9",
  indigo: "#a855f7",
  amber: "#f59e0b",
  orange: "#f97316",
  purple: "#8b5cf6",
  violet: "#6366f1",
  emerald: "#10b981",
  green: "#10b981",
  slate: "#64748b",
  gray: "#64748b",
  rose: "#f43f5e",
  red: "#ef4444",
};

const BUILTIN_TICKET_STATUS_LABELS: Record<string, [string, string, string]> = {
  new: ["New", "Nový", "Új"],
  open: ["In Progress", "V riešení", "Folyamatban"],
  in_progress: ["In Progress", "V riešení", "Folyamatban"],
  waiting: ["Waiting on Client", "Čaká na klienta", "Ügyfélre vár"],
  waiting_client: ["Waiting on Client", "Čaká na klienta", "Ügyfélre vár"],
  waiting_internal: ["Waiting Internal", "Čaká interne", "Belső várakozás"],
  resolved: ["Resolved", "Vyriešený", "Megoldva"],
  closed: ["Closed", "Uzavretý", "Lezárva"],
};

export const DEFAULT_TICKET_STATUS_DEFS: TicketStatusDef[] = [
  {
    id: "new",
    key: "new",
    category: "new",
    group: "new",
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
    group: "open",
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
    group: "waiting",
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
    group: "resolved",
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
    group: "closed",
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

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

export const normalizeTicketStatuses = (
  raw: TicketStatusDef[] | null | undefined,
): TicketStatusDef[] => {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_TICKET_STATUS_DEFS.map((d) => ({ ...d }));
  }
  const mapped = raw.map((s, idx) => {
    const rec = s as unknown as Record<string, any>;
    const key = String(s.id || s.key || `status_${idx + 1}`).trim();
    const builtin = DEFAULT_TICKET_STATUS_DEFS.find((d) => d.id === key || d.key === key);
    const builtinLabels = BUILTIN_TICKET_STATUS_LABELS[key];
    const rawCat = String(s.category || rec.group || builtin?.category || "open").trim();
    const category: TicketStatusCategory = (TICKET_STATUS_GROUPS as readonly string[]).includes(rawCat)
      ? (rawCat as TicketStatusCategory)
      : "open";
    const rawColor = String(s.color || "").trim().toLowerCase();
    const color = HEX_COLOR_RE.test(rawColor)
      ? rawColor
      : NAMED_COLOR_HEX[rawColor] || builtin?.color || NEW_TICKET_STATUS_COLOR;
    const customLabel = typeof s.label === "string" && s.label.trim() ? s.label.trim() : undefined;
    const labelsObj = rec.labels && typeof rec.labels === "object" ? rec.labels : null;
    const labelEn =
      customLabel ||
      s.labelEn ||
      labelsObj?.en ||
      builtinLabels?.[0] ||
      builtin?.labelEn ||
      key;
    const labelSk =
      customLabel ||
      s.labelSk ||
      labelsObj?.sk ||
      builtinLabels?.[1] ||
      builtin?.labelSk ||
      labelEn;
    const labelHu =
      customLabel ||
      s.labelHu ||
      labelsObj?.hu ||
      builtinLabels?.[2] ||
      builtin?.labelHu ||
      labelEn;
    const pausesSla =
      typeof s.pausesSla === "boolean"
        ? s.pausesSla
        : category === "waiting" || category === "resolved" || category === "closed";
    const isTerminal =
      typeof s.isTerminal === "boolean"
        ? s.isTerminal
        : category === "resolved" || category === "closed";
    const sortOrder = s.sortOrder ?? s.order ?? idx + 1;
    return {
      ...s,
      id: key,
      key,
      ...(customLabel ? { label: customLabel } : {}),
      category,
      group: category,
      labelSk,
      labelEn,
      labelHu,
      color,
      pausesSla,
      isTerminal,
      sortOrder,
      order: sortOrder,
    };
  });
  return [...mapped].sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
};

export const ticketStatusKeyFor = (name: string, taken: readonly string[]): string => {
  const base =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 46) || "status";
  if (!taken.includes(base)) return base;
  let i = 2;
  while (taken.includes(`${base}_${i}`)) i++;
  return `${base}_${i}`;
};

export const defaultTicketStatus = (
  statuses: readonly TicketStatusDef[] = DEFAULT_TICKET_STATUS_DEFS,
): string =>
  statuses.find((d) => (d.category || d.group) === "new")?.id ??
  statuses.find((d) => (d.category || d.group) === "open")?.id ??
  statuses[0]?.id ??
  "new";

export const normalizeTicketSettings = (
  raw: Partial<TicketSettingsConfig> | null | undefined,
): TicketSettingsConfig => {
  if (!raw || typeof raw !== "object") return DEFAULT_TICKET_SETTINGS;
  const rawTemplates = Array.isArray(raw.replyTemplates)
    ? raw.replyTemplates
    : Array.isArray(raw.cannedResponses)
      ? raw.cannedResponses
      : DEFAULT_TICKET_SETTINGS.replyTemplates;
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
    replyTemplates: rawTemplates.map((tpl: any, idx: number) => ({
      ...tpl,
      id: String(tpl?.id || `tpl_${idx + 1}`),
      title: String(tpl?.title || tpl?.name || tpl?.shortcut || `Template #${idx + 1}`),
      name: String(tpl?.name || tpl?.title || `Template #${idx + 1}`),
      body: String(tpl?.body || ""),
    })),
  };
};

export const getTicketStatusLabel = (
  statusDef: TicketStatusDef | undefined,
  lang: "sk" | "en" | "hu" = "sk",
  fallbackId = "",
): string => {
  if (!statusDef) return fallbackId;
  if (statusDef.label) return statusDef.label;
  const key = statusDef.id || statusDef.key || fallbackId;
  const builtin = BUILTIN_TICKET_STATUS_LABELS[key];
  if (lang === "hu") return statusDef.labelHu || builtin?.[2] || statusDef.labelEn || statusDef.labelSk || key;
  if (lang === "en") return statusDef.labelEn || builtin?.[0] || statusDef.labelSk || key;
  return statusDef.labelSk || builtin?.[1] || statusDef.labelEn || key;
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
  return `${h}:${String(m).padStart(2, "0")}`;
};

export const parseDurationColonInput = (raw: string): number => {
  const s = String(raw || "").trim();
  if (!s) return 0;
  if (s.includes(":")) {
    const [hStr = "0", mStr = "0"] = s.split(":");
    const h = parseInt(hStr.replace(/\D/g, "") || "0", 10);
    const m = parseInt(mStr.replace(/\D/g, "") || "0", 10);
    return (Number.isNaN(h) ? 0 : h) * 60 + (Number.isNaN(m) ? 0 : m);
  }
  const n = parseInt(s.replace(/\D/g, "") || "0", 10);
  return Number.isNaN(n) ? 0 : n;
};

export const sanitizeColonTimeDraft = (raw: string): string => {
  const str = String(raw ?? "");
  if (str.includes(":")) {
    const [left = "", right = ""] = str.split(":");
    const h = left.replace(/\D/g, "").slice(0, 3);
    const m = right.replace(/\D/g, "").slice(0, 2);
    return `${h}:${m}`;
  }
  const digits = str.replace(/\D/g, "");
  if (!digits) return ":";
  if (digits.length <= 2) {
    return `${digits}:00`;
  }
  const h = digits.slice(0, -2).slice(0, 3);
  const m = digits.slice(-2);
  return `${h}:${m}`;
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

export const clampRetainerResetDay = (raw: unknown): number => {
  const num = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (Number.isNaN(num) || !Number.isFinite(num)) return 1;
  return Math.max(1, Math.min(31, Math.round(num)));
};

const daysInYearMonth = (year: number, month0: number): number =>
  new Date(year, month0 + 1, 0).getDate();

const formatIsoDateParts = (year: number, month0: number, day: number): string => {
  const m = String(month0 + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
};

export interface RetainerPeriodWindow {
  resetDay: number;
  periodStart: string;
  nextResetDate: string;
}

/**
 * Computes the active monthly retainer cycle `[periodStart, nextResetDate)`
 * anchored to `resetDay` (1..31). Months shorter than `resetDay` clamp to the
 * last day of that month.
 */
export const computeRetainerPeriod = (
  resetDayRaw: unknown,
  referenceDate: Date = new Date(),
): RetainerPeriodWindow => {
  const resetDay = clampRetainerResetDay(resetDayRaw);
  const year = referenceDate.getFullYear();
  const month0 = referenceDate.getMonth();
  const todayDay = referenceDate.getDate();

  const thisMonthResetDay = Math.min(resetDay, daysInYearMonth(year, month0));

  if (todayDay >= thisMonthResetDay) {
    const periodStart = formatIsoDateParts(year, month0, thisMonthResetDay);
    const nextYear = month0 === 11 ? year + 1 : year;
    const nextMonth0 = month0 === 11 ? 0 : month0 + 1;
    const nextMonthResetDay = Math.min(
      resetDay,
      daysInYearMonth(nextYear, nextMonth0),
    );
    const nextResetDate = formatIsoDateParts(
      nextYear,
      nextMonth0,
      nextMonthResetDay,
    );
    return { resetDay, periodStart, nextResetDate };
  }

  const prevYear = month0 === 0 ? year - 1 : year;
  const prevMonth0 = month0 === 0 ? 11 : month0 - 1;
  const prevMonthResetDay = Math.min(
    resetDay,
    daysInYearMonth(prevYear, prevMonth0),
  );
  const periodStart = formatIsoDateParts(prevYear, prevMonth0, prevMonthResetDay);
  const nextResetDate = formatIsoDateParts(year, month0, thisMonthResetDay);
  return { resetDay, periodStart, nextResetDate };
};

export const resolveProjectRetainer = (
  project: Project | null | undefined,
  supportContracts: readonly SupportContract[] = [],
): ProjectRetainerConfig => {
  const raw =
    project?.ticketRetainer ?? project?.ticketWidgetConfig?.retainer ?? null;
  if (raw && typeof raw === "object") {
    return {
      enabled: Boolean(raw.enabled),
      name: raw.name || "",
      monthlyHours: Math.max(0, Number(raw.monthlyHours ?? 10) || 0),
      resetDay: clampRetainerResetDay(raw.resetDay ?? 1),
      overageRate:
        raw.overageRate !== undefined && raw.overageRate !== null
          ? Number(raw.overageRate)
          : 65,
      currency: raw.currency || "EUR",
      slaTier: raw.slaTier || "standard",
    };
  }

  if (project?.id) {
    const matched = (supportContracts || []).find(
      (c) =>
        c.projectId === project.id &&
        c.active !== false &&
        c.isActive !== false,
    );
    if (matched) {
      const hours =
        matched.monthlyHoursIncluded ?? matched.monthlyHours ?? 10;
      return {
        enabled: hours > 0,
        name: matched.name || "",
        monthlyHours: Math.max(0, Number(hours) || 0),
        resetDay: clampRetainerResetDay(matched.resetDay ?? 1),
        overageRate:
          matched.overageRate ??
          matched.hourlyOverageRate ??
          matched.hourlyRate ??
          65,
        currency: matched.currency || "EUR",
        slaTier: matched.slaTier || matched.tier || "standard",
      };
    }
  }

  return {
    enabled: false,
    name: "",
    monthlyHours: 10,
    resetDay: 1,
    overageRate: 65,
    currency: "EUR",
    slaTier: "standard",
  };
};

export interface ProjectRetainerUsage {
  enabled: boolean;
  name: string;
  monthlyHours: number;
  monthlyMinutes: number;
  usedMinutes: number;
  usedHours: number;
  remainingMinutes: number;
  overageMinutes: number;
  percent: number;
  rawPercent: number;
  resetDay: number;
  periodStart: string;
  nextResetDate: string;
  overageRate: number;
  currency: string;
  slaTier: string;
}

/**
 * Calculates how much of a project's monthly retainer has been consumed in the
 * current cycle `[periodStart, nextResetDate)` based on time logged on the
 * project's tickets.
 */
export const computeProjectRetainerUsage = (
  project: Project | null | undefined,
  tickets: readonly Ticket[] = [],
  supportContracts: readonly SupportContract[] = [],
  referenceDate: Date = new Date(),
): ProjectRetainerUsage => {
  const cfg = resolveProjectRetainer(project, supportContracts);
  const period = computeRetainerPeriod(cfg.resetDay, referenceDate);
  const monthlyMinutes = Math.max(0, Math.round((cfg.monthlyHours || 0) * 60));

  let usedMinutes = 0;
  if (project?.id) {
    for (const tk of tickets || []) {
      if (!tk || tk.archived || tk.isArchived) continue;
      if (tk.projectId !== project.id) continue;

      if (Array.isArray(tk.timeEntries) && tk.timeEntries.length > 0) {
        for (const entry of tk.timeEntries) {
          if (!entry || entry.billable === false) continue;
          const stamp = String(
            entry.loggedAt || entry.createdAt || tk.createdAt || "",
          ).slice(0, 10);
          if (
            !stamp ||
            (stamp >= period.periodStart && stamp < period.nextResetDate)
          ) {
            usedMinutes += Math.max(0, Number(entry.minutes || 0));
          }
        }
      } else if ((tk.loggedMinutes || 0) > 0) {
        const stamp = String(tk.updatedAt || tk.createdAt || "").slice(0, 10);
        if (
          !stamp ||
          (stamp >= period.periodStart && stamp < period.nextResetDate)
        ) {
          usedMinutes += Math.max(0, Number(tk.loggedMinutes || 0));
        }
      }
    }
  }

  const remainingMinutes = Math.max(0, monthlyMinutes - usedMinutes);
  const overageMinutes = Math.max(0, usedMinutes - monthlyMinutes);
  const usedHours = +(usedMinutes / 60).toFixed(2);
  const rawPercent =
    monthlyMinutes > 0 ? Math.round((usedMinutes / monthlyMinutes) * 100) : 0;
  const percent = Math.min(100, rawPercent);

  return {
    enabled: cfg.enabled,
    name: cfg.name || "",
    monthlyHours: cfg.monthlyHours,
    monthlyMinutes,
    usedMinutes,
    usedHours,
    remainingMinutes,
    overageMinutes,
    percent,
    rawPercent,
    resetDay: period.resetDay,
    periodStart: period.periodStart,
    nextResetDate: period.nextResetDate,
    overageRate: Number(cfg.overageRate ?? 65),
    currency: cfg.currency || "EUR",
    slaTier: cfg.slaTier || "standard",
  };
};


