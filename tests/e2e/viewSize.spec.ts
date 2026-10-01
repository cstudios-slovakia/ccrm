import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * View size audit — docs/VIEW-SIZE.md §9.2.
 *
 * Every module is opened at the four reference screens with the view size
 * forced through localStorage (exactly what the setting writes), and the page
 * is measured for the things the view-size work exists to fix:
 *
 *   TEXT_BELOW_FLOOR      a visible text run is smaller than the size's floor
 *   HORIZONTAL_OVERFLOW   the workspace scrolls sideways
 *   UNUSED_WIDTH          Normal/Big only: visible blocks cover < 90% of the content width
 *   CONTROL_TRUNCATED     a button, tab or select shows an ellipsis and has no title
 *   ASIDE_CHANGED         the aside's width or item font size differs between view sizes
 *
 * Report-only until Phase F flips VIEW_SIZE_BLOCKING (below); the report is
 * written to test-results/view-size-report.md either way.
 */

/** Phase F: set to true. While false the spec reports and never fails. */
const VIEW_SIZE_BLOCKING = process.env.VIEW_SIZE_BLOCKING === '1';

const SCREENS = [
  { label: '390 phone', width: 390, height: 844, size: 'compact', floor: 10 },
  { label: '1440 laptop', width: 1440, height: 900, size: 'compact', floor: 10 },
  { label: '1920 Full HD', width: 1920, height: 1080, size: 'normal', floor: 12 },
  { label: '2560 2K', width: 2560, height: 1440, size: 'big', floor: 13 },
] as const;

const MODULES = [
  { name: 'Dashboard', hash: '#dashboard' },
  { name: 'Leads', hash: '#leads' },
  { name: 'Clients', hash: '#clients' },
  { name: 'Projects', hash: '#projects' },
  { name: 'Warehouse', hash: '#warehouse' },
  { name: 'Financial', hash: '#financial' },
  { name: 'Meetings', hash: '#meetings' },
  { name: 'Files', hash: '#files' },
  { name: 'Email', hash: '#email' },
  { name: 'Automation', hash: '#automation' },
  { name: 'Invoicing', hash: '#invoices' },
  { name: 'Updates', hash: '#updates' },
  { name: 'Overview', hash: '#overview' },
  { name: 'Tasks', hash: '#tasks' },
  { name: 'System settings', hash: '#settings' },
  { name: 'Personal settings', hash: '#personal-settings' },
];

interface Finding {
  check: 'TEXT_BELOW_FLOOR' | 'HORIZONTAL_OVERFLOW' | 'UNUSED_WIDTH' | 'CONTROL_TRUNCATED' | 'ASIDE_CHANGED';
  where: string;
  detail: string;
}

const findings: Finding[] = [];

const measure = (page: Page, floor: number, checkWidth: boolean) =>
  page.evaluate(
    ({ floor, checkWidth }) => {
      const out: { check: string; detail: string }[] = [];
      const main = document.querySelector('main');
      if (!main) return [{ check: 'HORIZONTAL_OVERFLOW', detail: 'no <main> element' }];

      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
      };
      const label = (el: Element) => {
        const cls = (el.getAttribute('class') || '').split(/\s+/).slice(0, 4).join('.');
        return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
      };

      // TEXT_BELOW_FLOOR: every text node with a visible parent.
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      const small = new Map<string, { n: number; size: number; sample: string }>();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent || '').trim();
        const parent = node.parentElement;
        if (!text || !parent || !visible(parent)) continue;
        if (parent.closest('script,style,svg,[aria-hidden="true"]')) continue;
        const size = parseFloat(getComputedStyle(parent).fontSize);
        if (size < floor - 0.01) {
          const key = `${label(parent)}@${size}`;
          const prev = small.get(key);
          if (prev) prev.n++;
          else small.set(key, { n: 1, size, sample: text.slice(0, 30) });
        }
      }
      for (const [key, v] of [...small].slice(0, 12)) out.push({ check: 'TEXT_BELOW_FLOOR', detail: `${key} ×${v.n} "${v.sample}"` });
      if (small.size > 12) out.push({ check: 'TEXT_BELOW_FLOOR', detail: `…and ${small.size - 12} more groups` });

      // HORIZONTAL_OVERFLOW
      if (main.scrollWidth > main.clientWidth + 1) {
        out.push({ check: 'HORIZONTAL_OVERFLOW', detail: `main scrollWidth ${main.scrollWidth} > clientWidth ${main.clientWidth}` });
      }

      // UNUSED_WIDTH: the widest visible block directly in the page, against the workspace content box.
      if (checkWidth) {
        const cs = getComputedStyle(main);
        const content = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        let widest = 0;
        const stack: Element[] = [...main.children];
        let depth = 0;
        while (stack.length && depth < 400) {
          const el = stack.shift()!;
          depth++;
          if (!visible(el)) continue;
          const r = el.getBoundingClientRect();
          widest = Math.max(widest, r.width);
          if (el.children.length && r.width < content * 0.98) for (const c of el.children) stack.push(c);
        }
        if (widest < content * 0.9) out.push({ check: 'UNUSED_WIDTH', detail: `widest block ${Math.round(widest)}px of ${Math.round(content)}px` });
      }

      // CONTROL_TRUNCATED
      const truncated = new Set<string>();
      main.querySelectorAll('button, [role="tab"], select, a[role="button"]').forEach((el) => {
        if (!visible(el)) return;
        const e = el as HTMLElement;
        const inner = e.querySelector('span, .truncate') as HTMLElement | null;
        for (const t of [e, inner]) {
          if (t && t.scrollWidth > t.clientWidth + 1 && getComputedStyle(t).textOverflow === 'ellipsis' && !e.getAttribute('title')) {
            truncated.add(`${label(e)} "${(e.textContent || '').trim().slice(0, 24)}"`);
          }
        }
      });
      [...truncated].slice(0, 8).forEach((d) => out.push({ check: 'CONTROL_TRUNCATED', detail: d }));
      return out;
    },
    { floor, checkWidth },
  );

const readAside = (page: Page) =>
  page.evaluate(() => {
    const aside = document.querySelector('aside') || document.querySelector('.view-size-fixed');
    if (!aside) return null;
    const r = aside.getBoundingClientRect();
    const item = aside.querySelector('button, a') as HTMLElement | null;
    return { width: Math.round(r.width), font: item ? getComputedStyle(item).fontSize : '' };
  });

test.describe('View size', () => {
  test.afterAll(() => {
    const lines = [
      '# View size report',
      '',
      `Mode: ${VIEW_SIZE_BLOCKING ? 'blocking' : 'report-only'} · ${findings.length} finding(s)`,
      '',
      '| Check | Where | Detail |',
      '|---|---|---|',
      ...findings.map((f) => `| ${f.check} | ${f.where} | ${f.detail.replace(/\|/g, '\\|')} |`),
      '',
    ];
    const file = path.resolve('test-results', 'view-size-report.md');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, lines.join('\n'));
  });

  for (const screen of SCREENS) {
    test.describe(screen.label, () => {
      test.beforeEach(async ({ page }) => {
        await startSession(page);
        await page.setViewportSize({ width: screen.width, height: screen.height });
        await page.addInitScript((size) => {
          try {
            localStorage.setItem('ccrm_view_size', size);
          } catch {
            /* storage blocked: the guard assertion below fails loudly */
          }
        }, screen.size);
      });

      for (const mod of MODULES) {
        test(`${mod.name} at ${screen.label}`, async ({ page }) => {
          await gotoView(page, mod.hash);
          await expect(page.locator('html')).toHaveAttribute('data-view-size', screen.size);
          // Fonts and lazy chunks settle before measuring.
          await page.waitForTimeout(500);

          const results = await measure(page, screen.floor, screen.size !== 'compact');
          const here = `${mod.hash} @ ${screen.label}`;
          const local: Finding[] = results.map((r) => ({ check: r.check as Finding['check'], where: here, detail: r.detail }));
          // Compact is "today": under-floor text there is a MEDIUM, not a defect to block on.
          const blocking = local.filter((f) => !(f.check === 'TEXT_BELOW_FLOOR' && screen.size === 'compact'));
          findings.push(...local);

          if (VIEW_SIZE_BLOCKING) {
            expect(blocking, blocking.map((f) => `${f.check}: ${f.detail}`).join('\n')).toEqual([]);
          } else if (blocking.length) {
            console.log(`view-size (report-only) ${here}\n` + blocking.map((f) => `  ${f.check}: ${f.detail}`).join('\n'));
          }
        });
      }
    });
  }

  test('the aside does not change with the view size', async ({ page }) => {
    await startSession(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const seen: Record<string, { width: number; font: string } | null> = {};
    for (const size of ['compact', 'normal', 'big']) {
      await page.addInitScript((s) => localStorage.setItem('ccrm_view_size', s), size);
      await gotoView(page, '#dashboard');
      await page.evaluate((s) => document.documentElement.setAttribute('data-view-size', s), size);
      seen[size] = await readAside(page);
    }
    const base = seen.compact;
    for (const size of ['normal', 'big']) {
      const now = seen[size];
      if (JSON.stringify(now) !== JSON.stringify(base)) {
        const f: Finding = { check: 'ASIDE_CHANGED', where: size, detail: `${JSON.stringify(base)} → ${JSON.stringify(now)}` };
        findings.push(f);
        if (VIEW_SIZE_BLOCKING) throw new Error(`${f.check}: ${f.detail}`);
      }
    }
  });
});
