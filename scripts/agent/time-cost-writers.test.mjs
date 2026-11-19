/**
 * Guard (docs/TIME-TRACKING-V2.md D3.3): `time_entries.cost` and `time_entries.worked_ms` are written
 * by ccrm_tt_settle() in public/api/time_settle.php and nowhere else. A writer freezes the rate
 * (`cost_rate`, ...) and calls ccrm_tt_settle() / ccrm_tt_settle_rows() inside its transaction.
 *
 * Scans every PHP file under public/api for SQL that writes either column on `time_entries`:
 *   - UPDATE time_entries ... SET ... cost = / worked_ms =      (up to WHERE or the end of the statement)
 *   - INSERT / REPLACE INTO time_entries (... cost ... | ... worked_ms ...)
 *   - ... ON DUPLICATE KEY UPDATE cost = / worked_ms =          (of an INSERT into time_entries)
 * `cost_rate`, `labor_cost`, other tables and reads (SUM(`cost`), SELECT) do not match.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const API = join(ROOT, "public", "api");

/** Files allowed to write the columns: the one write path, and the schema / migration that define and backfill them. */
const ALLOWED = new Set(["time_settle.php", "schema.php", "time_worked_ms_migration.php"]);

const COLUMN = String.raw`(?<![\w$>.'"])(?:\w+\.)?\x60?(cost|worked_ms)\x60?`;
/** `cost = ...` as an assignment in a SET list: not `==`, not `=>`, not `$cost =`, not `cost_rate =`. */
const ASSIGN = new RegExp(`${COLUMN}\\s*=(?![=>])`, "i");
/** A bare column name in an INSERT column list. */
const LISTED = new RegExp(`${COLUMN}(?![\\w\x60])`, "i");
const TABLE = String.raw`\x60?time_entries\x60?(?![\w\x60])`;

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : name.endsWith(".php") ? [full] : [];
  });

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

/** Every write of `cost` / `worked_ms` on time_entries in one PHP source: [{ line, what }]. */
export const findCostWrites = (src) => {
  const out = [];
  const upd = new RegExp(String.raw`\bUPDATE\s+${TABLE}`, "gi");
  for (let m; (m = upd.exec(src)); ) {
    const rest = src.slice(m.index);
    const stop = rest.search(/\bWHERE\b|;/i);
    const set = stop === -1 ? rest : rest.slice(0, stop);
    const hit = set.match(ASSIGN);
    if (hit) out.push({ line: lineOf(src, m.index), what: `UPDATE time_entries SET ${hit[1]} =` });
  }
  const ins = new RegExp(String.raw`\b(?:INSERT(?:\s+IGNORE)?|REPLACE)\s+INTO\s+${TABLE}\s*\(([^)]*)\)`, "gi");
  for (let m; (m = ins.exec(src)); ) {
    const listed = m[1].match(LISTED);
    if (listed) out.push({ line: lineOf(src, m.index), what: `INSERT INTO time_entries (... ${listed[1]} ...)` });
    const rest = src.slice(m.index);
    const end = rest.indexOf(";");
    const stmt = end === -1 ? rest : rest.slice(0, end);
    const dup = stmt.search(/\bON\s+DUPLICATE\s+KEY\s+UPDATE\b/i);
    if (dup !== -1) {
      const hit = stmt.slice(dup).match(ASSIGN);
      if (hit) out.push({ line: lineOf(src, m.index), what: `ON DUPLICATE KEY UPDATE ${hit[1]} =` });
    }
  }
  return out;
};

test("only time_settle.php writes time_entries.cost / worked_ms (D3.3)", () => {
  const offenders = [];
  for (const file of walk(API)) {
    if (ALLOWED.has(file.split(sep).pop())) continue;
    for (const f of findCostWrites(readFileSync(file, "utf8"))) {
      offenders.push(`${relative(ROOT, file).split(sep).join("/")}:${f.line}  ${f.what}`);
    }
  }
  assert.deepEqual(offenders, [], `Write worked_ms / cost only through ccrm_tt_settle() (public/api/time_settle.php):\n${offenders.join("\n")}`);
});

test("the guard catches the shapes it is meant to catch", () => {
  const bad = [
    "$pdo->prepare(\"UPDATE `time_entries` SET `end_at` = ?, `cost` = ? WHERE `id` = ?\");",
    "$pdo->prepare('UPDATE time_entries SET cost = NULL WHERE id = ?');",
    "$pdo->exec(\"UPDATE `time_entries` te SET te.`worked_ms` = 5 WHERE 1\");",
    "$pdo->prepare(\"INSERT INTO `time_entries` (`id`, `cost_rate`, `cost`, `tags`) VALUES (?, ?, ?, '[]')\");",
    "$pdo->prepare(\"INSERT INTO time_entries (id, worked_ms) VALUES (?, ?)\");",
    "$pdo->prepare(\"INSERT INTO `time_entries` (`id`) VALUES (?) ON DUPLICATE KEY UPDATE `cost` = VALUES(`cost`)\");",
  ];
  for (const src of bad) assert.equal(findCostWrites(src).length, 1, src);
});

test("the guard ignores cost_rate, other tables, other columns and reads", () => {
  const fine = [
    "$pdo->prepare(\"UPDATE `time_entries` SET `cost_rate` = ?, `cost_rate_source` = ? WHERE `id` = ? AND `cost` IS NULL\");",
    "$pdo->prepare(\"INSERT INTO `time_entries` (`id`, `cost_rate`, `cost_rate_basis_days`) VALUES (?, ?, ?)\");",
    "$pdo->prepare(\"UPDATE `orders` SET `cost` = ? WHERE `id` = ?\");",
    "$pdo->prepare(\"UPDATE `time_entries_archive` SET `cost` = ? WHERE `id` = ?\");",
    "$pdo->prepare(\"UPDATE `projects` SET `labor_cost` = ? WHERE `id` = ?\");",
    "$pdo->query(\"SELECT SUM(`cost`) AS `cost` FROM `time_entries` WHERE `cost` = 0\");",
    "$pdo->prepare(\"UPDATE `time_entries` SET `deleted_at` = NULL WHERE `id` = ?\")->execute([$id]); $cost = 5;",
    "$x = ['cost' => $price['cost']]; $pdo->prepare(\"UPDATE time_entries SET note = ? WHERE id = ?\");",
  ];
  for (const src of fine) assert.deepEqual(findCostWrites(src), [], src);
});
