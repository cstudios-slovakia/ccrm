import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { addTaskState, doneTaskState, isDoneMarkerState, isDoneTaskState } from "./projectTasks.ts";

/*
  "Is this task done?" has one rule per language: isDoneTaskState() in
  src/utils/projectTasks.ts and ccrm_task_status_is_done() in
  public/api/task_done.php. Before they existed the rule was copied into ~9
  readers, they drifted (a case-insensitive copy with hard-coded "hotovo"/"kész",
  a SQL copy, and a call to a PHP helper that was never defined, so SK/HU installs
  sent no completion mail and never auto-resolved tickets). This file pins the
  rule and fails when a new copy of "last entry of the task-state list" appears.
*/

const SK = ["Nový", "Prebieha", "Blokovaný", "Hotovo"];

test("the literal 'done' (any case) and the configured done state are done", () => {
  assert.equal(isDoneTaskState("done", SK), true);
  assert.equal(isDoneTaskState("Done", SK), true);
  assert.equal(isDoneTaskState("Hotovo", SK), true);
  assert.equal(isDoneTaskState("Blokovaný", SK), false);
  assert.equal(isDoneTaskState("", SK), false);
  assert.equal(isDoneTaskState("Hotovo", []), false);
});

test("adding a state keeps the done state done: the new one goes in before it", () => {
  const next = addTaskState(SK, "Fakturované");
  assert.deepEqual(next, ["Nový", "Prebieha", "Blokovaný", "Fakturované", "Hotovo"]);
  assert.equal(isDoneTaskState("Hotovo", next), true);
  assert.equal(isDoneTaskState("Fakturované", next), false);
  assert.deepEqual(addTaskState([], "New"), ["New"]);
});

test("the done state cannot be deleted while another state exists, so 'Blocked' never becomes done", () => {
  assert.equal(isDoneMarkerState("Hotovo", SK), true);
  assert.equal(isDoneMarkerState("Blokovaný", SK), false);
  assert.equal(isDoneMarkerState("Hotovo", ["Hotovo"]), false); // the last-one-left guard handles this case
});

test("finishing a task moves it to the first done state in the list", () => {
  assert.equal(doneTaskState(SK), "Hotovo");
  assert.equal(doneTaskState(["To do", "Done", "Archived"]), "Done");
  assert.equal(doneTaskState([]), "Done");
});

// ------------------------------------------------------------------ guard

const ROOT = process.cwd();
const RULE_FILES = new Set([
  path.join("public", "api", "task_done.php"),
  path.join("src", "utils", "projectTasks.ts"),
]);
// A one-shot migration that already ran on every install; it keeps its own copy
// on purpose so schema.php (fingerprinted) does not have to load another file.
const ALLOWED = new Set([path.join("public", "api", "schema.php")]);

const PHP_LAST_STATE = /end\(\s*\$\w*states\s*\)/gi;
const TS_LAST_STATE = /\b(\w*[sS]tates)\[\s*\1\.length\s*-\s*1\s*\]/g;

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "demo_seed") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.name.endsWith(e)) && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

export function scanForDoneRuleCopies(content: string, pattern: RegExp): number[] {
  const lines: number[] = [];
  const re = new RegExp(pattern.source, pattern.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) lines.push(content.slice(0, m.index).split("\n").length);
  return lines;
}

test("no reader keeps its own copy of 'last task state = done'", () => {
  const findings: string[] = [];
  const scan = (dir: string, exts: string[], pattern: RegExp) => {
    for (const file of walk(path.join(ROOT, dir), exts)) {
      const rel = path.relative(ROOT, file);
      if (RULE_FILES.has(rel) || ALLOWED.has(rel)) continue;
      for (const line of scanForDoneRuleCopies(fs.readFileSync(file, "utf8"), pattern)) findings.push(`${rel}:${line}`);
    }
  };
  scan("public", [".php"], PHP_LAST_STATE);
  scan("src", [".ts", ".tsx"], TS_LAST_STATE);
  assert.deepEqual(
    findings,
    [],
    `Use isDoneTaskState/doneTaskState (projectTasks.ts) or ccrm_task_status_is_done/ccrm_task_done_state (api/task_done.php):\n  ${findings.join("\n  ")}`,
  );
});

test("the guard catches both spellings", () => {
  assert.deepEqual(scanForDoneRuleCopies("$last = end($taskStates);", PHP_LAST_STATE), [1]);
  assert.deepEqual(scanForDoneRuleCopies("x\nconst l = taskStates[taskStates.length - 1];", TS_LAST_STATE), [2]);
  assert.deepEqual(scanForDoneRuleCopies("const l = items[items.length - 1];", TS_LAST_STATE), []);
});
