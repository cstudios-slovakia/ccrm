import { test, expect, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { DRILLDOWN_CLIENT } from './helpers/fixture';

/**
 * Dark mode legibility audit.
 *
 * Dark mode here is built by inverting the Tailwind palette rather than by
 * annotating 13 000 class names (see scripts/postcss-dark-palette.mjs), so the
 * failure mode it can have is not "the wrong shade of grey" — it is a screen
 * where one element did not flip and is now white-on-white or black-on-black.
 * That is exactly the class of defect a machine can find better than an eye
 * can, on every screen, on every run.
 *
 * Each module is opened with the appearance forced to dark, and every element
 * that paints text is measured against the surface actually behind it. Anything
 * under 3:1 is reported: below that a label is not "low contrast", it is gone.
 */

const MODULES = [
  { name: 'Dashboard', hash: '#dashboard' },
  { name: 'Leads / Pipeline', hash: '#leads' },
  { name: 'Clients Register', hash: '#clients' },
  { name: 'Projects', hash: '#projects' },
  { name: 'Warehouse', hash: '#warehouse' },
  { name: 'Financial Management', hash: '#financial' },
  { name: 'Meeting Room', hash: '#meetings' },
  { name: 'Files Manager', hash: '#files' },
  { name: 'Email Hub', hash: '#email' },
  { name: 'Automation', hash: '#automation' },
  { name: 'Invoices & Price Offers', hash: '#invoices' },
  { name: 'Update Notes', hash: '#updates' },
  { name: 'Overview', hash: '#overview' },
  { name: 'Tasks', hash: '#tasks' },
  { name: 'System Settings', hash: '#settings' },
  { name: 'Personal Settings', hash: '#personal-settings' },
];

/** Anything below this is not dim, it is invisible. */
const MIN_CONTRAST = 3;

export interface ContrastFinding {
  /** Identity that survives a theme flip: same element, same run of text. */
  key: string;
  text: string;
  color: string;
  background: string;
  ratio: number;
  selector: string;
  classes: string;
}

/**
 * Runs inside the page: measures every visible run of text against the surface
 * painted behind it.
 */
const collectContrastFindings = (page: Page, minContrast: number) =>
  page.evaluate((min: number) => {
    /**
     * Any CSS colour to straight RGBA, by asking the browser to paint it.
     *
     * A regex over `rgb(...)` is not enough: the dark palette is declared in
     * `oklch()`, and Chrome preserves the colour space in getComputedStyle, so
     * a naive parser returns null for exactly the colours this audit exists to
     * check and every one of them is skipped. `globalCompositeOperation =
     * 'copy'` writes the source verbatim, alpha included, and getImageData
     * hands it back unpremultiplied.
     */
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.globalCompositeOperation = 'copy';
    const colorCache = new Map<string, [number, number, number, number] | null>();

    const parseColor = (value: string): [number, number, number, number] | null => {
      if (!value) return null;
      const cached = colorCache.get(value);
      if (cached !== undefined) return cached;

      let parsed: [number, number, number, number] | null = null;
      // A sentinel the browser will not keep if `value` is a colour it knows.
      ctx.fillStyle = '#ff00ff';
      const sentinel = ctx.fillStyle;
      ctx.fillStyle = value;
      if (ctx.fillStyle !== sentinel || /magenta|#ff00ff|255,\s*0,\s*255/i.test(value)) {
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        parsed = [r, g, b, a / 255];
      }
      colorCache.set(value, parsed);
      return parsed;
    };

    const luminance = ([r, g, b]: number[]) => {
      const channel = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };

    const contrast = (a: number[], b: number[]) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    /** Flatten a translucent colour onto what is behind it. */
    const over = (fg: [number, number, number, number], bg: number[]) =>
      [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));

    /** The colour actually painted behind an element, walking up through
     *  translucent ancestors until something opaque is found. */
    const effectiveBackground = (element: Element): number[] => {
      const stack: [number, number, number, number][] = [];
      let node: Element | null = element;
      while (node) {
        const parsed = parseColor(getComputedStyle(node).backgroundColor);
        if (parsed && parsed[3] > 0) {
          stack.push(parsed);
          if (parsed[3] === 1) break;
        }
        node = node.parentElement;
      }
      // `body` paints a gradient, so its `background-color` is transparent and
      // the walk can reach the top without finding anything opaque. What is
      // actually behind the page then is that gradient, whose tone depends on
      // the appearance — assuming one of them would silently pass every element
      // in the other.
      const dark = document.documentElement.getAttribute('data-appearance') === 'dark';
      let result = dark ? [12, 16, 23] : [242, 245, 251];
      for (let i = stack.length - 1; i >= 0; i--) result = over(stack[i], result);
      return result;
    };

    const describe = (element: Element): string => {
      const parts: string[] = [];
      let node: Element | null = element;
      for (let depth = 0; node && depth < 4; depth++) {
        const id = node.id ? `#${node.id}` : '';
        parts.unshift(`${node.tagName.toLowerCase()}${id}`);
        node = node.parentElement;
      }
      return parts.join(' > ');
    };

    const findings: ContrastFinding[] = [];
    const seen = new Set<string>();

    document.querySelectorAll('*').forEach((element) => {
      // Only elements that paint text of their own.
      const ownText = Array.from(element.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join(' ')
        .trim();
      if (!ownText) return;

      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none') return;
      if (Number(style.opacity) < 0.15) return;

      const rect = element.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) return;
      // Off-screen or clipped away — not something the user can misread.
      if (rect.bottom < 0 || rect.right < 0) return;

      const fg = parseColor(style.color);
      if (!fg || fg[3] < 0.15) return;

      const bg = effectiveBackground(element);
      const ratio = contrast(over(fg, bg), bg);
      if (ratio >= min) return;

      const classes = typeof element.className === 'string' ? element.className : '';
      // One report per class combination — the same broken rule repeated down a
      // list or across a calendar is one defect, not forty. Class-less elements
      // fall back to their position. Deliberately free of any colour so the same
      // element is still recognisable after the theme is flipped underneath it.
      const key = classes ? `class:${classes}` : `path:${describe(element)}`;
      if (seen.has(key)) return;
      seen.add(key);

      findings.push({
        key,
        text: ownText.slice(0, 70),
        color: style.color,
        background: `rgb(${bg.map((c) => Math.round(c)).join(', ')})`,
        ratio: Math.round(ratio * 100) / 100,
        selector: describe(element),
        classes: classes.slice(0, 220),
      });
    });

    return findings.sort((a, b) => a.ratio - b.ratio);
  }, minContrast);

/** One readable block per finding, so a failure names the class to go and fix. */
const describeFindings = (findings: ContrastFinding[]): string =>
  findings
    .slice(0, 25)
    .map(
      (f) =>
        `  ${f.ratio.toFixed(2)}:1  "${f.text}"\n` +
        `      color ${f.color} on ${f.background}\n` +
        `      ${f.selector}\n` +
        `      class="${f.classes}"`,
    )
    .join('\n');

/**
 * The findings dark mode is actually answerable for.
 *
 * Some of this app's badges are hard to read in the light theme it already
 * ships — white on a `bg-amber-500` pill is 2.1:1 whatever the appearance, and
 * `text-slate-300` is a deliberately faint counter on both. Failing the dark
 * suite for those would be reporting someone else's bug and would make this
 * check impossible to keep green.
 *
 * So the same page is measured twice: once dark, then again with the theme
 * attribute flipped to light on the very same DOM — no reload, no re-render, so
 * every element keeps its identity and only the CSS underneath it changes. What
 * is reported is what dark mode broke: legible in light, not legible in dark.
 * Anything low in both is printed as a note instead, so it stays visible without
 * failing a suite that cannot fix it.
 */
const collectDarkRegressions = async (page: Page, label: string) => {
  // Half this app carries `transition-all`. A colour read while a transition is
  // running is an interpolated value somewhere between the two themes, which
  // made the light pass report the dark palette back. Motion is switched off
  // for both passes so each one measures a settled screen.
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  // The pointer is left wherever the last click put it, and an overlay that
  // opens underneath it arrives pre-hovered — which measures a `hover:` colour
  // and reports it as the resting one. Park the mouse outside the viewport so
  // both passes see the same, unhovered screen.
  await page.mouse.move(-10, -10);
  await page.waitForTimeout(150);

  const dark = await collectContrastFindings(page, MIN_CONTRAST);
  if (!dark.length) return [];

  const restore = await page.evaluate(() => {
    const root = document.documentElement;
    const before = { theme: root.getAttribute('data-theme'), appearance: root.getAttribute('data-appearance') };
    root.setAttribute('data-theme', 'basic');
    root.setAttribute('data-appearance', 'light');
    return before;
  });
  await page.waitForTimeout(120);
  const light = await collectContrastFindings(page, MIN_CONTRAST);
  await page.evaluate((before: { theme: string | null; appearance: string | null }) => {
    const root = document.documentElement;
    if (before.theme) root.setAttribute('data-theme', before.theme);
    if (before.appearance) root.setAttribute('data-appearance', before.appearance);
  }, restore);

  const alsoLowInLight = new Set(light.map((f) => f.key));
  const shared = dark.filter((f) => alsoLowInLight.has(f.key));
  if (shared.length) {
    console.log(
      `note: ${shared.length} run(s) of text on ${label} are below ${MIN_CONTRAST}:1 in the light theme too, ` +
        `so they are pre-existing rather than caused by dark mode:
` +
        describeFindings(shared),
    );
  }
  return dark.filter((f) => !alsoLowInLight.has(f.key));
};

test.describe('Dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await startSession(page);
    // The appearance is read from localStorage before the first paint, exactly
    // as index.html does it, so the app boots dark rather than flipping later.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('ccrm_theme_mode', 'dark');
      } catch {
        // Storage blocked: the app falls back to the system setting and the
        // guard assertion below turns that into a clear failure.
      }
    });
  });

  test('the dark appearance is actually applied', async ({ page }) => {
    await gotoView(page, '#dashboard');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');

    const surfaces = await page.evaluate(() => {
      const read = (el: Element | null) => (el ? getComputedStyle(el).backgroundColor : '');
      return {
        body: read(document.body),
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
      };
    });
    expect(surfaces.colorScheme).toBe('dark');
  });

  test('the switcher in Personal Settings drives the appearance', async ({ page }) => {
    await gotoView(page, '#personal-settings');

    const modeButton = (name: RegExp) => page.getByRole('radio', { name }).first();
    const applied = () => page.locator('html').getAttribute('data-appearance');

    await modeButton(/Svetlá|Light|Világos/).click();
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
    // The light palette survives the trip through dark rather than resetting.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'basic');

    await modeButton(/Tmavá|^Dark|Sötét/).click();
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Auto resolves from the clock and the sun, so which way it lands depends on
    // when the suite runs; that it resolves to *something* is the contract, and
    // the panel has to be able to say when it will next change its mind.
    await modeButton(/Automatick|Auto/).click();
    expect(['light', 'dark']).toContain(await applied());
    await expect(page.getByText(/Východ slnka|Sunrise|Napkelte/i).first()).toBeVisible();
    await expect(page.getByText(/Západ slnka|Sunset|Napnyugta/i).first()).toBeVisible();

    // System hands the decision back to prefers-color-scheme.
    await modeButton(/Systémová|System|Rendszer/).click();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');

    // The choice is written to the user's row, not only to this browser.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('ccrm_theme_mode')))
      .toBe('system');
  });

  /**
   * Overlays are where the palette inversion is most likely to be defeated: a
   * drawer or modal that paints its own surface with an inline literal instead
   * of a class stays white while everything inside it turns light-on-light.
   * The landing-screen sweep cannot see any of that, because none of it is on
   * screen until something is clicked.
   */
  test('drawers and modals stay legible in dark mode', async ({ page }) => {
    const findings: ContrastFinding[] = [];

    const measureAfter = async (label: string, open: () => Promise<void>) => {
      await open();
      await page.waitForTimeout(700);
      const opened = await page.locator('[class*="z-[9999]"], dialog[open], [role="dialog"]').count();
      expect(opened, `${label}: nothing opened, so nothing was audited`).toBeGreaterThan(0);
      findings.push(
        ...(await collectDarkRegressions(page, label)).map((f) => ({ ...f, text: `${label}: ${f.text}` })),
      );
    };

    await gotoView(page, '#clients');
    await measureAfter('client profile drawer', async () => {
      await page.getByText(DRILLDOWN_CLIENT).first().click();
    });

    await gotoView(page, '#leads');
    await measureAfter('new lead modal', async () => {
      await page.getByRole('button', { name: /PRIDAŤ NOVÝ LEAD|ADD NEW LEAD|ÚJ LEAD/i }).first().click();
    });

    // The create-task drawer is the header's own form and reaches every module,
    // so one broken colour in it is a defect on every screen at once.
    await gotoView(page, '#dashboard');
    await measureAfter('create task drawer', async () => {
      await page
        .getByRole('button', { name: /VYTVORIŤ NOVÚ ÚLOHU|CREATE NEW TASK|ÚJ FELADAT/i })
        .first()
        .click();
    });

    if (findings.length) {
      throw new Error(
        `${findings.length} element group(s) below ${MIN_CONTRAST}:1 inside an overlay in dark mode:\n` +
          describeFindings(findings),
      );
    }
  });

  for (const mod of MODULES) {
    test(`${mod.name} stays legible in dark mode`, async ({ page }) => {
      await gotoView(page, mod.hash);
      // Guards the audit itself: a screen measured in light mode would pass
      // every check and prove nothing.
      await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
      const findings = await collectDarkRegressions(page, mod.hash);

      if (findings.length) {
        throw new Error(
          `${findings.length} element group(s) below ${MIN_CONTRAST}:1 on ${mod.hash} in dark mode:\n` +
            describeFindings(findings),
        );
      }
    });
  }
});
