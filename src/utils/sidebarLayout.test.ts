import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSidebarGroups, flattenSidebarGroups } from "./sidebarLayout.ts";

test("normalizeSidebarGroups creates a default group when null is passed", () => {
  const items = ["dashboard", "tasks", "sai"];
  const groups = normalizeSidebarGroups(null, items);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, "group_main");
  assert.deepEqual(groups[0].items, items);
});

test("normalizeSidebarGroups preserves custom groups and assigns missing items", () => {
  const items = ["dashboard", "tasks", "sai", "projects"];
  const custom = [
    { id: "g1", title: "Operations", items: ["dashboard", "tasks"] },
    { id: "g2", title: "AI", items: ["sai"] }
  ];

  const groups = normalizeSidebarGroups(custom, items);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, "Operations");
  // 'projects' was missing from custom groups, so it gets appended to group 1
  assert.deepEqual(groups[0].items, ["dashboard", "tasks", "projects"]);
  assert.deepEqual(groups[1].items, ["sai"]);
});

test("normalizeSidebarGroups handles empty or corrupt group entries gracefully", () => {
  const items = ["leads", "clients"];
  const corrupt: any = [null, undefined, { invalid: true }, { id: "valid", title: "CRM", items: ["leads"] }];
  const groups = normalizeSidebarGroups(corrupt, items);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, "CRM");
  assert.deepEqual(groups[0].items, ["leads", "clients"]);
});

test("flattenSidebarGroups returns unique ordered item ids", () => {
  const groups = [
    { id: "g1", title: "Operations", items: ["dashboard", "tasks"] },
    { id: "g2", title: "AI", items: ["sai", "dashboard"] } // duplicate dashboard
  ];

  const flat = flattenSidebarGroups(groups);
  assert.deepEqual(flat, ["dashboard", "tasks", "sai"]);
});

