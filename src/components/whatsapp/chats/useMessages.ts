import { useCallback, useEffect, useRef, useState } from "react";
import type { LoadHistoryResponse, MarkReadResponse, MessageDto, MessagesResponse } from "../api/contract.ts";
import type { WaaiClient } from "../api/waaiClient.ts";
import { usePoll } from "../hooks/usePoll.ts";
import { mergeNewer, newestSentAt, oldestSentAt, prependOlder } from "./chatState.ts";

/** The open chat polls for new messages every 5 s, as WAAI's own conversation view does. */
export const MESSAGE_POLL_MS = 5_000;
const PAGE = 50;

export interface MessagesState {
  messages: MessageDto[];
  /** First page not in yet. */
  loading: boolean;
  error: boolean;
  loadingOlder: boolean;
  /** There may be older messages, here or at WhatsApp. */
  hasOlder: boolean;
  /** The id the page opened at (a deep link), cleared by `consumeTarget`. */
  targetId: string | null;
  consumeTarget: () => void;
  loadOlder: () => Promise<void>;
  reload: () => void;
  appendOptimistic: (msg: MessageDto) => void;
  settleOptimistic: (localId: string, stored: MessageDto) => void;
  dropOptimistic: (localId: string) => void;
  updateMessage: (msg: MessageDto) => void;
  removeMessage: (id: string) => void;
}

/**
 * The messages of one conversation: the newest page (or the stretch down to a deep-linked message), older
 * pages on demand, and a poll that merges in what changed. Opening the chat marks it read, as does a new
 * incoming message while it is open and visible.
 */
export function useMessages(
  client: WaaiClient,
  conversationId: string,
  deepLinkId: string | null,
  active: boolean,
  onRead: () => void,
): MessagesState {
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(deepLinkId);
  const [attempt, setAttempt] = useState(0);
  const serverTime = useRef<string | null>(null);
  const current = useRef(conversationId);
  const onReadRef = useRef(onRead);
  const messagesRef = useRef(messages);
  // Where WAAI says older history ends: `null` cursor from the database means ask WhatsApp (load-history).
  const dbExhausted = useRef(false);
  useEffect(() => {
    onReadRef.current = onRead;
    messagesRef.current = messages;
  });

  const markRead = useCallback(async () => {
    try {
      await client.post<MarkReadResponse>(`/conversations/${encodeURIComponent(conversationId)}/mark-read`);
      onReadRef.current();
    } catch {
      /* the badge stays until the next poll */
    }
  }, [client, conversationId]);

  // First page (re)loads when the chat, the deep link or `reload` changes.
  useEffect(() => {
    current.current = conversationId;
    const abort = new AbortController();
    serverTime.current = null;
    dbExhausted.current = false;
    // The previous chat's messages must not flash while this one loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([]);
    setLoading(true);
    setError(false);
    setHasOlder(false);
    setTargetId(deepLinkId);
    (async () => {
      try {
        const res = await client.get<MessagesResponse>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
          query: { limit: PAGE, through: deepLinkId },
          signal: abort.signal,
        });
        if (abort.signal.aborted) return;
        serverTime.current = res.server_time;
        setMessages(res.messages);
        // A page shorter than asked for with no cursor is the start of what is stored; WhatsApp may have more.
        setHasOlder(true);
        dbExhausted.current = res.next_cursor === null || res.next_cursor === undefined;
        setLoading(false);
        void markRead();
      } catch {
        if (!abort.signal.aborted) {
          setError(true);
          setLoading(false);
        }
      }
    })();
    return () => abort.abort();
  }, [client, conversationId, deepLinkId, attempt, markRead]);

  usePoll(
    async () => {
      const held = messagesRef.current;
      const after = newestSentAt(held);
      if (loading || error || !after || !serverTime.current) return;
      const asked = conversationId;
      const res = await client
        .get<MessagesResponse>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
          query: { after, since: serverTime.current, limit: 100 },
        })
        .catch(() => null);
      if (!res || current.current !== asked) return;
      serverTime.current = res.server_time;
      const next = mergeNewer(messagesRef.current, res.messages, res.deleted_ids ?? []);
      const gotIncoming = res.messages.some((m) => m.direction === "in" && !messagesRef.current.some((h) => h.id === m.id));
      if (next.length !== messagesRef.current.length || res.messages.length > 0) setMessages(next);
      if (gotIncoming) void markRead();
    },
    MESSAGE_POLL_MS,
    { enabled: active && !loading && !error, immediate: false },
  );

  const loadOlder = useCallback(async () => {
    const before = oldestSentAt(messagesRef.current);
    if (!before || loadingOlder) return;
    const asked = conversationId;
    setLoadingOlder(true);
    try {
      let older: MessageDto[] = [];
      if (!dbExhausted.current) {
        const res = await client.get<MessagesResponse>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
          query: { before, limit: PAGE },
        });
        older = res.messages;
        dbExhausted.current = res.next_cursor === null || res.next_cursor === undefined;
        if (older.length === 0) dbExhausted.current = true;
      }
      if (older.length === 0 && dbExhausted.current) {
        // Nothing older is stored: ask WhatsApp for the next stretch (this can take a while).
        const res = await client.post<LoadHistoryResponse>(`/conversations/${encodeURIComponent(conversationId)}/load-history`, { before });
        older = res.messages;
        if (res.reached_start) setHasOlder(false);
      }
      if (current.current !== asked) return;
      setMessages((held) => prependOlder(held, older));
    } catch {
      /* the button stays; the person can try again */
    } finally {
      if (current.current === asked) setLoadingOlder(false);
    }
  }, [client, conversationId, loadingOlder]);

  const appendOptimistic = useCallback((msg: MessageDto) => {
    setMessages((held) => [...held, msg]);
  }, []);

  const settleOptimistic = useCallback((localId: string, stored: MessageDto) => {
    setMessages((held) => held.map((m) => (m.id === localId ? stored : m)));
  }, []);

  const dropOptimistic = useCallback((localId: string) => {
    setMessages((held) => held.filter((m) => m.id !== localId));
  }, []);

  const updateMessage = useCallback((msg: MessageDto) => {
    setMessages((held) => held.map((m) => (m.id === msg.id ? msg : m)));
  }, []);

  const removeMessage = useCallback((id: string) => {
    setMessages((held) => held.filter((m) => m.id !== id));
  }, []);

  return {
    messages,
    loading,
    error,
    loadingOlder,
    hasOlder,
    targetId,
    consumeTarget: () => setTargetId(null),
    loadOlder,
    reload: () => setAttempt((n) => n + 1),
    appendOptimistic,
    settleOptimistic,
    dropOptimistic,
    updateMessage,
    removeMessage,
  };
}
