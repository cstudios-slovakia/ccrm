import type { TaskActivityEventType, TaskActivityItem } from "../types";
import type { Language } from "./translations";

export const TASK_QUICK_EMOJIS = ["👍", "❤️", "🔥", "👀", "🎉", "✅"] as const;

export function normalizeReactionRecord(
  raw: Record<string, string[]> | null | undefined
): Record<string, string[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [emoji, users] of Object.entries(raw)) {
    const cleanEmoji = emoji.trim();
    if (!cleanEmoji || !Array.isArray(users)) continue;
    const uniqueUsers = Array.from(new Set(users.map((u) => String(u).trim()).filter(Boolean)));
    if (uniqueUsers.length > 0) out[cleanEmoji] = uniqueUsers;
  }
  return out;
}

export function toggleReactionMap(
  current: Record<string, string[]> | null | undefined,
  emoji: string,
  userName: string
): Record<string, string[]> {
  const actor = userName.trim();
  const cleanEmoji = emoji.trim();
  const next = normalizeReactionRecord(current);
  if (!actor || !cleanEmoji) return next;

  const existing = next[cleanEmoji] || [];
  if (existing.includes(actor)) {
    const filtered = existing.filter((u) => u !== actor);
    if (filtered.length === 0) {
      delete next[cleanEmoji];
    } else {
      next[cleanEmoji] = filtered;
    }
  } else {
    if (!next[cleanEmoji] && Object.keys(next).length >= 12) {
      return next;
    }
    next[cleanEmoji] = [...existing, actor];
  }
  return next;
}

export function mergeActivityDelta(
  existing: TaskActivityItem[],
  delta: TaskActivityItem[]
): TaskActivityItem[] {
  if (delta.length === 0) return existing;
  const byId = new Map<number, TaskActivityItem>();
  for (const item of existing) {
    byId.set(item.id, item);
  }
  for (const item of delta) {
    if (item.deleted) {
      byId.delete(item.id);
    } else {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

export function prependOlderActivities(
  older: TaskActivityItem[],
  existing: TaskActivityItem[]
): TaskActivityItem[] {
  if (older.length === 0) return existing;
  const byId = new Map<number, TaskActivityItem>();
  for (const item of older) {
    if (!item.deleted) byId.set(item.id, item);
  }
  for (const item of existing) {
    if (!item.deleted) byId.set(item.id, item);
  }
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

export function formatActivityTimestamp(raw: string, lang: Language, now = new Date()): string {
  if (!raw) return "";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/);
  if (!match) return raw;
  const [, yyyy, mm, dd, hhmm] = match;
  const todayY = String(now.getFullYear());
  const todayM = String(now.getMonth() + 1).padStart(2, "0");
  const todayD = String(now.getDate()).padStart(2, "0");
  if (yyyy === todayY && mm === todayM && dd === todayD) {
    return hhmm;
  }
  if (lang === "hu") {
    return `${mm}.${dd}. ${hhmm}`;
  }
  return `${Number(dd)}. ${Number(mm)}. ${hhmm}`;
}

export interface FormattedStateChange {
  eventType: TaskActivityEventType;
  label: string;
  fromValue?: string;
  toValue?: string;
  fromRaw?: string;
  toRaw?: string;
  postponed?: boolean;
  addedUsers?: string[];
  removedUsers?: string[];
  singleText?: string;
}

export function formatStateChange(
  item: Pick<TaskActivityItem, "eventType" | "meta">,
  lang: Language,
  opts?: {
    translateStatus?: (status: string) => string;
    translatePriority?: (prio: "low" | "medium" | "high") => string;
  }
): FormattedStateChange {
  const t = (en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);
  const meta = (item.meta || {}) as Record<string, unknown>;
  const eventType = (item.eventType || "created") as TaskActivityEventType;

  if (eventType === "created") {
    return {
      eventType: "created",
      label: t("created this task", "vytvoril(a) túto úlohu", "létrehozta ezt a feladatot"),
    };
  }

  if (eventType === "status") {
    const fromRaw = String(meta.from ?? "");
    const toRaw = String(meta.to ?? "");
    const fmt = (v: string) => (opts?.translateStatus ? opts.translateStatus(v) : v);
    return {
      eventType: "status",
      label: t("changed status", "zmenil(a) stav", "módosította az állapotot"),
      fromRaw,
      toRaw,
      fromValue: fmt(fromRaw),
      toValue: fmt(toRaw),
    };
  }

  if (eventType === "priority") {
    const fromRaw = String(meta.from ?? "");
    const toRaw = String(meta.to ?? "");
    const fmt = (v: string) =>
      opts?.translatePriority && (v === "low" || v === "medium" || v === "high")
        ? opts.translatePriority(v)
        : v;
    return {
      eventType: "priority",
      label: t("changed priority", "zmenil(a) prioritu", "módosította a prioritást"),
      fromRaw,
      toRaw,
      fromValue: fmt(fromRaw),
      toValue: fmt(toRaw),
    };
  }

  if (eventType === "deadline") {
    const fromRaw = String(meta.from ?? "");
    const toRaw = String(meta.to ?? "");
    const postponed = Boolean(meta.postponed) || (fromRaw !== "" && toRaw !== "" && toRaw > fromRaw);
    const fmtDate = (iso: string) => {
      const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : iso;
    };
    return {
      eventType: "deadline",
      label: postponed
        ? t("postponed deadline", "posunul(a) termín", "elhalasztotta a határidőt")
        : t("changed deadline", "zmenil(a) termín", "módosította a határidőt"),
      fromRaw,
      toRaw,
      fromValue: fmtDate(fromRaw),
      toValue: fmtDate(toRaw),
      postponed,
    };
  }

  if (eventType === "assignees") {
    const addedUsers = Array.isArray(meta.added) ? meta.added.map(String).filter(Boolean) : [];
    const removedUsers = Array.isArray(meta.removed) ? meta.removed.map(String).filter(Boolean) : [];
    return {
      eventType: "assignees",
      label: t("updated assignees", "upravil(a) priradenie", "módosította a felelősöket"),
      addedUsers,
      removedUsers,
    };
  }

  if (eventType === "archived") {
    const arch = Boolean(meta.archived);
    return {
      eventType: "archived",
      label: arch
        ? t("archived this task", "archivoval(a) úlohu", "archiválta a feladatot")
        : t("unarchived this task", "zrušil(a) archiváciu", "visszaállította a feladatot"),
    };
  }

  if (eventType === "conclusion") {
    const text = String(meta.text ?? "").trim();
    return {
      eventType: "conclusion",
      label: t("updated conclusion", "aktualizoval(a) záver", "frissítette a záró összegzést"),
      singleText: text,
    };
  }

  return {
    eventType: "created",
    label: t("updated task", "upravil(a) úlohu", "módosította a feladatot"),
  };
}
