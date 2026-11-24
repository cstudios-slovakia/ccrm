import type { Note, NoteEntityType } from "../types";

/**
 * Notes live in their own table behind api/notes.php; they never ride on a lead or project save.
 * Every call throws an Error with the server's message when it fails.
 */
const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `Notes request failed (${response.status})`);
  return result as T;
};

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** The record's notes, newest first. */
export const listNotes = async (entityType: NoteEntityType, entityId: string): Promise<Note[]> =>
  (await request<{ notes: Note[] }>(`/api/notes.php?entity_type=${entityType}&entity_id=${encodeURIComponent(entityId)}`)).notes;

/** `at` is the browser's local wall-clock stamp, the clock timeline entries use. */
export const createNote = async (entityType: NoteEntityType, entityId: string, content: string, at: string): Promise<Note> =>
  (await request<{ note: Note }>("/api/notes.php", json({ entityType, entityId, content, at }))).note;

export const updateNote = async (id: string, content: string, at: string): Promise<Note> =>
  (await request<{ note: Note }>("/api/notes.php?action=update", json({ id, content, at }))).note;

export const deleteNote = async (id: string): Promise<void> => {
  await request<{ success: boolean }>(`/api/notes.php?id=${encodeURIComponent(id)}`, { method: "DELETE" });
};
