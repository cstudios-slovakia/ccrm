/**
 * Class F of the undefined-symbol audit: SQL names the running database may not have.
 *
 * Works on the SQL string literals analyzeFile() collected (facts[].sql) plus a second pass
 * over the tokens for transactions. Only literal SQL is checked: a statement whose table or
 * column list is built at runtime (`{$table}`, implode($cols)) is skipped, not guessed.
 *
 *   buildSchemaModel(facts)      -> tables created/altered by schema.php and anywhere else
 *   findSqlNameIssues(facts, m)  -> INSERT/UPDATE/qualified columns and tables that exist nowhere
 *   findUnhealedSyncColumns(...) -> columns sync.php writes that a migration added but sync.php
 *                                   does not heal before beginTransaction() (the 4-place rule)
 *   findDdlInTransactions(...)   -> DDL reachable between beginTransaction() and commit()
 *   findMigrationOrder(...)      -> a migration touching a table before the migration creating it
 */
import { tokenize } from './php-symbol-audit.mjs';

const SCHEMA = 'public/api/schema.php';
const SQL_WORDS = new Set(`select from where and or not null is in on as join left right inner outer cross
using group by order having limit offset set values value into update delete insert replace ignore
duplicate key distinct case when then else end exists like between asc desc union all interval
dual lateral straight_join natural for share lock mode`.split(/\s+/));

const DDL_RE = /^\s*(?:\/\*.*?\*\/\s*)?(ALTER\s+TABLE|CREATE\s+(?:TEMPORARY\s+)?TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX|DROP\s+(?:TABLE|INDEX)|RENAME\s+TABLE|TRUNCATE\s+(?:TABLE\s+)?`?[A-Za-z0-9_]+`?\s*$)/i;

const unq = (s) => s.replace(/`/g, '');
const dynamic = (s) => /\{\$|\$[A-Za-z_]/.test(s);

/** Columns declared in a CREATE TABLE body. */
function createTableColumns(sql) {
  const m = /CREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([A-Za-z0-9_]+)`?\s*\(([\s\S]*)$/i.exec(sql);
  if (!m) return null;
  const cols = new Set();
  for (const line of m[2].split(/\n|,(?=\s*`)/)) {
    const c = /^\s*`([A-Za-z0-9_]+)`\s+[A-Za-z]/.exec(line) || /^\s*([a-z_][a-z0-9_]*)\s+(?:VARCHAR|INT|BIGINT|TINYINT|SMALLINT|DECIMAL|TEXT|LONGTEXT|MEDIUMTEXT|DATE|DATETIME|TIMESTAMP|JSON|DOUBLE|FLOAT|CHAR|BLOB|LONGBLOB|ENUM|BOOLEAN|TIME|VECTOR)\b/i.exec(line);
    if (c) cols.add(c[1]);
  }
  return { table: m[1], cols };
}

/** Column effects of an ALTER TABLE statement. */
function alterEffects(sql) {
  const m = /ALTER\s+TABLE\s+`?([A-Za-z0-9_]+)`?\s+([\s\S]*)/i.exec(sql);
  if (!m) return null;
  const out = { table: m[1], add: [], drop: [], rename: [] };
  const body = m[2];
  for (const a of body.matchAll(/\bADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?`([A-Za-z0-9_]+)`/gi)) out.add.push(a[1]);
  for (const a of body.matchAll(/\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\b/gi)) out.add.push(a[1]);
  for (const a of body.matchAll(/\b(?:CHANGE)\s+(?:COLUMN\s+)?`?([A-Za-z0-9_]+)`?\s+`?([A-Za-z0-9_]+)`?/gi)) out.rename.push([a[1], a[2]]);
  for (const a of body.matchAll(/\bRENAME\s+COLUMN\s+`?([A-Za-z0-9_]+)`?\s+TO\s+`?([A-Za-z0-9_]+)`?/gi)) out.rename.push([a[1], a[2]]);
  for (const a of body.matchAll(/\bDROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?`([A-Za-z0-9_]+)`/gi)) out.drop.push(a[1]);
  return out;
}

/**
 * Where each table and column comes from.
 *   base      CREATE TABLE in ccrm_schema_statements() (fresh installs)
 *   migrated  ALTER ... ADD in schema.php migrations (existing installs)
 *   elsewhere CREATE/ALTER anywhere else (sync.php healing, endpoint self-healing, other DBs)
 */
export function buildSchemaModel(facts, sources = new Map()) {
  const tables = new Map();
  const t = (name) => {
    const k = name.toLowerCase();
    if (!tables.has(k)) tables.set(k, { name, created: [], base: new Set(), migrated: new Map(), elsewhere: new Map(), dropped: new Map() });
    return tables.get(k);
  };
  const add = (map, col, where) => { if (!map.has(col)) map.set(col, []); map.get(col).push(where); };
  // Also: ccrm_column_exists($pdo, 'table', 'col') guarding an ALTER that is built from variables.
  for (const f of facts) {
    for (const s of f.sql) {
      if (dynamic(s.text.split(/\(/)[0])) continue; // table name is a variable
      const where = { file: f.path, line: s.line, fn: s.fn };
      const inSchema = f.path === SCHEMA;
      if (/CREATE\s+(?:TEMPORARY\s+)?TABLE/i.test(s.text)) {
        const c = createTableColumns(s.text);
        if (!c) continue;
        const tb = t(c.table);
        tb.created.push({ ...where, base: inSchema && s.fn === 'ccrm_schema_statements' });
        for (const col of c.cols) {
          if (inSchema && s.fn === 'ccrm_schema_statements') tb.base.add(col);
          else if (inSchema) add(tb.migrated, col, where);
          else add(tb.elsewhere, col, where);
        }
      }
      for (const stmt of s.text.split(/;\s*(?=ALTER)/i)) {
        if (!/ALTER\s+TABLE/i.test(stmt)) continue;
        const a = alterEffects(stmt);
        if (!a) continue;
        const tb = t(a.table);
        for (const col of a.add) add(inSchema ? tb.migrated : tb.elsewhere, col, where);
        for (const [, to] of a.rename) add(inSchema ? tb.migrated : tb.elsewhere, to, where);
        for (const col of a.drop) add(tb.dropped, col, where);
      }
    }
  }
  // ALTER TABLE `t` ADD COLUMN `{$name}` inside foreach over a literal array of names.
  for (const f of facts) {
    if (!sources.has(f.path)) continue;
    const toks = tokenize(sources.get(f.path)).filter((x) => x.t !== 'comment');
    for (let i = 0; i < toks.length; i++) {
      const x = toks[i];
      if (x.t !== 'istr') continue;
      const m = /ALTER\s+TABLE\s+`([A-Za-z0-9_]+)`\s+ADD\s+(?:COLUMN\s+)?`?\{?\$/i.exec(x.v);
      if (!m) continue;
      const tb = t(m[1]);
      const inSchema = f.path === SCHEMA;
      for (const col of loopNames(toks, i)) add(inSchema ? tb.migrated : tb.elsewhere, col, { file: f.path, line: x.line, fn: null, loop: true });
    }
  }
  return { tables };
}

/** Names iterated by the foreach that encloses token i: literal keys/values, or those of `$var = [...]`. */
function loopNames(toks, i) {
  for (let j = i; j >= 0 && j > i - 400; j--) {
    if (!(toks[j].t === 'id' && toks[j].v.toLowerCase() === 'foreach')) continue;
    let k = j + 2;
    const expr = [];
    while (k < toks.length && !(toks[k].t === 'id' && toks[k].v.toLowerCase() === 'as')) expr.push(toks[k++]);
    let arr = expr;
    if (expr.length === 1 && expr[0].t === 'var') {
      arr = [];
      for (let q = j; q >= 0 && q > j - 400; q--) {
        const isAssign = toks[q].t === 'var' && toks[q].v === expr[0].v && toks[q + 1] && toks[q + 1].v === '='
          && toks[q + 2] && (toks[q + 2].v === '[' || toks[q + 2].v.toLowerCase() === 'array');
        if (!isAssign) continue;
        let depth = 0;
        for (let r = q + 2; r < toks.length; r++) {
          if (toks[r].v === '[' || toks[r].v === '(') depth++;
          if (toks[r].v === ']' || toks[r].v === ')') { depth--; if (depth === 0) break; }
          arr.push(toks[r]);
        }
        break;
      }
    }
    const hasKeys = arr.some((a) => a.t === 'op' && a.v === '=>');
    const out = [];
    for (let a = 0; a < arr.length; a++) {
      if (arr[a].t !== 'str') continue;
      if (hasKeys && !(arr[a + 1] && arr[a + 1].v === '=>')) continue;
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(arr[a].v)) out.push(arr[a].v);
    }
    return out;
  }
  return [];
}

export function knownColumns(model, table) {
  const tb = model.tables.get(table.toLowerCase());
  if (!tb) return null;
  return new Set([...tb.base, ...tb.migrated.keys(), ...tb.elsewhere.keys()]);
}

/** Pull the table/column references out of one literal SQL string. */
export function sqlReferences(text) {
  const refs = { tables: [], columns: [] };
  const sql = text.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/--[^\n]*/g, '');
  const tableRe = /\b(INTO|UPDATE|FROM|JOIN|TABLE(?:\s+IF\s+(?:NOT\s+)?EXISTS)?)\s+(`[A-Za-z0-9_]+`|[A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:AS\s+)?(`[A-Za-z0-9_]+`|[A-Za-z_][A-Za-z0-9_]*))?/gi;
  const aliases = new Map();
  for (const m of sql.matchAll(tableRe)) {
    // ON DUPLICATE KEY UPDATE `col` = ... is not a table
    if (m[1].toUpperCase() === 'UPDATE' && /KEY\s*$/i.test(sql.slice(Math.max(0, m.index - 6), m.index))) continue;
    const name = unq(m[2]);
    if (SQL_WORDS.has(name.toLowerCase()) || /^information_schema$/i.test(name)) continue;
    if (/^\$|\{/.test(name)) continue;
    // `FROM (SELECT ...)`, `INTO @var`, MySQL functions
    if (m[1].toUpperCase() === 'FROM' && /^(DUAL)$/i.test(name)) continue;
    refs.tables.push({ name, via: m[1].toUpperCase().split(/\s/)[0] });
    aliases.set(name.toLowerCase(), name);
    if (m[3] && !SQL_WORDS.has(unq(m[3]).toLowerCase())) aliases.set(unq(m[3]).toLowerCase(), name);
  }
  // INSERT INTO `t` (`a`, `b`)
  const ins = /\b(?:INSERT|REPLACE)\s+(?:IGNORE\s+)?INTO\s+`?([A-Za-z0-9_]+)`?\s*\(([^()]*)\)/i.exec(sql);
  if (ins) {
    for (const c of ins[2].split(',')) {
      const name = unq(c.trim());
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) refs.columns.push({ table: ins[1], col: name, kind: 'insert' });
    }
  }
  // ON DUPLICATE KEY UPDATE `a` = VALUES(`a`)
  // UPDATE `t` SET `a` = ?, b = ?
  const upd = /\bUPDATE\s+`?([A-Za-z0-9_]+)`?(?:\s+(?:AS\s+)?`?([A-Za-z0-9_]+)`?)?\s+SET\s+([\s\S]*?)(?:\bWHERE\b|$)/i.exec(sql);
  if (upd && !/\bJOIN\b/i.test(sql.slice(0, upd.index + upd[0].length))) {
    for (const m of upd[3].matchAll(/(?:^|,)\s*(?:`?[A-Za-z0-9_]+`?\.)?`?([A-Za-z_][A-Za-z0-9_]*)`?\s*=/g)) {
      refs.columns.push({ table: upd[1], col: m[1], kind: 'update' });
    }
  }
  // `alias`.`col` / alias.col where alias is a known table or alias
  for (const m of sql.matchAll(/(?<![A-Za-z0-9_`])`?([A-Za-z_][A-Za-z0-9_]*)`?\.`?([A-Za-z_][A-Za-z0-9_]*)`?/g)) {
    const table = aliases.get(m[1].toLowerCase());
    if (!table) continue;
    if (m[2] === '*') continue;
    refs.columns.push({ table, col: m[2], kind: 'qualified' });
  }
  return refs;
}

/** F-01/F-02: tables and columns that exist nowhere. */
export function findSqlNameIssues(facts, model, { ignoreTables = [] } = {}) {
  const out = [];
  const ignore = new Set(ignoreTables.map((s) => s.toLowerCase()));
  for (const f of facts) {
    for (const s of f.sql) {
      if (DDL_RE.test(s.text)) continue;
      const refs = sqlReferences(s.text);
      for (const r of refs.tables) {
        if (ignore.has(r.name.toLowerCase())) continue;
        if (!model.tables.has(r.name.toLowerCase())) {
          out.push({ kind: 'unknown-table', file: f.path, line: s.line, fn: s.fn, table: r.name, sql: s.text.slice(0, 160) });
        }
      }
      for (const c of refs.columns) {
        if (ignore.has(c.table.toLowerCase())) continue;
        const known = knownColumns(model, c.table);
        if (!known) continue;
        if (!known.has(c.col)) {
          out.push({ kind: 'unknown-column', file: f.path, line: s.line, fn: s.fn, table: c.table, column: c.col, via: c.kind, sql: s.text.slice(0, 160) });
        } else {
          const tb = model.tables.get(c.table.toLowerCase());
          if (!tb.base.has(c.col) && !tb.migrated.has(c.col)) {
            out.push({ kind: 'column-outside-schema', file: f.path, line: s.line, fn: s.fn, table: c.table, column: c.col, via: c.kind, addedAt: tb.elsewhere.get(c.col) });
          }
        }
      }
    }
  }
  return out;
}

/**
 * Token positions of `->beginTransaction()`, `->commit()`, `->rollBack()` and of every call,
 * per function, in one file.
 */
function transactionWalk(path, src) {
  const toks = tokenize(src).filter((t) => t.t !== 'comment');
  const events = [];
  let fnStack = [];
  let depth = 0;
  let pendingFn = null;
  // Depths of blocks opened by `if (!$pdo->inTransaction())`: DDL inside them never runs in a transaction.
  const txGuards = [];
  let guardNext = false;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'id' && t.v.toLowerCase() === 'function') {
      const n = toks[i + 1];
      pendingFn = n && n.t === 'id' ? n.v : '{closure}';
    }
    if (t.t === 'op' && t.v === '{') {
      depth++;
      if (guardNext) { txGuards.push(depth); guardNext = false; }
      if (pendingFn) { fnStack.push({ name: pendingFn, depth }); pendingFn = null; }
    } else if (t.t === 'op' && t.v === '}') {
      if (fnStack.length && fnStack[fnStack.length - 1].depth === depth) fnStack.pop();
      if (txGuards.length && txGuards[txGuards.length - 1] === depth) txGuards.pop();
      depth--;
    } else if (t.t === 'op' && t.v === ';' && pendingFn) {
      pendingFn = null;
    }
    const fn = fnStack.length ? fnStack[fnStack.length - 1].name : null;
    if (t.t === 'id' && t.v.toLowerCase() === 'intransaction' && toks[i - 3] && toks[i - 3].t === 'op' && toks[i - 3].v === '!') guardNext = true;
    if (txGuards.length) continue;
    const prev = toks[i - 1];
    if (t.t === 'id' && toks[i + 1] && toks[i + 1].t === 'op' && toks[i + 1].v === '(') {
      const method = prev && prev.t === 'op' && (prev.v === '->' || prev.v === '?->');
      const lower = t.v.toLowerCase();
      if (method && ['begintransaction', 'commit', 'rollback'].includes(lower)) {
        events.push({ type: lower, line: t.line, fn, depth, i });
      } else if (!method && !(prev && prev.t === 'id' && prev.v.toLowerCase() === 'function')) {
        events.push({ type: 'call', name: t.v.replace(/^\\/, ''), line: t.line, fn, depth, i });
      }
    }
    if ((t.t === 'str' || t.t === 'istr') && DDL_RE.test(t.v)) events.push({ type: 'ddl', line: t.line, fn, depth, i, text: t.v.slice(0, 120) });
  }
  return events;
}

/** F-04: DDL (direct, or through a project function that runs DDL) between begin and commit. */
export function findDdlInTransactions(facts, sources, index) {
  // Which project functions run DDL, transitively.
  const ddlFns = new Map(); // lower name -> reason
  const callsOf = new Map();
  const walks = new Map();
  for (const f of facts) {
    if (!sources.has(f.path)) continue;
    const ev = transactionWalk(f.path, sources.get(f.path));
    walks.set(f.path, ev);
    for (const e of ev) {
      if (!e.fn || e.fn === '{closure}') continue;
      const k = e.fn.toLowerCase();
      if (e.type === 'ddl' && !ddlFns.has(k)) ddlFns.set(k, `${f.path}:${e.line}`);
      if (e.type === 'call') {
        if (!callsOf.has(k)) callsOf.set(k, new Set());
        callsOf.get(k).add(e.name.toLowerCase());
      }
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [fn, calls] of callsOf) {
      if (ddlFns.has(fn)) continue;
      for (const c of calls) if (ddlFns.has(c)) { ddlFns.set(fn, `calls ${c}()`); changed = true; break; }
    }
  }
  const out = [];
  for (const [path, ev] of walks) {
    for (let k = 0; k < ev.length; k++) {
      const b = ev[k];
      if (b.type !== 'begintransaction') continue;
      for (let j = k + 1; j < ev.length; j++) {
        const e = ev[j];
        if (e.fn !== b.fn) { if (e.depth < b.depth) break; else continue; }
        if (e.type === 'commit' || e.type === 'rollback') break;
        if (e.type === 'begintransaction') break;
        if (e.type === 'ddl') out.push({ file: path, beginLine: b.line, line: e.line, fn: b.fn, what: e.text });
        if (e.type === 'call' && ddlFns.has(e.name.toLowerCase())) out.push({ file: path, beginLine: b.line, line: e.line, fn: b.fn, what: `${e.name}() runs DDL (${ddlFns.get(e.name.toLowerCase())})` });
      }
    }
  }
  return { findings: out, ddlFns };
}

/**
 * F-03: columns sync.php writes that a schema.php migration added (so an install can be
 * missing them during a deploy) and that sync.php does not heal before beginTransaction().
 */
export function findUnhealedSyncColumns(facts, model, syncPath = 'public/sync.php') {
  const sync = facts.find((f) => f.path === syncPath);
  if (!sync) return [];
  const healed = new Set();
  for (const s of sync.sql) {
    for (const stmt of s.text.split(/;\s*(?=ALTER)/i)) {
      const a = /ALTER\s+TABLE/i.test(stmt) ? alterEffects(stmt) : null;
      if (a) for (const c of [...a.add, ...a.rename.map((r) => r[1])]) healed.add(`${a.table.toLowerCase()}.${c}`);
    }
  }
  const out = [];
  const seen = new Set();
  for (const s of sync.sql) {
    for (const c of sqlReferences(s.text).columns) {
      if (c.kind === 'qualified') continue;
      const tb = model.tables.get(c.table.toLowerCase());
      if (!tb || tb.base.has(c.col) && !tb.migrated.has(c.col)) continue;
      if (!tb.migrated.has(c.col)) continue;
      const key = `${c.table.toLowerCase()}.${c.col}`;
      if (healed.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push({ table: c.table, column: c.col, line: s.line, inBase: tb.base.has(c.col), migration: tb.migrated.get(c.col) });
    }
  }
  return out;
}

/**
 * F-05: in the order ccrm_apply_schema() runs them (base CREATE TABLEs, then
 * ccrm_apply_migrations() with every helper it calls inlined), a statement that touches a
 * table which only a later migration creates. A touch inside a function that checks
 * ccrm_table_exists($pdo, 'that_table') is reported as guarded.
 */
export function findMigrationOrder(schemaSrc, extraSources = new Map()) {
  const files = new Map([['public/api/schema.php', schemaSrc], ...extraSources]);
  const fns = new Map(); // lower name -> { toks, start, end, file }
  for (const [file, src] of files) {
    const toks = tokenize(src).filter((x) => x.t !== 'comment');
    for (let i = 0; i < toks.length; i++) {
      if (!(toks[i].t === 'id' && toks[i].v.toLowerCase() === 'function' && toks[i + 1] && toks[i + 1].t === 'id')) continue;
      let j = i;
      while (j < toks.length && !(toks[j].t === 'op' && toks[j].v === '{')) j++;
      let depth = 0;
      let k = j;
      for (; k < toks.length; k++) {
        if (toks[k].t === 'op' && toks[k].v === '{') depth++;
        if (toks[k].t === 'op' && toks[k].v === '}') { depth--; if (depth === 0) break; }
      }
      fns.set(toks[i + 1].v.toLowerCase(), { toks, start: j, end: k, file, name: toks[i + 1].v });
    }
  }
  const events = [];
  const seen = new Set();
  const walk = (name) => {
    const f = fns.get(name);
    if (!f || seen.has(name)) return;
    seen.add(name);
    const guarded = new Set();
    for (let i = f.start; i < f.end; i++) {
      const x = f.toks[i];
      if (x.t === 'id' && x.v === 'ccrm_table_exists' && f.toks[i + 4] && f.toks[i + 4].t === 'str') guarded.add(f.toks[i + 4].v.toLowerCase());
    }
    for (let i = f.start; i < f.end; i++) {
      const x = f.toks[i];
      if ((x.t === 'str' || x.t === 'istr')) {
        const c = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([A-Za-z0-9_]+)`?/i.exec(x.v);
        if (c) { events.push({ type: 'create', table: c[1].toLowerCase(), fn: f.name, line: x.line, file: f.file }); continue; }
        const a = /^\s*(?:ALTER\s+TABLE|INSERT\s+(?:IGNORE\s+)?INTO|UPDATE|DELETE\s+FROM)\s+`?([A-Za-z0-9_]+)`?/i.exec(x.v);
        if (a) events.push({ type: 'touch', table: a[1].toLowerCase(), fn: f.name, line: x.line, file: f.file, guarded: guarded.has(a[1].toLowerCase()) });
      }
      if (x.t === 'id' && f.toks[i + 1] && f.toks[i + 1].t === 'op' && f.toks[i + 1].v === '(' && fns.has(x.v.toLowerCase())) {
        const prev = f.toks[i - 1];
        if (prev && prev.t === 'id' && prev.v.toLowerCase() === 'function') continue;
        walk(x.v.toLowerCase());
      }
    }
  };
  // Base statements first.
  walk('ccrm_schema_statements');
  const base = new Set(events.filter((e) => e.type === 'create').map((e) => e.table));
  events.length = 0;
  walk('ccrm_apply_migrations');
  const created = new Set(base);
  const out = [];
  const laterCreates = new Map();
  for (const e of events) if (e.type === 'create' && !laterCreates.has(e.table)) laterCreates.set(e.table, e);
  for (const e of events) {
    if (e.type === 'create') { created.add(e.table); continue; }
    if (!created.has(e.table) && laterCreates.has(e.table)) {
      out.push({ ...e, createdAt: laterCreates.get(e.table) });
    }
  }
  return out;
}

/** F-06: a base CREATE TABLE whose FOREIGN KEY references a table created later in the list. */
export function findForwardForeignKeys(schemaSrc) {
  const toks = tokenize(schemaSrc).filter((x) => x.t !== 'comment');
  const created = new Set();
  const out = [];
  for (const x of toks) {
    if (x.t !== 'str' && x.t !== 'istr') continue;
    const c = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([A-Za-z0-9_]+)`?/i.exec(x.v);
    if (!c) continue;
    const table = c[1].toLowerCase();
    for (const r of x.v.matchAll(/REFERENCES\s+`?([A-Za-z0-9_]+)`?/gi)) {
      const ref = r[1].toLowerCase();
      if (ref !== table && !created.has(ref)) out.push({ table, references: ref, line: x.line });
    }
    created.add(table);
  }
  return out;
}
