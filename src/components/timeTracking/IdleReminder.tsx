import { useEffect, useRef, useState } from "react";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { sendBrowserNotification } from "../../utils/browserNotifications";

/**
 * While a timer is running and the user has been idle for `idleReminderMinutes`,
 * show a dismissible banner. If notification permission was already granted, also
 * raise the existing browser notification. Never asks for permission, and never
 * fires when the timer is stopped or the setting is empty.
 */
export function IdleReminder() {
  const tt = useTimeTracking();
  const minutes = tt.settings.idleReminderMinutes;
  const running = tt.running;
  const [open, setOpen] = useState(false);
  const last = useRef(Date.now());
  const fired = useRef(false);
  const tRef = useRef(tt.t);
  tRef.current = tt.t;

  const runningId = running?.id ?? null;

  useEffect(() => {
    if (!runningId || minutes == null) {
      setOpen(false);
      fired.current = false;
      return;
    }
    last.current = Date.now();
    fired.current = false;
    setOpen(false);
    const bump = () => {
      last.current = Date.now();
      if (!fired.current) return;
      fired.current = false;
      setOpen(false);
    };
    const events = ["pointerdown", "keydown", "mousemove"] as const;
    for (const event of events) window.addEventListener(event, bump, { passive: true });
    const id = window.setInterval(() => {
      if (fired.current) return;
      if (Date.now() - last.current < minutes * 60_000) return;
      fired.current = true;
      const say = tRef.current;
      const title = say("Still working?", "Ešte pracujete?", "Még dolgozik?");
      const body = say(
        `The timer has had no activity for ${minutes} minutes.`,
        `Časovač nemal aktivitu ${minutes} minút.`,
        `Az időzítő ${minutes} perce nem észlelt tevékenységet.`,
      );
      sendBrowserNotification(title, { body, onClickUrl: "time-tracking" });
      setOpen(true);
    }, 15_000);
    return () => {
      window.clearInterval(id);
      for (const event of events) window.removeEventListener(event, bump);
    };
  }, [runningId, minutes]);

  if (!open || !running || minutes == null) return null;

  return (
    <div
      role="status"
      data-testid="idle-reminder"
      className="fixed inset-x-3 bottom-24 z-50 flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-xl ws-sm:bottom-4 ws-sm:left-auto ws-sm:right-4 ws-sm:max-w-sm"
    >
      <div className="min-w-0">
        <p className="type-label text-amber-900">{tt.t("Still working?", "Ešte pracujete?", "Még dolgozik?")}</p>
        <p className="mt-1 text-ui text-amber-800">
          {tt.t(
            `The timer has had no activity for ${minutes} minutes.`,
            `Časovač nemal aktivitu ${minutes} minút.`,
            `Az időzítő ${minutes} perce nem észlelt tevékenységet.`,
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-ui font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer"
      >
        {tt.t("Dismiss", "Zavrieť", "Bezárás")}
      </button>
    </div>
  );
}
