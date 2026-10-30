import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Loader2, MessageCircle, RotateCw } from "lucide-react";
import { EmptyState } from "../../layout";
import type { ResyncResponse, WaHealthResponse } from "../api/contract.ts";
import type { WaaiClient } from "../api/waaiClient.ts";
import { usePoll } from "../hooks/usePoll.ts";
import { parseWhatsAppRoute, whatsAppHash, type ChatsRoute } from "../lib/chatRoute.ts";
import { chatsMessages } from "./chatsI18n.ts";
import { ConversationList } from "./ConversationList";
import { ConversationPane } from "./ConversationPane";
import { OpenByPhone } from "../open";
import { useConversationList } from "./useConversationList.ts";

/** WAAI's warning toast asks every 30 s. */
const HEALTH_POLL_MS = 30_000;

interface Props {
  client: WaaiClient;
  /** The hash path without `#`, e.g. `whatsapp/c/<id>`. */
  route: string;
  /** Its query, e.g. `m=<message id>`. */
  params: URLSearchParams;
  language: string;
  /** False while another module is showing: nothing polls. */
  active: boolean;
  onOpenRecord?: (kind: "lead" | "project" | "task", id: string) => void;
}

/**
 * The Chats tab (docs/WAAI-NATIVE-MODULE.md §4.6): the chat list and the open conversation. From `ws-lg` they
 * sit side by side; below it one of the two fills the width and a back button returns to the list.
 */
export const ChatsTab = ({ client, route, params, language, active, onOpenRecord }: Props) => {
  const t = useMemo(() => chatsMessages(language), [language]);
  const parsed = useMemo(() => parseWhatsAppRoute(route, params), [route, params]);
  const where = useMemo<ChatsRoute>(
    () => (parsed.view === "chats" ? parsed : { view: "chats", userId: null, conversationId: null, messageId: null }),
    [parsed],
  );
  const list = useConversationList(client, where.userId, active);
  const [health, setHealth] = useState<WaHealthResponse | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);

  usePoll(
    async () => {
      // The member view of an admin is about someone else's accounts; the warning is about your own.
      setHealth(await client.get<WaHealthResponse>("/wa/health").catch(() => null));
    },
    HEALTH_POLL_MS,
    { enabled: active },
  );

  const go = useCallback(
    (conversationId: string | null) => {
      window.location.hash = whatsAppHash({ ...where, conversationId, messageId: null });
    },
    [where],
  );

  const sync = useCallback(async () => {
    setSyncing(true);
    setSyncFailed(false);
    try {
      const res = await client.post<ResyncResponse>("/wa/resync");
      setSyncFailed(!res.ok);
      await list.refresh();
    } catch {
      setSyncFailed(true);
    } finally {
      setSyncing(false);
    }
  }, [client, list]);

  const selected = list.data?.conversations.find((c) => c.id === where.conversationId) ?? null;
  const isOpenView = parsed.view === "open";
  const showPane = where.conversationId !== null || isOpenView;

  const banner = health && (health.worker_offline || health.disconnected.length > 0) && (
    <div role="status" data-testid="wa-health-banner" className="type-body flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-amber-800">
      <AlertTriangle className="size-4 shrink-0" aria-hidden />
      {health.worker_offline ? t.workerOffline : t.syncWarning(health.disconnected.map((d) => d.label).join(", "))}
    </div>
  );

  if (list.loading) {
    return (
      <div className="flex justify-center py-24" role="status" data-testid="wa-chats-loading">
        <Loader2 className="size-8 animate-spin text-green-600" aria-hidden />
      </div>
    );
  }
  if (list.error || !list.data) {
    return (
      <EmptyState
        icon={<AlertTriangle />}
        title={t.listFailed}
        action={
          <button
            type="button"
            onClick={() => void list.refresh()}
            className="type-label inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100"
          >
            <RotateCw className="size-4" />
            {t.retry}
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {banner}
      {where.userId && <p className="type-label text-slate-600">{t.memberView(list.data.user_name)}</p>}
      <div
        data-testid="wa-chats"
        className="grid h-[calc(100dvh-22rem)] min-h-130 grid-cols-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ws-lg:grid-cols-[--spacing(96)_minmax(0,1fr)]"
      >
        <div className={`min-h-0 border-slate-100 ws-lg:block ws-lg:border-r ${showPane ? "hidden" : "block"}`}>
          <ConversationList
            client={client}
            t={t}
            locale={language}
            data={list.data}
            selectedId={where.conversationId}
            onSelect={go}
            syncing={syncing}
            syncFailed={syncFailed}
            onSync={() => void sync()}
          />
        </div>
        <div className={`min-h-0 min-w-0 ws-lg:block ${showPane ? "block" : "hidden"}`}>
          {isOpenView ? (
            <OpenByPhone
              client={client}
              phone={parsed.phone}
              leadId={parsed.leadId}
              projectId={parsed.projectId}
              onOpenConversation={(id) => go(id)}
              onBack={() => go(null)}
              locale={language}
            />
          ) : where.conversationId ? (
            <ConversationPane
              key={where.conversationId}
              client={client}
              t={t}
              locale={language}
              conversationId={where.conversationId}
              deepLinkId={where.messageId}
              active={active}
              onRead={() => void list.refresh()}
              onBack={() => go(null)}
              fallback={selected ? { title: selected.title, avatar_url: selected.avatar_url, is_group: selected.is_group } : null}
              onOpenRecord={onOpenRecord}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <EmptyState icon={<MessageCircle />} title={t.pickChat} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
