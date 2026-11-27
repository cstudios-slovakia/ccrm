/** Numbers for the results view (docs/NEWSLETTER.md C12). Pure. */
import type { Counts } from "./types";

/** Minutes left while sending: the queue divided by the hourly limit. `null` when nothing is queued or the limit is unusable. */
export const minutesLeft = (counts: Pick<Counts, "queued">, perHourLimit: number): number | null => {
  if (counts.queued <= 0 || !(perHourLimit > 0)) return null;
  return Math.max(1, Math.ceil((counts.queued / perHourLimit) * 60));
};

/** "about 12 min" / "about 2 h 10 min", in the UI language. */
export const formatDuration = (minutes: number, t: (en: string, sk: string, hu: string) => string): string => {
  if (minutes < 60) return t(`about ${minutes} min`, `približne ${minutes} min`, `körülbelül ${minutes} perc`);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hm = (unit: string) => (m ? `${h} ${unit} ${m} min` : `${h} ${unit}`);
  return t(`about ${hm("h")}`, `približne ${hm("h")}`, `körülbelül ${hm("óra")}`);
};

/** Poll while the campaign is sending and the tab is visible (C10 triggers). */
export const shouldPoll = (status: string, visibility: string): boolean => status === "sending" && visibility === "visible";
