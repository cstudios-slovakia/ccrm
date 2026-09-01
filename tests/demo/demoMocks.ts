import type { Page } from '@playwright/test';
import {
  DEMO_USER,
  DASHBOARD_QUERY_RESULTS,
  RAG_AGENTS,
  RAG_HISTORY,
  WORKFLOWS,
  WORKFLOW_LOGS,
  buildSyncPayload,
} from './demoData';

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const LICENSE = {
  configured: true, status: 'active', valid: true,
  keyMasked: 'CCRM-****-****-DEMO', expiresAt: '2099-12-31', daysRemaining: 3650,
  warnDays: 30, maxUsers: 25, seatsUsed: 4, customer: 'Rekonstav s.r.o.', plan: 'standard',
  activatedAt: '2026-01-01 09:00:00', lastCheckAt: '2026-01-01 09:00:00', lastAttemptAt: '2026-01-01 09:00:00',
  lastError: null, offlineDays: 0, updatesAllowed: true, updatesBlockedReason: null,
};

/**
 * Answers one `/api/*.php` call with demo content.
 *
 * Everything under `/api/` is deliberately handled by a single route rather than
 * one `page.route()` per endpoint: Playwright resolves overlapping patterns by
 * registration order, and the catch-all that keeps a missing PHP backend quiet
 * kept swallowing the specific handlers — the automation module rendered its
 * "no workflows yet" empty state with a perfectly good workflow list mocked
 * three lines above it. One router, one switch, no precedence to reason about.
 */
function answerApi(pathname: string, search: URLSearchParams, method: string, body: any) {
  const endpoint = pathname.split('/').pop() || '';
  const action = search.get('action') || body?.action || '';

  switch (endpoint) {
    case 'login.php':
      return { success: true, user: DEMO_USER };

    case 'license.php':
      return { success: true, license: LICENSE };

    /* 07 — RAG AI & Agenti. A GET without `action` is the chat-history request. */
    case 'chat_rag.php':
      if (action === 'get_agents') return { success: true, agents: RAG_AGENTS };
      if (method === 'GET') return { success: true, messages: RAG_HISTORY };
      return { success: true, reply: '', message: '' };

    /* 08 — Automatizácie & Siete. */
    case 'workflows.php':
      if (action === 'list') return { success: true, workflows: WORKFLOWS };
      if (action === 'get_settings') return { success: true, settings: { cronToken: 'd4f1a9c73b8e42f0a15c9e77b2d61a08' } };
      if (action === 'logs') return { success: true, logs: WORKFLOW_LOGS };
      return { success: true };

    /* 09 — one answer per widget query action. */
    case 'dashboard_query.php':
      return { success: true, data: DASHBOARD_QUERY_RESULTS[action] ?? [] };

    case 'mail_broker.php':
      return { success: true, emails: [], total: 0, folders: { INBOX: 0, Sent: 0, Trash: 0 } };

    /* Anything else: succeed quietly, so a missing PHP backend never paints an
       error state into a screenshot. */
    default:
      return { success: true, data: [], items: [], agents: [], accounts: [], posts: [] };
  }
}

/** A valid, silent, mono 8 kHz WAV of `seconds` length. */
function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
  const buf = Buffer.alloc(44 + samples);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); // PCM header size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28); // byte rate
  buf.writeUInt16LE(1, 32); // block align
  buf.writeUInt16LE(8, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(samples, 40);
  buf.fill(128, 44); // 8-bit PCM silence is mid-scale, not zero
  return buf;
}

/** Serves the presentation dataset in place of the PHP backend. */
export async function installDemoBackend(page: Page) {
  await page.route('**/sync.php**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill(json(buildSyncPayload()));
    return route.fulfill(json({ success: true, serverTime: new Date().toISOString(), dataVersion: 1 }));
  });

  await page.route('**/api/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    let body: any = null;
    try {
      body = JSON.parse(req.postData() || 'null');
    } catch {
      /* form-encoded or empty — `action` then comes from the query string */
    }
    return route.fulfill(json(answerApi(url.pathname, url.searchParams, req.method(), body)));
  });

  /* Meeting recordings. Without a body that actually decodes, the player fails
     to load and raises a "recording could not be loaded" toast across the shot.
     A silent WAV of the right length gives a real, seekable timeline instead. */
  await page.route('**/uploads/**', (route) => {
    const url = route.request().url();
    if (/\.(webm|wav|mp3|m4a|ogg)(\?|$)/i.test(url)) {
      return route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav(45) });
    }
    return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: '' });
  });

  await page.route('**/upload.php', (route) =>
    route.fulfill(json({ success: true, path: '/uploads/demo.pdf', name: 'demo.pdf' })),
  );

  await page.addInitScript((userJson: string) => {
    try {
      window.sessionStorage.setItem('crm_current_user_rbac', userJson);
      window.sessionStorage.setItem('crm_session_token', 'demo-presentation-token');
    } catch {
      /* private mode — the login fallback in `ready()` handles it */
    }
  }, JSON.stringify(DEMO_USER));
}
