import test from "node:test";
import assert from "node:assert/strict";
import {
  applySettingsToQuery,
  settingsOfWidget,
  visibleColumnsOf,
  buildDefaultHomeDashboard,
  presetOfWidget
} from "./dashboardWidgets.ts";

test("applySettingsToQuery updates query params for leads_by_status, pipeline_value and tasks_summary", () => {
  const leadsWidget = {
    id: "w1",
    query: { action: "leads_by_status", params: {} },
    settings: {}
  };
  const updatedLeads = applySettingsToQuery(leadsWidget, { statuses: ["new", "contacted"] });
  assert.deepEqual(updatedLeads.query.params.statuses, ["new", "contacted"]);
  assert.deepEqual(updatedLeads.settings.statuses, ["new", "contacted"]);

  const pipelineWidget = {
    id: "w2",
    query: { action: "pipeline_value", params: {} },
    settings: {}
  };
  const updatedPipeline = applySettingsToQuery(pipelineWidget, { statuses: ["offer sent"] });
  assert.deepEqual(updatedPipeline.query.params.statuses, ["offer sent"]);
  assert.deepEqual(updatedPipeline.settings.statuses, ["offer sent"]);

  const tasksSummaryWidget = {
    id: "w3",
    query: { action: "tasks_summary", params: {} },
    settings: {}
  };
  const updatedTasksSummary = applySettingsToQuery(tasksSummaryWidget, { statuses: ["In progress"] });
  assert.deepEqual(updatedTasksSummary.query.params.statuses, ["In progress"]);
  assert.deepEqual(updatedTasksSummary.settings.statuses, ["In progress"]);
});

test("applySettingsToQuery supports explicit __none__ status without collapsing", () => {
  const tableWidget = {
    id: "w_leads",
    query: { action: "recent_leads", params: { limit: 5 } },
    settings: { rows: 5, order: "recent", statuses: [] }
  };
  const updated = applySettingsToQuery(tableWidget, { rows: 10, order: "value", statuses: ["__none__"] });
  assert.deepEqual(updated.query.params.statuses, ["__none__"]);
  assert.equal(updated.query.params.limit, 10);
  assert.equal(updated.query.params.order, "value");
  assert.deepEqual(updated.settings.statuses, ["__none__"]);
});

test("applySettingsToQuery configures recent_tasks with scope and statuses", () => {
  const taskWidget = {
    id: "w_tasks",
    query: { action: "recent_tasks", params: { limit: 5 } },
    settings: { rows: 5, order: "created", scope: "team", statuses: [] }
  };
  const updated = applySettingsToQuery(
    taskWidget,
    { rows: 8, order: "deadline", scope: "mine", statuses: ["In progress", "Blocked"] },
    "Ada Admin"
  );
  assert.equal(updated.query.params.limit, 8);
  assert.equal(updated.query.params.order, "deadline");
  assert.equal(updated.query.params.owner, "Ada Admin");
  assert.deepEqual(updated.query.params.statuses, ["In progress", "Blocked"]);
});

test("settingsOfWidget preserves custom settings over preset defaults", () => {
  const home = buildDefaultHomeDashboard();
  const recentLeads = home.layout.widgets.find((w: any) => w.query?.action === "recent_leads");
  assert.ok(recentLeads);

  const defaults = settingsOfWidget(recentLeads);
  assert.equal(defaults.rows, 5);
  assert.equal(defaults.order, "recent");

  const modified = { ...recentLeads, settings: { ...defaults, rows: 10, order: "value", statuses: ["won"] } };
  const readBack = settingsOfWidget(modified);
  assert.equal(readBack.rows, 10);
  assert.equal(readBack.order, "value");
  assert.deepEqual(readBack.statuses, ["won"]);
});

test("visibleColumnsOf includes locked columns and preserves catalogue order", () => {
  const home = buildDefaultHomeDashboard();
  const recentTasks = home.layout.widgets.find((w: any) => w.query?.action === "recent_tasks");
  assert.ok(recentTasks);

  const cols = visibleColumnsOf(recentTasks);
  assert.ok(cols.includes("task")); // locked
  assert.ok(cols.includes("deadline"));
});
