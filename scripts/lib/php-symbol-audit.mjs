/**
 * Core of the undefined-symbol audit (scripts/audit-undefined-symbols.mjs).
 *
 * Pure functions over file contents: no filesystem, no PHP binary. CI has no PHP, so the
 * lexer is written here instead of calling token_get_all(). It only has to be good enough to
 * find declarations, calls, requires and the block each one sits in; it does not evaluate
 * anything.
 *
 *   tokenize(src)                      -> tokens
 *   analyzeFile(path, src)             -> per-file facts (defs, uses, requires, blocks)
 *   buildIndex(facts[])                -> global symbol table + require graph
 *   findUndefinedUses(index, builtins) -> class A findings
 *   findUnguardedDeclarations(index)   -> class C candidates
 *
 * The rule enforced by findUndefinedUses: a file must itself load (through unconditional,
 * top-level requires) every project function, class and constant it uses, or load it in the
 * same block before the use. "The caller always loads it first" does not count.
 */

// ---------------------------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------------------------

const MULTI_OPS = ['#[', '<=>', '**=', '...', '<<=', '>>=', '===', '!==', '??=', '?->',
  '::', '->', '=>', '==', '!=', '<>', '<=', '>=', '&&', '||', '??', '++', '--', '+=', '-=', '*=',
  '/=', '.=', '%=', '&=', '|=', '^=', '<<', '>>', '**'];

const ID_START = /[A-Za-z_\x80-\uffff]/;
const ID_CHAR = /[A-Za-z0-9_\x80-\uffff]/;

/**
 * Token: { t, v, line } with t one of
 *   html | open | close | comment | var | id | str | istr | num | op
 * `str` is a string without interpolation (v = raw content), `istr` a double-quoted string or
 * heredoc that may interpolate (v = raw content). `id` may be a qualified name (`\Foo\Bar`).
 */
export function tokenize(src) {
  const out = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  const push = (t, v, startLine) => out.push({ t, v, line: startLine });
  const countLines = (s) => {
    let c = 0;
    for (let k = 0; k < s.length; k++) if (s.charCodeAt(k) === 10) c++;
    return c;
  };

  // Leading shebang (the ccrm CLI).
  if (src.startsWith('#!')) {
    const nl = src.indexOf('\n');
    i = nl === -1 ? n : nl + 1;
    line = 2;
  }

  let php = false;
  while (i < n) {
    if (!php) {
      const m = /<\?(php\b|=)/i.exec(src.slice(i));
      if (!m) {
        push('html', src.slice(i), line);
        break;
      }
      const html = src.slice(i, i + m.index);
      if (html) push('html', html, line);
      line += countLines(html);
      push('open', m[0], line);
      i += m.index + m[0].length;
      php = true;
      continue;
    }
    const c = src[i];
    // Whitespace
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      if (c === '\n') line++;
      i++;
      continue;
    }
    // Close tag
    if (c === '?' && src[i + 1] === '>') {
      push('close', '?>', line);
      i += 2;
      if (src[i] === '\n') { line++; i++; }
      php = false;
      continue;
    }
    // Comments (but #[ is an attribute)
    if ((c === '#' && src[i + 1] !== '[') || (c === '/' && src[i + 1] === '/')) {
      let j = i;
      while (j < n && src[j] !== '\n' && !(src[j] === '?' && src[j + 1] === '>')) j++;
      push('comment', src.slice(i, j), line);
      i = j;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      let j = src.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;
      const text = src.slice(i, j);
      push('comment', text, line);
      line += countLines(text);
      i = j;
      continue;
    }
    // Variables
    if (c === '$' && i + 1 < n && ID_START.test(src[i + 1])) {
      let j = i + 1;
      while (j < n && ID_CHAR.test(src[j])) j++;
      push('var', src.slice(i, j), line);
      i = j;
      continue;
    }
    // Identifiers, possibly namespace-qualified
    if (ID_START.test(c) || (c === '\\' && i + 1 < n && ID_START.test(src[i + 1]))) {
      let j = i;
      while (j < n && (ID_CHAR.test(src[j]) || (src[j] === '\\' && j + 1 < n && ID_START.test(src[j + 1])))) j++;
      // Heredoc is handled below; `b"..."` binary strings are rare enough to ignore.
      push('id', src.slice(i, j), line);
      i = j;
      continue;
    }
    // Numbers
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i + 1;
      while (j < n && /[0-9A-Za-z_.]/.test(src[j])) j++;
      push('num', src.slice(i, j), line);
      i = j;
      continue;
    }
    // Single-quoted string
    if (c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== "'") {
        if (src[j] === '\\') j++;
        j++;
      }
      const raw = src.slice(i + 1, j);
      push('str', raw.replace(/\\(['\\])/g, '$1'), line);
      line += countLines(raw);
      i = j + 1;
      continue;
    }
    // Double-quoted or backtick string
    if (c === '"' || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++;
        j++;
      }
      const raw = src.slice(i + 1, j);
      const interp = /(^|[^\\])\$[A-Za-z_{]|\{\$/.test(raw);
      push(c === '`' ? 'istr' : (interp ? 'istr' : 'str'), raw, line);
      line += countLines(raw);
      i = j + 1;
      continue;
    }
    // Heredoc / nowdoc
    if (c === '<' && src.startsWith('<<<', i)) {
      const m = /^<<<[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1\r?\n/.exec(src.slice(i));
      if (m) {
        const id = m[2];
        const bodyStart = i + m[0].length;
        const re = new RegExp(`(^|\\n)[ \\t]*${id}(?![A-Za-z0-9_])`, 'g');
        re.lastIndex = bodyStart - 1;
        const end = re.exec(src);
        const bodyEnd = end ? end.index + (end[1] ? 1 : 0) : n;
        const body = src.slice(bodyStart, bodyEnd);
        push(m[1] === "'" ? 'str' : 'istr', body, line);
        const consumedTo = end ? end.index + end[0].length : n;
        line += countLines(src.slice(i, consumedTo));
        i = consumedTo;
        continue;
      }
    }
    // Operators
    let op = c;
    for (const m of MULTI_OPS) {
      if (src.startsWith(m, i)) { op = m; break; }
    }
    push('op', op, line);
    i += op.length;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Per-file analysis
// ---------------------------------------------------------------------------------------------

const KEYWORDS = new Set(`abstract and array as break callable case catch class clone const continue
declare default die do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile
enum eval exit extends final finally fn for foreach function global goto if implements include
include_once instanceof insteadof interface isset list match namespace new or print private
protected public readonly require require_once return static switch throw trait try unset use var
while xor yield from self parent true false null int float bool string void mixed never object
iterable integer double boolean resource __dir__ __file__ __line__ __class__
__function__ __method__ __namespace__ __trait__ __halt_compiler`.split(/\s+/));

const CONTROL = new Set(['if', 'elseif', 'while', 'for', 'foreach', 'switch', 'catch', 'match', 'declare']);
const REQUIRE_KW = new Set(['require', 'require_once', 'include', 'include_once']);

/** Functions that take a callable as one of their arguments: a string literal there is a use. */
const CALLABLE_TAKERS = new Set(['call_user_func', 'call_user_func_array', 'array_map', 'array_filter',
  'array_walk', 'array_walk_recursive', 'array_reduce', 'usort', 'uasort', 'uksort', 'is_callable',
  'register_shutdown_function', 'set_error_handler', 'set_exception_handler', 'spl_autoload_register',
  'preg_replace_callback', 'iterator_apply', 'forward_static_call', 'forward_static_call_array']);

const isOp = (tok, v) => tok && tok.t === 'op' && tok.v === v;
const isId = (tok, v) => tok && tok.t === 'id' && tok.v.toLowerCase() === v;
const stripNs = (name) => name.replace(/^\\/, '');

/** Index of the token that closes the bracket opened at `i` (`(`, `[` or `{`). */
function matchClose(toks, i) {
  const open = toks[i].v;
  const close = open === '(' ? ')' : open === '[' ? ']' : '}';
  let depth = 0;
  for (let j = i; j < toks.length; j++) {
    const t = toks[j];
    if (t.t !== 'op') continue;
    if (t.v === open || (open === '{' && (t.v === '${'))) depth++;
    else if (t.v === close) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return toks.length - 1;
}

/**
 * Classify an `if (...)` condition.
 *   guard     !function_exists('x') / !class_exists / !defined / !interface_exists (any && mix)
 *   exists    function_exists('x') / class_exists('X') / defined('X'): uses of x inside are safe
 *   fileguard only file_exists / is_file / is_readable: a require inside is as good as
 *             unconditional (the file is part of the deploy; a missing one is a different bug)
 *   cond      anything else
 */
function classifyCondition(cond) {
  const text = cond.map((t) => (t.t === 'str' ? `'${t.v}'` : t.v)).join(' ');
  const checks = [...text.matchAll(/(!\s*)?(function_exists|class_exists|interface_exists|trait_exists|defined)\s*\(\s*'([^']+)'/g)];
  const stripped = text
    .replace(/(!\s*)?(function_exists|class_exists|interface_exists|trait_exists|defined)\s*\(\s*'[^']+'\s*(,\s*\w+\s*)?\)/g, '')
    .replace(/&&|\(|\)|\s/g, '');
  if (checks.length && stripped === '') {
    const neg = checks.every((m) => m[1]);
    const pos = checks.every((m) => !m[1]);
    if (neg) return { kind: 'guard', names: checks.map((m) => m[3]) };
    if (pos) return { kind: 'exists', names: checks.map((m) => m[3]) };
  }
  // A positive check mixed with something else still protects the names it checks
  // (`if ($x && function_exists('y')) { y(); }`), as long as it is joined with &&.
  if (checks.length && !/\|\||\bor\b/i.test(text)) {
    const pos = checks.filter((m) => !m[1]).map((m) => m[3]);
    if (pos.length) return { kind: 'cond', names: pos };
  }
  if (/^(!?\s*@?\s*(file_exists|is_file|is_readable)\s*\([^)]*\)\s*(&&)?\s*)+$/.test(
    cond.map((t) => (t.t === 'str' ? `'x'` : t.t === 'var' ? '$v' : t.v)).join(' ').replace(/\s*\.\s*/g, '.')
  ) && !/!\s*@?\s*(file_exists|is_file|is_readable)/.test(text)) {
    return { kind: 'fileguard', names: [] };
  }
  return { kind: 'cond', names: [] };
}

/**
 * Resolve a require path expression to a repo-relative path (POSIX), or describe why not.
 * Returns { path, how } where how is 'dir' | 'literal' | 'config' | 'dynamic' | 'unresolved'.
 */
export function resolveRequirePath(fromFile, exprToks) {
  const dir = posixDirname(fromFile);
  const toks = exprToks.filter((t) => !(t.t === 'op' && (t.v === '@' || t.v === '(' || t.v === ')')));
  const parts = [];
  let base = null;
  let k = 0;
  const raw = exprToks.map((t) => (t.t === 'str' ? `'${t.v}'` : t.v)).join(' ');
  // dirname(__DIR__) / dirname(__DIR__, 2) / dirname(__FILE__)
  if (isId(toks[0], 'dirname')) {
    const levelTok = toks.find((t) => t.t === 'num');
    const levels = levelTok ? parseInt(levelTok.v, 10) : 1;
    const from = toks.some((t) => isId(t, '__file__')) ? fromFile : dir;
    base = from;
    for (let l = 0; l < levels + (toks.some((t) => isId(t, '__file__')) ? 1 : 0); l++) base = posixDirname(base);
    k = toks.findIndex((t) => isOp(t, '.'));
    k = k === -1 ? toks.length : k;
  } else if (isId(toks[0], '__dir__')) {
    base = dir;
    k = 1;
  }
  for (; k < toks.length; k++) {
    const t = toks[k];
    if (isOp(t, '.') || (t.t === 'op' && t.v === ',')) continue;
    if (t.t === 'str') parts.push(t.v);
    else if (t.t === 'var') parts.push({ var: t.v });
    else parts.push({ other: t.v });
  }
  if (base !== null && parts.every((p) => typeof p === 'string')) {
    return { path: posixNormalize(base + '/' + parts.join('')), how: 'dir', raw };
  }
  if (base === null && parts.length === 1 && typeof parts[0] === 'string') {
    return { path: parts[0], how: 'literal', raw };
  }
  // $configFile / $cfgFile / $config_file: the config loader.
  if (parts.length === 1 && parts[0].var && /cfg|config/i.test(parts[0].var)) {
    return { path: 'public/config.php', how: 'config', raw };
  }
  if (parts.length === 1 && parts[0].var && /^\$schema(File|Path)?$/i.test(parts[0].var)) {
    return { path: 'public/api/schema.php', how: 'var-guess', raw };
  }
  // __DIR__ . $dir . '/x.php' (the ccrm CLI's foreach over api/, dist/api/, public/api/)
  const last = parts[parts.length - 1];
  if (typeof last === 'string' && /\.php$/.test(last)) {
    return { path: null, tail: last.replace(/^\//, ''), how: 'dynamic', raw };
  }
  return { path: null, how: 'unresolved', raw };
}

export function posixDirname(p) {
  const i = p.lastIndexOf('/');
  return i === -1 ? '.' : p.slice(0, i) || '/';
}

export function posixNormalize(p) {
  const out = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else out.push('..');
    } else out.push(seg);
  }
  return out.join('/');
}

/**
 * Walk one PHP file. Returns:
 *   defs.functions/classes/constants: [{ name, line, ctx }]  ctx = top | guard | cond | function | class
 *   uses: [{ name, kind, line, block, idx, fn, guardedBy }]
 *   requires: [{ line, idx, block, once, kw, resolved, ctx, fn, cond }]
 *   blocks: [{ id, kind, parent, start, end, names, fn, line }]
 *   functionExistsChecks: Set of names passed to function_exists()/class_exists() outside a guard
 *   topLevelCode: true when the file runs something besides declarations and requires
 */
export function analyzeFile(path, src) {
  const all = tokenize(src);
  const toks = all.filter((t) => t.t !== 'comment');
  const blocks = [{ id: 0, kind: 'file', parent: -1, start: 0, end: toks.length, names: [], fn: null, line: 1 }];
  const defs = { functions: [], classes: [], constants: [] };
  const uses = [];
  const requires = [];
  const functionExistsChecks = new Set();
  const globalsRead = []; // { fn, name, line }
  const sql = []; // { line, text, fn, idx }
  let namespace = '';
  const classImports = new Map(); // alias(lower) -> FQ
  let topLevelCode = false;
  let topLevelCodeAt = null;
  const markTop = (tok) => { if (pending && ['function', 'closure', 'class'].includes(pending.kind)) return; if (!topLevelCode) { topLevelCode = true; topLevelCodeAt = `${tok.line}: ${tok.v.slice(0, 40)}`; } };

  // Stack of open blocks (indices into `blocks`).
  const stack = [0];
  // Pending header for the next `{`: set by function/class/control keywords.
  let pending = null;
  // Virtual (braceless) control blocks waiting for their statement to end.
  const virtual = []; // { blockId, depth }
  let parenDepth = 0;

  const cur = () => blocks[stack[stack.length - 1]];
  const ctxOf = () => {
    // Innermost meaningful context for a definition or a require.
    for (let s = stack.length - 1; s >= 0; s--) {
      const b = blocks[stack[s]];
      if (b.kind === 'function' || b.kind === 'closure') return 'function';
      if (b.kind === 'class') return 'class';
    }
    for (let s = stack.length - 1; s >= 0; s--) {
      const b = blocks[stack[s]];
      if (b.kind === 'guard' || b.kind === 'fileguard' || b.kind === 'namespace' || b.kind === 'file' || b.kind === 'expr') continue;
      return 'cond';
    }
    return stack.some((id) => blocks[id].kind === 'guard') ? 'guard' : 'top';
  };
  const enclosingFn = () => {
    for (let s = stack.length - 1; s >= 0; s--) {
      const b = blocks[stack[s]];
      if (b.kind === 'function') return b.name;
      if (b.kind === 'closure') return (b.name || '{closure}');
    }
    return null;
  };
  const inClass = () => stack.some((id) => blocks[id].kind === 'class');
  const existsNames = () => {
    const s = new Set();
    for (const id of stack) for (const nm of blocks[id].names || []) if (blocks[id].kind !== 'guard') s.add(nm.toLowerCase());
    for (const v of virtual) for (const nm of blocks[v.blockId].names || []) if (blocks[v.blockId].kind !== 'guard') s.add(nm.toLowerCase());
    // `if (!function_exists('x')) { return; }` earlier in an enclosing block.
    for (const id of stack) for (const nm of blocks[id].afterGuard || []) s.add(nm.toLowerCase());
    return s;
  };
  const openBlock = (kind, extra = {}) => {
    const b = { id: blocks.length, kind, parent: stack[stack.length - 1], start: 0, end: 0, names: [], fn: null, line: 0, ...extra };
    blocks.push(b);
    stack.push(b.id);
    return b;
  };
  const closeBlock = (idx) => {
    const id = stack.pop();
    if (id !== undefined && id !== 0) {
      blocks[id].end = idx;
      const b = blocks[id];
      if (b.kind === 'guard' && b.exitsEarly && b.parent >= 0) {
        (blocks[b.parent].afterGuard ||= []).push(...b.names);
      }
    }
    return id;
  };
  const qualifyClass = (name) => {
    if (name.startsWith('\\')) return name.slice(1);
    const [head, ...rest] = name.split('\\');
    const imp = classImports.get(head.toLowerCase());
    if (imp) return [imp, ...rest].join('\\');
    return namespace ? `${namespace}\\${name}` : name;
  };
  const endVirtual = (idx) => {
    // A braceless body ends at the `;` that closes its statement.
    while (virtual.length && virtual[virtual.length - 1].level === stack.length && stack[stack.length - 1] === virtual[virtual.length - 1].blockId && virtual[virtual.length - 1].paren === parenDepth) {
      virtual.pop();
      closeBlock(idx);
    }
  };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const prev = toks[i - 1];
    const next = toks[i + 1];

    if (t.t === 'op' && t.v === '(') { parenDepth++; continue; }
    if (t.t === 'op' && t.v === ')') { parenDepth = Math.max(0, parenDepth - 1); continue; }

    if (t.t === 'op' && t.v === '{') {
      if (pending && pending.parenDepth === parenDepth) {
        const p = pending;
        pending = null;
        const b = openBlock(p.kind, { name: p.name || null, names: p.names || [], line: t.line, start: i });
        if (p.kind === 'function' || p.kind === 'closure') b.fn = p.name || null;
        continue;
      }
      openBlock('expr', { start: i, line: t.line });
      continue;
    }
    if (t.t === 'op' && t.v === '}') {
      const closed = closeBlock(i);
      // A braceless `else`/`if` whose single statement was this braced block ends here too,
      // unless the chain continues.
      const nxt = toks[i + 1];
      const continues = nxt && nxt.t === 'id' && ['else', 'elseif', 'catch', 'finally'].includes(nxt.v.toLowerCase());
      if (!continues && closed !== undefined) {
        while (virtual.length && virtual[virtual.length - 1].level === stack.length && stack[stack.length - 1] === virtual[virtual.length - 1].blockId) {
          virtual.pop();
          closeBlock(i);
        }
      }
      continue;
    }
    if (t.t === 'op' && t.v === ';') {
      if (pending && pending.parenDepth === parenDepth && (pending.kind === 'function' || pending.kind === 'class')) pending = null; // abstract method
      endVirtual(i);
      continue;
    }

    if (t.t === 'html' && stack.length === 1 && t.v.trim()) markTop(t);

    // String literals: SQL and string callables
    if (t.t === 'str' || t.t === 'istr') {
      if (/\b(INSERT\s+(IGNORE\s+)?INTO|UPDATE\s+`?\w+`?\s+SET|SELECT\s|ALTER\s+TABLE|CREATE\s+(TABLE|INDEX|UNIQUE)|DROP\s+(TABLE|INDEX|COLUMN)|DELETE\s+FROM|REPLACE\s+INTO|TRUNCATE)/i.test(t.v)) {
        sql.push({ line: t.line, text: t.v, fn: enclosingFn(), idx: i, block: cur().id });
      }
      if (t.t === 'str' && /^\\?[A-Za-z_][A-Za-z0-9_]*$/.test(t.v)) {
        // Find the call this string is an argument of.
        let depth = 0;
        let callee = null;
        for (let j = i - 1; j >= Math.max(0, i - 60); j--) {
          const u = toks[j];
          if (isOp(u, ')') || isOp(u, ']')) depth++;
          else if (isOp(u, '(') || isOp(u, '[')) {
            if (depth === 0) {
              if (isOp(u, '(') && toks[j - 1] && toks[j - 1].t === 'id') callee = toks[j - 1].v.toLowerCase();
              break;
            }
            depth--;
          } else if (depth === 0 && (isOp(u, ';') || isOp(u, '{') || isOp(u, '}'))) break;
        }
        if (callee && ['function_exists', 'class_exists', 'interface_exists', 'defined'].includes(callee)) {
          functionExistsChecks.add(stripNs(t.v).toLowerCase());
        } else if (callee && CALLABLE_TAKERS.has(callee)) {
          uses.push({ name: stripNs(t.v), kind: 'callable', line: t.line, block: cur().id, idx: i, fn: enclosingFn(), guardedBy: existsNames(), stack: [...stack, ...virtual.map((v) => v.blockId)] });
        }
      }
      continue;
    }

    if (t.t === 'var') {
      if (t.v === '$GLOBALS' && isOp(next, '[') && toks[i + 2] && toks[i + 2].t === 'str') {
        globalsRead.push({ fn: enclosingFn(), name: '$' + toks[i + 2].v, line: t.line, via: '$GLOBALS' });
      }
      continue;
    }

    if (t.t !== 'id') continue;
    const lower = t.v.toLowerCase();
    const afterArrow = prev && prev.t === 'op' && (prev.v === '->' || prev.v === '?->' || prev.v === '::');

    if (afterArrow) continue;

    // namespace / use
    if (lower === 'namespace' && !isOp(next, '\\') && stack.length <= 2 && next && next.t === 'id') {
      namespace = stripNs(next.v);
      if (isOp(toks[i + 2], '{')) pending = { kind: 'namespace', parenDepth };
      i++;
      continue;
    }
    if (lower === 'use' && isOp(next, '(')) continue; // closure use (...)
    if (lower === 'use' && stack.length === 1 + (cur().kind === 'namespace' ? 1 : 0) && !inClass()) {
      // use A\B [as C], D\E;   (use function / use const are skipped)
      if (next && next.t === 'id' && ['function', 'const'].includes(next.v.toLowerCase())) {
        while (i < toks.length && !isOp(toks[i], ';')) i++;
        continue;
      }
      let j = i + 1;
      while (j < toks.length && !isOp(toks[j], ';')) {
        if (toks[j].t === 'id') {
          const fq = stripNs(toks[j].v);
          let alias = fq.split('\\').pop();
          if (isId(toks[j + 1], 'as') && toks[j + 2]) { alias = toks[j + 2].v; j += 2; }
          classImports.set(alias.toLowerCase(), fq);
        }
        j++;
      }
      i = j - 1;
      continue;
    }
    if (lower === 'global') {
      let j = i + 1;
      while (j < toks.length && !isOp(toks[j], ';')) {
        if (toks[j].t === 'var') globalsRead.push({ fn: enclosingFn(), name: toks[j].v, line: toks[j].line, via: 'global' });
        j++;
      }
      continue;
    }

    // Declarations
    if (lower === 'function' || lower === 'fn') {
      if (lower === 'fn') continue; // arrow function: body is an expression in the enclosing scope
      let j = i + 1;
      if (isOp(toks[j], '&')) j++;
      if (toks[j] && toks[j].t === 'id' && isOp(toks[j + 1], '(')) {
        const name = toks[j].v;
        if (!inClass()) {
          defs.functions.push({ name: namespace ? `${namespace}\\${name}` : name, line: toks[j].line, ctx: ctxOf(), fnParent: enclosingFn() });
        }
        pending = { kind: 'function', name, parenDepth };
        i = j;
      } else {
        pending = { kind: 'closure', name: null, parenDepth };
      }
      continue;
    }
    if ((lower === 'class' || lower === 'interface' || lower === 'trait' || lower === 'enum') && !isOp(prev, '::')) {
      if (next && next.t === 'id' && !(lower === 'enum' && isOp(toks[i + 2], '('))) {
        if (prev && isId(prev, 'new')) { pending = { kind: 'class', name: null, parenDepth }; continue; }
        const fq = namespace ? `${namespace}\\${next.v}` : next.v;
        defs.classes.push({ name: fq, line: next.line, ctx: ctxOf(), kind: lower });
        pending = { kind: 'class', name: fq, parenDepth };
        // extends / implements
        let j = i + 2;
        while (j < toks.length && !isOp(toks[j], '{')) {
          if ((isId(toks[j], 'extends') || isId(toks[j], 'implements') || isOp(toks[j], ',')) && toks[j + 1] && toks[j + 1].t === 'id' && !KEYWORDS.has(toks[j + 1].v.toLowerCase())) {
            uses.push({ name: qualifyClass(toks[j + 1].v), short: toks[j + 1].v, kind: 'class', fatal: true, line: toks[j + 1].line, block: cur().id, idx: j + 1, fn: enclosingFn(), guardedBy: existsNames(), stack: [...stack] });
          }
          j++;
        }
        i = j - 1;
        continue;
      }
      if (prev && isId(prev, 'new')) pending = { kind: 'class', name: null, parenDepth };
      continue;
    }
    if (lower === 'const' && !inClass() && next && next.t === 'id') {
      defs.constants.push({ name: next.v, line: next.line, ctx: ctxOf() });
      // const A = expr, B = expr;  The value expressions are scanned for uses, not as top-level code.
      let j = i + 1;
      while (j < toks.length && !isOp(toks[j], ';')) j++;
      scanUses(i + 2, j);
      i = j - 1;
      continue;
    }
    if (lower === 'define' && isOp(next, '(') && toks[i + 2] && toks[i + 2].t === 'str') {
      defs.constants.push({ name: toks[i + 2].v, line: t.line, ctx: ctxOf() });
      const close = matchClose(toks, i + 1);
      scanUses(i + 3, close);
      i = close;
      continue;
    }

    // Control structures
    if (CONTROL.has(lower) || lower === 'else' || lower === 'try' || lower === 'finally' || lower === 'do') {
      let kind = lower;
      let names = [];
      let j = i + 1;
      if (lower === 'else' && isId(next, 'if')) { kind = 'elseif'; j = i + 2; }
      if (isOp(toks[j], '(')) {
        const close = matchClose(toks, j);
        const cond = toks.slice(j + 1, close);
        if (kind === 'if' || kind === 'elseif') {
          const c = classifyCondition(cond);
          kind = kind === 'if' ? (c.kind === 'cond' ? 'if' : c.kind) : (c.kind === 'exists' ? 'exists' : 'elseif');
          names = c.names;
        } else if (kind === 'catch') {
          for (const u of cond) if (u.t === 'id' && !KEYWORDS.has(u.v.toLowerCase())) {
            uses.push({ name: qualifyClass(u.v), short: u.v, kind: 'class', fatal: false, line: u.line, block: cur().id, idx: i, fn: enclosingFn(), guardedBy: existsNames(), stack: [...stack] });
          }
        }
        // Scan the condition for calls in the outer block (they run whether or not the body does).
        scanUses(j + 1, close);
        i = close;
        parenDepth = parenDepth; // condition parens balanced by skipping
      } else {
        i = j - 1;
      }
      if (kind === 'match') { continue; } // match (...) { ... } is an expression: plain expr block
      if (kind === 'declare') { continue; }
      const blockKind = ['if', 'elseif', 'else'].includes(kind) ? 'if'
        : ['while', 'for', 'foreach', 'do'].includes(kind) ? 'loop'
        : kind;
      if (isOp(toks[i + 1], '{')) {
        pending = { kind: blockKind, names, parenDepth };
      } else if (isOp(toks[i + 1], ':')) {
        // Alternative syntax (if: ... endif;) - treat the rest as the same block. Rare in this codebase.
      } else if (!isOp(toks[i + 1], ';')) {
        const b = openBlock(blockKind, { names, line: t.line, start: i + 1 });
        virtual.push({ blockId: b.id, level: stack.length, paren: parenDepth });
      }
      if (stack.length === 1 && !['guard', 'fileguard'].includes(blockKind)) markTop(t);
      continue;
    }

    // Requires
    if (REQUIRE_KW.has(lower)) {
      let j = i + 1;
      let depth = 0;
      while (j < toks.length) {
        const u = toks[j];
        if (isOp(u, '(')) depth++;
        else if (isOp(u, ')')) { if (depth === 0) break; depth--; }
        else if (depth === 0 && (isOp(u, ';') || isOp(u, ',') || u.t === 'close')) break;
        j++;
      }
      const expr = toks.slice(i + 1, j);
      requires.push({
        line: t.line, idx: i, block: cur().id, stack: [...stack, ...virtual.map((v) => v.blockId)],
        kw: lower, once: lower.endsWith('_once'), resolved: resolveRequirePath(path, expr),
        ctx: ctxOf(), fn: enclosingFn(), suppressed: isOp(toks[i + 1], '@') || isOp(prev, '@'),
      });
      // Skip the path expression; parens inside it are balanced, so parenDepth is unaffected.
      i = j - 1;
      continue;
    }

    if (['return', 'exit', 'die', 'throw', 'continue', 'break'].includes(lower) && cur().kind === 'guard') cur().exitsEarly = true;
    if (stack.length === 1 && (!KEYWORDS.has(lower) || ['echo', 'exit', 'die', 'print'].includes(lower))) markTop(t);
    useAt(i);
  }

  function scanUses(from, to) {
    for (let k = from; k < to; k++) {
      const u = toks[k];
      if (u.t === 'id') useAt(k);
      else if (u.t === 'str' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(u.v)) {
        const callee = toks[k - 2] && isOp(toks[k - 1], '(') && toks[k - 2].t === 'id' ? toks[k - 2].v.toLowerCase() : null;
        if (callee && ['function_exists', 'class_exists', 'defined'].includes(callee)) functionExistsChecks.add(u.v.toLowerCase());
      }
    }
  }

  function useAt(k) {
    const u = toks[k];
    const p = toks[k - 1];
    const nx = toks[k + 1];
    const low = u.v.toLowerCase();
    if (p && p.t === 'op' && (p.v === '->' || p.v === '?->' || p.v === '::')) return;
    if (KEYWORDS.has(low) && !low.includes('\\')) return;
    if (REQUIRE_KW.has(low)) return;
    const st = [...stack, ...virtual.map((v) => v.blockId)];
    const guardedBy = existsNames();
    // `function_exists('x') && x()` / `class_exists('X') ? new X : null` in the same statement.
    for (let j = k - 1; j >= 0 && j >= k - 400; j--) {
      const w = toks[j];
      if (w.t === 'op' && (w.v === ';' || w.v === '{' || w.v === '}')) break;
      if (w.t === 'str' && isOp(toks[j - 1], '(') && toks[j - 2] && toks[j - 2].t === 'id'
        && ['function_exists', 'class_exists', 'interface_exists', 'defined', 'is_callable'].includes(toks[j - 2].v.toLowerCase())
        && !isOp(toks[j - 3], '!')) {
        guardedBy.add(stripNs(w.v).toLowerCase());
      }
    }
    const base = { line: u.line, block: cur().id, idx: k, fn: enclosingFn(), guardedBy, stack: st };
    if (p && isId(p, 'new')) {
      uses.push({ ...base, name: qualifyClass(u.v), short: u.v, kind: 'class', fatal: true });
      return;
    }
    if (isOp(nx, '::')) {
      if (['self', 'static', 'parent'].includes(low)) return;
      uses.push({ ...base, name: qualifyClass(u.v), short: u.v, kind: 'class', fatal: true });
      return;
    }
    if (p && isId(p, 'instanceof')) {
      uses.push({ ...base, name: qualifyClass(u.v), short: u.v, kind: 'class', fatal: false });
      return;
    }
    if (isOp(nx, '(')) {
      if (p && (isId(p, 'function') || isOp(p, '&') && isId(toks[k - 2], 'function'))) return;
      if (p && (isId(p, 'const'))) return;
      // `#[Attribute(...)]`
      if (p && isOp(p, '#[')) return;
      uses.push({ ...base, name: stripNs(u.v), kind: 'function', fatal: true, nsFallback: !u.v.startsWith('\\') && namespace ? namespace : null });
      return;
    }
    // Bare identifier: treat UPPER_CASE names as constants. Lower/mixed-case bare names are type
    // hints, named arguments, labels or goto targets.
    const bare = stripNs(u.v);
    // Type declarations: `PDO $pdo`, `?PDO &$x`, `A|B $x`, `): PDO {`.
    if (nx && (nx.t === 'var' || (nx.t === 'op' && ['&', '...', '|'].includes(nx.v)))) return;
    if (p && p.t === 'op' && (p.v === ':' || p.v === '?' || p.v === '|') && toks[k - 2] && toks[k - 2].t === 'op' && [')', ':', '?', '|'].includes(toks[k - 2].v) && nx && nx.t === 'op' && ['{', ';', '=>', '|'].includes(nx.v)) return;
    if (/^[A-Z_][A-Z0-9_]+$/.test(bare) && !isOp(nx, ':') || (/^[A-Z_][A-Z0-9_]+$/.test(bare) && isOp(nx, ':') && toks.slice(Math.max(0, k - 12), k).some((x) => isOp(x, '?')))) {
      if (p && (isId(p, 'const') || isId(p, 'goto') || isId(p, 'case') && false)) return;
      // `case FOO:` is a constant use; `name: value` in an argument list is not.
      uses.push({ ...base, name: bare, kind: 'const', fatal: true });
    }
  }

  // Close anything left open (unbalanced file: report through blocks with end = 0).
  while (stack.length > 1) closeBlock(toks.length);

  return { path, defs, uses, requires, blocks, functionExistsChecks, globalsRead, sql, namespace, topLevelCode, topLevelCodeAt, tokenCount: toks.length };
}

// ---------------------------------------------------------------------------------------------
// Index and resolution
// ---------------------------------------------------------------------------------------------

/**
 * @param facts      analyzeFile() results
 * @param mapPath    (resolvedPath) => repo path of the file actually analysed, or null. Used to
 *                   fold the root mirror (api/x.php) and dist/api onto public/.
 */
export function buildIndex(facts, { mapPath = (p) => p } = {}) {
  const byPath = new Map(facts.map((f) => [f.path, f]));
  const functions = new Map();
  const classes = new Map();
  const constants = new Map();
  const add = (map, key, val) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(val);
  };
  for (const f of facts) {
    for (const d of f.defs.functions) add(functions, d.name.toLowerCase(), { file: f.path, ...d });
    for (const d of f.defs.classes) add(classes, d.name.toLowerCase(), { file: f.path, ...d });
    for (const d of f.defs.constants) add(constants, d.name, { file: f.path, ...d });
    for (const r of f.requires) {
      let target = null;
      if (r.resolved.path) target = mapPath(r.resolved.path);
      else if (r.resolved.how === 'dynamic' && r.resolved.tail) {
        const tail = r.resolved.tail;
        target = mapPath(/^(api|public|dist|src-php|scripts)\//.test(tail) ? tail : 'api/' + tail);
      }
      r.target = target && byPath.has(target) ? target : null;
      r.missing = !!(r.resolved.path && !r.target);
    }
  }
  const index = { byPath, functions, classes, constants, facts };
  // Unconditional closure per file.
  const closureCache = new Map();
  index.closure = (path) => {
    if (closureCache.has(path)) return closureCache.get(path);
    const seen = new Set([path]);
    const queue = [path];
    while (queue.length) {
      const p = queue.shift();
      const f = byPath.get(p);
      if (!f) continue;
      for (const r of f.requires) {
        if (!r.target || !isUnconditional(f, r)) continue;
        if (!seen.has(r.target)) { seen.add(r.target); queue.push(r.target); }
      }
    }
    closureCache.set(path, seen);
    return seen;
  };
  // Every file reachable through any require (conditional ones included).
  const reachCache = new Map();
  index.reach = (path) => {
    if (reachCache.has(path)) return reachCache.get(path);
    const seen = new Set([path]);
    const queue = [path];
    while (queue.length) {
      const p = queue.shift();
      const f = byPath.get(p);
      if (!f) continue;
      for (const r of f.requires) if (r.target && !seen.has(r.target)) { seen.add(r.target); queue.push(r.target); }
    }
    reachCache.set(path, seen);
    return seen;
  };
  // Who requires whom (any require).
  index.includers = new Map();
  for (const f of facts) for (const r of f.requires) if (r.target) add(index.includers, r.target, { from: f.path, line: r.line, unconditional: isUnconditional(f, r), fn: r.fn });
  return index;
}

/** A require counts toward the closure when only guards, file_exists checks and namespaces enclose it. */
export function isUnconditional(fileFacts, req) {
  return req.stack.every((id) => {
    const k = fileFacts.blocks[id].kind;
    return k === 'file' || k === 'guard' || k === 'fileguard' || k === 'namespace';
  });
}

/** Describe the outermost condition that makes a require conditional, for the report. */
export function describeCondition(fileFacts, req) {
  if (req.fn) return `inside function ${req.fn}()`;
  for (const id of req.stack) {
    const b = fileFacts.blocks[id];
    if (!['file', 'guard', 'fileguard', 'namespace'].includes(b.kind)) return `inside ${b.kind} block (line ${b.line})`;
  }
  return 'unconditional';
}

const lookupFunction = (index, use) => {
  const d = index.functions.get(use.name.toLowerCase());
  if (d) return d;
  if (use.nsFallback) return index.functions.get(`${use.nsFallback}\\${use.name}`.toLowerCase());
  return undefined;
};

const lookupClass = (index, use) => index.classes.get(use.name.toLowerCase())
  || (use.short && !use.short.includes('\\') ? index.classes.get(use.short.toLowerCase()) : undefined);

/**
 * Class A: uses whose definition is not loaded on every path.
 * @param builtins { functions: Set(lower), classes: Set(lower), constants: Set }
 * @returns findings [{ file, line, name, kind, fn, defs, verdict, detail }]
 *   verdict: 'undefined-everywhere' | 'not-loaded' | 'runtime-checked'
 */
export function findUndefinedUses(index, builtins, { vendorClasses = new Set() } = {}) {
  const findings = [];
  for (const f of index.facts) {
    const closure = index.closure(f.path);
    for (const u of f.uses) {
      let defs;
      const lname = u.name.toLowerCase();
      const short = lname.split('\\').pop();
      // Inside `if (function_exists('x'))` or `function_exists('x') && x()`: checked at runtime.
      if (u.guardedBy.has(lname) || u.guardedBy.has(short)) continue;
      if (u.kind === 'function' || u.kind === 'callable') {
        if (builtins.functions.has(u.name.toLowerCase())) continue;
        defs = lookupFunction(index, u);
        if (!defs && u.kind === 'callable') continue; // a string that merely looks like a name
      } else if (u.kind === 'class') {
        if (builtins.classes.has(u.name.toLowerCase()) || builtins.classes.has(short) && !lookupClass(index, u)) continue;
        if (vendorClasses.has(u.name.toLowerCase()) || [...vendorClasses].some((ns) => ns.endsWith('\\') && u.name.toLowerCase().startsWith(ns))) continue;
        defs = lookupClass(index, u);
      } else {
        if (builtins.constants.has(u.name)) continue;
        defs = index.constants.get(u.name);
      }
      if (!defs) {
        findings.push({ file: f.path, line: u.line, name: u.name, kind: u.kind, fatal: u.fatal, fn: u.fn, defs: [], verdict: 'undefined-everywhere' });
        continue;
      }
      // Defined in this file or in its unconditional closure.
      if (defs.some((d) => closure.has(d.file))) continue;
      // Loaded earlier in an enclosing block (lazy require in the same function or branch).
      const dominated = f.requires.some((r) => {
        if (!r.target) return false;
        // A require inside `if (!function_exists(..))` / `if (file_exists(..))` counts for the block around it.
        let e = r.stack.length - 1;
        while (e > 0 && ['guard', 'fileguard'].includes(f.blocks[r.stack[e]].kind)) e--;
        const enclosing = r.stack[e];
        if (!u.stack.includes(enclosing)) return false;
        const fileLevel = f.blocks[enclosing].kind === 'file' || f.blocks[enclosing].kind === 'guard';
        if (!fileLevel && r.idx > u.idx) return false;
        const c = index.closure(r.target);
        return defs.some((d) => c.has(d.file));
      });
      if (dominated) continue;
      // Loaded by a helper in this file that was called earlier in the same block
      // (the ccrm CLI: ccrm_cli_pdo() loads license_client.php, then the caller uses it).
      const viaCallee = f.uses.some((c) => {
        if (c.kind !== 'function' || c.idx >= u.idx || !u.stack.includes(c.stack[c.stack.length - 1])) return false;
        return f.requires.some((r) => r.target && r.fn && r.fn.toLowerCase() === c.name.toLowerCase()
          && defs.some((d) => index.closure(r.target).has(d.file)));
      });
      if (viaCallee) continue;
      const condReqs = f.requires.filter((r) => r.target && defs.some((d) => index.closure(r.target).has(d.file)));
      findings.push({
        file: f.path, line: u.line, name: u.name, kind: u.kind, fatal: u.fatal, fn: u.fn,
        defs: defs.map((d) => ({ file: d.file, line: d.line, ctx: d.ctx })),
        verdict: 'not-loaded',
        fileChecksExistenceElsewhere: f.functionExistsChecks.has(lname) || f.functionExistsChecks.has(short),
        conditionalRequires: condReqs.map((r) => ({ line: r.line, target: r.target, where: describeCondition(f, r) })),
        defIncluders: [...new Set(defs.map((d) => d.file))].flatMap((df) => (index.includers.get(df) || []).map((x) => ({ ...x, of: df }))),
      });
    }
  }
  return findings;
}

/**
 * Class C: files that declare functions/classes/constants outside a guard. Each is a
 * `Cannot redeclare` the moment two paths load it (api/ and dist/api/ in the ccrm CLI).
 */
export function findUnguardedDeclarations(index) {
  const out = [];
  for (const f of index.facts) {
    const fnTop = f.defs.functions.filter((d) => d.ctx === 'top');
    const clsTop = f.defs.classes.filter((d) => d.ctx === 'top');
    const constTop = f.defs.constants.filter((d) => d.ctx === 'top');
    if (!fnTop.length && !clsTop.length && !constTop.length) continue;
    out.push({ file: f.path, functions: fnTop, classes: clsTop, constants: constTop, includers: index.includers.get(f.path) || [] });
  }
  return out;
}

/** Group findings by (file, name) so a symbol used 20 times in one file is one row. */
export function groupFindings(findings) {
  const groups = new Map();
  for (const x of findings) {
    const key = `${x.verdict}|${x.file}|${x.kind}|${x.name.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { ...x, lines: [] });
    groups.get(key).lines.push(x.line);
  }
  return [...groups.values()];
}
