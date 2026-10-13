import test from "node:test";
import assert from "node:assert/strict";
import { canViewWidget, queryRequirements } from "./dashboardSources.ts";

const access = (keys: string[], isAdmin = false) => ({ can: (k: string) => keys.includes(k), isAdmin });
const preset = (action: string) => ({ query: { action, params: {} } });
const sql = (text: string) => ({ query: { action: "sql", params: { sql: text } } });

test("a preset needs the module it reads; leads and clients are either-or", () => {
  assert.equal(canViewWidget(preset("leads_count"), access(["leads"])), true);
  assert.equal(canViewWidget(preset("leads_count"), access(["clients"])), true);
  assert.equal(canViewWidget(preset("leads_count"), access(["tasks"])), false);
  assert.equal(canViewWidget(preset("recent_tasks"), access(["tasks"])), true);
  assert.equal(canViewWidget(preset("recent_meetings"), access(["tasks"])), false);
});

test("raw SQL needs a view of EVERY module whose table it names", () => {
  assert.equal(canViewWidget(sql("SELECT COUNT(*) FROM leads"), access(["leads"])), false);
  assert.equal(canViewWidget(sql("SELECT COUNT(*) FROM leads"), access(["leads", "clients"])), true);
  assert.equal(canViewWidget(sql("SELECT status, COUNT(*) FROM tasks GROUP BY status"), access(["tasks"])), false);
  assert.equal(canViewWidget(sql("SELECT status FROM tasks"), access(["tasks", "tasks.view_all"])), true);
  assert.equal(canViewWidget(sql("SELECT * FROM leads l JOIN projects p ON p.lead_id = l.id"), access(["leads", "clients"])), false);
});

test("indexed mail is Admin-only in raw SQL", () => {
  assert.equal(canViewWidget(sql("SELECT subject FROM rag_emails"), access(["email"])), false);
  assert.equal(canViewWidget(sql("SELECT subject FROM rag_emails"), access([], true)), true);
});

test("every tab of a tabs widget counts", () => {
  const tabs = { tabs: [{ query: { action: "leads_count" } }, { query: { action: "recent_meetings" } }] };
  assert.equal(canViewWidget(tabs, access(["leads"])), false);
  assert.equal(canViewWidget(tabs, access(["leads", "meetings"])), true);
});

test("a widget with no query, an unknown action or no access object is not hidden", () => {
  assert.equal(canViewWidget({ type: "summary" }, access([])), true);
  assert.equal(canViewWidget(preset("something_new"), access([])), true);
  assert.equal(canViewWidget(preset("leads_count"), undefined), true);
});

test("requirements of an empty or odd query are empty", () => {
  assert.deepEqual(queryRequirements(null), []);
  assert.deepEqual(queryRequirements({ action: "sql", params: { sql: "SELECT 1" } }), []);
});
