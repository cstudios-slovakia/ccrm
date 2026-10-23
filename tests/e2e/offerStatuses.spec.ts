import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';
import { holdToConfirm } from './helpers/hold';

/**
 * Price offer statuses are configured in Price offers → Offer settings, the way
 * project statuses are. What matters is what reaches the server (the list the
 * next device loads, offers moved off a deleted status) and what the list view
 * does with a status it knows nothing about, so both are pinned as journeys.
 *
 * The fixture runs in Slovak. The dataset has no price offers, so the specs put
 * a few into the mocked `GET /sync.php`.
 */

const COMPANY = {
  companyName: 'Test Stavby s.r.o.', street: 'Hlavná 1', city: 'Bratislava', postalCode: '81101', country: 'Slovakia',
  companyId: '11223344', taxId: '2011223344', vatId: 'SK2011223344', email: 'info@teststavby.sk', phone: '+421 900 000 000',
  website: 'teststavby.sk', iban: 'SK00 0000 0000 0000 0000 0000', swift: 'TESTSKBX', bankName: 'Testbanka',
  defaultPaymentDueDays: 14, defaultVatRate: 20, vatRates: [20, 10, 0], defaultWarrantyText: '', defaultDurationText: '',
  defaultNextSteps: '', defaultSocialProof: '', defaultUspCards: [],
};

const offer = (id: string, number: string, status: string, total = 100) => ({
  id, documentNumber: number, type: 'price_offer', mode: 'default', leadId: 'lead-novak', clientId: 'lead-novak',
  clientName: `Klient ${number}`, clientCountry: 'Slovakia', title: `Ponuka ${number}`, subject: `Predmet ${number}`,
  items: [], subtotal: total, vatAmount: 0, totalPrice: total, currency: 'EUR', status,
  issuedAt: '2026-08-01', validUntil: '2026-08-31', createdBy: 'Erik',
});

async function seed(page: Page, offers: Record<string, unknown>[], offerStatuses?: unknown) {
  await page.route('**/sync.php**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const base = buildSyncPayload();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...base,
        invoicesOffers: offers,
        settings: { ...base.settings, companyBillingSettings: COMPANY, ...(offerStatuses ? { offerStatuses } : {}) },
      }),
    });
  });
}

type Pushed = {
  offerStatuses?: { key: string; label?: string; group: string }[];
  offers: Map<string, Record<string, unknown>>;
};

/** What the app pushed to /sync.php, newest write winning. */
function recordPushes(page: Page): Pushed {
  const pushed: Pushed = { offers: new Map() };
  void page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as {
          settings?: { offerStatuses?: Pushed['offerStatuses'] };
          invoicesOffers?: Record<string, unknown>[];
        };
        if (body?.settings?.offerStatuses) pushed.offerStatuses = body.settings.offerStatuses;
        for (const o of body?.invoicesOffers ?? []) pushed.offers.set(String(o.id), o);
      } catch {
        /* not JSON — nothing to record */
      }
    }
    await route.fallback();
  });
  return pushed;
}

const statusRow = (page: Page, key: string) => page.getByTestId(`offer-status-row-${key}`);
const openOfferSettings = async (page: Page) => {
  await gotoView(page, '#invoices');
  await page.getByRole('button', { name: /Nastavenia ponúk/ }).first().click();
  await expect(page.getByTestId('offer-status-settings')).toBeVisible();
};

test.describe('Offer statuses', () => {
  test('a status is added and renamed in settings, and the list is pushed to the server', async ({ page }) => {
    await startSession(page);
    await seed(page, [offer('io-1', 'CP-2026-001', 'draft')]);
    const pushed = recordPushes(page);
    await openOfferSettings(page);

    // The six built-ins, "invoiced" marked as legacy.
    for (const key of ['draft', 'sent', 'approved', 'invoiced', 'rejected', 'cancelled']) {
      await expect(statusRow(page, key)).toBeVisible();
    }
    await expect(statusRow(page, 'invoiced')).toContainText(/starý/);

    // Add one — it lands in "Open", the form's default group.
    await page.getByLabel('Nový stav ponuky').fill('Precenenie');
    await page.getByRole('button', { name: 'Pridať stav' }).click();
    await expect(statusRow(page, 'precenenie')).toContainText('Precenenie');
    await expect
      .poll(() => (pushed.offerStatuses ?? []).map((d) => d.key), { timeout: 10_000 })
      .toEqual(['draft', 'sent', 'precenenie', 'approved', 'invoiced', 'rejected', 'cancelled']);

    // Rename a built-in: only the label changes; the key an offer stores stays.
    await statusRow(page, 'sent').getByTitle('Premenovať').click();
    const input = statusRow(page, 'sent').locator('input');
    await input.fill('Odoslané klientovi');
    await input.press('Enter');
    await expect(statusRow(page, 'sent')).toContainText('Odoslané klientovi');
    await expect
      .poll(() => pushed.offerStatuses?.find((d) => d.key === 'sent')?.label, { timeout: 10_000 })
      .toBe('Odoslané klientovi');

    // An unused status is removed without a question.
    await holdToConfirm(statusRow(page, 'precenenie').getByRole('button', { name: /^Zmazať:/ }));
    await expect(statusRow(page, 'precenenie')).toHaveCount(0);
    await expect(page.getByTestId('offer-status-reassign')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/offer-statuses-settings.png', fullPage: false });
  });

  test('deleting a status that offers use asks where to move them', async ({ page }) => {
    await startSession(page);
    await seed(page, [offer('io-1', 'CP-2026-001', 'rejected'), offer('io-2', 'CP-2026-002', 'rejected'), offer('io-3', 'CP-2026-003', 'draft')]);
    const pushed = recordPushes(page);
    await openOfferSettings(page);

    await expect(statusRow(page, 'rejected')).toContainText('2');
    await holdToConfirm(statusRow(page, 'rejected').getByRole('button', { name: /^Zmazať:/ }));

    // Nothing is deleted yet: the question comes first.
    const ask = page.getByTestId('offer-status-reassign');
    await expect(ask).toBeVisible();
    await expect(ask).toContainText('2 cenových ponúk');
    await expect(statusRow(page, 'rejected')).toBeVisible();

    await ask.getByRole('button', { name: 'Presunúť a zmazať' }).click();
    await expect(statusRow(page, 'rejected')).toHaveCount(0);
    // "Lost" has no other status, so the offers go to where offers start.
    await expect.poll(() => pushed.offers.get('io-1')?.status, { timeout: 10_000 }).toBe('draft');
    await expect.poll(() => pushed.offers.get('io-2')?.status, { timeout: 10_000 }).toBe('draft');
    await expect.poll(() => (pushed.offerStatuses ?? []).map((d) => d.key), { timeout: 10_000 }).not.toContain('rejected');
  });

  test('the last draft status cannot be removed', async ({ page }) => {
    await startSession(page);
    await seed(page, []);
    await openOfferSettings(page);

    await holdToConfirm(statusRow(page, 'draft').getByRole('button', { name: /^Zmazať:/ }));
    await expect(statusRow(page, 'draft')).toBeVisible();
  });

  test('the list speaks a custom list, counts wins by group, and shows an unknown status raw', async ({ page }) => {
    await startSession(page);
    await seed(
      page,
      [
        offer('io-1', 'CP-2026-001', 'uzavreta_vyhra', 1000),
        offer('io-2', 'CP-2026-002', 'uzavreta_prehra', 500),
        offer('io-3', 'CP-2026-003', 'precenenie', 200),
        offer('io-4', 'CP-2026-004', 'mystery_state', 300),
      ],
      [
        { key: 'draft', color: '#64748b', group: 'draft' },
        { key: 'precenenie', label: 'Precenenie', color: '#f59e0b', group: 'open' },
        { key: 'uzavreta_vyhra', label: 'Cenová ponuka uzavretá', color: '#10b981', group: 'won' },
        { key: 'uzavreta_prehra', label: 'Uzavretá bez objednávky', color: '#f43f5e', group: 'lost' },
        { key: 'cancelled', color: '#f43f5e', group: 'cancelled' },
      ],
    );
    await gotoView(page, '#invoices');

    await expect(page.getByText('Cenová ponuka uzavretá').first()).toBeVisible();
    await expect(page.getByText('Uzavretá bez objednávky').first()).toBeVisible();
    await expect(page.getByText('Precenenie').first()).toBeVisible();
    // A key the list does not know is shown as it is, not swallowed or crashed on.
    await expect(page.getByText('mystery_state').first()).toBeVisible();
    // One won, one lost: the win rate is 50 % whatever the statuses are called.
    await expect(page.getByText('50 %').or(page.getByText('50%')).first()).toBeVisible();
  });
});
