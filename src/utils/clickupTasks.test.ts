import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { excludeClickUpTasks, groupTasksWithSubtasks, isClickUpTask } from "./clickupTasks.ts";
import { countBadgeTasks } from "./taskBadge.ts";
import { buildProjectBreakdown, EMPTY_BREAKDOWN_TIME } from "./projectBreakdown.ts";
import { DEFAULT_TICKET_STATUS_DEFS } from "./tickets.ts";
import type { Lead, Project, ProjectType, Task, UserProfile } from "../types";

const TASK_STATES = ["New", "In progress", "Blocked", "Done"];

const mkTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  description: "",
  status: "New",
  priority: "medium",
  deadline: "2026-11-23",
  owner: "Erik Putz",
  assignedUsers: ["Erik Putz"],
  ...overrides,
});

describe("ClickUp task mirror rules", () => {
  it("excludes ClickUp tasks from #tasks lists and app badge while keeping manual and WAAI tasks", () => {
    const manual = mkTask("t-1");
    const waai = mkTask("t-2", { externalSource: "waai", relatedProjectId: "p1" });
    const clickupParent = mkTask("cu-1", {
      externalSource: "clickup",
      relatedProjectId: "p1",
      clickupMeta: { clickupId: "abc", listId: "lst-1", listName: "Sprint 1", statusName: "to do", statusColor: "#87909e" },
    });
    const clickupSubtask = mkTask("cu-2", {
      externalSource: "clickup",
      relatedProjectId: "p1",
      parentTaskId: "cu-1",
      deadline: "2026-11-20", // overdue, yet must stay out of badge
    });

    assert.equal(isClickUpTask(clickupParent), true);
    assert.equal(isClickUpTask(waai), false);

    const visibleInTasksModule = excludeClickUpTasks([manual, waai, clickupParent, clickupSubtask]);
    assert.deepEqual(
      visibleInTasksModule.map((t) => t.id),
      ["t-1", "t-2"],
    );

    const badge = countBadgeTasks(
      [manual, waai, clickupParent, clickupSubtask],
      "Erik Putz",
      TASK_STATES,
      new Date("2026-11-23T10:00:00"),
    );
    assert.deepEqual(badge, { missed: 0, today: 2, total: 2 });
  });

  it("nests subtasks under same-bucket parents and attaches orphanParentTitle across buckets", () => {
    const closedParent = mkTask("cu-parent-closed", {
      title: "Landing Page",
      status: "Done",
      externalSource: "clickup",
      relatedProjectId: "p1",
    });
    const openSubOfClosedParent = mkTask("cu-sub-open", {
      title: "Fix mobile padding",
      status: "New",
      parentTaskId: "cu-parent-closed",
      externalSource: "clickup",
      relatedProjectId: "p1",
    });
    const openParent = mkTask("cu-parent-open", {
      title: "API Integration",
      status: "In progress",
      externalSource: "clickup",
      relatedProjectId: "p1",
    });
    const openSubOfOpenParent = mkTask("cu-sub-nested", {
      title: "Handle pagination",
      status: "New",
      parentTaskId: "cu-parent-open",
      externalSource: "clickup",
      relatedProjectId: "p1",
    });

    const all = [closedParent, openSubOfClosedParent, openParent, openSubOfOpenParent];
    const openBucket = [openSubOfClosedParent, openParent, openSubOfOpenParent];

    const groupedOpen = groupTasksWithSubtasks(openBucket, all);
    assert.equal(groupedOpen.length, 2);

    assert.equal(groupedOpen[0].task.id, "cu-sub-open");
    assert.equal(groupedOpen[0].subtasks.length, 0);
    assert.equal(groupedOpen[0].orphanParentTitle, "Landing Page");

    assert.equal(groupedOpen[1].task.id, "cu-parent-open");
    assert.deepEqual(
      groupedOpen[1].subtasks.map((s) => s.id),
      ["cu-sub-nested"],
    );
    assert.equal(groupedOpen[1].orphanParentTitle, undefined);
  });

  it("counts ClickUp tasks and subtasks in Project Breakdown KPIs and project/employee rows", () => {
    const leads: Lead[] = [
      {
        id: "client-1",
        name: "Acme Corp",
        city: "Bratislava",
        clientType: "business",
        status: "accepted",
        source: "website",
        owner: "Erik Putz",
        value: 0,
        createdAt: "2026-01-01",
      },
    ];
    const projectTypes: ProjectType[] = [{ id: "pt-1", name: "Web", icon: "Briefcase", attributes: [] }];
    const projects: Project[] = [
      { id: "p1", projectTypeId: "pt-1", name: "Acme Web", clientId: "client-1", status: "active", managers: ["Erik Putz"], data: {} },
    ];
    const users: UserProfile[] = [{ id: "u1", name: "Erik Putz", email: "erik@example.com", role: "Admin" }];
    const cuParent = mkTask("cu-p1", {
      externalSource: "clickup",
      relatedProjectId: "p1",
      relatedLeadId: "client-1",
      status: "Done",
      createdAt: "2026-11-20 09:00:00",
      firstStartedAt: "2026-11-20 10:00:00",
    });
    const cuSubtask = mkTask("cu-s1", {
      externalSource: "clickup",
      relatedProjectId: "p1",
      relatedLeadId: "client-1",
      parentTaskId: "cu-p1",
      status: "New",
      deadline: "2026-11-21",
      createdAt: "2026-11-20 09:00:00",
    });

    const breakdown = buildProjectBreakdown({
      projects,
      projectTypes,
      projectStatuses: [],
      leads,
      financialRecords: [],
      tasks: [cuParent, cuSubtask],
      taskStates: TASK_STATES,
      tickets: [],
      ticketStatuses: DEFAULT_TICKET_STATUS_DEFS,
      supportContracts: [],
      users,
      timeData: EMPTY_BREAKDOWN_TIME,
      defaultCurrency: "EUR",
      rights: { canSeeCosts: true, canSeeFinance: true, canSeeSalaries: true },
      today: "2026-11-23",
      nowStamp: "2026-11-23 12:00",
      nowMs: new Date("2026-11-23T12:00:00").getTime(),
    });

    assert.equal(breakdown.summary.totalTasksOpen, 1);
    assert.equal(breakdown.clients.length, 1);
    assert.equal(breakdown.clients[0].tasks.total, 2);
    assert.equal(breakdown.clients[0].tasks.open, 1);
    assert.equal(breakdown.clients[0].tasks.done, 1);
    assert.equal(breakdown.clients[0].tasks.overdue, 1);
    assert.equal(breakdown.clients[0].projects[0].employees[0].tasks.total, 2);
  });
});
