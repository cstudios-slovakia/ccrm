import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Pins the call sites that write tasks.category outside the app. The behaviour itself is run by
// scripts/test-task-category-writes.php (docker); this keeps the wiring from being removed unnoticed.
const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

test("MCP create_task and update_task declare category and go through the one rule", () => {
  const mcp = read("public/api/mcp.php");
  const tool = (name: string) => {
    const from = mcp.indexOf(`'name' => '${name}'`);
    return mcp.slice(from, mcp.indexOf("'required'", from));
  };
  assert.match(tool("create_task"), /'category' => \['type' => 'string'/);
  assert.match(tool("update_task"), /'category' => \['type' => 'string'.*null or an empty string clears it; omitted leaves it unchanged/);
  const writes = read("public/api/mcp_ext_writes.php");
  assert.match(writes, /ccrm_task_category_checked\(\$args\)/);
  assert.equal((writes.match(/mcp_task_category_arg\(\$pdo, \$args\)/g) ?? []).length, 2);
});

test("MCP readers return category and only select the column when it exists", () => {
  const lists = read("public/api/mcp_lists_crm.php");
  assert.match(lists, /ccrm_tasks_have_category\(\$pdo\) \? 'category, ' : ''/);
  assert.equal((lists.match(/\['category'\] = \$(t|task)\['category'\] \?\? null/g) ?? []).length, 2);
});

test("integration push validates, merges and serialises category; the insert names it only when present", () => {
  const src = read("public/api/integration_tasks.php");
  assert.match(src, /ccrm_task_category_checked\(\$p\)/);
  assert.match(src, /\$bad\('category'/);
  assert.match(src, /\$in\['has_category'\] && ccrm_tasks_have_category\(\$pdo\)/);
  assert.match(src, /case 'category':\s+\$set\('category'/);
  assert.match(src, /\$withCategory \? ', `category`' : ''/);
  assert.match(src, /'category' => \$row\['category'\] \?\? null/);
});

test("the workflow engine writes the category through the same rule and tolerates a missing column", () => {
  const src = read("public/api/workflows_engine.php");
  assert.match(src, /ccrm_task_category_write\(\$nodeData\)\[0\]/);
  assert.match(src, /\$category !== null && ccrm_tasks_have_category\(\$pdo\)/);
  assert.match(src, /\$withCategory \? ', `category`' : ''/);
});

test("the workflow editor's Create task action has a Category field backed by taskCategoryOptions", () => {
  const src = read("src/components/AutomationView.tsx");
  assert.match(src, /updateActionField\("category", v\)/);
  assert.match(src, /options=\{taskCategoryOptions\(t\)\}/);
});

test("the machine API documents the field", () => {
  assert.match(read("docs/WAAI-INTEGRATION.md"), /\| `category` \| `category` \|/);
});
