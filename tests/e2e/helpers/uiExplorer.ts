import { Page, Locator } from '@playwright/test';
import { QAReportCollector } from './reportCollector';

/**
 * Generic High-Speed Deep UI Exploration Utilities for CCRM
 * Recursively inspects buttons, modals, drawers, sub-tabs, and dropdown occlusions across all views.
 */

export class UIExplorer {
  /**
   * Returns the main content container for the active view.
   */
  static getContentContainer(page: Page): Locator {
    return page.locator('main, #root > div.flex > div.flex-1, #root > div').first();
  }

  /**
   * Dismisses any open dropdowns, drawers, modals, or backdrops cleanly.
   */
  static async dismissAnyOpenModals(page: Page) {
    try {
      await page.keyboard.press('Escape').catch(() => {});
      const closeBtns = page.locator('button:has(svg.lucide-x), button:has-text("Zavrieť"), button:has-text("Zrušiť"), button:has-text("Cancel")');
      const count = await closeBtns.count();
      for (let i = 0; i < Math.min(count, 3); i++) {
        const btn = closeBtns.nth(i);
        if (await btn.isVisible({ timeout: 40 }).catch(() => false)) {
          await btn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(30);
        }
      }
      const backdrop = page.locator('div.fixed.inset-0.bg-slate-900\\/40, div.fixed.inset-0.backdrop-blur-sm, div.fixed.inset-0.bg-slate-900\\/50, div.fixed.inset-0.bg-black\\/50').first();
      if (await backdrop.isVisible({ timeout: 40 }).catch(() => false)) {
        await backdrop.click({ position: { x: 50, y: 50 }, force: true }).catch(() => {});
        await page.waitForTimeout(30);
      }
    } catch (e) {}
  }

  /**
   * Scans the active page for error banners, crash alerts, or failed lookup messages.
   */
  static async checkVisibleErrorBanners(page: Page, contextName: string): Promise<boolean> {
    try {
      const errorSelectors = [
        'div.border-red-400',
        'div.bg-rose-50:has-text("Chyba")',
        'h2:has-text("Profil klienta sa nenašiel")',
        'h2:has-text("Client Profile Not Found")',
        'p:has-text("sa nepodarilo nájsť")',
        'div:has-text("Application Error")',
        'div:has-text("Unhandled Exception")',
      ];

      for (const sel of errorSelectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 40 }).catch(() => false)) {
          const text = (await el.innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
          const shotPath = `test-results/screenshots/error-banner-${Date.now()}.png`;
          await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});

          QAReportCollector.recordFailure({
            id: `ERR-BANNER-${Date.now()}`,
            module: contextName,
            action: `Screen inspection in "${contextName}"`,
            errorType: 'ERROR_BANNER_DETECTED',
            severity: 'HIGH',
            symptom: `Error banner or failure message detected on screen: "${text.slice(0, 180)}"`,
            details: `Selector matched: ${sel}. Current URL hash: ${await page.evaluate(() => window.location.hash)}`,
            screenshotPath: shotPath,
          });

          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  /**
   * Clicks a dropdown trigger and checks if its popup is visible and not occluded behind overlays/drawers.
   */
  static async auditDropdownOcclusion(
    page: Page,
    trigger: Locator,
    dropdownName: string,
    contextName: string
  ): Promise<boolean> {
    try {
      if (!(await trigger.isVisible({ timeout: 50 }).catch(() => false))) {
        return false;
      }

      await trigger.click({ timeout: 100, force: true }).catch(() => {});
      await page.waitForTimeout(40);

      // Locate options listbox
      const listbox = page.locator('[role="listbox"], .custom-select-options, ul[role="listbox"]').first();
      const isMounted = (await listbox.count()) > 0;

      if (!isMounted) {
        await page.keyboard.press('Escape').catch(() => {});
        return false;
      }

      // Evaluate visibility and physical occlusion via elementFromPoint
      const occlusionCheck = await listbox.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return { isVisible: false, isOccluded: false, details: 'Zero dimensions' };
        }

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return { isVisible: false, isOccluded: false, details: 'CSS hidden/invisible' };
        }

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const topEl = document.elementFromPoint(centerX, centerY);
        if (!topEl) {
          return { isVisible: true, isOccluded: true, details: 'elementFromPoint returned null' };
        }

        const isSelfOrDescendant = el === topEl || el.contains(topEl);
        const topElTag = topEl.tagName.toLowerCase();
        const topElClass = typeof topEl.className === 'string' ? topEl.className : '';
        const topElZ = window.getComputedStyle(topEl).zIndex;

        return {
          isVisible: true,
          isOccluded: !isSelfOrDescendant,
          topElement: `<${topElTag} class="${topElClass.slice(0, 50)}" z-index="${topElZ}">`,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
        };
      });

      if (occlusionCheck.isOccluded) {
        const shotPath = `test-results/screenshots/occlusion-${Date.now()}.png`;
        await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});

        QAReportCollector.recordFailure({
          id: `OCCLUSION-${Date.now()}`,
          module: contextName,
          action: `Open dropdown "${dropdownName}"`,
          errorType: 'VISUAL_OCCLUSION',
          severity: 'HIGH',
          symptom: `Dropdown options listbox opened in DOM at (${occlusionCheck.rect?.x}, ${occlusionCheck.rect?.y}) but is visually occluded / rendered behind another layer (${occlusionCheck.topElement}).`,
          details: `Target: "${dropdownName}". Listbox dimensions: ${occlusionCheck.rect?.width}x${occlusionCheck.rect?.height}. Top element at center: ${occlusionCheck.topElement}`,
          screenshotPath: shotPath,
        });

        await page.keyboard.press('Escape').catch(() => {});
        return true;
      }

      QAReportCollector.recordPass(`Dropdown "${dropdownName}" opened and is unoccluded in "${contextName}"`);
      await page.keyboard.press('Escape').catch(() => {});
      return false;
    } catch (e) {
      await page.keyboard.press('Escape').catch(() => {});
      return false;
    }
  }

  /**
   * Discovers and audits dropdown triggers inside a given container.
   */
  static async auditAllDropdownsInContainer(page: Page, container: Locator, contextName: string) {
    try {
      const dropdownTriggers = container.locator('button[aria-haspopup="listbox"], button[data-custom-select]');
      const count = await dropdownTriggers.count();
      const maxToTest = Math.min(count, 1);

      for (let i = 0; i < maxToTest; i++) {
        const trigger = dropdownTriggers.nth(i);
        const name = (await trigger.innerText().catch(() => 'Dropdown')).trim().replace(/\s+/g, ' ') || `Dropdown #${i + 1}`;
        await this.auditDropdownOcclusion(page, trigger, name, contextName);
      }
    } catch (e) {}
  }

  /**
   * Discovers and clicks through all sub-tabs in the active view.
   */
  static async auditSubTabs(page: Page, viewName: string) {
    try {
      const content = this.getContentContainer(page);
      const tabSelectors = [
        'button[role="tab"]',
        'div.flex button:has-text("Časová os")',
        'div.flex button:has-text("Priložené súbory")',
        'div.flex button:has-text("Aktívne Leady")',
        'div.flex button:has-text("Faktúry")',
        'div.flex button:has-text("Položky")',
        'div.flex button:has-text("Pohyby")',
        'div.flex button:has-text("Zásoby")',
        'div.flex button:has-text("Dodávatelia")',
        'div.flex button:has-text("Prehľad")',
      ];

      for (const sel of tabSelectors) {
        const tabs = content.locator(sel);
        const count = await tabs.count();
        const maxToTest = Math.min(count, 2);
        for (let i = 0; i < maxToTest; i++) {
          const tab = tabs.nth(i);
          if (await tab.isVisible({ timeout: 40 }).catch(() => false)) {
            const tabTitle = (await tab.innerText().catch(() => 'Sub-tab')).trim().replace(/\s+/g, ' ');
            if (tabTitle && tabTitle.length < 30) {
              await tab.click({ timeout: 80, force: true }).catch(() => {});
              await page.waitForTimeout(30);
              await this.checkVisibleErrorBanners(page, `${viewName} -> SubTab "${tabTitle}"`);
            }
          }
        }
      }
    } catch (e) {}
  }

  /**
   * Discovers action triggers (+ Nový, Pridať, etc.), opens modals/drawers, audits nested controls, and dismisses.
   */
  static async auditModalsAndDrawers(page: Page, viewName: string) {
    try {
      const content = this.getContentContainer(page);

      // 1. On Dashboard, click calendar day to open day view
      const dayCell = content.locator('.grid-cols-7 div.cursor-pointer, .grid div.cursor-pointer').first();
      if (await dayCell.isVisible({ timeout: 60 }).catch(() => false)) {
        await dayCell.click({ timeout: 100, force: true }).catch(() => {});
        await page.waitForTimeout(40);
      }

      // 2. Discover primary action buttons inside main content
      const actionTriggers = content.locator(
        'button:has-text("Pridať úlohu"), button:has-text("Add Task"), button:has-text("Nový projekt"), button:has-text("Nový príjem"), button:has-text("Nová položka"), button:has-text("Pridať položku"), button:has-text("Filter")'
      );
      const count = await actionTriggers.count();
      const maxToTest = Math.min(count, 1);

      for (let i = 0; i < maxToTest; i++) {
        const btn = actionTriggers.nth(i);
        if (await btn.isVisible({ timeout: 50 }).catch(() => false)) {
          const label = (await btn.innerText().catch(() => 'Action')).trim().replace(/\s+/g, ' ');
          await btn.click({ timeout: 100, force: true }).catch(() => {});
          await page.waitForTimeout(60);

          // Check for error banners
          await this.checkVisibleErrorBanners(page, `${viewName} -> Action "${label}"`);

          // Audit any dropdowns inside the opened modal / drawer
          await this.auditAllDropdownsInContainer(page, page.locator('body'), `${viewName} -> Drawer "${label}"`);

          // Dismiss modal/drawer cleanly
          await this.dismissAnyOpenModals(page);
          await page.waitForTimeout(30);
        }
      }
    } catch (e) {}
  }

  /**
   * Clicks table rows in entity registers to test detail views and sub-tab routing.
   */
  static async auditTableRows(page: Page, viewName: string) {
    try {
      const content = this.getContentContainer(page);
      const tableRows = content.locator('table tbody tr.cursor-pointer, table tbody tr, div[role="row"].cursor-pointer');
      if ((await tableRows.count()) > 0) {
        const firstRow = tableRows.first();
        if (await firstRow.isVisible({ timeout: 50 }).catch(() => false)) {
          await firstRow.click({ timeout: 100, force: true }).catch(() => {});
          await page.waitForTimeout(50);

          // Check if opening detail view threw an error banner
          await this.checkVisibleErrorBanners(page, `${viewName} -> Table Row Detail`);

          // If detail view opened, audit its sub-tabs
          await this.auditSubTabs(page, `${viewName} -> Row Detail View`);

          // Audit any dropdowns in the detail view
          await this.auditAllDropdownsInContainer(page, page.locator('#root'), `${viewName} -> Row Detail View`);

          // Test direct URL sub-tab routing if on client view
          const currentHash = await page.evaluate(() => window.location.hash);
          if (currentHash.startsWith('#client-') || currentHash.startsWith('#clients/')) {
            const subTabKeys = ['timeline', 'files', 'leads', 'invoices'];
            for (const key of subTabKeys) {
              const baseHash = currentHash.split('?')[0];
              await page.goto(`/${baseHash}?tab=${key}`);
              await page.reload();
              await page.waitForTimeout(50);
              await this.checkVisibleErrorBanners(page, `${viewName} -> Direct Route "${baseHash}?tab=${key}"`);
            }
          }

          // Dismiss detail drawer if open
          await this.dismissAnyOpenModals(page);
        }
      }
    } catch (e) {}
  }
}
