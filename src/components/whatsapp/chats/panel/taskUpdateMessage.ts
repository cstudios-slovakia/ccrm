import type { SummaryLanguage } from "../../api/contract.ts";

export type TaskUpdateLanguage = SummaryLanguage;

export const MAX_UPDATE_FILES = 10;
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_NOTE_CHARS = 1000;

export interface TaskUpdateTextItem {
  title: string;
  notes?: string | null;
  attachmentNumbers?: number[];
}

export interface TaskUpdateTextArgs {
  language: TaskUpdateLanguage;
  senderName: string;
  items: TaskUpdateTextItem[];
  attachmentCount?: number;
}

interface Strings {
  singleHeader: string;
  batchHeader: (n: number) => string;
  single: (title: string, sender: string) => string;
  batchIntro: (sender: string) => string;
  notes: string;
  attachments: (n: number) => string;
  footer: string;
}

const STRINGS: Record<TaskUpdateLanguage, Strings> = {
  en: {
    singleHeader: "✅ *Task done*",
    batchHeader: (n) => `✅ *${n} tasks done*`,
    single: (t, s) => `"${t}" was marked as done by ${s}.`,
    batchIntro: (s) => `These tasks were marked as done by ${s}:`,
    notes: "Notes",
    attachments: (n) => `📎 ${n} attachment${n === 1 ? "" : "s"} below`,
    footer: "_Automatic update · CCRM_",
  },
  sk: {
    singleHeader: "✅ *Úloha hotová*",
    batchHeader: (n) => `✅ *Hotové úlohy: ${n}*`,
    single: (t, s) => `Úloha „${t}“ je hotová · ${s}`,
    batchIntro: (s) => `Tieto úlohy sú hotové · ${s}:`,
    notes: "Poznámka",
    attachments: (n) => `📎 Prílohy nižšie: ${n}`,
    footer: "_Automatická aktualizácia · CCRM_",
  },
  hu: {
    singleHeader: "✅ *Feladat kész*",
    batchHeader: (n) => `✅ *Kész feladatok: ${n}*`,
    single: (t, s) => `„${t}” feladat kész · ${s}`,
    batchIntro: (s) => `Ezek a feladatok készek · ${s}:`,
    notes: "Megjegyzés",
    attachments: (n) => `📎 Mellékletek lent: ${n}`,
    footer: "_Automatikus frissítés · CCRM_",
  },
};

function cleanTitle(title: string): string {
  return title.replace(/\*/g, "").replace(/\s+/g, " ").trim();
}

function noteBlock(label: string, notes: string, refs: number[]): string {
  const lines = notes.trim().split(/\r?\n/);
  const refText = refs.length > 0 ? ` (📎 ${refs.join(", ")})` : "";
  lines[lines.length - 1] += refText;
  return lines.map((l, i) => `> ${i === 0 ? `${label}: ` : ""}${l}`.trimEnd()).join("\n");
}

export function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildTaskUpdateText({
  language,
  senderName,
  items,
  attachmentCount = 0,
}: TaskUpdateTextArgs): string {
  const t = STRINGS[language] ?? STRINGS.en;
  const parts: string[] = [];

  if (items.length === 1) {
    const item = items[0]!;
    parts.push(t.singleHeader, t.single(cleanTitle(item.title), senderName));
    if (item.notes && item.notes.trim()) {
      parts.push(noteBlock(t.notes, item.notes, item.attachmentNumbers ?? []));
    }
  } else if (items.length > 1) {
    parts.push(t.batchHeader(items.length), t.batchIntro(senderName));
    for (const item of items) {
      parts.push(`• *${cleanTitle(item.title)}*`);
      if (item.notes && item.notes.trim()) {
        parts.push(noteBlock(t.notes, item.notes, item.attachmentNumbers ?? []));
      }
    }
  }

  if (attachmentCount > 0) {
    parts.push(t.attachments(attachmentCount));
  }

  parts.push(t.footer);
  return parts.join("\n\n");
}
