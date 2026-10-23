import React, { useState } from "react";
import { Inbox, Paperclip } from "lucide-react";
import type { TimelineEvent } from "../types";
import type { Language } from "../utils/translations";
import { fetchFiledMail, type FiledMailBody as FiledMailBodyData } from "../utils/filedMail";

/*
  Mail that the background job filed onto a timeline (api/mail_filing.php) comes from a
  mailbox the viewer may not have: a company mailbox, or a colleague's. So each such
  entry says which mailbox it came from, and its stored body is read on demand — the
  sync carries only the header lines, because the whole timeline table is read on every load.
*/

const tr = (lang: Language, en: string, sk: string, hu: string) => (lang === "sk" ? sk : lang === "hu" ? hu : en);

/** The small "from this mailbox" label on a mail entry; nothing for an entry with no recorded mailbox. */
export const MailAccountBadge: React.FC<{ event: TimelineEvent; language: Language }> = ({ event, language }) => {
  if (event.type !== "email" || !event.mailAccount) return null;
  return (
    <span
      data-testid="mail-account-badge"
      title={tr(language, "Mailbox this message was read from", "Schránka, z ktorej bola správa načítaná", "A postafiók, amelyből az üzenetet beolvastuk")}
      className="inline-flex items-center gap-1 type-overline px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600"
    >
      <Inbox className="h-3 w-3" />
      <span className="truncate max-w-40">{event.mailAccount}</span>
    </span>
  );
};

/** "Show message" under a mail entry that has a stored body; the body is fetched when it is first opened. */
export const FiledMailBody: React.FC<{ event: TimelineEvent; language: Language }> = ({ event, language }) => {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ loading: boolean; body: FiledMailBodyData | null; error: string | null }>({
    loading: false,
    body: null,
    error: null,
  });
  if (event.type !== "email" || !event.hasStoredBody) return null;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !state.body && !state.loading) {
      setState({ loading: true, body: null, error: null });
      try {
        setState({ loading: false, body: await fetchFiledMail(event.id), error: null });
      } catch (e) {
        setState({ loading: false, body: null, error: e instanceof Error ? e.message : String(e) });
      }
    }
  };

  return (
    <div className="mt-2" data-testid="filed-mail-body">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void toggle();
        }}
        aria-expanded={open}
        className="text-caption font-bold text-indigo-600 hover:text-indigo-700 underline underline-offset-2 cursor-pointer"
      >
        {open ? tr(language, "Hide message", "Skryť správu", "Üzenet elrejtése") : tr(language, "Show message", "Zobraziť správu", "Üzenet megjelenítése")}
      </button>
      {open && (
        <div
          className="mt-2 p-3 rounded-xl bg-white border border-slate-200 text-caption text-slate-700 whitespace-pre-wrap break-words max-h-96 overflow-y-auto select-text"
          onClick={(e) => e.stopPropagation()}
        >
          {state.loading && tr(language, "Loading…", "Načítava sa…", "Betöltés…")}
          {state.error && <span className="text-rose-600">{state.error}</span>}
          {state.body && (
            <>
              {state.body.text || tr(language, "No message content.", "Správa nemá obsah.", "Az üzenetnek nincs tartalma.")}
              {state.body.attachments.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5 text-slate-500" data-testid="filed-mail-attachments">
                  {state.body.attachments.map((a, i) => (
                    <div key={`${a.name}-${i}`} className="flex items-center gap-1.5">
                      <Paperclip className="h-3 w-3 shrink-0" />
                      <span className="truncate">{a.name}</span>
                      {a.size > 0 && <span className="text-slate-400 shrink-0">({Math.max(1, Math.round(a.size / 1024))} kB)</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
