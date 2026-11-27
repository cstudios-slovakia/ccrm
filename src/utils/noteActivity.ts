import type { Language } from "./translations";

/** What happened to a note. Each one leaves a trace entry on the timeline of the record the note belongs to. */
export type NoteAction = "added" | "edited" | "deleted";

/** A trace entry: a read-only line on a lead's or project's timeline. Fits both TimelineEvent and ProjectTimelineEvent. */
export interface NoteActivity {
  id: string;
  type: "note_activity";
  /** Local wall-clock "YYYY-MM-DD HH:MM". */
  timestamp: string;
  /** "Note added", in the language of the person who did it. */
  title: string;
  /** A one-line snippet of the note, so the timeline says which note it was. */
  content: string;
  /** Lead timelines carry the actor; the project timeline table has no column for it. */
  author?: string;
}

export const NOTE_ACTIVITY_TYPE = "note_activity";

/** True for the trace entry a note leaves; the timeline shows it as a compact row and never edits it. */
export const isNoteActivity = (event: { type: string }): boolean => event.type === NOTE_ACTIVITY_TYPE;

const TITLES: Record<NoteAction, Record<Language, string>> = {
  added: { en: "Note added", sk: "Poznámka pridaná", hu: "Jegyzet hozzáadva" },
  edited: { en: "Note edited", sk: "Poznámka upravená", hu: "Jegyzet módosítva" },
  deleted: { en: "Note deleted", sk: "Poznámka zmazaná", hu: "Jegyzet törölve" },
};

export const noteActivityTitle = (action: NoteAction, language: Language): string => TITLES[action][language] ?? TITLES[action].en;

/** One line of at most `max` characters (the migration on the server keeps the same rule). */
export const noteSnippet = (text: string, max = 80): string => {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1).trimEnd()}…`;
};

/**
 * The trace entry for one note action. `now` is the local stamp and `suffix` makes the id unique;
 * both are parameters so the result is deterministic under test.
 */
export const buildNoteActivity = (input: {
  action: NoteAction;
  text: string;
  language: Language;
  now: string;
  suffix: string;
  author?: string;
}): NoteActivity => ({
  id: `na-${input.suffix}`,
  type: NOTE_ACTIVITY_TYPE,
  timestamp: input.now.slice(0, 16),
  title: noteActivityTitle(input.action, input.language),
  content: noteSnippet(input.text),
  ...(input.author ? { author: input.author } : {}),
});
