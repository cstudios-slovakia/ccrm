import test from "node:test";
import assert from "node:assert/strict";
import { getPanelI18n } from "./panelI18n.ts";

test("getPanelI18n returns translations for en, sk, hu with all top-level sections", () => {
  for (const lang of ["en", "sk", "hu"]) {
    const t = getPanelI18n(lang);
    assert.ok(t.summary, `Missing summary in ${lang}`);
    assert.ok(t.tasks, `Missing tasks in ${lang}`);
    assert.ok(t.taskUpdate, `Missing taskUpdate in ${lang}`);
    assert.ok(t.crmLink, `Missing crmLink in ${lang}`);

    // Verify time windows
    assert.ok(t.summary.windows.today);
    assert.ok(t.summary.windows.d3);
    assert.ok(t.summary.windows.d7);
    assert.ok(t.summary.windows.d30);
    assert.ok(t.summary.windows.recent);
    assert.ok(t.summary.windows.custom);

    // Verify dynamic functions
    assert.ok(t.summary.cachedAgo(5, 12).includes("5"));
    assert.ok(t.tasks.dueOn("2026-11-01").includes("2026-11-01"));
    assert.ok(t.tasks.assignee("Peter").includes("Peter"));
    assert.ok(t.taskUpdate.partial(2).includes("2"));
    assert.ok(t.crmLink.ambiguousClient(3).includes("3"));
    assert.ok(t.crmLink.ambiguousLead(4).includes("4"));
  }
});

test("getPanelI18n falls back gracefully to en for unknown languages", () => {
  const t = getPanelI18n("de");
  assert.equal(t.summary.title, "AI Summary");
});
