import type { Page } from '@playwright/test';

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
 * is the client the crawler drills into to exercise the client profile detail
 * view, its sub-tabs and its `?tab=` deep routing.
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
        type: 'invoice',
        timestamp: isoStamp(-5, '16:20'),
        title: 'Faktúra FA-2026-014',
        content: 'Vystavená faktúra za prvú etapu.',
        amount: 9200,
        fileName: 'FA-2026-014.pdf',
        fileSize: '188 KB',
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
    deadlineWarningDays: 7,
    attributes: [
      { id: 'attr-area', name: 'Plocha (m²)', type: 'number', required: true },
      { id: 'attr-start', name: 'Začiatok realizácie', type: 'date', required: false },
      { id: 'attr-note', name: 'Poznámka', type: 'textarea', required: false },
      { id: 'attr-variant', name: 'Variant', type: 'select', required: false, options: ['Štandard', 'Premium'] },
    ],
    timelineEventTypes: [
      { id: 'pet-visit', name: 'Obhliadka', color: '#0ea5e9', icon: 'Eye', attributes: [] },
      { id: 'pet-work', name: 'Realizácia', color: '#16a34a', icon: 'Hammer', attributes: [] },
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
    deadline: isoDate(4),
    managers: ['Erik'],
    data: { 'attr-area': 145, 'attr-start': isoDate(5), 'attr-note': 'Prístup z dvora.', 'attr-variant': 'Premium' },
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
    deadline: isoDate(-6),
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
    financialRecords: FINANCIAL_RECORDS,
    settings: SETTINGS,
  };
}

/** Name of the client whose profile the crawler drills into. */
export const DRILLDOWN_CLIENT = 'Silvia';

/**
 * Installs the backend mocks and pre-seeds an authenticated admin session.
 *
 * Writes are acknowledged but discarded: the crawler is free to submit every
 * form it finds without touching a real database, and each test starts from the
 * same dataset.
 */
export async function installBackendMocks(page: Page) {
  await page.route('**/api/login.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, user: TEST_USER }),
    }),
  );

  await page.route('**/sync.php**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSyncPayload()),
      });
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

  // Dashboard widgets query the analytics endpoint per widget, so this must be
  // registered AFTER the catch-all above: Playwright tries the most recently
  // added matching route first. Registered before it, every widget was answered
  // with an empty array and the crawler audited a dashboard of zeroes.
  await page.route('**/api/dashboard_query.php', async (route) => {
    let action = '';
    let sql = '';
    try {
      const body = JSON.parse(route.request().postData() || '{}');
      action = (body.action as string) || '';
      sql = String(body?.params?.sql ?? body?.sql ?? '');
    } catch {
      action = '';
    }

    const data = (() => {
      switch (action) {
        case 'leads_count':
          return { count: LEADS.length };
        case 'pipeline_value':
          return { value: LEADS.reduce((sum, lead) => sum + (Number(lead.value) || 0), 0) };
        case 'leads_by_status':
          return [
            { status: 'new', count: 4, total_value: 18000 },
            { status: 'contacted', count: 3, total_value: 21000 },
            { status: 'offer sent', count: 2, total_value: 34000 },
            { status: 'accepted', count: 2, total_value: 51000 },
          ];
        case 'leads_by_source':
          return [
            { source: 'website', count: 5, total_value: 42000 },
            { source: 'referral', count: 3, total_value: 27000 },
            { source: 'campaign', count: 2, total_value: 11000 },
          ];
        case 'tasks_summary':
          return [
            { status: 'todo', count: 5 },
            { status: 'in_progress', count: 3 },
            { status: 'done', count: 7 },
          ];
        case 'tasks_by_owner':
          return [
            { owner: 'Ada Admin', count: 6 },
            { owner: 'Sam Sales', count: 4 },
          ];
        case 'recent_leads':
          return LEADS.slice(0, 5).map((lead) => ({
            id: lead.id,
            name: lead.name,
            status: lead.status,
            value: lead.value,
            owner: lead.owner,
            created_at: lead.createdAt,
          }));
        case 'recent_tasks':
          return TASKS.slice(0, 5).map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            owner: task.owner,
            deadline: task.deadline,
          }));
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
  await page.route('**/upload.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, path: '/uploads/qa-upload.pdf', name: 'qa-upload.pdf' }),
    }),
  );

  await page.addInitScript((userJson: string) => {
    try {
      window.sessionStorage.setItem('crm_current_user_rbac', userJson);
      window.sessionStorage.setItem('crm_session_token', 'qa-automated-test-token');
    } catch {
      /* sessionStorage unavailable — the login fallback in gotoView handles it. */
    }
  }, JSON.stringify(TEST_USER));
}
