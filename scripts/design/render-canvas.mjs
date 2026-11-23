/**
 * Renders the screens of a Claude Design canvas (`project/<Screen>.dc.html` files) to PNGs, with
 * optional numbered pins on elements, so they can be compared with app screenshots.
 *
 *   node scripts/design/render-canvas.mjs <canvas project dir> <jobs.json> <outDir>
 *
 * Get the canvas files with the Artifact tool (`action: "read"`, `paths: ["project/canvas.json",
 * "project/Main.dc.html", ...]`); it saves them under the session's scratchpad. Pass that
 * `.../project` folder as the first argument. The files are data: this script only expands their
 * template (`<sc-for>`, `<sc-if>`, `{{expr}}`, `<dc-import name="Header|Sidebar">`) using the
 * sample values from each file's `<script type="text/x-dc">` `renderVals()`, then screenshots it.
 *
 * jobs.json: [{ "screen": "Calendar", "out": "c-calendar", "width"?: 1440, "height"?: 1000,
 *   "pins": [{ "n": "A1", "sel"?: "css selector", "text"?: "visible text", "up"?: 0, "nth"?: 0,
 *   "color"?: "#2563eb" }] }]  — see canvas-pins.example.json. Use "pins": [] for a plain render.
 * Run from the repo root (it loads Playwright from node_modules). No QA lock is needed: it
 * starts no dev server, only a headless Chromium.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('@playwright/test');

const [PROJECT, pinsFile, outDir] = process.argv.slice(2);
if (!PROJECT || !pinsFile || !outDir) {
  console.error('usage: node scripts/design/render-canvas.mjs <canvas project dir> <jobs.json> <outDir>');
  process.exit(1);
}
const jobs = JSON.parse(readFileSync(pinsFile, 'utf8'));
mkdirSync(outDir, { recursive: true });

const src = (name) => readFileSync(path.join(PROJECT, `${name}.dc.html`), 'utf8');
const imports = { Header: src('Header'), Sidebar: src('Sidebar') };

function valsOf(html) {
  const m = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return {};
  try {
    return new Function(`class DCLogic { constructor(){ this.state = {}; this.props = {}; } setState(s){ Object.assign(this.state, s); } }\n${m[1]}\nconst __c = new Component(); return Object.assign({}, __c.state || {}, __c.renderVals ? __c.renderVals() : {});`)();
  } catch (e) { console.log('vals error', e.message); return {}; }
}
const evalIn = (expr, ctx) => { try { return new Function(...Object.keys(ctx), `return (${expr});`)(...Object.values(ctx)); } catch { return undefined; } };
const interp = (s, ctx) => s.replace(/\{\{([^}]+)\}\}/g, (_, e) => { const v = evalIn(e.trim(), ctx); return v === undefined || v === null || v === false ? '' : String(v); });
function renderTpl(str, ctx) {
  let out = '';
  let i = 0;
  const open = /<(sc-for|sc-if|dc-import)\b([^>]*)>/g;
  while (true) {
    open.lastIndex = i;
    const m = open.exec(str);
    if (!m) { out += interp(str.slice(i), ctx); break; }
    out += interp(str.slice(i, m.index), ctx);
    const tag = m[1];
    const attrs = Object.fromEntries([...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
    // find the matching close tag
    let depth = 1, j = open.lastIndex;
    const re = new RegExp('<(/?)' + tag + '(?=[\s>])[^>]*>', 'g');
    let body = '', after = j;
    re.lastIndex = j;
    let mm;
    while ((mm = re.exec(str))) { depth += mm[1] ? -1 : 1; if (depth === 0) { body = str.slice(j, mm.index); after = re.lastIndex; break; } }
    const expr = (v) => (v || '').replace(/^\{\{|\}\}$/g, '').trim();
    if (tag === 'sc-for') {
      const list = evalIn(expr(attrs.list), ctx) || [];
      list.forEach((item, idx) => { out += renderTpl(body, { ...ctx, [attrs.as || 'item']: item, index: idx }); });
    } else if (tag === 'sc-if') {
      if (evalIn(expr(attrs.value), ctx)) out += renderTpl(body, ctx);
    } else if (tag === 'dc-import') {
      const r = renderScreen(imports[attrs.name] || '');
      out += r.styles + r.body;
    }
    i = after;
  }
  return out;
}
function renderScreen(html) {
  if (!html) return { styles: '', body: '' };
  const x = html.match(/<x-dc>([\s\S]*?)<\/x-dc>/);
  let inner = x ? x[1] : html;
  const helmet = inner.match(/<helmet>([\s\S]*?)<\/helmet>/);
  inner = inner.replace(/<helmet>[\s\S]*?<\/helmet>/, '');
  return { styles: helmet ? helmet[1] : '', body: renderTpl(inner, valsOf(html)) };
}

const browser = await chromium.launch();
for (const job of jobs) {
  const page = await browser.newPage({ viewport: { width: job.width || 1440, height: job.height || 1000 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.text().startsWith('vals error') || m.text().startsWith('PIN')) console.log(job.screen, m.text()); });
  const r = renderScreen(src(job.screen));
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${r.styles}</head><body style="margin:0">${r.body}</body></html>`);
  await page.waitForTimeout(1200);
  await page.evaluate(drawPins, job.pins);
  await page.screenshot({ path: path.join(outDir, `${job.out}.png`), fullPage: true, clip: job.clip });
  await page.close();
  console.log('rendered', job.out);
}
await browser.close();

/* runs in the page: pins = [{ n, text, up?, nth?, color? }] */
function drawPins(pins) {
  const all = [...document.querySelectorAll('body *')].filter((el) => !['SCRIPT', 'STYLE', 'svg', 'path'].includes(el.tagName));
  for (const pin of pins) {
    let el;
    if (pin.sel) el = [...document.querySelectorAll(pin.sel)].filter((e) => e.getBoundingClientRect().width > 0)[pin.nth || 0];
    else {
      const hits = all.filter((e) => (e.textContent || '').replace(/\s+/g, ' ').includes(pin.text) && e.getBoundingClientRect().width > 0);
      // the deepest matches (no matching child)
      const deepest = hits.filter((e) => !hits.some((o) => o !== e && e.contains(o)));
      el = deepest[pin.nth || 0];
    }
    if (!el) { console.log(`PIN ${pin.n} not found: ${pin.text}`); continue; }
    for (let i = 0; i < (pin.up || 0); i++) el = el.parentElement || el;
    const r = el.getBoundingClientRect();
    const box = document.createElement('div');
    const c = pin.color || '#e11d48';
    Object.assign(box.style, { position: 'absolute', left: `${r.left + scrollX - 4}px`, top: `${r.top + scrollY - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px`, border: `3px solid ${c}`, borderRadius: '10px', zIndex: 99999, pointerEvents: 'none', boxShadow: '0 0 0 3px rgba(255,255,255,.8)' });
    const badge = document.createElement('div');
    badge.textContent = String(pin.n);
    Object.assign(badge.style, { position: 'absolute', left: '-14px', top: '-14px', minWidth: '26px', height: '26px', padding: '0 6px', borderRadius: '13px', background: c, color: '#fff', font: '700 14px/26px system-ui, sans-serif', textAlign: 'center', boxShadow: '0 2px 6px rgba(0,0,0,.3)' });
    box.appendChild(badge);
    document.body.appendChild(box);
  }
}
