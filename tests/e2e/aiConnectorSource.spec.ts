import { expect, test } from '@playwright/test';
import { gotoView, startSession } from './helpers/appDriver';

const LLM_CONNECTORS = [
  {
    id: 'conn-claude',
    name: 'Claude Production',
    connectorType: 'claude_api',
    agentModel: 'claude-sonnet-4-5',
    isActive: true,
    hasCredentials: true,
  },
  {
    id: 'conn-openai',
    name: 'OpenAI Corporate',
    connectorType: 'openai_api',
    agentModel: 'gpt-5',
    isActive: true,
    hasCredentials: true,
  },
];

test.describe('Settings -> AI source from existing LLM connector', () => {
  test('selecting a non-OpenAI or OpenAI connector persists via sync, updates fallback/vector visibility, and enables AI features', async ({ page }) => {
    await startSession(page);

    const savedConfigs: Record<string, unknown>[] = [];
    page.on('request', (req) => {
      if (!req.url().includes('/sync.php') || req.method() !== 'POST') return;
      try {
        const body = req.postDataJSON() as { settings?: { integrationsConfig?: Record<string, unknown> } };
        if (body?.settings?.integrationsConfig) {
          savedConfigs.push(body.settings.integrationsConfig);
        }
      } catch {
        // ignore non-JSON
      }
    });

    await page.route('**/api/company_mailboxes.php**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('action') === 'llm_sources') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, connectors: LLM_CONNECTORS }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, mailboxes: [], userMailboxes: [], connectors: [] }),
      });
    });

    await gotoView(page, '#settings/integrations/ai');

    const manualTab = page.getByRole('tab', { name: /Manuálne API kľúče|Manual API Keys/ });
    const connectorTab = page.getByRole('tab', { name: /Existujúci LLM konektor|Existing LLM Connector/ });
    await expect(manualTab).toHaveAttribute('aria-selected', 'true');
    await expect(connectorTab).toHaveAttribute('aria-selected', 'false');

    await connectorTab.click();
    await expect(connectorTab).toHaveAttribute('aria-selected', 'true');

    // Select the Claude API connector (non-OpenAI)
    await page.getByTestId('ai-connector-select').locator('button[aria-haspopup="listbox"]').click();
    await page.getByRole('option', { name: /Claude Production/ }).click();

    await expect.poll(() => savedConfigs[savedConfigs.length - 1], { timeout: 10_000 }).toMatchObject({
      aiSourceMode: 'connector',
      aiConnectorId: 'conn-claude',
      aiConnectorType: 'claude_api',
      aiConnectorName: 'Claude Production',
      openAiKey: '',
    });

    await expect(page.getByTestId('ai-connector-status')).toContainText('Claude Production');
    await expect(page.getByTestId('ai-connector-status')).toContainText('claude-sonnet-4-5');
    await expect(page.getByTestId('ai-fallback-openai-key')).toBeVisible();
    await expect(page.getByText('Backend vektorovej databázy')).toHaveCount(0);

    // Reload via #rag_ai: AiKeyBanner must stay suppressed when an LLM connector is active
    await gotoView(page, '#rag_ai');
    await expect(page.getByText(/OpenAI API key is missing|Chýba OpenAI API kľúč|Hiányzik az OpenAI API kulcs/)).toHaveCount(0);

    // Reload via #meetings/new, save a note, open its detail view, and verify Make AI Summary is enabled
    await gotoView(page, '#meetings/new');
    await page.getByPlaceholder(/Názov dokumentu|Document \/ Meeting Title|Dokumentum/).fill('Testovacia porada');
    await page.getByRole('button', { name: /^Uložiť$|^Save$|^Mentés$/ }).click();
    await page.getByRole('button', { name: /Späť na zoznam|Back to List/ }).click();
    await page.getByText('Testovacia porada').first().click();
    const summaryBtn = page.getByRole('button', { name: /Vytvoriť AI zhrnutie|Make AI Summary/ });
    await expect(summaryBtn).toBeVisible();
    await expect(summaryBtn).toBeEnabled();
    await expect(page.getByText(/AI asistent neaktívny|AI Assistant Inactive/)).toHaveCount(0);

    // Return to Settings -> AI integration and verify persistence + OpenAI connector unlocks Vector DB
    await gotoView(page, '#settings/integrations/ai');
    await expect(connectorTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('ai-connector-status')).toContainText('Claude Production');

    await page.getByTestId('ai-connector-select').locator('button[aria-haspopup="listbox"]').click();
    await page.getByRole('option', { name: /OpenAI Corporate/ }).click();

    await expect.poll(() => savedConfigs[savedConfigs.length - 1], { timeout: 10_000 }).toMatchObject({
      aiSourceMode: 'connector',
      aiConnectorId: 'conn-openai',
      aiConnectorType: 'openai_api',
      aiConnectorName: 'OpenAI Corporate',
      openAiKey: '',
    });

    await expect(page.getByTestId('ai-openai-connector-all-modalities')).toBeVisible();
    await expect(page.getByTestId('ai-fallback-openai-key')).toHaveCount(0);
    await expect(page.getByText('Backend vektorovej databázy')).toBeVisible();
  });
});
