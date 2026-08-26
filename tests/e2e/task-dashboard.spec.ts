import { test, expect } from '@playwright/test';
import { seedAuthSession, ensureAuthenticated } from './helpers/auth';
import { QAReportCollector } from './helpers/reportCollector';

test.describe('Task Dashboard & Modal QA', () => {
  test.beforeEach(async ({ page }) => {
    await seedAuthSession(page);
    await ensureAuthenticated(page, '#dashboard');
  });

  test.afterAll(() => {
    QAReportCollector.generateMarkdownReport();
  });

  test('Verify Task Creation Drawer & "Čas termínu" Dropdown Interactivity', async ({ page }) => {
    // 1. Ensure Dashboard is loaded
    const dashboardRoot = page.locator('#root');
    await expect(dashboardRoot).toBeVisible({ timeout: 10000 });
    QAReportCollector.recordPass('Dashboard view loaded successfully');

    // 2. Open Day View by clicking today's column in the calendar grid
    const todayCell = page.locator('.grid div.cursor-pointer, .grid div:has-text("—")').first();
    if (await todayCell.isVisible().catch(() => false)) {
      await todayCell.click();
      await page.waitForTimeout(300);
      QAReportCollector.recordPass('Selected calendar day cell');
    }

    // 3. Locate and click "Add Task" / "Pridať úlohu" button
    const addTaskBtn = page.locator('button:has-text("Pridať úlohu"), button:has-text("Add Task"), button:has-text("Új feladat")').first();
    await expect(addTaskBtn).toBeVisible({ timeout: 5000 });
    await addTaskBtn.click();
    QAReportCollector.recordPass('Clicked "Add Task" button');

    // 4. Verify Task Modal / Drawer opened
    const drawerHeading = page.locator('h2:has-text("Vytvoriť novú úlohu"), h2:has-text("Create New Task"), h2:has-text("Új feladat")').first();
    await expect(drawerHeading).toBeVisible({ timeout: 5000 });
    QAReportCollector.recordPass('Task Creation Drawer opened');

    // 5. Fill in required task title
    const titleInput = page.locator('input[type="text"]').first();
    if (await titleInput.isVisible()) {
      await titleInput.fill('QA Automated Test Task');
      QAReportCollector.recordPass('Filled Task Title');
    }

    // 6. Test "Čas termínu" (Deadline Time) dropdown
    const deadlineLabel = page.locator('label:has-text("Čas termínu"), label:has-text("Deadline Time"), label:has-text("Határidő időpontja")').first();
    await expect(deadlineLabel).toBeVisible({ timeout: 5000 });

    // Locate the CustomSelect trigger button right next to the label
    const timePickerContainer = deadlineLabel.locator('..');
    const dropdownTrigger = timePickerContainer.locator('button[aria-haspopup="listbox"], button').first();
    await expect(dropdownTrigger).toBeVisible();

    // Click to open dropdown
    await dropdownTrigger.click();
    await page.waitForTimeout(400); // Allow portal mounting and animation

    // 7. Visual & DOM Occlusion Check on the opened dropdown listbox
    const listboxPanel = page.locator('[role="listbox"]');
    const isListboxMounted = (await listboxPanel.count()) > 0;
    
    let isVisible = false;
    let box = null;
    if (isListboxMounted) {
      isVisible = await listboxPanel.first().isVisible().catch(() => false);
      box = await listboxPanel.first().boundingBox();
    }

    // Check z-index occlusion against drawer (z-[100000])
    const isOccludedByZIndex = isListboxMounted && (await page.evaluate(() => {
      const listbox = document.querySelector('[role="listbox"]');
      if (!listbox) return false;
      const rect = listbox.getBoundingClientRect();
      const elemAtPoint = document.elementFromPoint(rect.left + 15, rect.top + 15);
      return elemAtPoint !== listbox && !listbox.contains(elemAtPoint);
    }));

    const screenshotPath = 'test-results/screenshots/task-dropdown-defect.png';

    // If listbox is occluded behind drawer, has 0 dimensions, or is not interactable
    if (!isListboxMounted || !isVisible || !box || box.width === 0 || box.height === 0 || isOccludedByZIndex) {
      await page.screenshot({ path: screenshotPath, fullPage: true });

      QAReportCollector.recordFailure({
        id: 'TASK-DROPDOWN-001',
        module: 'Task Dashboard / Creation Drawer',
        action: 'Open "Čas termínu" (Deadline Time) dropdown in Task Creation drawer',
        errorType: 'VISUAL_DEFECT',
        severity: 'HIGH',
        symptom: 'When clicking the "Čas termínu" dropdown, the button toggles aria-expanded, but the options listbox is invisible to the user because it is occluded / rendered behind the task creation drawer (portal z-index mismatch).',
        expected: 'The dropdown options panel opens in front of the drawer, displaying preset time options (e.g. 09:00, 10:00, 12:00, Custom).',
        actual: `Listbox mounted: ${isListboxMounted}, Visible: ${isVisible}, Occluded behind drawer: ${isOccludedByZIndex}, Bounding box: ${JSON.stringify(box)}`,
        screenshotPath,
        codeLocation: 'src/components/TaskDashboardView.tsx:2959 (z-[100000]) vs src/components/ui/CustomSelect.tsx:221 (z-[1000])',
        proposedFix: `Increase the portal z-index in \`CustomSelect.tsx\` line 221 from \`z-[1000]\` to \`z-[100001]\` so custom dropdown portals always render above modals and drawers.`,
      });

      console.warn('⚠️ [QA Detected Defect] "Čas termínu" dropdown is occluded / invisible after click!');
      expect(!isOccludedByZIndex && isVisible, 'Dropdown "Čas termínu" options panel must be visible and not occluded').toBe(true);
    } else {
      QAReportCollector.recordPass('Dropdown "Čas termínu" opened and options are fully visible');
    }
  });
});
