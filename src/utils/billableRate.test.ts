import test from "node:test";
import assert from "node:assert/strict";
import { resolveBillableRate } from "./billableRate.ts";

test("billable rate: the entry's own rate wins, including an explicit zero", () => {
  assert.deepEqual(resolveBillableRate({ entryRate: 40, projectRate: 80, contract: { hourlyRate: 65 } }), { rate: 40, source: "entry" });
  assert.deepEqual(resolveBillableRate({ entryRate: 0, projectRate: 80 }), { rate: 0, source: "entry" });
});

test("billable rate: project, then contract hourly, then overage once the month is used, then price level, then none", () => {
  assert.deepEqual(resolveBillableRate({ projectRate: 90, contract: { hourlyRate: 65, monthlyHours: 10, usedHours: 10 } }), { rate: 90, source: "project" });
  assert.deepEqual(
    resolveBillableRate({ contract: { hourlyRate: 65, overageRate: 90, monthlyHours: 10, usedHours: 4 } }),
    { rate: 65, source: "contract" },
  );
  assert.deepEqual(
    resolveBillableRate({ contract: { hourlyRate: 65, overageRate: 90, monthlyHours: 10, usedHours: 10 } }),
    { rate: 90, source: "contract_overage" },
  );
  assert.deepEqual(resolveBillableRate({ priceLevelHourlyRate: 55 }), { rate: 55, source: "price_level" });
  assert.deepEqual(resolveBillableRate({ projectRate: 0, contract: { hourlyRate: 0 } }), { rate: null, source: "none" });
});
