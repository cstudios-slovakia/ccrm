import type { Page } from '@playwright/test';
import { installTimeTrackingMock, timeTrackingSeed } from './timeTrackingMock';

/**
 * Deterministic CRM dataset served to the app in place of the PHP backend.
 *
 * Two things make this fixture load-bearing rather than decorative:
 *
 *  1. `installed: true` is mandatory. `App.tsx` gates `applyServerData(data)`
 *     behind that flag, so a payload without it leaves every collection empty
 *     and the crawler ends up "auditing" twelve empty states.
 *  2. Every collection is populated. An empty register renders a placeholder
 *     row with no click handler, which silently removes detail views, drawers
 *     and sub-tab routing from the crawl.
 *
 * Dates are derived from the run date so calendars and deadline views always
 * have something in the current month.
 */

const DAY = 24 * 60 * 60 * 1000;

function isoDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * DAY);
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().split('T')[0];
}

function isoStamp(offsetDays = 0, time = '09:30'): string {
  return `${isoDate(offsetDays)} ${time}`;
}

export const TEST_USER = {
  id: 'user-erik',
  name: 'Erik',
  email: 'erik@crm.com',
  role: 'Admin',
  color: '#4f46e5',
  password: 'password',
  activityLog: [
    { id: 'act-1', action: 'Login', timestamp: isoStamp(0, '08:00'), type: 'login', details: 'QA session' },
  ],
  metadata_json: JSON.stringify({
    leadTableViews: {},
    leadFilters: {},
    emailSettings: { isValidated: true },
    // An existing install's admin: the preferences blob is there, and the module
    // setup wizard has been dealt with. Without this the user would look
    // brand-new (see utils/moduleWizard.ts) and the wizard would cover the
    // screen in every test. moduleSetupWizard.spec.ts opts in to the new-admin
    // case through installBackendMocks({ user }).
    // `themeMode` and `theme` are what the first-login migration always writes
    // alongside any other preference. Leaving them out would let the first
    // preference the app saves (opening Updates stores `seenUpdateId`) fill in
    // the defaults — themeMode "system" — and the theme adoption effect would
    // then undo whatever appearance the test had forced.
    preferences: { themeMode: 'system', theme: 'basic', moduleWizardCompletedAt: '2026-01-01T00:00:00.000Z' },
  }),
};

export const SECOND_USER = {
  id: 'user-maria',
  name: 'Mária',
  email: 'maria@crm.com',
  role: 'Manager',
  color: '#0ea5e9',
  activityLog: [],
  metadata_json: '{}',
};

const LEAD_STATES = ['new', 'contacted', 'offer sent', 'accepted', 'rejected'];
const LEAD_SOURCES = ['showroom', 'facebook', 'instagram', 'website'];
const LEAD_CATEGORIES = ['Products', 'Services'];
const TASK_STATES = ['New', 'In progress', 'Blocked', 'Done'];

/**
 * `Silvia` is deliberately first and has a rich timeline with attachments: she
 * is the lead the specs open for the lead detail view and its task, project and
 * invoice links. She is a pipeline lead, not a client record.
 */
const LEADS = [
  {
    id: 'lead-silvia',
    name: 'Silvia',
    city: 'Bratislava',
    clientType: 'person',
    status: 'accepted',
    source: 'website',
    owner: 'Erik',
    value: 2500,
    createdAt: isoStamp(-40, '10:00'),
    rating: 4,
    phone: '+421 900 111 222',
    email: 'silvia@example.com',
    address: { street: 'Hlavná 1', city: 'Bratislava', postalCode: '81101', country: 'Slovakia' },
    categories: ['Services'],
    interestNote: 'Rekonštrukcia strechy na rodinnom dome.',
    timeline: [
      {
        id: 'ev-silvia-1',
        type: 'note',
        timestamp: isoStamp(-30, '09:00'),
        title: 'Prvý kontakt',
        content: 'Klientka volala kvôli cenovej ponuke.',
        author: 'Erik',
      },
      {
        id: 'ev-silvia-2',
        type: 'offer',
        timestamp: isoStamp(-20, '14:30'),
        title: 'Cenová ponuka odoslaná',
        content: 'Odoslaná ponuka na rekonštrukciu.',
        amount: 2500,
        fileName: 'ponuka-silvia.pdf',
        fileSize: '312 KB',
        fileType: 'offer',
        filePath: '/uploads/ponuka-silvia.pdf',
        attachments: [{ name: 'ponuka-silvia.pdf', size: '312 KB', path: '/uploads/ponuka-silvia.pdf' }],
        author: 'Erik',
      },
      {
        id: 'ev-silvia-3',
        type: 'appointment',
        timestamp: isoStamp(2, '11:00'),
        title: 'Obhliadka na mieste',
        content: 'Stretnutie na adrese klientky.',
        extraTime: '12:00',
        author: 'Erik',
      },
      {
        id: 'ev-silvia-4',
        type: 'offer',
        timestamp: isoStamp(-15, '10:00'),
        title: 'Zmluva podpísaná',
        content: 'Podpísaná zmluva o dielo.',
        fileName: 'zmluva-silvia.pdf',
        fileSize: '245 KB',
        fileType: 'contract',
        filePath: '/uploads/zmluva-silvia.pdf',
        attachments: [{ name: 'zmluva-silvia.pdf', size: '245 KB', path: '/uploads/zmluva-silvia.pdf' }],
        author: 'Erik',
      },
    ],
  },
  {
    id: 'lead-novak',
    name: 'Novák Stavby s.r.o.',
    city: 'Košice',
    clientType: 'business',
    status: 'offer sent',
    source: 'facebook',
    owner: 'Mária',
    value: 18400,
    createdAt: isoStamp(-25, '11:15'),
    rating: 5,
    phone: '+421 902 333 444',
    email: 'info@novakstavby.sk',
    address: { street: 'Priemyselná 12', city: 'Košice', postalCode: '04001', country: 'Slovakia' },
    companyId: '12345678',
    taxId: '2023456789',
    vatId: 'SK2023456789',
    contactPerson: 'Ján Novák',
    website: 'https://novakstavby.sk',
    legalForm: 's.r.o.',
    categories: ['Products', 'Services'],
    clientCategoryId: 'cc-construction-roofing',
    timeline: [
      {
        id: 'ev-novak-1',
        type: 'email',
        timestamp: isoStamp(-18, '08:45'),
        title: 'Dopyt na materiál',
        content: 'Firma žiada ponuku na 400 m² krytiny.',
        isOutgoing: false,
        author: 'Mária',
      },
      {
        id: 'ev-novak-2',
        type: 'offer',
        timestamp: isoStamp(-5, '16:20'),
        title: 'Faktúra FA-2026-014',
        content: 'Vystavená faktúra za prvú etapu.',
        amount: 9200,
        fileName: 'FA-2026-014.pdf',
        fileSize: '188 KB',
        fileType: 'invoice',
        filePath: '/uploads/FA-2026-014.pdf',
        attachments: [{ name: 'FA-2026-014.pdf', size: '188 KB', path: '/uploads/FA-2026-014.pdf' }],
        author: 'Mária',
      },
    ],
  },
  {
    id: 'lead-horvath',
    name: 'Horváth Peter',
    city: 'Nitra',
    clientType: 'person',
    status: 'contacted',
    source: 'instagram',
    owner: 'Erik',
    value: 800,
    createdAt: isoStamp(-12, '13:40'),
    rating: 3,
    phone: '+421 903 555 666',
    email: 'peter.horvath@example.com',
    categories: ['Products'],
    timeline: [
      {
        id: 'ev-horvath-1',
        type: 'phone',
        timestamp: isoStamp(-10, '15:05'),
        title: 'Telefonát',
        content: 'Zaujíma sa o cenu okien.',
        author: 'Erik',
      },
    ],
  },
  {
    id: 'lead-partner',
    name: 'Alfa Partner a.s.',
    city: 'Žilina',
    clientType: 'partner',
    status: 'new',
    source: 'showroom',
    owner: 'Mária',
    value: 5200,
    createdAt: isoStamp(-3, '09:10'),
    phone: '+421 904 777 888',
    email: 'kontakt@alfapartner.sk',
    companyId: '87654321',
    legalForm: 'a.s.',
    categories: ['Services'],
    timeline: [],
  },
  // Client records. The Clients register lists only these (utils/clientRecord.ts:
  // an id starting `client-`, or a positive adjustment); every lead above is a
  // pipeline lead and never appears there. They are appended, not prepended, so
  // `leads[0]` is still Silvia, and their names are unique so a name-based picker
  // or filter never finds two matches.
  {
    id: 'client-kovac',
    name: 'Kováč Reality s.r.o.',
    city: 'Trnava',
    clientType: 'business',
    status: 'accepted',
    source: 'website',
    owner: 'Erik',
    value: 12600,
    createdAt: isoStamp(-60, '09:30'),
    rating: 5,
    phone: '+421 905 123 456',
    email: 'obchod@kovacreality.sk',
    address: { street: 'Štefánikova 8', city: 'Trnava', postalCode: '91701', country: 'Slovakia' },
    companyId: '45678901',
    taxId: '2045678901',
    vatId: 'SK2045678901',
    contactPerson: 'Marek Kováč',
    website: 'https://kovacreality.sk',
    legalForm: 's.r.o.',
    categories: ['Services'],
    timeline: [
      {
        id: 'ev-kovac-1',
        type: 'email',
        timestamp: isoStamp(-45, '10:10'),
        title: 'Rámcová dohoda',
        content: 'Klient potvrdil rámcovú dohodu na správu nehnuteľností.',
        isOutgoing: false,
        author: 'Erik',
      },
      {
        id: 'ev-kovac-2',
        type: 'offer',
        timestamp: isoStamp(-30, '13:00'),
        title: 'Zmluva podpísaná',
        content: 'Podpísaná rámcová zmluva.',
        fileName: 'zmluva-kovac.pdf',
        fileSize: '201 KB',
        fileType: 'contract',
        filePath: '/uploads/zmluva-kovac.pdf',
        attachments: [{ name: 'zmluva-kovac.pdf', size: '201 KB', path: '/uploads/zmluva-kovac.pdf' }],
        author: 'Erik',
      },
      {
        id: 'ev-kovac-3',
        type: 'appointment',
        timestamp: isoStamp(4, '09:00'),
        title: 'Štvrťročná kontrola',
        content: 'Stretnutie v kancelárii klienta.',
        extraTime: '10:00',
        author: 'Erik',
      },
    ],
  },
  {
    id: 'client-bielikova',
    name: 'Bieliková Lenka',
    city: 'Banská Bystrica',
    clientType: 'person',
    status: 'accepted',
    source: 'instagram',
    owner: 'Mária',
    value: 950,
    createdAt: isoStamp(-18, '15:20'),
    rating: 4,
    phone: '+421 906 321 654',
    email: 'lenka.bielikova@example.com',
    address: { street: 'Námestie SNP 3', city: 'Banská Bystrica', postalCode: '97401', country: 'Slovakia' },
    categories: ['Products'],
    timeline: [],
  },
];

const TASKS = [
  {
    id: 'task-1',
    title: 'Zavolať klientke Silvii',
    description: 'Potvrdiť termín obhliadky.',
    status: 'New',
    priority: 'high',
    startDate: isoDate(0),
    deadline: isoDate(1),
    deadlineTime: '10:00',
    owner: 'Erik',
    createdBy: 'Erik',
    assignedUsers: ['Erik'],
    relatedLeadId: 'lead-silvia',
    // A colleague's e-mail reminder — ticking "Notify me" must leave it alone.
    emailReminders: { Mária: '1d' },
  },
  {
    id: 'task-2',
    title: 'Pripraviť cenovú ponuku',
    description: 'Kalkulácia materiálu pre Novák Stavby.',
    status: 'In progress',
    priority: 'medium',
    startDate: isoDate(-2),
    deadline: isoDate(3),
    deadlineTime: '16:00',
    owner: 'Mária',
    createdBy: 'Erik',
    assignedUsers: ['Mária', 'Erik'],
    relatedLeadId: 'lead-novak',
  },
  {
    id: 'task-3',
    title: 'Objednať krytinu',
    description: 'Doobjednať 120 m² krytiny zo skladu.',
    status: 'Blocked',
    priority: 'low',
    deadline: isoDate(6),
    owner: 'Erik',
    createdBy: 'Erik',
    assignedUsers: ['Erik'],
    isLocking: true,
    relatedProjectId: 'project-1',
  },
  {
    id: 'task-4',
    title: 'Uzavrieť mesačnú fakturáciu',
    description: 'Skontrolovať neuhradené faktúry.',
    status: 'Done',
    priority: 'medium',
    deadline: isoDate(-1),
    deadlineTime: '17:00',
    owner: 'Mária',
    createdBy: 'Mária',
    assignedUsers: ['Mária'],
    completedBy: 'Mária',
    completedAt: isoStamp(-1, '16:40'),
    relatedProjectId: 'project-1',
  },
];

const PROJECT_TYPES = [
  {
    id: 'ptype-roof',
    name: 'Rekonštrukcia strechy',
    description: 'Kompletná rekonštrukcia plochej alebo šikmej strechy.',
    icon: 'Home',
    color: '#4f46e5',
    hasTimeline: true,
    hasGantt: true,
    hasDeadline: true,
    hasInvoiceDate: true,
    deadlineWarningDays: 7,
    deadlineRequired: false,
    hasFiles: true,
    fileFields: [
      { id: 'file_contract', name: 'Zmluva', required: false },
      { id: 'file_gdpr', name: 'Súhlas GDPR', required: false },
    ],
    attributes: [
      { id: 'attr-area', name: 'Plocha (m²)', type: 'number', required: true },
      { id: 'attr-start', name: 'Začiatok realizácie', type: 'date', required: false },
      { id: 'attr-note', name: 'Poznámka', type: 'textarea', required: false },
      { id: 'attr-variant', name: 'Variant', type: 'select', required: false, options: ['Štandard', 'Premium'] },
      { id: 'attr-budget', name: 'Rozpočet', type: 'money', required: false },
    ],
    timelineEventTypes: [
      { id: 'pet-visit', name: 'Obhliadka', color: '#0ea5e9', icon: 'Eye', attributes: [] },
      {
        id: 'pet-work',
        name: 'Realizácia',
        color: '#16a34a',
        icon: 'Hammer',
        attributes: [{ id: 'attr-cost', name: 'Náklad etapy', type: 'money', required: false }],
      },
    ],
  },
  {
    id: 'ptype-windows',
    name: 'Výmena okien',
    description: 'Demontáž a montáž okenných výplní.',
    icon: 'Square',
    color: '#0ea5e9',
    hasTimeline: true,
    hasGantt: false,
    attributes: [{ id: 'attr-count', name: 'Počet okien', type: 'number', required: true }],
    timelineEventTypes: [],
  },
];

const PROJECTS = [
  {
    id: 'project-1',
    projectTypeId: 'ptype-roof',
    name: 'Strecha Silvia — etapa 1',
    leadId: 'lead-silvia',
    clientId: 'lead-silvia',
    status: 'active',
    // Three projects, three states of the star rating: top priority, a middling
    // one, and one nobody has rated — so the rating filter has something to
    // include and something to exclude whichever way it is set.
    rating: 5,
    completionDeadline: isoDate(4),
    invoiceDate: isoDate(10),
    managers: ['Erik'],
    data: {
      'attr-area': 145,
      'attr-start': isoDate(5),
      'attr-note': 'Prístup z dvora.',
      'attr-variant': 'Premium',
      'attr-budget': { amount: 18400, currency: 'EUR' },
      file_contract: [
        { name: 'zmluva-strecha-silvia.pdf', size: '420 KB', path: '/uploads/zmluva-strecha-silvia.pdf' },
      ],
    },
    customFileFields: [
      {
        id: 'pfile_photos',
        name: 'Fotodokumentácia',
        files: [{ name: 'strecha-pred.jpg', size: '1.2 MB', path: '/uploads/strecha-pred.jpg' }],
      },
    ],
    timeline: [
      {
        id: 'pev-1',
        type: 'event',
        eventType: 'pet-visit',
        timestamp: isoStamp(-4, '10:00'),
        title: 'Obhliadka vykonaná',
        content: 'Zameranie hotové.',
        data: {},
      },
    ],
    gantt: [
      { id: 'g-1', title: 'Demontáž', contactId: 'lead-silvia', startDate: isoDate(5), endDate: isoDate(7), progress: 0 },
      { id: 'g-2', title: 'Montáž krytiny', contactId: 'lead-silvia', startDate: isoDate(8), endDate: isoDate(14), progress: 0 },
    ],
  },
  {
    id: 'project-2',
    projectTypeId: 'ptype-windows',
    leadId: 'lead-novak',
    clientId: 'lead-novak',
    status: 'on_hold',
    rating: 2,
    managers: ['Mária'],
    data: { 'attr-count': 24 },
    timeline: [],
    gantt: [],
  },
  {
    // Late, and paired with nobody: before projects carried a name this one had
    // nothing to be called at all.
    id: 'project-3',
    projectTypeId: 'ptype-roof',
    name: 'Havarijná oprava — bytový dom Košice',
    leadId: null,
    clientId: null,
    status: 'active',
    completionDeadline: isoDate(-6),
    invoiceDate: isoDate(-2),
    managers: [],
    data: { 'attr-area': 62 },
    timeline: [],
    gantt: [],
  },
];

const WAREHOUSES = [
  { id: 'wh-main', name: 'Hlavný sklad', code: 'HL', address: 'Bratislava, Hlavná 1', managerUserId: 'user-erik', isDefault: true, createdAt: isoStamp(-90) },
  { id: 'wh-east', name: 'Sklad Východ', code: 'VY', address: 'Košice, Priemyselná 12', managerUserId: 'user-maria', isDefault: false, createdAt: isoStamp(-60) },
];

const SUPPLIERS = [
  {
    id: 'sup-1',
    name: 'Krytiny SK s.r.o.',
    companyId: '11223344',
    taxId: '2011223344',
    vatId: 'SK2011223344',
    street: 'Skladová 8',
    city: 'Trnava',
    postalCode: '91701',
    country: 'Slovakia',
    email: 'objednavky@krytiny.sk',
    phone: '+421 905 111 000',
    website: 'https://krytiny.sk',
    iban: 'SK1112000000001234567890',
    swift: 'GIBASKBX',
    paymentDueDays: 30,
    notes: 'Zľava 8 % nad 5 000 €.',
    contacts: [{ name: 'Lukáš Malý', position: 'Obchodník', phone: '+421 905 111 001', email: 'lukas@krytiny.sk' }],
    createdAt: isoStamp(-80),
  },
  {
    id: 'sup-2',
    name: 'Okná Plus a.s.',
    companyId: '55667788',
    street: 'Výrobná 3',
    city: 'Nitra',
    postalCode: '94901',
    country: 'Slovakia',
    email: 'info@oknaplus.sk',
    phone: '+421 906 222 000',
    paymentDueDays: 14,
    contacts: [],
    createdAt: isoStamp(-70),
  },
];

const WAREHOUSE_ITEMS = [
  {
    id: 'item-tile',
    sku: 'KRY-001',
    barcode: '8590001234567',
    name: 'Betónová krytina antracit',
    description: 'Základná betónová taška.',
    category: 'Krytina',
    categories: ['Krytina'],
    unit: 'ks',
    minStock: 200,
    optimalStock: 1200,
    defaultLocation: 'A-01',
    hasExpiration: false,
    defaultSellPrice: 3.9,
    avgPurchasePrice: 2.4,
    lastPurchasePrice: 2.5,
    createdAt: isoStamp(-75),
  },
  {
    id: 'item-foil',
    sku: 'FOL-002',
    name: 'Difúzna fólia 150 g',
    description: 'Rolka 75 m².',
    category: 'Fólie',
    categories: ['Fólie'],
    unit: 'balenie',
    minStock: 10,
    optimalStock: 60,
    defaultLocation: 'B-04',
    hasExpiration: true,
    defaultSellPrice: 92,
    avgPurchasePrice: 61,
    lastPurchasePrice: 64,
    createdAt: isoStamp(-70),
  },
  {
    id: 'item-window',
    sku: 'OKN-003',
    name: 'Okno 120x140 trojsklo',
    category: 'Okná',
    categories: ['Okná'],
    unit: 'ks',
    minStock: 4,
    optimalStock: 30,
    hasExpiration: false,
    defaultSellPrice: 340,
    avgPurchasePrice: 232,
    lastPurchasePrice: 240,
    createdAt: isoStamp(-50),
  },
];

const WAREHOUSE_STOCK = [
  { warehouseId: 'wh-main', itemId: 'item-tile', quantity: 940, reservedQuantity: 120, location: 'A-01' },
  { warehouseId: 'wh-main', itemId: 'item-foil', quantity: 8, reservedQuantity: 0, location: 'B-04' },
  { warehouseId: 'wh-east', itemId: 'item-window', quantity: 17, reservedQuantity: 2, location: 'C-02' },
];

const WAREHOUSE_BATCHES = [
  {
    id: 'batch-1',
    itemId: 'item-foil',
    warehouseId: 'wh-main',
    batchNumber: 'LOT-2026-07',
    expirationDate: isoDate(120),
    initialQuantity: 20,
    currentQuantity: 8,
    purchasePrice: 61,
    createdAt: isoStamp(-40),
  },
];

const WAREHOUSE_MOVEMENTS = [
  {
    id: 'mv-1',
    documentNumber: 'PRI-2026-0001',
    type: 'inward',
    status: 'confirmed',
    warehouseId: 'wh-main',
    supplierId: 'sup-1',
    totalCostValue: 2400,
    totalSellValue: 3900,
    totalProfitValue: 1500,
    createdBy: 'Erik',
    note: 'Príjem krytiny.',
    issuedAt: isoStamp(-30, '08:00'),
    createdAt: isoStamp(-30, '08:00'),
    items: [
      { id: 'mvi-1', movementId: 'mv-1', itemId: 'item-tile', quantity: 1000, unitPurchasePrice: 2.4, unitSellPrice: 3.9, totalPrice: 2400 },
    ],
  },
  {
    id: 'mv-2',
    documentNumber: 'VYD-2026-0004',
    type: 'outward',
    status: 'confirmed',
    warehouseId: 'wh-main',
    leadId: 'lead-silvia',
    totalCostValue: 144,
    totalSellValue: 234,
    totalProfitValue: 90,
    createdBy: 'Erik',
    note: 'Výdaj na realizáciu.',
    issuedAt: isoStamp(-6, '13:00'),
    createdAt: isoStamp(-6, '13:00'),
    items: [
      { id: 'mvi-2', movementId: 'mv-2', itemId: 'item-tile', quantity: 60, unitPurchasePrice: 2.4, unitSellPrice: 3.9, totalPrice: 144 },
    ],
  },
];

const FINANCIAL_CATEGORIES = [
  { id: 'fc-income', type: 'income', name: 'Realizácie', level: 1, color: '#16a34a', icon: 'TrendingUp', createdAt: isoStamp(-100) },
  { id: 'fc-income-roof', type: 'income', name: 'Strechy', parentId: 'fc-income', level: 2, color: '#22c55e', createdAt: isoStamp(-100) },
  { id: 'fc-expense', type: 'expense', name: 'Materiál', level: 1, color: '#dc2626', icon: 'Package', createdAt: isoStamp(-100) },
  { id: 'fc-expense-wages', type: 'expense', name: 'Mzdy', level: 1, color: '#f97316', icon: 'Users', createdAt: isoStamp(-100) },
];

const CLIENT_CATEGORIES = [
  { id: 'cc-construction', name: 'Stavebníctvo', level: 1, sortOrder: 0, color: '#0ea5e9', icon: 'Layers', createdAt: isoStamp(-90) },
  { id: 'cc-construction-roofing', name: 'Strechári', parentId: 'cc-construction', level: 2, sortOrder: 0, color: null, icon: 'Folder', createdAt: isoStamp(-90) },
  { id: 'cc-retail', name: 'Maloobchod', level: 1, sortOrder: 1, color: '#a855f7', icon: 'Layers', createdAt: isoStamp(-90) },
];

const FINANCIAL_RECORDS = [
  {
    id: 'fr-1',
    type: 'income',
    subtype: 'invoice',
    title: 'Faktúra — Silvia, 1. etapa',
    description: 'Prvá etapa rekonštrukcie.',
    categoryId: 'fc-income-roof',
    categoryPath: 'Realizácie / Strechy',
    amountPlanned: 2500,
    amountReal: 2500,
    currency: 'EUR',
    status: 'paid',
    issueDate: isoDate(-20),
    dueDate: isoDate(-6),
    paidDate: isoDate(-8),
    paymentMethod: 'bank_transfer',
    isRecurring: false,
    projectId: 'project-1',
    clientId: 'lead-silvia',
    invoiceNumber: 'FA-2026-011',
    taxRate: 20,
    createdBy: 'Erik',
    createdAt: isoStamp(-20),
  },
  {
    id: 'fr-2',
    type: 'income',
    subtype: 'invoice',
    title: 'Faktúra — Novák Stavby',
    categoryId: 'fc-income',
    amountPlanned: 9200,
    amountReal: 0,
    currency: 'EUR',
    status: 'pending',
    issueDate: isoDate(-5),
    dueDate: isoDate(9),
    isRecurring: false,
    projectId: 'project-2',
    clientId: 'lead-novak',
    invoiceNumber: 'FA-2026-014',
    taxRate: 20,
    createdBy: 'Mária',
    createdAt: isoStamp(-5),
  },
  {
    id: 'fr-3',
    type: 'expense',
    subtype: 'material',
    title: 'Nákup krytiny',
    categoryId: 'fc-expense',
    amountPlanned: 2400,
    amountReal: 2400,
    currency: 'EUR',
    status: 'paid',
    issueDate: isoDate(-30),
    dueDate: isoDate(-2),
    paidDate: isoDate(-4),
    paymentMethod: 'bank_transfer',
    isRecurring: false,
    createdBy: 'Erik',
    createdAt: isoStamp(-30),
  },
  {
    id: 'fr-4',
    type: 'expense',
    subtype: 'salary',
    title: 'Mzdy — mesačné',
    categoryId: 'fc-expense-wages',
    amountPlanned: 6400,
    amountReal: 6400,
    currency: 'EUR',
    status: 'overdue',
    issueDate: isoDate(-15),
    dueDate: isoDate(-3),
    isRecurring: true,
    recurringFrequency: 'monthly',
    recurringConfig: { monthlyType: 'day_of_month', dayOfMonth: 15 },
    recurringStartDate: isoDate(-200),
    createdBy: 'Erik',
    createdAt: isoStamp(-15),
  },
  {
    // Paid, but never filed under a category — the overview table must still count it.
    id: 'fr-5',
    type: 'expense',
    subtype: 'overhead',
    title: 'Kancelárske potreby',
    categoryId: null,
    amountPlanned: 180,
    amountReal: 180,
    currency: 'EUR',
    status: 'paid',
    issueDate: isoDate(-10),
    paidDate: isoDate(-10),
    paymentMethod: 'card',
    isRecurring: false,
    createdBy: 'Mária',
    createdAt: isoStamp(-10),
  },
];

const MEETING_NOTES = [
  {
    id: 'mn-1',
    title: 'Porada — pondelok',
    content: 'Prebrali sme stav projektov a fakturáciu.',
    createdAt: isoStamp(-7, '09:00'),
    author: 'Erik',
    participants: ['Erik', 'Mária'],
    date: isoDate(-7),
    tags: ['porada'],
  },
  {
    id: 'mn-2',
    title: 'Stretnutie s Novák Stavby',
    content: 'Dohodnutý rozsah dodávky materiálu.',
    createdAt: isoStamp(-2, '14:00'),
    author: 'Mária',
    participants: ['Mária'],
    date: isoDate(-2),
    tags: ['klient'],
  },
];

const UNIFIED_ENTRIES = [
  {
    id: 'ue-docs',
    name: 'Zmluvy a dokumenty',
    entryName: 'Dokument',
    folderName: 'Priečinok',
    icon: 'FileText',
    color: '#6366f1',
    modules: ['title', 'due_date', 'file', 'client'],
    folderModules: ['title'],
    foldersEnabled: true,
    showFolderSummary: true,
    warningDays: 30,
    archived: false,
  },
  {
    id: 'ue-technika',
    name: 'Technika a náradie',
    entryName: 'Zariadenie',
    folderName: 'Kategória',
    icon: 'Wrench',
    color: '#f59e0b',
    modules: ['title', 'number', 'money'],
    folderModules: ['title'],
    foldersEnabled: true,
    showFolderSummary: false,
    warningDays: 30,
    archived: false,
  },
];

const UNIFIED_ENTRIES_DATA = {
  'ue-docs': [
    { id: 'ue-f-1', parentId: null, isFolder: true, title: 'Zmluvy 2026', icon: 'Folder' },
    {
      id: 'ue-r-1',
      parentId: 'ue-f-1',
      isFolder: false,
      title: 'Zmluva o dielo — Silvia',
      dueDate: isoDate(45),
      fileName: 'zmluva-silvia.pdf',
      fileSize: '204 KB',
      filePath: '/uploads/zmluva-silvia.pdf',
      clientId: 'lead-silvia',
      leadId: 'lead-silvia',
    },
    {
      id: 'ue-r-2',
      parentId: null,
      isFolder: false,
      title: 'Revízia bleskozvodu',
      dueDate: isoDate(10),
      fileName: 'revizia.pdf',
      fileSize: '96 KB',
      filePath: '/uploads/revizia.pdf',
      clientId: 'lead-novak',
    },
  ],
  'ue-technika': [
    { id: 'ue-t-f-1', parentId: null, isFolder: true, title: 'Elektrické náradie', icon: 'Folder' },
    { id: 'ue-t-1', parentId: 'ue-t-f-1', isFolder: false, title: 'Falcovačka Schlebach Pico', numberValue: 2, moneyAmount: 8450, moneyCurrency: 'EUR' },
    { id: 'ue-t-2', parentId: 'ue-t-f-1', isFolder: false, title: 'Zvárací automat Leister', numberValue: 1, moneyAmount: 3200, moneyCurrency: 'CZK' },
    { id: 'ue-t-3', parentId: null, isFolder: false, title: 'Montážna plošina Genie Z-45', numberValue: 1, moneyAmount: 24900, moneyCurrency: 'EUR' },
  ],
};

const ROLES = [
  {
    name: 'Admin',
    permissions: {
      general_config: 'edit',
      pm_managers: 'edit',
      pipeline_stages: 'edit',
      traffic_sources: 'edit',
      system_reset: 'edit',
    },
  },
  {
    name: 'Manager',
    permissions: {
      general_config: 'view',
      pm_managers: 'view',
      pipeline_stages: 'view',
      traffic_sources: 'view',
      system_reset: 'nothing',
    },
  },
];

const SETTINGS = {
  systemName: 'CCRM',
  systemLanguage: 'sk',
  systemCurrency: 'EUR',
  leadStates: LEAD_STATES,
  leadSources: LEAD_SOURCES,
  leadCategories: LEAD_CATEGORIES,
  leadStateColors: {
    new: '#3b82f6',
    contacted: '#0ea5e9',
    'offer sent': '#f59e0b',
    accepted: '#16a34a',
    rejected: '#ef4444',
  },
  leadSourceColors: { showroom: '#8b5cf6', facebook: '#1d4ed8', instagram: '#db2777', website: '#0d9488' },
  leadCategoryColors: { Products: '#6366f1', Services: '#14b8a6' },
  leadStageGroups: {},
  leadStateParents: {},
  leadStateFollowUp: { contacted: true },
  // A phase SLA short enough that `lead-novak` (offer sent, 25 days old, never
  // moved) is breached, so the audit walks the overdue badge in the list, the
  // kanban card and the lead detail rather than only the settings input.
  leadStateSla: { 'offer sent': 5 },
  taskStates: TASK_STATES,
  taskStateColors: { New: '#3b82f6', 'In progress': '#f59e0b', Blocked: '#ef4444', Done: '#10b981' },
  // An outgoing mail server, as a working install has one. Without it the task
  // e-mail reminder warns that nothing can be sent instead of saying when.
  integrationsConfig: { emailProvider: 'smtp', smtpHost: 'smtp.crm.test', smtpPort: '465', smtpSecure: 'ssl' },
};

/** The exact JSON body the app expects from a `GET /sync.php`. */
export function buildSyncPayload() {
  return {
    installed: true,
    authenticated: true,
    dataVersion: 1,
    syncProtocol: 1,
    serverTime: new Date().toISOString(),
    leads: LEADS,
    tasks: TASKS,
    users: [TEST_USER, SECOND_USER],
    roles: ROLES,
    meetingNotes: MEETING_NOTES,
    unifiedEntries: UNIFIED_ENTRIES,
    unifiedEntriesData: UNIFIED_ENTRIES_DATA,
    customDashboards: [],
    projectTypes: PROJECT_TYPES,
    projects: PROJECTS,
    warehouses: WAREHOUSES,
    suppliers: SUPPLIERS,
    warehouseItems: WAREHOUSE_ITEMS,
    warehouseStock: WAREHOUSE_STOCK,
    warehouseBatches: WAREHOUSE_BATCHES,
    warehouseMovements: WAREHOUSE_MOVEMENTS,
    financialCategories: FINANCIAL_CATEGORIES,
    clientCategories: CLIENT_CATEGORIES,
    financialRecords: FINANCIAL_RECORDS,
    settings: SETTINGS,
  };
}

/**
 * Name of the client whose profile the dark-mode sweep drills into. It must be a
 * client *record* (see `client-kovac` above): `Silvia` is a pipeline lead, which
 * the Clients register does not list, so the register stayed empty and a click
 * on her name waited for the test timeout.
 */
export const DRILLDOWN_CLIENT = 'Kováč Reality s.r.o.';

/**
 * Installs the backend mocks and pre-seeds an authenticated admin session.
 *
 * Writes are acknowledged but discarded: the crawler is free to submit every
 * form it finds without touching a real database, and each test starts from the
 * same dataset.
 *
 * Two exceptions, and neither is a convenience — both are display preferences
 * the app reads back from the server, so discarding the write made the app look
 * like it had lost the setting:
 *
 * 1. The signed-in user's `metadata_json`. Every interface preference (the
 *    projects sort, a view toggle, a dismissed banner) lives in that blob, and
 *    the background poll replaces `currentUser` with the server's copy whenever
 *    the two differ — so a preference set during a test silently reverted a few
 *    seconds later. Tests that set one then looked like app bugs.
 * 2. A project type's `listColumns` — how the projects table is laid out for
 *    that type. It is stored on the type rather than the user, but the problem
 *    is identical: every navigation in these tests is a real page load, so the
 *    arrangement would come back from the mock exactly as the dataset declared
 *    it and never as the test had just saved it.
 */
export async function installBackendMocks(
  page: Page,
  /**
   * `user` is who is signed in. It defaults to the seeded admin; a spec passes a
   * different one to be a brand-new admin (no preferences blob) or a non-admin.
   */
  options: {
    user?: typeof TEST_USER | typeof SECOND_USER;
    /**
     * The appearance saved on the signed-in user's row. The app adopts the row's
     * value over the browser's, so a spec that forces dark mode must say so here
     * as well as in localStorage.
     */
    themeMode?: 'system' | 'light' | 'dark';
    /** Further accounts of the workspace, on top of the two seeded ones. */
    extraUsers?: (typeof TEST_USER)[];
    /**
     * How long after a password sign-in the passkeys mock lets a passkey be added
     * without the password (api/passkeys.php allows 300 s). 0 closes the window.
     */
    passkeyPwWindowMs?: number;
    /** Replaces the seeded role registry, for specs that need a role with exactly some permissions. */
    roles?: { name: string; permissions: Record<string, string> }[];
  } = {},
) {
  const baseUser = options.user ?? TEST_USER;
  /** When the last *password* sign-in happened; a passkey sign-in clears it. */
  let passkeyPwAuthAt: number | null = null;
  const signedIn = options.themeMode
    ? {
        ...baseUser,
        metadata_json: JSON.stringify({
          ...JSON.parse(baseUser.metadata_json),
          preferences: { ...(JSON.parse(baseUser.metadata_json).preferences ?? {}), themeMode: options.themeMode },
        }),
      }
    : baseUser;
  /** email -> the metadata_json the app last pushed for that user. */
  const pushedUserMeta = new Map<string, unknown>();
  /** project type id -> the listColumns the app last pushed for that type. */
  const pushedListColumns = new Map<string, unknown>();
  /** dashboard id -> dashboard pushed by the app. */
  const pushedCustomDashboards = new Map<string, any>();
  /**
   * The workspace's integrationsConfig as the app last pushed it. Settings ->
   * Visible Modules (and the module setup wizard) store `disabledModules` in
   * it, and every navigation here is a real page load, so without this a saved
   * choice would come straight back as the seed.
   */
  let pushedIntegrationsConfig: unknown;
  /** task id -> the title the app last pushed: time tracking joins a linked entry's title from it. */
  const pushedTaskTitles = new Map<string, string>();

  await page.route('**/sync.php**', (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      const payload = buildSyncPayload();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...payload,
          users: [...payload.users, ...(options.extraUsers ?? [])]
            .map((u) => (u.email === signedIn.email ? signedIn : u))
            .map((u) => (pushedUserMeta.has(u.email) ? { ...u, metadata_json: pushedUserMeta.get(u.email) } : u)),
          settings:
            pushedIntegrationsConfig === undefined
              ? payload.settings
              : { ...payload.settings, integrationsConfig: pushedIntegrationsConfig },
          projectTypes: payload.projectTypes.map((pt) =>
            pushedListColumns.has(pt.id) ? { ...pt, listColumns: pushedListColumns.get(pt.id) } : pt,
          ),
          customDashboards: Array.from(pushedCustomDashboards.values()),
        }),
      });
    }
    try {
      const body = request.postDataJSON() as {
        users?: { email?: string; metadata_json?: unknown }[];
        projectTypes?: { id?: string; listColumns?: unknown }[];
        customDashboards?: { id?: string }[];
        settings?: { integrationsConfig?: unknown };
        tasks?: { id?: string; title?: string }[];
      };
      for (const tk of body?.tasks ?? []) {
        if (tk?.id && typeof tk.title === 'string') pushedTaskTitles.set(tk.id, tk.title);
      }
      if (body?.settings?.integrationsConfig !== undefined) {
        pushedIntegrationsConfig = body.settings.integrationsConfig;
      }
      for (const u of body?.users ?? []) {
        if (u?.email && u.metadata_json !== undefined) pushedUserMeta.set(u.email, u.metadata_json);
      }
      for (const pt of body?.projectTypes ?? []) {
        if (pt?.id && pt.listColumns !== undefined) pushedListColumns.set(pt.id, pt.listColumns);
      }
      for (const cd of body?.customDashboards ?? []) {
        if (cd?.id) pushedCustomDashboards.set(cd.id, cd);
      }
    } catch {
      /* not JSON — nothing to remember */
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, serverTime: new Date().toISOString(), dataVersion: 1 }),
    });
  });

  await page.route('**/api/mail_broker.php**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        emails: [],
        total: 0,
        folders: { INBOX: 0, Sent: 0, Trash: 0 },
      }),
    }),
  );

  // Licence: a healthy, configured one. Given explicitly rather than left to the
  // catch-all below so the Settings -> Licence tab renders its real content for
  // the crawler instead of the "licensing not configured" placeholder. `active`
  // on purpose — the expiry banner is covered by unit tests over the pure
  // decision function (utils/license.test.ts), and a banner in every screenshot
  // of every audited module would drown the reports it appears in.
  await page.route('**/api/license.php**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        license: {
          configured: true,
          status: 'active',
          valid: true,
          keyMasked: 'CCRM-********QA01',
          expiresAt: '2099-12-31',
          daysRemaining: 3650,
          warnDays: 30,
          maxUsers: 25,
          seatsUsed: 4,
          customer: 'QA Automated Suite',
          plan: 'standard',
          activatedAt: '2026-01-01 09:00:00',
          lastCheckAt: '2026-01-01 09:00:00',
          lastAttemptAt: '2026-01-01 09:00:00',
          lastError: null,
          offlineDays: 0,
          updatesAllowed: true,
          updatesBlockedReason: null,
        },
      }),
    }),
  );

  // Everything else under /api/ and the upload endpoints: succeed quietly so a
  // missing PHP backend never shows up as an app defect.
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [], items: [], agents: [], accounts: [], posts: [] }),
    }),
  );

  // After the catch-all above, which would otherwise shadow it: the sign-in
  // screen needs `user` in the answer, not the catch-all's empty lists.
  await page.route('**/api/login.php', (route) => {
    passkeyPwAuthAt = Date.now();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, user: signedIn }),
    });
  });

  // Time tracking has its own endpoints (never the sync blob). After the catch-all, which would
  // otherwise answer them with empty lists.
  await installTimeTrackingMock(page, {
    user: signedIn,
    users: [TEST_USER, SECOND_USER, ...(options.extraUsers ?? [])].map((u) => ({ id: u.id, name: u.name })),
    roles: options.roles ?? ROLES,
    tasks: TASKS,
    projects: PROJECTS,
    employees: {
      [TEST_USER.id]: { id: 'emp-erik', kind: 'employee', salaryType: 'monthly', salaryAmount: 3200 },
      // A freelancer: hourly, no employer multiplier. The specs that need him add his login via extraUsers.
      'user-free': { id: 'emp-free', kind: 'contractor', salaryType: 'hourly', salaryAmount: 20 },
    },
    seed: timeTrackingSeed({ erik: TEST_USER.id, maria: SECOND_USER.id, free: 'user-free' }),
    tasksRenamed: pushedTaskTitles,
  });

  // Dashboard widgets query the analytics endpoint per widget, so this must be
  // registered AFTER the catch-all above: Playwright tries the most recently
  // added matching route first. Registered before it, every widget was answered
  // with an empty array and the crawler audited a dashboard of zeroes.
  await page.route('**/api/dashboard_query.php', async (route) => {
    let action = '';
    let sql = '';
    let statuses: string[] = [];
    let order = '';
    let owner = '';
    let limit = 5;
    try {
      const body = JSON.parse(route.request().postData() || '{}');
      action = (body.action as string) || '';
      sql = String(body?.params?.sql ?? body?.sql ?? '');
      statuses = Array.isArray(body?.params?.statuses) ? body.params.statuses.map(String) : [];
      order = String(body?.params?.order ?? '');
      owner = String(body?.params?.owner ?? '');
      limit = Number(body?.params?.limit ?? 5) || 5;
    } catch {
      action = '';
    }
    const isExplicitNone = statuses.includes('__none__');
    const inStatuses = (status: string) =>
      !isExplicitNone && (statuses.length === 0 || statuses.some((s) => s.trim().toLowerCase() === status.toLowerCase()));

    const data = (() => {
      switch (action) {
        case 'leads_count':
          return { count: LEADS.length };
        case 'pipeline_value': {
          if (isExplicitNone) return { value: 0 };
          const filtered = statuses.length > 0 ? LEADS.filter((l) => inStatuses(l.status)) : LEADS;
          return { value: filtered.reduce((sum, lead) => sum + (Number(lead.value) || 0), 0) };
        }
        case 'leads_by_status': {
          if (isExplicitNone) return [];
          const rows = [
            { status: 'new', count: 4, total_value: 18000 },
            { status: 'contacted', count: 3, total_value: 21000 },
            { status: 'offer sent', count: 2, total_value: 34000 },
            { status: 'accepted', count: 2, total_value: 51000 },
          ];
          if (statuses.length === 0) return rows;
          // Mirrors the real endpoint: the picked phases, in the picked order,
          // with a zero row standing in for a phase no lead sits in.
          return statuses
            .filter((s) => s !== '__none__')
            .map(
              (status) =>
                rows.find((row) => row.status.toLowerCase() === status.trim().toLowerCase()) ?? {
                  status,
                  count: 0,
                  total_value: 0,
                },
            );
        }
        case 'leads_by_source':
          return [
            { source: 'website', count: 5, total_value: 42000 },
            { source: 'referral', count: 3, total_value: 27000 },
            { source: 'campaign', count: 2, total_value: 11000 },
          ];
        case 'tasks_summary': {
          if (isExplicitNone) return [];
          // Grouped off the seeded tasks, using the app's own configured state
          // names, so the Dashboard's open-tasks and status cards colour their
          // segments the same way the task board does.
          const counts = new Map<string, number>();
          TASKS.forEach((task) => {
            if (inStatuses(task.status)) {
              counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
            }
          });
          return [...counts.entries()].map(([status, count]) => ({ status, count }));
        }
        case 'tasks_by_owner':
          return [
            { owner: 'Ada Admin', count: 6 },
            { owner: 'Sam Sales', count: 4 },
          ];
        case 'recent_leads': {
          const matching = LEADS.filter((lead) => inStatuses(lead.status));
          const sorted = [...matching].sort((a, b) =>
            order === 'value'
              ? Number(b.value) - Number(a.value)
              : String(b.createdAt).localeCompare(String(a.createdAt)),
          );
          return sorted.slice(0, limit).map((lead) => ({
            id: lead.id,
            name: lead.name,
            status: lead.status,
            value: lead.value,
            owner: lead.owner,
            source: lead.source,
            city: lead.city,
            client_type: lead.clientType,
            category: lead.categories?.[0] ?? null,
            created_at: lead.createdAt,
            total_count: matching.length,
          }));
        }
        case 'recent_tasks': {
          const matching = TASKS.filter(
            (task) =>
              inStatuses(task.status) &&
              (owner === '' || task.owner === owner || (task.assignedUsers ?? []).includes(owner)),
          );
          const sorted = [...matching].sort((a, b) =>
            order === 'deadline' ? String(a.deadline).localeCompare(String(b.deadline)) : 0,
          );
          return sorted.slice(0, limit).map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            owner: task.owner,
            deadline: task.deadline,
            deadline_time: task.deadlineTime ?? null,
            related_lead_id: task.relatedLeadId ?? null,
            lead_name: LEADS.find((lead) => lead.id === task.relatedLeadId)?.name ?? null,
            project_name: task.relatedProjectId ? 'QA project' : null,
            total_count: matching.length,
          }));
        }
        case 'recent_meetings':
          return [
            { id: 'm1', title: 'Kick-off — Nordic Retail', created_at: '2026-01-20' },
            { id: 'm2', title: 'Site survey', created_at: '2026-01-14' },
          ];
        // The `sql` action covers every widget the AI (or a preset) writes its
        // own query for; the table it reads is enough to answer plausibly.
        default:
          return /\bfrom\s+tasks\b/i.test(sql) ? [{ count: 8 }] : [{ count: 4 }];
      }
    })();

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data }),
    });
  });

  // Passkeys mock for WebAuthn tests & QA
  interface MockPasskey {
    id: string;
    name: string;
    created_at: string;
    last_used_at: string | null;
    aaguid: string;
    authenticator_name: string;
    age_days: number;
    age_hours: number;
    age_minutes: number;
    age_seconds: number;
    last_used_days: number | null;
    last_used_hours: number | null;
    last_used_minutes: number | null;
    last_used_seconds: number | null;
  }
  const pushedPasskeys: MockPasskey[] = [];

  await page.route('**/api/passkeys.php', async (route) => {
    let action = '';
    let body: any = {};
    try {
      body = JSON.parse(route.request().postData() || '{}');
      action = body.action || '';
    } catch {
      action = '';
    }

    if (action === 'status') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, available: true }),
      });
    }

    if (action === 'list') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, passkeys: pushedPasskeys }),
      });
    }

    if (action === 'register_options') {
      const password = typeof body.password === 'string' ? body.password : '';
      const windowMs = options.passkeyPwWindowMs ?? 300_000;
      const recentPasswordSignIn = passkeyPwAuthAt !== null && Date.now() - passkeyPwAuthAt <= windowMs;
      if (password === '' && !recentPasswordSignIn) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Password is required.' }),
        });
      }
      if (password !== '' && password === 'wrong-password') {
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Wrong password.' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          options: {
            challenge: 'dGVzdC1jaGFsbGVuZ2UtMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMg',
            rp: { name: 'CCRM', id: 'localhost' },
            user: { name: 'erik@crm.com', id: 'dXNlci1lcmlr', displayName: 'Erik' },
            pubKeyCredParams: [
              { type: 'public-key', alg: -7 },
              { type: 'public-key', alg: -257 },
            ],
            authenticatorSelection: {
              residentKey: 'required',
              userVerification: 'required',
              requireResidentKey: true,
            },
            attestation: 'none',
            timeout: 60000,
            hints: ['client-device'],
            excludeCredentials: pushedPasskeys.map((p) => ({ type: 'public-key', id: p.id })),
          },
        }),
      });
    }

    if (action === 'login_options') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          options: {
            challenge: 'dGVzdC1sb2dpbi1jaGFsbGVuZ2UtMTIzNDU2Nzg5MDEyMzQ',
            rpId: 'localhost',
            userVerification: 'required',
            timeout: 60000,
            allowCredentials: [],
          },
        }),
      });
    }

    if (action === 'register_verify') {
      passkeyPwAuthAt = null; // the sign-in confirmation is single-use
      const credId = body?.credential?.id || ('pk-' + (pushedPasskeys.length + 1));
      pushedPasskeys.push({
        id: credId,
        name: body?.name || 'Passkey',
        created_at: new Date().toISOString(),
        last_used_at: null,
        aaguid: '08987058-cadc-4b81-b6e1-30de50dcbe96',
        authenticator_name: 'Windows Hello',
        age_days: 0,
        age_hours: 0,
        age_minutes: 0,
        age_seconds: 5,
        last_used_days: null,
        last_used_hours: null,
        last_used_minutes: null,
        last_used_seconds: null,
      });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    }

    if (action === 'login_verify') {
      passkeyPwAuthAt = null; // a passkey sign-in never opens the password window
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, user: TEST_USER }),
      });
    }

    if (action === 'delete') {
      const idToDelete = body?.id;
      const idx = pushedPasskeys.findIndex((p) => p.id === idToDelete);
      if (idx !== -1) {
        pushedPasskeys.splice(idx, 1);
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route('**/upload.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, path: '/uploads/qa-upload.pdf', name: 'qa-upload.pdf' }),
    }),
  );

  // The login screen's weather line. Answered here so the suite stays offline
  // and the panel always renders the same way.
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ current: { temperature_2m: 14.2, weather_code: 2, is_day: 1 } }),
    }),
  );

  await page.addInitScript((userJson: string) => {
    try {
      window.sessionStorage.setItem('crm_current_user_rbac', userJson);
      window.sessionStorage.setItem('crm_session_token', 'qa-automated-test-token');
    } catch {
      /* sessionStorage unavailable — the login fallback in gotoView handles it. */
    }
  }, JSON.stringify(signedIn));
}
