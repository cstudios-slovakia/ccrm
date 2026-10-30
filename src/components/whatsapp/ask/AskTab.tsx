import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Surface } from "../../layout";
import type { WaaiClient } from "../api/waaiClient.ts";
import { WaaiApiError } from "../api/waaiClient.ts";
import { primaryButton } from "../StateCard";
import { AiMarkdown } from "../home/AiMarkdown";
import { homeCopy } from "../home/copy";
import type { AskResponse } from "../home/types";

export const AskTab = ({ client, language }: { client: WaaiClient; language: string }) => {
  const t = homeCopy(language);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    const text = q.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      setAnswer(await client.post<AskResponse>("/search", { q: text, lang: language }));
    } catch (err) {
      setError(err instanceof WaaiApiError ? err.message : t.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Surface className="flex flex-col gap-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <input
          className="type-body min-h-11 min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 text-slate-800"
          value={q}
          placeholder={t.ask.placeholder}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className={primaryButton} disabled={busy || !q.trim()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {t.ask.send}
        </button>
      </form>
      {error ? <p className="type-body text-rose-600">{error}</p> : null}
      {answer ? <AiMarkdown text={answer.answer} /> : null}
      {answer && answer.sources.length > 0 ? (
        <div>
          <h3 className="type-label text-slate-500">{t.ask.sources}</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {answer.sources.map((source) => (
              <li key={source.message_id}>
                <a className="type-body font-semibold text-green-700" href={`#whatsapp/c/${source.conversation_id}?m=${source.message_id}`}>
                  {source.conversation_title || source.conversation_id}
                </a>
                <p className="type-meta text-slate-500">{source.snippet}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Surface>
  );
};
