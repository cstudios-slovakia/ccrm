/**
 * Guard (docs/TIME-TRACKING-V2.md D3.3): `time_entries.cost` and `time_entries.worked_ms` are written
 * by ccrm_tt_settle() in public/api/time_settle.php and nowhere else. A writer freezes the rate
 * (`cost_rate`, ...) and calls ccrm_tt_settle() / ccrm_tt_settle_rows() inside its transaction.
 *
 * Scans every PHP file under public/ (except vendor/) for SQL that writes either column on
 * `time_entries`, each statement read to its end (the next `;`):
 *   - UPDATE ... time_entries ... SET ... cost = / worked_ms =   (also multi-table: UPDATE a JOIN time_entries te SET te.cost)
 *   - INSERT / REPLACE INTO time_entries (... cost ... | ... worked_ms ...)
 *   - INSERT / REPLACE INTO time_entries SET ... cost =
 *   - ... ON DUPLICATE KEY UPDATE cost = / worked_ms =           (of an INSERT into time_entries)
 *   - an UPDATE of time_entries whose SET list is built in code (concatenation, implode, interpolation):
 *     the guard cannot read it, so it is refused outside the allowlist.
 * `cost_rate`, `labor_cost`, other tables and reads (SUM(`cost`), SELECT) do not match.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PUBLIC = join(ROOT, "public");

/** Files allowed to write the columns: the one write path, and the schema / migration that define and backfill them. */
const ALLOWED = new Set(["public/api/time_settle.php", "public/api/schema.php", "public/api/time_worked_ms_migration.php"]);

const COLUMN = String.raw`(?<![\w$>.'"])(?:\w+\.)?\x60?(cost|worked_ms)\x60?`;
/** `cost = ...` as an assignment: not `==`, not `=>`, not `$cost =`, not `cost_rate =`. */
const ASSIGN = new RegExp(`${COLUMN}\\s*=(?![=>])`, "i");
/** A bare column name in an INSERT column list. */
const LISTED = new RegExp(`${COLUMN}(?![\\w\x60])`, "i");
const TABLE = String.raw`\x60?time_entries\x60?(?![\w\x60])`;
const TABLE_RE = new RegExp(TABLE, "i");
/** A SET list assembled in PHP: a string closed and concatenated, implode(), or an interpolated variable. */
const BUILT = /["']\s*\.|\.\s*["']|\bimplode\s*\(|\{\$|\$\w+/;

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "vendor" || name === "node_modules" ? [] : walk(full);
    return name.endsWith(".php") ? [full] : [];
  });

const lineOf = (src, index) => src.slice(0, index).split("\n").length;
/** From $index to the end of the PHP statement. */
const statementAt = (src, index) => {
  const end = src.indexOf(";", index);
  return end === -1 ? src.slice(index) : src.slice(index, end);
};

/** Every write of `cost` / `worked_ms` on time_entries in one PHP source: [{ line, what }]. */
export const findCostWrites = (src) => {
  const out = [];
  const upd = /\bUPDATE\b/gi;
  for (let m; (m = upd.exec(src)); ) {
    const stmt = statementAt(src, m.index);
    // ON DUPLICATE KEY UPDATE is handled with its INSERT.
    if (/\bKEY\s+$/i.test(src.slice(Math.max(0, m.index - 12), m.index))) continue;
    const setAt = stmt.search(/\bSET\b/i);
    if (setAt === -1 || !TABLE_RE.test(stmt.slice(0, setAt))) continue;
    const setList = stmt.slice(setAt + 3);
    const hit = setList.match(ASSIGN);
    if (hit) {
      out.push({ line: lineOf(src, m.index), what: `UPDATE time_entries SET ${hit[1]} =` });
      continue;
    }
    const whereAt = setList.search(/\bWHERE\b/i);
    if (BUILT.test(whereAt === -1 ? setList : setList.slice(0, whereAt))) {
      out.push({ line: lineOf(src, m.index), what: "UPDATE time_entries with a SET list built in code" });
    }
  }
  const ins = new RegExp(String.raw`\b(?:INSERT(?:\s+IGNORE)?|REPLACE)\s+INTO\s+${TABLE}`, "gi");
  for (let m; (m = ins.exec(src)); ) {
    const stmt = statementAt(src, m.index);
    const rest = stmt.slice(m[0].length);
    const list = rest.match(/^\s*\(([^)]*)\)/);
    if (list) {
      const listed = list[1].match(LISTED);
      if (listed) out.push({ line: lineOf(src, m.index), what: `INSERT INTO time_entries (... ${listed[1]} ...)` });
    } else if (/^\s*SET\b/i.test(rest)) {
      const hit = rest.match(ASSIGN);
      if (hit) out.push({ line: lineOf(src, m.index), what: `INSERT INTO time_entries SET ${hit[1]} =` });
    }
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
  for (const file of walk(PUBLIC)) {
    const rel = relative(ROOT, file).split(sep).join("/");
    if (ALLOWED.has(rel)) continue;
    for (const f of findCostWrites(readFileSync(file, "utf8"))) offenders.push(`${rel}:${f.line}  ${f.what}`);
  }
  assert.deepEqual(offenders, [], `Write worked_ms / cost only through ccrm_tt_settle() (public/api/time_settle.php):\n${offenders.join("\n")}`);
});

test("the guard catches the shapes it is meant to catch", () => {
  const bad = [
    "$pdo->prepare(\"UPDATE `time_entries` SET `end_at` = ?, `cost` = ? WHERE `id` = ?\");",
    "$pdo->prepare('UPDATE time_entries SET cost = NULL WHERE id = ?');",
    "$pdo->exec(\"UPDATE `time_entries` te SET te.`worked_ms` = 5 WHERE 1\");",
    "$pdo->exec(\"UPDATE `projects` p JOIN `time_entries` te ON te.project_id = p.id SET te.cost = 0 WHERE p.id = ?\");",
    "$pdo->prepare(\"INSERT INTO `time_entries` (`id`, `cost_rate`, `cost`, `tags`) VALUES (?, ?, ?, '[]')\");",
    "$pdo->prepare(\"INSERT INTO time_entries (id, worked_ms) VALUES (?, ?)\");",
    "$pdo->prepare(\"INSERT INTO time_entries SET id = ?, cost = ?\");",
    "$pdo->prepare(\"INSERT INTO `time_entries` (`id`) VALUES (?) ON DUPLICATE KEY UPDATE `cost` = VALUES(`cost`)\");",
    "$pdo->prepare('UPDATE `time_entries` SET ' . implode(', ', $sets) . ' WHERE `id` = ?');",
    "$pdo->prepare(\"UPDATE time_entries SET {$sets} WHERE id = ?\");",
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
    "$pdo->prepare(\"UPDATE `time_entries` SET `note` = ? WHERE `id` = ?\")->execute([$note, $id]);",
  ];
  for (const src of fine) assert.deepEqual(findCostWrites(src), [], src);
});
