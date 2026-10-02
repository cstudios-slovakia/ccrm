import { test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { installDemoBackend } from '../demo/demoMocks';
import { buildSyncPayload, DEMO_USER } from '../demo/demoData';

/**
 * Screenshot kit for the automated release notes (docs/RELEASE-NOTES.md).
 *
 * A release spec never calls `page.screenshot()` itself. It uses the three shot
 * helpers below, so every article — whoever or whatever wrote the spec — gets
 * the same framing and the same annotation style:
 *
 *   shotView(page, name)               the whole screen, for a new view
 *   shotZoom(page, target, name)       a crop around one element (dropdown, card, button group)
 *   ...both take { marks: [...] }      numbered callouts drawn on top
 *
 * The spec runs once per language (Playwright projects `sk`, `en`, `hu`): the app
 * UI switches language and `L({ sk, en, hu })` picks the callout text, so every
 * Craft site gets screenshots in its own language.
 */

export type Lang = 'sk' | 'en' | 'hu';
export type Localized = Record<Lang, string>;

export const lang = (): Lang => {
  const name = test.info().project.name;
  return name === 'en' || name === 'hu' ? name : 'sk';
};

/** Picks the text for the language this run is capturing. */
export const L = (text: Localized): string => text[lang()] ?? text.sk;

const outDir = () => path.join(process.env.RELEASE_SHOTS_OUT ?? 'test-results/release-shots', lang());

/* -------------------------------------------------------------------------- */
/* Backend                                                                    */
/* -------------------------------------------------------------------------- */

type SyncPayload = ReturnType<typeof buildSyncPayload> & Record<string, any>;

/**
 * The demo backend (tests/demo) in the language of the current project, with an
 * optional hook to add the data a new feature needs. `patchSync` receives the
 * full `/sync.php` payload and returns the one to serve:
 *
 *   await setupRelease(page, { patchSync: (p) => ({ ...p, employees: EMPLOYEES }) });
 */
export async function setupRelease(page: Page, opts: { patchSync?: (payload: SyncPayload) => SyncPayload } = {}) {
  const language = lang();
  await installDemoBackend(page);

  const withLanguage = (metadataJson: string) =>
    JSON.stringify({ ...JSON.parse(metadataJson || '{}'), language });

  // Registered after the demo backend, so it wins for GET /sync.php.
  await page.route('**/sync.php**', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    let payload = buildSyncPayload() as SyncPayload;
    payload = {
      ...payload,
      settings: { ...payload.settings, systemLanguage: language },
      users: payload.users.map((u: any) => (u.id === DEMO_USER.id ? { ...u, metadata_json: withLanguage(u.metadata_json) } : u)),
    };
    if (opts.patchSync) payload = opts.patchSync(payload);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });

  // The real Craft news feed would add a "new update" dot that depends on the day.
  await page.route('**/index.php?action=graphql/api**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"entries":[]}}' }),
  );

  await page.addInitScript(
    ([userJson, language]) => {
      try {
        window.localStorage.setItem('crm_language', language);
        window.sessionStorage.setItem('crm_current_user_rbac', userJson);
      } catch {
        /* private mode — the sync payload still carries the language */
      }
    },
    [JSON.stringify({ ...DEMO_USER, metadata_json: withLanguage(DEMO_USER.metadata_json) }), language] as const,
  );
}

let navCount = 0;

/** Opens `#hash` and waits until the screen has painted real content. */
export async function openView(page: Page, hash: string) {
  navCount++;
  await page.goto(`/?shot=${navCount}#${hash.replace(/^#/, '')}`, { waitUntil: 'domcontentloaded' });
  const preset = page.locator('button:has-text("erik@rekonstav.sk"), button:has-text("Erik")').first();
  if (await preset.isVisible({ timeout: 700 }).catch(() => false)) await preset.click({ force: true }).catch(() => {});
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  await page
    .waitForFunction(
      () => {
        const m = document.querySelector('main') as HTMLElement | null;
        return !!m && !m.querySelector('.animate-spin') && (m.innerText ?? '').trim().length > 80;
      },
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => {});
  await settle(page);
}

/** Lets enter animations and data-driven re-layouts finish. */
export const settle = (page: Page, ms = 1200) => page.waitForTimeout(ms);

/* -------------------------------------------------------------------------- */
/* Annotations                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One callout. Numbers are assigned in array order (1, 2, 3 …) unless `n` is
 * given, and the article text refers to them: "① Filter ... ② Export ...".
 */
export interface Mark {
  target: Locator;
  /** Short — two to five words. Leave out for a bare numbered box. */
  label?: string;
  n?: number;
  /** Where the label sits relative to the box; `auto` picks the side with room. */
  side?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
}

export interface ShotOptions {
  marks?: Mark[];
  /** Darkens everything except the marked elements. For "where do I find it" shots. */
  spotlight?: boolean;
}

/** The one annotation style. Change it here and every future article follows. */
export const ANNOTATION_STYLE = {
  color: '#E11D48', // rose-600: reads against the app's indigo and slate
  halo: 'rgba(255,255,255,0.95)',
  stroke: 3,
  radius: 12,
  pad: 6,
  badge: 28,
  font: '600 15px Inter, "Segoe UI", system-ui, sans-serif',
  dim: 'rgba(15,23,42,0.45)',
} as const;

const OVERLAY_ID = '__release_note_overlay';

async function drawMarks(page: Page, marks: Mark[], spotlight: boolean) {
  const boxes: { x: number; y: number; w: number; h: number; n: number; label: string; side: string }[] = [];
  for (const [i, m] of marks.entries()) {
    await m.target.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    const b = await m.target.boundingBox();
    if (!b) throw new Error(`Mark ${m.n ?? i + 1} (${m.label ?? 'no label'}) is not visible on the page`);
    boxes.push({ x: b.x, y: b.y, w: b.width, h: b.height, n: m.n ?? i + 1, label: m.label ?? '', side: m.side ?? 'auto' });
  }

  await page.evaluate(
    ({ boxes, spotlight, S, id }) => {
      document.getElementById(id)?.remove();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.id = id;
      svg.setAttribute('width', String(vw));
      svg.setAttribute('height', String(vh));
      svg.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;pointer-events:none');
      const el = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => {
        const node = document.createElementNS(ns, tag);
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
        parent.appendChild(node);
        return node;
      };

      const rects = boxes.map((b) => ({
        ...b,
        x: b.x - S.pad,
        y: b.y - S.pad,
        w: b.w + S.pad * 2,
        h: b.h + S.pad * 2,
      }));

      if (spotlight) {
        const mask = el('mask', { id: `${id}-mask` }, el('defs', {}));
        el('rect', { x: 0, y: 0, width: vw, height: vh, fill: 'white' }, mask);
        for (const r of rects) el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: S.radius, fill: 'black' }, mask);
        el('rect', { x: 0, y: 0, width: vw, height: vh, fill: S.dim, mask: `url(#${id}-mask)` });
      }

      const measure = document.createElement('canvas').getContext('2d')!;
      measure.font = S.font;
      // Labels must not cover another marked element, nor another label or badge.
      const placed: { x: number; y: number; w: number; h: number }[] = rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
      const overlaps = (a: { x: number; y: number; w: number; h: number }) =>
        placed.some((p) => a.x < p.x + p.w && a.x + a.w > p.x && a.y < p.y + p.h && a.y + a.h > p.y);
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

      for (const r of rects) {
        // Box: white halo under a coloured outline, so it reads on any background.
        el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: S.radius, fill: 'none', stroke: S.halo, 'stroke-width': S.stroke + 4 });
        el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: S.radius, fill: 'none', stroke: S.color, 'stroke-width': S.stroke });

        // Numbered badge on the top-left corner.
        const bx = clamp(r.x, S.badge / 2 + 2, vw - S.badge / 2 - 2);
        const by = clamp(r.y, S.badge / 2 + 2, vh - S.badge / 2 - 2);
        el('circle', { cx: bx, cy: by, r: S.badge / 2 + 2, fill: S.halo });
        el('circle', { cx: bx, cy: by, r: S.badge / 2, fill: S.color });
        const num = el('text', { x: bx, y: by + 5, 'text-anchor': 'middle', fill: '#fff', style: `font:${S.font};font-weight:800` });
        num.textContent = String(r.n);
        placed.push({ x: bx - S.badge / 2, y: by - S.badge / 2, w: S.badge, h: S.badge });

        if (!r.label) continue;
        const lw = measure.measureText(r.label).width + 24;
        const lh = 32;
        const gap = 10;
        const candidates: Record<string, { x: number; y: number }> = {
          top: { x: r.x + S.badge / 2 + 4, y: r.y - lh - gap },
          bottom: { x: r.x, y: r.y + r.h + gap },
          right: { x: r.x + r.w + gap, y: r.y + r.h / 2 - lh / 2 },
          left: { x: r.x - lw - gap, y: r.y + r.h / 2 - lh / 2 },
        };
        const order = r.side !== 'auto' ? [r.side] : ['top', 'bottom', 'right', 'left'];
        let spot = candidates[order[0]];
        for (const side of order) {
          const c = candidates[side];
          const fits = c.x >= 4 && c.y >= 4 && c.x + lw <= vw - 4 && c.y + lh <= vh - 4;
          if (fits && !overlaps({ x: c.x, y: c.y, w: lw, h: lh })) {
            spot = c;
            break;
          }
        }
        const pos = { x: clamp(spot.x, 4, vw - lw - 4), y: clamp(spot.y, 4, vh - lh - 4), w: lw, h: lh };
        while (overlaps(pos) && pos.y + lh < vh - 4) pos.y += lh / 2;
        placed.push(pos);

        el('rect', { x: pos.x, y: pos.y, width: lw, height: lh, rx: lh / 2, fill: S.color, stroke: S.halo, 'stroke-width': 2 });
        const text = el('text', { x: pos.x + 12, y: pos.y + 21, fill: '#fff', style: `font:${S.font}` });
        text.textContent = r.label;
      }

      document.body.appendChild(svg);
    },
    { boxes, spotlight, S: ANNOTATION_STYLE, id: OVERLAY_ID },
  );
}

const clearMarks = (page: Page) => page.evaluate((id) => document.getElementById(id)?.remove(), OVERLAY_ID);

/* -------------------------------------------------------------------------- */
/* Shots                                                                      */
/* -------------------------------------------------------------------------- */

interface ShotRecord {
  file: string;
  kind: 'view' | 'zoom';
  width: number;
  height: number;
  marks: { n: number; label: string }[];
}

function record(name: string, rec: ShotRecord) {
  const file = path.join(outDir(), 'shots.json');
  let all: Record<string, ShotRecord> = {};
  try {
    all = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* first shot of this language */
  }
  all[name] = rec;
  fs.writeFileSync(file, JSON.stringify(all, null, 2));
}

const fileFor = (name: string) => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`Shot name "${name}" must be kebab-case: a-z, 0-9 and "-"`);
  fs.mkdirSync(outDir(), { recursive: true });
  return path.join(outDir(), `${name}.png`);
};

const markList = (marks: Mark[] = []) => marks.map((m, i) => ({ n: m.n ?? i + 1, label: m.label ?? '' }));

/** The whole screen. Use for a new view, page or full drawer. */
export async function shotView(page: Page, name: string, opts: ShotOptions = {}) {
  const file = fileFor(name);
  if (opts.marks?.length || opts.spotlight) await drawMarks(page, opts.marks ?? [], !!opts.spotlight);
  await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' });
  await clearMarks(page);
  const vp = page.viewportSize()!;
  record(name, { file: path.basename(file), kind: 'view', width: vp.width, height: vp.height, marks: markList(opts.marks) });
}

/**
 * A crop around `target` (and around every marked element), for anything that
 * is small on a full screen: a dropdown, a popover, a card, a toolbar. The crop
 * never goes below `minWidth` × `minHeight` CSS px, so a tiny menu keeps
 * enough of its surroundings to be recognisable.
 */
export async function shotZoom(
  page: Page,
  target: Locator,
  name: string,
  opts: ShotOptions & { padding?: number; minWidth?: number; minHeight?: number } = {},
) {
  const file = fileFor(name);
  const padding = opts.padding ?? 32;
  const minWidth = opts.minWidth ?? 560;
  const minHeight = opts.minHeight ?? 320;

  await target.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  // Marks first: drawing them may scroll, and the crop must be measured after.
  if (opts.marks?.length || opts.spotlight) await drawMarks(page, opts.marks ?? [], !!opts.spotlight);
  const boxes = [await target.boundingBox()];
  for (const m of opts.marks ?? []) boxes.push(await m.target.boundingBox());
  const valid = boxes.filter((b): b is NonNullable<typeof b> => !!b);
  if (!valid.length) throw new Error(`shotZoom "${name}": target is not visible`);

  const vp = page.viewportSize()!;
  let x0 = Math.min(...valid.map((b) => b.x)) - padding;
  let y0 = Math.min(...valid.map((b) => b.y)) - padding;
  let x1 = Math.max(...valid.map((b) => b.x + b.width)) + padding;
  let y1 = Math.max(...valid.map((b) => b.y + b.height)) + padding;
  // Room for the label pills that sit outside the marked boxes.
  if (opts.marks?.some((m) => m.label)) y0 -= 44;
  const grow = (lo: number, hi: number, min: number) => {
    const extra = Math.max(0, min - (hi - lo)) / 2;
    return [lo - extra, hi + extra];
  };
  [x0, x1] = grow(x0, x1, minWidth);
  [y0, y1] = grow(y0, y1, minHeight);
  const clip = {
    x: Math.max(0, x0),
    y: Math.max(0, y0),
    width: Math.min(vp.width, x1) - Math.max(0, x0),
    height: Math.min(vp.height, y1) - Math.max(0, y0),
  };

  await page.screenshot({ path: file, clip, animations: 'disabled', caret: 'hide' });
  await clearMarks(page);
  record(name, {
    file: path.basename(file),
    kind: 'zoom',
    width: Math.round(clip.width),
    height: Math.round(clip.height),
    marks: markList(opts.marks),
  });
}
