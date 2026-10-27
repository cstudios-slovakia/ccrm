import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

/**
 * The price offer editor: its own view, a what-you-see-is-what-you-get document
 * instead of the old five-step popup. The offers list is not on the page while
 * it is open.
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

/** A template stored before the layout variants existed: no `layout`, so it keeps its original look. */
const template = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  colors: { primary: '#1e3a8a', secondary: '#2563eb', background: '#ffffff', accent: '#3b82f6', text: '#111827' },
  typography: { fontFamily: 'Inter', headingStyle: 'bold' },
  sectionsOrder: [] as string[],
  badgeStyle: 'rounded',
  createdAt: '2026-01-05',
  ...extra,
});

const BLOCKS = [
  'header', 'client_metadata', 'greeting', 'usp_grid', 'reassurance',
  'items_table', 'total_box', 'key_parameters', 'next_steps', 'signoff', 'footer',
];

/** Dark header band, black table head, left-bordered cards, its own headings and block order. */
const signumLike = template('tpl-signum', 'Šablóna Signum', {
  colors: { primary: '#7c2d12', secondary: '#9a3412', background: '#ffffff', accent: '#f97316', text: '#111827' },
  typography: { fontFamily: 'serif', headingStyle: 'bold' },
  layout: {
    headerStyle: 'dark-band',
    tableHeaderStyle: 'filled-dark',
    uspCardStyle: 'left-border',
    totalBannerStyle: 'solid-dark',
    fontFamily: 'serif',
    headings: { usp: 'Prečo strechu zveriť nám', items: 'Rozsah dodávky a montáže', nextStep: 'Ďalší krok SIGNUM' },
  },
  // The items table comes before the benefit cards.
  sectionsOrder: ['header', 'client_metadata', 'greeting', 'items_table', 'usp_grid', 'reassurance', 'total_box', 'key_parameters', 'next_steps', 'signoff', 'footer'],
});

/** A light, blue, Standard-ordered template that does have a layout. */
const plainBlue = template('tpl-blue', 'Šablóna Modrá', {
  layout: {
    headerStyle: 'light', tableHeaderStyle: 'filled-primary', uspCardStyle: 'soft',
    totalBannerStyle: 'gradient', fontFamily: 'sans', headings: { usp: '', items: '', nextStep: '' },
  },
  sectionsOrder: BLOCKS,
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
  templates?: Record<string, unknown>[];
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

  test('choosing Standard opens the editor as its own view, with no overlay', async ({ page }) => {
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

    // The list is a different view. None of it — the table, the page title —
    // stays on the page while the document is open.
    await expect(page.locator('.table-page-wrap')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /^(Price Offers|Cenové ponuky|Árajánlatok)$/ })).toHaveCount(0);
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
    await expect(editor.locator('[data-offer-items]')).toHaveClass(/ring-rose-500/);
    await expect(editor).toHaveAttribute('data-offer-view', 'edit');

    // Preview has no control to focus, so the same block is outlined on the document.
    await editor.getByRole('tab', { name: /Preview|Náhľad/ }).click();
    await page.getByRole('button', { name: /Issue & log in CRM|Vystaviť a zaevidovať/ }).click();
    await expect(editor.locator('[data-offer-items]')).toHaveClass(/ring-rose-500/);
    await expect(editor).toHaveAttribute('data-offer-view', 'preview');
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

  test('editing a saved offer replaces the list, and Cancel brings the list back', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page, { offers: [SEEDED_OFFER] });
    await gotoView(page, '#invoices');

    await page.locator('.table-page-wrap tbody tr').filter({ hasText: 'Ponuka — uložená' }).getByTitle(/^(Edit|Upraviť)$/).click();
    await expect(editorOf(page)).toHaveCount(1);
    await expect(page.locator('.table-page-wrap')).toHaveCount(0);
    await expect(subjectField(editorOf(page))).toHaveValue('Rekonštrukcia strechy');

    await page.getByRole('button', { name: /^(Cancel|Zrušiť)$/ }).click();
    await expect(editorOf(page)).toHaveCount(0);
    await expect(page.locator('.table-page-wrap tbody tr').filter({ hasText: 'Ponuka — uložená' })).toHaveCount(1);
  });

  test('an AI template with one entry opens directly and shows its own branding', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page, { templates: [template('tpl-1', 'Modrá šablóna')] });
    await gotoView(page, '#invoices');
    await chooseTemplate(page, /AI template|AI šablóna/);

    const editor = editorOf(page);
    // The template picker names it in the toolbar; the document itself never prints the internal name.
    await expect(editor.getByRole('button', { name: /Modrá šablóna/ }).first()).toBeVisible();
    await expect(editor.locator('[data-offer-editing]')).not.toContainText('Modrá šablóna');
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

    // The chosen template is the one the toolbar names, and the document stays free of its name.
    await expect(editorOf(page).getByRole('button', { name: /Zelená šablóna/ }).first()).toBeVisible();
    await expect(editorOf(page).locator('[data-offer-editing]')).not.toContainText('Zelená šablóna');
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


/** Picks one AI template from the New offer menu when there are several. */
async function chooseAiTemplate(page: Page, name: RegExp) {
  await newOfferButton(page).click();
  const menu = page.getByRole('menu');
  await menu.getByRole('menuitem', { name: /AI template|AI šablóna/ }).click();
  await menu.getByRole('menuitem', { name }).click();
  await expect(editorOf(page)).toBeVisible();
}

/** Switches the template in the editor's toolbar picker. */
async function switchTemplate(page: Page, from: RegExp, to: RegExp) {
  await editorOf(page).getByRole('button', { name: from }).first().click();
  await page.getByRole('option', { name: to }).click();
}

/** What the page looks like: the pieces a template changes, as computed styles and positions. */
const documentLook = (page: Page) =>
  page.evaluate(() => {
    const doc = document.querySelector('[data-offer-editing], .print-document') as HTMLElement;
    const css = (el: Element | null, prop: string) => (el ? getComputedStyle(el).getPropertyValue(prop) : null);
    const headings = Array.from(doc.querySelectorAll('h3')).map((h) => h.textContent?.trim() ?? '');
    const topOf = (text: string) => {
      const h = Array.from(doc.querySelectorAll('h3')).find((el) => el.textContent?.includes(text));
      return h ? h.getBoundingClientRect().top : null;
    };
    return {
      headerBg: css(doc.firstElementChild, 'background-color'),
      theadBg: css(doc.querySelector('thead tr'), 'background-color'),
      font: css(doc, 'font-family'),
      headings,
      itemsTop: topOf('Rozsah dodávky'),
      uspTop: topOf('Prečo'),
      uspCardEdge: css(doc.querySelector('[data-offer-usp="0"]'), 'border-left-width'),
      uspCardEdgeColor: css(doc.querySelector('[data-offer-usp="0"]'), 'border-left-color'),
      templateId: doc.getAttribute('data-offer-template'),
      text: doc.textContent ?? "",
    };
  });

/** Every AI template the app pushed to /sync.php, newest write winning per id. */
function recordSyncedTemplates(page: Page) {
  const pushed = new Map<string, Record<string, any>>();
  let lastCount = -1;
  void page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as { aiCustomTemplates?: Record<string, any>[] };
        if (Array.isArray(body?.aiCustomTemplates)) {
          lastCount = body.aiCustomTemplates.length;
          for (const tpl of body.aiCustomTemplates) pushed.set(String(tpl.id), tpl);
        }
      } catch {
        /* not JSON — nothing to record */
      }
    }
    await route.fallback();
  });
  return { pushed, count: () => lastCount };
}

async function openOfferSettingsTab(page: Page, tab: RegExp) {
  await gotoView(page, '#invoices');
  await page.getByRole('button', { name: /Nastavenia ponúk/ }).first().click();
  await page.getByRole('tab', { name: tab }).click();
}

const saveSettingsButton = (page: Page) => page.getByRole('button', { name: /Uložiť nastavenia ponúk|Save offer settings/ });
const aiTab = /^AI šablóny/;

test.describe('AI price offer templates', () => {
  test('two templates with different blueprints produce visibly different documents, and the name is never printed', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page, { templates: [signumLike, plainBlue] });
    const pushed = recordSyncedOffers(page);
    await gotoView(page, '#invoices');

    // --- the Signum-like template: dark band, black table head, headings, order, edge cards, serif
    await chooseAiTemplate(page, /Šablóna Signum/);
    const editor = editorOf(page);
    const a = await documentLook(page);
    expect(a.templateId).toBe('tpl-signum');
    expect(a.headerBg).toBe('rgb(17, 24, 39)'); // the dark band, from the sample's text colour
    expect(a.theadBg).toBe('rgb(17, 24, 39)'); // black table head
    expect(a.headings).toContain('Prečo strechu zveriť nám');
    expect(a.headings.some((h) => h.includes('Rozsah dodávky a montáže'))).toBe(true);
    expect(a.text).toContain('Ďalší krok SIGNUM');
    expect(a.itemsTop!).toBeLessThan(a.uspTop!); // the items table is printed before the benefit cards
    expect(a.uspCardEdge).toBe('4px');
    expect(a.uspCardEdgeColor).toBe('rgb(249, 115, 22)'); // the orange accent
    expect(a.font).toMatch(/Georgia/);

    // --- switch to the plain blue one in the toolbar: every one of those changes back
    await switchTemplate(page, /Šablóna Signum/, /Šablóna Modrá/);
    await expect(editor.locator('[data-offer-template="tpl-blue"]')).toBeVisible();
    const b = await documentLook(page);
    expect(b.headerBg).not.toBe(a.headerBg);
    expect(b.theadBg).toBe('rgb(30, 58, 138)'); // filled with its own primary
    expect(b.headings.some((h) => h.includes('Rozsah dodávky a položiek'))).toBe(true); // built-in wording
    expect(b.headings.some((h) => h.includes('montáže'))).toBe(false);
    expect(b.text).not.toContain('SIGNUM');
    expect(b.uspTop!).toBeLessThan(b.itemsTop!); // Standard order
    expect(b.uspCardEdge).not.toBe('4px');
    expect(b.font).not.toMatch(/Georgia/);

    // --- the internal name is on neither the edit view nor the preview
    for (const view of ['Edit', 'Preview'] as const) {
      if (view === 'Preview') await editor.getByRole('tab', { name: /Preview|Náhľad/ }).click();
      const text = (await documentLook(page)).text;
      expect(text).not.toContain('Šablóna Modrá');
      expect(text).not.toContain('Šablóna Signum');
    }

    // --- the choice survives issuing: stored on the offer, and the saved preview draws that template
    await editor.getByRole('tab', { name: /Edit|Úprava/ }).click();
    await switchTemplate(page, /Šablóna Modrá/, /Šablóna Signum/);
    await editor.locator('[data-offer-field="title"] input').fill('Ponuka — signum');
    await editor.getByRole('button', { name: /Select a client|Vyberte klienta/ }).click();
    await page.getByRole('option', { name: LEAD_NAME }).click();
    await page.getByRole('button', { name: /Custom item|Vlastná položka/ }).click();
    await page.getByPlaceholder(/Item name|Názov položky/).fill('Fólia');
    await page.getByRole('spinbutton', { name: /Unit price|Jedn\. cena/ }).fill('80');
    await page.getByRole('button', { name: /Issue & log in CRM|Vystaviť a zaevidovať/ }).click();
    await expect(editorOf(page)).toHaveCount(0);

    await expect.poll(() => [...pushed.values()].find((o) => o.title === 'Ponuka — signum')?.customTemplateId, { timeout: 10_000 }).toBe('tpl-signum');

    await page.locator('tbody tr').filter({ hasText: 'Ponuka — signum' }).getByTitle(/Preview & print|Náhľad a tlač/).click();
    const modalDoc = page.locator('[data-offer-template="tpl-signum"]');
    await expect(modalDoc).toBeVisible();
    const modalLook = await modalDoc.evaluate((el) => ({
      band: getComputedStyle(el.firstElementChild!).backgroundColor,
      thead: getComputedStyle(el.querySelector('thead tr')!).backgroundColor,
      text: el.textContent ?? "",
    }));
    expect(modalLook.band).toBe('rgb(17, 24, 39)');
    expect(modalLook.thead).toBe('rgb(17, 24, 39)');
    expect(modalLook.text).toContain('Rozsah dodávky a montáže');
    expect(modalLook.text).not.toContain('Šablóna Signum');
  });

  test('a template stored before the variants existed renders in the original layout', async ({ page }) => {
    await startSession(page);
    // Even a stored order and page colours do not change a legacy template: it always printed Standard.
    await seedInvoicing(page, {
      templates: [template('tpl-old', 'Stará šablóna', {
        sectionsOrder: ['footer', 'header'],
        colors: { primary: '#1e3a8a', secondary: '#2563eb', background: '#111111', accent: '#3b82f6', text: '#f5f5f5' },
      })],
    });
    await gotoView(page, '#invoices');
    await chooseTemplate(page, /AI template|AI šablóna/);
    const look = await documentLook(page);
    expect(look.theadBg).toBe('rgb(30, 58, 138)');
    expect(look.headings.some((h) => h.includes('Rozsah dodávky a položiek'))).toBe(true);
    expect(look.uspTop!).toBeLessThan(look.itemsTop!);
    const background = await editorOf(page).locator('[data-offer-editing]').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background).toBe('rgb(255, 255, 255)');
  });

  test('a failed generation shows the real reason, adds no template and offers no rename', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page);
    const synced = recordSyncedTemplates(page);
    await page.route('**/upload.php', (route) =>
      route.fulfill({ json: { success: true, fileName: 'sample.pdf', filePath: '/uploads/custom-template-pdf_sample.pdf', extractedText: '' } })
    );
    let request: Record<string, unknown> | null = null;
    await page.route('**/api/generate_pdf_template.php', async (route) => {
      request = route.request().postDataJSON();
      await route.fulfill({
        status: 502,
        json: { success: false, code: 'ai_error', message: 'OpenAI Error: HTTP 400: Unsupported value: temperature', providerMessage: 'HTTP 400: Unsupported value: temperature' },
      });
    });
    await openOfferSettingsTab(page, aiTab);

    await page.getByTestId('ai-template-upload').setInputFiles({ name: 'sample.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') });

    // The toast names the cause, not "success".
    await expect(page.getByText(/Chyba pri generovaní AI šablóny:.*HTTP 400: Unsupported value: temperature/)).toBeVisible();
    await expect(page.getByText(/úspešne vygenerovaná/)).toHaveCount(0);
    await expect(page.getByTestId('template-rename-dialog')).toHaveCount(0);
    await expect(page.getByTestId('ai-template-name')).toHaveCount(0);
    await expect(page.getByText(/Zatiaľ žiadna AI šablóna/)).toBeVisible();
    expect(synced.count()).toBeLessThanOrEqual(0);

    // The endpoint is told the stored file and the user's language.
    expect(request).toMatchObject({ pdfName: 'sample.pdf', pdfUrl: '/uploads/custom-template-pdf_sample.pdf', systemLanguage: 'sk' });
  });

  test('a missing OpenAI key is reported as such, not as a generated template', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page);
    await page.route('**/upload.php', (route) =>
      route.fulfill({ json: { success: true, fileName: 'sample.pdf', filePath: '/uploads/custom-template-pdf_sample.pdf', extractedText: '' } })
    );
    await page.route('**/api/generate_pdf_template.php', (route) =>
      route.fulfill({ status: 422, json: { success: false, code: 'ai_key_missing', message: 'The OpenAI API key is not configured' } })
    );
    await openOfferSettingsTab(page, aiTab);
    await page.getByTestId('ai-template-upload').setInputFiles({ name: 'sample.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') });
    await expect(page.getByText(/OpenAI API kľúč nie je nastavený/).first()).toBeVisible();
    await expect(page.getByTestId('ai-template-name')).toHaveCount(0);
  });

  test('a generated template opens the review with the name focused, and Enter saves it into the picker', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page);
    const synced = recordSyncedTemplates(page);
    await page.route('**/upload.php', (route) =>
      route.fulfill({ json: { success: true, fileName: 'sample.pdf', filePath: '/uploads/custom-template-pdf_sample.pdf', extractedText: '' } })
    );
    await page.route('**/api/generate_pdf_template.php', (route) =>
      route.fulfill({ json: { success: true, template: { ...signumLike, id: 'act-new', name: 'Navrhnutý názov' } } })
    );
    await openOfferSettingsTab(page, aiTab);
    const upload = page.getByTestId('ai-template-upload');
    await upload.setInputFiles({ name: 'sample.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') });

    const review = page.getByTestId('template-review');
    await expect(review).toBeVisible();
    const input = page.getByTestId('template-review-name');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('Navrhnutý názov');
    expect(await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd, el.value.length])).toEqual([0, 15, 15]);

    await input.fill('   ');
    await expect(page.getByTestId('template-review-save')).toBeDisabled();
    await input.fill('Moja šablóna');
    await expect(page.getByTestId('template-review-duplicate')).toHaveCount(0);

    await input.press('Enter');
    await expect(review).toHaveCount(0);
    await expect(page.getByTestId('ai-template-name')).toHaveText('Moja šablóna');

    await expect.poll(() => synced.pushed.get('act-new')?.name, { timeout: 10_000 }).toBe('Moja šablóna');
    expect(synced.pushed.size).toBe(1);
    expect(synced.pushed.get('act-new')?.layout?.headerStyle).toBe('dark-band');

    await page.getByRole('button', { name: /Späť na cenové ponuky/ }).click();
    await chooseTemplate(page, /AI template|AI šablóna/);
    await expect(editorOf(page).getByRole('button', { name: /Moja šablóna/ }).first()).toBeVisible();
    await expect(editorOf(page).locator('[data-offer-template="act-new"]')).toBeVisible();
  });

  test('Cancel discards a generated draft, and a saved card is still renamed in place', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page, { templates: [template('tpl-1', 'Modrá šablóna', { layout: plainBlue.layout, sectionsOrder: BLOCKS })] });
    const synced = recordSyncedTemplates(page);
    await page.route('**/upload.php', (route) =>
      route.fulfill({ json: { success: true, fileName: 'sample.pdf', filePath: '/uploads/custom-template-pdf_sample.pdf', extractedText: '' } })
    );
    await page.route('**/api/generate_pdf_template.php', (route) =>
      route.fulfill({ json: { success: true, template: { ...signumLike, id: 'act-new', name: 'Modrá šablóna' } } })
    );
    await openOfferSettingsTab(page, aiTab);
    await page.getByTestId('ai-template-upload').setInputFiles({ name: 'sample.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') });

    await expect(page.getByTestId('template-review')).toBeVisible();
    await expect(page.getByTestId('template-review-duplicate')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('template-review')).toHaveCount(0);
    await expect(page.getByTestId('ai-template-name')).toHaveCount(1);
    await expect(page.getByTestId('ai-template-name')).toHaveText('Modrá šablóna');

    const card = page.getByTestId('ai-template-name').first();
    await card.hover();
    await page.getByTitle(/Premenovať šablónu/).first().click();
    const field = page.locator('input.border-indigo-300').first();
    await field.fill('Signum — oranžová');
    await field.press('Enter');
    await expect(page.getByTestId('ai-template-name').first()).toHaveText('Signum — oranžová');
    await expect.poll(() => synced.pushed.get('tpl-1')?.name, { timeout: 10_000 }).toBe('Signum — oranžová');
  });

  test('a reconstructed template renders its own blocks, and the review lists what the PDF left out', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page, {
      templates: [template('tpl-doc', 'Rekonštrukcia', {
        document: {
          blocks: [
            { id: 'b1', type: 'text', text: 'Nadpis zo vzoru' },
            { id: 'b2', type: 'field', fieldId: 'offer.clientName' },
            { id: 'b3', type: 'customField', key: 'site_code', label: 'Kód stavby' },
          ],
          customFields: [{ key: 'site_code', label: 'Kód stavby' }],
        },
      })],
    });
    await gotoView(page, '#invoices');
    await chooseTemplate(page, /AI template|AI šablóna/);
    const doc = editorOf(page).locator('[data-offer-template="tpl-doc"]');
    await expect(doc).toBeVisible();
    await expect(doc).toContainText('Nadpis zo vzoru');
    await expect(doc.getByPlaceholder('Kód stavby')).toBeVisible();
    await expect(doc).not.toContainText('Prečo strechu zveriť nám');
    await expect(doc).not.toContainText('Rozsah dodávky a položiek');

    await page.getByRole('button', { name: /^(Cancel|Zrušiť)$/ }).click();
    await openOfferSettingsTab(page, aiTab);
    await page.getByTestId('ai-template-review').click();
    await expect(page.getByTestId('template-review-items-warning')).toBeVisible();
    await expect(page.getByTestId('template-review-extracted')).toContainText('Kód stavby');
  });
});

test.describe('Price offer settings tabs', () => {
  test('four tabs, the save button on the first two only, and unsaved edits survive a tab switch', async ({ page }) => {
    await startSession(page);
    await seedInvoicing(page);
    await openOfferSettingsTab(page, /^Predvolené texty/);

    const tabs = page.getByTestId('offer-settings-tabs').getByRole('tab');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toHaveText(/Predvolené texty/);
    await expect(tabs.nth(1)).toHaveText(/Externé účtovníctvo/);
    await expect(tabs.nth(2)).toHaveText(/AI šablóny/);
    await expect(tabs.nth(3)).toHaveText(/Stavy/);

    // The back link and the identity link stay above the tabs on every tab.
    await expect(page.getByRole('button', { name: /Späť na cenové ponuky/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Firemné údaje, bankový účet/ })).toBeVisible();

    // Tab 1: the texts, and the save button.
    await expect(page.getByText('Predvolená záruka')).toBeVisible();
    await expect(saveSettingsButton(page)).toBeVisible();
    const warranty = page.getByPlaceholder(/napr\. 10 rokov|e\.g\. 10 years/);
    await warranty.fill('15 rokov');

    // Tab 2: connectors, save still offered.
    await tabs.nth(1).click();
    await expect(page.getByText('SuperFaktúra API')).toBeVisible();
    await expect(page.getByText('iDoklad API')).toBeVisible();
    await expect(saveSettingsButton(page)).toBeVisible();

    // Tab 3: the generator; nothing to save with the button.
    await tabs.nth(2).click();
    await expect(page.getByTestId('ai-template-upload')).toBeAttached();
    await expect(saveSettingsButton(page)).toHaveCount(0);

    // Tab 4: both status lists, no save button.
    await tabs.nth(3).click();
    await expect(page.getByTestId('offer-status-settings')).toBeVisible();
    await expect(page.getByTestId('invoice-status-settings')).toBeVisible();
    await expect(saveSettingsButton(page)).toHaveCount(0);

    // Back on tab 1 the unsaved edit is still there.
    await tabs.nth(0).click();
    await expect(warranty).toHaveValue('15 rokov');
  });
});
