import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession, waitForAppReady } from './helpers/appDriver';
import { TEST_USER, buildSyncPayload } from './helpers/fixture';

/**
 * Installing CCRM as an app, and what comes with it: the Settings card, the
 * automatic offer, the `#tasks?newTask=` / `?voice=1` deep links the app
 * shortcuts and the share target use, the task badge and the mini window.
 *
 * A real install cannot be driven from Playwright, so the browser's side is
 * simulated: a `beforeinstallprompt` event with a stubbed `prompt()`. What is
 * verified is everything CCRM does with it.
 */

// The banner is suppressed in `?qa=` runs by design, so its own tests load the
// app without it - which also registers the service worker, hence the block.
test.use({ serviceWorkers: 'block' });


/** Fires what Chrome fires when the app is installable. Returns whether we took it over. */
async function fireInstallPrompt(page: Page, outcome: 'accepted' | 'dismissed' = 'accepted') {
  return page.evaluate((result) => {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    (window as any).__promptCalls = 0;
    event.prompt = async () => {
      (window as any).__promptCalls++;
    };
    event.userChoice = Promise.resolve({ outcome: result });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }, outcome);
}

async function openProfileSettings(page: Page) {
  await gotoView(page, '#personal-settings');
  await expect(page.getByTestId('pwa-install-card')).toBeVisible();
}

test.describe('Install card (Settings → Profile)', () => {
  test('without an install offer it explains the browser menu and shows no dead button', async ({ page }) => {
    await startSession(page);
    await openProfileSettings(page);
    const card = page.getByTestId('pwa-install-card');
    await expect(card).toHaveAttribute('data-state', 'chromium-manual');
    await expect(page.getByTestId('pwa-install-button')).toHaveCount(0);
    await expect(card).toContainText(/Install page as app|Nainštalovať stránku ako aplikáciu|Oldal telepítése/);
  });

  test('when the browser offers the install, Install appears, works once and the card turns to Installed', async ({ page }) => {
    await startSession(page);
    await openProfileSettings(page);

    // CCRM must take the event over, or the browser would show its own prompt.
    expect(await fireInstallPrompt(page)).toBe(true);
    const card = page.getByTestId('pwa-install-card');
    await expect(card).toHaveAttribute('data-state', 'can-install');
    const install = page.getByTestId('pwa-install-button');
    await expect(install).toBeVisible();

    await install.click();
    await expect.poll(() => page.evaluate(() => (window as any).__promptCalls)).toBe(1);
    // A prompt can be used once: the button must not be left behind, doing nothing.
    await expect(install).toHaveCount(0);

    // The browser reports the install; no reload needed.
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(card).toHaveAttribute('data-state', 'installed');
    await expect(card).toContainText(/Installed|Nainštalované|Telepítve/);
    await expect(page.getByTestId('pwa-benefits').locator('li')).toHaveCount(4);
  });

  test('an installed device remembers it in a normal tab, and a new offer proves it was removed', async ({ page }) => {
    await startSession(page);
    await openProfileSettings(page);
    await fireInstallPrompt(page);
    await page.getByTestId('pwa-install-button').click();
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));

    await openProfileSettings(page);
    await expect(page.getByTestId('pwa-install-card')).toHaveAttribute('data-state', 'installed');

    await fireInstallPrompt(page);
    await expect(page.getByTestId('pwa-install-card')).toHaveAttribute('data-state', 'can-install');
  });

  test('the bookmarklet and the pop-out button are there', async ({ page }) => {
    await startSession(page);
    await openProfileSettings(page);
    const href = await page.getByTestId('pwa-bookmarklet').getAttribute('href');
    expect(href).toMatch(/^javascript:/);
    expect(href).toContain('/#tasks?newTask=');
    await expect(page.getByTestId('pwa-pop-out')).toBeEnabled();
    await expect(page.getByTestId('pwa-share-help')).toContainText(/Windows/);
  });
});

test.describe('Automatic install offer', () => {
  const load = async (page: Page, url = '/#tasks') => {
    await startSession(page);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
  };

  test('is silent until the browser offers the install, then appears; "Not now" hides it for 30 days', async ({ page }) => {
    await load(page);
    const banner = page.getByTestId('pwa-install-banner');
    await expect(banner).toHaveCount(0);

    await fireInstallPrompt(page);
    await expect(banner).toBeVisible();

    await page.getByTestId('pwa-banner-dismiss').click();
    await expect(banner).toHaveCount(0);
    const stored = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('ccrm_pwa_install_dismissed:'));
      return key ? { key, at: Number(localStorage.getItem(key)) } : null;
    });
    expect(stored?.key).toBe('ccrm_pwa_install_dismissed:erik@crm.com');
    expect(Math.abs(Date.now() - (stored?.at ?? 0))).toBeLessThan(60_000);

    // Next visit within the 30 days: still quiet.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await fireInstallPrompt(page);
    await page.waitForTimeout(500);
    await expect(banner).toHaveCount(0);

    // 31 days later it comes back.
    await page.evaluate((key) => localStorage.setItem(key, String(Date.now() - 31 * 86_400_000)), stored!.key);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await fireInstallPrompt(page);
    await expect(banner).toBeVisible();
  });

  test('the Install button asks the browser, and the banner leaves once the app is installed', async ({ page }) => {
    await load(page);
    await fireInstallPrompt(page);
    const banner = page.getByTestId('pwa-install-banner');
    await expect(banner).toBeVisible();
    await page.getByTestId('pwa-banner-install').click();
    await expect.poll(() => page.evaluate(() => (window as any).__promptCalls)).toBe(1);
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(banner).toHaveCount(0);
  });

  test('declining the browser dialog counts as "not now"', async ({ page }) => {
    await load(page);
    await fireInstallPrompt(page, 'dismissed');
    await page.getByTestId('pwa-banner-install').click();
    await expect(page.getByTestId('pwa-install-banner')).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('ccrm_pwa_install_dismissed:')))).toBe(true);
  });

  test('is never shown in the mini window or in a QA run, even when the browser offers the install', async ({ page }) => {
    await load(page, '/#tasks?embed=tasks');
    await fireInstallPrompt(page);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('pwa-install-banner')).toHaveCount(0);

    await gotoView(page, '#tasks'); // adds ?qa=
    await fireInstallPrompt(page);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('pwa-install-banner')).toHaveCount(0);
  });
});

test.describe('Deep links into Tasks', () => {
  test('#tasks?newTask=<text> opens the create form prefilled and removes the param', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#tasks?newTask=Call%20Silvia%20%26%20confirm%20the%20survey');
    const textarea = page.locator('[data-quick-task-form] textarea');
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue('Call Silvia & confirm the survey');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#tasks');

    // A reload must not open it again.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await expect(page.locator('[data-quick-task-form]')).toHaveCount(0);
  });

  test('#tasks?newTask= (the "New task" shortcut) opens a blank form', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#tasks?newTask=');
    const textarea = page.locator('[data-quick-task-form] textarea');
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue('');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#tasks');
  });

  test('a second link while the form is open adds a line instead of wiping what was typed', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#tasks?newTask=First');
    const textarea = page.locator('[data-quick-task-form] textarea');
    await expect(textarea).toHaveValue('First');
    await page.evaluate(() => {
      location.hash = '#tasks?newTask=Second';
    });
    await expect(textarea).toHaveValue('First\nSecond');
  });

  test('the created task is the shared text', async ({ page }) => {
    await startSession(page);
    await gotoView(page, '#tasks?newTask=Follow%20up%20on%20the%20offer');
    await page.locator('[data-quick-task-form] button[type="submit"]').first().click();
    await expect(page.getByText('Follow up on the offer').first()).toBeVisible();
  });

  test('a share-target arrival (/?ccrm_share_*) becomes the same prefilled form and leaves a clean address', async ({ page }) => {
    await startSession(page);
    const params = new URLSearchParams({
      ccrm_share_title: 'Offer draft',
      ccrm_share_text: 'see page 3',
      ccrm_share_url: 'https://docs.example.com/offer',
    });
    await page.goto(`/?qa=77&${params.toString()}`, { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    const textarea = page.locator('[data-quick-task-form] textarea');
    await expect(textarea).toHaveValue('Offer draft — see page 3 https://docs.example.com/offer');
    const url = await page.evaluate(() => ({ search: location.search, hash: location.hash }));
    expect(url.search).toBe('?qa=77');
    expect(url.hash).toBe('#tasks');
  });

  test('a link opened while signed out survives the login', async ({ page }) => {
    await startSession(page);
    await page.addInitScript(() => sessionStorage.removeItem('crm_current_user_rbac'));
    // Registered after the fixture's catch-all /api/** route, which would otherwise
    // answer the sign-in with a generic failure (the last matching route wins).
    await page.route('**/api/login.php', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, user: TEST_USER }) }),
    );
    await page.goto('/?qa=88#tasks?newTask=Sent%20from%20a%20shortcut', { waitUntil: 'domcontentloaded' });

    // The login screen (the mocked /api/login.php accepts any credentials).
    await page.getByPlaceholder(/@crm\.com/).fill('erik@crm.com');
    await page.locator('input[type="password"]').fill('password');
    await page.locator('form button[type="submit"]').click();

    const textarea = page.locator('[data-quick-task-form] textarea');
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await expect(textarea).toHaveValue('Sent from a shortcut');
  });

  test('#tasks?voice=1 gets the recorder ready and waits for a click when the microphone is not yet allowed', async ({ page }) => {
    await startSession(page);
    await page.addInitScript(() => {
      // No microphone decision yet: the prompt may only follow a click.
      const original = navigator.permissions?.query?.bind(navigator.permissions);
      if (navigator.permissions) {
        navigator.permissions.query = (d: any) =>
          d?.name === 'microphone' ? Promise.resolve({ state: 'prompt' } as PermissionStatus) : original(d);
      }
      (window as any).__gumCalls = 0;
      navigator.mediaDevices.getUserMedia = () => {
        (window as any).__gumCalls++;
        return Promise.reject(new DOMException('stub', 'NotAllowedError'));
      };
    });
    await gotoView(page, '#tasks?voice=1');
    const mic = page.getByTestId('voice-record-button');
    await expect(mic).toBeVisible();
    await expect(mic).toHaveAttribute('data-armed', 'true');
    await expect(page.getByTestId('voice-armed-hint')).toBeVisible();
    await expect(mic).toBeFocused();
    expect(await page.evaluate(() => (window as any).__gumCalls)).toBe(0);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#tasks');

    await mic.click();
    await expect.poll(() => page.evaluate(() => (window as any).__gumCalls)).toBeGreaterThan(0);
  });

  test('#tasks?voice=1 starts recording straight away when the microphone is already allowed', async ({ page }) => {
    await startSession(page);
    await page.addInitScript(() => {
      navigator.permissions.query = (d: any) =>
        Promise.resolve({ state: d?.name === 'microphone' ? 'granted' : 'prompt' } as PermissionStatus);
      (window as any).__gumCalls = 0;
      navigator.mediaDevices.getUserMedia = () => {
        (window as any).__gumCalls++;
        return Promise.reject(new DOMException('stub', 'NotAllowedError'));
      };
    });
    await gotoView(page, '#tasks?voice=1');
    await expect.poll(() => page.evaluate(() => (window as any).__gumCalls)).toBeGreaterThan(0);
  });
});

test.describe('Task badge', () => {
  test('the app badge follows the missed + today count and clears at zero', async ({ page }) => {
    await startSession(page);
    await page.addInitScript(() => {
      (window as any).__badge = [];
      (navigator as any).setAppBadge = async (n: number) => (window as any).__badge.push(n);
      (navigator as any).clearAppBadge = async () => (window as any).__badge.push(0);
    });

    // Independent of the app's own rule: an open task of Erik's due today or earlier.
    const payload = buildSyncPayload() as any;
    const todayStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    const done = (s: string) => s.toLowerCase() === 'done' || s === payload.taskStates?.[payload.taskStates.length - 1];
    const expected = (payload.tasks as any[]).filter(
      (t) =>
        !t.archived &&
        !done(t.status) &&
        t.deadline &&
        t.deadline <= todayStr &&
        ((t.assignedUsers ?? []).includes('Erik') || t.createdBy === 'Erik'),
    ).length;

    await gotoView(page, '#projects');
    await expect
      .poll(async () => (await page.evaluate(() => (window as any).__badge as number[])).slice(-1)[0] ?? -1)
      .toBe(expected);
  });

  test('the mini window does not touch the badge', async ({ page }) => {
    await startSession(page);
    await page.addInitScript(() => {
      (window as any).__badge = [];
      (navigator as any).setAppBadge = async (n: number) => (window as any).__badge.push(n);
      (navigator as any).clearAppBadge = async () => (window as any).__badge.push(0);
    });
    await page.goto('/?qa=91#tasks?embed=tasks', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await page.waitForTimeout(800);
    const calls = await page.evaluate(() => (window as any).__badge as number[]);
    expect(calls.filter((n) => n > 0)).toEqual([]);
  });
});

test.describe('Mini window', () => {
  test('Pop out without Picture-in-Picture opens a small popup on the compact tasks view', async ({ page }) => {
    await startSession(page);
    // Chromium has the real API; hide it to exercise the fallback.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: undefined });
    });
    await gotoView(page, '#tasks');
    const popupPromise = page.waitForEvent('popup');
    await page.getByTestId('tasks-pop-out').click();
    const popup = await popupPromise;
    await popup.waitForURL(/#tasks\?embed=tasks/);
    expect(popup.url()).toContain('/#tasks?embed=tasks');
    await popup.close();
  });

  test('with Document Picture-in-Picture it hosts the compact view in a frame that is already signed in', async ({ page }) => {
    await startSession(page);
    await page.addInitScript(() => {
      // A real, empty, same-origin window stands in for the browser's PiP window.
      // The real API is an accessor on window, so a plain assignment would be ignored.
      Object.defineProperty(window, 'documentPictureInPicture', {
        configurable: true,
        value: {
          window: null,
          requestWindow: async () => {
            const w = window.open('about:blank', 'fake-pip', 'popup=yes,width=420,height=680');
            (window as any).__pip = w;
            return w;
          },
        },
      });
    });
    await gotoView(page, '#tasks');
    const popupPromise = page.waitForEvent('popup');
    await page.getByTestId('tasks-pop-out').click();
    await popupPromise;

    const info = await page.evaluate(async () => {
      const w = (window as any).__pip as Window;
      const frame = w.document.querySelector('iframe') as HTMLIFrameElement | null;
      return {
        hasFrame: !!frame,
        src: frame?.src ?? '',
        allow: frame?.allow ?? '',
        signedIn: !!frame?.contentWindow?.sessionStorage.getItem('crm_current_user_rbac'),
      };
    });
    expect(info.hasFrame).toBe(true);
    expect(info.src).toContain('/#tasks?embed=tasks');
    expect(info.allow).toContain('microphone');
    expect(info.signedIn).toBe(true);
  });

  test('the mini window itself has no Pop out button', async ({ page }) => {
    await startSession(page);
    await page.goto('/?qa=92#tasks?embed=tasks', { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page);
    await expect(page.getByTestId('tasks-pop-out')).toHaveCount(0);
  });
});

test('manifest declares the shortcuts, the share target and a stable identity', async ({ request }) => {
  const manifest = await (await request.get('/manifest.json')).json();
  expect(manifest.id).toBe('/');
  expect(manifest.scope).toBe('/');
  expect(manifest.categories).toEqual(['business', 'productivity']);
  expect(manifest.shortcuts.map((s: any) => s.url)).toEqual(['/#tasks', '/#tasks?voice=1', '/#tasks?newTask=']);
  for (const s of manifest.shortcuts) {
    expect(s.short_name).toBeTruthy();
    expect(s.icons?.length).toBeGreaterThan(0);
  }
  expect(manifest.share_target.method).toBe('GET');
  expect(Object.keys(manifest.share_target.params).sort()).toEqual(['text', 'title', 'url']);
  expect(manifest.screenshots.some((s: any) => s.form_factor === 'wide')).toBe(true);
  for (const shot of manifest.screenshots) {
    const res = await request.get(shot.src);
    expect(res.ok(), shot.src).toBe(true);
  }
});

test('the page keeps the real manifest link (a blob manifest would drop the shortcuts)', async ({ page }) => {
  await startSession(page);
  await page.goto('/?qa=93#tasks', { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('link[rel="manifest"]')).map((l) => (l as HTMLLinkElement).href),
  );
  expect(hrefs).toHaveLength(1);
  expect(hrefs[0]).toMatch(/\/manifest\.json$/);
});

test('the service worker has a pass-through fetch handler and never caches', async ({ request }) => {
  const source = await (await request.get('/sw.js')).text();
  // Comments explain the rule and mention the very calls it forbids.
  const sw = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  expect(sw).toMatch(/addEventListener\("fetch"/);
  expect(sw).not.toMatch(/respondWith|caches\.open|cache\.put|cache\.add/);
});

