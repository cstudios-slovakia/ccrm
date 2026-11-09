import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { holdToConfirm } from './helpers/hold';
import { installNewsletterMock, type NewsletterMock } from './helpers/newsletterMock';

/**
 * Newsletter, as the browser sees it (docs/NEWSLETTER.md C16). The API is mocked
 * (helpers/newsletterMock.ts follows the real server's rules and codes); what the real server stores,
 * validates and sends is proven by `npm run test:newsletter`.
 *
 * The QA workspace speaks Slovak, so every visible-text match accepts en, sk and hu.
 */

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Exact, case-sensitive match of one of the three translations. */
const L = (en: string, sk: string, hu: string) => new RegExp(`^(?:${[en, sk, hu].map(esc).join('|')})$`);
/** Contains one of the three. */
const C = (en: string, sk: string, hu: string) => new RegExp([en, sk, hu].map(esc).join('|'));

const T = {
  newCampaign: L('New campaign', 'Nová kampaň', 'Új kampány'),
  choose: L('Choose', 'Vybrať', 'Kiválasztás'),
  editDesign: L('Edit design', 'Upraviť dizajn', 'Dizájn szerkesztése'),
  backToCampaign: L('Back to the campaign', 'Späť na kampaň', 'Vissza a kampányhoz'),
  backToList: L('Back to campaigns', 'Späť na kampane', 'Vissza a kampányokhoz'),
  blocks: L('Blocks', 'Bloky', 'Blokkok'),
  text: L('Text', 'Text', 'Szöveg'),
  button: L('Button', 'Tlačidlo', 'Gomb'),
  back: L('Back', 'Späť', 'Vissza'),
  del: L('Delete', 'Zmazať', 'Törlés'),
  preview: L('Preview', 'Náhľad', 'Előnézet'),
  sendTest: L('Send test', 'Odoslať test', 'Teszt küldése'),
  unsubMissing: C('no unsubscribe link', 'nemá odkaz na odhlásenie', 'nincs leiratkozási hivatkozás'),
  pause: L('Pause', 'Pozastaviť', 'Szüneteltetés'),
  resume: L('Resume', 'Pokračovať', 'Folytatás'),
  cancelSending: L('Cancel sending', 'Zrušiť odosielanie', 'Küldés megszakítása'),
  stay: L('Stay', 'Zostať', 'Maradok'),
};

const READY_BODY = {
  version: 1,
  rows: [{ id: 'r1', layout: '1', columns: [{ id: 'c1', blocks: [{ id: 'b1', type: 'text', html: '<p>Ahoj</p>' }] }] }],
};

async function open(page: Page, hash = '#newsletter', options: Parameters<typeof installNewsletterMock>[1] = {}): Promise<NewsletterMock> {
  await startSession(page);
  const mock = await installNewsletterMock(page, options);
  await gotoView(page, hash);
  return mock;
}

/** A draft that passes every check of the review card. */
const readyDraft = (mock: NewsletterMock, patch: Record<string, unknown> = {}) =>
  mock.addCampaign({ name: 'Pripravená kampaň', subject: 'Predmet kampane', body: READY_BODY, ...patch });

const palette = (page: Page) => page.locator('aside').filter({ has: page.getByRole('tab', { name: T.blocks }) });
const tile = (page: Page, name: RegExp) => palette(page).getByRole('button', { name });
const aside = (page: Page) => page.locator('aside.w-80');
const saveChip = (page: Page) => page.getByTestId('newsletter-save-status');

/** Back from a selected block or row to the palette. */
async function toPalette(page: Page) {
  if (!(await palette(page).isVisible())) await aside(page).getByRole('button', { name: T.back }).click();
  await expect(palette(page)).toBeVisible();
}

test.describe('Newsletter: list and journey', () => {
  test('the list shows the seeded campaign with its status, and the search narrows it', async ({ page }) => {
    await open(page);
    const rows = page.getByTestId('newsletter-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Jarná akcia');
    await expect(rows.first().getByTestId('newsletter-status')).toHaveAttribute('data-status', 'sent');
    await page.getByPlaceholder(C('Search name or subject', 'Hľadať názov alebo predmet', 'Keresés névre vagy tárgyra')).fill('zzz-nothing');
    await expect(rows).toHaveCount(0);
  });

  test('C16 journey: new campaign, audience, subject, design, back, Send test, Hold to send, results', async ({ page }) => {
    const mock = await open(page);
    await page.getByTestId('newsletter-new').click();
    await expect(page).toHaveURL(/#newsletter\/nl-mock-/);
    const id = [...mock.campaigns.keys()].find((k) => k.startsWith('nl-mock-'))!;

    // Recipients: choose a client category, the server's count appears (2 clients per category in the mock).
    await page.getByRole('button', { name: T.choose }).click();
    await page.getByRole('checkbox', { name: /Stavebníctvo/ }).check();
    await expect(page.getByTestId('newsletter-audience-count')).toContainText(C('2 recipients', '2 príjemcov', '2 címzett'));

    // Subject autosaves (700 ms debounce): the chip says Saving, then Saved.
    await page.getByTestId('newsletter-subject').fill('Jarná akcia 2');
    await expect(saveChip(page)).toHaveAttribute('data-state', 'saved');
    expect(mock.callsOf('update').some((b) => b.patch.subject === 'Jarná akcia 2')).toBe(true);
    expect(mock.callsOf('update').some((b) => b.patch.audience?.clients?.categoryIds?.includes('cc-construction'))).toBe(true);

    // Design: the empty document, a Text block, typed text, then a Button.
    await page.getByTestId('newsletter-edit-design').click();
    await expect(page).toHaveURL(/#newsletter\/nl-mock-\d+\/design$/);
    await expect(page.getByText(C('Drag a row or a block here', 'Presuňte sem riadok alebo blok', 'Húzzon ide egy sort vagy blokkot'))).toBeVisible();
    await tile(page, T.text).click();
    const editor = page.getByRole('textbox', { name: T.text });
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Ahoj, máme novinky');
    await toPalette(page);
    await tile(page, T.button).click();
    await aside(page).getByLabel(/^(Label|Text tlačidla|Felirat)/).fill('Pozrieť ponuku');
    await aside(page).getByPlaceholder('https://…').fill('https://example.com/ponuka');
    await expect(page.locator('[data-nl-block]').getByText('Pozrieť ponuku')).toBeVisible();

    // Autosave (1.5 s), then Back flushes and the campaign card shows the new body.
    await expect(saveChip(page)).toHaveAttribute('data-state', 'saved', { timeout: 8000 });
    await page.getByRole('button', { name: T.backToCampaign }).click();
    await expect(page).toHaveURL(new RegExp(`#newsletter/${id}$`));
    const saved = mock.campaigns.get(id)!.body;
    expect(saved.rows[0].columns[0].blocks.map((b: any) => b.type)).toEqual(['text', 'button']);
    await expect(page.getByRole('img', { name: C('Preview of the e-mail', 'Náhľad e-mailu', 'Az e-mail előnézete') }).frameLocator('iframe').getByText('Pozrieť ponuku')).toBeVisible();

    // Review: every check passes, Send test reports success.
    await expect(page.getByTestId('newsletter-checklist').locator('li.text-amber-700')).toHaveCount(0);
    await page.getByTestId('newsletter-send-test').click();
    await expect(page.getByTestId('newsletter-test-addresses')).toHaveValue('erik@crm.com');
    await page.getByTestId('newsletter-test-send').click();
    await expect(page.getByRole('dialog')).toContainText(C('Test sent to 1', 'Test bol odoslaný na 1', 'A tesztet 1'));
    expect(mock.callsOf('send_test').at(-1)!.to).toEqual(['erik@crm.com']);
    await page.getByRole('dialog').getByRole('button', { name: L('Close', 'Zavrieť', 'Bezárás') }).last().click();

    // Hold to send with the worker stopped: the queue is filled and nothing is sent yet. The page polls
    // `tick` at once on mount (twice under React StrictMode in dev), so an intermediate percentage is a
    // race; a stopped worker makes the 0 % state deterministic. Then the worker starts and the page's
    // own 5 s polling, with no user action, carries the campaign to sent.
    mock.set({ worker: false, tickBatch: 1 });
    await holdToConfirm(page.getByTestId('newsletter-send'));
    await expect(page.getByTestId('newsletter-status').first()).toHaveAttribute('data-status', 'sending');
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    mock.set({ worker: true });
    await expect(page.getByTestId('newsletter-status').first()).toHaveAttribute('data-status', 'sent', { timeout: 15_000 });
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(mock.callsOf('start_send')).toHaveLength(1);
    expect(mock.callsOf('start_send')[0].html).toContain('{{unsubscribe_url}}');
    expect(mock.campaigns.get(id)!.counts).toMatchObject({ total: 2, sent: 2 });
    await expect(page.getByRole('cell', { name: 'klient1@example.sk' })).toBeVisible();
    await page.getByTestId('newsletter-view-email').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('Newsletter: autosave', () => {
  test('edits survive a reload; a failed save shows the retry chip and the leave dialog', async ({ page }) => {
    const mock = await open(page);
    const id = readyDraft(mock);
    await gotoView(page, `#newsletter/${id}`);
    await page.getByTestId('newsletter-subject').fill('Nový predmet');
    await expect(saveChip(page)).toHaveAttribute('data-state', 'saved');
    await gotoView(page, `#newsletter/${id}`);
    await expect(page.getByTestId('newsletter-subject')).toHaveValue('Nový predmet');

    // The server refuses the write: the chip becomes the retry link and Back asks before leaving.
    const stop = mock.failAll('update', 'server_error', 500);
    await page.getByTestId('newsletter-subject').fill('Stratený predmet');
    await expect(saveChip(page)).toHaveAttribute('data-state', 'error');
    await page.getByRole('button', { name: T.backToList }).click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-dialog-cancel').click();
    await expect(page).toHaveURL(new RegExp(`#newsletter/${id}$`));

    // Retry works once the server is back.
    stop();
    await saveChip(page).click();
    await expect(saveChip(page)).toHaveAttribute('data-state', 'saved');
    expect(mock.campaigns.get(id)!.subject).toBe('Stratený predmet');

    // Fails again: leaving without saving drops the edit.
    mock.failAll('update', 'server_error', 500);
    await page.getByTestId('newsletter-subject').fill('Nikdy uložený');
    await expect(saveChip(page)).toHaveAttribute('data-state', 'error');
    await page.getByRole('button', { name: T.backToList }).click();
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect(page).toHaveURL(/#newsletter$/);
    expect(mock.campaigns.get(id)!.subject).toBe('Stratený predmet');
  });

  test('design edits survive Back and a reload; a failed design save keeps the leave dialog', async ({ page }) => {
    const mock = await open(page);
    const id = readyDraft(mock, { body: null });
    await gotoView(page, `#newsletter/${id}/design`);
    await tile(page, T.text).click();
    await expect(saveChip(page)).toHaveAttribute('data-state', 'saved', { timeout: 8000 });
    await gotoView(page, `#newsletter/${id}/design`);
    await expect(page.locator('[data-nl-block]')).toHaveCount(1);

    const stop = mock.failAll('update', 'server_error', 500);
    await toPalette(page);
    await tile(page, T.button).click();
    await expect(saveChip(page)).toHaveAttribute('data-state', 'error', { timeout: 8000 });
    await page.getByRole('button', { name: T.backToCampaign }).click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-dialog-cancel').click();
    await expect(page).toHaveURL(/\/design$/);
    stop();
    await saveChip(page).click();
    await expect(saveChip(page)).toHaveAttribute('data-state', 'saved');
    expect(mock.campaigns.get(id)!.body.rows).toHaveLength(2);
  });
});

test.describe('Newsletter: builder', () => {
  test('a Text block dragged into the empty document lands there', async ({ page }) => {
    const mock = await open(page);
    const id = readyDraft(mock, { body: null });
    await gotoView(page, `#newsletter/${id}/design`);
    await tile(page, T.text).dragTo(page.getByText(C('Drag a row or a block here', 'Presuňte sem riadok alebo blok', 'Húzzon ide egy sort vagy blokkot')));
    await expect(page.locator('[data-nl-block]')).toHaveCount(1);
  });

  test('undo and redo, delete key, Escape, the preview modal', async ({ page }) => {
    const mock = await open(page);
    const id = readyDraft(mock, { body: null });
    await gotoView(page, `#newsletter/${id}/design`);
    await tile(page, T.text).click();
    await expect(page.locator('[data-nl-block]')).toHaveCount(1);
    await page.getByRole('button', { name: /^(Undo|Späť \(|Visszavonás)/ }).click();
    await expect(page.locator('[data-nl-block]')).toHaveCount(0);
    await page.getByRole('button', { name: /^(Redo|Znova|Ismétlés)/ }).click();
    await expect(page.locator('[data-nl-block]')).toHaveCount(1);
    // Escape deselects (the palette is back); selecting again shows the action bar, whose Delete removes the block.
    await page.locator('[data-nl-block]').first().click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeVisible();
    await page.locator('[data-nl-block]').first().click();
    await page.getByRole('button', { name: T.del }).first().click();
    await expect(page.locator('[data-nl-block]')).toHaveCount(0);
    await page.getByRole('button', { name: T.preview }).click();
    await expect(page.getByRole('dialog').locator('iframe')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('every block tile adds a block, the starters fill an empty document, the locked header and footer show', async ({ page }) => {
    const mock = await open(page);
    const id = readyDraft(mock, { body: null });
    await gotoView(page, `#newsletter/${id}/design`);
    await expect(page.getByText(C('Global header', 'Globálna hlavička', 'Globális fejléc'))).toBeVisible();
    await expect(page.getByText(C('Global footer', 'Globálna pätička', 'Globális lábléc'))).toBeVisible();
    await page.getByRole('button', { name: L('Two columns', 'Dva stĺpce', 'Két oszlop') }).click();
    await expect(page.locator('[data-nl-column]')).toHaveCount(2);
    let blocks = 0;
    for (const name of [/^Heading|^Nadpis|^Címsor/, T.button, /^Divider|^Oddeľovač|^Elválasztó/, /^Spacer|^Medzera|^Térköz/, /^Social|^Sociálne|^Közösségi/, /^HTML$/]) {
      await toPalette(page);
      await tile(page, name).click();
      blocks += 1;
      await expect(page.locator('[data-nl-block]')).toHaveCount(2 + blocks);
    }
  });

  test('the header and footer of the e-mail are reachable from the design route', async ({ page }) => {
    const mock = await open(page);
    const id = readyDraft(mock);
    await gotoView(page, `#newsletter/${id}/design`);
    await page.getByRole('button', { name: L('Edit', 'Upraviť', 'Szerkesztés') }).last().click();
    await expect(page).toHaveURL(/#settings\/newsletter\/design\/footer/);
  });
});

test.describe('Newsletter: Send test dialog', () => {
  test('focus moves in and stays in; the sample dropdown paints above the dialog; the picked sample is sent', async ({ page }) => {
    const mock = await open(page);
    const id = readyDraft(mock);
    await gotoView(page, `#newsletter/${id}`);
    await expect(page.getByTestId('newsletter-audience-count')).toContainText(C('4 recipients', '4 príjemcov', '4 címzett'));
    await page.getByTestId('newsletter-send-test').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    await dialog.locator('button[aria-haspopup="listbox"]').click();
    const option = page.getByRole('option').nth(2);
    await expect(option).toBeVisible();
    const onTop = await option.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!hit?.closest('[role="listbox"]');
    });
    expect(onTop).toBe(true);
    await option.click();
    await dialog.getByTestId('newsletter-test-send').click();
    await expect(dialog).toContainText(C('Test sent', 'Test bol odoslaný', 'A tesztet'));
    expect(mock.callsOf('send_test').at(-1)!.sample).toMatchObject({ id: 'klient2@example.sk' });
    // Escape closes the dialog and the focus returns to the button that opened it.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('newsletter-send-test')).toBeFocused();
  });

  test('invalid and too many addresses disable Send; a mail server refusal shows its reply', async ({ page }) => {
    const mock = await open(page);
    const id = readyDraft(mock);
    await gotoView(page, `#newsletter/${id}`);
    await page.getByTestId('newsletter-send-test').click();
    const area = page.getByTestId('newsletter-test-addresses');
    const send = page.getByTestId('newsletter-test-send');
    await area.fill('not-an-address');
    await expect(send).toBeDisabled();
    await area.fill('a@x.sk\nb@x.sk\nc@x.sk\nd@x.sk\ne@x.sk\nf@x.sk');
    await expect(send).toBeDisabled();
    await area.fill('a@x.sk');
    await expect(send).toBeEnabled();
    mock.failNext('send_test', 'smtp_failed', 502, '550 relay denied');
    await send.click();
    await expect(page.getByRole('dialog')).toContainText('550 relay denied');
  });
});

test.describe('Newsletter: sending states', () => {
  test('without an outgoing server the send button is disabled and says why; demo mode sends and never claims delivery', async ({ page }) => {
    const mock = await open(page, '#newsletter', { senderConfigured: false });
    const id = readyDraft(mock);
    await gotoView(page, `#newsletter/${id}`);
    await expect(page.getByTestId('newsletter-send')).toBeDisabled();
    await expect(page.getByText(C('Not ready', 'Nie je pripravené', 'Nem kész'))).toBeVisible();
    await expect(page.getByRole('link', { name: C('Open the outgoing server settings', 'Otvoriť nastavenia odchádzajúceho servera', 'A kimenő szerver beállításainak megnyitása') })).toBeVisible();
    expect(mock.callsOf('start_send')).toHaveLength(0);

    mock.set({ demo: true });
    await gotoView(page, `#newsletter/${id}`);
    await expect(page.getByTestId('newsletter-send')).toBeEnabled();
    await page.getByTestId('newsletter-send-test').click();
    await page.getByTestId('newsletter-test-send').click();
    await expect(page.getByRole('dialog')).toContainText(C('Demo mode: nothing was sent', 'Demo režim: nič sa neodoslalo', 'Demó mód: semmi nem lett elküldve'));
    await page.getByRole('dialog').getByRole('button', { name: L('Close', 'Zavrieť', 'Bezárás') }).last().click();
    await holdToConfirm(page.getByTestId('newsletter-send'));
    await expect(page.getByTestId('newsletter-status').first()).toHaveAttribute('data-status', 'sent', { timeout: 15_000 });
  });

  test('a refusal of start_send shows its translated line and the draft stays a draft', async ({ page }) => {
    const mock = await open(page);
    const id = readyDraft(mock);
    await gotoView(page, `#newsletter/${id}`);
    mock.failNext('start_send', 'missing_unsubscribe', 422);
    await holdToConfirm(page.getByTestId('newsletter-send'));
    await expect(page.getByText(C('has no unsubscribe link', 'nemá odkaz na odhlásenie', 'nincs leiratkozási hivatkozás')).first()).toBeVisible();
    expect(mock.campaigns.get(id)!.status).toBe('draft');
    await expect(page.getByTestId('newsletter-send')).toBeEnabled();
  });

  test('Pause, Resume and Cancel (hold) on a sending campaign', async ({ page }) => {
    const mock = await open(page, '#newsletter', { worker: false });
    const id = mock.addCampaign({ name: 'Beží', subject: 'Beží', status: 'sending', recipients: 10, sent: 2 });
    await gotoView(page, `#newsletter/${id}`);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
    await page.getByRole('button', { name: T.pause }).click();
    await expect(page.getByTestId('newsletter-status').first()).toHaveAttribute('data-status', 'paused');
    await page.getByRole('button', { name: T.resume }).click();
    await expect(page.getByTestId('newsletter-status').first()).toHaveAttribute('data-status', 'sending');
    await holdToConfirm(page.getByRole('button', { name: /Cancel sending|Zrušiť odosielanie|Küldés megszakítása/ }));
    await expect(page.getByTestId('newsletter-status').first()).toHaveAttribute('data-status', 'cancelled');
    expect(mock.campaigns.get(id)!.counts).toMatchObject({ sent: 2, cancelled: 8, queued: 0 });
  });

  test('a paused campaign with an error shows the banner with the link to the outgoing settings', async ({ page }) => {
    const mock = await open(page);
    const id = mock.addCampaign({ name: 'Pozastavená', subject: 'x', status: 'paused', recipients: 4, sent: 1, lastError: '535 authentication failed' });
    await gotoView(page, `#newsletter/${id}`);
    await expect(page.getByText('535 authentication failed')).toBeVisible();
    await expect(page.getByRole('link', { name: C('Outgoing e-mail settings', 'Nastavenia odchádzajúcej pošty', 'Kimenő levelezés beállításai') })).toHaveAttribute('href', '#settings/email/outgoing');
  });

  test('recipients table filters by status and searches', async ({ page }) => {
    const mock = await open(page);
    await gotoView(page, `#newsletter/nl-seed-sent`);
    await expect(page.getByRole('cell', { name: 'klient4@example.sk' })).toBeVisible();
    await page.getByTestId('newsletter-recipients-search').fill('klient2');
    await expect(page.getByRole('cell', { name: 'klient1@example.sk' })).toHaveCount(0);
    await expect(page.getByRole('cell', { name: 'klient2@example.sk' })).toBeVisible();
    expect(mock.callsOf('recipients').some((b) => b.q === 'klient2')).toBe(true);
  });
});

test.describe('Newsletter: Unsubscribed tab', () => {
  test('add addresses, then remove one after the confirmation', async ({ page }) => {
    const mock = await open(page);
    await page.getByRole('button', { name: L('Unsubscribed', 'Odhlásení', 'Leiratkozottak') }).click();
    await expect(page.getByRole('cell', { name: /chyba@example\.sk/ })).toBeVisible();
    await page.getByTestId('newsletter-suppression-add').click();
    await page.locator('textarea').fill('novy@example.sk, zly-format');
    await page.getByRole('button', { name: L('Add', 'Pridať', 'Hozzáadás') }).click();
    await expect(page.getByRole('cell', { name: /novy@example\.sk/ })).toBeVisible();
    expect(mock.suppressions.some((s) => s.email === 'novy@example.sk')).toBe(true);

    await page.getByRole('row', { name: /novy@example\.sk/ }).getByRole('button', { name: L('Remove', 'Odstrániť', 'Eltávolítás') }).click();
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect(page.getByRole('cell', { name: /novy@example\.sk/ })).toHaveCount(0);
    expect(mock.suppressions.some((s) => s.email === 'novy@example.sk')).toBe(false);
  });
});

test.describe('Newsletter: Settings > Newsletter > Design', () => {
  test('the footer editor opens, and removing the unsubscribe link shows the error in the preview', async ({ page }) => {
    const mock = await open(page, '#settings/newsletter/design');
    await page.getByTestId('newsletter-edit-footer').click();
    await expect(page).toHaveURL(/#settings\/newsletter\/design\/footer/);
    await page.locator('[data-nl-block]').first().click();
    await page.getByRole('button', { name: T.del }).first().click();
    await expect(page.locator('[data-nl-block]')).toHaveCount(0);
    await page.getByRole('button', { name: T.preview }).click();
    await expect(page.getByRole('dialog')).toContainText(T.unsubMissing);
    await page.keyboard.press('Escape');
    // The change is saved on its own (settings autosave).
    await expect.poll(() => mock.callsOf('settings_save').length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(mock.config().footer.rows.flatMap((r: any) => r.columns.flatMap((c: any) => c.blocks))).toHaveLength(0);
  });

  test('the header editor opens on the default header and Back returns to the cards', async ({ page }) => {
    await open(page, '#settings/newsletter/design/header');
    await expect(page.locator('[data-nl-block]').first()).toBeVisible();
    await page.getByRole('button', { name: C('Back to design settings', 'Späť na nastavenia dizajnu', 'Vissza a dizájnbeállításokhoz') }).click();
    await expect(page.getByTestId('newsletter-edit-header')).toBeVisible();
  });
});
