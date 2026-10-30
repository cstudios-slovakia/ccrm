/**
 * The Digest's time windows and meeting dates, as WAAI's own Digest page works them out
 * (apps/web/src/app/(app)/digest/digest-view.tsx): only windows that hold activity are offered, the page opens on
 * the narrowest of them, and a meeting's relative day-word is pinned to the day the message was sent.
 */

import type { DigestWindow } from "../api/contract.ts";

/** Start of the current UTC day, matching the server-side window bounds. */
function utcStartOfDay(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function utcDaysAgo(days: number, now: Date): Date {
  const d = utcStartOfDay(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

/**
 * Every window that still contains the newest message across the user's chats, narrowest first. Nothing within
 * the last 30 days leaves the widest window alone, so the empty state still has a home.
 */
export function digestWindowsWithActivity(lastMessageAt: string | null, now = new Date()): DigestWindow[] {
  const last = lastMessageAt ? new Date(lastMessageAt) : null;
  const within = (from: Date) => !!last && !Number.isNaN(last.getTime()) && last >= from;
  const windows: DigestWindow[] = [];
  if (within(utcStartOfDay(now))) windows.push("today");
  if (within(utcDaysAgo(2, now))) windows.push("d3");
  if (within(utcDaysAgo(6, now))) windows.push("d7");
  if (within(utcDaysAgo(29, now))) windows.push("d30");
  return windows.length > 0 ? windows : ["d30"];
}

/** The window the Digest opens on: the narrowest one with activity. */
export function defaultDigestWindow(lastMessageAt: string | null, now = new Date()): DigestWindow {
  return digestWindowsWithActivity(lastMessageAt, now)[0]!;
}

const DATE_LOCALE: Record<string, string> = { en: "en-GB", sk: "sk-SK", hu: "hu-HU" };

/**
 * Relative day-words -> day offset from the day the message was sent, per language. The digest is written in the
 * module's language, so the set is keyed by it to avoid collisions between languages (Slovak "má" is not Hungarian
 * "ma"). Keys are ASCII-folded so text typed without diacritics matches too ("vcera" -> "včera").
 */
const EN_DAY_OFFSETS: Record<string, number> = { today: 0, tomorrow: 1, yesterday: -1 };
const RELATIVE_DAY_OFFSETS: Record<string, Record<string, number>> = {
  en: EN_DAY_OFFSETS,
  sk: { dnes: 0, zajtra: 1, pozajtra: 2, vcera: -1 },
  hu: { ma: 0, holnap: 1, holnaputan: 2, tegnap: -1 },
};

function foldAscii(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** "Weekday, D month" in the module's language - no year, no time. */
function formatConcreteDate(date: Date, locale: string): string {
  const tag = DATE_LOCALE[locale] ?? locale;
  const weekday = new Intl.DateTimeFormat(tag, { weekday: "long" }).format(date);
  const dayMonth = new Intl.DateTimeFormat(tag, { day: "numeric", month: "long" }).format(date);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${dayMonth}`;
}

/** Replaces the first relative day-word in `when` with the date it resolves to; the rest of the text stays verbatim. */
function anchorRelativeWhen(when: string, locale: string, sourceDate: string): string | null {
  const dm = sourceDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dm) return null;
  const offsets = RELATIVE_DAY_OFFSETS[locale] ?? EN_DAY_OFFSETS;
  for (const m of when.matchAll(/\p{L}+/gu)) {
    const offset = offsets[foldAscii(m[0].toLowerCase())];
    if (offset === undefined) continue;
    const date = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]) + offset);
    if (Number.isNaN(date.getTime())) return null;
    const at = m.index;
    return (when.slice(0, at) + formatConcreteDate(date, locale) + when.slice(at + m[0].length)).trim();
  }
  return null;
}

/**
 * A meeting's `when`, ready to show. A leading ISO date (the model echoing the message's send time) becomes a plain
 * date; a relative day-word is pinned to the day the source message was sent; anything else is shown as written.
 */
export function formatMeetingWhen(when: string, locale: string, sourceDate: string | null): string {
  const raw = when.trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(date.getTime())) return formatConcreteDate(date, locale);
  }
  if (sourceDate) {
    const anchored = anchorRelativeWhen(raw, locale, sourceDate);
    if (anchored) return anchored;
  }
  return raw;
}

/** The newest message across a chat list, or null for none. */
export function newestMessageAt(chats: { last_message_at: string | null }[]): string | null {
  let newest: string | null = null;
  for (const chat of chats) {
    if (chat.last_message_at && (!newest || chat.last_message_at > newest)) newest = chat.last_message_at;
  }
  return newest;
}

/** A chat's AI view offers the same windows plus "older" for a quiet chat, and "custom" always. */
export type ChatSummaryWindow = DigestWindow | "recent" | "custom";

export function chatSummaryWindows(lastMessageAt: string | null | undefined, now = new Date()): ChatSummaryWindow[] {
  const last = lastMessageAt ? new Date(lastMessageAt) : null;
  const within = (from: Date) => !!last && !Number.isNaN(last.getTime()) && last >= from;
  const windows: ChatSummaryWindow[] = [];
  if (within(utcStartOfDay(now))) windows.push("today");
  if (within(utcDaysAgo(2, now))) windows.push("d3");
  if (within(utcDaysAgo(6, now))) windows.push("d7");
  if (within(utcDaysAgo(29, now))) windows.push("d30");
  if (windows.length === 0) windows.push("recent");
  windows.push("custom");
  return windows;
}

/** The window a chat's AI view opens on: the narrowest that still holds its latest message. */
export function defaultChatSummaryWindow(lastMessageAt: string | null | undefined, now = new Date()): ChatSummaryWindow {
  return chatSummaryWindows(lastMessageAt, now)[0]!;
}
