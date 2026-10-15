#!/usr/bin/env node
/**
 * Captures the module screenshots shown in the module setup wizard.
 *
 *   npm run shots:modules                      # all modules
 *   npm run shots:modules -- --only leads,tasks
 *   QA_REUSE_SERVER=1 npm run shots:modules    # reuse a dev server already on :5273
 *
 * Output: public/module-screenshots/<moduleId>.webp
 *
 * It drives the real app the way the QA suite does: Vite on the QA port (5273,
 * strictPort), Playwright, and a mocked `/sync.php`, `/api/*` and `/upload.php`
 * - no PHP, no database, and never any real data.
 *
 * The data is the invented "Rekonstav s.r.o." dataset from tests/demo/ (the one
 * `npm run shots` photographs), not the QA fixture: the fixture is built to
 * reach every code path and leaves Tickets, Orders and others looking empty,
 * which is the one thing a module preview must not do. Tickets and orders, which
 * the demo dataset has none of, are invented below, and so are the release
 * notes the Updates module fetches from the CMS.
 *
 * Every shot is the same frame: light mode, a fixed 1280x900 viewport at the Normal view size, the
 * workspace area only (no sidebar), 16:10 from its top-left corner, encoded as
 * WebP (re-encoded at lower quality until it is <= 150 KB).
 *
 * It takes the same machine-wide lock as a QA run, so it queues behind one
 * instead of starting a second Chromium next to it.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { admitRun, killTree, releaseRunLock } from './qa/admission.mjs';
import { register } from 'node:module';

// tests/demo/ imports its siblings without extensions; teach Node's resolver to cope.
register('./ts-extensionless-hook.mjs', import.meta.url);
const { installDemoBackend } = await import('../tests/demo/demoMocks.ts');
const { buildSyncPayload } = await import('../tests/demo/demoData.ts');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'module-screenshots');
const PORT = Number(process.env.QA_PORT ?? 5273);
const APP_URL = `http://localhost:${PORT}`;

// 1280 wide, at the Normal view size: the same layout at a narrower frame with larger text, so it still reads
// when the picture is shown at ~650 px in the wizard.
const VIEWPORT = { width: 1280, height: 900 };
const ASPECT = 16 / 10;
const MAX_BYTES = 150 * 1024;
const QUALITIES = [0.82, 0.74, 0.66, 0.58, 0.5, 0.42];

/** module id -> the hash its landing view lives at. */
const MODULES = {
  tasks: '#tasks',
  projects: '#projects',
  tickets: '#tickets',
  leads: '#leads',
  clients: '#clients',
  warehouse: '#warehouse',
  invoices: '#invoices',
  orders: '#orders',
  financial: '#financial',
  employees: '#employees',
  dashboard: '#dashboard',
  overview: '#overview',
  meetings: '#meetings',
  files: '#files',
  email: '#email',
  rag_ai: '#rag_ai',
  sai: '#sai',
  automation: '#automation',
  social_media: '#social_media',
  updates: '#updates',
};

/** Modules whose identifying content is pushed below the crop by the Normal size's taller header. */
const SIZE_OVERRIDES = { financial: 'compact' };

const args = process.argv.slice(2);
const onlyAt = args.indexOf('--only');
const only = onlyAt === -1 ? null : new Set(args[onlyAt + 1].split(',').map((s) => s.trim()));
const ids = Object.keys(MODULES).filter((id) => !only || only.has(id));
if (only) {
  for (const id of only) if (!(id in MODULES)) throw new Error(`Unknown module "${id}". Known: ${Object.keys(MODULES).join(', ')}`);
}

/* --------------------------------------------------------------- dev server */

async function waitForServer(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(APP_URL);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Dev server did not come up on ${APP_URL}`);
}

async function startServer() {
  if (process.env.QA_REUSE_SERVER === '1') {
    await waitForServer(5000);
    return null;
  }
  // Straight from Vite's bin, not through npm: see playwright.config.ts.
  const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: process.env.QA_SERVER_LOGS === '1' ? 'inherit' : 'ignore',
    windowsHide: true,
  });
  child.on('exit', (code) => console.error(`dev server exited (code ${code})`));
  await waitForServer();
  return child;
}

/* ------------------------------------------------------------- mocked extras */

/** Invented release notes, in the shape the Craft GraphQL API answers with. */
const RELEASE_NOTES = [
  {
    id: '3',
    title: 'Prehľadnejší predajný lievik a rýchlejšie faktúry',
    siteHandle: 'default',
    postDate: '2026-10-08',
    version: '1.12.30-Mango',
    contentMatrix: [
      { __typename: 'heading_Entry', title: 'Čo je nové', headingLevel: 'h2', moduleTag: null },
      { __typename: 'textblock_Entry', text: { html: '<p>Lievik teraz ukazuje, ako dlho lead čaká v jednotlivej fáze, takže hneď vidíte tie, ktoré potrebujú pripomenutie.</p>' } },
      { __typename: 'changeList_Entry', title: 'Vylepšenia', listType: 'added', listItems: 'Fázy leadov môžu mať cieľový čas odozvy\nFaktúry si pri premene ponuky zachovajú číslovanie\nNástenka si pamätá zbalené widgety' },
    ],
  },
  {
    id: '2',
    title: 'Objednávky a tikety podpory',
    siteHandle: 'default',
    postDate: '2026-09-20',
    version: '1.12.20-Mango',
    contentMatrix: [
      { __typename: 'textblock_Entry', text: { html: '<p>Zákazníci môžu sledovať svoj tiket na verejnej stavovej tabuli a objednávky bez registrácie sa premenia na klienta jedným klikom.</p>' } },
      { __typename: 'changeList_Entry', title: 'Opravy', listType: 'fixed', listItems: 'Odpovede na tikety sa v widgete zobrazia okamžite\nStavy objednávok si po obnovení stránky držia poradie' },
    ],
  },
  {
    id: '1',
    title: 'Veľkosť zobrazenia a prehľadnejšie Štart menu',
    siteHandle: 'default',
    postDate: '2026-09-02',
    version: '1.12.10-Mango',
    contentMatrix: [
      { __typename: 'textblock_Entry', text: { html: '<p>Zvoľte si kompaktné, normálne alebo veľké písmo pre každé zariadenie a usporiadajte Štart menu do vlastných skupín.</p>' } },
    ],
  },
];

/* ------------------------------------------------------------ invented data */

const day = (offset, time = '09:30') => {
  const d = new Date(Date.now() + offset * 86_400_000);
  const tz = d.getTimezoneOffset() * 60_000;
  return `${new Date(d.getTime() - tz).toISOString().split('T')[0]} ${time}`;
};
const dateOnly = (offset) => day(offset).split(' ')[0];

const line = (orderId, n, name, qty, unit, price, rate = 23, sku = null) => {
  const net = Math.round(qty * price * 100) / 100;
  return {
    id: `${orderId}-i${n}`, orderId, itemType: 'product', itemId: null, sku, name, quantity: qty, unit,
    unitPrice: price, discountPercent: 0, taxRate: rate, totalNetAmount: net,
    totalGrossAmount: Math.round(net * (1 + rate / 100) * 100) / 100, fulfilledQuantity: 0, sortOrder: n,
  };
};
const order = (n, status, offset, guest, city, items, paymentStatus = 'unpaid', paymentMethod = 'Prevod na účet') => {
  const id = `order-${n}`;
  const lines = items.map((it, i) => line(id, i + 1, ...it));
  const net = lines.reduce((a, l) => a + l.totalNetAmount, 0);
  const gross = lines.reduce((a, l) => a + l.totalGrossAmount, 0);
  return {
    id, orderNumber: `OBJ-2026-${String(n).padStart(4, '0')}`, type: 'sales', status, customerType: 'guest',
    guest: { name: guest[0], email: guest[1], phone: guest[2], company: guest[3] ?? null },
    delivery: { recipient: guest[0], street: guest[4], city, zip: guest[5], country: 'Slovensko', phone: guest[2] },
    billing: { name: guest[3] ?? guest[0], street: guest[4], city, zip: guest[5], country: 'Slovensko' },
    shippingMethod: 'Kuriér DPD', paymentMethod, paymentStatus, currency: 'EUR',
    itemsNetAmount: net, servicesNetAmount: 0, totalNetAmount: Math.round(net * 100) / 100,
    totalTaxAmount: Math.round((gross - net) * 100) / 100, totalGrossAmount: Math.round(gross * 100) / 100,
    orderDate: dateOnly(offset), createdAt: day(offset), updatedAt: day(offset), items: lines,
  };
};

const client = (n, name, clientType, city, owner, value, email, phone) => ({
  id: `client-${n}`, name, city, clientType, status: 'zákazka', source: 'odporúčanie', owner, value,
  createdAt: day(-200 + n * 11), rating: 4 + (n % 2), phone, email,
  address: { street: 'Hlavná ' + (10 + n), city, postalCode: '81101', country: 'Slovensko' },
  categories: ['Strechy'], interestNote: '', followUps: {}, timeline: [], adjustment: 0,
});
const CLIENTS = [
  client(1, 'Silvia Hrušková', 'person', 'Bratislava', 'Erik Kováč', 24800, 'silvia.hruskova@example.sk', '+421 900 111 222'),
  client(2, 'Vinárstvo Pod Zámkom s.r.o.', 'company', 'Skalica', 'Mária Tóthová', 61200, 'info@podzamkom.example.sk', '+421 34 664 1200'),
  client(3, 'ZŠ Mierová', 'company', 'Nové Zámky', 'Jozef Baláž', 98400, 'riaditel@zsmierova.example.sk', '+421 35 640 3301'),
  client(4, 'Peter Horváth', 'person', 'Nitra', 'Jozef Baláž', 18200, 'peter.horvath@example.sk', '+421 903 454 321'),
  client(5, 'Alfa Reality a.s.', 'company', 'Žilina', 'Erik Kováč', 132000, 'facility@alfa-reality.example.sk', '+421 41 700 5500'),
  client(6, 'SVB Petržalka — Hálova 12', 'company', 'Bratislava', 'Mária Tóthová', 44700, 'sprava@svb-hala12.example.sk', '+421 2 6381 2290'),
  client(7, 'Jana Kováčová', 'person', 'Trnava', 'Lucia Bieliková', 9600, 'jana.kovacova@example.sk', '+421 917 202 884'),
];

const employee = (n, name, role, salary, email, phone, city, leaves = []) => ({
  id: `emp-${n}`, name, role, email, phone, addressStreet: 'Hviezdoslavova ' + (3 + n), addressCity: city, addressZip: '81102',
  addressCountry: 'Slovensko', salaryType: 'monthly', salaryAmount: salary, salaryDueDay: 15, vacationAllowances: { [new Date().getFullYear()]: 25 },
  timeTrackingProvider: 'manual', isActive: true, performanceScore: 80 + n * 2, createdAt: day(-400 + n * 20), leaves,
});
const EMPLOYEES = [
  employee(1, 'Erik Kováč', 'Konateľ', 3600, 'erik@rekonstav.sk', '+421 905 100 100', 'Bratislava'),
  employee(2, 'Mária Tóthová', 'Projektová manažérka', 2450, 'maria@rekonstav.sk', '+421 905 200 201', 'Bratislava', [{ id: 'lv1', startDate: dateOnly(12), endDate: dateOnly(16), type: 'vacation', status: 'pending' }]),
  employee(3, 'Jozef Baláž', 'Vedúci montážnej partie', 2300, 'jozef@rekonstav.sk', '+421 905 300 302', 'Senec', [{ id: 'lv2', startDate: dateOnly(-30), endDate: dateOnly(-26), type: 'vacation', status: 'approved' }]),
  employee(4, 'Lucia Bieliková', 'Obchodná zástupkyňa', 1900, 'lucia@rekonstav.sk', '+421 905 400 403', 'Pezinok'),
  employee(5, 'Martin Šimko', 'Klampiar', 1850, 'martin@rekonstav.sk', '+421 905 500 504', 'Malacky'),
  employee(6, 'Ján Pavlík', 'Pokrývač', 1800, 'jan@rekonstav.sk', '+421 905 600 605', 'Stupava'),
  employee(7, 'Katarína Mrázová', 'Účtovníčka', 1700, 'katarina@rekonstav.sk', '+421 905 700 706', 'Bratislava'),
];

const mail = (uid, offset, name, address, subject, preview, seen = true) => ({
  uid, subject, date: new Date(Date.now() + offset * 3_600_000).toISOString(),
  from: { name, address }, to: { name: 'Erik Kováč', address: 'erik@rekonstav.sk' }, seen, preview,
  attachment_count: 0, has_attachments: false,
});
const MAILS = [
  mail(311, -1, 'Silvia Hrušková', 'silvia.hruskova@example.sk', 'Re: Termín montáže strechy', 'Dobrý deň, ďakujem za cenovú ponuku. Termín montáže začiatkom novembra nám vyhovuje, môžete potvrdiť…', false),
  mail(310, -4, 'Alfa Reality a.s.', 'facility@alfa-reality.example.sk', 'Podklady k objednávke servisu', 'Posielame požadované podklady k servisu strechy administratívnej budovy a kontakt na správcu…', false),
  mail(309, -9, 'Vinárstvo Pod Zámkom', 'info@podzamkom.example.sk', 'Fotodokumentácia po dokončení', 'Dobrý deň, v prílohe posielame fotografie po dokončení prác. Všetko vyzerá výborne a sme spokojní…'),
  mail(308, -26, 'Mesto Nové Zámky', 'investicie@novezamky.example.sk', 'Výzva na predloženie ponuky — športová hala', 'Mesto Nové Zámky vyhlasuje súťaž na rekonštrukciu strechy športovej haly. Lehota na predloženie ponúk…'),
  mail(307, -30, 'Peter Horváth', 'peter.horvath@example.sk', 'Výmena okien — doplňujúce otázky', 'Dobrý večer, ešte by som sa chcel spýtať na farbu rámov a možnosť vonkajších žalúzií…'),
  mail(306, -50, 'Novák Stavby s.r.o.', 'objednavky@novakstavby.example.sk', 'Subdodávka strešného plášťa — zmluva', 'Zasielame podpísanú zmluvu o dielo. Prosíme o potvrdenie prijatia a návrh harmonogramu prác…'),
];

const SOCIAL_ACCOUNTS = [
  { _id: 'acc-fb', platform: 'facebook', displayName: 'Rekonstav s.r.o.', username: 'rekonstav' },
  { _id: 'acc-ig', platform: 'instagram', displayName: 'Rekonstav', username: 'rekonstav.sk' },
];
const post = (n, platform, acc, content, status, offset, likes, comments, impressions) => ({
  _id: `post-${n}`, content, status, scheduledFor: new Date(Date.now() + offset * 86_400_000).toISOString(),
  platforms: [{ platform, accountId: acc, publishedAt: new Date(Date.now() + offset * 86_400_000).toISOString() }],
  analytics: { likes, comments, shares: Math.round(likes / 6), impressions, clicks: Math.round(impressions / 40), engagementRate: 4.2 },
});
const POSTS = [
  post(1, 'facebook', SOCIAL_ACCOUNTS[0], 'Hotovo! Rodinný dom v Skalici má novú strechu z pálenej krytiny. Ďakujeme za dôveru.', 'published', -2, 148, 19, 5400),
  post(2, 'instagram', SOCIAL_ACCOUNTS[1], 'Pred a po: rekonštrukcia plochej strechy bytového domu. Nová hydroizolácia a 12 cm PIR.', 'published', -5, 212, 31, 7800),
  post(3, 'facebook', SOCIAL_ACCOUNTS[0], 'Jesenná akcia na obhliadky striech zdarma — objednajte sa do konca októbra.', 'scheduled', 3, 0, 0, 0),
  post(4, 'instagram', SOCIAL_ACCOUNTS[1], 'Ako vyberieme správnu krytinu? Krátky sprievodca v troch krokoch.', 'scheduled', 6, 0, 0, 0),
  post(5, 'facebook', SOCIAL_ACCOUNTS[0], 'Tip týždňa: čistenie odkvapov pred zimou ušetrí veľa starostí.', 'published', -9, 96, 7, 3100),
];

const ORDERS = [
  order(1, 'new', 0, ['Tomáš Rybár', 'tomas.rybar@example.sk', '+421 905 330 118', null, 'Lúčna 8', '90101'], 'Malacky', [['Pálená krytina — prírodná červená', 1200, 'ks', 1.78, 23, 'KRY-101'], ['Difúzna fólia 150 g/m²', 3, 'balenie', 96, 23, 'FOL-201']], 'unpaid'),
  order(2, 'awaiting_payment', -1, ['Dagmar Košútová', 'dagmar.kosutova@example.sk', '+421 910 220 441', null, 'Ružová 15', '94901'], 'Nitra', [['Plechová krytina falcovaná 0,5 mm', 38, 'm²', 42.5, 23, 'KRY-110']], 'unpaid'),
  order(3, 'processing', -2, ['Stavmat Trnava s.r.o.', 'objednavky@stavmat.example.sk', '+421 33 555 1201', 'Stavmat Trnava s.r.o.', 'Priemyselná 3', '91701'], 'Trnava', [['Hydroizolačná fólia mPVC 1,5 mm', 6, 'rolka', 268, 23, 'IZO-220'], ['PIR doska 120 mm', 140, 'm²', 24.9, 23, 'IZO-210']], 'paid', 'Platba kartou'),
  order(4, 'ready_to_ship', -3, ['Ing. Pavol Mráz', 'pavol.mraz@example.sk', '+421 903 444 009', null, 'Mierová 21', '03601'], 'Martin', [['Betónová krytina antracit', 900, 'ks', 1.34, 23, 'KRY-102']], 'paid', 'Platba kartou'),
  order(5, 'shipped', -5, ['Zuzana Hudecová', 'zuzana.hudecova@example.sk', '+421 917 800 213', null, 'Brezová 2', '01001'], 'Žilina', [['Pálená krytina — prírodná červená', 600, 'ks', 1.78, 23, 'KRY-101']], 'paid', 'Platba kartou'),
  order(6, 'delivered', -9, ['Agrodružstvo Malanta', 'sklad@malanta.example.sk', '+421 37 640 2211', 'Agrodružstvo Malanta', 'Družstevná 1', '95101'], 'Malanta', [['PIR doska 120 mm', 320, 'm²', 24.9, 23, 'IZO-210'], ['Difúzna fólia 150 g/m²', 6, 'balenie', 96, 23, 'FOL-201']], 'paid'),
  order(7, 'delivered', -14, ['Michal Gajdoš', 'michal.gajdos@example.sk', '+421 902 118 765', null, 'Sládkovičova 9', '97401'], 'Banská Bystrica', [['Betónová krytina antracit', 1500, 'ks', 1.34, 23, 'KRY-102']], 'paid'),
  order(8, 'cancelled', -12, ['Rudolf Kráľ', 'rudolf.kral@example.sk', '+421 944 321 654', null, 'Hlavná 77', '08001'], 'Prešov', [['Plechová krytina falcovaná 0,5 mm', 22, 'm²', 42.5, 23, 'KRY-110']], 'refunded'),
];

const ticket = (n, subject, status, priority, type, offset, reporter, projectId, messages) => {
  const id = `ticket-${n}`;
  return {
    id, ticketNumber: `TCK-${String(100200 + n)}`, subject, title: subject, description: messages[0][1], status, priority, type,
    channel: 'widget', source: 'widget', projectId, reporterName: reporter[0], reporterEmail: reporter[1],
    assignedUser: 'Erik Kováč', assignedUsers: ['Erik Kováč'], tags: [], billable: true, loggedMinutes: 0,
    firstResponseDueAt: day(offset + 1), resolutionDueAt: day(offset + 4),
    createdAt: day(offset), updatedAt: day(offset), archived: false, isArchived: false,
    messages: messages.map((m, i) => ({
      id: `${id}-m${i}`, ticketId: id, authorType: m[0], authorName: m[0] === 'client' ? reporter[0] : 'Erik Kováč',
      authorEmail: m[0] === 'client' ? reporter[1] : 'erik@rekonstav.sk', isInternal: false, eventType: 'message', body: m[1], createdAt: day(offset, `1${i}:15`),
    })),
  };
};

const TICKETS = [
  ticket(1, 'Po daždi presakuje voda pri komíne', 'new', 'critical', 'incident', 0, ['Silvia Hrušková', 'silvia.hruskova@example.sk'], 'project-hruskova', [['client', 'Dobrý deň, po dnešnom daždi nám začala presakovať voda pri komíne v podkroví. Prosím o urgentnú obhliadku.']]),
  ticket(2, 'Žiadosť o dodatočné klampiarske prvky', 'open', 'high', 'feature_request', -1, ['Peter Horváth', 'peter.horvath@example.sk'], 'project-horvath', [['client', 'Chceli by sme doplniť snehové zachytávače na južnú stranu strechy.'], ['agent', 'Ďakujeme, pripravíme cenovú ponuku do piatka.']]),
  ticket(3, 'Otázka k záručným podmienkam', 'waiting', 'normal', 'question', -2, ['Alfa Reality a.s.', 'facility@alfa-reality.example.sk'], 'project-alfa', [['client', 'Na aké diely sa vzťahuje 10-ročná záruka na hydroizoláciu?'], ['agent', 'Posielam prehľad záruk v prílohe, dajte vedieť, či je všetko jasné.']]),
  ticket(4, 'Faktúra obsahuje nesprávne IČ DPH', 'open', 'normal', 'billing', -3, ['SVB Petržalka', 'sprava@svb-hala12.example.sk'], 'project-bytdom', [['client', 'Na faktúre je uvedené iné IČ DPH, než sme poskytli.'], ['agent', 'Preveríme a pošleme opravný doklad.']]),
  ticket(5, 'Chýbajúca skrutka na lapači snehu', 'resolved', 'low', 'bug', -6, ['Vinárstvo Pod Zámkom', 'info@podzamkom.example.sk'], 'project-vinarstvo', [['client', 'Pri montáži chýbala jedna skrutka.'], ['agent', 'Doplnili sme ju pri kontrole v utorok.']]),
  ticket(6, 'Termín obhliadky strechy školy', 'closed', 'normal', 'question', -10, ['ZŠ Mierová', 'riaditel@zsmierova.example.sk'], 'project-skola', [['client', 'Môžeme si dohodnúť obhliadku na budúci týždeň?'], ['agent', 'Áno, v utorok o 9:00.']]),
];

async function installExtras(page) {
  // The demo admin has no preferences blob, which makes it look like a brand-new
  // admin and opens the module setup wizard over every shot. Mark it as done.
  const withWizardDone = (u) => {
    let meta = {};
    try {
      meta = typeof u.metadata_json === 'string' ? JSON.parse(u.metadata_json || '{}') : u.metadata_json || {};
    } catch {
      /* keep {} */
    }
    return { ...u, metadata_json: JSON.stringify({ ...meta, preferences: { ...(meta.preferences || {}), moduleWizardCompletedAt: '2026-01-01T00:00:00.000Z' }, emailSettings: { ...(meta.emailSettings || {}), isValidated: true } }) };
  };
  const payload = () => {
    const base = buildSyncPayload();
    return {
      ...base,
      users: base.users.map(withWizardDone),
      leads: [...base.leads, ...CLIENTS],
      orders: ORDERS,
      tickets: TICKETS,
      supportContracts: [],
      employees: EMPLOYEES,
      settings: {
        ...base.settings,
        integrationsConfig: { ...base.settings.integrationsConfig, vectorDb: 'qdrant', vectorDbValidated: true, zernioConnected: true },
      },
    };
  };
  await page.addInitScript((userJson) => {
    try {
      window.sessionStorage.setItem('crm_current_user_rbac', userJson);
    } catch {
      /* private mode */
    }
  }, JSON.stringify(withWizardDone(buildSyncPayload().users[0])));
  // Registered after the demo backend's own handler, so it wins for GETs.
  await page.route('**/sync.php**', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload()) });
  });
  await page.route('**/api/mail_broker.php**', (route) => {
    const q = new URL(route.request().url()).searchParams;
    const folder = q.get('folder') || 'INBOX';
    const emails = folder === 'INBOX' ? MAILS : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, folder, emails, total: emails.length, folders: { INBOX: emails.length, Sent: 0, Trash: 0 } }),
    });
  });
  await page.route('**/api/zernio.php**', (route) => {
    const action = new URL(route.request().url()).searchParams.get('action');
    const body = action === 'get_accounts' ? { success: true, accounts: SOCIAL_ACCOUNTS } : { success: true, posts: POSTS };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/index.php?action=graphql/api*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { entries: RELEASE_NOTES } }),
    }),
  );
  await page.addInitScript(() => {
    try {
      window.sessionStorage.setItem('ccrm_notif_banner_dismissed', '1');
      window.localStorage.setItem('ccrm_view_size', new URLSearchParams(location.search).get('vs') || 'normal');
    } catch {
      /* private mode */
    }
  });
}

/* ------------------------------------------------------------------ capture */

let navCounter = 0;

async function openModule(page, hash, size) {
  navCounter++;
  // A real document load every time, so a view never inherits the last shot's tab or filter.
  await page.goto(`/?shot=${navCounter}${size ? `&vs=${size}` : ''}${hash}`, { waitUntil: 'domcontentloaded' });
  const preset = page.locator('button:has-text("erik@rekonstav.sk"), button:has-text("Erik")').first();
  if (await preset.isVisible({ timeout: 700 }).catch(() => false)) await preset.click({ force: true }).catch(() => {});
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 20_000 });
  await page
    .waitForFunction(
      () => {
        const main = document.querySelector('main');
        if (!main || main.querySelector('.animate-spin')) return false;
        return (main.innerText ?? '').trim().length > 60;
      },
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => {});
  // Enter animations, Chart.js first paint, lazy chunks.
  await page.waitForTimeout(1600);
}

/** Describes what is on screen, so an empty or half-loaded shot is caught before it ships. */
async function inspect(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    const text = (main?.innerText ?? '').replace(/\s+/g, ' ').trim();
    return {
      textLength: text.length,
      spinner: !!main?.querySelector('.animate-spin'),
      toast: !!document.querySelector('[role="status"]:not(.sr-only)') && /✕/.test(document.body.innerText),
      sample: text.slice(0, 90),
    };
  });
}

/** Hides floating widgets pinned to the bottom-right corner (the Copilot orb) so they never sit in a crop. */
async function hideCornerWidgets(page) {
  await page.addStyleTag({ content: '[aria-label="Open AI Executive Copilot"] { display: none !important; }' });
  await page.evaluate(() => {
    // The Copilot orb is positioned by transform from top-left, so its rect says nothing about its corner.
    document.querySelectorAll('[class*="z-[9990]"]').forEach((el) => { el.style.visibility = 'hidden'; });
    for (const el of document.querySelectorAll('body *')) {
      const style = getComputedStyle(el);
      if (style.position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 400 && r.height < 400 && r.right > innerWidth - 140 && r.bottom > innerHeight - 160) el.style.visibility = 'hidden';
    }
  });
}

async function frameOf(page) {
  const box = await page.locator('main').first().boundingBox();
  if (!box) throw new Error('No <main> to crop to');
  // Same aspect for every module: as wide as the shorter dimension allows, from the top-left.
  const width = Math.min(box.width, box.height * ASPECT);
  return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(width), height: Math.round(width / ASPECT) };
}

/** PNG -> WebP through the browser's own encoder (no native image dependency). */
async function toWebp(encoderPage, png) {
  for (const quality of QUALITIES) {
    const b64 = await encoderPage.evaluate(
      async ({ data, q }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', q));
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(bin);
      },
      { data: png.toString('base64'), q: quality },
    );
    const out = Buffer.from(b64, 'base64');
    if (out.length <= MAX_BYTES || quality === QUALITIES.at(-1)) return { out, quality };
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const ownsLock = !process.env.QA_LOCK_OWNER;
  if (ownsLock) {
    await admitRun({ scope: 'module screenshots', port: PORT, checkPort: process.env.QA_REUSE_SERVER !== '1' });
  }
  let server = null;
  let browser = null;
  try {
    server = await startServer();
    browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
    const context = await browser.newContext({
      baseURL: APP_URL,
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: 'light',
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    await installDemoBackend(page);
    await installExtras(page);
    const encoder = await context.newPage();
    await encoder.goto('about:blank');

    const rows = [];
    for (const id of ids) {
      await openModule(page, MODULES[id], SIZE_OVERRIDES[id]);
      await hideCornerWidgets(page);
      const state = await inspect(page);
      const clip = await frameOf(page);
      const png = await page.screenshot({ clip, type: 'png' });
      const { out, quality } = await toWebp(encoder, png);
      const file = path.join(OUT_DIR, `${id}.webp`);
      writeFileSync(file, out);
      rows.push({ id, kb: (statSync(file).size / 1024).toFixed(0), quality, ...clip, ...state });
      const flags = [state.spinner && 'SPINNER', state.toast && 'TOAST', state.textLength < 200 && 'THIN'].filter(Boolean).join(' ');
      console.log(`${id.padEnd(13)} ${String(rows.at(-1).kb).padStart(4)} KB  q${quality}  ${clip.width}x${clip.height}  text:${state.textLength}  ${flags}`);
    }
    const heavy = rows.filter((r) => Number(r.kb) * 1024 > MAX_BYTES);
    console.log(`\n${rows.length} screenshot(s) -> ${path.relative(ROOT, OUT_DIR)}${heavy.length ? `  (${heavy.length} over 150 KB!)` : ''}`);
    console.log('Look at every image before committing: empty states, spinners, toasts and open popovers need a re-shoot.');
  } finally {
    await browser?.close().catch(() => {});
    if (server?.pid) killTree(server.pid);
    if (ownsLock) releaseRunLock();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
