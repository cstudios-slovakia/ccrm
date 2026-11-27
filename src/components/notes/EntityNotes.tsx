import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Check, LayoutGrid, List, NotebookPen, Pencil, Plus, Trash2, X } from "lucide-react";
import { useUserPref } from "../../utils/userPrefs";
import type { Note, NoteEntityType } from "../../types";
import type { Language } from "../../utils/translations";
import { createNote, deleteNote, listNotes, updateNote } from "../../utils/notesApi";
import { buildNoteActivity, type NoteActivity, type NoteAction } from "../../utils/noteActivity";
import { formatTimestampLocalized, nowLocalDateTime } from "../../utils/localTime";
import { runUndoable } from "../../utils/undoable";
import { singleMessage, trimTitle, undoLabel } from "../../utils/undoMessages";
import { EmptyState } from "../layout";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";

const LABELS = {
  placeholder: { en: "Write a note...", sk: "Napíšte poznámku...", hu: "Írjon jegyzetet..." },
  add: { en: "Add note", sk: "Pridať poznámku", hu: "Jegyzet hozzáadása" },
  save: { en: "Save", sk: "Uložiť", hu: "Mentés" },
  cancel: { en: "Cancel", sk: "Zrušiť", hu: "Mégse" },
  edit: { en: "Edit note", sk: "Upraviť poznámku", hu: "Jegyzet szerkesztése" },
  empty: { en: "No notes yet", sk: "Zatiaľ žiadne poznámky", hu: "Még nincs jegyzet" },
  emptyBody: {
    en: "Notes are for the team: what was agreed, what to remember.",
    sk: "Poznámky sú pre tím: na čom ste sa dohodli, čo si zapamätať.",
    hu: "A jegyzetek a csapatnak szólnak: miben állapodtak meg, mire kell emlékezni.",
  },
  loadFailed: { en: "Notes could not be loaded.", sk: "Poznámky sa nepodarilo načítať.", hu: "A jegyzeteket nem sikerült betölteni." },
  retry: { en: "Try again", sk: "Skúsiť znova", hu: "Újra" },
  saveFailed: { en: "The note could not be saved.", sk: "Poznámku sa nepodarilo uložiť.", hu: "A jegyzetet nem sikerült menteni." },
  deleteFailed: { en: "The note could not be deleted.", sk: "Poznámku sa nepodarilo zmazať.", hu: "A jegyzetet nem sikerült törölni." },
  edited: { en: "edited", sk: "upravené", hu: "módosítva" },
  hint: { en: "Ctrl+Enter to add", sk: "Ctrl+Enter pridá", hu: "Ctrl+Enter a hozzáadáshoz" },
  grid: { en: "Grid", sk: "Mriežka", hu: "Rács" },
  list: { en: "List", sk: "Zoznam", hu: "Lista" },
  oldest: { en: "Oldest first", sk: "Od najstaršej", hu: "Legrégebbi elöl" },
  newest: { en: "Newest first", sk: "Od najnovšej", hu: "Legújabb elöl" },
} as const;

const pick = (key: keyof typeof LABELS, language: Language): string => LABELS[key][language] ?? LABELS[key].en;

const traceSuffix = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The notes of one record (a lead, a project, later orders ...) in their own Notes tab: a composer on top,
 * the notes below as yellow-tinted blocks, newest first. Notes are their own entity (api/notes.php), not
 * timeline events; every add, edit and delete is reported through `onActivity` so the host can leave a trace
 * on the record's timeline in the way that timeline is saved (see utils/noteActivity.ts).
 */
export const EntityNotes = ({
  entityType,
  entityId,
  language,
  author,
  canEdit,
  canDelete,
  onActivity,
  unavailable,
}: {
  entityType: NoteEntityType;
  entityId: string;
  language: Language;
  /** The signed-in user's name, put on the trace entry. */
  author?: string;
  canEdit: boolean;
  canDelete: boolean;
  /** Called with the trace entry of an add / edit / delete, once it has gone through on the server. */
  onActivity?: (trace: NoteActivity) => void;
  /** A reason the record cannot hold notes yet (a project that is not saved); shown instead of the tab. */
  unavailable?: string;
}) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [view, setView] = useUserPref("notesView");
  const [sort, setSort] = useUserPref("notesSort");
  const shown = useMemo(
    () => [...notes].sort((a, b) => (sort === "newest" ? -1 : 1) * a.createdAt.localeCompare(b.createdAt)),
    [notes, sort],
  );
  const current = useRef({ entityType, entityId });
  current.current = { entityType, entityId };

  const load = useCallback(() => {
    if (unavailable) return;
    setStatus("loading");
    listNotes(entityType, entityId)
      .then((rows) => {
        // The answer of a record the user has already left must not land on the next one.
        if (current.current.entityId !== entityId) return;
        setNotes(rows);
        setStatus("ready");
      })
      .catch(() => current.current.entityId === entityId && setStatus("failed"));
  }, [entityType, entityId, unavailable]);

  useEffect(() => {
    setNotes([]);
    setDraft("");
    setEditingId(null);
    load();
  }, [load]);

  const fail = (key: "saveFailed" | "deleteFailed", err: unknown) => {
    const reason = err instanceof Error && err.message ? ` ${err.message}` : "";
    window.showToast?.(`${pick(key, language)}${reason}`, "error");
  };

  const report = (action: NoteAction, text: string) =>
    onActivity?.(buildNoteActivity({ action, text, language, now: nowLocalDateTime(), suffix: traceSuffix(), author }));

  const add = async () => {
    const text = draft.trim();
    if (!text || busy || !canEdit) return;
    setBusy(true);
    try {
      const note = await createNote(entityType, entityId, text, nowLocalDateTime());
      setNotes((prev) => [note, ...prev]);
      setDraft("");
      report("added", note.content);
    } catch (err) {
      fail("saveFailed", err);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (note: Note) => {
    const text = editDraft.trim();
    if (!text || busy || !canEdit) return;
    if (text === note.content) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    try {
      const saved = await updateNote(note.id, text, nowLocalDateTime());
      setNotes((prev) => prev.map((n) => (n.id === saved.id ? saved : n)));
      setEditingId(null);
      report("edited", saved.content);
    } catch (err) {
      fail("saveFailed", err);
    } finally {
      setBusy(false);
    }
  };

  const remove = (note: Note) => {
    if (!canDelete) return;
    const index = notes.findIndex((n) => n.id === note.id);
    runUndoable({
      message: singleMessage(language, "note", "delete", trimTitle(note.content)),
      undoLabel: undoLabel(language),
      apply: () => setNotes((prev) => prev.filter((n) => n.id !== note.id)),
      revert: () =>
        setNotes((prev) => {
          if (prev.some((n) => n.id === note.id)) return prev;
          const next = [...prev];
          next.splice(Math.min(Math.max(index, 0), next.length), 0, note);
          return next;
        }),
      // The server delete runs only when the undo window closes; a failure puts the note back.
      onCommit: async () => {
        await deleteNote(note.id);
        report("deleted", note.content);
      },
      failureMessage: pick("deleteFailed", language),
    });
  };

  if (unavailable) {
    return <p className="type-meta text-gray-500">{unavailable}</p>;
  }

  const submitOnCtrlEnter = (action: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="flex flex-col gap-4 text-left">
      {canEdit && (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            rows={3}
            maxLength={20000}
            disabled={busy}
            placeholder={pick("placeholder", language)}
            aria-label={pick("placeholder", language)}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={submitOnCtrlEnter(add)}
            className="w-full resize-y rounded-lg border border-yellow-200 bg-yellow-50/60 px-3 py-2 text-ui font-medium text-gray-800 placeholder:text-yellow-700/50 focus:border-yellow-400 focus:bg-yellow-50 focus:outline-none"
          />
          <div className="flex items-center justify-end gap-3">
            <span className="type-meta text-gray-400">{pick("hint", language)}</span>
            <button
              type="button"
              disabled={busy || !draft.trim()}
              onClick={add}
              className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-entity-solid px-4 text-ui font-semibold text-white shadow-xs hover:bg-entity-solid-hover disabled:cursor-default disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {pick("add", language)}
            </button>
          </div>
        </div>
      )}

      {status === "failed" && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-ui font-semibold text-rose-700">
          <span>{pick("loadFailed", language)}</span>
          <button type="button" onClick={load} className="cursor-pointer rounded-md px-2 py-1 hover:bg-rose-100">
            {pick("retry", language)}
          </button>
        </div>
      )}

      {status === "ready" && notes.length === 0 && (
        <EmptyState icon={<NotebookPen />} title={pick("empty", language)} body={pick("emptyBody", language)} />
      )}

      {notes.length > 0 && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setSort(sort === "newest" ? "oldest" : "newest")}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-caption font-semibold text-gray-600 hover:bg-gray-50"
          >
            <ArrowDownUp className="h-3.5 w-3.5" />
            {pick(sort === "newest" ? "newest" : "oldest", language)}
          </button>
          <div className="flex rounded-md border border-gray-200 bg-white p-0.5" role="group">
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                title={pick(v, language)}
                aria-label={pick(v, language)}
                onClick={() => setView(v)}
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded ${view === v ? "bg-yellow-100 text-yellow-900" : "text-gray-400 hover:text-gray-700"}`}
              >
                {v === "grid" ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </div>
      )}

      <ul className={view === "list" ? "flex flex-col gap-3" : "grid grid-cols-1 items-start gap-3 ws-md:grid-cols-2 ws-xl:grid-cols-3"}>
        {shown.map((note) => {
          const editing = editingId === note.id;
          const wasEdited = note.updatedAt !== note.createdAt;
          return (
            <li key={note.id} className="group relative rounded-lg border border-yellow-200 bg-yellow-50 p-3.5 shadow-2xs">
              {editing ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    autoFocus
                    value={editDraft}
                    rows={4}
                    maxLength={20000}
                    disabled={busy}
                    aria-label={pick("edit", language)}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingId(null);
                      submitOnCtrlEnter(() => saveEdit(note))(e);
                    }}
                    className="w-full resize-y rounded-md border border-yellow-300 bg-white px-3 py-2 text-ui font-medium text-gray-800 focus:border-yellow-400 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="flex h-8 cursor-pointer items-center gap-1 rounded-md px-3 text-ui font-semibold text-gray-600 hover:bg-yellow-100"
                    >
                      <X className="h-3.5 w-3.5" />
                      {pick("cancel", language)}
                    </button>
                    <button
                      type="button"
                      disabled={busy || !editDraft.trim()}
                      onClick={() => saveEdit(note)}
                      className="flex h-8 cursor-pointer items-center gap-1 rounded-md bg-entity-solid px-3 text-ui font-semibold text-white hover:bg-entity-solid-hover disabled:cursor-default disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {pick("save", language)}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {note.audioFile && <audio src={note.audioFile} controls className="mb-2 h-8 max-w-full" />}
                  <p className="whitespace-pre-wrap break-words text-ui font-medium leading-relaxed text-gray-800 select-text">{note.content}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 text-micro font-medium text-yellow-800/70">
                    {note.author && <span className="font-semibold">{note.author}</span>}
                    <span>{formatTimestampLocalized(note.createdAt.slice(0, 16), language)}</span>
                    {wasEdited && <span>· {pick("edited", language)}</span>}
                  </div>
                  {(canEdit || canDelete) && (
                    <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      {canEdit && (
                        <button
                          type="button"
                          aria-label={pick("edit", language)}
                          title={pick("edit", language)}
                          onClick={() => {
                            setEditingId(note.id);
                            setEditDraft(note.content);
                          }}
                          className="cursor-pointer rounded-md p-1.5 text-yellow-800/70 hover:bg-yellow-100 hover:text-yellow-900"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && (
                        <HoldToConfirmButton
                          tone="danger"
                          lang={language}
                          what={trimTitle(note.content)}
                          onConfirm={() => remove(note)}
                          className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </HoldToConfirmButton>
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
