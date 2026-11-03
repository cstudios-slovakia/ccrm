import { expect, test, type Page } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

/**
 * SAI: the two stored demo simulations (demo-sai-1 completed, demo-sai-2 draft) are ordinary rows.
 *
 * SaiModule used to treat every id starting with "demo-" as the built-in client-side demo, so a stored
 * row with such an id opened the canned scenario instead of its own data. Only the built-in checkpoint id
 * and demo-sim-* are the built-in demo now (docs/DEMO-MODE.md B7, phase 4E). `api/swarm.php` is mocked
 * with the two rows exactly as the demo seed stores them (public/api/demo_seed/sai.php).
 */

const COMPLETED = {
  id: 'demo-sai-1',
  title: 'STORED-COMPLETED quartz worktop price rise',
  hypothesis: 'Stored hypothesis of the completed simulation.',
  status: 'completed',
  current_round: 3,
  total_rounds: 3,
  swarm_scale: 30,
  lookback_months: 12,
  crm_data_sources: ['active_leads', 'existing_clients', 'projects'],
};
const DRAFT = {
  id: 'demo-sai-2',
  title: 'STORED-DRAFT outdoor kitchen line',
  hypothesis: 'Stored hypothesis of the draft simulation.',
  status: 'draft',
  current_round: 0,
  total_rounds: 5,
  swarm_scale: 30,
  lookback_months: 12,
  crm_data_sources: ['active_leads', 'existing_clients', 'projects'],
};

const REPORT = {
  title: 'STORED-REPORT briefing of the stored simulation',
  summary: 'Stored summary.',
  generatedAt: '2026-11-01T16:40:00+00:00',
  executiveVerdict: {
    question: 'Stored question?',
    directAnswer: 'STORED-VERDICT yes',
    confidenceScore: 84,
    summary: 'Stored verdict summary.',
    answerBreakdown: [{ answer: 'Accept', sharePercentage: 74, count: 4, sentiment: 0.6 }],
    keyDrivers: [],
    tippingPoints: [],
    whatWouldChangeOutcome: [],
    actionableRecommendations: [],
  },
  sections: [],
  strategicPlaybook: { keyVulnerabilities: [], actionableCounterMeasures: [], salesObjectionPlaybook: [], recommendedGtmSequence: [] },
};

const RESUME: Record<string, unknown> = {
  'demo-sai-1': {
    ...COMPLETED,
    seed_document: 'Stored seed.',
    final_report: REPORT,
    checkpoint: {
      simulationId: 'demo-sai-1', status: 'completed', currentRound: 3, totalRounds: 3,
      graph: { nodes: [{ id: 'node_studios', name: 'Partner studios', type: 'Partner', summary: 's' }], edges: [] },
      agents: [], posts: [], metricsHistory: [], finalReport: REPORT,
    },
  },
  'demo-sai-2': { ...DRAFT, seed_document: 'Stored draft seed.', checkpoint: { crm_data_sources: DRAFT.crm_data_sources } },
};

interface SwarmCalls { list: number; resume: string[] }

async function mockSwarm(page: Page): Promise<SwarmCalls> {
  const calls: SwarmCalls = { list: 0, resume: [] };
  await page.route('**/api/swarm.php**', (route) => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get('action');
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (action === 'list') {
      calls.list++;
      return json({ success: true, simulations: [COMPLETED, DRAFT] });
    }
    if (action === 'resume') {
      const id = url.searchParams.get('simulation_id') ?? '';
      calls.resume.push(id);
      return RESUME[id] ? json({ success: true, simulation: RESUME[id] }) : json({ success: false });
    }
    return json({ success: true });
  });
  return calls;
}

const TOGGLE = /Demo mode: (ON|OFF)|Demo režim: (ZAP|VYP)|Demó mód: (BE|KI)/;
const TOGGLE_ON = /Demo mode: ON|Demo režim: ZAP|Demó mód: BE/;
const TOGGLE_OFF = /Demo mode: OFF|Demo režim: VYP|Demó mód: KI/;
/** The built-in demo card and its title, in any of the three languages. */
const BUILT_IN_CARD = /Interactive demo: |Interaktívne demo: |Interaktív demó: /;

async function openSai(page: Page): Promise<SwarmCalls> {
  await startSession(page);
  const calls = await mockSwarm(page);
  await gotoView(page, 'sai');
  await expect(page.getByRole('button', { name: TOGGLE })).toBeVisible();
  return calls;
}

async function setDemoToggle(page: Page, on: boolean) {
  const toggle = page.getByRole('button', { name: TOGGLE });
  const isOn = TOGGLE_ON.test((await toggle.textContent()) ?? '');
  if (isOn !== on) await toggle.click();
  await expect(page.getByRole('button', { name: on ? TOGGLE_ON : TOGGLE_OFF })).toBeVisible();
}

test.describe('SAI stored demo simulations', () => {
  test('both entries are listed with the demo toggle OFF', async ({ page }) => {
    await openSai(page);
    await setDemoToggle(page, false);
    await expect(page.getByRole('heading', { name: COMPLETED.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: DRAFT.title })).toBeVisible();
    await expect(page.getByText(BUILT_IN_CARD)).toHaveCount(0);
  });

  test('both entries are still listed with the demo toggle ON, next to the built-in demo card', async ({ page }) => {
    await openSai(page);
    await setDemoToggle(page, true);
    await expect(page.getByRole('heading', { name: COMPLETED.title })).toBeVisible();
    await expect(page.getByRole('heading', { name: DRAFT.title })).toBeVisible();
    await expect(page.getByText(BUILT_IN_CARD).first()).toBeVisible();
    // the built-in scenario is the Lapidea sintered-stone warranty, not the retired SaaS pricing demo
    await expect(page.getByText(/Enterprise/)).toHaveCount(0);
  });

  for (const on of [false, true]) {
    test(`demo-sai-1 opens as the stored completed simulation (toggle ${on ? 'ON' : 'OFF'})`, async ({ page }) => {
      const calls = await openSai(page);
      await setDemoToggle(page, on);
      await page.getByRole('heading', { name: COMPLETED.title }).click();
      // the stored report, fetched from the server - not the canned built-in scenario
      await expect(page.getByText(REPORT.executiveVerdict.directAnswer).first()).toBeVisible();
      expect(calls.resume).toContain('demo-sai-1');
      expect(await page.evaluate(() => window.location.hash)).toContain('demo-sai-1');
    });

    test(`demo-sai-2 opens in the draft editor, ready to run (toggle ${on ? 'ON' : 'OFF'})`, async ({ page }) => {
      await openSai(page);
      await setDemoToggle(page, on);
      await page.getByRole('heading', { name: DRAFT.title }).click();
      // the editor is filled with the stored draft (the first text input on the page is the global search)
      await expect.poll(() => page.locator('input[type="text"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toContain(DRAFT.title);
      expect(await page.evaluate(() => window.location.hash)).toContain('draftId=demo-sai-2');
    });
  }

  test('opening a stored demo-sai-* link directly loads the stored row, not the built-in demo', async ({ page }) => {
    await startSession(page);
    const calls = await mockSwarm(page);
    await gotoView(page, 'sai/report?id=demo-sai-1');
    await expect(page.getByText(REPORT.executiveVerdict.directAnswer).first()).toBeVisible();
    expect(calls.resume).toContain('demo-sai-1');
  });

  test('the built-in checkpoint id still opens the built-in demo without asking the server', async ({ page }) => {
    await startSession(page);
    const calls = await mockSwarm(page);
    await gotoView(page, 'sai/report?id=demo-pricing-rehearsal');
    await expect(page.getByText(/15-year|15-ročn|15 éves/).first()).toBeVisible();
    expect(calls.resume).not.toContain('demo-pricing-rehearsal');
  });
});
