import type { Page } from '@playwright/test';
import { buildSyncPayload, TEST_USER } from './fixture';

/**
 * What WAAI would have pushed into CCRM (docs/WAAI-INTEGRATION.md §4.8): paired chats, number checks,
 * a WhatsApp timeline entry and a task extracted from a chat. Seeded per spec and not in the shared
 * fixture on purpose: a chip leads to the WhatsApp module, which the crawler would click into a page
 * that does not exist before phase 7.
 */

export const waLink = (conversationRef: string, entityId: string, extra: Record<string, unknown> = {}) => ({
  conversationRef,
  entityType: 'lead',
  entityId,
  source: 'auto',
  title: 'Marek Kováč',
  isGroup: false,
  phone: '421905123456',
  ownerUserId: TEST_USER.id,
  path: `/c/${conversationRef}`,
  lastMessageAt: '2026-10-28 14:03:00',
  ...extra,
});

export interface WhatsAppSeed {
  links?: object[];
  numbers?: object[];
  withTimelineEvent?: boolean;
  withTask?: boolean;
}

/** The fixture dataset plus what WAAI would have pushed. Registered after startSession, so it answers first. */
export async function seedWhatsApp(page: Page, seed: WhatsAppSeed) {
  const pushed = new Map<string, Record<string, unknown>>();
  await page.route('**/sync.php**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      const payload = buildSyncPayload();
      const leads = payload.leads.map((l) =>
        l.id === 'client-kovac' && seed.withTimelineEvent
          ? {
              ...l,
              timeline: [
                ...l.timeline,
                {
                  id: 'ev-wa-1',
                  type: 'whatsapp',
                  timestamp: '2026-10-28 14:03',
                  title: 'Úloha z WhatsAppu: Zaslať cenovú ponuku',
                  content: 'Do piatku · zodpovedný: Erik',
                  externalUrl: '/c/conv-1?m=msg-9',
                },
              ],
            }
          : l,
      );
      const tasks = seed.withTask
        ? [
            ...payload.tasks,
            {
              id: 'task-wa-1', title: 'Zaslať cenovú ponuku na kuchyňu', status: 'New', priority: 'medium',
              startDate: '2026-10-29', deadline: '2026-11-05', deadlineTime: '09:00', owner: 'Erik', createdBy: 'Erik',
              assignedUsers: ['Erik'], relatedLeadId: 'client-kovac', externalSource: 'waai',
              externalUrl: '/c/conv-1?m=msg-9', dueInferred: true,
            },
          ]
        : payload.tasks;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...payload, leads, tasks, whatsappLinks: seed.links ?? [], whatsappNumbers: seed.numbers ?? [] }),
      });
    }
    try {
      const body = request.postDataJSON() as { projects?: Record<string, unknown>[] };
      for (const p of body?.projects ?? []) pushed.set(String(p.id), p);
    } catch {
      /* not JSON */
    }
    await route.fallback();
  });
  return pushed;
}

