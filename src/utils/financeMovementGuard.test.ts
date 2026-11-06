/**
 * Guard: a recurring rule's row is not a movement of money.
 *
 * Its payments are stored rows of their own (`recurringRuleDeletion.ts`), so a
 * reader that sums records with the raw status split (`splitRecordAmounts`,
 * PHP `mcp_fin_split`) counts the rule once more next to them (stored-vs-derived
 * audit, finance #4 / CRM S5-3). Outside Finance's own tables, which handle a
 * rule row explicitly, sums go through `movementAmounts` / `mcp_fin_movement_split`.
 * The finance counterpart of `recurringTaskGuard.test.ts`.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const walk = (dir: string, keep: (name: string) => boolean): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, keep);
    return entry.isFile() && keep(entry.name) ? [full] : [];
  });

const callSites = (file: string, needle: RegExp) =>
  fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((text, i) => ({ file: path.relative(process.cwd(), file).replace(/\\/g, "/"), line: i + 1, text }))
    .filter(({ text }) => needle.test(text) && !/^\s*(\/\/|\*|#)/.test(text) && !/\bfunction\s/.test(text));

/** Modules that draw a rule row on their own terms (claimed / uncounted / own-row charge). */
const TS_ALLOWED = new Set([
  "src/utils/financialOverviewTable.ts",
  "src/utils/futureMovements.ts",
  "src/utils/pastRecurringCharges.ts",
  "src/components/FinancialManagementView.tsx"
]);

test("outside Finance's own tables, records are summed with movementAmounts, not splitRecordAmounts", () => {
  const files = walk(path.resolve(process.cwd(), "src"), (n) => /\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n));
  const leaks = files
    .flatMap((f) => callSites(f, /\bsplitRecordAmounts\(/))
    .filter((site) => !TS_ALLOWED.has(site.file));
  assert.deepEqual(
    leaks.map((s) => `${s.file}:${s.line}`),
    [],
    "use movementAmounts() (financialOverviewTable.ts): a recurring rule row is not one more movement"
  );
});

test("PHP readers outside the finance port sum records with mcp_fin_movement_split", () => {
  const files = walk(path.resolve(process.cwd(), "public"), (n) => n.endsWith(".php"));
  const leaks = files
    .flatMap((f) => callSites(f, /\bmcp_fin_split\(/))
    // mcp_ext.php is the port of financialOverviewTable.ts itself; a call on a
    // row it builds as a one-off says so on the same line.
    .filter((site) => !site.file.endsWith("public/api/mcp_ext.php") && !site.text.includes("'isRecurring' => false"));
  assert.deepEqual(
    leaks.map((s) => `${s.file}:${s.line}`),
    [],
    "use mcp_fin_movement_split(): a recurring rule row is not one more movement"
  );
});

test("project billing and the MCP project tools go through the movement split", () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
  assert.match(read("src/utils/projectBilling.ts"), /movementAmounts\(r\)/);
  const mcpExt = read("public/api/mcp_ext.php");
  const billing = mcpExt.slice(mcpExt.indexOf("function mcp_project_billing"), mcpExt.indexOf("function mcp_projects_ctx"));
  assert.match(billing, /mcp_fin_movement_split\(/);
  assert.doesNotMatch(read("public/api/mcp.php"), /\$where = \["type = 'expense'"\];/);
});
