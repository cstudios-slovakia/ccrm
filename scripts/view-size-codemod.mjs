#!/usr/bin/env node
/**
 * View-size codemod — docs/VIEW-SIZE.md §8.2.
 *
 *   node scripts/view-size-codemod.mjs <file|dir …> [--write] [--ws]
 *
 * Report-only unless --write is given. Works on string / template literals that
 * contain a class token, so prose and code are never touched.
 *
 *   - font sizes            text-[10px], text-xs …            → role tokens (§5.2)
 *   - breakpoint sizes      lg:text-xs                        → dropped (§5.2)
 *   - pixel spacing/sizing  w-[140px]                         → w-35   (px / 4)
 *   - eyebrows              tiny + uppercase                  → type-overline (§5.3)
 *   - uppercase elsewhere   ui-size+ uppercase tracking-*     → removed (§5.3)
 *   - --ws                  sm:/md:/lg:/xl:/2xl: layout       → ws-sm: … ws-2xl: (§6.3)
 *   - --roles               page/entity titles, KPI numbers   → type-page-title / type-entity-title / type-metric;
 *                           every other font-black            → font-bold (§5.3)
 *
 * Never touches the fixed scope (Sidebar, dock, pdf/*).
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const WS = args.includes("--ws");
const ROLES = args.includes("--roles");
const targets = args.filter((a) => !a.startsWith("--"));

export const FIXED_SCOPE = [
  /[\\/]components[\\/]Sidebar\.tsx$/,
  /[\\/]magicui[\\/]dock\.tsx$/,
  /[\\/]components[\\/]pdf[\\/]/,
];

/** px → role token (§5.2). `review` marks the cases §5.2 says to look at again. */
export function roleForPx(px) {
  if (px <= 10.5) return { role: "micro" };
  if (px <= 11.5) return { role: "caption" };
  if (px <= 12.5) return { role: "ui" };
  if (px <= 13.5) return { role: "ui", review: "13px text: check whether this is running text (type-body)" };
  if (px <= 14.5) return { role: "body" };
  if (px <= 16.5) return { role: "title-sm" };
  if (px <= 20.5) return { role: "title" };
  if (px <= 26.5) return { role: "heading" };
  if (px <= 36.5) return { role: "display", review: "display size: KPI numbers should be text-metric" };
  return null; // hero type: allow-listed per file
}

const STOCK = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36 };
const SIZE_ORDER = ["micro", "caption", "ui", "body", "title-sm", "title", "heading", "display"];
const BREAKPOINT = /(^|:)(sm|md|lg|xl|2xl):/;
const BP_PREFIX = /^((?:[\w\-\[\]&>*=()]+:)*?)(sm|md|lg|xl|2xl):/;

const FONT_RE =
  /^(?<pre>(?:[^\s:]+:)*)(?<neg>!?)text-(?:\[(?<num>[0-9]*\.?[0-9]+)(?<unit>px|rem)\]|(?<stock>xs|sm|base|lg|xl|2xl|3xl|4xl))$/;

const SPACING_PROPS =
  "w|h|min-w|max-w|min-h|max-h|size|gap|gap-x|gap-y|p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|top|left|right|bottom|inset|inset-x|inset-y|basis|space-x|space-y";
const PX_RE = new RegExp(`^(?<pre>(?:[^\\s:]+:)*)(?<neg>-?)(?<prop>${SPACING_PROPS})-\\[(?<n>[0-9]*\\.?[0-9]+)px\\]$`);

const report = [];
const note = (file, line, msg) => report.push({ file, line, msg });

function mapFontToken(tok) {
  const m = FONT_RE.exec(tok);
  if (!m) return null;
  const { pre, neg, num, unit, stock } = m.groups;
  const px = stock ? STOCK[stock] : unit === "rem" ? parseFloat(num) * 16 : parseFloat(num);
  const r = roleForPx(px);
  if (!r) return { keep: true };
  return { pre, role: r.role, review: r.review, px };
}

function rewriteSegment(seg, file, line, stats, before = "") {
  if (!/(text-|-\[[0-9.]+px\]|uppercase|font-black|\b(sm|md|lg|xl|2xl):)/.test(seg)) return seg;
  const parts = seg.split(/(\s+)/); // keep whitespace
  const isTok = (p) => p !== "" && !/^\s+$/.test(p);

  // ---- font sizes ------------------------------------------------------
  const plain = []; // indices of unprefixed (or state-prefixed) size tokens
  const bp = []; // breakpoint-prefixed size tokens
  parts.forEach((p, i) => {
    if (!isTok(p)) return;
    const m = mapFontToken(p);
    if (!m || m.keep) return;
    (BREAKPOINT.test(m.pre) ? bp : plain).push({ i, ...m });
  });

  const drop = new Set();
  for (const p of plain) {
    parts[p.i] = `${p.pre}text-${p.role}`;
    stats.font++;
    if (p.review) note(file, line, p.review);
  }
  if (bp.length) {
    if (plain.some((p) => !p.pre)) {
      bp.forEach((b) => (drop.add(b.i), stats.dropped++));
    } else {
      // Only prefixed sizes: keep the largest, report it.
      const biggest = bp.reduce((a, b) => (SIZE_ORDER.indexOf(b.role) > SIZE_ORDER.indexOf(a.role) ? b : a));
      bp.forEach((b) => {
        if (b === biggest) {
          parts[b.i] = `text-${b.role}`;
          stats.font++;
        } else drop.add(b.i);
        stats.dropped++;
      });
      note(file, line, `only breakpoint-prefixed sizes (${bp.length}); kept the largest as text-${biggest.role}`);
    }
  }

  // ---- pixel spacing / sizing -------------------------------------------
  parts.forEach((p, i) => {
    if (!isTok(p) || drop.has(i)) return;
    const m = PX_RE.exec(p);
    if (!m) return;
    const { pre, neg, prop, n } = m.groups;
    const px = parseFloat(n);
    if (px === 1 && (prop === "h" || prop === "w")) {
      parts[i] = `${pre}${prop}-px`;
      stats.px++;
    } else if (Number.isInteger(px)) {
      const v = px / 4;
      parts[i] = `${pre}${neg}${prop}-${Number.isInteger(v) ? v : String(v)}`;
      stats.px++;
    } else note(file, line, `fractional pixel value left: ${p}`);
  });

  // ---- case ----------------------------------------------------------------
  const toks = parts.map((p, i) => (isTok(p) && !drop.has(i) ? p : null));
  const roleOf = (t) => {
    const m = /(?:^|:)text-(micro|caption|ui|body|title-sm|title|heading|display|metric)$/.exec(t || "");
    return m ? m[1] : null;
  };
  const upperIdx = toks.findIndex((t) => t === "uppercase");
  if (upperIdx >= 0) {
    const sizeIdx = toks.findIndex((t) => t && !t.includes(":") && roleOf(t));
    const role = sizeIdx >= 0 ? roleOf(toks[sizeIdx]) : null;
    const trackingIdx = toks.map((t, i) => (t && /^tracking-/.test(t) ? i : -1)).filter((i) => i >= 0);
    if (role === "micro" || role === "caption") {
      parts[sizeIdx] = "type-overline";
      toks.forEach((t, i) => {
        if (t && (/^font-(black|extrabold|bold|semibold|medium)$/.test(t) || /^tracking-/.test(t) || t === "uppercase"))
          drop.add(i);
      });
      stats.overline++;
    } else if (role) {
      drop.add(upperIdx);
      trackingIdx.forEach((i) => drop.add(i));
      stats.caseFixed++;
    }
  }

  // ---- roles (§5.1, §5.3) ----------------------------------------------------------
  if (ROLES) {
    const has = (t) => parts.some((p, i) => p === t && !drop.has(i));
    const swap = (t, to) => parts.forEach((p, i) => { if (p === t && !drop.has(i)) { if (to) parts[i] = to; else drop.add(i); } });
    const isHeading = /<h[1-6][^<>]*$/.test(before.slice(-300));
    const tight = () => { swap("tracking-tight", null); swap("tracking-tighter", null); };
    if (has("text-heading") && has("font-heading") && (has("font-extrabold") || has("font-black"))) {
      swap("text-heading", "type-page-title"); swap("font-heading", null); swap("font-extrabold", null); swap("font-black", null); tight(); stats.roles++;
    } else if (has("text-display") && has("font-heading") && has("font-black")) {
      swap("text-display", "type-entity-title"); swap("font-heading", null); swap("font-black", null); tight(); stats.roles++;
    } else if ((has("text-heading") || has("text-display")) && has("font-black") && !has("font-heading") && !isHeading) {
      swap("text-heading", "type-metric"); swap("text-display", "type-metric"); swap("font-black", null); tight(); stats.roles++;
    }
    const keepsBlack = parts.some((p, i) => !drop.has(i) && /^(type-page-title|type-entity-title|type-metric|text-metric)$/.test(p));
    if (!keepsBlack && has("font-black")) { swap("font-black", "font-bold"); stats.roles++; }
  }

  // ---- workspace breakpoints -------------------------------------------------
  if (WS) {
    parts.forEach((p, i) => {
      if (!isTok(p) || drop.has(i) || !BP_PREFIX.test(p)) return;
      // Container-query variants cannot wrap arbitrary stacked variants; only convert the simple, common shapes.
      parts[i] = p.replace(/(^|:)(sm|md|lg|xl|2xl):/, (_, a, b) => `${a}ws-${b}:`);
      stats.ws++;
    });
  }

  // rebuild, collapsing whitespace left by dropped tokens
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    if (drop.has(i)) {
      // swallow one adjacent whitespace run
      if (i + 1 < parts.length && /^\s+$/.test(parts[i + 1]) && out !== "" && !/\s$/.test(out)) continue;
      if (i + 1 < parts.length && /^\s+$/.test(parts[i + 1])) i++;
      continue;
    }
    out += parts[i];
  }
  if (!/\s$/.test(seg)) out = out.replace(/[ 	]+$/, "");
  if (!/^\s/.test(seg)) out = out.replace(/^[ 	]+/, "");
  return out;
}

export function transform(text, file = "<input>") {
  const stats = { font: 0, dropped: 0, px: 0, overline: 0, caseFixed: 0, ws: 0, roles: 0 };
  const lines = text.split("\n");
  const lineAt = (idx) => text.slice(0, idx).split("\n").length;
  const STR = /"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g;
  const out = text.replace(STR, (whole, a, b, c, offset) => {
    const body = a ?? b ?? c;
    const q = whole[0];
    if (!/(text-|-\[[0-9.]+px\]|uppercase|font-black|\b(sm|md|lg|xl|2xl):)/.test(body)) return whole;
    // A string with ${…} keeps its expressions; only the literal class tokens move.
    const next = rewriteSegment(body, file, lineAt(offset), stats, text.slice(Math.max(0, offset - 300), offset));
    return next === body ? whole : q + next + q;
  });
  // Quoted strings nested inside ${…} of a template literal were swallowed by the
  // backtick match above; a second pass over plain quotes picks them up.
  const QUOTED = /"([^"\n]*)"|'([^'\n]*)'/g;
  const out2 = out.replace(QUOTED, (whole, a, b, offset) => {
    const body = a ?? b;
    if (!/(text-|-\[[0-9.]+px\]|uppercase|font-black|(sm|md|lg|xl|2xl):)/.test(body)) return whole;
    const next = rewriteSegment(body, file, lineAt(offset), stats, text.slice(Math.max(0, offset - 300), offset));
    return next === body ? whole : whole[0] + next + whole[0];
  });
  // things only a human can do
  lines.forEach((l, i) => {
    if (/\bfontSize\s*[:=]\s*\{?\s*[0-9]/.test(l)) note(file, i + 1, "inline fontSize literal: use typePx() / a token");
    if (/\bmax-w-\[1600px\]/.test(l)) note(file, i + 1, "max-w-[1600px] page cap");
  });
  return { out: out2, stats };
}

function collect(p, acc = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) collect(path.join(p, e), acc);
  } else if (/\.tsx$/.test(p) && !/\.test\./.test(p)) acc.push(p);
  return acc;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("view-size-codemod.mjs")) {
  const files = (targets.length ? targets : ["src"]).flatMap((t) => collect(t));
  let changed = 0;
  const total = { font: 0, dropped: 0, px: 0, overline: 0, caseFixed: 0, ws: 0, roles: 0 };
  for (const f of files) {
    if (FIXED_SCOPE.some((re) => re.test(f))) continue;
    const src = fs.readFileSync(f, "utf8");
    const { out, stats } = transform(src, f);
    const n = Object.values(stats).reduce((a, b) => a + b, 0);
    if (n === 0) continue;
    changed++;
    for (const k of Object.keys(total)) total[k] += stats[k];
    console.log(`${f}: ${JSON.stringify(stats)}`);
    if (WRITE && out !== src) fs.writeFileSync(f, out);
  }
  console.log(`\n${changed} files ${WRITE ? "rewritten" : "would change"}; totals ${JSON.stringify(total)}`);
  const seen = new Set();
  for (const r of report) {
    const k = `${r.file}:${r.line}:${r.msg}`;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`  review ${r.file}:${r.line}  ${r.msg}`);
  }
}
