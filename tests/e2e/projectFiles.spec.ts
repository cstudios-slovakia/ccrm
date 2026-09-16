import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * A project's Files tab: a file dropped on a slot, or picked with its Upload
 * button, is uploaded into that slot — and the project stays open. Both halves
 * shipped broken once: the tab saves each upload on the spot, and the save
 * closed the card, which threw the reader back to the project list.
 *
 * Pinned as a journey because neither the crawler nor a recording drags a file
 * onto an element, which is the whole feature. One of the two drops below is
 * dispatched through the browser's own drag machinery (CDP) rather than as a
 * synthetic event: a drop zone that forgets to cancel `dragover` passes the
 * synthetic test and still lets the real browser open the dropped file
 * instead, navigating out of the app.
 */

const PROJECT_NAME = 'Strecha Silvia — etapa 1';
const TAB = /^(Files|Súbory|Fájlok)/;
const DROP_HINT = /Drop files here|Pretiahnite súbory sem|Húzza ide a fájlokat/;

async function openProjectFiles(page: Page) {
  await gotoView(page, '#projects');
  await page.getByText(PROJECT_NAME).first().click();
  await page.getByRole('button', { name: TAB }).first().click();
  await expect(page.getByText(/Default files|Predvolené súbory|Alapértelmezett fájlok/).first()).toBeVisible();
}

/** The card of the first default file slot — the parent of its drop hint. */
function firstSlot(page: Page) {
  return page.getByText(DROP_HINT).first().locator('xpath=..');
}

/** Still on the project, with its tabs — not back on the project list. */
async function stillOnTheProject(page: Page) {
  await expect(page.getByRole('button', { name: TAB }).first()).toBeVisible();
  await expect(page.getByText(PROJECT_NAME).first()).toBeVisible();
}

test.describe('Project files', () => {
  test('a dropped file is uploaded into the slot and the project stays open', async ({ page }) => {
    await startSession(page);
    await openProjectFiles(page);

    const slot = firstSlot(page);
    await expect(slot).toBeVisible();

    const dataTransfer = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['dropped by the QA suite'], 'qa-drop.txt', { type: 'text/plain' }));
      return dt;
    });

    await slot.dispatchEvent('dragenter', { dataTransfer });
    await slot.dispatchEvent('dragover', { dataTransfer });
    await slot.dispatchEvent('drop', { dataTransfer });

    await expect(page.getByRole('link', { name: /qa-drop\.txt/ })).toBeVisible({ timeout: 10_000 });
    await stillOnTheProject(page);
  });

  test('a real browser file drag lands in the slot instead of opening the file', async ({ page }) => {
    await startSession(page);
    await openProjectFiles(page);

    const slot = firstSlot(page);
    const box = (await slot.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    const filePath = path.join(os.tmpdir(), 'qa-native-drop.txt');
    fs.writeFileSync(filePath, 'dragged by the QA suite');

    const cdp = await page.context().newCDPSession(page);
    const data = {
      items: [{ mimeType: 'text/plain', data: 'dragged by the QA suite', title: 'qa-native-drop.txt' }],
      files: [filePath],
      dragOperationsMask: 1,
    };
    for (const type of ['dragEnter', 'dragOver', 'drop'] as const) {
      await cdp.send('Input.dispatchDragEvent', { type, x, y, data });
    }

    await expect(page.getByRole('link', { name: /qa-native-drop\.txt/ })).toBeVisible({ timeout: 10_000 });
    // The browser did not take the drop itself and navigate to the file.
    expect(page.url()).toContain('#projects');
    await stillOnTheProject(page);
  });

  test('a file picked with the Upload button keeps the project open', async ({ page }) => {
    await startSession(page);
    await openProjectFiles(page);

    await firstSlot(page).locator('input[type=file]').first().setInputFiles({
      name: 'qa-picked.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('picked by the QA suite'),
    });

    await expect(page.getByRole('link', { name: /qa-picked\.txt/ })).toBeVisible({ timeout: 10_000 });
    await stillOnTheProject(page);
  });
});
