import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

/**
 * The price offer editor: an inline, what-you-see-is-what-you-get document
 * instead of the old five-step popup.
 *
 * Pinned as journeys because the crawler cannot judge any of it: it would never
 * notice that an overlay crept back in, that Preview still printed a
 * placeholder, or that "Cancel" threw away typed work without asking.
 *
 * The QA dataset has no price offers, AI templates or accounting services, so
 * the specs that need them put them into the mocked `GET /sync.php`.
 */

const LEAD_ID = 'lead-novak';
const LEAD_NAME = /Novák Stavby/;

const COMPANY = {
  companyName: 'Test Stavby s.r.o.',
  street: 'Hlavná 1',
  city: 'Bratislava',
  postalCode: '81101',
  country: 'Slovakia',
  companyId: '11223344',
  taxId: '2011223344',
  vatId: 'SK2011223344',
  email: 'info@teststavby.sk',
  phone: '+421 900 000 000',
  website: 'teststavby.sk',
  iban: 'SK00 0000 0000 0000 0000 0000',
  swift: 'TESTSKBX',
  bankName: 'Testbanka',
  defaultPaymentDueDays: 14,
  defaultVatRate: 20,
  vatRates: [20, 10, 0],
  // Left empty on purpose: "warranty" is the field the Preview test leaves blank.
  defaultWarrantyText: '',
  defaultDurationText: '',
  defaultNextSteps: '',
  defaultSocialProof: '',
  defaultUspCards: [],
};

const template = (id: string, name: string) => ({
  id,
  name,
  colors: { primary: '#1e3a8a', secondary: '#2563eb', background: '#ffffff', accent: '#3b82f6', text: '#111827' },
  typography: { fontFamily: 'Inter', headingStyle: 'bold' },
  sectionsOrder: [],
  badgeStyle: 'rounded',
  createdAt: '2026-01-05',
});

const PROVIDERS = {
  superfaktura: { enabled: true, email: 'a@b.sk', apiKey: 'x', companyId: '1', sandbox: true },
  idoklad: { enabled: false, clientId: '', clientSecret: '', sandbox: false },
};

/** A saved offer, in the shape `sync.php` hands back. */
const SEEDED_OFFER = {
  id: 'io-seeded',
  documentNumber: 'CP-2026-001',
  type: 'price_offer',
  mode: 'default',
  leadId: LEAD_ID,
  clientId: LEAD_ID,
  clientName: 'Novák Stavby s.r.o.',
  clientStreet: 'Priemyselná 12',
  clientCity: 'Košice',
  clientPostalCode: '04001',
  clientCountry: 'Slovakia',
  clientIco: '12345678',
  title: 'Ponuka — uložená',
  subject: 'Rekonštrukcia strechy',
  location: 'Košice',
  greetingNote: 'Dobrý deň,',
  introNote: null,
  uspCards: [],
  reassuranceNote: null,
  items: [
    { id: 'ioi-1', name: 'Plech', description: '', quantity: 2, unit: 'ks', unitPrice: 50, vatRate: 20, discountPct: 0, totalPrice: 100 },
  ],
  subtotal: 100,
  vatAmount: 20,
  totalPrice: 120,
  priceRangeMin: null,
  priceRangeMax: null,
  currency: 'EUR',
  durationText: null,
  startDateText: null,
  warrantyText: null,
  nextStepsNote: null,
  closingNote: null,
  signOffTeam: null,
  customTemplateId: null,
  status: 'draft',
  issuedAt: '2026-08-01',
  validUntil: '2026-08-31',
  dueDate: null,
  createdBy: 'Erik',
};

interface Seed {
  templates?: ReturnType<typeof template>[];
  providers?: boolean;
  offers?: Record<string, unknown>[];
}

/**
 * Puts invoicing data into the mocked sync. Registered after the fixture's
 * mocks, so Playwright asks this one first; writes fall through to the fixture,
 * which records and acknowledges them.
 */
async function seedInvoicing(page: Page, seed: Seed = {}) {
  await page.route('**/sync.php**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const base = buildSyncPayload();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...base,
        invoicesOffers: seed.offers ?? [],
        aiCustomTemplates: seed.templates ?? [],
        settings: {
          ...base.settings,
          companyBillingSettings: COMPANY,
          invoicingIntegrations: seed.providers ? PROVIDERS : null,
        },
      }),
    });
  });
}

/** Every invoicing document the app pushed to /sync.php, newest write winning per id. */
function recordSyncedOffers(page: Page) {
  const pushed = new Map<string, Record<string, unknown>>();
  void page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as { invoicesOffers?: Record<string, unknown>[] };
        for (const offer of body?.invoicesOffers ?? []) pushed.set(String(offer.id), offer);
      } catch {
        /* not JSON — nothing to record */
      }
    }
    await route.fallback();
  });
  return pushed;
}

const editorOf = (page: Page) => page.locator('[data-offer-editor]');
const newOfferButton = (page: Page) => page.getByRole('button', { name: /New price offer|Nová cenová ponuka/ });

async function chooseTemplate(page: Page, entry: RegExp) {
  await newOfferButton(page).click();
  await page.getByRole('menuitem', { name: entry }).click();
  await expect(editorOf(page)).toBeVisible();
}

const standard = /Standard template|Štandardná šablóna/;

/**
 * Full-screen fixed layers in the DOM. The app shell owns a few of its own (a
 * mobile drawer's catcher, banners), so what matters is that opening the editor
 * adds none — it is compared against the count from before.
 */
const fixedOverlayCount = (page: Page) =>
  page.evaluate(() => document.querySelectorAll('.fixed.inset-0').length);
const subjectField = (editor: Locator) => editor.getByPlaceholder(/Subject of the offer|Predmet ponuky/);
const warrantyField = (editor: Locator) => editor.getByPlaceholder(/Warranty, e\.g\. 24 months|Záruka, napr\. 24 mesiacov/);
const warrantyLabel = (editor: Locator) => editor.getByText(/^(WARRANTY|ZÁRUKA)$/);

test.describe('Price offer inline editor', () => {
  test('the menu lists the three templates and the disabled ones say why', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page);
    await gotoView(page, '#invoices');

    const trigger = newOfferButton(page);
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await trigger.click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: standard })).toBeEnabled();

    // No AI template and no accounting service in this workspace: both stay
    // listed, both explain what is missing.
    const ai = menu.getByRole('menuitem', { name: /AI template|AI šablóna/ });
    await expect(ai).toHaveAttribute('aria-disabled', 'true');
    await expect(menu.getByText(/No AI template uploaded yet|Zatiaľ nie je nahraná žiadna AI šablóna/)).toBeVisible();
    const external = menu.getByRole('menuitem', { name: /SuperFaktúra \/ iDoklad/ });
    await expect(external).toHaveAttribute('aria-disabled', 'true');
    await expect(menu.getByText(/No accounting service enabled|Nie je zapnutá žiadna účtovná služba/)).toBeVisible();

    // The admin can go and fix it from the menu.
    await expect(menu.getByRole('menuitem', { name: /Open offer settings|Otvoriť nastavenia ponúk/ })).toHaveCount(2);

    // Escape closes it and hands the focus back to the button.
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('the menu works from the keyboard and skips entries that cannot be used', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page);
    await gotoView(page, '#invoices');

    const trigger = newOfferButton(page);
    await trigger.focus();
    await page.keyboard.press('Enter');

    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: standard })).toBeFocused();

    // Arrow keys step over the two disabled entries to the settings links.
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: /Open offer settings|Otvoriť nastavenia ponúk/ }).first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(menu.getByRole('menuitem', { name: standard })).toBeFocused();

    // A click anywhere else dismisses it.
    await page.mouse.click(5, 300);
    await expect(menu).toBeHidden();
  });

  test('choosing Standard opens the editor in the page flow, with no overlay', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page);
    await gotoView(page, '#invoices');
    const overlaysBefore = await fixedOverlayCount(page);
    await chooseTemplate(page, standard);

    const editor = editorOf(page);
    await expect(editor.locator('[data-offer-field="title"] input')).toBeFocused();

    // Opening it added no fixed full-screen layer or backdrop (the menu, which
    // is one while open, is gone), and the editor itself is not inside one.
    expect(await fixedOverlayCount(page)).toBe(overlaysBefore);
    const insideFixed = await editor.evaluate((el) => {
      for (let n: Element | null = el; n; n = n.parentElement) {
        if (getComputedStyle(n).position === 'fixed') return true;
      }
      return false;
    });
    expect(insideFixed).toBe(false);

    // It pushes the offers list down rather than covering it. Measured in one
    // go: the page is still easing the editor into view, so two separate
    // measurements would be taken at different scroll positions.
    const gap = await page.evaluate(() => {
      const box = document.querySelector('[data-offer-editor]')!.getBoundingClientRect();
      // The offers list, not the document's own line-items table inside the editor.
      const table = document.querySelector('.table-page-wrap table')!.getBoundingClientRect();
      return table.top - box.bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(-1);
  });

  test('every field is typed into in place, with no edit buttons, and totals follow', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page);
    await gotoView(page, '#invoices');
    await chooseTemplate(page, standard);
    const editor = editorOf(page);

    // Subject and location are text in the document, not a form behind a button.
    await subjectField(editor).fill('Rekonštrukcia plochej strechy');
    await expect(subjectField(editor)).toHaveValue('Rekonštrukcia plochej strechy');

    // A line item: cells in the table itself.
    await page.getByRole('button', { name: /Custom item|Vlastná položka/ }).click();
    const row = editor.locator('[data-offer-item]').first();
    await row.getByPlaceholder(/Item name|Názov položky/).fill('Plech');
    await row.getByRole('spinbutton', { name: /Quantity|Množstvo/ }).fill('3');
    await row.getByRole('spinbutton', { name: /Unit price|Jedn\. cena/ }).fill('100');
    // 3 × 100 = 300 net, the default 20 % VAT makes the total 360.
    await expect(row).toContainText(/300,00/);
    await expect(editor.getByText(/Net total|Základ dane/)).toContainText(/300,00/);
    await expect(editor.getByText(/Estimated price|Predbežná cena/).locator('xpath=..')).toContainText(/360,00/);

    // A discount in the cell lowers the line and the totals with it.
    await row.getByRole('spinbutton', { name: /Discount|Zľava/ }).fill('50');
    await expect(row).toContainText(/150,00/);

    // A benefit card, typed straight into the card.
    await editor.getByPlaceholder(/^(Benefit 1|Výhoda 1)$/).fill('Záruka 10 rokov');
    await expect(editor.getByPlaceholder(/^(Benefit 1|Výhoda 1)$/)).toHaveValue('Záruka 10 rokov');

    // The document has no pencil or edit buttons to click first.
    await expect(editor.locator('[data-offer-editing] svg.lucide-pencil')).toHaveCount(0);
    await expect(editor.locator('[data-offer-editing]').getByRole('button', { name: /^(Edit|Upraviť)$/ })).toHaveCount(0);

    // A line comes out again with its own ×.
    await row.hover();
    await row.getByRole('button', { name: /Remove item|Odstrániť položku/ }).click();
    await expect(editor.locator('[data-offer-item]')).toHaveCount(0);
  });

  test('Preview hides empty fields that Edit shows, and has no controls left', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page);
    await gotoView(page, '#invoices');
    await chooseTemplate(page, standard);
    const editor = editorOf(page);

    // Edit: the whole structure is visible, empty or not.
    await expect(editor).toHaveAttribute('data-offer-view', 'edit');
    await expect(warrantyField(editor)).toBeVisible();
    await expect(warrantyLabel(editor)).toBeVisible();

    // Preview: the finished document — neither the label of the empty field
    // nor its placeholder, and not a single control.
    await editor.getByRole('tab', { name: /Preview|Náhľad/ }).click();
    await expect(editor).toHaveAttribute('data-offer-view', 'preview');
    await expect(warrantyField(editor)).toHaveCount(0);
    await expect(warrantyLabel(editor)).toHaveCount(0);
    await expect(editor.locator('.print-document input, .print-document textarea, .print-document select')).toHaveCount(0);

    // Fill it in and it appears, label and all.
    await editor.getByRole('tab', { name: /Edit|Úprava/ }).click();
    await warrantyField(editor).fill('24 mesiacov');
    await editor.getByRole('tab', { name: /Preview|Náhľad/ }).click();
    await expect(editor.locator('.print-document').getByText('24 mesiacov')).toBeVisible();
    await expect(warrantyLabel(editor)).toBeVisible();
  });

  test('issuing without a client takes the cursor to the client picker, then to the missing items', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page);
    await gotoView(page, '#invoices');
    await chooseTemplate(page, standard);
    const editor = editorOf(page);

    await page.getByRole('button', { name: /Issue & log in CRM|Vystaviť a zaevidovať/ }).click();
    await expect(editor.getByRole('button', { name: /Select a client|Vyberte klienta/ })).toBeFocused();
    await expect(editor.locator('[data-offer-client-picker]').first()).toHaveClass(/ring-rose-500/);
    // Validation never switches mode or closes anything.
    await expect(editor).toHaveAttribute('data-offer-view', 'edit');

    await editor.getByRole('button', { name: /Select a client|Vyberte klienta/ }).click();
    await page.getByRole('option', { name: LEAD_NAME }).click();
    await page.getByRole('button', { name: /Issue & log in CRM|Vystaviť a zaevidovať/ }).click();
    await expect(editor.locator('[data-offer-add-item]')).toBeFocused();
    await expect(editor).toHaveAttribute('data-offer-view', 'edit');
  });

  test('picking a client fills the greeting and the recipient block', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page);
    await gotoView(page, '#invoices');
    await chooseTemplate(page, standard);
    const editor = editorOf(page);

    await editor.getByRole('button', { name: /Select a client|Vyberte klienta/ }).click();
    await page.getByRole('option', { name: LEAD_NAME }).click();

    await expect(editor.getByPlaceholder(/^Greeting|^Oslovenie/)).toHaveValue(/Novák Stavby/);
    const document_ = editor.locator('[data-offer-editing]');
    await expect(document_).toContainText(/(Billed to|Odberateľ):.*Priemyselná 12/);
    await expect(document_).toContainText(/IČO: 12345678/);
  });

  test('editing a saved offer opens it pre-filled in the same place and saves it in place', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page, { offers: [SEEDED_OFFER] });
    const pushed = recordSyncedOffers(page);
    await gotoView(page, '#invoices');

    const row = page.locator('tbody tr').filter({ hasText: 'Ponuka — uložená' });
    await expect(row).toBeVisible();
    await row.getByTitle(/^(Edit|Upraviť)$/).click();

    const editor = editorOf(page);
    await expect(editor).toBeVisible();
    await expect(page.getByText(/Edit price offer|Úprava cenovej ponuky/).first()).toBeVisible();
    await expect(subjectField(editor)).toHaveValue('Rekonštrukcia strechy');
    await expect(editor.locator('[data-offer-field="title"] input')).toHaveValue('Ponuka — uložená');
    await expect(editor.locator('[data-offer-item]').first().getByPlaceholder(/Item name|Názov položky/)).toHaveValue('Plech');
    await expect(editor.getByRole('button', { name: LEAD_NAME })).toBeVisible();
    await expect(editor.locator('[data-offer-editing]').getByText('CP-2026-001')).toBeVisible();

    await subjectField(editor).fill('Nový predmet');
    await page.getByRole('button', { name: /Save changes|Uložiť zmeny/ }).click();
    await expect(editorOf(page)).toHaveCount(0);

    // Saved over the same document, not added beside it.
    await expect.poll(() => pushed.get('io-seeded')?.subject, { timeout: 10_000 }).toBe('Nový predmet');
    expect(pushed.size).toBe(1);
    expect(pushed.get('io-seeded')?.documentNumber).toBe('CP-2026-001');
    await expect(page.locator('tbody tr').filter({ hasText: 'Ponuka — uložená' })).toHaveCount(1);
  });

  test('Cancel closes a pristine editor at once and asks before dropping typed work', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page);
    await gotoView(page, '#invoices');
    const dialog = page.getByTestId('confirm-dialog');

    // Nothing typed: gone immediately, no question.
    await chooseTemplate(page, standard);
    await page.getByRole('button', { name: /^(Cancel|Zrušiť)$/ }).click();
    await expect(editorOf(page)).toHaveCount(0);
    await expect(dialog).toHaveCount(0);

    // Something typed: the existing confirm dialog stands in the way.
    await chooseTemplate(page, standard);
    await subjectField(editorOf(page)).fill('Rozpracované');
    await page.getByRole('button', { name: /^(Cancel|Zrušiť)$/ }).click();
    await expect(dialog).toBeVisible();

    // Keep editing: the draft is untouched.
    await page.getByTestId('confirm-dialog-cancel').click();
    await expect(dialog).toHaveCount(0);
    await expect(subjectField(editorOf(page))).toHaveValue('Rozpracované');

    // Discard: the editor goes.
    await page.getByRole('button', { name: /^(Cancel|Zrušiť)$/ }).click();
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect(editorOf(page)).toHaveCount(0);
  });

  test('opening another offer while one has changes asks first, and only one editor is ever open', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page, { offers: [SEEDED_OFFER] });
    await gotoView(page, '#invoices');

    await chooseTemplate(page, standard);
    await subjectField(editorOf(page)).fill('Rozpracované');

    await page.locator('tbody tr').filter({ hasText: 'Ponuka — uložená' }).getByTitle(/^(Edit|Upraviť)$/).click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-dialog-confirm').click();

    await expect(editorOf(page)).toHaveCount(1);
    await expect(subjectField(editorOf(page))).toHaveValue('Rekonštrukcia strechy');
  });

  test('an AI template with one entry opens directly and shows its own branding', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page, { templates: [template('tpl-1', 'Modrá šablóna')] });
    await gotoView(page, '#invoices');
    await chooseTemplate(page, /AI template|AI šablóna/);

    const editor = editorOf(page);
    // The template picker sits in the toolbar, and the badge of the AI template in the document.
    await expect(editor.getByRole('button', { name: /Modrá šablóna/ }).first()).toBeVisible();
    await expect(editor.locator('[data-offer-editing]')).toContainText('Modrá šablóna');
    await expect(editor.getByRole('tab', { name: /Preview|Náhľad/ })).toBeVisible();
    await expect(subjectField(editor)).toBeVisible();
  });

  test('with several AI templates the entry lists them to pick from', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page, { templates: [template('tpl-1', 'Modrá šablóna'), template('tpl-2', 'Zelená šablóna')] });
    await gotoView(page, '#invoices');

    await newOfferButton(page).click();
    const menu = page.getByRole('menu');
    const ai = menu.getByRole('menuitem', { name: /AI template|AI šablóna/ });
    await expect(ai).toHaveAttribute('aria-expanded', 'false');
    await ai.click();
    await expect(ai).toHaveAttribute('aria-expanded', 'true');
    await menu.getByRole('menuitem', { name: /Zelená šablóna/ }).click();

    await expect(editorOf(page).locator('[data-offer-editing]')).toContainText('Zelená šablóna');
  });

  test('Preview is the saved document: the same markup the preview dialog shows after issuing', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page);
    await gotoView(page, '#invoices');
    await chooseTemplate(page, standard);
    const editor = editorOf(page);

    await editor.locator('[data-offer-field="title"] input').fill('Ponuka — zhoda');
    await editor.getByRole('button', { name: /Select a client|Vyberte klienta/ }).click();
    await page.getByRole('option', { name: LEAD_NAME }).click();
    await subjectField(editor).fill('Strecha');
    await page.getByRole('button', { name: /Custom item|Vlastná položka/ }).click();
    await page.getByPlaceholder(/Item name|Názov položky/).fill('Plech');
    await page.getByRole('spinbutton', { name: /Unit price|Jedn\. cena/ }).fill('40');

    await editor.getByRole('tab', { name: /Preview|Náhľad/ }).click();
    const before = await editor.locator('.print-document').evaluate((el) => el.outerHTML);

    await page.getByRole('button', { name: /Issue & log in CRM|Vystaviť a zaevidovať/ }).click();
    await expect(editorOf(page)).toHaveCount(0);

    await page.locator('tbody tr').filter({ hasText: 'Ponuka — zhoda' }).getByTitle(/Preview & print|Náhľad a tlač/).click();
    const after = await page.locator('.print-document').evaluate((el) => el.outerHTML);
    expect(after).toBe(before);
  });

  test('the accounting-service mode is a compact inline form, not a popup', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page, { providers: true });
    await gotoView(page, '#invoices');
    const overlaysBefore = await fixedOverlayCount(page);
    await chooseTemplate(page, /SuperFaktúra \/ iDoklad/);

    const editor = editorOf(page);
    await expect(editor.locator('[data-offer-external-form]')).toBeVisible();
    // No visual template to edit: no Edit / Preview switch, no print.
    await expect(editor.getByRole('tab')).toHaveCount(0);
    await expect(editor.getByRole('button', { name: /Print|Tlač/ })).toHaveCount(0);
    expect(await fixedOverlayCount(page)).toBe(overlaysBefore);
    await expect(editor.getByText(/Sandbox mode is on|sandbox/i)).toBeVisible();

    // Same validation as the document editor.
    await page.getByRole('button', { name: /Issue via external API|Vystaviť cez externé API/ }).click();
    await expect(editor.getByRole('button', { name: /Select a client|Vyberte klienta/ })).toBeFocused();
  });
});
