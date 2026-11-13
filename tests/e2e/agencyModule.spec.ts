import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';
import { SECOND_USER } from './helpers/fixture';
import { installAgencyMocks } from './helpers/agencyMock';
import type { AgencyWorker } from '../../src/types/agency';

const CLIENT_KOVAC_NAME = 'Kováč Reality s.r.o.';

function buildReyesWorker(overrides: Partial<AgencyWorker> = {}): AgencyWorker {
  return {
    id: 'agw-reyes',
    workerCode: 'AGW-001',
    fullName: 'REYES Angela Dela Cruz',
    preferredName: 'Angela',
    email: 'angela.reyes@example.com',
    phone: '+421 900 111 222',
    stageId: 'ready',
    workerStatus: 'candidate',
    nationality: 'PH',
    dateOfBirth: '1995-04-12',
    profile: {
      applicant: {
        surname: 'REYES',
        givenNames: 'Angela Dela Cruz',
        nationality: 'PH',
      },
      passport: {
        number: 'P0000001B',
        validUntil: '2030-05-01',
      },
    },
    skills: ['Assembly', 'Forklift'],
    notes: '',
    defaultPayRate: 8.5,
    defaultBillRate: 14,
    currency: 'EUR',
    assignedRecruiter: 'Erik',
    createdBy: 'Erik',
    createdAt: '2026-05-01 09:00:00',
    updatedAt: '2026-05-01 09:00:00',
    ...overrides,
  };
}

test.describe('Agency & Workforce Leasing module', () => {
  test('1a. hides sidebar entry when agency is disabled in integrationsConfig', async ({ page }) => {
    const capture = await startSession(page, { disabledModules: ['agency'] });
    await gotoView(page, '#dashboard');

    await expect(page.locator('aside nav button[data-dock-id="agency"]')).toHaveCount(0);
    expect(capture.errors).toEqual([]);
    expect(capture.exceptions).toEqual([]);
  });

  test('1b. shows sidebar entry and navigates to agency workspace when enabled', async ({ page }) => {
    const capture = await startSession(page);
    await installAgencyMocks(page);
    await gotoView(page, '#dashboard');

    const navBtn = page.locator('aside nav button[data-dock-id="agency"]');
    await expect(navBtn).toBeVisible();
    await navBtn.click();

    await expect(page.getByTestId('agency-module-view')).toBeVisible();
    expect(capture.errors).toEqual([]);
    expect(capture.exceptions).toEqual([]);
  });

  test('2. customizes schema in Settings, creates candidate, and resolves shareable worker URL on reload', async ({ page }) => {
    const capture = await startSession(page);
    await installAgencyMocks(page);

    // Add a custom schema field in Settings -> Agency -> Schema
    await gotoView(page, '#settings/agency/schema');
    await page.getByTestId('agency-new-field-label-applicant').fill('Shoe Size');
    await page.getByTestId('agency-add-field-applicant').click();
    await expect(page.getByText('Shoe Size')).toBeVisible();

    // Create candidate via Candidates Pipeline modal
    await gotoView(page, '#agency/candidates');
    await page.getByTestId('agency-add-candidate-btn').click();
    await page.getByTestId('agency-new-worker-surname').fill('REYES');
    await page.getByTestId('agency-new-worker-given').fill('Angela Dela Cruz');
    await page.getByTestId('agency-create-candidate-submit').click();

    await expect(page.getByTestId('agency-worker-detail')).toBeVisible();
    await expect(page).toHaveURL(/#agency\/worker\/agw-\d+$/);

    const workerHash = await page.evaluate(() => window.location.hash);
    const workerId = workerHash.replace('#agency/worker/', '');
    expect(workerId).toMatch(/^agw-\d+$/);

    // Reload directly onto the shareable worker detail URL
    await gotoView(page, `#agency/worker/${workerId}`);
    await expect(page.getByTestId('agency-worker-detail')).toBeVisible();

    // Verify both default Passport Number and newly added custom field appear on Profile tab
    await page.getByTestId('agency-detail-tab-profile').click();
    await expect(page.getByText('Shoe Size')).toBeVisible();
    await expect(page.getByText(/Passport Number|Číslo pasu/i).first()).toBeVisible();

    expect(capture.errors).toEqual([]);
    expect(capture.exceptions).toEqual([]);
  });

  test('3. places worker at external company, shows in Company Detail Rented tab, and never writes to leads/sync.php', async ({ page }) => {
    const capture = await startSession(page);
    await installAgencyMocks(page, {
      initialWorkers: [buildReyesWorker()],
    });

    const syncPayloads: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('sync.php') && req.method() === 'POST') {
        syncPayloads.push(req.postData() || '');
      }
    });

    await gotoView(page, '#agency/worker/agw-reyes');
    await page.getByTestId('agency-detail-tab-placements').click();
    await page.getByTestId('agency-place-worker-btn').click();

    await page.getByTestId('agency-placement-company').selectOption('client-kovac');
    await page.getByTestId('agency-placement-pay-rate').fill('9');
    await page.getByTestId('agency-placement-bill-rate').fill('15');
    await page.getByTestId('agency-placement-submit').click();

    await expect(page.locator('[data-testid^="agency-placement-card-"]').first()).toBeVisible();

    // Appears in Rented Employees directory
    await gotoView(page, '#agency/workers');
    await expect(page.getByTestId('agency-rented-workers-view')).toBeVisible();
    await expect(page.getByTestId('agency-rented-row-agw-reyes')).toBeVisible();

    // Appears in Business/Partner Company Detail -> Rented Employees tab
    await gotoView(page, `#client-${encodeURIComponent(CLIENT_KOVAC_NAME)}`);
    const companyTab = page.getByTestId('client-tab-agency-workers');
    await expect(companyTab).toBeVisible();
    await companyTab.click();
    await expect(page.getByTestId('company-agency-workers-tab')).toBeVisible();
    await expect(page.getByTestId('company-rented-worker-agw-reyes')).toBeVisible();

    // Verify zero leaks into sync.php or #clients directory
    expect(syncPayloads.join('\n')).not.toContain('REYES');
    expect(syncPayloads.join('\n')).not.toContain('agw-reyes');

    await gotoView(page, '#clients');
    await expect(page.getByText('REYES Angela Dela Cruz')).toHaveCount(0);

    expect(capture.errors).toEqual([]);
    expect(capture.exceptions).toEqual([]);
  });

  test('4. logs Slovak holiday, worked shift, sick leave, compact vs milestone timeline height, and paid fr-ag expense', async ({ page }) => {
    const capture = await startSession(page);
    const reyes = buildReyesWorker({ workerStatus: 'rented' });
    await installAgencyMocks(page, {
      initialWorkers: [reyes],
      initialPlacements: [
        {
          id: 'agpl-1',
          workerId: reyes.id,
          companyClientId: 'client-kovac',
          workplaceId: null,
          contactLeadId: null,
          jobRole: 'Assembly Operator',
          status: 'active',
          startDate: '2026-05-01',
          endDate: null,
          payRate: 10,
          payRateType: 'hourly',
          billRate: 16,
          billRateType: 'hourly',
          currency: 'EUR',
          notes: '',
        },
      ],
      initialTimelines: {
        [reyes.id]: [
          {
            id: 'agtl-init',
            workerId: reyes.id,
            eventType: 'stage_change',
            title: 'Placed at Kováč Reality s.r.o.',
            description: 'Started active leasing placement.',
            meta: {},
            occurredAt: '2026-05-01 08:00:00',
            createdBy: 'Erik',
          },
        ],
      },
    });

    // Open Work Schedule for 2026-05
    await gotoView(page, '#agency/schedule');
    await expect(page.getByTestId('agency-schedule-view')).toBeVisible();
    await page.getByTestId('agency-schedule-month').fill('2026-05');

    // Slovak public holiday 2026-05-01 is highlighted
    await expect(page.getByTestId('holiday-col-2026-05-01')).toBeVisible();

    // Log a worked shift on 2026-05-04
    await page.getByTestId('agency-shift-cell-agw-reyes-2026-05-04').click();
    await page.getByTestId('agency-shift-status-worked').click();
    await page.getByTestId('agency-shift-save-btn').click();

    // Log sick leave on 2026-05-05
    await page.getByTestId('agency-shift-cell-agw-reyes-2026-05-05').click();
    await page.getByTestId('agency-shift-sick-toggle').click();
    await page.getByTestId('agency-shift-sick-note').fill('Flu / PN');
    await page.getByTestId('agency-shift-save-btn').click();

    // Inspect worker timeline: sick_leave visible & work_log strictly shorter than milestone item
    await gotoView(page, '#agency/worker/agw-reyes');
    const sickCard = page.getByTestId('agency-timeline-item-sick_leave').first();
    const stageCard = page.getByTestId('agency-timeline-item-stage_change').first();
    const workLogCard = page.getByTestId('agency-timeline-item-work_log').first();

    await expect(sickCard).toBeVisible();
    await expect(stageCard).toBeVisible();
    await expect(workLogCard).toBeVisible();

    const workLogBox = await workLogCard.boundingBox();
    const stageBox = await stageCard.boundingBox();
    expect(workLogBox).not.toBeNull();
    expect(stageBox).not.toBeNull();
    expect(workLogBox!.height).toBeLessThan(stageBox!.height);

    // Calculate payment for 2026-05, add 25 EUR deduction, mark Paid -> FinancialRecord fr-ag-* created
    await gotoView(page, '#agency/payments');
    await expect(page.getByTestId('agency-payments-view')).toBeVisible();
    await page.getByTestId('agency-payments-month').fill('2026-05');
    await page.getByTestId('agency-calc-all-btn').click();

    await expect(page.getByTestId('agency-payment-row-agw-reyes')).toBeVisible();
    await page.getByTestId('agency-payment-edit-agw-reyes').click();
    await expect(page.getByTestId('agency-payment-drawer')).toBeVisible();

    await page.getByTestId('agency-add-deduction-btn').click();
    await page.getByTestId('agency-line-amount-0').fill('25');
    await page.getByTestId('agency-payment-status').selectOption('paid');
    await page.getByTestId('agency-payment-save-btn').click();

    const frBadge = page.getByTestId('agency-payment-fr-agw-reyes');
    await expect(frBadge).toBeVisible();
    await expect(frBadge).toContainText(/fr-ag-/);

    expect(capture.errors).toEqual([]);
    expect(capture.exceptions).toEqual([]);
  });

  test('5. enforces RBAC redaction for SECOND_USER without agency.personal, agency.payments, or edit', async ({ page }) => {
    const capture = await startSession(page, {
      user: SECOND_USER,
      roles: [
        {
          name: SECOND_USER.role,
          permissions: {
            agency: 'view',
            'agency.delete': 'nothing',
            'agency.personal': 'nothing',
            'agency.payments': 'nothing',
            tasks: 'edit',
          },
        },
      ],
    });
    await installAgencyMocks(page, {
      canPersonal: false,
      canPayments: false,
      isAdmin: false,
      initialWorkers: [buildReyesWorker()],
    });

    await gotoView(page, '#agency/candidates');
    await expect(page.getByTestId('agency-subtab-payments')).toHaveCount(0);
    await expect(page.getByTestId('agency-add-candidate-btn')).toHaveCount(0);

    await gotoView(page, '#agency/worker/agw-reyes');
    await page.getByTestId('agency-detail-tab-profile').click();

    await expect(page.getByText(/agency\.personal/)).toBeVisible();
    await expect(page.getByText(/Passport Number|Číslo pasu/i)).toHaveCount(0);

    expect(capture.errors).toEqual([]);
    expect(capture.exceptions).toEqual([]);
  });
});
