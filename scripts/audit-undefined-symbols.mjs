#!/usr/bin/env node
/**
 * Undefined-symbol audit for the PHP backend (docs/audits/undefined-symbol-audit.md).
 *
 *   node scripts/audit-undefined-symbols.mjs                  # working tree: class A by severity
 *   node scripts/audit-undefined-symbols.mjs --rev 80a0a76c~1 # any git revision (read with git show)
 *   node scripts/audit-undefined-symbols.mjs --sql            # + class F (SQL names, DDL in tx, healing)
 *   node scripts/audit-undefined-symbols.mjs --requires       # + unresolved and conditional requires
 *   node scripts/audit-undefined-symbols.mjs --unguarded      # + class C (declarations without a guard)
 *   node scripts/audit-undefined-symbols.mjs --via            # + entry points for every finding
 *   node scripts/audit-undefined-symbols.mjs --json out.json  # machine-readable findings
 *   node scripts/audit-undefined-symbols.mjs --only sync.php,read_scope.php
 *   node scripts/audit-undefined-symbols.mjs --refresh-builtins   # needs the `crm` container
 *
 * Scans public/ (the backend source), the `ccrm` CLI, src-php/ and scripts/*.php. The repo-root
 * copies (api/, sync.php) and dist/ are mirrors: a require that points into them is folded onto
 * public/. Their contents are not audited here; the ccrm CLI already reports drift.
 *
 * The logic lives in scripts/lib/php-symbol-audit.mjs and scripts/lib/sql-audit.mjs (pure
 * functions over file contents) so a guard test can import runAudit()/runSqlAudit() directly.
 * Always exits 0: it reports, it does not judge.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeFile, buildIndex, findUndefinedUses, findUnguardedDeclarations, groupFindings,
  isUnconditional, describeCondition,
} from './lib/php-symbol-audit.mjs';
import {
  buildSchemaModel, findSqlNameIssues, findDdlInTransactions, findMigrationOrder,
  findForwardForeignKeys, findUnhealedSyncColumns,
} from './lib/sql-audit.mjs';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? '');
};
const flag = (name) => args.includes(name);

// --------------------------------------------------------------------------------------------
// Built-ins
// --------------------------------------------------------------------------------------------
const BUILTINS_FILE = join(ROOT, 'scripts', 'lib', 'php-builtins.json');
if (flag('--refresh-builtins')) {
  const code = 'echo json_encode(["php"=>PHP_VERSION,"extensions"=>get_loaded_extensions(),'
    + '"functions"=>get_defined_functions()["internal"],'
    + '"classes"=>array_values(array_merge(get_declared_classes(),get_declared_interfaces(),get_declared_traits())),'
    + '"constants"=>array_keys(get_defined_constants())]);';
  const j = JSON.parse(execFileSync('docker', ['exec', 'crm', 'php', '-r', code], { encoding: 'utf8' }));
  const out = { _source: `crm dev container, php ${j.php}. Regenerate with --refresh-builtins.`, php: j.php,
    extensions: j.extensions.sort(), functions: j.functions.sort(), classes: j.classes.sort(), constants: j.constants.sort() };
  writeFileSync(BUILTINS_FILE, JSON.stringify(out));
  console.log(`Wrote ${BUILTINS_FILE}: ${out.functions.length} functions, ${out.classes.length} classes, ${out.constants.length} constants.`);
  process.exit(0);
}

export function loadBuiltins() {
  const j = JSON.parse(readFileSync(BUILTINS_FILE, 'utf8'));
  return {
    functions: new Set(j.functions.map((s) => s.toLowerCase())),
    classes: new Set(j.classes.map((s) => s.toLowerCase())),
    constants: new Set(j.constants),
    extensions: j.extensions,
  };
}

// --------------------------------------------------------------------------------------------
// File sources: working tree or a git revision
// --------------------------------------------------------------------------------------------
export function makeSource(rev) {
  if (!rev) {
    const walk = (dir, acc = []) => {
      if (!existsSync(join(ROOT, dir))) return acc;
      for (const name of readdirSync(join(ROOT, dir))) {
        const rel = dir ? `${dir}/${name}` : name;
        const st = statSync(join(ROOT, rel));
        if (st.isDirectory()) {
          if (['uploads', 'node_modules', 'vendor', 'downloads', 'module-screenshots', 'update-screenshots'].includes(name)) continue;
          walk(rel, acc);
        } else acc.push(rel);
      }
      return acc;
    };
    return {
      list: (dir) => walk(dir),
      read: (p) => readFileSync(join(ROOT, p), 'utf8'),
      exists: (p) => existsSync(join(ROOT, p)),
    };
  }
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', rev], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\n').filter(Boolean);
  const set = new Set(files);
  return {
    list: (dir) => files.filter((f) => dir === '' || f.startsWith(dir + '/')),
    read: (p) => execFileSync('git', ['show', `${rev}:${p}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }),
    exists: (p) => set.has(p),
  };
}

/** The config.php the setup wizard writes (public/api/setup.php). Not in git, so synthesise it. */
export const VIRTUAL_CONFIG = `<?php
define('DB_HOST', 'h'); define('DB_PORT', '3306'); define('DB_NAME', 'n'); define('DB_USER', 'u'); define('DB_PASS', 'p');
define('CCRM_SECRET_KEY', 'k');
function get_db_connection() { global $pdo; return $pdo; }
`;

/** Which files are audited (the backend source and the CLI entry points). */
export function selectFiles(src) {
  const out = [];
  for (const f of src.list('public')) if (f.endsWith('.php') && !f.includes('/uploads/')) out.push(f);
  if (src.exists('ccrm')) out.push('ccrm');
  if (src.exists('kprnq')) out.push('kprnq');
  for (const f of src.list('src-php')) if (f.endsWith('.php')) out.push(f);
  for (const f of src.list('scripts')) if (f.endsWith('.php')) out.push(f);
  return out.filter((f) => f !== 'public/config.php');
}

/** Fold a resolved require onto the audited tree: api/x -> public/api/x, dist/x -> public/x. */
export function mapPath(p) {
  if (!p) return p;
  if (p === 'config.php' || p === 'public/config.php' || p === 'dist/config.php') return 'public/config.php';
  if (p.startsWith('dist/')) return 'public/' + p.slice(5);
  if (p.startsWith('api/') || p === 'sync.php' || p === 'upload.php') return 'public/' + p;
  if (p.startsWith('/var/www/html/')) return mapPath(p.slice('/var/www/html/'.length));
  if (/(^|\/)vendor\/autoload\.php$/.test(p)) return 'vendor/autoload.php';
  return p;
}

/** Composer PSR-4 prefixes: classes under them are defined once vendor/autoload.php is loaded. */
export function autoloadPrefixes(src) {
  const prefixes = [];
  try {
    const lock = JSON.parse(src.read('composer.lock'));
    for (const pkg of [...(lock.packages || []), ...(lock['packages-dev'] || [])]) {
      for (const kind of ['psr-4', 'psr-0']) for (const ns of Object.keys(pkg.autoload?.[kind] || {})) prefixes.push(ns.toLowerCase());
    }
  } catch { /* no lock file */ }
  try {
    const composer = JSON.parse(src.read('composer.json'));
    for (const ns of Object.keys(composer.autoload?.['psr-4'] || {})) prefixes.push(ns.toLowerCase());
  } catch { /* none */ }
  return prefixes;
}

export function runAudit({ rev = null, only = null } = {}) {
  const src = makeSource(rev);
  const files = selectFiles(src);
  const facts = [];
  for (const f of files) facts.push(analyzeFile(f, src.read(f)));
  facts.push(analyzeFile('public/config.php', VIRTUAL_CONFIG));
  // vendor/autoload.php: defines every class under a Composer prefix.
  const vendor = analyzeFile('vendor/autoload.php', '<?php\n');
  vendor.autoloadPrefixes = autoloadPrefixes(src);
  facts.push(vendor);
  for (const fct of facts) {
    for (const r of fct.requires) {
      if (r.resolved.how === 'unresolved' && /autoload/i.test(r.resolved.raw)) {
        r.resolved = { ...r.resolved, path: 'vendor/autoload.php', how: 'autoload' };
      }
    }
  }
  const index = buildIndex(facts, { mapPath });
  // Classes behind a Composer prefix resolve to vendor/autoload.php.
  for (const fct of facts) {
    for (const u of fct.uses) {
      if (u.kind !== 'class') continue;
      const lname = u.name.toLowerCase();
      if (index.classes.has(lname)) continue;
      if (vendor.autoloadPrefixes.some((p) => lname.startsWith(p))) {
        index.classes.set(lname, [{ file: 'vendor/autoload.php', line: 0, ctx: 'top', name: u.name }]);
      }
    }
  }
  const builtins = loadBuiltins();
  let findings = findUndefinedUses(index, builtins);
  if (only) findings = findings.filter((x) => only.some((o) => x.file.endsWith(o)));
  const entries = facts.filter((f) => f.topLevelCode && !['public/config.php', 'vendor/autoload.php'].includes(f.path)).map((f) => f.path);
  for (const x of findings) triage(index, entries, x);
  return { src, files, facts, index, builtins, findings, entries, unguarded: findUnguardedDeclarations(index) };
}

/**
 * Class F. Only the backend source (public/) is modelled: scripts/ seeders talk to other
 * databases (the Villatesta import) and would add tables the app never has.
 * `query` is the word in generate_dashboard.php's prompt text ("... FROM query"), not SQL.
 */
export const SQL_IGNORE_TABLES = ['query'];
export function runSqlAudit(res) {
  const facts = res.facts.filter((f) => f.path.startsWith('public/'));
  const sources = new Map();
  for (const f of facts) { try { sources.set(f.path, res.src.read(f.path)); } catch { /* virtual file */ } }
  const model = buildSchemaModel(facts, sources);
  const extra = new Map([...sources].filter(([p]) => p.startsWith('public/api/') && p !== 'public/api/schema.php'));
  return {
    model,
    names: findSqlNameIssues(facts, model, { ignoreTables: SQL_IGNORE_TABLES }),
    ddl: findDdlInTransactions(facts, sources, res.index),
    order: findMigrationOrder(sources.get('public/api/schema.php') || '', extra),
    fks: findForwardForeignKeys(sources.get('public/api/schema.php') || ''),
    unhealed: findUnhealedSyncColumns(facts, model),
  };
}

/**
 * Which entry points reach the file of a finding, and whether each one has the definition:
 *   ok      the definition is in the entry point's unconditional closure
 *   maybe   it is loaded somewhere in the entry point's require graph, but only conditionally
 *   missing nothing the entry point can load defines it: a call from there is a fatal error
 */
export function triage(index, entries, x) {
  const defFiles = new Set(x.defs.map((d) => d.file));
  x.via = [];
  for (const e of entries) {
    if (!index.reach(e).has(x.file)) continue;
    const closure = index.closure(e);
    const reach = index.reach(e);
    const status = [...defFiles].some((d) => closure.has(d)) ? 'ok' : [...defFiles].some((d) => reach.has(d)) ? 'maybe' : 'missing';
    x.via.push({ entry: e, status });
  }
  x.severity = x.verdict === 'undefined-everywhere' ? 'broken'
    : x.via.some((v) => v.status === 'missing') ? 'broken-via-entry'
      : x.via.some((v) => v.status === 'maybe') ? 'conditional'
        : 'latent';
  return x;
}

// --------------------------------------------------------------------------------------------
// CLI
// --------------------------------------------------------------------------------------------
const isMain = process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].replace(/\//g, sep).toLowerCase();
if (isMain) {
  const rev = opt('--rev');
  const only = opt('--only') ? opt('--only').split(',') : null;
  const t0 = Date.now();
  const res = runAudit({ rev, only });
  const groups = groupFindings(res.findings);

  if (opt('--json')) {
    writeFileSync(opt('--json'), JSON.stringify({
      rev: rev || 'working tree', scanned: res.files.length, findings: groups,
      unguarded: res.unguarded.map((u) => ({ file: u.file, functions: u.functions.map((d) => d.name), classes: u.classes.map((d) => d.name), constants: u.constants.map((d) => d.name), includers: u.includers })),
      unresolvedRequires: res.facts.flatMap((f) => f.requires.filter((r) => !r.target).map((r) => ({ file: f.path, line: r.line, raw: r.resolved.raw, how: r.resolved.how, path: r.resolved.path, missing: r.missing }))),
    }, null, 2));
  }

  console.log(`Undefined-symbol audit — ${rev || 'working tree'} — ${res.files.length} PHP files, ${Date.now() - t0} ms`);
  const sevOrder = ['broken', 'broken-via-entry', 'conditional', 'latent'];
  const sevText = {
    broken: 'defined nowhere in the project and not a PHP built-in',
    'broken-via-entry': 'an entry point reaches the use with no way to load the definition',
    conditional: 'the definition is loaded only on some paths of the entry points that reach the use',
    latent: 'every entry point that reaches it happens to load the definition first (rule violation, works today)',
  };
  groups.sort((a, b) => sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity) || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
  for (const sev of sevOrder) {
    const g = groups.filter((x) => x.severity === sev);
    console.log(`\n## ${sev} (${g.length}) — ${sevText[sev]}`);
    for (const x of g) {
      const where = x.defs.length ? ` — defined in ${[...new Set(x.defs.map((d) => `${d.file}:${d.line}`))].join(', ')}` : '';
      const cond = x.conditionalRequires && x.conditionalRequires.length
        ? ` — this file loads it only ${x.conditionalRequires.map((c) => `${c.where} (line ${c.line})`).join('; ')}` : '';
      console.log(`  ${x.file}:${x.lines.join(',')}  ${x.kind} ${x.name}${x.fn ? ` in ${x.fn}()` : ''}${where}${cond}`);
      if (flag('--via') || sev === 'broken-via-entry' || sev === 'conditional') {
        const bad = x.via.filter((v) => v.status !== 'ok');
        if (bad.length) console.log(`      via: ${bad.map((v) => `${v.entry} [${v.status}]`).join(', ')}${x.via.length > bad.length ? ` (+${x.via.length - bad.length} ok)` : ''}`);
      }
    }
  }
  if (flag('--sql')) {
    const sql = runSqlAudit(res);
    console.log(`\n## SQL (class F) — ${sql.model.tables.size} tables known`);
    console.log(`\n### Tables or columns that exist nowhere (${sql.names.filter((x) => x.kind !== 'column-outside-schema').length})`);
    for (const x of sql.names.filter((y) => y.kind !== 'column-outside-schema')) {
      console.log(`  ${x.file}:${x.line}  ${x.kind} ${x.table}${x.column ? '.' + x.column : ''}${x.fn ? ` in ${x.fn}()` : ''}`);
    }
    const outside = new Map();
    for (const x of sql.names.filter((y) => y.kind === 'column-outside-schema')) outside.set(x.table, (outside.get(x.table) || 0) + 1);
    console.log(`\n### Tables whose columns are created outside schema.php (lazy CREATE TABLE in their own endpoint): ${[...outside.keys()].join(', ')}`);
    console.log(`\n### DDL between beginTransaction() and commit() (${sql.ddl.findings.length})`);
    for (const d of sql.ddl.findings) console.log(`  ${d.file}:${d.line}  (transaction opened at line ${d.beginLine}) ${d.what}`);
    console.log(`\n### Migration order: a table touched before the migration that creates it (${sql.order.length})`);
    for (const o of sql.order) console.log(`  ${o.file}:${o.line} ${o.fn}() touches ${o.table} before ${o.createdAt.fn}() creates it`);
    console.log(`\n### Base CREATE TABLE with a FOREIGN KEY to a table created later (${sql.fks.length})`);
    for (const o of sql.fks) console.log(`  public/api/schema.php:${o.line} ${o.table} -> ${o.references}`);
    console.log(`\n### Columns sync.php writes that a migration added and sync.php does not heal (${sql.unhealed.length})`);
    for (const u of sql.unhealed) console.log(`  ${u.table}.${u.column}  (sync.php:${u.line}; migration ${u.migration.map((m) => `${m.file}:${m.line}`).join(', ')})`);
  }
  if (flag('--requires')) {
    console.log('\n## Requires that did not resolve to an audited file');
    for (const f of res.facts) for (const r of f.requires) if (!r.target) {
      console.log(`  ${f.path}:${r.line}  ${r.kw} ${r.resolved.raw}  [${r.resolved.how}${r.missing ? ', MISSING' : ''}]`);
    }
    console.log('\n## Conditional requires');
    for (const f of res.facts) for (const r of f.requires) if (r.target && !isUnconditional(f, r)) {
      console.log(`  ${f.path}:${r.line}  -> ${r.target}  (${describeCondition(f, r)})`);
    }
  }
  if (flag('--unguarded')) {
    console.log('\n## Files declaring functions/classes/constants outside a function_exists guard');
    for (const u of res.unguarded) {
      console.log(`  ${u.file}: ${u.functions.length} fn, ${u.classes.length} class, ${u.constants.length} const; included by ${u.includers.map((i) => i.from.replace(/^public\//, '')).join(', ') || 'nobody'}`);
    }
  }
}
