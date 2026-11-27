import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession, waitForWorkspaceContent } from './helpers/appDriver';

/**
 * End-to-end journey for global Custom Fields on Leads:
 * 1. Configuring fields in Settings -> Leads -> Custom fields (`#settings/leads/fields`)
 * 2. Creating a Lead in the Add Lead modal with required custom-field validation & `data` push
 * 3. Toggling a custom field column in the Leads View menu, verifying cell display + search
 * 4. Editing custom fields in place on the Lead Detail Custom Fields card & converting to a Project
 *    whose matching attribute name + type (`Plocha (m²)` / `number`, `Variant` / `select`) transfers automatically.
 */

type SyncState = {
  leadAttributes?: Array<{ id: string; name: string; type: string }>;
  leads: Map<string, Record<string, any>>;
  projects: Map<string, Record<string, any>>;
};

function recordSyncPushes(page: Page): SyncState {
  const state: SyncState = {
    leads: new Map(),
    projects: new Map(),
  };

  void page.route('**/sync.php**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      try {
        const body = req.postDataJSON() as Record<string, any>;
        if (Array.isArray(body?.settings?.leadAttributes)) {
          state.leadAttributes = body.settings.leadAttributes;
        }
        for (const l of body?.leads ?? []) {
          if (l?.id) state.leads.set(String(l.id), l);
        }
        for (const p of body?.projects ?? []) {
          if (p?.id) state.projects.set(String(p.id), p);
        }
      } catch {
        /* ignore non-JSON */
      }
    }
    await route.fallback();
  });

  return state;
}

test.describe('Lead custom fields', () => {
  test('configure fields, create lead with validation, show list column, edit in place, and transfer on convert to project', async ({ page }) => {
    await startSession(page);
    const syncState = recordSyncPushes(page);
    page.on('dialog', (dialog) => void dialog.accept());

    // 1. Settings -> Leads -> Custom fields
    await gotoView(page, '#settings/leads/fields');
    await expect(page.getByRole('heading', { name: 'Vlastné polia leadov' })).toBeVisible();

    const form = page.locator('[data-lead-attr-form]');
    const labelInput = form.getByPlaceholder('napr. Rozpočtový strop');

    // Add 1: Plocha (m²) — Number, Required (matches ptype-roof's `Plocha (m²)` number attribute)
    await labelInput.fill('Plocha (m²)');
    await form.getByRole('button', { name: /Textové pole/ }).click();
    await page.getByRole('option', { name: 'Číslo', exact: true }).click();
    await form.getByLabel('Povinné pole').check();
    await form.getByRole('button', { name: 'Pridať pole' }).click();
    await expect(page.locator('[data-attr-row]', { hasText: 'Plocha (m²)' })).toBeVisible();

    // Add 2: Variant — Select (Štandard, Premium — matches ptype-roof's `Variant` select)
    await labelInput.fill('Variant');
    await form.getByRole('button', { name: /Textové pole/ }).click();
    await page.getByRole('option', { name: 'Rozbaľovací zoznam', exact: true }).click();
    await form.getByPlaceholder('Nová možnosť').fill('Premium');
    await form.getByRole('button', { name: 'Pridať', exact: true }).click();
    await form.getByPlaceholder('Nová možnosť').fill('Štandard');
    await form.getByRole('button', { name: 'Pridať', exact: true }).click();
    await form.getByRole('button', { name: 'Pridať pole' }).click();
    await expect(page.locator('[data-attr-row]', { hasText: 'Variant' })).toBeVisible();

    // Wait for debounced settings sync push
    await expect
      .poll(() => (syncState.leadAttributes ?? []).length, { timeout: 10_000 })
      .toBe(2);

    // 2. Navigate via hash to Leads view -> Add Lead modal with required custom field check
    await page.evaluate(() => {
      window.location.hash = 'leads';
    });
    await waitForWorkspaceContent(page);
    await expect(page.getByRole('button', { name: 'Pridať nový lead' })).toBeVisible();
    await page.getByRole('button', { name: 'Pridať nový lead' }).click();

    await page.getByPlaceholder('napr. Redizajn webu / Nová zákazka').fill('Solárna strecha Nitra');
    await page.getByPlaceholder('napr. 15000').fill('22000');

    // Try submitting while required custom field `Plocha (m²)` is empty -> modal stays open
    await page.getByRole('button', { name: 'Pridať riadok' }).click();
    await expect(page.getByRole('button', { name: 'Pridať riadok' })).toBeVisible();

    // Fill custom fields inside the modal
    const modal = page.locator('form').filter({ hasText: 'Plocha (m²)' });
    await modal.locator('input[type="number"]').last().fill('240');
    await modal.getByRole('button', { name: /Vybrať možnosť/ }).click();
    await page.getByRole('option', { name: 'Premium', exact: true }).click();

    await page.getByRole('button', { name: 'Pridať riadok' }).click();
    await expect
      .poll(() => {
        for (const l of syncState.leads.values()) {
          if (l.name === 'Solárna strecha Nitra') return l;
        }
        return undefined;
      }, { timeout: 10_000 })
      .toBeTruthy();

    const createdLead = Array.from(syncState.leads.values()).find((l) => l.name === 'Solárna strecha Nitra')!;
    const areaAttr = syncState.leadAttributes!.find((a) => a.name === 'Plocha (m²)')!;
    const variantAttr = syncState.leadAttributes!.find((a) => a.name === 'Variant')!;
    expect(createdLead.data?.[areaAttr.id]).toBe('240');
    expect(createdLead.data?.[variantAttr.id]).toBe('Premium');

    // 3. Toggle custom field column in View menu and verify table renders it + search finds it
    await page.getByRole('button', { name: /^Pohľad/ }).click();
    const viewMenu = page.getByRole('dialog', { name: /Nastavenia pohľadu/ });
    await expect(viewMenu.getByRole('checkbox', { name: 'Plocha (m²)' })).not.toBeChecked();
    await viewMenu.getByRole('checkbox', { name: 'Plocha (m²)' }).click();
    await viewMenu.getByRole('button', { name: 'Zavrieť' }).click();

    await expect(page.locator('thead').getByText('Plocha (m²)')).toBeVisible();
    const leadRow = page.locator('tbody tr').filter({ hasText: 'Solárna strecha Nitra' }).first();
    await expect(leadRow).toContainText('240');

    // Search by custom field option value ("Premium")
    await page.getByPlaceholder(/Hľadať/).fill('Premium');
    await expect(leadRow).toBeVisible();
    await page.getByPlaceholder(/Hľadať/).fill('');

    // 4. Open Lead detail -> edit custom field in place -> Convert to Project & verify carried data
    await leadRow.locator('td:visible').nth(1).click();
    const cfCard = page.locator('div.p-6').filter({ hasText: 'Vlastné polia' }).first();
    await expect(cfCard).toBeVisible();

    const detailAreaInput = cfCard.locator('input[type="number"]');
    await expect(detailAreaInput).toHaveValue('240');
    await detailAreaInput.fill('265');

    await expect
      .poll(() => syncState.leads.get(createdLead.id)?.data?.[areaAttr.id], { timeout: 10_000 })
      .toBe('265');

    // Convert to Rekonštrukcia strechy (`ptype-roof`), which has `attr-area` (Plocha (m²)) and `attr-variant` (Variant)
    await page.getByRole('button', { name: 'Konvertovať na projekt' }).click();
    await page.getByRole('button', { name: 'Rekonštrukcia strechy' }).click();

    await expect
      .poll(() => Array.from(syncState.projects.values()).find((p) => p.leadId === createdLead.id), { timeout: 10_000 })
      .toBeTruthy();

    const createdProject = Array.from(syncState.projects.values()).find((p) => p.leadId === createdLead.id)!;
    expect(createdProject.leadId).toBe(createdLead.id);
    expect(createdProject.data?.['attr-area']).toBe('265');
    expect(createdProject.data?.['attr-variant']).toBe('Premium');
  });
});
