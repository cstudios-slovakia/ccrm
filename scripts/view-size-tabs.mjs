#!/usr/bin/env node
/**
 * Replaces a hand-built tab bar with <Tabs> (docs/VIEW-SIZE.md §6.2).
 *
 *   node scripts/view-size-tabs.mjs <file> <line-of-the-bar's-opening-div> [--write]
 *
 * The bar must be a div whose only children are buttons of the shape
 *
 *   <button onClick={() => setX("key")} className={`… ${x === "key" ? … : …}`}>
 *     <Icon className="…" /> <span>label</span> <span className={`…`}>{count}</span>
 *   </button>
 *
 * All buttons must share one setter and one state variable. Anything else
 * (conditional buttons, extra elements, wrapped setters) exits non-zero without
 * touching the file.
 */
import fs from "node:fs";

const [file, line, ...flags] = process.argv.slice(2);
const WRITE = flags.includes("--write");
let src = fs.readFileSync(file, "utf8");
const crlf = src.includes("\r\n");
if (crlf) src = src.replace(/\r\n/g, "\n");
const L = src.split("\n");
const bail = (m) => {
  console.error(`${file}:${line}: ${m}`);
  process.exit(2);
};
const indentOf = (l) => l.length - l.trimStart().length;

const open = Number(line) - 1;
if (!/<div\b/.test(L[open])) bail("not a div line");
let depth = 0;
let close = -1;
for (let i = open; i < L.length; i++) {
  depth += (L[i].match(/<div[\s>]/g) || []).length - (L[i].match(/<\/div>/g) || []).length;
  if (depth === 0) {
    close = i;
    break;
  }
}
if (close < 0) bail("bar end");

const childInd = indentOf(L[open + 1]);
const buttons = [];
for (let i = open + 1; i < close; i++) {
  if (!L[i].trim()) continue;
  if (indentOf(L[i]) !== childInd) bail(`unexpected line at ${i + 1}`);
  if (!/^<button\b/.test(L[i].trim())) bail(`child at ${i + 1} is not a button: ${L[i].trim().slice(0, 40)}`);
  let e = i;
  while (e < close && !(indentOf(L[e]) === childInd && L[e].trim() === "</button>")) e++;
  buttons.push(L.slice(i, e + 1).join("\n"));
  i = e;
}
if (buttons.length < 2) bail("fewer than two buttons");

let setter = null;
let stateVar = null;
const items = buttons.map((b) => {
  const click = /onClick=\{\(\) => (\w+)\((?:"|')([\w-]+)(?:"|')\)\}/.exec(b);
  if (!click) bail("onClick shape: " + b.slice(0, 80));
  const act = /(\w+) === ["']([\w-]+)["']/.exec(b);
  if (!act || act[2] !== click[2]) bail("active condition shape: " + click[2]);
  if (setter && setter !== click[1]) bail("different setters");
  if (stateVar && stateVar !== act[1]) bail("different state variables");
  setter = click[1];
  stateVar = act[1];

  const bodyStart = b.indexOf("\n", b.search(/>\s*\n/) >= 0 ? b.search(/>\s*\n/) : 0);
  // opening tag ends at the first line that is exactly ">" or ends with ">" after className
  const lines = b.split("\n");
  let k = 0;
  while (k < lines.length && !/^\s*>\s*$/.test(lines[k]) && !/^\s*<button[^\n]*[^=]>\s*$/.test(lines[k])) k++;
  let inner = lines.slice(k + 1, lines.length - 1).join("\n").trim();
  void bodyStart;

  let count = "";
  const cm = /<span\b[^>]*className=\{`[^`]*`\}[^>]*>\s*\{([^{}]+)\}\s*<\/span>\s*$/.exec(inner);
  if (cm) {
    count = cm[1].trim();
    inner = inner.slice(0, cm.index).trim();
  }
  let icon = "";
  const im = /^(<[A-Z]\w*\s+className="[^"]*"\s*\/>)\s*/.exec(inner);
  if (im) {
    icon = im[1];
    inner = inner.slice(im[0].length).trim();
  }
  const sm = /^<span>([\s\S]*)<\/span>$/.exec(inner);
  if (sm) inner = sm[1].trim();
  if (!inner) bail("empty label for " + click[2]);
  const label = /^\{[\s\S]*\}$/.test(inner) && !/\}\s*\{/.test(inner) ? inner.slice(1, -1).trim() : `<>${inner}</>`;
  return { key: click[2], icon, label, count };
});

const ind = " ".repeat(indentOf(L[open]));
const out = [
  `${ind}<Tabs`,
  `${ind}  value={${stateVar}}`,
  `${ind}  onChange={${setter}}`,
  `${ind}  items={[`,
  ...items.map(
    (it) =>
      `${ind}    { key: "${it.key}", ${it.icon ? `icon: ${it.icon}, ` : ""}label: ${it.label}${it.count ? `, count: ${it.count}` : ""} },`,
  ),
  `${ind}  ]}`,
  `${ind}/>`,
];
console.log(`${file}: tab bar ${open + 1}-${close + 1} → <Tabs> (${items.length} tabs; ${stateVar}/${setter})`);
if (WRITE) {
  L.splice(open, close - open + 1, ...out);
  let res = L.join("\n");
  const rel = /components\/[^/]+\/[^/]+$/.test(file.replace(/\\/g, "/")) ? "../layout" : "./layout";
  if (!/\bTabs\b[^;]*from "\.{1,2}\/layout"/.test(res)) {
    if (/from "\.{1,2}\/layout"/.test(res)) {
      res = res.replace(/import \{([^}]*)\} from "(\.{1,2}\/layout)";/, (a, n, p) => `import {${n.trimEnd()}, Tabs } from "${p}";`);
    } else {
      const m = [...res.matchAll(/^import [^;]*?from\s+["'][^"']+["'];?$/gms)].pop();
      res = res.slice(0, m.index + m[0].length) + `\nimport { Tabs } from "${rel}";` + res.slice(m.index + m[0].length);
    }
  }
  fs.writeFileSync(file, crlf ? res.replace(/\n/g, "\r\n") : res);
}
