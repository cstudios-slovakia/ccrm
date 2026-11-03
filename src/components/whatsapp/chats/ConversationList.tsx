import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, RefreshCw, Search, SearchX, Sparkles, X } from "lucide-react";
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
import { rowBullets, standingCount } from "./summaryBullets.ts";

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

const Row = ({
  client,
  t,
  locale,
  chat,
  summary,
  done,
  selected,
  onSelect,
}: {
  client: WaaiClient;
  t: ChatsMessages;
  locale: string;
  chat: ChatListItem;
  summary: ChatSummaryPreview | undefined;
  done: ReadonlySet<string>;
  selected: boolean;
  onSelect: () => void;
}) => {
  const labels = { today: t.today, yesterday: t.yesterday };
  const unread = chat.unread_count > 0;
  const card = rowBullets(summary, done);
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
          {card.kind !== "none" && (
            // Inside a <button>: phrasing content only, hence spans with list roles.
            <span data-testid="wa-row-summary" className="mt-2 block border-t border-slate-100 pt-2">
              <span className="flex items-center justify-between gap-2">
                <span className="type-meta inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 font-semibold uppercase tracking-wide text-green-700">
                  <Sparkles className="size-3" aria-hidden />
                  {t.summaryLabel}
                </span>
                {card.kind === "bullets" && (
                  <span data-testid="wa-row-summary-count" className="type-meta tabular-nums text-slate-400">
                    {t.summaryPoints(standingCount(card))}
                  </span>
                )}
              </span>
              {card.kind === "bullets" ? (
                <span role="list" className="mt-1.5 block space-y-1">
                  {card.bullets.map((b, i) => (
                    <span
                      key={i}
                      role="listitem"
                      data-testid="wa-row-summary-bullet"
                      className="type-meta flex items-start gap-2 text-slate-600"
                    >
                      <span className="flex h-[1lh] shrink-0 items-center" aria-hidden>
                        {b.taskId ? (
                          <span className="block size-1.75 rounded-full border border-green-600/80" />
                        ) : (
                          <span className="mx-0.5 block size-1 rounded-full bg-green-600/55" />
                        )}
                      </span>
                      <span className="min-w-0 [overflow-wrap:anywhere]">{b.text}</span>
                    </span>
                  ))}
                </span>
              ) : (
                <span
                  data-testid="wa-row-summary-done"
                  className="type-meta mt-1.5 flex items-center gap-1.5 text-slate-500"
                >
                  <Check className="size-3.5" aria-hidden />
                  {t.summaryAllDone}
                </span>
              )}
            </span>
          )}
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
  // WAAI keeps the search box folded away until the magnifier is pressed; a query already typed keeps it open.
  const [searchOpen, setSearchOpen] = useState(false);
  const showSearch = searchOpen || query !== "";
  const needsLook = useMemo(() => data.conversations.filter((c) => c.unread_count > 0).length, [data.conversations]);
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
      <div className="border-b border-slate-100 px-5 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="type-page-title leading-tight text-slate-800">{t.listTitle}</h2>
            <p className="type-meta mt-1 truncate text-slate-500" data-testid="wa-chats-subtitle">
              {syncing ? t.syncing : needsLook > 0 ? <><b className="font-semibold text-slate-800">{needsLook}</b> {t.needsLook(needsLook)}</> : t.subtitleCalm}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {data.has_wa_account && (
              <button
                type="button"
                onClick={onSync}
                disabled={syncing}
                title={t.refresh}
                aria-label={t.refresh}
                data-testid="wa-chats-refresh"
                className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50"
              >
                <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (showSearch) setQuery("");
                setSearchOpen(!showSearch);
              }}
              title={t.toggleSearch}
              aria-label={t.toggleSearch}
              aria-expanded={showSearch}
              data-testid="wa-chats-search-toggle"
              className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
            >
              {showSearch ? <X className="size-3.5" /> : <Search className="size-3.5" />}
            </button>
          </div>
        </div>
        {showSearch && (
          <label className="relative mt-3 block">
            <span className="sr-only">{t.search}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.toggleSearch}
              data-testid="wa-chat-search"
              className="type-body w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-slate-800 placeholder:text-slate-400 transition-colors focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
          </label>
        )}
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
                    summary={data.summaries[chat.id]}
                    done={done}
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
