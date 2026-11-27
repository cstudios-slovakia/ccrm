import { useEffect } from "react";
import { useTimeTracking } from "../../hooks/useTimeTracking";

/**
 * TT2 D8.4: the service worker posts `{type: "tt-presence-cleared"}` when the silent
 * "cleared" push arrives (the question was answered elsewhere or the cycle ended).
 * Re-read the running state so an open page never keeps a stale question.
 */
export function PresenceSwListener() {
  const { bump, enabled } = useTimeTracking();
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "tt-presence-cleared") bump();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [bump, enabled]);
  return null;
}
