import { useEffect, useRef } from "react";
import { nextChimeDelayMs, playPresenceSound, type PresenceSoundPrefs } from "../utils/presenceSound.ts";

const CHANNEL = "ccrm-tt-presence-sound";
const RETRY_MS = 4_000;
const HEARTBEAT_MS = 2_000;
const PEER_TTL_MS = 5_000;

/**
 * TT2 D8.3: while the presence question is open, exactly one tab chimes (every 20 s, then every 8 s).
 * The tab holding the Web Lock `ccrm-tt-presence-sound` plays; without Web Locks the tabs elect the
 * lowest id over a BroadcastChannel. Stops the moment `question` turns false.
 */
export function usePresenceSound(question: boolean, secondsToPause: number | null, confirmWindowSec: number, prefs: PresenceSoundPrefs): void {
  const secondsRef = useRef(secondsToPause);
  secondsRef.current = secondsToPause;
  const windowRef = useRef(confirmWindowSec);
  windowRef.current = confirmWindowSec;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    if (!question || typeof window === "undefined") return;
    let alive = true;
    let leader = false;
    let timer: number | undefined;
    const cleanups: (() => void)[] = [];

    const chime = () => {
      if (!alive) return;
      const p = prefsRef.current;
      if (leader && !p.muted) playPresenceSound(p.sound, p.volume);
      const delay = nextChimeDelayMs(secondsRef.current, windowRef.current);
      timer = delay === null ? undefined : window.setTimeout(chime, delay);
    };
    const startLoop = (firstDelay: number) => {
      if (timer === undefined) timer = window.setTimeout(chime, firstDelay);
    };

    const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
    if (locks?.request) {
      let release: (() => void) | null = null;
      let retry: number | undefined;
      const attempt = () => {
        if (!alive || leader) return;
        void locks
          .request("ccrm-tt-presence-sound", { ifAvailable: true }, (lock) => {
            if (!lock) {
              retry = window.setTimeout(attempt, RETRY_MS);
              return undefined;
            }
            if (!alive) return undefined;
            leader = true;
            chime();
            return new Promise<void>((resolve) => {
              release = resolve;
            });
          })
          .catch(() => {});
      };
      attempt();
      cleanups.push(() => {
        window.clearTimeout(retry);
        release?.();
      });
    } else if (typeof BroadcastChannel !== "undefined") {
      const me = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const peers = new Map<string, number>();
      const ch = new BroadcastChannel(CHANNEL);
      const elect = () => {
        const now = Date.now();
        let lowest = me;
        peers.forEach((seen, id) => {
          if (now - seen > PEER_TTL_MS) peers.delete(id);
          else if (id < lowest) lowest = id;
        });
        leader = lowest === me;
      };
      const beat = () => {
        elect();
        try {
          ch.postMessage({ id: me });
        } catch {
          /* closed */
        }
      };
      ch.onmessage = (ev: MessageEvent) => {
        const id = (ev.data as { id?: unknown } | null)?.id;
        if (typeof id === "string" && id !== me) {
          peers.set(id, Date.now());
          elect();
        }
      };
      beat();
      const hb = window.setInterval(beat, HEARTBEAT_MS);
      startLoop(700); // let the other tabs' heartbeats arrive before the first chime
      cleanups.push(() => {
        window.clearInterval(hb);
        ch.close();
      });
    } else {
      leader = true; // a single-tab environment
      chime();
    }

    return () => {
      alive = false;
      leader = false;
      window.clearTimeout(timer);
      cleanups.forEach((fn) => fn());
    };
  }, [question]);
}
