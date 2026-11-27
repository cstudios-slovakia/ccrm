import { memo, useEffect, useState } from "react";
import { Clock, ExternalLink, FileText } from "lucide-react";
import type { DeleteMessageScope, LinkPreviewResponse, MessageDto, QuotedMessage, ReactionResponse } from "../api/contract.ts";
import type { WaaiClient } from "../api/waaiClient.ts";
import { messageTime } from "../lib/messageDays.ts";
import { bubbleSegments, firstUrl } from "../lib/messageText.ts";
import { Avatar } from "./Avatar";
import type { ChatsMessages } from "./chatsI18n.ts";
import { MessageActions } from "./composer/MessageActions";
import { nextReaction, ownReaction } from "./composer/optimistic.ts";

// A preview is fetched once per address for the whole session; "error" is remembered too, so a dead link
// is not retried on every poll.
const previews = new Map<string, LinkPreviewResponse | "error">();

const LinkPreviewCard = ({ client, url, out }: { client: WaaiClient; url: string; out: boolean }) => {
  const [state, setState] = useState<LinkPreviewResponse | "error" | null>(() => previews.get(url) ?? null);
  useEffect(() => {
    if (previews.has(url)) return;
    const abort = new AbortController();
    client
      .get<LinkPreviewResponse>("/og-preview", { query: { url }, signal: abort.signal })
      .then((p) => {
        previews.set(url, p);
        setState(p);
      })
      .catch(() => {
        if (abort.signal.aborted) return;
        previews.set(url, "error");
        setState("error");
      });
    return () => abort.abort();
  }, [client, url]);

  if (!state || state === "error" || (!state.title && !state.description)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-2 block overflow-hidden rounded-xl border transition-colors hover:bg-black/5 ${out ? "border-green-200" : "border-slate-200"}`}
    >
      {state.image && (
        <img src={state.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="max-h-40 w-full object-cover" />
      )}
      <span className="block px-3 py-2">
        {state.site_name && <span className="type-overline block text-slate-400">{state.site_name}</span>}
        {state.title && <span className="type-label line-clamp-2 block text-slate-800">{state.title}</span>}
        {state.description && <span className="type-meta line-clamp-2 block text-slate-500">{state.description}</span>}
      </span>
    </a>
  );
};

const Media = ({ client, m, t }: { client: WaaiClient; m: MessageDto; t: ChatsMessages }) => {
  const [failed, setFailed] = useState(false);
  if (!m.media) return null;
  const src = client.mediaUrl(m.media.url);
  if (failed) return <p className="type-meta italic text-slate-500">{t.unavailable}</p>;

  switch (m.kind) {
    case "image":
      return (
        <a href={src} target="_blank" rel="noopener noreferrer" className="block">
          <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="max-h-80 w-full rounded-xl bg-slate-100 object-cover" />
        </a>
      );
    case "sticker":
      return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="size-32 object-contain" />;
    case "video":
      return <video src={src} controls preload="metadata" onError={() => setFailed(true)} className="max-h-80 w-full rounded-xl bg-black" />;
    case "audio":
      return <audio src={src} controls preload="none" onError={() => setFailed(true)} className="w-full min-w-56" />;
    default:
      return (
        <a
          href={src}
          download={m.media.file_name ?? undefined}
          className="type-label flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2 text-slate-700 transition-colors hover:bg-black/10"
        >
          <FileText className="size-5 shrink-0 text-slate-500" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{m.media.file_name ?? m.body ?? t.document}</span>
          <span className="type-meta shrink-0 text-slate-400">{t.download}</span>
        </a>
      );
  }
}

/** The text of a message as text; an http(s) address becomes a link, nothing else does. */
const Text = ({ text }: { text: string }) => (
  <p className="type-body whitespace-pre-wrap break-words text-slate-800">
    {bubbleSegments(text).map((s, i) =>
      s.type === "url" ? (
        <a key={i} href={s.value} target="_blank" rel="noopener noreferrer" className="inline-flex items-baseline gap-1 break-all text-green-700 underline underline-offset-2 hover:text-green-800">
          {s.value}
          <ExternalLink className="size-3 shrink-0 self-center" aria-hidden />
        </a>
      ) : (
        <span key={i}>{s.value}</span>
      ),
    )}
  </p>
);

interface Props {
  client: WaaiClient;
  t: ChatsMessages;
  locale: string;
  message: MessageDto;
  /** Show the sender's name and picture (incoming messages in a group). */
  showSender: boolean;
  highlighted: boolean;
  onJumpTo: (id: string) => void;
  onReply?: (quoted: QuotedMessage) => void;
  onEdit?: (message: MessageDto) => void;
  onDelete?: (messageId: string, scope: DeleteMessageScope) => void;
  onReactionChange?: (messageId: string, emoji: string | null) => void;
  currentWaAccountId?: string;
  quickReactions?: string[];
}

const Bubble = ({
  client,
  t,
  locale,
  message: m,
  showSender,
  highlighted,
  onJumpTo,
  onReply,
  onEdit,
  onDelete,
  onReactionChange,
  currentWaAccountId,
  quickReactions,
}: Props) => {
  const out = m.direction === "out";
  const isLocal = m.id.startsWith("local-");
  const url = m.kind === "text" && m.body ? firstUrl(m.body) : null;
  const transcript = m.kind === "audio" && m.transcription ? m.transcription : null;

  const toggleReaction = async (emoji: string) => {
    if (isLocal) return;
    const prev = ownReaction(m.reactions);
    const next = nextReaction(m.reactions, emoji);
    onReactionChange?.(m.id, next);
    try {
      await client.post<ReactionResponse>(`/messages/${encodeURIComponent(m.id)}/reaction`, { emoji: next });
    } catch {
      onReactionChange?.(m.id, prev);
    }
  };

  const actions = !isLocal && (
    <div className="mb-1 opacity-0 transition-opacity group-hover:opacity-100">
      <MessageActions
        client={client}
        message={m}
        locale={locale}
        quickReactions={quickReactions}
        currentWaAccountId={currentWaAccountId}
        onReply={onReply}
        onEdit={onEdit}
        onDelete={onDelete}
        onReactionChange={onReactionChange}
      />
    </div>
  );

  return (
    <div
      id={`wa-msg-${m.id}`}
      data-testid="wa-message"
      className={`group flex items-end gap-1.5 ${out ? "justify-end" : "justify-start"}`}
    >
      {!out && showSender && <Avatar client={client} src={m.sender_avatar_url} name={m.sender ?? "?"} size="sm" />}
      {out && actions}
      <div className="flex max-w-5/6 flex-col ws-lg:max-w-2/3">
        <div
          className={`rounded-2xl px-3 py-2 shadow-sm transition-shadow duration-300 ${
            out ? "rounded-br-md bg-green-100" : "rounded-bl-md border border-slate-200 bg-white"
          } ${highlighted ? "ring-2 ring-green-500" : ""}`}
        >
          {!out && showSender && m.sender && <p className="type-label mb-0.5 text-green-700">{m.sender}</p>}
          {m.quoted && (
            <button
              type="button"
              onClick={() => onJumpTo(m.quoted!.id)}
              className="mb-1 block w-full rounded-lg border-l-4 border-green-600 bg-black/5 px-2 py-1 text-left transition-colors hover:bg-black/10"
            >
              <span className="type-label block text-green-700">{m.quoted.direction === "out" ? t.you : (m.quoted.sender ?? "")}</span>
              <span className="type-meta line-clamp-2 block text-slate-600">{m.quoted.body ?? m.quoted.transcription ?? ""}</span>
            </button>
          )}
          <Media client={client} m={m} t={t} />
          {m.body && m.kind !== "document" && <Text text={m.body} />}
          {m.kind === "document" && m.body && m.body !== m.media?.file_name && <Text text={m.body} />}
          {transcript && (
            <p className="type-meta mt-1 italic text-slate-500">
              {t.transcript}: {transcript}
            </p>
          )}
          {m.translation_note && <p className="type-meta mt-1 text-slate-500">{m.translation_note}</p>}
          {url && <LinkPreviewCard client={client} url={url} out={out} />}
          <p className="type-meta mt-1 flex items-center justify-end gap-1 text-slate-400">
            {m.edited_at && <span className="mr-1">{t.edited}</span>}
            {messageTime(m.sent_at, locale)}
            {isLocal && <Clock className="size-3 animate-spin text-slate-400" />}
          </p>
        </div>
        {m.reactions.length > 0 && (
          <div className={`-mt-1 flex flex-wrap gap-1 ${out ? "justify-end" : "justify-start"}`}>
            {m.reactions.map((g) => (
              <button
                key={g.emoji}
                type="button"
                onClick={() => void toggleReaction(g.emoji)}
                title={g.reactors.map((r) => (r.mine ? t.you : (r.name ?? ""))).filter(Boolean).join(", ")}
                className={`type-meta inline-flex cursor-pointer items-center gap-1 rounded-full border bg-white px-1.5 shadow-sm transition-colors hover:bg-slate-50 ${g.mine ? "border-green-400" : "border-slate-200"}`}
              >
                <span>{g.emoji}</span>
                {g.count > 1 && <span className="text-slate-500">{g.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {!out && actions}
    </div>
  );
};

export const MessageBubble = memo(Bubble);
