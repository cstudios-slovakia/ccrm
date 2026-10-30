import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, SearchX } from "lucide-react";
import { EmptyState } from "../../layout";
import type {
  ChatListItem,
  ChatSummaryPreview,
  ConversationsResponse,
  MessageSearchHitDto,
  MessageSearchResponse,
} from "../api/contract.ts";
import type { WaaiClient } from "../api/waaiClient.ts";
import { rowStamp } from "../lib/messageDays.ts";
import { Avatar } from "./Avatar";
import { filterChats, previewLine } from "./chatState.ts";
import type { ChatsMessages } from "./chatsI18n.ts";

interface Props {
  client: WaaiClient;
  t: ChatsMessages;
  locale: string;
  data: ConversationsResponse;
  userId?: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSelectMessage?: (conversationId: string, messageId: string) => void;
  syncing: boolean;
  syncFailed: boolean;
  onSync: () => void;
}

/** The first narrative bullet of a chat's cached summary, unless its task is already done. */
function summaryLine(s: ChatSummaryPreview | undefined, done: Set<string>): string | null {
  const open = s?.action_items.find((a) => !a.task_id || !done.has(a.task_id));
  return open?.text ?? null;
}

const Row = ({
  client,
  t,
  locale,
  chat,
  summary,
  selected,
  onSelect,
}: {
  client: WaaiClient;
  t: ChatsMessages;
  locale: string;
  chat: ChatListItem;
  summary: string | null;
  selected: boolean;
  onSelect: () => void;
}) => {
  const labels = { today: t.today, yesterday: t.yesterday };
  const unread = chat.unread_count > 0;
  return (
    <li>
      <button
        type="button"
        data-testid="wa-chat-row"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors duration-150 hover:bg-slate-50 active:bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green-600 ${
          selected ? "bg-green-50" : ""
        }`}
      >
        <Avatar client={client} src={chat.avatar_url} name={chat.title} group={chat.is_group} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={`type-label truncate text-slate-800 ${unread ? "font-bold" : ""}`}>{chat.title}</span>
            <span className={`type-meta shrink-0 ${unread ? "text-green-700" : "text-slate-400"}`}>
              {rowStamp(chat.last_message_at, labels, locale)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="type-meta truncate text-slate-500">
              {previewLine(chat.last_message, chat.is_group, {
                you: t.you,
                photo: t.photo,
                video: t.video,
                voice: t.voice,
                document: t.document,
                sticker: t.sticker,
                attachment: t.attachment,
              })}
            </span>
            {unread && (
              <span
                className="type-meta inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-green-600 px-1.5 font-semibold text-white"
                aria-label={t.unread(chat.unread_count)}
              >
                {chat.unread_count > 99 ? "99+" : chat.unread_count}
              </span>
            )}
          </span>
          {summary && <span className="type-meta mt-1 line-clamp-2 block text-slate-400">{summary}</span>}
        </span>
      </button>
    </li>
  );
};

/** The left pane: search box and the chats, newest first (the order WAAI returns them in). */
export const ConversationList = ({
  client,
  t,
  locale,
  data,
  userId,
  selectedId,
  onSelect,
  onSelectMessage,
  syncing,
  syncFailed,
  onSync,
}: Props) => {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MessageSearchHitDto[]>([]);
  const [searching, setSearching] = useState(false);
  const shown = useMemo(() => filterChats(data.conversations, query), [data.conversations, query]);
  const done = useMemo(() => new Set(data.completed_task_ids), [data.completed_task_ids]);
  const labels = { today: t.today, yesterday: t.yesterday };

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      client
        .get<MessageSearchResponse>("/messages/search", {
          query: { q: trimmed, ...(userId ? { user: userId } : {}) },
        })
        .then((res) => {
          if (!cancelled) setHits(res.hits ?? []);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [client, query, userId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-100 p-3">
        <label className="relative block">
          <span className="sr-only">{t.search}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search}
            data-testid="wa-chat-search"
            className="type-body w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-slate-800 placeholder:text-slate-400 transition-colors focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {data.conversations.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title={data.has_wa_account ? t.noChats : t.noAccount}
            body={data.has_wa_account ? t.noChatsBody : t.noAccountBody}
            action={
              data.has_wa_account ? (
                <button
                  type="button"
                  onClick={onSync}
                  disabled={syncing}
                  className="type-label inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60"
                >
                  {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  {syncing ? t.syncing : t.sync}
                </button>
              ) : undefined
            }
          />
        ) : shown.length === 0 && hits.length === 0 && !searching ? (
          <p className="type-body p-6 text-center text-slate-500">{t.noMatch}</p>
        ) : (
          <>
            {shown.length > 0 && (
              <ul>
                {shown.map((chat) => (
                  <Row
                    key={chat.id}
                    client={client}
                    t={t}
                    locale={locale}
                    chat={chat}
                    summary={summaryLine(data.summaries[chat.id], done)}
                    selected={chat.id === selectedId}
                    onSelect={() => onSelect(chat.id)}
                  />
                ))}
              </ul>
            )}
            {hits.length > 0 && (
              <ul data-testid="wa-message-search-hits">
                {hits.map((hit) => (
                  <li key={hit.message_id}>
                    <button
                      type="button"
                      data-testid="wa-search-hit"
                      onClick={() =>
                        onSelectMessage
                          ? onSelectMessage(hit.conversation_id, hit.message_id)
                          : onSelect(hit.conversation_id)
                      }
                      className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors duration-150 hover:bg-slate-50 active:bg-slate-100"
                    >
                      <Avatar
                        client={client}
                        src={hit.avatar_url}
                        name={hit.conversation_title ?? "Chat"}
                        group={hit.is_group}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="type-label truncate text-slate-800">
                            {hit.conversation_title ?? "Chat"}
                          </span>
                          <span className="type-meta shrink-0 text-slate-400">
                            {rowStamp(hit.sent_at, labels, locale)}
                          </span>
                        </span>
                        <span className="type-meta mt-0.5 line-clamp-2 block text-slate-500">
                          {hit.sender ? `${hit.sender}: ` : ""}
                          {hit.snippet}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {syncFailed && <p className="type-meta px-4 py-2 text-rose-600">{t.syncFailed}</p>}
      </div>
    </div>
  );
};
