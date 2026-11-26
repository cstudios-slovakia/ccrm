/** How often an open side panel re-reads the running timers, so a timer started in the app shows up without reopening it. */
export const LIVE_REFRESH_MS = 10_000;

/** What the panel shows from a `running` answer: changes when a timer starts, stops, pauses or the check-in moves. */
export function runningFingerprint(res: any): string {
  const running: any[] = Array.isArray(res?.running) ? res.running : res?.entry?.running ? [res.entry] : [];
  const paused: any[] = Array.isArray(res?.paused) ? res.paused : [];
  return JSON.stringify([
    running.map((e) => [e?.id ?? "", e?.startAt ?? "", e?.title ?? "", e?.projectName ?? "", e?.taskId ?? ""]),
    paused.map((e) => e?.id ?? ""),
    res?.presence?.phase ?? null,
    res?.presence?.deadlineAt ?? null,
  ]);
}
