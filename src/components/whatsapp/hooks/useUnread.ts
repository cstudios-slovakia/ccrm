import { useState } from "react";
import type { UnreadResponse } from "../api/contract.ts";
import type { WaaiClient } from "../api/waaiClient.ts";
import { usePoll } from "./usePoll.ts";

/** WAAI's own badge polls every ten seconds (`unread-provider.tsx`). */
export const UNREAD_POLL_MS = 10_000;

/**
 * The unread counts behind the sidebar badge. Unlike the other polls it does not pause while the module
 * is hidden: the badge is the point of showing it elsewhere. `onChats` hears the number of chats with
 * something unread, which is what WhatsApp shows on its own icon.
 */
export function useUnread(client: WaaiClient | null, onChats: (chats: number) => void): UnreadResponse | null {
  const [unread, setUnread] = useState<UnreadResponse | null>(null);
  usePoll(
    async () => {
      if (!client) return;
      try {
        const next = await client.get<UnreadResponse>("/unread");
        setUnread(next);
        onChats(next.chats);
      } catch {
        // A missed poll keeps the last number; the next one tries again.
      }
    },
    UNREAD_POLL_MS,
    { enabled: client !== null, pauseWhenHidden: false },
  );
  return unread;
}
