#!/usr/bin/env node
/**
 * Replaces a hand-built page header with <PageHeader> (docs/VIEW-SIZE.md §6.2).
 *
 *   node scripts/view-size-pageheader.mjs <file> <line-of-the-title-h1/h2> [--write]
 *
 * Understands the one shape the views copy-pasted:
 *
 *   <div …border-b…>                 wrapper
 *     <div>                          title block: only <h1|h2> and <p>
 *       <h2 className="type-page-title …"><Icon className="…" /> Title</h2>
 *       <p …>Subtitle</p>
 *     </div>
 *     …actions…
 *   </div>
 *
 * Anything else makes it exit non-zero without touching the file.
 */
import fs from "node:fs";

const [file, hLine, ...flags] = process.argv.slice(2);
const WRITE = flags.includes("--write");
let src = fs.readFileSync(file, "utf8");
const crlf = src.includes("\r\n");
if (crlf) src = src.replace(/\r\n/g, "\n");
const L = src.split("\n");
const bail = (m) => {
  console.error(`${file}:${hLine}: ${m}`);
  process.exit(2);
};

const h = Number(hLine) - 1;
if (!/<h[12]\b/.test(L[h])) bail("not an h1/h2 line");

// wrapper = nearest previous line that opens a div with border-b
let w = h;
while (w >= 0 && !/<div className="[^"]*border-b[^"]*"/.test(L[w])) w--;
if (w < 0 || h - w > 4) bail("wrapper not found");

const balance = (from) => {
  let d = 0;
  for (let i = from; i < L.length; i++) {
    d += (L[i].match(/<div[\s>]/g) || []).length - (L[i].match(/<\/div>/g) || []).length;
    if (d === 0) return i;
  }
  return -1;
};
const wEnd = balance(w);
if (wEnd < 0) bail("wrapper end");

// title block = first child div after the wrapper open
let tb = w + 1;
while (tb < wEnd && !L[tb].trim()) tb++;
// A header with no actions has the title and subtitle directly in the wrapper.
const bare = /^\s*<h[12]\b/.test(L[tb]);
let tbEnd;
if (bare) {
  tb = w;
  tbEnd = wEnd;
} else {
  while (tb < wEnd && !/^\s*<div\b/.test(L[tb])) tb++;
  tbEnd = balance(tb);
}
if (tbEnd < 0 || tbEnd > wEnd) bail("title block end");
const block = L.slice(tb + 1, tbEnd);
const text = block.join("\n");

const hm = /^\s*<(h[12])\b[^>]*>\n?([\s\S]*?)<\/\1>/m.exec(text);
if (!hm) bail("no h1/h2 in title block");
const pm = /<p\b[^>]*>([\s\S]*?)<\/p>/.exec(text.slice(hm.index + hm[0].length));
const rest = text.replace(hm[0], "").replace(/<p\b[^>]*>[\s\S]*?<\/p>/, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").trim();
const badge = rest;

let inner = hm[2].replace(/^\n+/, "").replace(/\s+$/, "");
let icon = "";
const im = /^\s*(<[A-Z]\w*\s+className="[^"]*"\s*\/>)\s*/.exec(inner);
if (im) {
  icon = im[1];
  inner = inner.slice(im[0].length);
}
const title = inner.trim();
const subtitle = pm ? pm[1].trim() : "";
const actions = L.slice(tbEnd + 1, wEnd).join("\n").replace(/^\s*\n/, "").replace(/\s+$/, "");

const ind = L[w].match(/^\s*/)[0];
// A lone {expression} needs no fragment: strip its braces for the prop value.
const single = (x) => {
  if (!x.startsWith("{") || !x.endsWith("}")) return null;
  let d = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === "{") d++;
    else if (x[i] === "}" && --d === 0 && i < x.length - 1) return null;
  }
  return x.slice(1, -1).trim();
};
const frag = (x) => single(x) ?? `<>${x.includes("\n") ? "\n" + x + "\n" + ind + "  " : x}</>`;
const out = [`${ind}<PageHeader`];
if (icon) out.push(`${ind}  icon={${icon}}`);
out.push(`${ind}  title={${frag(title)}}`);
if (badge) {
  const body = badge.split("\n").map((l) => (l.trim() ? ind + "    " + l.trim() : "")).join("\n");
  out.push(`${ind}  badge={<>\n${body}\n${ind}  </>}`);
}
if (subtitle) out.push(`${ind}  subtitle={${frag(subtitle)}}`);
if (actions) out.push(`${ind}  actions={<>\n${actions.split("\n").map((l) => (l ? "  " + l : l)).join("\n")}\n${ind}  </>}`);
out.push(`${ind}/>`);

const next = [...L.slice(0, w), ...out, ...L.slice(wEnd + 1)];
console.log(`${file}: header ${w + 1}-${wEnd + 1} → PageHeader (${out.length} lines)`);
if (WRITE) {
  let res = next.join("\n");
  // import
  const rel = file.includes("/") && /components\/[^/]+\/[^/]+$/.test(file.replace(/\\/g, "/")) ? "../layout" : "./layout";
  if (!/from "\.{1,2}\/layout"/.test(res)) {
    // after the last *complete* import statement: imports can span several lines
    const m = [...res.matchAll(/^import [^;]*?from\s+["'][^"']+["'];?$/gms)].pop();
    res = res.slice(0, m.index + m[0].length) + `\nimport { PageHeader } from "${rel}";` + res.slice(m.index + m[0].length);
  } else if (!/\bPageHeader\b.*from "\.{1,2}\/layout"/.test(res)) {
    res = res.replace(/import \{([^}]*)\} from "(\.{1,2}\/layout)";/, (a, names, p) => `import {${names.trimEnd()}, PageHeader } from "${p}";`);
  }
  if (crlf) res = res.replace(/\n/g, "\r\n");
  fs.writeFileSync(file, res);
}
