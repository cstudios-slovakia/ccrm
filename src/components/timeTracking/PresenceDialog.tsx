import { useEffect, useRef, useState } from "react";
import { BellRing, Pause, Play, Square } from "lucide-react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { clockTime, formatCountdown } from "../../utils/timePresenceUi.ts";

const BTN = "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-ui font-semibold transition-all active:scale-95 cursor-pointer motion-reduce:transition-none disabled:opacity-60";

/**
 * TT2 D8.2: the "Still working?" alertdialog. Shown in every open tab while the presence cycle
 * is in the question phase (nothing else answers it, so it has no dismiss), and after the
 * automatic pause as "Paused at 09:50" with Resume / Stop (Esc closes that one).
 */
export function PresenceDialog() {
  const { t, enabled, presence, presenceView: v, running, paused, confirm, pauseAll, stopAll, resumeAll, stop } = useTimeTracking();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const question = v.phase === "question" && running.length > 0;
  const pausedKey = presence?.autoPausedAt ?? "paused";
  const afterPause = v.phase === "paused" && paused.length > 0 && running.length === 0 && dismissed !== pausedKey;
  const open = enabled && (question || afterPause);

  // Focus: "Still working" gets it when the question opens, Resume after the pause.
  const mode = question ? "question" : afterPause ? "paused" : "";
  useEffect(() => {
    if (!mode) return;
    const first = box.current?.querySelector<HTMLElement>("[data-autofocus]");
    first?.focus();
  }, [mode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && afterPause) {
        e.preventDefault();
        setDismissed(pausedKey);
        return;
      }
      if (e.key !== "Tab" || !box.current) return;
      const items = Array.from(box.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!box.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, afterPause, pausedKey]);

  if (!open) return null;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const stopPaused = async () => {
    for (const e of paused) await stop(e.id);
  };
  const items = question ? running : paused;
  const heading = question ? t("Still working?", "Stále pracuješ?", "Még dolgozol?") : t(`Paused at ${clockTime(presence?.autoPausedAt ?? null)}`, `Pozastavené o ${clockTime(presence?.autoPausedAt ?? null)}`, `Szüneteltetve: ${clockTime(presence?.autoPausedAt ?? null)}`);
  const pauseAtLabel = clockTime(presence?.deadlineAt ?? null);
  const sub = question
    ? `${t(`Timers pause at ${pauseAtLabel}`, `Časovače sa pozastavia o ${pauseAtLabel}`, `Az időzítők ${pauseAtLabel}-kor szünetelnek`)} · ${formatCountdown(v.secondsToPause)}`
    : "";

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center p-3 sm:items-center" data-testid="presence-dialog-root">
      <div className="absolute inset-0 bg-slate-900/40 animate-in fade-in duration-200 motion-reduce:animate-none" aria-hidden />
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="presence-title"
        aria-describedby="presence-desc"
        data-testid="presence-dialog"
        data-phase={question ? "question" : "paused"}
        className="relative w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none"
      >
        <div className="flex items-center gap-3">
          <span className={`inline-flex size-10 items-center justify-center rounded-2xl ${question ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
            {question ? <BellRing className="size-5" /> : <Pause className="size-5" />}
          </span>
          <div className="min-w-0">
            <h2 id="presence-title" className="text-title font-bold text-slate-900">
              {heading}
            </h2>
            <p id="presence-desc" className="text-ui tabular-nums text-slate-600" data-testid="presence-countdown">
              {sub}
            </p>
          </div>
        </div>
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">
          {items.map((e) => (
            <li key={e.id} className="truncate rounded-xl bg-slate-50 px-3 py-1.5 text-body text-slate-700">
              {e.title || t("No title", "Bez názvu", "Nincs cím")}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {question ? (
            <>
              <button type="button" disabled={busy} onClick={() => void act(stopAll)} data-testid="presence-stop" className={`${BTN} bg-rose-600 text-white hover:bg-rose-700`}>
                <Square className="size-4 fill-current" />
                {t("Stop all", "Zastaviť všetko", "Mind leállítása")}
              </button>
              <button type="button" disabled={busy} onClick={() => void act(pauseAll)} data-testid="presence-pause" className={`${BTN} border border-slate-200 bg-white text-slate-700 hover:bg-slate-100`}>
                <Pause className="size-4 fill-current" />
                {t("Pause", "Pozastaviť", "Szünet")}
              </button>
              <button type="button" data-autofocus disabled={busy} onClick={() => void act(confirm)} data-testid="presence-confirm" className={`${BTN} bg-teal-600 text-white hover:bg-teal-700`}>
                {t("Still working", "Pracujem", "Dolgozom")}
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => void act(stopPaused)} data-testid="presence-stop" className={`${BTN} bg-rose-600 text-white hover:bg-rose-700`}>
                <Square className="size-4 fill-current" />
                {t("Stop", "Zastaviť", "Leállítás")}
              </button>
              <button type="button" data-autofocus disabled={busy} onClick={() => void act(resumeAll)} data-testid="presence-resume" className={`${BTN} bg-teal-600 text-white hover:bg-teal-700`}>
                <Play className="size-4 fill-current" />
                {t("Resume", "Pokračovať", "Folytatás")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
