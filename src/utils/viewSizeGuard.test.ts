import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Guard for docs/VIEW-SIZE.md §9.1: no hand-written font sizes, pixel widths or
 * page caps in the UI. Sizes come from the view-size tokens.
 *
 * `FIXED_SCOPE` is permanent (the aside and paper documents never scale).
 * `PENDING` is the migration ledger: it only ever shrinks, and Phase F needs it
 * empty. Never loosen a pattern to make a file pass.
 */

const SRC = path.resolve(import.meta.dirname, "..");

const FIXED_SCOPE: Array<string | RegExp> = [
  "components/Sidebar.tsx",
  "components/magicui/dock.tsx",
  /^components\/pdf\//,
];

/** Hero / decorative type and true canvas geometry that must stay hand-sized. */
const ALLOWED: Array<{ file: string; pattern: RegExp; reason: string }> = [
  { file: "components/LoginView.tsx", pattern: /text-[5-9]xl/, reason: "login hero type" },
];

const PENDING: string[] = [];

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "arbitrary font size", re: /\btext-\[[0-9.]+(?:px|rem)\]/g },
  { name: "stock font size", re: /(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-4]xl)(?![\w-])/g },
  { name: "breakpoint-prefixed font size", re: /\b(?:sm|md|lg|xl|2xl):text-(?:\[|xs|sm|base|lg|xl|[2-9]xl|micro|caption|ui|body|title|heading|display|metric)/g },
  { name: "inline fontSize literal", re: /\bfontSize\s*[:=]\s*\{?\s*[0-9]/g },
  {
    name: "arbitrary pixel size/spacing",
    re: /(?<![\w-])-?(?:w|h|min-w|max-w|min-h|max-h|size|gap|gap-x|gap-y|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|top|left|right|bottom|inset|inset-x|inset-y|basis)-\[-?[0-9.]+px\]/g,
  },
  { name: "page cap max-w-[1600px]", re: /max-w-\[1600px\]/g },
];

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
};

const rel = (p: string) => path.relative(SRC, p).split(path.sep).join("/");
const exempt = (f: string) => FIXED_SCOPE.some((x) => (typeof x === "string" ? x === f : x.test(f)));

const findOffences = (file: string, text: string): string[] => {
  const hits: string[] = [];
  const lines = text.split("\n");
  for (const { name, re } of PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      re.lastIndex = 0;
      for (const m of lines[i].matchAll(re)) {
        if (ALLOWED.some((a) => a.file === file && a.pattern.test(m[0]))) continue;
        hits.push(`${file}:${i + 1}  ${name}: ${m[0]}`);
      }
    }
  }
  // inner reading caps: max-w-5xl/6xl/7xl together with mx-auto in one class string
  lines.forEach((l, i) => {
    if (/max-w-(?:5xl|6xl|7xl)\b/.test(l) && /\bmx-auto\b/.test(l)) hits.push(`${file}:${i + 1}  inner page cap: max-w-(5xl|6xl|7xl) mx-auto`);
  });
  return hits;
};

test("no hand-written sizes outside the fixed scope", () => {
  const offences: string[] = [];
  for (const f of walk(SRC)) {
    const r = rel(f);
    if (exempt(r) || PENDING.includes(r)) continue;
    offences.push(...findOffences(r, fs.readFileSync(f, "utf8")));
  }
  assert.deepEqual(offences.slice(0, 40), [], `${offences.length} view-size violations (first 40 shown)`);
});

test("the ledger only lists files that still offend", () => {
  for (const r of PENDING) {
    const f = path.join(SRC, r);
    assert.ok(fs.existsSync(f), `${r} is in PENDING but does not exist`);
    assert.ok(findOffences(r, fs.readFileSync(f, "utf8")).length > 0, `${r} is clean: remove it from PENDING`);
  }
});

test("the fixed scope is not on the ledger", () => {
  for (const r of PENDING) assert.ok(!exempt(r), `${r} is fixed scope`);
});
