import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronUp, ListTodo, Loader2, RotateCw, Sparkles } from "lucide-react";
import type { ConversationResponse, MessageDto, QuotedMessage } from "../api/contract.ts";
import type { WaaiClient } from "../api/waaiClient.ts";
import { withDaySeparators, type TimelineItem } from "../lib/messageDays.ts";
import { Avatar } from "./Avatar";
import type { ChatsMessages } from "./chatsI18n.ts";
import { MessageBubble } from "./MessageBubble";
import { useMessages } from "./useMessages.ts";
import { Composer, withOwnReaction } from "./composer";
import { ChatTasks, CrmLinkChip, SummaryPanel } from "./panel";
import { useChatCrmLinks } from "../hooks/useChatCrmLinks.ts";

interface Props {
  client: WaaiClient;
  t: ChatsMessages;
  locale: string;
  conversationId: string;
  /** The message a deep link points at (`?m=`). */
  deepLinkId: string | null;
  active: boolean;
  /** Called after the chat was marked read, so the list can drop its badge. */
  onRead: () => void;
  onBack: () => void;
  /** The header data when the list already has it (title, picture) while the full header loads. */
  fallback: { title: string; avatar_url: string | null; is_group: boolean } | null;
  onOpenRecord?: (kind: "lead" | "project" | "task", id: string) => void;
}

/** How close to the bottom still counts as "reading the latest": new messages keep it pinned. */
const STICKY_PX = 120;

export const ConversationPane = ({
  client,
  t,
  locale,
  conversationId,
  deepLinkId,
  active,
  onRead,
  onBack,
  fallback,
  onOpenRecord,
}: Props) => {
  const [header, setHeader] = useState<{ id: string; data: ConversationResponse } | null>(null);
  const msgs = useMessages(client, conversationId, deepLinkId, active, onRead);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const heightBefore = useRef<number | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const [quoted, setQuoted] = useState<QuotedMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessageDto | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);

  const crmLinksHook = useChatCrmLinks({
    client,
    conversationId,
    initialLinks: header?.data?.crm_links,
    active,
  });

  useEffect(() => {
    const abort = new AbortController();
    client
      .get<ConversationResponse>(`/conversations/${encodeURIComponent(conversationId)}`, { signal: abort.signal })
      .then((data) => setHeader({ id: conversationId, data }))
      .catch(() => undefined);
    return () => abort.abort();
  }, [client, conversationId]);
  const info = header?.id === conversationId ? header.data : null;

  const items = useMemo(
    () => withDaySeparators(msgs.messages, { today: t.today, yesterday: t.yesterday }, locale),
    [msgs.messages, t.today, t.yesterday, locale],
  );

  // After a render: keep the position the person is reading at.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || msgs.loading) return;
    if (msgs.targetId) {
      const target = el.querySelector<HTMLElement>(`#wa-msg-${CSS.escape(msgs.targetId)}`);
      if (target) {
        target.scrollIntoView({ block: "center" });
        setHighlight(msgs.targetId);
        msgs.consumeTarget();
        pinned.current = false;
        return;
      }
      msgs.consumeTarget();
    }
    if (heightBefore.current !== null) {
      // Older messages were added above: stay on the message that was at the top.
      el.scrollTop += el.scrollHeight - heightBefore.current;
      heightBefore.current = null;
    } else if (pinned.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [msgs.messages, msgs.loading, msgs]);

  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(timer);
  }, [highlight]);

  const onScroll = () => {
    const el = scroller.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_PX;
  };

  const loadOlder = useCallback(() => {
    heightBefore.current = scroller.current?.scrollHeight ?? null;
    pinned.current = false;
    void msgs.loadOlder().finally(() => {
      // Nothing was added: do not keep a stale offset for the next render.
      queueMicrotask(() => {
        heightBefore.current = null;
      });
    });
  }, [msgs]);

  const jumpTo = useCallback((id: string) => {
    const target = scroller.current?.querySelector<HTMLElement>(`#wa-msg-${CSS.escape(id)}`);
    if (!target) return;
    pinned.current = false;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlight(id);
  }, []);

  const title = info?.title ?? fallback?.title ?? "";
  const isGroup = info?.is_group ?? fallback?.is_group ?? false;
  const subtitle = info ? (info.is_self_chat ? t.selfChat : info.is_group ? t.group : null) : null;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="wa-conversation">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={t.back}
            className="-ml-2 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 active:bg-slate-200 ws-lg:hidden cursor-pointer"
          >
            <ArrowLeft className="size-5" />
          </button>
          <Avatar client={client} src={info?.avatar_url ?? fallback?.avatar_url ?? null} name={title} group={isGroup} />
          <div className="min-w-0">
            <h2 className="type-card-title truncate text-slate-800">{title}</h2>
            {subtitle && <p className="type-meta text-slate-500">{subtitle}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {info?.crm_links.supported && (
            <CrmLinkChip
              conversationId={conversationId}
              crmLinks={crmLinksHook.crmLinks}
              language={locale}
              onLink={crmLinksHook.linkEntity}
              onUnlink={crmLinksHook.unlinkEntity}
              onSearch={crmLinksHook.searchEntities}
              searchResults={crmLinksHook.searchResults}
              searching={crmLinksHook.searching}
              saving={crmLinksHook.saving}
              onOpenRecord={onOpenRecord}
            />
          )}

          <button
            type="button"
            onClick={() => {
              setSummaryOpen((o) => !o);
              setTasksOpen(false);
            }}
            className={`type-meta inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 font-medium transition-colors ${
              summaryOpen ? "border-green-600 bg-green-50 text-green-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            title={t.summary}
          >
            <Sparkles className="size-4 text-green-600" />
            <span className="hidden ws-sm:inline">{t.summary}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTasksOpen((o) => !o);
              setSummaryOpen(false);
            }}
            className={`type-meta inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-1.5 font-medium transition-colors ${
              tasksOpen ? "border-green-600 bg-green-50 text-green-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            title={t.tasks}
          >
            <ListTodo className="size-4 text-green-600" />
            <span className="hidden ws-sm:inline">{t.tasks}</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Messages and Composer */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50 px-4 py-4">
            {msgs.loading && (
              <div className="flex justify-center py-10" role="status">
                <Loader2 className="size-6 animate-spin text-green-600" aria-hidden />
                <span className="sr-only">{t.loadingOlder}</span>
              </div>
            )}
            {msgs.error && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <p className="type-body text-slate-600">{t.messagesFailed}</p>
                <button
                  type="button"
                  onClick={msgs.reload}
                  className="type-label inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
                >
                  <RotateCw className="size-4" />
                  {t.retry}
                </button>
              </div>
            )}
            {!msgs.loading && !msgs.error && (
              <>
                <div className="flex justify-center pb-2">
                  {msgs.hasOlder ? (
                    <button
                      type="button"
                      onClick={loadOlder}
                      disabled={msgs.loadingOlder}
                      data-testid="wa-load-older"
                      className="type-meta inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600 transition-colors hover:bg-slate-100 active:bg-slate-200 disabled:opacity-60 cursor-pointer"
                    >
                      {msgs.loadingOlder ? <Loader2 className="size-3.5 animate-spin" /> : <ChevronUp className="size-3.5" />}
                      {msgs.loadingOlder ? t.loadingOlder : t.loadOlder}
                    </button>
                  ) : (
                    <span className="type-meta text-slate-400">{t.startOfChat}</span>
                  )}
                </div>
                {items.map((item, i) =>
                  item.kind === "day" ? (
                    <div key={item.key} className="flex justify-center py-1">
                      <span className="type-meta rounded-full bg-white px-3 py-0.5 text-slate-500 shadow-xs">{item.label}</span>
                    </div>
                  ) : (
                    <MessageBubble
                      key={item.key}
                      client={client}
                      t={t}
                      locale={locale}
                      message={item.message}
                      quickReactions={info?.quick_reactions}
                      showSender={isGroup && showsSender(items, i)}
                      highlighted={highlight === item.message.id}
                      onJumpTo={jumpTo}
                      onReply={(q) => {
                        setEditingMessage(null);
                        setQuoted(q);
                      }}
                      onEdit={(m) => {
                        setQuoted(null);
                        setEditingMessage(m);
                      }}
                      onDelete={(id) => msgs.removeMessage(id)}
                      onReactionChange={(msgId, emoji) => {
                        const target = msgs.messages.find((m) => m.id === msgId);
                        if (target) {
                          msgs.updateMessage({ ...target, reactions: withOwnReaction(target.reactions, emoji) });
                        }
                      }}
                    />
                  ),
                )}
              </>
            )}
          </div>

          <Composer
            client={client}
            conversationId={conversationId}
            quoted={quoted}
            onClearQuote={() => setQuoted(null)}
            editingMessage={editingMessage}
            onClearEdit={() => setEditingMessage(null)}
            onOptimisticMessage={msgs.appendOptimistic}
            onOptimisticSettle={msgs.settleOptimistic}
            onMessageEdited={msgs.updateMessage}
            locale={locale}
          />
        </div>

        {/* Side panel for Summary or Tasks */}
        {(summaryOpen || tasksOpen) && (
          <aside className="w-80 shrink-0 border-l border-slate-200 bg-white overflow-y-auto p-4 ws-xl:w-96" aria-label="Conversation Details">
            {summaryOpen && (
              <SummaryPanel
                client={client}
                conversationId={conversationId}
                language={locale}
                onClose={() => setSummaryOpen(false)}
                onOpenTasks={() => {
                  setSummaryOpen(false);
                  setTasksOpen(true);
                }}
                senderName={info?.sender_name}
              />
            )}
            {tasksOpen && (
              <ChatTasks
                client={client}
                conversationId={conversationId}
                language={locale}
                onClose={() => setTasksOpen(false)}
                onOpenRecord={onOpenRecord}
                senderName={info?.sender_name}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  );
};

/** A group bubble names its sender unless the previous bubble came from the same person. */
function showsSender(items: TimelineItem<MessageDto>[], index: number): boolean {
  const here = items[index];
  if (here?.kind !== "message" || here.message.direction === "out") return false;
  const before = items[index - 1];
  if (before?.kind !== "message") return true;
  return before.message.direction === "out" || before.message.sender !== here.message.sender;
}
