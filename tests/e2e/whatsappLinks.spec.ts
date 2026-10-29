import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { seedWhatsApp, waLink as link } from './helpers/whatsappSeed';

/**
 * WhatsApp (WAAI) in the client views: the chip next to a phone number, the timeline entry WAAI pushes
 * in and the badge on a task it extracted (docs/WAAI-INTEGRATION.md §4.8).
 *
 * Seeded by `helpers/whatsappSeed.ts`, not by the shared fixture: a chip leads to the WhatsApp module,
 * which the crawler would click into a page that does not exist before phase 7.
 *
 * The fixture runs in Slovak.
 */

const CLIENT = 'Kováč Reality s.r.o.';
const OTHER_CLIENT = 'Bieliková Lenka'; // +421 906 321 654, no chat

const openClient = async (page: Page, name: string) => gotoView(page, `#client-${encodeURIComponent(name)}`);

test.describe('WhatsApp links in the client views', () => {
  test('a client with a number but no chat offers to start one', async ({ page }) => {
    await startSession(page);
    await seedWhatsApp(page, {});
    await openClient(page, OTHER_CLIENT);
    await expect(page.getByRole('link', { name: 'Začať chat' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Otvoriť chat' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Začať chat' })).toHaveAttribute('href', /^#whatsapp\/open\?phone=421906321654&lead=/);
  });

  test('a number WAAI found is not on WhatsApp offers nothing', async ({ page }) => {
    await startSession(page);
    await seedWhatsApp(page, { numbers: [{ phone: '421906321654', status: 'not_registered', checkedAt: '2026-10-28 10:00:00' }] });
    await openClient(page, OTHER_CLIENT);
    await expect(page.getByRole('heading', { name: OTHER_CLIENT }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /chat/i })).toHaveCount(0);
  });

  test('one paired chat is a direct link into it', async ({ page }) => {
    await startSession(page);
    await seedWhatsApp(page, { links: [link('conv-1', 'client-kovac')] });
    await openClient(page, CLIENT);
    const chip = page.getByRole('link', { name: 'Otvoriť chat' });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('href', '#whatsapp/c/conv-1');
  });

  test('several chats open a menu with the viewer\'s own chat first and another user\'s marked', async ({ page }) => {
    await startSession(page);
    await seedWhatsApp(page, {
      links: [
        link('conv-theirs', 'client-kovac', { title: 'Eva Kováčová', ownerUserId: 'user-maria', lastMessageAt: '2026-10-29 09:00:00' }),
        link('conv-mine', 'client-kovac', { title: 'Marek Kováč' }),
      ],
    });
    await openClient(page, CLIENT);
    await page.getByRole('button', { name: /2 chaty/ }).click();
    const items = page.getByRole('menuitem');
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText('Marek Kováč');
    await expect(items.nth(1)).toContainText('Eva Kováčová');
    await expect(items.nth(1)).toContainText('iného používateľa');
    await expect(items.first()).toHaveAttribute('href', '#whatsapp/c/conv-mine');
    await page.keyboard.press('Escape');
    await expect(items).toHaveCount(0);
  });

  test('the timeline shows the WhatsApp entry with a link back into the chat message', async ({ page }) => {
    await startSession(page);
    await seedWhatsApp(page, { links: [link('conv-1', 'client-kovac')], withTimelineEvent: true });
    await openClient(page, CLIENT);
    await expect(page.getByText('Úloha z WhatsAppu: Zaslať cenovú ponuku')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Otvoriť v chate' })).toHaveAttribute('href', '#whatsapp/c/conv-1?m=msg-9');
  });

  test('a task extracted from a chat carries the badge, the open-in-chat link and the date note', async ({ page }) => {
    await startSession(page);
    await seedWhatsApp(page, { links: [link('conv-1', 'client-kovac')], withTask: true });
    await openClient(page, CLIENT);
    await page.getByRole('tab', { name: /Tasks|Úlohy|Feladatok/ }).click();
    const row = page.locator('li').filter({ hasText: 'Zaslať cenovú ponuku na kuchyňu' });
    await expect(row.getByText('WhatsApp', { exact: true })).toBeVisible();
    await expect(row.getByText('termín nebol uvedený v chate')).toBeVisible();
    await expect(row.getByRole('link', { name: 'Otvoriť v chate' })).toHaveAttribute('href', '#whatsapp/c/conv-1?m=msg-9');
  });
});

test.describe('Project contact phone', () => {
  test('typing a contact phone on a project saves it with the project', async ({ page }) => {
    await startSession(page);
    const pushed = await seedWhatsApp(page, {});
    await gotoView(page, '#projects');
    await page.getByText('Strecha Silvia — etapa 1').first().click();
    const phone = page.getByLabel('Telefón kontaktu');
    await phone.fill('0905 555 555');
    await expect.poll(() => pushed.get('project-1')?.contactPhone, { timeout: 10_000 }).toBe('0905 555 555');
  });
});
