import { test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { installDemoBackend } from './demoMocks';
import { buildSyncPayload, DEMO_USER } from './demoData';

/**
 * Screenshots for the 1.11 release note in Craft. Writes to CHANGELOG_SHOTS_OUT
 * (default `presentation-screenshots/changelog-1.11`). Run with:
 *   npx playwright test --config playwright.demo.config.ts changelog-1-11
 */
const OUT = process.env.CHANGELOG_SHOTS_OUT ?? 'presentation-screenshots/changelog-1.11';

const EMPLOYEES = [
  ['Marek Baláž', 'Strechár — vedúci partie', 1850],
  ['Tomáš Urban', 'Klampiar', 1620],
  ['Jozef Šimko', 'Pomocný pracovník', 1240],
  ['Lucia Hanáková', 'Administratíva', 1480],
].map(([name, role, amount], i) => ({
  id: `emp-demo-${i + 1}`,
  name,
  role,
  email: `zamestnanec${i + 1}@rekonstav.sk`,
  phone: `+421 905 30${i} 4${i}0`,
  salaryType: 'monthly',
  salaryAmount: amount,
  isActive: true,
  performanceScore: 82 + i * 4,
  vacationAllowances: { 'vt-1': 20 },
  createdAt: '2026-03-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
}));

const FAVORITES = [
  { id: 'fav-1', type: 'project', title: 'Rekonštrukcia strechy – Hrušková', subtitle: 'Projekt', url: 'projects/project-hruskova', addedAt: '2026-09-30T08:00:00.000Z' },
  { id: 'fav-2', type: 'client', title: 'Silvia Hrušková', subtitle: 'Klient', url: 'clients?name=Silvia%20Hru%C5%A1kov%C3%A1', addedAt: '2026-09-30T08:01:00.000Z' },
  { id: 'fav-3', type: 'lead', title: 'Novák Stavby', subtitle: 'Lead', url: 'leads', addedAt: '2026-09-30T08:02:00.000Z' },
];

test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

test.beforeEach(async ({ page }) => {
  await installDemoBackend(page);
  // Registered after the demo backend, so it wins for GET /sync.php.
  await page.route('**/sync.php**', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const payload = buildSyncPayload();
    const meta = { ...JSON.parse(DEMO_USER.metadata_json), preferences: { favorites: FAVORITES } };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...payload,
        users: payload.users.map((u: any) => (u.id === DEMO_USER.id ? { ...u, metadata_json: JSON.stringify(meta) } : u)),
        employees: EMPLOYEES,
        employeeSalaries: [],
        employeeVacations: [],
        employeeSettings: {
          salaryDueDay: 15,
          autoExpense: true,
          salaryTypes: [],
          vacationTypes: [{ id: 'vt-1', name: 'Dovolenka', color: '#10b981', defaultDays: 20 }],
        },
      }),
    });
  });
});

let n = 0;
async function open(page: Page, hash: string) {
  n++;
  await page.goto(`/?shot=${n}#${hash}`, { waitUntil: 'domcontentloaded' });
  const preset = page.locator('button:has-text("erik@rekonstav.sk"), button:has-text("Erik")').first();
  if (await preset.isVisible({ timeout: 700 }).catch(() => false)) await preset.click({ force: true }).catch(() => {});
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  await page
    .waitForFunction(() => {
      const m = document.querySelector('main') as HTMLElement | null;
      return !!m && !m.querySelector('.animate-spin') && (m.innerText ?? '').trim().length > 80;
    }, undefined, { timeout: 20_000 })
    .catch(() => {});
  await page.waitForTimeout(1600);
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

test('1.11 screenshots', async ({ page }) => {
  await open(page, 'employees');
  await shot(page, '01-zamestnanci-zoznam');
  await open(page, 'employee-emp-demo-1');
  await shot(page, '02-zamestnanec-karta');

  await open(page, 'tasks');
  await shot(page, '03-ulohy');

  await open(page, 'dashboard');
  const toggle = page.locator('button[aria-label="Prepnúť navigačný panel"]').first();
  if (await toggle.isVisible({ timeout: 2000 }).catch(() => false)) {
    await toggle.click({ force: true });
    await page.waitForTimeout(900);
    await shot(page, '04-navigacia-dok');
  }

  await open(page, 'dashboard');
  const heart = page.locator('button[aria-label="Obľúbené položky"]').first();
  if (await heart.isVisible({ timeout: 2000 }).catch(() => false)) {
    await heart.click({ force: true });
    await page.waitForTimeout(1500);
    await shot(page, '05-oblubene');
  }

  await open(page, 'projects');
  await shot(page, '06-projekty-zoznam');
  await open(page, 'projects/project-hruskova');
  await shot(page, '07-projekt-detail');

  await open(page, 'financial');
  await shot(page, '08-financie-prehlad');

  await open(page, 'leads');
  await shot(page, '09-leady-stavova-rovnica');
});
