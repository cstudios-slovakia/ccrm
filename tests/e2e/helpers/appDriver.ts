import type { Locator, Page } from '@playwright/test';
import { installBackendMocks } from './fixture';

/**
 * Waiting budgets, in milliseconds.
 *
 * The app animates with framer-motion (150ms popovers) and CSS keyframes
 * (350ms drawer slide). The previous crawler waited 30-60ms, which meant it
 * measured elements mid-animation and mis-reported what it saw. Anything that
 * can be waited for by condition is; these are only the floors.
 */
export const SETTLE = {
  micro: 120,
  content: 320,
  overlay: 550,
};

export interface ConsoleCapture {
  errors: string[];
  exceptions: string[];
}

/** Console noise that says nothing about the app's own correctness. */
const IGNORED_CONSOLE = [
  'favicon',
  'Failed to load resource',
  'net::ERR_',
  'Download the React DevTools',
  'React Router',
  '[vite]',
  'WebSocket connection',
  'Content Security Policy',
];

export function captureConsole(page: Page): ConsoleCapture {
  const capture: ConsoleCapture = { errors: [], exceptions: [] };
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((p) => text.includes(p))) return;
    capture.errors.push(text);
  });
  page.on('pageerror', (err) => {
    // Keep the top frames: without them "Cannot read properties of null" is
    // untraceable and the finding cannot be acted on.
    const frames = (err.stack ?? '')
      .split('\n')
      .slice(1, 4)
      .map((l) => l.trim())
      .filter(Boolean)
      .join(' ← ');
    capture.exceptions.push(frames ? `${err.message} @ ${frames}` : err.message);
  });
  return capture;
}

export async function startSession(page: Page): Promise<ConsoleCapture> {
  const capture = captureConsole(page);
  await installBackendMocks(page);
  return capture;
}

/** Phrases that only ever appear on a broken screen, in all three UI languages. */
const ERROR_SIGNATURES = [
  'Profil klienta sa nenašiel',
  'Client Profile Not Found',
  'Az ügyfélprofil nem található',
  'sa nepodarilo nájsť v aktívnej databáze',
  'could not be resolved in the active database',
  'Túto sekciu sa nepodarilo zobraziť',
  'This section could not be displayed',
  'Ezt a szakaszt nem sikerült megjeleníteni',
  'Chyba behu aplikácie',
  'Application Runtime Exception',
  'Alkalmazás futásidejű hibája',
];

export interface ViewState {
  hash: string;
  /** First heading rendered inside the workspace area. */
  heading: string;
  /** Visible text length — distinguishes a rendered empty state from a blank view. */
  textLength: number;
  /** Structural signature used to detect that a click actually changed something. */
  fingerprint: string;
  /** Text of the error screen when the view is broken, else null. */
  errorScreen: string | null;
  /** Number of open overlay layers (drawers, modals, dialogs). */
  overlayCount: number;
}

/**
 * One round-trip snapshot of what the user is currently looking at.
 * Everything the assertions need comes from this, so a check costs one
 * evaluate rather than a dozen locator queries.
 */
export async function readViewState(page: Page): Promise<ViewState> {
  return page.evaluate((signatures: string[]) => {
    const main = document.querySelector('main') ?? document.getElementById('root');
    const text = (main as HTMLElement | null)?.innerText ?? '';
    const normalized = text.replace(/\s+/g, ' ').trim();

    let errorScreen: string | null = null;
    for (const sig of signatures) {
      if (!normalized.includes(sig)) continue;
      // Report the whole error panel, not just the matched phrase. Filter on
      // textContent first: reading innerText per node forces a layout pass and
      // is far too slow on the larger views.
      const host = Array.from(main?.querySelectorAll('div, section, aside') ?? [])
        .filter((el) => el.textContent?.includes(sig))
        .pop();
      errorScreen = ((host as HTMLElement | undefined)?.innerText ?? sig).replace(/\s+/g, ' ').trim().slice(0, 240);
      break;
    }

    const heading = (main?.querySelector('h1, h2, h3') as HTMLElement | null)?.innerText?.replace(/\s+/g, ' ').trim() ?? '';

    // Drawers and modals are full-viewport fixed layers. Some are portalled to
    // <body>, others render inline, so match on the layer itself rather than on
    // where it lives in the tree.
    const overlays = Array.from(document.querySelectorAll('.fixed.inset-0')).filter((el) => {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
      const r = el.getBoundingClientRect();
      return r.width > 240 && r.height > 240;
    });

    // Cheap structural hash: tag/class skeleton of the workspace subtree.
    const skeleton = Array.from(main?.querySelectorAll('h1, h2, h3, table, form, button') ?? [])
      .slice(0, 60)
      .map((el) => `${el.tagName}:${(el as HTMLElement).innerText?.slice(0, 24) ?? ''}`)
      .join('|');
    let hash = 0;
    for (let i = 0; i < skeleton.length; i++) {
      hash = (hash * 31 + skeleton.charCodeAt(i)) | 0;
    }

    return {
      hash: window.location.hash,
      heading,
      textLength: normalized.length,
      fingerprint: `${normalized.length}:${hash}`,
      errorScreen,
      overlayCount: overlays.length,
    };
  }, ERROR_SIGNATURES);
}

let navCounter = 0;

/**
 * Navigates by URL to reach a view before auditing it. Never used to test
 * navigation itself — that is what `navigation.spec.ts` does by clicking.
 *
 * The app is a hash router, so changing only the fragment is a same-document
 * navigation: React stays mounted and every view keeps the internal state a
 * previous audit phase left behind (an active sub-tab, an applied filter). A
 * throwaway query parameter forces a real document load, so each phase starts
 * from the view as a user first sees it.
 */
export async function gotoView(page: Page, hash: string) {
  const fragment = hash.startsWith('#') ? hash : `#${hash}`;
  navCounter++;
  await page.goto(`/?qa=${navCounter}${fragment === '#' ? '' : fragment}`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
}

export async function waitForAppReady(page: Page) {
  // The login screen appears if session seeding did not take; click through it.
  const preset = page.locator('button:has-text("erik@crm.com"), button:has-text("ER Erik")').first();
  if (await preset.isVisible({ timeout: 800 }).catch(() => false)) {
    await preset.click({ force: true }).catch(() => {});
  }
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  await waitForWorkspaceContent(page);
}

/**
 * Waits until the workspace has painted real content instead of the Suspense
 * spinner. Every view is a lazy chunk, so this has to be awaited after any
 * navigation — including a same-document one caused by clicking a nav button,
 * where there is no load event to wait on.
 */
export async function waitForWorkspaceContent(page: Page, timeout = 12_000) {
  await page
    .waitForFunction(
      () => {
        const main = document.querySelector('main');
        if (!main) return false;
        if (main.querySelector('.animate-spin')) return false;
        return ((main as HTMLElement).innerText ?? '').trim().length > 60;
      },
      undefined,
      { timeout },
    )
    .catch(() => {});
  await page.waitForTimeout(SETTLE.content);
}

/**
 * Waits for every options panel to unmount.
 *
 * The panel animates out over 150ms and stays in the DOM while it does, so
 * opening the next dropdown without waiting can hand back the previous,
 * fading-out panel and report it as "opened but invisible".
 */
export async function waitForNoPopover(page: Page, timeout = 1500): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await page.locator('[role="listbox"]').count()) === 0) return true;
    await page.waitForTimeout(60);
  }
  return false;
}

/** Waits until the element's opacity stops changing, so enter animations are done. */
export async function waitForOpaque(locator: Locator, timeout = 1500) {
  await locator
    .evaluate(
      (el: Element, limit: number) =>
        new Promise<void>((resolve) => {
          const started = Date.now();
          const tick = () => {
            const opacity = parseFloat(window.getComputedStyle(el).opacity || '1');
            if (opacity > 0.95 || Date.now() - started > limit) resolve();
            else requestAnimationFrame(tick);
          };
          tick();
        }),
      timeout,
    )
    .catch(() => {});
}

/**
 * Waits until a locator's box stops moving, then returns.
 *
 * Reading geometry while a popover is still animating is what made the old
 * crawler blame a sibling button for the occlusion instead of the drawer.
 */
export async function waitForStableRect(locator: Locator, timeout = 2000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  let previous = '';
  let stableFrames = 0;
  while (Date.now() < deadline) {
    const box = await locator.boundingBox().catch(() => null);
    const key = box ? `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)}` : 'none';
    if (key === previous && key !== 'none') {
      stableFrames++;
      if (stableFrames >= 2) return true;
    } else {
      stableFrames = 0;
    }
    previous = key;
    await locator.page().waitForTimeout(60);
  }
  return false;
}

/** Closes anything overlaying the workspace. Returns true when the page is clear. */
export async function dismissOverlays(page: Page, attempts = 3): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const state = await readViewState(page);
    if (state.overlayCount === 0) return true;

    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(SETTLE.micro);

    if ((await readViewState(page)).overlayCount === 0) return true;

    const closers = page.locator(
      'button:has(svg.lucide-x), button[aria-label*="Zavrieť"], button[aria-label*="Close"], button:text-is("Zrušiť"), button:text-is("Cancel"), button:text-is("Zavrieť")',
    );
    const count = await closers.count();
    for (let c = count - 1; c >= 0 && c >= count - 4; c--) {
      const btn = closers.nth(c);
      if (await btn.isVisible({ timeout: 150 }).catch(() => false)) {
        await btn.click({ force: true, timeout: 1200 }).catch(() => {});
        await page.waitForTimeout(SETTLE.micro);
      }
    }
    await page.waitForTimeout(SETTLE.overlay);
  }
  return (await readViewState(page)).overlayCount === 0;
}

/** Screenshot helper that returns a repo-relative path for the report. */
export async function captureEvidence(page: Page, slug: string): Promise<string> {
  const safe = slug.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80);
  const rel = `test-results/screenshots/${safe}-${Date.now()}.png`;
  await page.screenshot({ path: rel, fullPage: false }).catch(() => {});
  return rel;
}
