/**
 * Which billable rate an entry freezes, in the order the module decided (C7.4).
 *
 * 1. The entry's own rate, when one was typed.
 * 2. The project's billable rate.
 * 3. The client's support contract: its hourly rate, or its overage rate once the
 *    monthly hours are already used.
 * 4. The price-level hourly rate, when the caller has one.
 * 5. None.
 *
 * Pure: the caller loads the project, the contract and the hours already used.
 * A zero or a missing number is "not set" and the next source is tried. An
 * entry rate of 0 is kept — someone set the work as free on purpose.
 */

export type BillableRateSource = "entry" | "project" | "contract" | "contract_overage" | "price_level" | "none";

export interface BillableContract {
  hourlyRate?: number | null;
  overageRate?: number | null;
  /** Hours included in the current period. 0 or absent means the overage rate is never used. */
  monthlyHours?: number | null;
  /** Billable hours already logged in the period, before this entry. */
  usedHours?: number | null;
}

export interface BillableRateInput {
  /** Set when the entry carries its own rate. `undefined` means "not given"; `null` means "cleared". */
  entryRate?: number | null;
  projectRate?: number | null;
  contract?: BillableContract | null;
  /** CCRM price levels are named warehouse lists and have no hourly rate today; pass one if a caller has it. */
  priceLevelHourlyRate?: number | null;
}

const positive = (n: number | null | undefined): number | null =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;

export const resolveBillableRate = (input: BillableRateInput): { rate: number | null; source: BillableRateSource } => {
  if (input.entryRate !== undefined && input.entryRate !== null && Number.isFinite(input.entryRate) && input.entryRate >= 0) {
    return { rate: Math.round(input.entryRate * 100) / 100, source: "entry" };
  }
  const project = positive(input.projectRate);
  if (project !== null) return { rate: project, source: "project" };

  const contract = input.contract;
  if (contract) {
    const monthly = Number(contract.monthlyHours ?? 0);
    const used = Number(contract.usedHours ?? 0);
    const over = monthly > 0 && used >= monthly;
    const rate = positive(over ? (contract.overageRate ?? contract.hourlyRate) : contract.hourlyRate);
    if (rate !== null) return { rate, source: over ? "contract_overage" : "contract" };
  }

  const level = positive(input.priceLevelHourlyRate);
  if (level !== null) return { rate: level, source: "price_level" };
  return { rate: null, source: "none" };
};
