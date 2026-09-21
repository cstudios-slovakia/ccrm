import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:8085';
const BASE_OUTPUT_DIR = '/Users/erik/.gemini/antigravity-ide/brain/a258611f-92ca-468c-bce6-1a6c41cbcb63';

const RESOLUTIONS = [
  { width: 868, height: 950, folder: 'screenshots_868_hu' },
  { width: 410, height: 880, folder: 'screenshots_410_hu' },
  { width: 375, height: 812, folder: 'screenshots_375_hu' },
  { width: 320, height: 700, folder: 'screenshots_320_hu' },
];

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  const targetWidthArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  const resolutionsToRun = targetWidthArg 
    ? RESOLUTIONS.filter(r => r.width === targetWidthArg)
    : RESOLUTIONS;

  console.log(`Starting responsive capture for resolutions:`, resolutionsToRun.map(r => `${r.width}px`).join(', '));

  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });

  for (const res of resolutionsToRun) {
    const screenshotDir = path.join(BASE_OUTPUT_DIR, res.folder);
    fs.mkdirSync(screenshotDir, { recursive: true });

    console.log(`\n========================================`);
    console.log(`📸 Capturing all views at ${res.width}px x ${res.height}px...`);
    console.log(`========================================`);

    const context = await browser.newContext({
      viewport: { width: res.width, height: res.height },
      deviceScaleFactor: 2
    });

    const page = await context.newPage();

    async function takeShot(filename, label) {
      const fullPath = path.join(screenshotDir, filename);
      await delay(1200);
      await page.screenshot({ path: fullPath });
      console.log(`[✓ ${res.width}px] Saved (${filename}): ${label}`);
    }

    console.log("Navigating to app...");
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await delay(800);

    // Set Hungarian language in localStorage
    await page.evaluate(() => {
      localStorage.setItem('crm_language', 'hu');
    });

    // Login as Erik (Admin)
    console.log("Logging in as Admin...");
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const erikBtn = buttons.find(b => b.textContent && b.textContent.includes('Erik') && b.textContent.includes('erik@crm.com'));
      if (erikBtn) {
        erikBtn.click();
        return;
      }
      const emailInput = document.querySelector('input[type="email"]');
      const passInput = document.querySelector('input[type="password"]');
      if (emailInput && passInput) {
        emailInput.value = 'erik@crm.com';
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        passInput.value = 'password123';
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.click();
      }
    });

    await delay(2500);

    // Ensure Hungarian language is active
    await page.evaluate(() => {
      localStorage.setItem('crm_language', 'hu');
      const langBtns = Array.from(document.querySelectorAll('button'));
      const huBtn = langBtns.find(b => b.textContent?.trim() === 'HU' || b.getAttribute('title')?.includes('Magyar'));
      if (huBtn) huBtn.click();
    });
    await delay(1200);

    async function goToRoute(hash) {
      console.log(`Navigating to #${hash}...`);
      await page.evaluate((h) => {
        window.location.hash = h;
      }, hash);
      await delay(1500);
    }

    // 1. Dashboard (Task Board)
    await goToRoute('dashboard');
    await takeShot('01_dashboard.png', 'Task Dashboard');

    // 2. Overview (Executive Analytics Dashboard)
    await goToRoute('overview');
    await takeShot('02_overview.png', 'Executive Overview Analytics');

    // 3. Projects View
    await goToRoute('projects');
    await takeShot('03_projects_list.png', 'Projects Management List');

    // 3b. Project Details Drawer
    await page.evaluate(() => {
      const firstProject = document.querySelector('tr[data-project-id], [data-project-card], table tbody tr');
      if (firstProject) {
        const clickTarget = firstProject.querySelector('button, a, td') || firstProject;
        clickTarget.click();
      }
    });
    await delay(1000);
    await takeShot('03b_project_detail_drawer.png', 'Project Detail Drawer');
    await page.evaluate(() => {
      window.location.hash = 'projects';
    });
    await delay(500);

    // 4. RAG AI Assistant
    await goToRoute('rag_ai');
    await takeShot('04_rag_ai.png', 'RAG AI Assistant');

    // 5. SAI Swarm Simulation
    await goToRoute('sai');
    await takeShot('05_sai_module.png', 'SAI Swarm Market Simulation');

    // 6. Leads (Pipeline Kanban)
    await goToRoute('leads');
    await takeShot('06_leads_kanban.png', 'Leads Pipeline Kanban');

    // 6b. Leads (Datagrid/Table)
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const gridBtn = buttons.find(b => 
        b.title?.toLowerCase().includes('táblázat') || 
        b.title?.toLowerCase().includes('grid') || 
        b.title?.toLowerCase().includes('table') || 
        b.title?.toLowerCase().includes('tabuľk') ||
        b.innerHTML.includes('lucide-table') ||
        b.innerHTML.includes('lucide-table-properties')
      );
      if (gridBtn) gridBtn.click();
    });
    await delay(1000);
    await takeShot('06b_leads_datagrid.png', 'Leads Datagrid Table');

    // 7. Clients Directory
    await goToRoute('clients');
    await takeShot('07_clients_directory.png', 'Clients Directory');

    // 7b. Client Profile View
    await page.evaluate(() => {
      const firstClient = document.querySelector('table tbody tr, [data-client-card]');
      if (firstClient) {
        const clickTarget = firstClient.querySelector('button, a, td') || firstClient;
        clickTarget.click();
      }
    });
    await delay(1000);
    await takeShot('07b_client_profile.png', 'Client Profile');
    await page.evaluate(() => {
      window.location.hash = 'clients';
    });
    await delay(500);

    // 8. Invoices & Price Offers
    await goToRoute('invoices');
    await takeShot('08_invoices_offers.png', 'Invoices & Price Offers');

    // 9. Warehouse & Inventory
    await goToRoute('warehouse');
    await takeShot('09_warehouse.png', 'Warehouse & Inventory');

    // 10. Financial Management (Cashflow)
    await goToRoute('financial');
    await takeShot('10_financial_cashflow.png', 'Financial Management Cashflow');

    // 11. Meeting Room
    await goToRoute('meetings');
    await takeShot('11_meetings.png', 'Meeting Room');

    // 12. Files & Documents Vault
    await goToRoute('files');
    await takeShot('12_files_vault.png', 'Files & Document Storage');

    // 13. Email Client
    await goToRoute('email');
    await takeShot('13_email_client.png', 'Email Client');

    // 14. Automation Workflows
    await goToRoute('automation');
    await takeShot('14_automation.png', 'Automation Workflows');

    // 15. Social Media Planner
    await goToRoute('social_media');
    await takeShot('15_social_media.png', 'Social Media Planner');

    // 16. Settings
    await goToRoute('settings');
    await takeShot('16_settings.png', 'System Settings');

    // 17. Personal Settings
    await goToRoute('user-settings');
    await takeShot('17_personal_settings.png', 'Personal Settings');

    // 18. Updates & Release Notes
    await goToRoute('updates');
    await takeShot('18_updates.png', 'Product Updates & Release Notes');

    await context.close();
  }

  await browser.close();
  console.log("\n All screenshots captured successfully across all resolutions!");
}

run().catch(err => {
  console.error("Capture failed:", err);
  process.exit(1);
});
