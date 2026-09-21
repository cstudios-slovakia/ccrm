import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

/**
 * Hand-logging an e-mail on a lead's timeline.
 *
 * Reported from production: a follow-up sent at 16:50 was filed at 16:27 —
 * below the 16:49 status change it followed — because the form's date/time is
 * a prefill stamped when the form last reset, and nobody touches it. Until the
 * user edits those fields the entry has to be stamped at the save.
 *
 * The same report showed the client's reply logged as "Sent direct e-mail":
 * the form could only log mail we sent. It now logs either direction, and an
 * existing entry's direction is correctable.
 *
 * The fixture runs in Slovak. The system time is pinned (not the timers), so
 * the app's polling behaves normally.
 */

const LEAD_HASH = '#lead-lead-horvath';

type PushedEvent = { id: string; type: string; timestamp: string; title: string; isOutgoing?: boolean };

/** Every timeline event pushed to /sync.php, newest write winning per id. */
function recordSyncedEvents(page: Page) {
  const pushed = new Map<string, PushedEvent>();
  void page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as { leads?: { timeline?: PushedEvent[] }[] };
        for (const lead of body?.leads ?? []) for (const ev of lead.timeline ?? []) pushed.set(ev.id, ev);
      } catch {
        /* not JSON — nothing to record */
      }
    }
    await route.fallback();
  });
  return pushed;
}

/** The event-type switcher's button, scoped to the logger (the page has other "E-mail"s). */
const typeButton = (page: Page, label: string) =>
  page.getByText('Výber typu udalosti').locator('xpath=..').getByRole('button', { name: label, exact: true });

test.describe('Lead timeline — logging an e-mail', () => {
  test('an untouched date/time is stamped at the save, not when the form opened', async ({ page }) => {
    await page.clock.setSystemTime(new Date('2026-09-16T16:27:00'));
    await startSession(page);
    const pushed = recordSyncedEvents(page);
    await gotoView(page, LEAD_HASH);

    await typeButton(page, 'E-mail').click();
    await expect(page.locator('input[type="time"][required]')).toHaveValue('16:27');
    await page.getByPlaceholder('Uveďte podrobnosti alebo poznámky k tejto udalosti...').fill('Follow-up po telefonáte');

    // Twenty-three minutes of writing later…
    await page.clock.setSystemTime(new Date('2026-09-16T16:50:00'));
    await page.getByRole('button', { name: /Zaznamenať detaily udalosti/ }).click();

    await expect.poll(() => [...pushed.values()].find((e) => e.title === 'Odoslaný priamy e-mail')?.timestamp)
      .toBe('2026-09-16 16:50');
    const logged = [...pushed.values()].find((e) => e.title === 'Odoslaný priamy e-mail');
    expect(logged?.isOutgoing).toBe(true);
  });

  test('a date/time the user set is kept as given', async ({ page }) => {
    await page.clock.setSystemTime(new Date('2026-09-16T16:27:00'));
    await startSession(page);
    const pushed = recordSyncedEvents(page);
    await gotoView(page, LEAD_HASH);

    await typeButton(page, 'Hovor').click();
    await page.locator('input[type="time"][required]').fill('09:15');
    await page.getByPlaceholder('Uveďte podrobnosti alebo poznámky k tejto udalosti...').fill('Ranný telefonát');
    await page.clock.setSystemTime(new Date('2026-09-16T16:50:00'));
    await page.getByRole('button', { name: /Zaznamenať detaily udalosti/ }).click();

    await expect.poll(() => [...pushed.values()].find((e) => e.type === 'phone' && e.timestamp.startsWith('2026-09-16'))?.timestamp)
      .toBe('2026-09-16 09:15');
  });

  test('a received e-mail is logged as incoming, with its own title', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedEvents(page);
    await gotoView(page, LEAD_HASH);

    await typeButton(page, 'E-mail').click();
    await page.getByRole('button', { name: 'Prijatý', exact: true }).click();
    await page.getByPlaceholder('Uveďte podrobnosti alebo poznámky k tejto udalosti...').fill('Odpovedal na môj mail');
    await page.getByRole('button', { name: /Zaznamenať detaily udalosti/ }).click();

    await expect.poll(() => [...pushed.values()].find((e) => e.title === 'Prijatý e-mail')?.isOutgoing).toBe(false);
    await expect(page.getByRole('heading', { name: 'Prijatý e-mail' })).toBeVisible();
    await page.screenshot({ path: 'test-results/lead-email-received.png', fullPage: false });
  });

  test('an existing hand-logged e-mail can be flipped to the other direction', async ({ page }) => {
    await startSession(page);
    const pushed = recordSyncedEvents(page);
    await gotoView(page, '#lead-lead-novak');

    // ev-novak-1 is a hand-logged incoming e-mail ("Dopyt na materiál").
    const card = page.locator('div.group').filter({ has: page.getByRole('heading', { name: 'Dopyt na materiál' }) }).last();
    await card.getByTitle('Upraviť udalosť').click();
    await card.getByRole('button', { name: 'Odoslaný', exact: true }).click();
    await card.getByRole('button', { name: /Uložiť/ }).click();

    await expect.poll(() => pushed.get('ev-novak-1')?.isOutgoing).toBe(true);
    expect(pushed.get('ev-novak-1')?.title).toBe('Odoslaný priamy e-mail');
  });

  test('a sent e-mail logged before the direction was stored can be flipped to received', async ({ page }) => {
    await startSession(page);
    // Entries hand-logged before isOutgoing existed carry only the 'sent' title.
    // The missing flag used to read as incoming, so choosing 'Prijatý' looked
    // like no change and the entry kept its 'Odoslaný priamy e-mail' title.
    await page.route('**/sync.php**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const body = buildSyncPayload();
      const lead = body.leads.find((l) => l.id === 'lead-novak')!;
      (lead.timeline as object[]).push({
        id: 'ev-novak-legacy',
        type: 'email',
        timestamp: lead.timeline[0].timestamp,
        title: 'Odoslaný priamy e-mail',
        content: 'Odpovedal na môj mail',
      });
      await route.fulfill({ json: body });
    });
    const pushed = recordSyncedEvents(page);
    await gotoView(page, '#lead-lead-novak');

    const card = page.locator('div.group').filter({ hasText: 'Odpovedal na môj mail' }).last();
    await expect(card.getByText('Odchádzajúce')).toBeVisible();
    await card.getByTitle('Upraviť udalosť').click();
    await card.getByRole('button', { name: 'Prijatý', exact: true }).click();
    await card.getByRole('button', { name: /Uložiť/ }).click();

    await expect.poll(() => pushed.get('ev-novak-legacy')?.isOutgoing).toBe(false);
    expect(pushed.get('ev-novak-legacy')?.title).toBe('Prijatý e-mail');
    await expect(card.getByRole('heading', { name: 'Prijatý e-mail' })).toBeVisible();
  });
});
