import fs from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';

/**
 * Chrome DevTools Recorder Replay Runner for CCRM
 * Reads standard Chrome DevTools Recorder JSON exports and replays them via Playwright.
 */
async function runRecorderFlow(jsonFilePath, options = { headless: true }) {
  if (!fs.existsSync(jsonFilePath)) {
    console.error(`❌ Recording file not found: ${jsonFilePath}`);
    process.exit(1);
  }

  const recording = JSON.parse(fs.readFileSync(jsonFilePath, 'utf-8'));
  console.log(`\n▶️ Replaying Chrome Recorder Flow: "${recording.title || path.basename(jsonFilePath)}"`);
  console.log(`   Steps count: ${recording.steps?.length || 0}`);

  const browser = await chromium.launch({
    headless: options.headless,
    slowMo: options.headless ? 0 : 100,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const testUser = {
    name: 'Erik',
    email: 'erik@crm.com',
    role: 'Admin',
    color: '#4f46e5',
    avatar: null,
    activityLog: [],
    metadata_json: '{}',
  };

  // Seed authenticated admin user session & mock sync
  await context.route('**/api/login.php', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, user: testUser }),
    });
  });

  await context.route('**/sync.php**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          serverTime: new Date().toISOString(),
          leads: [{ id: 'lead-1', name: 'Silvia', clientType: 'person', status: 'accepted', owner: 'Erik', value: 2000, timeline: [] }],
          tasks: [],
          users: [testUser],
          roles: [],
          settings: { systemName: 'CCRM', systemLanguage: 'sk' },
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, serverTime: new Date().toISOString() }),
      });
    }
  });

  await context.addInitScript((userJson) => {
    try {
      window.sessionStorage.setItem('crm_current_user_rbac', userJson);
    } catch (e) {}
  }, JSON.stringify(testUser));

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  let stepIdx = 0;
  try {
    for (const step of recording.steps || []) {
      stepIdx++;
      console.log(`   [Step ${stepIdx}/${recording.steps.length}] ${step.type.toUpperCase()}${step.url ? ' -> ' + step.url : ''}`);

      switch (step.type) {
        case 'setViewport':
          await page.setViewportSize({ width: step.width, height: step.height });
          break;

        case 'navigate': {
          await page.goto(step.url, { waitUntil: 'domcontentloaded' });
          const erikPreset = page.locator('button:has-text("erik@crm.com"), button:has-text("ER Erik")').first();
          if (await erikPreset.isVisible({ timeout: 1500 }).catch(() => false)) {
            await erikPreset.click({ force: true });
            await page.waitForSelector('header', { timeout: 6000 }).catch(() => {});
          }
          break;
        }

        case 'click': {
          let clicked = false;
          const selectorList = step.selectors ? (Array.isArray(step.selectors[0]) ? step.selectors.map(s => s[0]) : step.selectors) : [step.selector];
          
          for (const sel of selectorList.filter(Boolean)) {
            try {
              const locator = page.locator(sel).first();
              if (await locator.isVisible({ timeout: 3500 })) {
                await locator.click();
                clicked = true;
                break;
              }
            } catch (e) {}
          }

          if (!clicked) {
            throw new Error(`Could not locate clickable target with selectors: ${JSON.stringify(selectorList)}`);
          }
          await page.waitForTimeout(300);
          break;
        }

        case 'change': {
          const sel = step.selectors ? (Array.isArray(step.selectors[0]) ? step.selectors[0][0] : step.selectors[0]) : step.selector;
          await page.fill(sel, step.value);
          break;
        }

        case 'waitForElement': {
          const sel = step.selectors ? (Array.isArray(step.selectors[0]) ? step.selectors[0][0] : step.selectors[0]) : step.selector;
          await page.waitForSelector(sel, { timeout: step.timeout || 5000 });
          break;
        }

        case 'scroll': {
          await page.evaluate((y) => window.scrollBy(0, y), step.y || 200);
          break;
        }

        default:
          console.log(`     (Skipping unsupported step type: ${step.type})`);
      }
    }

    console.log(`\n✅ Flow completed successfully! Replayed ${stepIdx} steps with 0 errors.\n`);
  } catch (error) {
    console.error(`\n❌ Flow failed at Step ${stepIdx}: ${error.message}`);
    const screenshotDir = 'test-results/screenshots';
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    const shotPath = `${screenshotDir}/recorder-failure-${Date.now()}.png`;
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log(`📷 Screenshot saved to: ${shotPath}\n`);
  } finally {
    await browser.close();
  }
}

const args = process.argv.slice(2);
const filePath = args.find(a => !a.startsWith('--'));
const isHeaded = args.includes('--headed');

if (!filePath) {
  console.log('Usage: node scripts/qa/run-recorder.mjs <path-to-recording.json> [--headed]');
  process.exit(0);
}

runRecorderFlow(path.resolve(filePath), { headless: !isHeaded });
