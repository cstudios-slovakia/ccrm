/** Picks the string for the active language; every caller already has one of these. */
export type Translate = (en: string, sk: string, hu: string) => string;

/** Priority label (low/medium/high) — matches the Tasks filter dropdown wording. */
export const taskPriorityLabel = (prio: string, t: Translate): string => {
  switch ((prio || "").toLowerCase()) {
    case "high":
      return t("High", "Vysoká", "Magas");
    case "medium":
      return t("Medium", "Stredná", "Közepes");
    case "low":
      return t("Low", "Nízka", "Alacsony");
    default:
      return prio;
  }
};

/**
 * Task-state label — translates the canonical default states; falls back to
 * the raw value for any custom states configured in Settings.
 */
export const taskStateLabel = (st: string, t: Translate): string => {
  switch ((st || "").toLowerCase()) {
    case "new":
      return t("New", "Nové", "Új");
    case "in progress":
      return t("In progress", "Prebieha", "Folyamatban");
    case "blocked":
      return t("Blocked", "Blokované", "Blokkolva");
    case "done":
      return t("Done", "Hotovo", "Kész");
    default:
      return st;
  }
};
