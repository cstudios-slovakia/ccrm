import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_URL = 'http://localhost:8085';
const SCREENSHOT_DIR = path.resolve('presentation/screenshots');

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function captureAll() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log("Launching Chrome...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 2 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1920,1080']
  });

  const page = await browser.newPage();

  async function takeShot(filename, description) {
    const fullPath = path.join(SCREENSHOT_DIR, filename);
    await delay(1200); // Allow smooth transitions and animations to complete
    await page.screenshot({ path: fullPath });
    console.log(`[✓] Saved: ${filename} - ${description}`);
  }

  // 1. Login Screen
  console.log("Navigating to login...");
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await delay(1000);
  await takeShot('01_login_screen.png', 'Login screen with Role-Based Presets');

  // Perform quick login as Admin (Erik)
  console.log("Logging in as Admin...");
  const loggedIn = await page.evaluate(() => {
    // Find button containing Erik
    const buttons = Array.from(document.querySelectorAll('button'));
    const erikBtn = buttons.find(b => b.textContent && b.textContent.includes('Erik') && b.textContent.includes('erik@crm.com'));
    if (erikBtn) {
      erikBtn.click();
      return true;
    }
    // Fallback: fill form
    const emailInput = document.querySelector('input[type="email"]');
    const passInput = document.querySelector('input[type="password"]');
    if (emailInput && passInput) {
      emailInput.value = 'erik@crm.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      passInput.value = 'password123';
      passInput.dispatchEvent(new Event('input', { bubbles: true }));
      const submitBtn = document.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.click();
      return true;
    }
    return false;
  });

  console.log("Quick login clicked:", loggedIn);
  await delay(3000);

  // Helper to switch tabs via sidebar or window hash
  async function switchTab(tabId) {
    console.log(`Switching to tab: ${tabId}`);
    await page.evaluate((id) => {
      // Try finding button in sidebar or start menu
      const navBtn = document.querySelector(`[data-nav-id="${id}"]`) ||
                     document.querySelector(`button[title*="${id}"]`) ||
                     document.querySelector(`button[aria-label*="${id}"]`);
      if (navBtn) {
        navBtn.click();
      } else {
        window.location.hash = id;
      }
    }, tabId);
    await delay(1500);
  }

  // 2. Task Dashboard (Default landing view)
  await switchTab('dashboard');
  await takeShot('02_task_dashboard.png', 'Task Dashboard with Kanban status columns and deadlines');

  // 3. Overview / Executive Analytics Dashboard
  await switchTab('overview');
  await takeShot('03_overview_dashboard.png', 'Executive Analytics Dashboard with KPIs and charts');

  // 4. Leads / Deals Pipeline
  await switchTab('leads');
  await takeShot('04_leads_pipeline_kanban.png', 'Leads / Deals Sales Pipeline Kanban board');

  // 5. Leads - Switch to Datagrid / Table view if view toggle exists
  const switchedToGrid = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const gridBtn = buttons.find(b => b.title?.toLowerCase().includes('tabuľk') || b.title?.toLowerCase().includes('grid') || b.title?.toLowerCase().includes('table') || b.innerHTML.includes('TableProperties') || b.innerHTML.includes('lucide-table'));
    if (gridBtn) {
      gridBtn.click();
      return true;
    }
    return false;
  });
  if (switchedToGrid) {
    await takeShot('05_leads_datagrid.png', 'Leads / Deals High-Density DataGrid Table');
  }

  // 6. Lead Detail Drawer
  await page.evaluate(() => {
    // Click on the first lead card or row
    const leadRow = document.querySelector('[data-lead-id]') ||
                    document.querySelector('.group.cursor-pointer') ||
                    document.querySelector('tr[data-id]') ||
                    document.querySelector('div[draggable="true"]');
    if (leadRow) leadRow.click();
  });
  await delay(1500);
  await takeShot('06_lead_detail_drawer.png', 'Lead Detail Drawer with 360° Timeline history');

  // Close drawer
  await page.keyboard.press('Escape');
  await delay(800);

  // 7. Clients Directory
  await switchTab('clients');
  await takeShot('07_clients_directory.png', 'Clients Master Directory with FinStat indicators');

  // 8. Client Detail Drawer
  await page.evaluate(() => {
    const clientCard = document.querySelector('[data-client-id]') ||
                       document.querySelector('.group.cursor-pointer') ||
                       document.querySelector('tr.hover\\:bg-slate-50') ||
                       document.querySelector('div.bg-white.rounded-2xl');
    if (clientCard) clientCard.click();
  });
  await delay(1500);
  await takeShot('08_client_detail_drawer.png', 'Client 360° Profile with FinStat register data');
  await page.keyboard.press('Escape');
  await delay(800);

  // 9. Warehouse Catalog
  await switchTab('warehouse');
  await takeShot('09_warehouse_catalog.png', 'Warehouse Catalog with SKU, EAN and WAP Valuation');

  // 10. Warehouse - New Goods Issue (Výdajka)
  await page.evaluate(() => {
    window.location.hash = '#warehouse/issue/new';
  });
  await delay(1800);
  await takeShot('10_warehouse_goods_issue_vyd.png', 'Full-Page Goods Issue (Výdajka) with Margin Calculator');

  // Back to warehouse movements
  await page.evaluate(() => {
    window.location.hash = '#warehouse/movements';
  });
  await delay(1500);
  await takeShot('11_warehouse_movements.png', 'Warehouse Movement Documents (PRI, VYD, PRE, INV)');

  // 12. Financial Management - Cash Flow
  await switchTab('financial');
  await takeShot('12_financial_management_cashflow.png', 'Financial Management Cash Flow and Ledger');

  // 13. Financial Management - Categories / Recurring Tab
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const catTab = buttons.find(b => b.textContent && (b.textContent.includes('Kategórie') || b.textContent.includes('Categories') || b.textContent.includes('Pravidlá') || b.textContent.includes('Recurring')));
    if (catTab) catTab.click();
  });
  await delay(1200);
  await takeShot('13_financial_categories_tree.png', 'Financial Hierarchical Category Tree and Recurring Rules');

  // 14. Projects Overview
  await switchTab('projects');
  await takeShot('14_projects_overview.png', 'Projects Lifecycle and Blueprints Hub');

  // 15. Project Detail / Gantt
  await page.evaluate(() => {
    const projectCard = document.querySelector('[data-project-id]') ||
                        document.querySelector('.group.cursor-pointer') ||
                        document.querySelector('div.bg-white.rounded-3xl');
    if (projectCard) projectCard.click();
  });
  await delay(1500);
  await takeShot('15_project_gantt_timeline.png', 'Project Detail with Interactive Gantt Chart and Milestones');

  // 16. Meeting Room & Voice AI
  await switchTab('meetings');
  await takeShot('16_meeting_room_voice.png', 'Meeting Room with Voice Recording and AI Action Items');

  // 17. RAG AI Assistant (Imbe)
  await switchTab('rag_ai');
  await takeShot('17_rag_ai_assistant.png', 'RAG AI Assistant (Imbe) with Enterprise Vector Context');

  // 18. Unified Entries / Custom Registries
  await page.evaluate(() => {
    // Look for unified entry tab or switch to first custom registry
    const ueLink = document.querySelector('[data-nav-id^="ue_"]') ||
                   document.querySelector('button[title*="Evidencia"]') ||
                   document.querySelector('button[title*="Certifik"]') ||
                   document.querySelector('button[title*="Vozidl"]');
    if (ueLink) ueLink.click();
    else window.location.hash = 'unified_entries';
  });
  await delay(1500);
  await takeShot('18_unified_entries_registries.png', 'Unified Custom Registries with Expiration Tracking');

  // 19. Email Client
  await switchTab('email');
  await takeShot('19_email_client.png', 'In-App Email Client with AI Summarization');

  // 20. Workflow Automation
  await switchTab('automation');
  await takeShot('20_workflow_automation.png', 'Visual Workflow Rule and Trigger Automation Builder');

  // 21. Social Media Hub
  await switchTab('social_media');
  await takeShot('21_social_media_hub.png', 'Social Media Hub and Multi-Channel Post Scheduler');

  // 22. Custom AI Dashboards
  await page.evaluate(() => {
    const dashLink = document.querySelector('[data-nav-id^="dash_"]');
    if (dashLink) dashLink.click();
  });
  await delay(1500);
  await takeShot('22_custom_ai_dashboard.png', 'Generative Custom AI Dashboard');

  // 23. Centralized Files Hub
  await switchTab('files');
  await takeShot('23_files_manager.png', 'Centralized File Hub with In-Browser Document Preview');

  // 24. Start Menu Navigation Drawer
  await page.evaluate(() => {
    const startBtn = document.querySelector('button[aria-label*="START"]') ||
                     document.querySelector('button.start-menu-btn') ||
                     Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('START'));
    if (startBtn) startBtn.click();
  });
  await delay(1500);
  await takeShot('24_start_menu_navigation.png', 'Windows-Style Start Menu Navigation Drawer');

  // Close Start Menu
  await page.keyboard.press('Escape');
  await delay(800);

  // 25. System Settings & RBAC Permissions
  await switchTab('settings');
  await takeShot('25_settings_rbac_roles.png', 'Role-Based Access Control and System Settings');

  // 26. Update Notes / Release Showcase
  await switchTab('updates');
  await takeShot('26_update_notes.png', 'Interactive Release Notes and System Updates Showcase');

  console.log("\n==========================================");
  console.log("All screenshots captured successfully!");
  console.log("Saved in:", SCREENSHOT_DIR);
  console.log("==========================================");

  await browser.close();
}

captureAll().catch(e => {
  console.error("Capture failed:", e);
  process.exit(1);
});
