import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

/**
 * Saves that never leave the browser (docs/PERSISTENCE-AUDIT.md, second
 * prompt). Each test makes a change, presses only what a user would call
 * "save" — or nothing at all — leaves the way a user leaves, and checks what
 * reached /sync.php. The QA mock re-serves a fixed dataset on every load, so a
 * reload proves nothing here; the outgoing POST is the proof.
 */

type Row = Record<string, unknown>;

/** Every record of one collection the app pushed to /sync.php, newest write winning per id. */
function recordPushed(page: Page, collection: string) {
  const pushed = new Map<string, Row>();
  // Registered after the fixture's mocks, so Playwright asks this one first.
  void page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as Record<string, Row[] | undefined>;
        for (const row of body?.[collection] ?? []) pushed.set(String(row.id), row);
      } catch {
        /* not JSON — nothing to record */
      }
    }
    await route.fallback();
  });
  return pushed;
}

/** In-app navigation: the hash moves, the app does not reload. */
async function goHash(page: Page, hash: string) {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
}

test.describe('Drafts survive their exits', () => {
  test('a lead edit left unsaved is not written onto the next lead', async ({ page }) => {
    await startSession(page);
    const pushed = recordPushed(page, 'leads');
    await gotoView(page, '#lead-lead-silvia');

    await page.getByTitle(/^(Edit Lead details|Upraviť detaily leadu|Lead részleteinek szerkesztése)$/).click();
    const silviaName = page.locator('input[value="Silvia"]:enabled');
    await silviaName.fill('Silvia — neuložený koncept');

    // Straight to another lead, without saving or cancelling. The same
    // LeadsDatagrid instance serves both leads.
    await goHash(page, '#lead-lead-novak');
    const nameLabel = page.getByText(/^(Lead\/Client Name \*|Meno leadu\/klienta \*|Lead\/Ügyfél neve \*)$/);
    const nameInput = nameLabel.locator('xpath=following::input[1]');
    await expect(nameInput).toHaveValue('Novák Stavby s.r.o.');

    // Saving the second lead writes the second lead, not the first one's draft.
    const edit = page.getByTitle(/^(Edit Lead details|Upraviť detaily leadu|Lead részleteinek szerkesztése)$/);
    if (await edit.isVisible().catch(() => false)) await edit.click();
    await page.getByRole('button', { name: /Save Lead Changes|Uložiť zmeny leadu|Lead változtatások mentése/ }).click();
    await page.waitForTimeout(2_500);
    const novak = pushed.get('lead-novak');
    if (novak) expect(novak.name).toBe('Novák Stavby s.r.o.');
    expect([...pushed.values()].some((l) => l.name === 'Silvia — neuložený koncept')).toBe(false);
  });

  test('project type: an event type and a file slot typed but not added are kept on Back', async ({ page }) => {
    await startSession(page);
    const pushed = recordPushed(page, 'projectTypes');
    await gotoView(page, '#projects');
    await page.getByTitle(/Project settings|Nastavenia projektov|Projekt beállítások/).click();
    await page.getByText('Rekonštrukcia strechy').first().click();

    await page.getByRole('tab', { name: /Timeline|Časová os|Idővonal/ }).click();
    await page.getByPlaceholder(/e\.g\. Measurement|napr\. Zameranie|pl\. Felmérés/).fill('Kontrola kvality');
    await page.getByRole('tab', { name: /Files|Súbory|Fájlok/ }).click();
    await page.getByPlaceholder(/e\.g\. Contract, GDPR|napr\. Zmluva, Súhlas GDPR|pl\. Szerződés/).fill('Revízna správa');

    await page.getByRole('button', { name: /Back to projects|Späť na projekty|Vissza a projektekhez/ }).click();

    await expect.poll(() => {
      const roof = pushed.get('ptype-roof') as { timelineEventTypes?: { name: string }[]; fileFields?: { name: string }[] } | undefined;
      return {
        eventType: (roof?.timelineEventTypes ?? []).some((et) => et.name === 'Kontrola kvality'),
        fileSlot: (roof?.fileFields ?? []).some((f) => f.name === 'Revízna správa'),
      };
    }, { timeout: 8_000 }).toEqual({ eventType: true, fileSlot: true });
  });

  test('project type: an attribute typed but not added is kept when leaving for another module', async ({ page }) => {
    await startSession(page);
    const pushed = recordPushed(page, 'projectTypes');
    await gotoView(page, '#projects');
    await page.getByTitle(/Project settings|Nastavenia projektov|Projekt beállítások/).click();
    await page.getByText('Rekonštrukcia strechy').first().click();
    await page.getByRole('tab', { name: /Attributes|Atribúty|Attribútumok/ }).click();
    await page.getByPlaceholder(/e\.g\. Dimensions|napr\. Rozmery|pl\. Méretek/).fill('Sklon strechy');

    // No Add, no Close: the sidebar takes the user somewhere else and the editor unmounts.
    await goHash(page, '#leads');

    await expect.poll(() => {
      const roof = pushed.get('ptype-roof') as { attributes?: { name: string }[] } | undefined;
      return (roof?.attributes ?? []).some((a) => a.name === 'Sklon strechy');
    }, { timeout: 8_000 }).toBe(true);
  });

  test('archiving a task from its drawer keeps the edits made in the drawer', async ({ page }) => {
    await startSession(page);
    const pushed = recordPushed(page, 'tasks');
    await gotoView(page, '#tasks');
    await page.getByText('Zavolať klientke Silvii').first().click();
    const card = page.locator('div.rounded-2xl').filter({ has: page.getByRole('heading', { name: 'Zavolať klientke Silvii' }) }).last();
    await card.getByTitle(/^(Edit Task|Upraviť úlohu|Feladat szerkesztése)$/).click();

    const titleInput = page.getByText(/^(Task Title|Názov|Cím)$/).locator('xpath=following::input[1]');
    await titleInput.fill('Zavolať klientke Silvii — upravené');
    // The drawer's own full-width button, not the card's icon of the same name.
    await page.getByRole('button').filter({ hasText: /^(Archive Task|Archivovať úlohu|Feladat archiválása)$/ }).click();

    await expect.poll(() => {
      const task = [...pushed.values()].find((tk) => String(tk.title).startsWith('Zavolať klientke Silvii'));
      return task ? { title: task.title, archived: task.archived } : null;
    }, { timeout: 8_000 }).toEqual({ title: 'Zavolať klientke Silvii — upravené', archived: true });
  });

  test('a background pull does not wipe a product card being edited', async ({ page }) => {
    await startSession(page);
    const pushed = recordPushed(page, 'warehouseItems');
    // Make every 5 s probe report moved data, so the app runs a full pull each
    // time — what a colleague saving anything does on a live install.
    let version = 100;
    await page.route('**/sync.php?probe=1**', (route) =>
      route.fulfill({ status: 200, json: { ...buildSyncPayload(), dataVersion: version++ } }));
    await gotoView(page, '#warehouse/item-tile');

    const lock = page.getByTitle(/Hold for 1 second to unlock|Podržte 1 sekundu na odomknutie|Tartsa nyomva 1 másodpercig/);
    // Hold the lock for a second: mousedown, wait, mouseup — on the button itself.
    await expect(lock).toBeVisible();
    await lock.dispatchEvent('mousedown');
    await page.waitForTimeout(1_400);
    await lock.dispatchEvent('mouseup').catch(() => {});

    const name = page.locator('input[value="Betónová krytina antracit"]:enabled').first();
    await expect(name).toBeVisible();
    await name.fill('Betónová krytina antracit — QA');

    // At least two full pulls go by while the user is still on the card.
    const pulls = { count: 0 };
    page.on('request', (req) => {
      if (req.method() === 'GET' && /\/sync\.php\?t=/.test(req.url())) pulls.count++;
    });
    await expect.poll(() => pulls.count, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(500);
    await expect(page.locator('input[value="Betónová krytina antracit — QA"]')).toHaveCount(1);

    await page.getByRole('button', { name: /^(Save Changes|Uložiť zmeny)$/ }).click();
    await expect.poll(() => pushed.get('item-tile')?.name, { timeout: 8_000 }).toBe('Betónová krytina antracit — QA');
  });

  test('opening a new meeting note and waiting writes nothing', async ({ page }) => {
    await startSession(page);
    const pushed = recordPushed(page, 'meetingNotes');
    await gotoView(page, '#meetings/new');
    await page.waitForTimeout(7_000);
    expect([...pushed.keys()].filter((id) => id.startsWith('meet-'))).toEqual([]);
  });
});
