import type { Translate } from "./taskLabels.ts";

/** The one category in use so far. `Task.category` is a free slug so more can follow without a migration. */
export const TASK_CATEGORY_BUG = "bug";

export const isBugCategory = (category: string | null | undefined): boolean =>
  (category ?? "").toLowerCase() === TASK_CATEGORY_BUG;

/** "" = no category (the value a select holds for `null` / absent). */
export const taskCategoryLabel = (category: string | null | undefined, t: Translate): string => {
  if (isBugCategory(category)) return "Bug";
  const slug = (category ?? "").trim();
  return slug === "" ? t("No category", "Bez kategórie", "Nincs kategória") : slug;
};

export const taskCategoryOptions = (t: Translate): { value: string; label: string }[] => [
  { value: "", label: taskCategoryLabel("", t) },
  { value: TASK_CATEGORY_BUG, label: taskCategoryLabel(TASK_CATEGORY_BUG, t) },
];
