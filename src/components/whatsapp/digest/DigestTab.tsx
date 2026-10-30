import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Surface } from "../../layout";
import type { WaaiClient } from "../api/waaiClient.ts";
import { WaaiApiError } from "../api/waaiClient.ts";
import { primaryButton, secondaryButton } from "../StateCard";
import { AiMarkdown } from "../home/AiMarkdown";
import { homeCopy } from "../home/copy";
import type { DigestResponse, DigestWindow } from "../home/types";

const WINDOWS: DigestWindow[] = ["today", "d3", "d7", "d30"];

export const DigestTab = ({ client, language, admin }: { client: WaaiClient; language: string; admin: boolean }) => {
  const t = homeCopy(language);
  const [window, setWindow] = useState<DigestWindow>("today");
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (regenerate: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const next = regenerate
          ? await client.post<DigestResponse>("/digest", { window, regenerate: true, lang: language })
          : await client.get<DigestResponse>("/digest", { query: { window, lang: language } });
        setDigest(next);
      } catch (err) {
        setError(err instanceof WaaiApiError ? err.message : t.failed);
      } finally {
        setBusy(false);
      }
    },
    [client, language, t.failed, window],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const listen = async () => {
    setBusy(true);
    try {
      const ready = digest?.audio_url
        ? digest
        : await client.get<{ audio_url: string }>("/digest/audio", { query: { window } }).then((r) => ({ ...digest!, audio_url: r.audio_url, has_audio: true }));
      const audio = new Audio(`${client.base}${ready.audio_url}`);
      await audio.play();
    } catch (err) {
      setError(err instanceof WaaiApiError ? err.message : t.failed);
    } finally {
      setBusy(false);
    }
  };

  const setAuto = async (enabled: boolean) => {
    await client.put("/admin/ai/digest-audio", { enabled });
    setDigest((d) => (d ? { ...d, auto_audio: enabled } : d));
  };

  return (
    <Surface className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map((key) => (
          <button key={key} type="button" className={key === window ? primaryButton : secondaryButton} onClick={() => setWindow(key)}>
            {t.digest.windows[key]}
          </button>
        ))}
      </div>
      {busy && !digest ? (
        <p className="type-body flex items-center gap-2 text-slate-500"><Loader2 className="size-4 animate-spin" />{t.loading}</p>
      ) : null}
      {error ? <p className="type-body text-rose-600">{error}</p> : null}
      {digest && !digest.narrative ? <p className="type-body text-slate-500">{t.digest.noNarrative}</p> : null}
      {digest?.narrative ? <AiMarkdown text={digest.narrative} /> : null}
      {digest && digest.meetings.length > 0 ? (
        <div>
          <h3 className="type-label text-slate-500">{t.digest.meetings}</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {digest.meetings.map((m) => (
              <li key={`${m.title}-${m.when}`}>
                {m.conversation_id ? (
                  <a className="type-body font-semibold text-green-700" href={`#whatsapp/c/${m.conversation_id}${m.message_id ? `?m=${m.message_id}` : ""}`}>{m.title}</a>
                ) : (
                  <span className="type-body font-semibold text-slate-800">{m.title}</span>
                )}
                <p className="type-meta text-slate-500">{m.when} · {m.chat}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryButton} disabled={busy} onClick={() => void load(!digest?.narrative)}>
          <RefreshCw className="size-4" />
          {digest?.narrative ? t.digest.rewrite : t.digest.generate}
        </button>
        <button type="button" className={secondaryButton} disabled={busy || !digest?.narrative} onClick={() => void listen()}>{t.digest.listen}</button>
      </div>
      {admin ? (
        <label className="type-body flex items-center gap-2 text-slate-700">
          <input type="checkbox" checked={!!digest?.auto_audio} onChange={(e) => void setAuto(e.target.checked)} />
          {t.digest.auto}
        </label>
      ) : null}
    </Surface>
  );
};
