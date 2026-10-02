import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

/**
 * Project -> Finances -> "Project Value & Invoicable". The block answers one
 * question: how much is still to be paid to us. Every number is split by
 * Finance's own rules (cancelled rows do not count, a partly paid invoice
 * keeps its unpaid rest), and a payment entered in the block is always one
 * NEW paid income row.
 *
 * The QA dataset runs in Slovak, so labels are matched in both languages.
 * project-1 gets a plain value of 10 000 and a hand-made set of income rows.
 */

const SETTLE = { timeout: 20_000 };
const NUM = (head: number, tail: string) => new RegExp(`${head}[,.\\s\\u00a0]?${tail}`);

type Row = Record<string, unknown>;
const income = (over: Row): Row => ({
  type: 'income',
  subtype: 'invoice',
  title: 'Faktúra',
  categoryId: null,
  currency: 'EUR',
  issueDate: '2026-03-10',
  isRecurring: false,
  projectId: 'project-1',
  clientId: 'lead-silvia',
  taxRate: 20,
  amountPlanned: 0,
  amountReal: 0,
  ...over,
});

/** Serves project-1 with value 10 000 and exactly these income rows; records every pushed financial row. */
async function seed(page: Page, rows: Row[]) {
  await startSession(page);
  const pushed: Row[] = [];
  await page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      const payload = buildSyncPayload();
      const body = {
        ...payload,
        projects: payload.projects.map((p) => (p.id === 'project-1' ? { ...p, value: 10000 } : p)),
        financialRecords: [
          ...payload.financialRecords.filter((r: Row) => r.projectId !== 'project-1'),
          ...rows.map((r, i) => ({ id: `qa-${i}`, ...r })),
        ],
      };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    try {
      const body = request.postDataJSON() as { financialRecords?: Row[] };
      for (const r of body?.financialRecords ?? []) pushed.push(r);
    } catch {
      /* not JSON */
    }
    return route.fallback();
  });
  return pushed;
}

async function openBlock(page: Page): Promise<Locator> {
  await gotoView(page, '#projects');
  await page.getByText('Strecha Silvia — etapa 1').first().click();
  await page.getByRole('button', { name: /^(Finances|Financie|Pénzügyek)$/ }).first().click();
  const block = page
    .locator('div.rounded-2xl')
    .filter({ hasText: /Project Value & Invoicable|Hodnota projektu a fakturácia/ })
    .last();
  await expect(block).toBeVisible(SETTLE);
  return block;
}

const S4 = [
  income({ amountPlanned: 4000, amountReal: 4000, status: 'paid', paidDate: '2026-03-12' }),
  income({ amountPlanned: 6000, amountReal: 0, status: 'pending', dueDate: '2099-01-01' }),
];

test.describe('Project value block', () => {
  test('paid 4 000 + pending 6 000 -> still to be paid 6 000', async ({ page }) => {
    await seed(page, S4);
    const block = await openBlock(page);
    await expect(block).toContainText(/Ešte nám zostáva uhradiť|Still to be paid to us/, SETTLE);
    await expect(block).toContainText(NUM(6, '000'));
    await expect(block).toContainText(/Prijaté|Received/);
    // Nothing is left to invoice, so there is no "pay the rest" shortcut.
    await expect(block.getByRole('button', { name: /Označiť .* uhradený|Mark the uninvoiced rest|Mark whole value/ })).toHaveCount(0);
  });

  test('a cancelled invoice shows the badge and returns to "not invoiced yet"', async ({ page }) => {
    await seed(page, [income({ amountPlanned: 3000, amountReal: 0, status: 'cancelled' })]);
    const block = await openBlock(page);
    await expect(block).toContainText(/Zatiaľ nevyfakturované|Not invoiced yet/, SETTLE);
    // The whole 10 000 is still not invoiced, the cancelled 3 000 included.
    await expect(block).toContainText(new RegExp(`(Zatiaľ nevyfakturované|Not invoiced yet)\\s*10[,.\\s\\u00a0]?000`));
    const row = page.locator('table tbody tr').filter({ hasText: 'Faktúra' }).first();
    await expect(row.getByText(/^(Cancelled|Zrušené)$/)).toBeVisible();
  });

  test('the shortcut opens the editor and Save adds exactly one paid row of the uninvoiced rest', async ({ page }) => {
    const pushed = await seed(page, [income({ amountPlanned: 4000, amountReal: 4000, status: 'paid', paidDate: '2026-03-12' })]);
    const block = await openBlock(page);

    await block.getByRole('button', { name: /Mark the uninvoiced rest|Označiť nevyfakturovaný zvyšok/ }).click();
    // Nothing is booked by the click itself.
    await expect(block.getByLabel(/Still to be paid to us|Ešte nám zostáva uhradiť/)).toHaveValue('0', SETTLE);
    expect(pushed.filter((r) => r.title === 'Prijatá platba' || r.title === 'Payment received')).toHaveLength(0);

    await block.getByRole('button', { name: /^(Save|Uložiť)$/ }).click();
    await expect
      .poll(() => pushed.filter((r) => /^(Prijatá platba|Payment received|Beérkezett befizetés)$/.test(String(r.title))).length, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const payments = new Map<string, Row>();
    for (const r of pushed) if (/^(Prijatá platba|Payment received|Beérkezett befizetés)$/.test(String(r.title))) payments.set(String(r.id), r);
    expect(payments.size).toBe(1);
    const [payment] = [...payments.values()];
    expect(Number(payment.amountReal)).toBe(6000);
    expect(Number(payment.amountPlanned)).toBe(6000);
    expect(payment.status).toBe('paid');
    expect(payment.projectId).toBe('project-1');
    expect(payment.categoryId ?? null).toBeNull();

    await expect(block).toContainText(/Plne uhradené|Fully paid/, SETTLE);
  });

  test('Save is disabled when the amount is below what is invoiced and unpaid', async ({ page }) => {
    await seed(page, S4);
    const block = await openBlock(page);
    await block.getByRole('button', { name: /Edit remaining|Upraviť zostávajúce/ }).click();
    await block.getByLabel(/Still to be paid to us|Ešte nám zostáva uhradiť/).fill('100');
    await expect(block.getByRole('button', { name: /^(Save|Uložiť)$/ })).toBeDisabled();
    await expect(block.getByTestId('remaining-explanation')).toContainText(/already invoiced and unpaid|už vyfakturované a neuhradené/);

    // A payment may only lower the amount.
    await block.getByLabel(/Still to be paid to us|Ešte nám zostáva uhradiť/).fill('6000');
    await expect(block.getByRole('button', { name: /^(Save|Uložiť)$/ })).toBeDisabled();
    await expect(block.getByTestId('remaining-explanation')).toContainText(/can only lower|môže sumu iba znížiť/);
  });

  test('Price changed moves the project value to received + remaining', async ({ page }) => {
    await seed(page, S4);
    const block = await openBlock(page);
    await expect(block).toContainText(NUM(10, '000'), SETTLE);

    await block.getByRole('button', { name: /Edit remaining|Upraviť zostávajúce/ }).click();
    await block.getByRole('button', { name: /^(Price changed|Zmena ceny)$/ }).click();
    await block.getByLabel(/Still to be paid to us|Ešte nám zostáva uhradiť/).fill('8000,50');
    await expect(block.getByTestId('remaining-explanation')).toContainText(NUM(12, '000'));
    await block.getByRole('button', { name: /^(Save|Uložiť)$/ }).click();

    // 4 000 received + 8 000,50 -> 12 000,50 in the header.
    await expect(block.locator('span.text-body')).toContainText(NUM(12, '000'), SETTLE);
  });
});
