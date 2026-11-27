import test from "node:test";
import assert from "node:assert/strict";
import { TIMESHEET_SOURCES, timesheetSourceSwitch } from "./timesheetSource.ts";

test("choosing CCRM does not hide Toggl, and choosing Toggl does not hide CCRM", () => {
  const toggl = timesheetSourceSwitch("toggl");
  const ccrm = timesheetSourceSwitch("ccrm");
  assert.equal(toggl.selected, "toggl");
  assert.equal(ccrm.selected, "ccrm");
  assert.deepEqual([...toggl.available], [...TIMESHEET_SOURCES]);
  assert.deepEqual([...ccrm.available], [...TIMESHEET_SOURCES]);
  assert.ok(toggl.available.includes("ccrm"));
  assert.ok(ccrm.available.includes("toggl"));
});
