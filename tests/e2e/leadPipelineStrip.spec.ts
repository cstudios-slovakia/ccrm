import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

/**
 * The lead pipeline strip with a long, Slovak pipeline — the shape that made it
 * unreadable: a dozen steps, substates, Slovak closed states that the old code
 * only recognised by English name, and a "do not contact" state that is not a
 * step at all. See src/utils/leadPipeline.ts and src/components/ui/pipelineCollapse.ts.
 */

const STATES = [
  'Nový', 'Nekontaktovať', 'Kontaktovaný', 'Obhliadka', 'Zameranie', 'Cenová ponuka', 'V procese',
  'Odoslaná', 'Dohodnutá', 'Záväzná', 'Realizácia', 'Fakturácia', 'Odmietnutá', 'Prijatá',
];
const GROUPS: Record<string, string> = Object.fromEntries(STATES.map((s) => [s.toLowerCase(), 'in_progress']));
GROUPS['nový'] = 'new';
GROUPS['odmietnutá'] = 'closed';
GROUPS['prijatá'] = 'closed';

type PushedSettings = { leadStatePipelineHidden?: Record<string, boolean> };

/** Serves the long pipeline; records the settings the app pushes back. */
async function seedLongPipeline(page: Page) {
  const pushed: PushedSettings[] = [];
  await page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      try {
        const body = request.postDataJSON() as { settings?: PushedSettings };
        if (body?.settings) pushed.push(body.settings);
      } catch {
        /* not JSON */
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, serverTime: new Date().toISOString(), dataVersion: 2 }),
      });
    }
    const payload: any = { ...buildSyncPayload() };
    payload.settings = {
      ...payload.settings,
      leadStates: STATES,
      leadStageGroups: GROUPS,
      leadStateParents: { 'v procese': 'cenová ponuka' },
      leadStateColors: { 'cenová ponuka': '#8b5cf6', 'odmietnutá': '#ef4444' },
      leadStatePipelineHidden: { 'nekontaktovať': true },
      leadStateSla: {},
      leadStateFollowUp: {},
    };
    payload.leads = payload.leads.map((l: any) =>
      l.id === 'lead-silvia' ? { ...l, status: 'v procese' } : l,
    );
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });
  return pushed;
}

/** The [title] of every segment in a strip, in order. */
const segmentTitles = (strip: ReturnType<Page['locator']>) =>
  strip.locator(':scope > div').evaluateAll((els) => els.map((el) => el.getAttribute('title') ?? ''));

test.describe('Lead pipeline strip — long pipelines', () => {
  test('the drawer folds around the current substate and ends in one outcome', async ({ page }) => {
    const consoleErrors = await startSession(page);
    await seedLongPipeline(page);
    await gotoView(page, '#lead-lead-silvia');

    const current = page.getByTitle('Cenová ponuka › V procese (Aktuálne/Minulé)');
    await expect(current).toBeVisible();
    const strip = current.locator('xpath=..');

    expect(await segmentTitles(strip)).toEqual([
      'Nový → Kontaktovaný → Obhliadka → Zameranie',
      'Cenová ponuka › V procese (Aktuálne/Minulé)',
      'Odoslaná (Nadchádzajúce)',
      'Dohodnutá → Záväzná → Realizácia → Fakturácia',
      'Uzavreté (Odmietnutá / Prijatá)',
    ]);

    // Opened, the folded segments carry their counts and the current one its path.
    await strip.hover();
    await expect(strip).toContainText('✓ 4');
    await expect(strip).toContainText('Cenová ponuka › V procese');
    await expect(strip).toContainText('+4');
    expect(consoleErrors.exceptions).toEqual([]);
  });

  test('a list row shows the same folded strip', async ({ page }) => {
    await startSession(page);
    await seedLongPipeline(page);
    await gotoView(page, '#leads');

    const strip = page.locator('tr[data-lead-id="lead-silvia"] .lead-hover-strip');
    await expect(strip).toHaveCount(1);
    expect(await segmentTitles(strip)).toEqual([
      'Nový → Kontaktovaný → Obhliadka → Zameranie',
      'Cenová ponuka › V procese (Aktuálne/Minulé)',
      'Odoslaná (Nadchádzajúce)',
      'Dohodnutá → Záväzná → Realizácia → Fakturácia',
      'Uzavreté (Odmietnutá / Prijatá)',
    ]);
  });

  test('Settings: the "Pipeline bar" switch is saved; substates and closed states have none', async ({ page }) => {
    await startSession(page);
    const pushed = await seedLongPipeline(page);
    await gotoView(page, '#settings/leads/stages');

    const section = page.getByTestId('settings-section-leads-stages');
    await expect(section.getByRole('columnheader', { name: 'Lišta fáz' })).toBeVisible();

    // A state's row: the one whose name pill reads exactly that name.
    const row = (name: string) =>
      section.locator('tbody tr').filter({ has: page.locator('span.rounded-full', { hasText: new RegExp(`^${name}$`) }) });
    const switchIn = (name: string) => row(name).getByRole('switch');
    await expect(switchIn('Nekontaktovať')).toHaveAttribute('aria-checked', 'false');
    await expect(switchIn('Obhliadka')).toHaveAttribute('aria-checked', 'true');
    await expect(switchIn('V procese')).toHaveCount(0);
    await expect(switchIn('Odmietnutá')).toHaveCount(0);

    await switchIn('Obhliadka').click();
    await expect(switchIn('Obhliadka')).toHaveAttribute('aria-checked', 'false');
    await expect
      .poll(() => pushed.at(-1)?.leadStatePipelineHidden, { timeout: 10_000 })
      .toEqual({ 'nekontaktovať': true, 'obhliadka': true });
  });
});
