import { Page } from '@playwright/test';

export interface UserProfile {
  name: string;
  email: string;
  role: string;
  color: string;
  avatar?: string | null;
  activityLog?: any[];
  metadata_json?: string;
}

export const TEST_ADMIN_USER: UserProfile = {
  name: "Erik",
  email: "erik@crm.com",
  role: "Admin",
  color: "#4f46e5",
  avatar: null,
  activityLog: [],
  metadata_json: JSON.stringify({
    leadTableViews: {},
    leadFilters: {},
    emailSettings: { isValidated: true },
  }),
};

/**
 * Pre-seeds the session storage with an authenticated Admin user session
 * and mocks server endpoints (/api/login.php and /sync.php) for isolated, fast, and stable E2E runs.
 */
export async function seedAuthSession(page: Page, user: UserProfile = TEST_ADMIN_USER) {
  // Mock /api/login.php
  await page.route('**/api/login.php', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        user: user,
      }),
    });
  });

  // Mock /sync.php (both GET and POST) to provide a fast seeded CRM dataset with Silvia
  await page.route('**/sync.php**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          serverTime: new Date().toISOString(),
          leads: [
            {
              id: 'lead-silvia-1',
              name: 'Silvia',
              city: 'Bratislava',
              clientType: 'person',
              status: 'accepted',
              source: 'web',
              owner: 'Erik',
              value: 2500,
              createdAt: new Date().toISOString(),
              timeline: [],
            }
          ],
          tasks: [],
          users: [user],
          roles: [],
          meetingNotes: [],
          unifiedEntries: [],
          unifiedEntriesData: {},
          customDashboards: [],
          projectTypes: [],
          projects: [],
          warehouses: [],
          suppliers: [],
          warehouseItems: [],
          warehouseStock: [],
          warehouseBatches: [],
          warehouseMovements: [],
          financialCategories: [],
          financialRecords: [],
          settings: {
            systemName: 'CCRM',
            systemLanguage: 'sk',
          },
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          serverTime: new Date().toISOString(),
        }),
      });
    }
  });

  await page.addInitScript((userJson) => {
    try {
      window.sessionStorage.setItem("crm_current_user_rbac", userJson);
    } catch (e) {
      console.warn("Failed to set test session in sessionStorage", e);
    }
  }, JSON.stringify(user));
}

/**
 * Ensures the page is loaded and authenticated.
 */
export async function ensureAuthenticated(page: Page, targetHash?: string) {
  const targetUrl = targetHash ? `/${targetHash}` : '/#dashboard';
  await page.goto(targetUrl);
  await page.waitForLoadState('domcontentloaded');

  const erikPreset = page.locator('button:has-text("erik@crm.com"), button:has-text("ER Erik")').first();
  const isPresetVisible = await erikPreset.isVisible({ timeout: 1500 }).catch(() => false);
  
  if (isPresetVisible) {
    await erikPreset.click({ force: true });
    await page.waitForSelector('header', { timeout: 6000 }).catch(() => {});
  }

  if (targetHash) {
    await page.goto(`/${targetHash}`);
    await page.waitForTimeout(300);
  }
}
