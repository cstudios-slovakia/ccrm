import type { Locator, Page, Route } from '@playwright/test';
import { buildSyncPayload } from './fixture';

/**
 * Clears the 500 ms hold with room to spare. The app measures the hold on animation
 * frames, and a runner with three browsers on four cores delivers some of them
 * 150 ms late, so 650 ms was not enough there (undo toasts that never appeared,
 * deletes that never happened). Pass a smaller number to test an early release.
 */
export const HOLD_OK_MS = 1200;
export const SHORT_HOLD_MS = 100;

/**
 * Presses and holds an element like a user would: hover → mouse down → wait →
 * mouse up. Pass a smaller number to check that an early release does nothing.
 */
export async function holdToConfirm(locator: Locator, ms = HOLD_OK_MS): Promise<void> {
  const page = locator.page();
  await locator.scrollIntoViewIfNeeded();
  await locator.hover();
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** Keyboard hold: focus the element, hold Space, release. */
export async function holdWithKeyboard(locator: Locator, ms = HOLD_OK_MS, key = 'Space'): Promise<void> {
  const page = locator.page();
  await locator.focus();
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

export interface SyncCapture {
  /** Every POST body sent to /sync.php, in order. */
  pushes: any[];
  /** Ids sent in `deleted[collection]` across all pushes so far. */
  deletedIds: (collection: string) => string[];
  /** True once any push carried this id in `deleted[collection]`. */
  hasDeleted: (collection: string, id: string) => boolean;
  /** Whether any push still carried the record in a collection array. */
  carried: (collection: string, id: string) => boolean;
}

/**
 * Replaces the fixture's /sync.php mock with one that speaks protocol v2 (delta
 * pushes with an explicit `deleted` map) and records what the app sends. Call
 * AFTER startSession(), since the most recently registered route wins.
 *
 * `protocol: 1` keeps the legacy full-snapshot behaviour, where a deletion is
 * an omission.
 */
export async function captureSync(
  page: Page,
  protocol: 1 | 2 = 2,
  mutate?: (payload: ReturnType<typeof buildSyncPayload>) => void,
): Promise<SyncCapture> {
  const pushes: any[] = [];
  await page.route('**/sync.php**', (route: Route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      const payload = buildSyncPayload();
      mutate?.(payload);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...payload, syncProtocol: protocol }),
      });
    }
    try {
      pushes.push(request.postDataJSON());
    } catch {
      /* not JSON */
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, serverTime: new Date().toISOString(), dataVersion: 1 }),
    });
  });
  return {
    pushes,
    deletedIds: (collection) => pushes.flatMap((p) => (p?.deleted?.[collection] as string[] | undefined) ?? []),
    hasDeleted: (collection, id) =>
      pushes.some((p) => ((p?.deleted?.[collection] as string[] | undefined) ?? []).includes(id)),
    carried: (collection, id) =>
      pushes.some((p) => Array.isArray(p?.[collection]) && p[collection].some((r: any) => r?.id === id)),
  };
}

/** The undo toast and its parts. */
export const undoToast = (page: Page) => page.getByTestId('undo-toast');
export const undoButton = (page: Page) => page.getByTestId('undo-toast-undo');

/** Records every request made to a direct endpoint (strategy C). */
export async function captureRequests(page: Page, glob: string, method?: string) {
  const seen: { url: string; method: string; body: unknown }[] = [];
  page.on('request', (req) => {
    if (method && req.method() !== method) return;
    if (!new RegExp(glob.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')).test(req.url())) return;
    let body: unknown = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    seen.push({ url: req.url(), method: req.method(), body });
  });
  return seen;
}
