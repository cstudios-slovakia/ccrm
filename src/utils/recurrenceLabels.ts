/**
 * Labels for the "Custom → repeat every [N] [unit]" row shared by recurring
 * tasks and recurring finance movements.
 *
 * Slovak inflects by count (každý deň / každé 3 dni / každých 5 dní); Hungarian
 * puts the unit as an adverb after the number (3 hetente), so it never changes.
 */

export type RecurrenceUnit = "daily" | "weekly" | "monthly" | "yearly";

type Translate = (en: string, sk: string, hu: string) => string;

/** "Repeat every" / "Opakovať každé" / "Ismétlés" — the label above the row. */
export function repeatEveryLabel(n: number, t: Translate): string {
  return t("Repeat every", n === 1 ? "Opakovať každý" : n < 5 ? "Opakovať každé" : "Opakovať každých", "Ismétlés");
}

const UNIT_FORMS: Record<RecurrenceUnit, { en: [string, string]; sk: [string, string, string]; hu: string }> = {
  daily: { en: ["day", "days"], sk: ["deň", "dni", "dní"], hu: "naponta" },
  weekly: { en: ["week", "weeks"], sk: ["týždeň", "týždne", "týždňov"], hu: "hetente" },
  monthly: { en: ["month", "months"], sk: ["mesiac", "mesiace", "mesiacov"], hu: "havonta" },
  yearly: { en: ["year", "years"], sk: ["rok", "roky", "rokov"], hu: "évente" },
};

/** The unit word that reads right after `n`: "3 weeks", "3 týždne", "3 hetente". */
export function recurrenceUnitLabel(unit: RecurrenceUnit, n: number, t: Translate): string {
  const forms = UNIT_FORMS[unit];
  return t(
    n === 1 ? forms.en[0] : forms.en[1],
    n === 1 ? forms.sk[0] : n < 5 ? forms.sk[1] : forms.sk[2],
    forms.hu
  );
}

/** Dropdown options for the unit select, worded for the current count. */
export function recurrenceUnitOptions(
  units: readonly RecurrenceUnit[],
  n: number,
  t: Translate
): { value: RecurrenceUnit; label: string }[] {
  return units.map((unit) => ({ value: unit, label: recurrenceUnitLabel(unit, n, t) }));
}
