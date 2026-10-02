import { test } from '@playwright/test';
import { L, openView, settle, setupRelease, shotView, shotZoom } from './shotkit';

/**
 * Reference spec for the release-notes agent, and the smoke test of the kit.
 * Copy its shape into `generated/<version>.spec.ts`; never edit this one for a
 * release. Run it with:
 *
 *   node scripts/release-notes/shoot.mjs --spec example.spec.ts --out test-results/release-shots
 */

test.beforeEach(async ({ page }) => {
  // patchSync is where a release adds the demo data its feature needs.
  await setupRelease(page);
});

test('tasks: inline quick task panel', async ({ page }) => {
  await openView(page, 'tasks');

  // Scope to <main>: the header has a quick-add icon with the same accessible name.
  const createButton = page.locator('main').getByRole('button', {
    name: L({ sk: 'Vytvoriť novú úlohu', en: 'Create New Task', hu: 'Új feladat' }),
  }).first();
  const clientFilter = page.locator('main').getByTestId('task-client-filter').first();

  // 1. A whole new view, with its key controls numbered.
  await shotView(page, 'tasks-overview', {
    marks: [
      { target: createButton, label: L({ sk: 'Nová úloha', en: 'New task', hu: 'Új feladat' }) },
      { target: clientFilter, label: L({ sk: 'Filter klienta', en: 'Client filter', hu: 'Ügyfélszűrő' }) },
    ],
  });

  // 2. "Where do I find it": spotlight dims everything else.
  await shotView(page, 'tasks-where', {
    spotlight: true,
    marks: [{ target: createButton, label: L({ sk: 'Kliknite sem', en: 'Click here', hu: 'Kattintson ide' }) }],
  });

  // 3. A small element, zoomed.
  await shotZoom(page, clientFilter, 'tasks-client-filter-zoom');

  // 4. The state after an interaction.
  await createButton.click();
  await settle(page);
  await shotView(page, 'tasks-quick-panel');
});
