import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationsResponse } from "../api/contract.ts";
import type { WaaiClient } from "../api/waaiClient.ts";
import { usePoll } from "../hooks/usePoll.ts";

/** WAAI re-reads the list every 10 s, every 4 s while it is empty (a first sync is arriving). */
export const LIST_POLL_MS = 10_000;
export const LIST_POLL_EMPTY_MS = 4_000;

export interface ConversationListState {
  data: ConversationsResponse | null;
  error: boolean;
  /** No answer yet. */
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * The chat list, polled. `ownerId` is the admin's per-member view. A failed poll keeps the list on screen
 * and only sets `error` when there is nothing to show.
 */
export function useConversationList(client: WaaiClient, ownerId: string | null, active: boolean): ConversationListState {
  const [data, setData] = useState<ConversationsResponse | null>(null);
  const [error, setError] = useState(false);
  const wanted = useRef(ownerId);
  const [seenOwner, setSeenOwner] = useState(ownerId);
  if (seenOwner !== ownerId) {
    // Another member's list: never show the previous one while the new one loads.
    setSeenOwner(ownerId);
    setData(null);
    setError(false);
  }
  useEffect(() => {
    wanted.current = ownerId;
  }, [ownerId]);

  const refresh = useCallback(async () => {
    const asked = ownerId;
    try {
      const res = await client.get<ConversationsResponse>("/conversations", { query: { owner: asked } });
      if (wanted.current !== asked) return;
      setData(res);
      setError(false);
    } catch {
      if (wanted.current === asked) setError(true);
    }
  }, [client, ownerId]);

  usePoll(refresh, data && data.conversations.length === 0 ? LIST_POLL_EMPTY_MS : LIST_POLL_MS, { enabled: active });

  return { data, error: error && data === null, loading: data === null && !error, refresh };
}
