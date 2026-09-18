import { test } from '@playwright/test';
import { QAReport } from './helpers/reportCollector';
import { assertNoDefectsFound } from './helpers/gate';
import { ViewCrawler } from './helpers/uiExplorer';
import {
  SETTLE,
  dismissOverlays,
  gotoView,
  readViewState,
  startSession,
  waitForWorkspaceContent,
  type ConsoleCapture,
} from './helpers/appDriver';

/**
 * Navigation is tested the way a user navigates: by clicking the chrome.
 *
 * Reaching a route with `page.goto('#hash')` proves the route renders but says
 * nothing about the button that is supposed to take you there — a nav button
 * wired to the wrong id, or to nothing at all, would still "pass".
 */

test.describe('Shell navigation', () => {
  let consoleCapture: ConsoleCapture;

  test.beforeEach(async ({ page }) => {
    QAReport.beginScope();
    consoleCapture = await startSession(page);
  });

  test('every sidebar nav button opens a working view', async ({ page }) => {
    await gotoView(page, '#dashboard');
    const crawler = new ViewCrawler(page, 'Shell navigation', consoleCapture);

    await crawler.assertViewHealthy('Dashboard (landing view)', 'The app boots straight into a rendered dashboard.');

    // The sidebar ships collapsed, which strips the labels out of the DOM.
    // Expand it once so every item can be named in the report.
    const toggle = page.locator('aside nav button[aria-label]').first();
    if (await toggle.isVisible({ timeout: 1500 }).catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(SETTLE.content);
    }

    const navButtons = page.locator('aside nav > button:not([aria-label])');
    const items = await navButtons.evaluateAll((els) =>
      els.map((el) => ({
        label: (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
        // The item for the view already on screen is highlighted. Clicking it is
        // legitimately a no-op, so it must not be reported as dead navigation.
        active: /\btext-white\b/.test(typeof el.className === 'string' ? el.className : ''),
      })),
    );
    const labels = items.map((i) => i.label);

    test.info().annotations.push({ type: 'nav-items', description: `${labels.length}: ${labels.join(', ')}` });

    if (labels.length === 0) {
      QAReport.record({
        module: 'Shell navigation',
        target: 'Sidebar',
        action: 'Enumerate the sidebar navigation buttons',
        expected: 'The sidebar exposes one button per module.',
        actual: 'No navigation buttons were found in the sidebar.',
        category: 'INTERACTION_FAILED',
        severity: 'CRITICAL',
        details: 'Selector `aside nav > button:not([aria-label])` matched nothing. The shell markup may have changed.',
      });
      assertNoDefectsFound();
      return;
    }

    const visited: string[] = [];

    for (let i = 0; i < labels.length; i++) {
      const label = labels[i] || `nav item #${i + 1}`;
      const button = page.locator('aside nav > button:not([aria-label])').nth(i);
      if (!(await button.isVisible({ timeout: 600 }).catch(() => false))) continue;

      const before = await readViewState(page);
      const clicked = await button.click({ timeout: 4000 }).then(
        () => true,
        () => false,
      );

      if (!clicked) {
        QAReport.record({
          module: 'Shell navigation',
          target: `Nav button "${label}"`,
          action: `Click the "${label}" button in the sidebar`,
          expected: 'The button is clickable and switches the workspace to that module.',
          actual: 'The button could not be clicked.',
          category: 'INTERACTION_FAILED',
          severity: 'HIGH',
        });
        continue;
      }

      // Clicking a nav item is a same-document hash change, so there is no load
      // event: the lazy view chunk has to be waited for explicitly.
      await waitForWorkspaceContent(page);
      const after = await readViewState(page);

      if (after.hash === before.hash && after.fingerprint === before.fingerprint) {
        if (items[i].active) {
          QAReport.pass('Shell navigation', `"${label}" was already the open module and stayed healthy when re-clicked`);
        } else {
          QAReport.record({
            module: 'Shell navigation',
            target: `Nav button "${label}"`,
            action: `Click the "${label}" button in the sidebar`,
            expected: 'The URL changes to that module and its view renders.',
            actual: `Nothing changed — the URL stayed at \`${before.hash}\` and the content was identical.`,
            category: 'NAVIGATION_DID_NOTHING',
            severity: 'HIGH',
            url: page.url(),
            proposedFix:
              'The nav button did not route. Check the item id it dispatches is one the route parser recognises,\n' +
              'and that the click handler is not being swallowed by the drag/edit-mode guard.',
          });
        }
        continue;
      }

      const moduleCrawler = new ViewCrawler(page, `Shell navigation → ${label}`, consoleCapture);
      await moduleCrawler.assertViewHealthy(
        `${label} (reached by clicking its nav button)`,
        `Clicking "${label}" shows the ${label} module, rendered and free of errors.`,
      );
      moduleCrawler.drainConsole(`${label} view`);
      visited.push(`${label} → ${after.hash}`);

      // Clicking a nav item re-collapses the sidebar; reopen for the next label.
      const reopen = page.locator('aside nav button[aria-label]').first();
      if (await reopen.isVisible({ timeout: 800 }).catch(() => false)) {
        await reopen.click().catch(() => {});
        await page.waitForTimeout(SETTLE.micro);
      }
    }

    test.info().annotations.push({ type: 'routes-visited', description: visited.join(' | ') });
    assertNoDefectsFound();
  });

  test('every header control produces a visible result', async ({ page }) => {
    await gotoView(page, '#dashboard');
    const crawler = new ViewCrawler(page, 'Header', consoleCapture);

    const controls = await page.evaluate(() => {
      const header = document.querySelector('header');
      if (!header) return [];
      const out: Array<{ index: number; label: string }> = [];
      let i = 0;
      header.querySelectorAll('button').forEach((raw) => {
        const el = raw as HTMLButtonElement;
        if (el.disabled) return;
        const r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) return;
        const label =
          el.innerText?.replace(/\s+/g, ' ').trim() ||
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          `header control #${i + 1}`;
        if (/odhlási|logout|sign\s*out/i.test(label)) return;
        el.setAttribute('data-qa-header', String(i));
        out.push({ index: i, label: label.slice(0, 60) });
        i++;
      });
      return out;
    });

    if (controls.length === 0) {
      QAReport.record({
        module: 'Header',
        target: 'Header',
        action: 'Enumerate the header controls',
        expected: 'The header exposes its action buttons.',
        actual: 'No header buttons were found.',
        category: 'INTERACTION_FAILED',
        severity: 'HIGH',
      });
    }

    for (const control of controls) {
      const button = page.locator(`[data-qa-header="${control.index}"]`);
      if (!(await button.isVisible({ timeout: 500 }).catch(() => false))) continue;

      const before = await readViewState(page);
      const clicked = await button.click({ timeout: 3500 }).then(
        () => true,
        () => false,
      );
      if (!clicked) {
        QAReport.record({
          module: 'Header',
          target: `Header control "${control.label}"`,
          action: `Click "${control.label}" in the header`,
          expected: 'The control responds.',
          actual: 'The control could not be clicked.',
          category: 'INTERACTION_FAILED',
          severity: 'MEDIUM',
        });
        continue;
      }

      await page.waitForTimeout(SETTLE.content);
      const after = await readViewState(page);

      if (after.errorScreen) {
        QAReport.record({
          module: 'Header',
          target: `Header control "${control.label}"`,
          action: `Click "${control.label}" in the header`,
          expected: 'The control performs its action without breaking the workspace.',
          actual: `An error screen appeared: "${after.errorScreen}"`,
          category: 'ERROR_SCREEN',
          severity: 'HIGH',
          url: page.url(),
        });
      } else if (
        after.hash === before.hash &&
        after.fingerprint === before.fingerprint &&
        after.overlayCount === before.overlayCount
      ) {
        // Popovers are not `inset-0` overlays, so check for one explicitly
        // before calling a control inert.
        const popover = await page.locator('[role="listbox"], [role="menu"], [role="dialog"]').count();
        if (popover === 0) {
          QAReport.record({
            module: 'Header',
            target: `Header control "${control.label}"`,
            action: `Click "${control.label}" in the header`,
            expected: 'Something visible happens: a panel opens, or the workspace changes.',
            actual: 'Nothing observable happened.',
            category: 'INTERACTION_FAILED',
            severity: 'LOW',
            details: 'No URL change, no content change, no overlay and no popover appeared.',
          });
        } else {
          QAReport.pass('Header', `"${control.label}" opened a popover`);
        }
      } else {
        QAReport.pass('Header', `"${control.label}" produced a visible result`);
      }

      await page.keyboard.press('Escape').catch(() => {});
      await dismissOverlays(page);
      if ((await readViewState(page)).hash !== before.hash) {
        await gotoView(page, before.hash);
      }
    }

    crawler.drainConsole('Header controls');
    await page.evaluate(() =>
      document.querySelectorAll('[data-qa-header]').forEach((el) => el.removeAttribute('data-qa-header')),
    );
    assertNoDefectsFound();
  });
});
