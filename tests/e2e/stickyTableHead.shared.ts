import type { Page } from '@playwright/test';
import { startSession } from './helpers/appDriver';
import { buildSyncPayload } from './helpers/fixture';

/**
 * Shared by the sticky-head spec and the manual visual review: a session whose
 * lists are long enough to scroll, and the measurements both of them take.
 *
 * Not a helper under `helpers/` on purpose: the QA runner treats a change there
 * as harness plumbing and escalates to the full suite.
 */

type Row = { id: string; [key: string]: unknown };

/** `copies` extra rows per source row, with unique ids and a numbered label. */
function clone<T extends Row>(rows: T[] | undefined, copies: number, label: (r: T, k: number) => Partial<T>): T[] {
  const source = rows ?? [];
  const out: T[] = [...source];
  for (let k = 1; k <= copies; k++) {
    for (const r of source) out.push({ ...r, id: `${r.id}-x${k}`, ...label(r, k) });
  }
  return out;
}

/** Registers the base payload does not carry at all: orders, price offers, employees. */
function extraRegisters(count: number) {
  const day = (i: number) => new Date(Date.UTC(2026, 8, 1 + (i % 28))).toISOString().slice(0, 10);
  const orders = Array.from({ length: count }, (_, i) => ({
    id: `order-qa-${i}`,
    orderNumber: `OBJ-2026-${String(i + 1).padStart(3, '0')}`,
    type: 'sales',
    status: 'new',
    customerType: 'guest',
    guest: { name: `Zákazník ${i + 1}`, email: `zakaznik${i + 1}@example.com` },
    delivery: { recipient: `Zákazník ${i + 1}`, street: 'Hlavná 1', city: 'Bratislava', zip: '81101', country: 'SK' },
    billing: { name: `Zákazník ${i + 1}`, country: 'SK' },
    paymentStatus: i % 3 === 0 ? 'paid' : 'unpaid',
    currency: 'EUR',
    itemsNetAmount: 100 + i,
    servicesNetAmount: 5,
    totalNetAmount: 105 + i,
    totalTaxAmount: 21,
    totalGrossAmount: 126 + i,
    orderDate: day(i),
    items: [],
  }));
  const invoicesOffers = Array.from({ length: count }, (_, i) => ({
    id: `offer-qa-${i}`,
    documentNumber: `CP-2026-${String(i + 1).padStart(3, '0')}`,
    type: i % 4 === 0 ? 'invoice' : 'price_offer',
    mode: 'default',
    leadId: 'lead-silvia',
    clientId: 'lead-silvia',
    clientName: `Klient ${i + 1}`,
    title: 'Cenová ponuka',
    subject: `Rekonštrukcia strechy ${i + 1}`,
    uspCards: [],
    items: [],
    subtotal: 1000 + i,
    vatAmount: 200,
    totalPrice: 1200 + i,
    currency: 'EUR',
    status: 'sent',
    issuedAt: day(i),
    country: 'SK',
  }));
  const employees = Array.from({ length: count }, (_, i) => ({
    id: `emp-qa-${i}`,
    name: `Zamestnanec ${i + 1}`,
    position: 'QA',
    email: `qa${i + 1}@example.com`,
    salaryType: 'monthly',
    salaryAmount: 1500 + i * 10,
    isActive: true,
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-01T09:00:00.000Z',
  }));
  return { orders, invoicesOffers, employees };
}

export function inflatePayload(copies: number) {
  const p: any = buildSyncPayload();
  Object.assign(p, extraRegisters(copies * 5), {
    employeeSalaries: [],
    employeeVacations: [],
    employeeSettings: { salaryDueDay: 15, autoExpense: true, vacationTypes: [], salaryTypes: [] },
  });
  p.leads = clone(p.leads, copies, (r: any, k) => ({ name: `${r.name} ${k}` }));
  p.projects = clone(p.projects, copies, (r: any, k) => ({ name: `${r.name} #${k}` }));
  p.financialRecords = clone(p.financialRecords, copies, (r: any, k) => ({ title: `${r.title} #${k}` }));
  p.warehouseItems = clone(p.warehouseItems, copies, (r: any, k) => ({
    name: `${r.name} ${k}`,
    sku: `${r.sku}-${k}`,
  }));
  p.warehouseMovements = clone(p.warehouseMovements, copies, () => ({}));
  p.tasks = clone(p.tasks, copies, (r: any, k) => ({ title: `${r.title} #${k}` }));
  const data: Record<string, Row[]> = {};
  for (const [key, rows] of Object.entries<Row[]>(p.unifiedEntriesData ?? {})) {
    data[key] = clone(rows, copies, (r: any, k) => ({
      title: `${r.title} ${k}`,
      parentId: r.parentId ? `${r.parentId}-x${k}` : null,
    }));
  }
  p.unifiedEntriesData = data;
  return p;
}

/** Signs in with the QA backend mocks, then serves an inflated dataset. */
export async function startInflatedSession(
  page: Page,
  copies = 12,
  opts: { dark?: boolean; integrations?: Record<string, unknown>; prefs?: Record<string, unknown> } = {},
) {
  await startSession(page, opts.dark ? { themeMode: 'dark' } : undefined);
  if (opts.dark) {
    // Read before the first paint, as index.html does, so the app boots dark.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('ccrm_theme_mode', 'dark');
      } catch {
        /* storage blocked: the app falls back to the system setting */
      }
    });
  }
  // Registered after the session mock, so this GET wins and the mock still
  // handles everything the app writes back.
  await page.route('**/sync.php**', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const payload = inflatePayload(copies);
    if (opts.integrations) {
      payload.settings = {
        ...payload.settings,
        integrationsConfig: { ...payload.settings.integrationsConfig, ...opts.integrations },
      };
    }
    if (opts.prefs) {
      const me = payload.users[0];
      const meta = JSON.parse(me.metadata_json);
      me.metadata_json = JSON.stringify({ ...meta, preferences: { ...meta.preferences, ...opts.prefs } });
    }
    if (opts.dark) {
      // The app adopts the signed-in user's saved appearance over the browser's.
      const me = payload.users[0];
      const meta = JSON.parse(me.metadata_json);
      me.metadata_json = JSON.stringify({ ...meta, preferences: { ...meta.preferences, themeMode: 'dark' } });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

export interface HeadReading {
  /** Visible `<th>` top minus `main` top, in px: 0 when the head is flush under the app header. */
  headOffset: number | null;
  /** Table bottom minus `main` top, to tell "head left with the table" from "head lost". */
  tableBottom: number | null;
  /** Every ancestor between the `<th>` and `main` that scrolls (or hides) on either axis. */
  scrollers: string[];
  /** `main` scrolls sideways: the page is wider than the window. */
  mainOverflowsX: boolean;
}

/**
 * Where is the first table head, relative to the page scroller, right now?
 * `selector` picks the table; the first `<th>` of the first `<thead>` is measured.
 */
export async function readHead(page: Page, selector = 'table'): Promise<HeadReading> {
  return page.evaluate((sel) => {
    const main = document.querySelector('main.workspace') as HTMLElement | null;
    const table = Array.from(document.querySelectorAll<HTMLElement>(sel)).find(
      (t) => t.offsetParent !== null && !t.closest('.table-page-head-mirror'),
    );
    // A wide table's visible head is the pinned copy laid right before its wrapper.
    const before = table?.closest('.table-page-wrap')?.previousElementSibling;
    const mirror = before?.classList.contains('table-page-head-mirror') ? before : null;
    const th = (mirror ?? table)?.querySelector<HTMLElement>('thead th') ?? null;
    if (!main || !table || !th) {
      return { headOffset: null, tableBottom: null, scrollers: [], mainOverflowsX: false };
    }
    const mainTop = main.getBoundingClientRect().top;
    const scrollers: string[] = [];
    for (let el = th.parentElement; el && el !== main; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (/auto|scroll|hidden/.test(cs.overflowY) || /auto|scroll|hidden/.test(cs.overflowX)) {
        scrollers.push(`${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 4).join('.')}[${cs.overflowX}/${cs.overflowY}]`);
      }
    }
    return {
      headOffset: Math.round((th.getBoundingClientRect().top - mainTop) * 10) / 10,
      tableBottom: Math.round((table.getBoundingClientRect().bottom - mainTop) * 10) / 10,
      scrollers,
      mainOverflowsX: main.scrollWidth > main.clientWidth + 1,
    };
  }, selector);
}

export async function scrollMain(page: Page, top: number | 'end') {
  await page.evaluate((t) => {
    const main = document.querySelector('main.workspace') as HTMLElement;
    main.scrollTop = t === 'end' ? main.scrollHeight : t;
  }, top);
  // Two frames: the IntersectionObserver behind the proxy scrollbar reports after layout.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // The proxy scrollbar fades in over 150ms.
  await page.waitForTimeout(250);
}
