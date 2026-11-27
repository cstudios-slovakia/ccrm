import type { Page } from '@playwright/test';

/**
 * A stateful stand-in for `/api/newsletter.php` (docs/NEWSLETTER.md C4).
 *
 * It follows the real server's rules where the UI depends on them: the same envelope
 * (`{ success: true, ...payload }` / `{ success: false, code }` with the HTTP status), only a draft
 * can be edited (409 `not_draft`), `start_send` runs the validations of C10 in the same order and
 * answers with the same codes, `tick` moves the queue forward and finishes the campaign when it is
 * empty, pause / resume / cancel check the status, and the audience count is derived from the
 * audience the app posts (never from a canned number).
 *
 * The real server is exercised separately by `npm run test:newsletter`; what this file cannot
 * prove is SMTP, merge-tag substitution per recipient and the cron worker.
 *
 * Specs steer it through the returned controller: `failNext` / `failAll` make one action fail with
 * a code, `set` flips demo mode, the configured sender, the worker and the permissions.
 */

type Json = Record<string, any>;

export interface NewsletterMockOptions {
  /** Demo instance: nothing is ever sent, the sender counts as ready. */
  demo?: boolean;
  /** The system mail profile is set up. */
  senderConfigured?: boolean;
  /** `tick` moves the queue forward (a stopped worker is a server without cron and no open page). */
  worker?: boolean;
  /** Rows the worker marks as sent per `tick`. */
  tickBatch?: number;
  /** Permissions of the caller on the server side (the app has its own copy from the roles). */
  edit?: boolean;
  send?: boolean;
  settings?: boolean;
  /** Clients a campaign to "all clients" reaches. */
  allClients?: number;
}

export interface NewsletterMock {
  campaigns: Map<string, Json>;
  suppressions: Json[];
  /** Every request the app made, in order. */
  calls: { action: string; body: Json }[];
  config: () => Json;
  callsOf: (action: string) => Json[];
  /** The next call of `action` fails once with `code`. */
  failNext: (action: string, code: string, status?: number, message?: string) => void;
  /** Every call of `action` fails until the returned function is called. */
  failAll: (action: string, code: string, status?: number, message?: string) => () => void;
  set: (patch: NewsletterMockOptions) => void;
  /** A campaign in any state, e.g. one that is already sending. Returns its id. */
  addCampaign: (patch: Json & { recipients?: number }) => string;
  /** Moves every sending campaign forward by one batch, like the worker would. */
  runWorker: () => void;
}

const DEFAULT_THEME = {
  contentWidth: 600,
  pageBackground: '#f1f5f9',
  contentBackground: '#ffffff',
  fontFamily: 'Arial, Helvetica, sans-serif',
  textColor: '#1e293b',
  linkColor: '#2563eb',
  buttonBackground: '#2563eb',
  buttonTextColor: '#ffffff',
};

const DEFAULT_CONFIG = {
  version: 1,
  header: null,
  footer: null,
  theme: DEFAULT_THEME,
  sender: { fromName: '', replyTo: '' },
  sending: { batchSize: 40, perHourLimit: 400, testRecipients: [] as string[] },
};

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const parseExtra = (raw: string): string[] => {
  const out: string[] = [];
  for (const part of raw.split(/[\n\r,;]+/)) {
    const piece = part.trim();
    if (!piece) continue;
    const angle = piece.match(/<([^<>]*)>\s*$/);
    const addr = (angle ? angle[1] : piece).trim().toLowerCase();
    if (EMAIL.test(addr) && !out.includes(addr)) out.push(addr);
  }
  return out;
};

const defaultAudience = () => ({
  clients: { mode: 'all', categoryIds: [] as string[], clientIds: [] as string[] },
  leads: { enabled: false, statuses: [] as string[], interestCategories: [] as string[] },
  employees: { enabled: false },
  extra: { enabled: false, raw: '' },
});

const emptyCounts = () => ({ total: 0, queued: 0, sent: 0, failed: 0, skipped: 0, cancelled: 0, unsubscribed: 0 });
const nowIso = () => new Date().toISOString();

/** The data the suite starts with: one finished campaign with a bounce, and two suppressions. */
export function newsletterSeed(): { campaigns: Json[]; suppressions: Json[] } {
  return {
    campaigns: [
      {
        id: 'nl-seed-sent',
        name: 'Jarná akcia',
        subject: 'Jarná akcia na zvyšky dosiek',
        status: 'sent',
        recipients: 4,
        sent: 3,
        failed: 1,
        htmlSnapshot: '<!doctype html><html><body><p>Jarná akcia na zvyšky dosiek</p><a href="{{unsubscribe_url}}">Odhlásiť</a></body></html>',
      },
    ],
    suppressions: [
      { email: 'chyba@example.sk', reason: 'bounced', campaignId: 'nl-seed-sent', campaignName: 'Jarná akcia', note: null, createdBy: null, createdAt: '2026-10-20T08:00:00Z' },
      { email: 'nechce@example.sk', reason: 'manual', campaignId: null, campaignName: null, note: 'Na vlastnú žiadosť', createdBy: 'Erik', createdAt: '2026-10-22T08:00:00Z' },
    ],
  };
}

export async function installNewsletterMock(page: Page, initial: NewsletterMockOptions = {}): Promise<NewsletterMock> {
  const opts: Required<NewsletterMockOptions> = {
    demo: false,
    senderConfigured: true,
    worker: true,
    tickBatch: 2,
    edit: true,
    send: true,
    settings: true,
    allClients: 4,
    ...initial,
  };
  let config: Json = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  const campaigns = new Map<string, Json>();
  const suppressions: Json[] = [];
  const calls: { action: string; body: Json }[] = [];
  const failures: { action: string; code: string; status: number; message?: string; once: boolean }[] = [];
  let seq = 100;

  const rowsFor = (n: number, status: (i: number) => string) =>
    Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      email: `klient${i + 1}@example.sk`,
      name: `Klient ${i + 1}`,
      source: 'client',
      leadId: null,
      employeeId: null,
      status: status(i),
      skipReason: null,
      error: null,
      sentAt: null,
      unsubscribedAt: null,
    }));

  const recount = (c: Json) => {
    const counts = emptyCounts();
    counts.total = c.rows.length;
    for (const r of c.rows) {
      if (r.status in counts) (counts as Json)[r.status] += 1;
      if (r.unsubscribedAt) counts.unsubscribed += 1;
    }
    c.counts = counts;
  };

  const addCampaign = (patch: Json & { recipients?: number }): string => {
    const id = patch.id ?? `nl-mock-${++seq}`;
    const status = patch.status ?? 'draft';
    const n = patch.recipients ?? 0;
    const sent = patch.sent ?? (status === 'sent' ? n : 0);
    const failed = patch.failed ?? 0;
    const rows =
      patch.rows ??
      rowsFor(n, (i) => {
        if (i < sent) return 'sent';
        if (i < sent + failed) return 'failed';
        return status === 'sending' || status === 'paused' ? 'queued' : status === 'cancelled' ? 'cancelled' : 'queued';
      });
    for (const r of rows) {
      if (r.status === 'sent' && !r.sentAt) r.sentAt = '2026-10-25T09:00:00Z';
      if (r.status === 'failed' && !r.error) r.error = '550 mailbox unavailable';
    }
    const c: Json = {
      name: 'Campaign',
      subject: '',
      preheader: '',
      fromName: null,
      replyTo: null,
      body: null,
      useHeader: true,
      useFooter: true,
      status,
      audience: defaultAudience(),
      lastError: null,
      createdBy: 'Erik',
      createdAt: '2026-10-24T09:00:00Z',
      updatedAt: '2026-10-24T09:00:00Z',
      startedAt: status === 'draft' ? null : '2026-10-25T08:55:00Z',
      finishedAt: status === 'sent' || status === 'cancelled' ? '2026-10-25T09:05:00Z' : null,
      htmlSnapshot: status === 'draft' ? null : '<!doctype html><html><body><p>Snapshot</p><a href="{{unsubscribe_url}}">x</a></body></html>',
      ...patch,
      id,
      rows,
    };
    delete c.recipients;
    delete c.sent;
    delete c.failed;
    recount(c);
    campaigns.set(id, c);
    return id;
  };

  const seed = newsletterSeed();
  for (const c of seed.campaigns) addCampaign(c);
  suppressions.push(...seed.suppressions);

  const summary = (c: Json): Json => {
    const { rows: _rows, body: _body, preheader: _p, fromName: _f, replyTo: _r, useHeader: _h, useFooter: _u, htmlSnapshot: _s, ...rest } = c;
    return rest;
  };
  const full = (c: Json): Json => {
    const { rows: _rows, ...rest } = c;
    return { ...rest, htmlSnapshot: c.status === 'draft' ? null : c.htmlSnapshot };
  };
  const progress = (c: Json): Json => ({ id: c.id, status: c.status, counts: c.counts, lastError: c.lastError, finishedAt: c.finishedAt });

  /** Who a campaign to this audience would reach (derived from the audience, like `newsletter_audience.php`). */
  const resolve = (a: Json): { valid: boolean; rows: Json[] } => {
    const pick = a?.clients?.mode === 'pick';
    const cats = a?.clients?.categoryIds?.length ?? 0;
    const ids = a?.clients?.clientIds?.length ?? 0;
    if (pick && cats === 0 && ids === 0) return { valid: false, rows: [] };
    const rows: Json[] = [];
    const clients = pick ? cats * 2 + ids : opts.allClients;
    for (let i = 0; i < clients; i++) rows.push({ email: `klient${i + 1}@example.sk`, name: `Klient ${i + 1}`, source: 'client' });
    if (a?.leads?.enabled) for (let i = 0; i < 2; i++) rows.push({ email: `lead${i + 1}@example.sk`, name: `Lead ${i + 1}`, source: 'lead' });
    if (a?.employees?.enabled) rows.push({ email: 'zamestnanec@example.sk', name: 'Zamestnanec', source: 'employee' });
    if (a?.extra?.enabled) for (const e of parseExtra(a.extra.raw ?? '')) rows.push({ email: e, name: '', source: 'extra' });
    const blocked = new Set(suppressions.map((s) => s.email));
    return { valid: true, rows: rows.filter((r) => !blocked.has(r.email)) };
  };

  const preview = (a: Json): Json => {
    const { valid, rows } = resolve(a);
    const bySource = { client: 0, lead: 0, employee: 0, extra: 0 } as Json;
    for (const r of rows) bySource[r.source] += 1;
    return {
      valid,
      total: rows.length,
      bySource,
      skipped: { unsubscribed: 0, invalid: 0 },
      withoutEmail: valid && a?.clients?.mode !== 'pick' ? 1 : 0,
      withoutFirstName: 0,
      sample: rows.slice(0, 20).map((r) => ({ ...r, merge: { first_name: String(r.name).split(' ')[0] ?? '', name: r.name } })),
    };
  };

  const worker = () => {
    for (const c of campaigns.values()) {
      if (c.status !== 'sending' || c.deletedAt) continue;
      const queued = c.rows.filter((r: Json) => r.status === 'queued');
      for (const r of queued.slice(0, opts.tickBatch)) {
        r.status = 'sent';
        r.sentAt = nowIso();
      }
      if (c.rows.every((r: Json) => r.status !== 'queued')) {
        c.status = 'sent';
        c.finishedAt = nowIso();
      }
      recount(c);
    }
  };

  const ok = (body: Json, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify({ success: true, ...body }) });
  const fail = (code: string, status = 400, message?: string) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, code, ...(message ? { message } : {}) }),
  });

  await page.route('**/api/newsletter.php**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'GET') return route.fulfill(fail('method_not_allowed', 405));

    if (url.searchParams.get('action') === 'upload_image') {
      calls.push({ action: 'upload_image', body: {} });
      if (!opts.edit) return route.fulfill(fail('forbidden', 403));
      return route.fulfill(ok({ url: `${url.origin}/uploads/newsletter/mock-${++seq}.png` }));
    }

    const body = (req.postDataJSON() ?? {}) as Json;
    const action = String(body.action ?? '');
    calls.push({ action, body });

    const planned = failures.findIndex((f) => f.action === action);
    if (planned >= 0) {
      const f = failures[planned];
      if (f.once) failures.splice(planned, 1);
      return route.fulfill(fail(f.code, f.status, f.message));
    }

    const need: Record<string, 'view' | 'edit' | 'send' | 'settings'> = {
      create: 'edit', update: 'edit', duplicate: 'edit', delete: 'edit', images: 'view', suppression_add: 'edit', suppression_remove: 'edit',
      settings_save: 'settings', send_test: 'send', start_send: 'send', pause: 'send', resume: 'send', cancel: 'send',
    };
    const level = need[action] ?? 'view';
    if (level !== 'view' && !opts[level]) return route.fulfill(fail('forbidden', 403));

    const find = (): Json | null => {
      const c = campaigns.get(String(body.id ?? ''));
      return c && !c.deletedAt ? c : null;
    };

    switch (action) {
      case 'list':
        return route.fulfill(ok({ campaigns: [...campaigns.values()].filter((c) => !c.deletedAt).map(summary).reverse() }));
      case 'get': {
        const c = find();
        return route.fulfill(c ? ok({ campaign: full(c) }) : fail('not_found', 404));
      }
      case 'recipients': {
        const c = find();
        if (!c) return route.fulfill(fail('not_found', 404));
        const q = String(body.q ?? '').toLowerCase();
        let rows = c.rows as Json[];
        if (body.status) rows = rows.filter((r) => r.status === body.status);
        if (q) rows = rows.filter((r) => `${r.email} ${r.name ?? ''} ${r.source}`.toLowerCase().includes(q));
        const offset = Number(body.offset ?? 0);
        return route.fulfill(ok({ rows: rows.slice(offset, offset + Number(body.limit ?? 50)), total: rows.length }));
      }
      case 'audience_preview':
        return route.fulfill(ok(preview(body.audience)));
      case 'settings_get':
        return route.fulfill(ok({ config, senderEmail: 'info@firma.sk', senderConfigured: opts.senderConfigured, demo: opts.demo }));
      case 'suppressions': {
        const q = String(body.q ?? '').toLowerCase();
        const rows = suppressions.filter((s) => !q || s.email.includes(q));
        const offset = Number(body.offset ?? 0);
        return route.fulfill(ok({ rows: rows.slice(offset, offset + Number(body.limit ?? 50)), total: rows.length }));
      }
      case 'images':
        return route.fulfill(ok({ images: [] }));
      case 'contact_status':
        return route.fulfill(ok(Object.fromEntries((body.emails ?? []).map((e: string) => [e, { campaigns: [] }]))));
      case 'create': {
        const name = String(body.name ?? '').trim() || `Campaign ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
        const id = addCampaign({ name, createdAt: nowIso(), updatedAt: nowIso() });
        return route.fulfill(ok({ campaign: full(campaigns.get(id)!) }));
      }
      case 'update': {
        const c = find();
        if (!c) return route.fulfill(fail('not_found', 404));
        if (c.status !== 'draft') return route.fulfill(fail('not_draft', 409));
        const p = (body.patch ?? {}) as Json;
        if ('name' in p && !String(p.name).trim()) return route.fulfill(fail('invalid_name', 422));
        if ('replyTo' in p && p.replyTo && !EMAIL.test(String(p.replyTo))) return route.fulfill(fail('invalid_reply_to', 422));
        for (const k of ['name', 'subject', 'preheader', 'fromName', 'replyTo', 'audience', 'body', 'useHeader', 'useFooter']) if (k in p) c[k] = p[k];
        c.updatedAt = nowIso();
        return route.fulfill(ok({ campaign: full(c) }));
      }
      case 'duplicate': {
        const c = find();
        if (!c) return route.fulfill(fail('not_found', 404));
        const id = addCampaign({ ...JSON.parse(JSON.stringify(full(c))), id: undefined, name: `${c.name} (copy)`, status: 'draft', startedAt: null, finishedAt: null, htmlSnapshot: null, createdAt: nowIso(), updatedAt: nowIso() });
        return route.fulfill(ok({ campaign: full(campaigns.get(id)!) }));
      }
      case 'delete': {
        const c = find();
        if (!c) return route.fulfill(fail('not_found', 404));
        if (c.status === 'sending') return route.fulfill(fail('campaign_sending', 409));
        c.deletedAt = nowIso();
        return route.fulfill(ok({}));
      }
      case 'suppression_add': {
        const emails: string[] = (body.emails ?? []).map((e: string) => String(e).trim().toLowerCase());
        const invalid = emails.filter((e) => !EMAIL.test(e));
        let added = 0;
        for (const e of emails.filter((x) => EMAIL.test(x))) {
          if (suppressions.some((s) => s.email === e)) continue;
          suppressions.unshift({ email: e, reason: 'manual', campaignId: null, campaignName: null, note: body.note ?? null, createdBy: 'Erik', createdAt: nowIso() });
          added += 1;
        }
        return route.fulfill(ok({ added, invalid }));
      }
      case 'suppression_remove': {
        const i = suppressions.findIndex((s) => s.email === String(body.email ?? '').toLowerCase());
        if (i < 0) return route.fulfill(fail('not_found', 404));
        suppressions.splice(i, 1);
        return route.fulfill(ok({}));
      }
      case 'settings_save': {
        config = { ...DEFAULT_CONFIG, ...body.config };
        return route.fulfill(ok({ config }));
      }
      case 'send_test': {
        const c = find();
        if (!c) return route.fulfill(fail('not_found', 404));
        const to: string[] = body.to ?? [];
        if (to.length === 0) return route.fulfill(fail('no_test_recipients', 422));
        if (to.length > 5) return route.fulfill(fail('too_many_test_recipients', 422));
        if (to.some((e) => !EMAIL.test(e))) return route.fulfill(fail('invalid_test_recipient', 422));
        if (!String(c.subject).trim()) return route.fulfill(fail('empty_subject', 422));
        if (!opts.demo && !opts.senderConfigured) return route.fulfill(fail('sender_not_configured', 422));
        if (!String(body.html ?? '').includes('{{unsubscribe_url}}')) return route.fulfill(fail('missing_unsubscribe', 422));
        return route.fulfill(ok(opts.demo ? { sent: 0, demo: true } : { sent: to.length, demo: false }));
      }
      case 'start_send': {
        const c = find();
        if (!c) return route.fulfill(fail('not_found', 404));
        if (c.status !== 'draft') return route.fulfill(fail('not_draft', 409));
        const html = String(body.html ?? '');
        if (!String(c.subject).trim()) return route.fulfill(fail('empty_subject', 422));
        if (!opts.demo && !opts.senderConfigured) return route.fulfill(fail('sender_not_configured', 422));
        if (!html.includes('{{unsubscribe_url}}')) return route.fulfill(fail('missing_unsubscribe', 422));
        if (/<img[^>]+src=["']data:/i.test(html)) return route.fulfill(fail('data_url_image', 422));
        if (/href=["']\s*(javascript|vbscript|data):/i.test(html)) return route.fulfill(fail('dangerous_url', 422));
        if (html.length > 1_000_000) return route.fulfill(fail('html_too_large', 422));
        const { rows } = resolve(c.audience);
        if (rows.length === 0) return route.fulfill(fail('no_recipients', 422));
        c.rows = rows.map((r, i) => ({ id: i + 1, email: r.email, name: r.name || null, source: r.source, leadId: null, employeeId: null, status: 'queued', skipReason: null, error: null, sentAt: null, unsubscribedAt: null }));
        c.htmlSnapshot = html;
        c.status = 'sending';
        c.startedAt = nowIso();
        recount(c);
        return route.fulfill(ok({ campaign: full(c) }));
      }
      case 'pause':
      case 'resume':
      case 'cancel': {
        const c = find();
        if (!c) return route.fulfill(fail('not_found', 404));
        const from = action === 'resume' ? ['paused'] : ['sending', 'paused'];
        if (!from.includes(c.status)) return route.fulfill(fail('wrong_status', 409));
        if (action === 'pause') c.status = 'paused';
        if (action === 'resume') {
          c.status = 'sending';
          c.lastError = null;
        }
        if (action === 'cancel') {
          for (const r of c.rows) if (r.status === 'queued') r.status = 'cancelled';
          c.status = 'cancelled';
          c.finishedAt = nowIso();
          recount(c);
        }
        return route.fulfill(ok({ campaign: full(c) }));
      }
      case 'tick': {
        const c = body.id ? find() : null;
        if (opts.worker) worker();
        return route.fulfill(ok({ ...(c ? { campaign: progress(c) } : {}), worker: opts.worker ? 'ran' : 'idle' }));
      }
      default:
        return route.fulfill(fail('unknown_action', 400));
    }
  });

  return {
    campaigns,
    suppressions,
    calls,
    config: () => config,
    callsOf: (action) => calls.filter((c) => c.action === action).map((c) => c.body),
    failNext: (action, code, status = 422, message) => {
      failures.push({ action, code, status, message, once: true });
    },
    failAll: (action, code, status = 422, message) => {
      const f = { action, code, status, message, once: false };
      failures.push(f);
      return () => {
        const i = failures.indexOf(f);
        if (i >= 0) failures.splice(i, 1);
      };
    },
    set: (patch) => Object.assign(opts, patch),
    addCampaign,
    runWorker: worker,
  };
}
