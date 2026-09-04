/**
 * Presentation demo dataset.
 *
 * This is NOT the QA fixture (`tests/e2e/helpers/fixture.ts`). That one exists to
 * make every code path reachable for the audit; this one exists to make every
 * screen *look* like a real company has been using CCRM for a year, so the
 * marketing site can show the product with plausible content instead of empty
 * states and `Lorem ipsum`.
 *
 * The fictional company is **Rekonstav s.r.o.**, a Slovak roofing and building
 * contractor. Everything is invented — no real client, invoice or IČO here.
 *
 * Dates are derived from the run date so charts, calendars and deadline views
 * always have something in the current month whenever the screenshots are retaken.
 */

const DAY = 24 * 60 * 60 * 1000;

export function isoDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * DAY);
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().split('T')[0];
}

export function isoStamp(offsetDays = 0, time = '09:30'): string {
  return `${isoDate(offsetDays)} ${time}`;
}

/**
 * Like `isoDate`, but never lands on a Saturday or Sunday.
 *
 * The Gantt view builds its columns from weekdays only and matches a bar to a
 * column by exact date string, so a task whose start or end falls on a weekend
 * silently renders as "bez termínu" with no bar at all.
 */
export function isoWeekday(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * DAY);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().split('T')[0];
}

/** First day of the month `back` months ago — used to spread finance across the year. */
function monthStart(back: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthDay(back: number, day: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - back, day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------- */
/* Team                                                                       */
/* -------------------------------------------------------------------------- */

export const DEMO_USER = {
  id: 'user-erik',
  name: 'Erik Kováč',
  email: 'erik@rekonstav.sk',
  role: 'Admin',
  color: '#4f46e5',
  password: 'password',
  position: 'Konateľ',
  phone: '+421 905 100 100',
  activityLog: [
    { id: 'act-1', action: 'Prihlásenie', timestamp: isoStamp(0, '07:42'), type: 'login', details: 'Bratislava, Chrome' },
    { id: 'act-2', action: 'Vytvorená cenová ponuka CP-2026-041', timestamp: isoStamp(-1, '16:10'), type: 'create', details: 'Bytový dom Petržalka' },
  ],
  metadata_json: JSON.stringify({
    leadTableViews: {},
    leadFilters: {},
    emailSettings: { isValidated: true },
  }),
};

export const DEMO_USERS = [
  DEMO_USER,
  {
    id: 'user-maria',
    name: 'Mária Tóthová',
    email: 'maria@rekonstav.sk',
    role: 'Manager',
    color: '#0ea5e9',
    position: 'Projektová manažérka',
    phone: '+421 905 100 200',
    activityLog: [],
    metadata_json: '{}',
  },
  {
    id: 'user-jozef',
    name: 'Jozef Baláž',
    email: 'jozef@rekonstav.sk',
    role: 'Manager',
    color: '#f59e0b',
    position: 'Obchodný zástupca',
    phone: '+421 905 100 300',
    activityLog: [],
    metadata_json: '{}',
  },
  {
    id: 'user-lucia',
    name: 'Lucia Bieliková',
    email: 'lucia@rekonstav.sk',
    role: 'Manager',
    color: '#10b981',
    position: 'Fakturácia a sklad',
    phone: '+421 905 100 400',
    activityLog: [],
    metadata_json: '{}',
  },
];

const OWNERS = ['Erik Kováč', 'Mária Tóthová', 'Jozef Baláž', 'Lucia Bieliková'];

/* -------------------------------------------------------------------------- */
/* 01 — Obchod & Zákazky                                                      */
/* -------------------------------------------------------------------------- */

export const LEAD_STATES = ['nový', 'kontaktovaný', 'obhliadka', 'ponuka odoslaná', 'zákazka', 'odmietnutý'];
export const LEAD_SOURCES = ['website', 'odporúčanie', 'facebook', 'instagram', 'showroom', 'inzercia'];
export const LEAD_CATEGORIES = ['Strechy', 'Okná a dvere', 'Zateplenie', 'Klampiarske práce'];
export const TASK_STATES = ['Nová', 'Prebieha', 'Čaká sa', 'Hotová'];

export const LEADS = [
  {
    id: 'lead-silvia',
    name: 'Silvia Hrušková',
    city: 'Bratislava',
    clientType: 'person',
    status: 'zákazka',
    source: 'website',
    owner: 'Erik Kováč',
    value: 24800,
    createdAt: isoStamp(-64, '10:00'),
    rating: 5,
    phone: '+421 900 111 222',
    email: 'silvia.hruskova@example.sk',
    address: { street: 'Záhradnícka 42', city: 'Bratislava', postalCode: '82108', country: 'Slovensko' },
    categories: ['Strechy', 'Klampiarske práce'],
    interestNote: 'Kompletná rekonštrukcia šikmej strechy na rodinnom dome vrátane novej klampiarskej výbavy a bleskozvodu.',
    followUps: { kontaktovaný: isoDate(-58) },
    timeline: [
      {
        id: 'ev-silvia-1',
        type: 'note',
        timestamp: isoStamp(-64, '10:05'),
        title: 'Dopyt z webu',
        content: 'Klientka vyplnila formulár — rodinný dom, strecha po 30 rokoch, zatekanie pri komíne.',
        author: 'Erik Kováč',
      },
      {
        id: 'ev-silvia-2',
        type: 'phone',
        timestamp: isoStamp(-61, '09:20'),
        title: 'Telefonát — dohodnutá obhliadka',
        content: 'Termín obhliadky potvrdený na štvrtok o 10:00.',
        author: 'Erik Kováč',
      },
      {
        id: 'ev-silvia-3',
        type: 'appointment',
        timestamp: isoStamp(-57, '10:00'),
        title: 'Obhliadka na mieste',
        content: 'Zameraná plocha 168 m². Krov v dobrom stave, nutná výmena laťovania a poistnej hydroizolácie.',
        extraTime: '11:30',
        author: 'Erik Kováč',
      },
      {
        id: 'ev-silvia-4',
        type: 'offer',
        timestamp: isoStamp(-52, '14:30'),
        title: 'Cenová ponuka CP-2026-018 odoslaná',
        content: 'Ponuka v dvoch variantoch — betónová a pálená krytina.',
        amount: 24800,
        fileName: 'CP-2026-018-hruskova.pdf',
        fileSize: '412 KB',
        fileType: 'offer',
        filePath: '/uploads/CP-2026-018-hruskova.pdf',
        attachments: [{ name: 'CP-2026-018-hruskova.pdf', size: '412 KB', path: '/uploads/CP-2026-018-hruskova.pdf' }],
        author: 'Erik Kováč',
      },
      {
        id: 'ev-silvia-5',
        type: 'note',
        timestamp: isoStamp(-44, '08:15'),
        title: 'Ponuka odsúhlasená',
        content: 'Klientka vybrala variant s pálenou krytinou. Podpis zmluvy do konca týždňa.',
        author: 'Erik Kováč',
      },
      {
        id: 'ev-silvia-6',
        type: 'invoice',
        timestamp: isoStamp(-28, '11:00'),
        title: 'Zálohová faktúra FA-2026-031',
        content: 'Záloha 40 % na materiál — uhradená v deň splatnosti.',
        amount: 9920,
        fileName: 'FA-2026-031.pdf',
        fileSize: '188 KB',
        filePath: '/uploads/FA-2026-031.pdf',
        attachments: [{ name: 'FA-2026-031.pdf', size: '188 KB', path: '/uploads/FA-2026-031.pdf' }],
        author: 'Lucia Bieliková',
      },
      {
        id: 'ev-silvia-7',
        type: 'appointment',
        timestamp: isoStamp(3, '08:00'),
        title: 'Začiatok realizácie',
        content: 'Nástup partie, dovoz lešenia deň vopred.',
        extraTime: '16:00',
        author: 'Mária Tóthová',
      },
    ],
  },
  {
    id: 'lead-novak',
    name: 'Novák Stavby s.r.o.',
    city: 'Košice',
    clientType: 'business',
    status: 'ponuka odoslaná',
    source: 'odporúčanie',
    owner: 'Mária Tóthová',
    value: 86400,
    createdAt: isoStamp(-38, '11:15'),
    rating: 5,
    phone: '+421 902 333 444',
    email: 'obchod@novakstavby.sk',
    address: { street: 'Priemyselná 12', city: 'Košice', postalCode: '04001', country: 'Slovensko' },
    companyId: '36512478',
    taxId: '2021845512',
    vatId: 'SK2021845512',
    contactPerson: 'Ján Novák',
    website: 'https://novakstavby.sk',
    legalForm: 's.r.o.',
    skNace: '41.20 Výstavba obytných a neobytných budov',
    region: 'Košický kraj',
    categories: ['Strechy', 'Zateplenie'],
    interestNote: 'Subdodávka strešného plášťa na bytovom dome — 1 240 m² plochej strechy.',
    timeline: [
      {
        id: 'ev-novak-1',
        type: 'email',
        timestamp: isoStamp(-38, '08:45'),
        title: 'Dopyt na subdodávku',
        content: 'Žiadosť o ponuku na 1 240 m² plochej strechy, termín realizácie jeseň.',
        isOutgoing: false,
        author: 'Mária Tóthová',
      },
      {
        id: 'ev-novak-2',
        type: 'appointment',
        timestamp: isoStamp(-30, '13:00'),
        title: 'Obhliadka objektu',
        content: 'Spoločná obhliadka so stavbyvedúcim. Odsúhlasená skladba s PIR izoláciou.',
        author: 'Mária Tóthová',
      },
      {
        id: 'ev-novak-3',
        type: 'offer',
        timestamp: isoStamp(-9, '16:20'),
        title: 'Cenová ponuka CP-2026-036',
        content: 'Ponuka vrátane lešenia, odvozu sute a 10-ročnej záruky.',
        amount: 86400,
        fileName: 'CP-2026-036-novak.pdf',
        fileSize: '520 KB',
        filePath: '/uploads/CP-2026-036-novak.pdf',
        attachments: [{ name: 'CP-2026-036-novak.pdf', size: '520 KB', path: '/uploads/CP-2026-036-novak.pdf' }],
        author: 'Mária Tóthová',
      },
    ],
  },
  {
    id: 'lead-horvath',
    name: 'Peter Horváth',
    city: 'Nitra',
    clientType: 'person',
    status: 'obhliadka',
    source: 'instagram',
    owner: 'Jozef Baláž',
    value: 7400,
    createdAt: isoStamp(-19, '13:40'),
    rating: 4,
    phone: '+421 903 555 666',
    email: 'peter.horvath@example.sk',
    address: { street: 'Podzámska 7', city: 'Nitra', postalCode: '94901', country: 'Slovensko' },
    categories: ['Okná a dvere'],
    interestNote: 'Výmena 11 okien a vchodových dverí v rodinnom dome.',
    timeline: [
      {
        id: 'ev-horvath-1',
        type: 'phone',
        timestamp: isoStamp(-17, '15:05'),
        title: 'Prvý telefonát',
        content: 'Zaujíma sa o trojsklá, rozpočet do 8 000 €.',
        author: 'Jozef Baláž',
      },
      {
        id: 'ev-horvath-2',
        type: 'appointment',
        timestamp: isoStamp(1, '09:30'),
        title: 'Zameranie otvorov',
        content: 'Technik príde zamerať všetkých 11 otvorov.',
        extraTime: '11:00',
        author: 'Jozef Baláž',
      },
    ],
  },
  {
    id: 'lead-alfa',
    name: 'Alfa Reality a.s.',
    city: 'Žilina',
    clientType: 'partner',
    status: 'zákazka',
    source: 'odporúčanie',
    owner: 'Erik Kováč',
    value: 142000,
    createdAt: isoStamp(-120, '09:10'),
    rating: 5,
    phone: '+421 904 777 888',
    email: 'spolupraca@alfareality.sk',
    address: { street: 'Vysokoškolákov 4', city: 'Žilina', postalCode: '01008', country: 'Slovensko' },
    companyId: '31584772',
    taxId: '2020447712',
    vatId: 'SK2020447712',
    contactPerson: 'Zuzana Adamcová',
    website: 'https://alfareality.sk',
    legalForm: 'a.s.',
    region: 'Žilinský kraj',
    categories: ['Strechy', 'Zateplenie', 'Klampiarske práce'],
    interestNote: 'Rámcová spolupráca — údržba a rekonštrukcie strešných plášťov na spravovaných objektoch.',
    timeline: [
      {
        id: 'ev-alfa-1',
        type: 'note',
        timestamp: isoStamp(-120, '09:15'),
        title: 'Rámcová zmluva podpísaná',
        content: 'Trojročná rámcová zmluva na údržbu 14 objektov.',
        author: 'Erik Kováč',
      },
      {
        id: 'ev-alfa-2',
        type: 'invoice',
        timestamp: isoStamp(-34, '10:40'),
        title: 'Faktúra FA-2026-027',
        content: 'Štvrťročná paušálna údržba.',
        amount: 12400,
        fileName: 'FA-2026-027.pdf',
        fileSize: '164 KB',
        filePath: '/uploads/FA-2026-027.pdf',
        author: 'Lucia Bieliková',
      },
    ],
  },
  {
    id: 'lead-bytdom',
    name: 'SVB Petržalka — Hálova 12',
    city: 'Bratislava',
    clientType: 'business',
    status: 'ponuka odoslaná',
    source: 'website',
    owner: 'Mária Tóthová',
    value: 58600,
    createdAt: isoStamp(-26, '14:20'),
    rating: 4,
    phone: '+421 911 222 333',
    email: 'predseda@svbhalova12.sk',
    address: { street: 'Hálova 12', city: 'Bratislava', postalCode: '85101', country: 'Slovensko' },
    companyId: '42188345',
    contactPerson: 'Marián Chovanec',
    legalForm: 'SVB',
    categories: ['Zateplenie', 'Strechy'],
    interestNote: 'Sanácia plochej strechy bytového domu, 940 m², vrátane nových svetlíkov.',
    timeline: [
      {
        id: 'ev-bytdom-1',
        type: 'appointment',
        timestamp: isoStamp(-21, '17:00'),
        title: 'Schôdza vlastníkov',
        content: 'Prezentácia riešenia pre vlastníkov bytov. Hlasovanie o týždeň.',
        author: 'Mária Tóthová',
      },
      {
        id: 'ev-bytdom-2',
        type: 'offer',
        timestamp: isoStamp(-14, '09:00'),
        title: 'Cenová ponuka CP-2026-039',
        content: 'Ponuka so splátkovým kalendárom na 12 mesiacov.',
        amount: 58600,
        fileName: 'CP-2026-039-halova.pdf',
        fileSize: '388 KB',
        filePath: '/uploads/CP-2026-039-halova.pdf',
        author: 'Mária Tóthová',
      },
    ],
  },
  {
    id: 'lead-kovacova',
    name: 'Jana Kováčová',
    city: 'Trnava',
    clientType: 'person',
    status: 'kontaktovaný',
    source: 'facebook',
    owner: 'Jozef Baláž',
    value: 3900,
    createdAt: isoStamp(-11, '18:05'),
    rating: 3,
    phone: '+421 907 444 555',
    email: 'jana.kovacova@example.sk',
    address: { street: 'Hviezdoslavova 19', city: 'Trnava', postalCode: '91701', country: 'Slovensko' },
    categories: ['Klampiarske práce'],
    interestNote: 'Nové odkvapy a zvody na rodinnom dome, medený variant.',
    timeline: [
      {
        id: 'ev-kovacova-1',
        type: 'email',
        timestamp: isoStamp(-10, '08:30'),
        title: 'Odoslaný orientačný cenník',
        content: 'Poslaný cenník medených a titánzinkových systémov.',
        isOutgoing: true,
        author: 'Jozef Baláž',
      },
    ],
  },
  {
    id: 'lead-mestonz',
    name: 'Mesto Nové Zámky',
    city: 'Nové Zámky',
    clientType: 'business',
    status: 'obhliadka',
    source: 'inzercia',
    owner: 'Erik Kováč',
    value: 96500,
    createdAt: isoStamp(-16, '10:45'),
    rating: 4,
    phone: '+421 35 692 1111',
    email: 'investicie@novezamky.sk',
    address: { street: 'Hlavné námestie 10', city: 'Nové Zámky', postalCode: '94001', country: 'Slovensko' },
    companyId: '00309150',
    contactPerson: 'Ing. Tomáš Béreš',
    legalForm: 'obec',
    categories: ['Strechy', 'Zateplenie'],
    interestNote: 'Verejná súťaž — rekonštrukcia strechy mestskej športovej haly.',
    timeline: [
      {
        id: 'ev-mesto-1',
        type: 'note',
        timestamp: isoStamp(-16, '10:50'),
        title: 'Súťažné podklady stiahnuté',
        content: 'Termín na predloženie ponuky o 3 týždne.',
        author: 'Erik Kováč',
      },
      {
        id: 'ev-mesto-2',
        type: 'appointment',
        timestamp: isoStamp(-4, '09:00'),
        title: 'Obhliadka športovej haly',
        content: 'Povinná obhliadka pre uchádzačov.',
        author: 'Erik Kováč',
      },
    ],
  },
  {
    id: 'lead-simon',
    name: 'Šimon Frenko',
    city: 'Šahy',
    clientType: 'person',
    status: 'ponuka odoslaná',
    source: 'odporúčanie',
    owner: 'Jozef Baláž',
    value: 11200,
    createdAt: isoStamp(-13, '12:00'),
    rating: 4,
    phone: '+421 908 121 212',
    email: 'simon.frenko@example.sk',
    address: { street: 'Mládežnícka 3', city: 'Šahy', postalCode: '93601', country: 'Slovensko' },
    categories: ['Strechy'],
    interestNote: 'Rekonštrukcia plochej strechy na garáži a prístavbe.',
    timeline: [
      {
        id: 'ev-simon-1',
        type: 'offer',
        timestamp: isoStamp(-6, '15:30'),
        title: 'Cenová ponuka CP-2026-041',
        content: 'Ponuka na hydroizoláciu mPVC vrátane atiky.',
        amount: 11200,
        fileName: 'CP-2026-041-frenko.pdf',
        fileSize: '298 KB',
        filePath: '/uploads/CP-2026-041-frenko.pdf',
        author: 'Jozef Baláž',
      },
    ],
  },
  {
    id: 'lead-vinarstvo',
    name: 'Vinárstvo Pod Zámkom s.r.o.',
    city: 'Pezinok',
    clientType: 'business',
    status: 'zákazka',
    source: 'facebook',
    owner: 'Mária Tóthová',
    value: 33400,
    createdAt: isoStamp(-72, '11:30'),
    rating: 5,
    phone: '+421 910 656 565',
    email: 'info@vinarstvopodzamkom.sk',
    address: { street: 'Vinohradnícka 88', city: 'Pezinok', postalCode: '90201', country: 'Slovensko' },
    companyId: '47883921',
    vatId: 'SK2024118833',
    contactPerson: 'Michal Krajčír',
    legalForm: 's.r.o.',
    categories: ['Strechy', 'Klampiarske práce'],
    interestNote: 'Nová strecha na výrobnej hale a degustačnej sále.',
    timeline: [
      {
        id: 'ev-vin-1',
        type: 'invoice',
        timestamp: isoStamp(-40, '09:00'),
        title: 'Faktúra FA-2026-024',
        content: 'Druhá etapa — degustačná sála.',
        amount: 16700,
        fileName: 'FA-2026-024.pdf',
        fileSize: '172 KB',
        filePath: '/uploads/FA-2026-024.pdf',
        author: 'Lucia Bieliková',
      },
    ],
  },
  {
    id: 'lead-lukas',
    name: 'Lukáš Danko',
    city: 'Prešov',
    clientType: 'person',
    status: 'nový',
    source: 'website',
    owner: 'Jozef Baláž',
    value: 5600,
    createdAt: isoStamp(-2, '19:40'),
    rating: 3,
    phone: '+421 918 909 090',
    email: 'lukas.danko@example.sk',
    categories: ['Okná a dvere'],
    interestNote: 'Zasklenie terasy a výmena balkónových dverí.',
    timeline: [],
  },
  {
    id: 'lead-agro',
    name: 'Agrodružstvo Malanta',
    city: 'Malanta',
    clientType: 'business',
    status: 'nový',
    source: 'inzercia',
    owner: 'Mária Tóthová',
    value: 41000,
    createdAt: isoStamp(-1, '08:20'),
    rating: 4,
    phone: '+421 37 654 3210',
    email: 'sekretariat@agromalanta.sk',
    companyId: '00190667',
    contactPerson: 'Ing. Pavol Šimko',
    legalForm: 'družstvo',
    categories: ['Strechy'],
    interestNote: 'Výmena azbestocementovej krytiny na dvoch hospodárskych budovách.',
    timeline: [],
  },
  {
    id: 'lead-marta',
    name: 'Marta Šulíková',
    city: 'Banská Bystrica',
    clientType: 'person',
    status: 'kontaktovaný',
    source: 'facebook',
    owner: 'Erik Kováč',
    value: 2200,
    createdAt: isoStamp(-8, '16:15'),
    rating: 2,
    phone: '+421 915 313 131',
    email: 'marta.sulikova@example.sk',
    categories: ['Klampiarske práce'],
    interestNote: 'Oprava zatekajúceho komínového lemovania.',
    timeline: [
      {
        id: 'ev-marta-1',
        type: 'phone',
        timestamp: isoStamp(-7, '10:10'),
        title: 'Telefonát',
        content: 'Dohodnutý termín opravy po skončení dažďov.',
        author: 'Erik Kováč',
      },
    ],
  },
  {
    id: 'lead-hotel',
    name: 'Hotel Lesná s.r.o.',
    city: 'Poprad',
    clientType: 'business',
    status: 'odmietnutý',
    source: 'website',
    owner: 'Jozef Baláž',
    value: 64000,
    createdAt: isoStamp(-55, '14:50'),
    rating: 2,
    phone: '+421 52 771 2222',
    email: 'recepcia@hotellesna.sk',
    companyId: '36455112',
    legalForm: 's.r.o.',
    categories: ['Strechy', 'Zateplenie'],
    interestNote: 'Rekonštrukcia strechy hotela — odložené na budúci rok.',
    timeline: [
      {
        id: 'ev-hotel-1',
        type: 'note',
        timestamp: isoStamp(-24, '11:00'),
        title: 'Investícia odložená',
        content: 'Vedenie hotela presunulo investíciu do ďalšieho rozpočtového roka. Vrátiť sa v januári.',
        author: 'Jozef Baláž',
      },
    ],
  },
  {
    id: 'lead-skola',
    name: 'ZŠ Mierová Bratislava',
    city: 'Bratislava',
    clientType: 'business',
    status: 'zákazka',
    source: 'odporúčanie',
    owner: 'Mária Tóthová',
    value: 28900,
    createdAt: isoStamp(-88, '09:45'),
    rating: 5,
    phone: '+421 2 4333 1212',
    email: 'riaditel@zsmierova.sk',
    companyId: '31745551',
    contactPerson: 'Mgr. Eva Danišová',
    legalForm: 'rozpočtová organizácia',
    categories: ['Strechy', 'Klampiarske práce'],
    interestNote: 'Oprava strechy telocvične počas letných prázdnin — hotovo, v záruke.',
    timeline: [
      {
        id: 'ev-skola-1',
        type: 'note',
        timestamp: isoStamp(-30, '12:00'),
        title: 'Odovzdanie diela',
        content: 'Dielo odovzdané bez vád a nedorobkov. Záruka 10 rokov.',
        author: 'Mária Tóthová',
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

export const TASKS = [
  {
    id: 'task-1',
    title: 'Zavolať pani Hruškovej — potvrdiť nástup partie',
    description: 'Potvrdiť dovoz lešenia deň vopred a prístup na pozemok.',
    status: 'Nová',
    priority: 'high',
    startDate: isoWeekday(0),
    deadline: isoDate(0),
    deadlineTime: '14:00',
    owner: 'Erik Kováč',
    createdBy: 'Erik Kováč',
    assignedUsers: ['Erik Kováč'],
    relatedLeadId: 'lead-silvia',
  },
  {
    id: 'task-2',
    title: 'Doplniť výkaz výmer pre Novák Stavby',
    description: 'Doplniť položky lešenia a odvozu sute do ponuky CP-2026-036.',
    status: 'Prebieha',
    priority: 'high',
    startDate: isoWeekday(-2),
    deadline: isoDate(2),
    deadlineTime: '16:00',
    owner: 'Mária Tóthová',
    createdBy: 'Erik Kováč',
    assignedUsers: ['Mária Tóthová', 'Erik Kováč'],
    relatedLeadId: 'lead-novak',
  },
  {
    id: 'task-3',
    title: 'Objednať pálenú krytinu — 168 m²',
    description: 'Objednávka u dodávateľa Krytiny SK, dodanie do 10 dní.',
    status: 'Prebieha',
    priority: 'high',
    startDate: isoWeekday(-1),
    deadline: isoDate(3),
    deadlineTime: '12:00',
    owner: 'Lucia Bieliková',
    createdBy: 'Mária Tóthová',
    assignedUsers: ['Lucia Bieliková'],
    relatedLeadId: 'lead-silvia',
  },
  {
    id: 'task-4',
    title: 'Pripraviť podklady do súťaže — športová hala',
    description: 'Referencie, výpis z registra, poistenie zodpovednosti.',
    status: 'Nová',
    priority: 'medium',
    startDate: isoWeekday(0),
    deadline: isoDate(9),
    deadlineTime: '15:00',
    owner: 'Erik Kováč',
    createdBy: 'Erik Kováč',
    assignedUsers: ['Erik Kováč', 'Lucia Bieliková'],
    relatedLeadId: 'lead-mestonz',
  },
  {
    id: 'task-5',
    title: 'Zameranie okien — Horváth, Nitra',
    description: '11 otvorov, priniesť vzorkovník profilov.',
    status: 'Nová',
    priority: 'medium',
    startDate: isoWeekday(1),
    deadline: isoDate(1),
    deadlineTime: '09:30',
    owner: 'Jozef Baláž',
    createdBy: 'Jozef Baláž',
    assignedUsers: ['Jozef Baláž'],
    relatedLeadId: 'lead-horvath',
  },
  {
    id: 'task-6',
    title: 'Urgovať úhradu FA-2026-027',
    description: 'Faktúra po splatnosti 6 dní — poslať upomienku.',
    status: 'Čaká sa',
    priority: 'high',
    deadline: isoDate(-1),
    deadlineTime: '11:00',
    owner: 'Lucia Bieliková',
    createdBy: 'Erik Kováč',
    assignedUsers: ['Lucia Bieliková'],
    relatedLeadId: 'lead-alfa',
  },
  {
    id: 'task-7',
    title: 'Doplniť fotodokumentáciu — ZŠ Mierová',
    description: 'Fotky z odovzdania do priečinka referencií.',
    status: 'Hotová',
    priority: 'low',
    deadline: isoDate(-5),
    owner: 'Mária Tóthová',
    createdBy: 'Mária Tóthová',
    assignedUsers: ['Mária Tóthová'],
    completedBy: 'Mária Tóthová',
    completedAt: isoStamp(-5, '15:20'),
    relatedLeadId: 'lead-skola',
  },
  {
    id: 'task-8',
    title: 'Servis plošiny — pravidelná kontrola',
    description: 'Ročná revízia montážnej plošiny.',
    status: 'Čaká sa',
    priority: 'medium',
    deadline: isoDate(12),
    owner: 'Lucia Bieliková',
    createdBy: 'Erik Kováč',
    assignedUsers: ['Lucia Bieliková'],
    isLocking: true,
  },
  {
    id: 'task-9',
    title: 'Prezentácia pre SVB Hálova — hlasovanie',
    description: 'Pripraviť zhrnutie ponuky na jednu stranu pre vlastníkov.',
    status: 'Prebieha',
    priority: 'medium',
    startDate: isoWeekday(-3),
    deadline: isoDate(4),
    deadlineTime: '17:00',
    owner: 'Mária Tóthová',
    createdBy: 'Mária Tóthová',
    assignedUsers: ['Mária Tóthová'],
    relatedLeadId: 'lead-bytdom',
  },
  {
    id: 'task-10',
    title: 'Mesačná uzávierka skladu',
    description: 'Inventúra a odsúhlasenie pohybov za mesiac.',
    status: 'Hotová',
    priority: 'medium',
    deadline: isoDate(-2),
    deadlineTime: '17:00',
    owner: 'Lucia Bieliková',
    createdBy: 'Erik Kováč',
    assignedUsers: ['Lucia Bieliková'],
    completedBy: 'Lucia Bieliková',
    completedAt: isoStamp(-2, '16:35'),
  },
  {
    id: 'task-11',
    title: 'Vrátiť sa k Hotelu Lesná v januári',
    description: 'Investícia odložená — nastaviť pripomienku na nový rozpočtový rok.',
    status: 'Čaká sa',
    priority: 'low',
    deadline: isoDate(45),
    owner: 'Jozef Baláž',
    createdBy: 'Jozef Baláž',
    assignedUsers: ['Jozef Baláž'],
    relatedLeadId: 'lead-hotel',
  },
  {
    id: 'task-12',
    title: 'Aktualizovať cenník klampiarskych prác',
    description: 'Nové ceny medi a titánzinku od dodávateľa.',
    status: 'Nová',
    priority: 'low',
    deadline: isoDate(7),
    owner: 'Erik Kováč',
    createdBy: 'Erik Kováč',
    assignedUsers: ['Erik Kováč', 'Jozef Baláž'],
  },
];

/* -------------------------------------------------------------------------- */
/* 06 — Projekty & Gantt                                                      */
/* -------------------------------------------------------------------------- */

export const PROJECT_TYPES = [
  {
    id: 'ptype-roof',
    name: 'Rekonštrukcia strechy',
    description: 'Kompletná rekonštrukcia šikmej alebo plochej strechy vrátane klampiarskych prvkov.',
    icon: 'Home',
    color: '#4f46e5',
    hasTimeline: true,
    hasGantt: true,
    attributes: [
      { id: 'attr-area', name: 'Plocha (m²)', type: 'number', required: true },
      { id: 'attr-start', name: 'Začiatok realizácie', type: 'date', required: false },
      { id: 'attr-variant', name: 'Typ krytiny', type: 'select', required: false, options: ['Pálená', 'Betónová', 'Plechová', 'mPVC'] },
      { id: 'attr-note', name: 'Poznámka k prístupu', type: 'textarea', required: false },
      { id: 'attr-scaffold', name: 'Lešenie v cene', type: 'checkbox', required: false },
    ],
    timelineEventTypes: [
      { id: 'pet-visit', name: 'Obhliadka', color: '#0ea5e9', icon: 'Eye', attributes: [] },
      { id: 'pet-work', name: 'Realizácia', color: '#16a34a', icon: 'Hammer', attributes: [] },
      { id: 'pet-check', name: 'Kontrolný deň', color: '#f59e0b', icon: 'ClipboardCheck', attributes: [] },
      { id: 'pet-handover', name: 'Odovzdanie', color: '#8b5cf6', icon: 'CheckCircle', attributes: [] },
    ],
  },
  {
    id: 'ptype-windows',
    name: 'Výmena okien a dverí',
    description: 'Demontáž pôvodných výplní, montáž nových a zapravenie ostenia.',
    icon: 'Square',
    color: '#0ea5e9',
    hasTimeline: true,
    hasGantt: true,
    attributes: [
      { id: 'attr-count', name: 'Počet otvorov', type: 'number', required: true },
      { id: 'attr-profile', name: 'Profil', type: 'select', required: false, options: ['Plast 6-komorový', 'Hliník', 'Drevo EURO'] },
    ],
    timelineEventTypes: [
      { id: 'pet-measure', name: 'Zameranie', color: '#0ea5e9', icon: 'Ruler', attributes: [] },
      { id: 'pet-install', name: 'Montáž', color: '#16a34a', icon: 'Hammer', attributes: [] },
    ],
  },
  {
    id: 'ptype-service',
    name: 'Servis a údržba',
    description: 'Pravidelná údržba strešných plášťov v rámci rámcovej zmluvy.',
    icon: 'Wrench',
    color: '#f59e0b',
    hasTimeline: true,
    hasGantt: false,
    attributes: [
      { id: 'attr-objects', name: 'Počet objektov', type: 'number', required: false },
      { id: 'attr-interval', name: 'Interval', type: 'select', required: false, options: ['Mesačne', 'Štvrťročne', 'Polročne'] },
    ],
    timelineEventTypes: [{ id: 'pet-service', name: 'Servisný zásah', color: '#f59e0b', icon: 'Wrench', attributes: [] }],
  },
];

export const PROJECTS = [
  {
    id: 'project-hruskova',
    projectTypeId: 'ptype-roof',
    leadId: 'lead-silvia',
    clientId: 'lead-silvia',
    status: 'active',
    managers: ['Erik Kováč', 'Mária Tóthová'],
    data: {
      'attr-area': 168,
      'attr-start': isoDate(3),
      'attr-variant': 'Pálená',
      'attr-note': 'Prístup z dvora, lešenie od susedovej strany po dohode.',
      'attr-scaffold': true,
    },
    timeline: [
      { id: 'pev-h-1', type: 'event', eventType: 'pet-visit', timestamp: isoStamp(-57, '10:00'), title: 'Obhliadka a zameranie', content: 'Zameraných 168 m², krov v dobrom stave.', data: {} },
      { id: 'pev-h-2', type: 'event', eventType: 'pet-check', timestamp: isoStamp(-28, '11:00'), title: 'Odsúhlasenie materiálu', content: 'Klientka vybrala pálenú krytinu, odtieň prírodná červená.', data: {} },
      { id: 'pev-h-3', type: 'event', eventType: 'pet-work', timestamp: isoStamp(3, '08:00'), title: 'Nástup partie', content: 'Montáž lešenia a demontáž pôvodnej krytiny.', data: {} },
    ],
    gantt: [
      /* Kept inside a ~3-week span on purpose: the Gantt draws one column per
         weekday, so a schedule any longer than this runs off the right edge of
         the pane and the screenshot shows bars for the first two tasks only. */
      { id: 'g-h-1', title: 'Lešenie a príprava', contactId: 'lead-silvia', startDate: isoWeekday(-1), endDate: isoWeekday(1), progress: 100 },
      { id: 'g-h-2', title: 'Demontáž pôvodnej krytiny', contactId: 'lead-silvia', startDate: isoWeekday(1), endDate: isoWeekday(4), progress: 60 },
      { id: 'g-h-3', title: 'Laťovanie a poistná hydroizolácia', contactId: 'lead-silvia', startDate: isoWeekday(4), endDate: isoWeekday(8), progress: 20 },
      { id: 'g-h-4', title: 'Montáž pálenej krytiny', contactId: 'lead-silvia', startDate: isoWeekday(8), endDate: isoWeekday(14), progress: 0 },
      { id: 'g-h-5', title: 'Klampiarske prvky a bleskozvod', contactId: 'lead-silvia', startDate: isoWeekday(13), endDate: isoWeekday(17), progress: 0 },
      { id: 'g-h-6', title: 'Upratanie a odovzdanie', contactId: 'lead-silvia', startDate: isoWeekday(17), endDate: isoWeekday(18), progress: 0 },
    ],
  },
  {
    id: 'project-vinarstvo',
    projectTypeId: 'ptype-roof',
    leadId: 'lead-vinarstvo',
    clientId: 'lead-vinarstvo',
    status: 'active',
    managers: ['Mária Tóthová'],
    data: { 'attr-area': 620, 'attr-start': isoDate(-45), 'attr-variant': 'Plechová', 'attr-scaffold': true },
    timeline: [
      { id: 'pev-v-1', type: 'event', eventType: 'pet-work', timestamp: isoStamp(-45, '07:30'), title: 'Etapa 1 — výrobná hala', content: 'Hotovo v termíne.', data: {} },
      { id: 'pev-v-2', type: 'event', eventType: 'pet-work', timestamp: isoStamp(-12, '07:30'), title: 'Etapa 2 — degustačná sála', content: 'Prebieha, 70 % hotových.', data: {} },
    ],
    gantt: [
      { id: 'g-v-1', title: 'Etapa 1 — výrobná hala', contactId: 'lead-vinarstvo', startDate: isoWeekday(-45), endDate: isoWeekday(-20), progress: 100 },
      { id: 'g-v-2', title: 'Etapa 2 — degustačná sála', contactId: 'lead-vinarstvo', startDate: isoWeekday(-12), endDate: isoWeekday(8), progress: 70 },
      { id: 'g-v-3', title: 'Klampiarske dokončenie', contactId: 'lead-vinarstvo', startDate: isoWeekday(8), endDate: isoWeekday(16), progress: 0 },
    ],
  },
  {
    id: 'project-skola',
    projectTypeId: 'ptype-roof',
    leadId: 'lead-skola',
    clientId: 'lead-skola',
    status: 'completed',
    managers: ['Mária Tóthová'],
    data: { 'attr-area': 410, 'attr-start': isoDate(-75), 'attr-variant': 'mPVC', 'attr-scaffold': false },
    timeline: [
      { id: 'pev-s-1', type: 'event', eventType: 'pet-handover', timestamp: isoStamp(-30, '12:00'), title: 'Odovzdanie diela', content: 'Bez vád a nedorobkov, záruka 10 rokov.', data: {} },
    ],
    gantt: [
      { id: 'g-s-1', title: 'Príprava podkladu', contactId: 'lead-skola', startDate: isoWeekday(-75), endDate: isoWeekday(-66), progress: 100 },
      { id: 'g-s-2', title: 'Hydroizolácia mPVC', contactId: 'lead-skola', startDate: isoWeekday(-66), endDate: isoWeekday(-44), progress: 100 },
      { id: 'g-s-3', title: 'Atiky a odvodnenie', contactId: 'lead-skola', startDate: isoWeekday(-44), endDate: isoWeekday(-32), progress: 100 },
    ],
  },
  {
    id: 'project-horvath',
    projectTypeId: 'ptype-windows',
    leadId: 'lead-horvath',
    clientId: 'lead-horvath',
    status: 'on_hold',
    managers: ['Jozef Baláž'],
    data: { 'attr-count': 11, 'attr-profile': 'Plast 6-komorový' },
    timeline: [
      { id: 'pev-ho-1', type: 'event', eventType: 'pet-measure', timestamp: isoStamp(1, '09:30'), title: 'Zameranie otvorov', content: 'Čaká sa na termín u klienta.', data: {} },
    ],
    gantt: [
      { id: 'g-ho-1', title: 'Zameranie', contactId: 'lead-horvath', startDate: isoWeekday(1), endDate: isoWeekday(2), progress: 0 },
      { id: 'g-ho-2', title: 'Výroba okien', contactId: 'lead-horvath', startDate: isoWeekday(3), endDate: isoWeekday(24), progress: 0 },
      { id: 'g-ho-3', title: 'Montáž a zapravenie', contactId: 'lead-horvath', startDate: isoWeekday(25), endDate: isoWeekday(31), progress: 0 },
    ],
  },
  {
    id: 'project-alfa',
    projectTypeId: 'ptype-service',
    leadId: 'lead-alfa',
    clientId: 'lead-alfa',
    status: 'active',
    managers: ['Erik Kováč', 'Lucia Bieliková'],
    data: { 'attr-objects': 14, 'attr-interval': 'Štvrťročne' },
    timeline: [
      { id: 'pev-a-1', type: 'event', eventType: 'pet-service', timestamp: isoStamp(-34, '08:00'), title: 'Q2 servisná obchôdzka', content: '14 objektov skontrolovaných, 3 drobné opravy.', data: {} },
      { id: 'pev-a-2', type: 'event', eventType: 'pet-service', timestamp: isoStamp(-6, '08:00'), title: 'Mimoriadny zásah — Vlčince', content: 'Zatekanie po víchrici, opravené do 24 h.', data: {} },
    ],
    gantt: [],
  },
  {
    id: 'project-bytdom',
    projectTypeId: 'ptype-roof',
    leadId: 'lead-bytdom',
    clientId: 'lead-bytdom',
    status: 'active',
    managers: ['Mária Tóthová'],
    data: { 'attr-area': 940, 'attr-start': isoDate(21), 'attr-variant': 'mPVC', 'attr-scaffold': true },
    timeline: [
      { id: 'pev-b-1', type: 'event', eventType: 'pet-visit', timestamp: isoStamp(-21, '17:00'), title: 'Schôdza vlastníkov', content: 'Prezentácia riešenia, hlasovanie prebehlo kladne.', data: {} },
    ],
    gantt: [
      { id: 'g-b-1', title: 'Zariadenie staveniska', contactId: 'lead-bytdom', startDate: isoWeekday(21), endDate: isoWeekday(24), progress: 0 },
      { id: 'g-b-2', title: 'Odstránenie pôvodných vrstiev', contactId: 'lead-bytdom', startDate: isoWeekday(24), endDate: isoWeekday(34), progress: 0 },
      { id: 'g-b-3', title: 'Tepelná izolácia PIR', contactId: 'lead-bytdom', startDate: isoWeekday(34), endDate: isoWeekday(48), progress: 0 },
      { id: 'g-b-4', title: 'Hydroizolácia a svetlíky', contactId: 'lead-bytdom', startDate: isoWeekday(48), endDate: isoWeekday(62), progress: 0 },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* 03 — Sklad & Hospodárstvo                                                  */
/* -------------------------------------------------------------------------- */

export const WAREHOUSES = [
  { id: 'wh-main', name: 'Hlavný sklad Bratislava', code: 'BA', address: 'Bratislava, Vajnorská 140', managerUserId: 'user-lucia', isDefault: true, createdAt: isoStamp(-400) },
  { id: 'wh-east', name: 'Sklad Východ — Košice', code: 'KE', address: 'Košice, Priemyselná 12', managerUserId: 'user-maria', isDefault: false, createdAt: isoStamp(-300) },
  { id: 'wh-van', name: 'Montážne vozidlo A', code: 'MV-A', address: 'Mobilný sklad', managerUserId: 'user-jozef', isDefault: false, createdAt: isoStamp(-180) },
];

export const SUPPLIERS = [
  {
    id: 'sup-1',
    name: 'Krytiny SK s.r.o.',
    companyId: '35812477',
    taxId: '2020184477',
    vatId: 'SK2020184477',
    street: 'Skladová 8',
    city: 'Trnava',
    postalCode: '91701',
    country: 'Slovensko',
    email: 'objednavky@krytiny.sk',
    phone: '+421 905 111 000',
    website: 'https://krytiny.sk',
    iban: 'SK11 1200 0000 0012 3456 7890',
    swift: 'GIBASKBX',
    paymentDueDays: 30,
    notes: 'Zľava 8 % pri objednávke nad 5 000 €. Doprava zdarma nad 3 000 €.',
    contacts: [
      { name: 'Lukáš Malý', position: 'Obchodný zástupca', phone: '+421 905 111 001', email: 'lukas@krytiny.sk' },
      { name: 'Katarína Rusnáková', position: 'Fakturácia', phone: '+421 905 111 002', email: 'faktury@krytiny.sk' },
    ],
    createdAt: isoStamp(-380),
  },
  {
    id: 'sup-2',
    name: 'Okná Plus a.s.',
    companyId: '31556788',
    taxId: '2020556788',
    vatId: 'SK2020556788',
    street: 'Výrobná 3',
    city: 'Nitra',
    postalCode: '94901',
    country: 'Slovensko',
    email: 'info@oknaplus.sk',
    phone: '+421 906 222 000',
    iban: 'SK55 0900 0000 0051 2345 6789',
    paymentDueDays: 14,
    notes: 'Dodacia lehota 3 týždne od zamerania.',
    contacts: [{ name: 'Roman Ďurica', position: 'Technik', phone: '+421 906 222 010', email: 'roman@oknaplus.sk' }],
    createdAt: isoStamp(-350),
  },
  {
    id: 'sup-3',
    name: 'Izolstav — hydroizolácie',
    companyId: '46117290',
    vatId: 'SK2023117290',
    street: 'Rybničná 40',
    city: 'Bratislava',
    postalCode: '83107',
    country: 'Slovensko',
    email: 'sklad@izolstav.sk',
    phone: '+421 907 333 000',
    paymentDueDays: 21,
    contacts: [{ name: 'Marek Sedlák', position: 'Vedúci skladu', phone: '+421 907 333 010', email: 'marek@izolstav.sk' }],
    createdAt: isoStamp(-260),
  },
  {
    id: 'sup-4',
    name: 'Klampiarske centrum s.r.o.',
    companyId: '50441278',
    street: 'Kováčska 21',
    city: 'Banská Bystrica',
    postalCode: '97401',
    country: 'Slovensko',
    email: 'obchod@klampcentrum.sk',
    phone: '+421 908 444 000',
    paymentDueDays: 30,
    contacts: [],
    createdAt: isoStamp(-190),
  },
];

export const WAREHOUSE_ITEMS = [
  { id: 'item-tile-clay', sku: 'KRY-101', barcode: '8590012340011', name: 'Pálená krytina — prírodná červená', description: 'Základná pálená taška, spotreba 10,2 ks/m².', category: 'Krytina', categories: ['Krytina'], unit: 'ks', minStock: 800, optimalStock: 4000, defaultLocation: 'A-01', hasExpiration: false, defaultSellPrice: 1.78, avgPurchasePrice: 1.12, lastPurchasePrice: 1.18, createdAt: isoStamp(-370) },
  { id: 'item-tile-conc', sku: 'KRY-102', barcode: '8590012340028', name: 'Betónová krytina antracit', description: 'Betónová taška, spotreba 10 ks/m².', category: 'Krytina', categories: ['Krytina'], unit: 'ks', minStock: 600, optimalStock: 3000, defaultLocation: 'A-02', hasExpiration: false, defaultSellPrice: 1.34, avgPurchasePrice: 0.86, lastPurchasePrice: 0.9, createdAt: isoStamp(-365) },
  { id: 'item-sheet', sku: 'KRY-110', name: 'Plechová krytina falcovaná 0,5 mm', description: 'Titánzinok, šírka pásu 670 mm.', category: 'Krytina', categories: ['Krytina'], unit: 'm²', minStock: 120, optimalStock: 700, defaultLocation: 'A-05', hasExpiration: false, defaultSellPrice: 42.5, avgPurchasePrice: 27.4, lastPurchasePrice: 28.9, createdAt: isoStamp(-300) },
  { id: 'item-foil', sku: 'FOL-201', name: 'Difúzna fólia 150 g/m²', description: 'Rolka 75 m².', category: 'Fólie a izolácie', categories: ['Fólie a izolácie'], unit: 'balenie', minStock: 15, optimalStock: 80, defaultLocation: 'B-04', hasExpiration: true, defaultSellPrice: 96, avgPurchasePrice: 61, lastPurchasePrice: 64, createdAt: isoStamp(-340) },
  { id: 'item-pir', sku: 'IZO-210', name: 'PIR doska 120 mm', description: 'Tepelná izolácia plochých striech, 1200×600 mm.', category: 'Fólie a izolácie', categories: ['Fólie a izolácie'], unit: 'm²', minStock: 200, optimalStock: 1500, defaultLocation: 'B-08', hasExpiration: false, defaultSellPrice: 24.9, avgPurchasePrice: 16.2, lastPurchasePrice: 17.1, createdAt: isoStamp(-250) },
  { id: 'item-mpvc', sku: 'IZO-220', name: 'Hydroizolačná fólia mPVC 1,5 mm', description: 'Rolka 20 × 1,6 m.', category: 'Fólie a izolácie', categories: ['Fólie a izolácie'], unit: 'rolka', minStock: 8, optimalStock: 45, defaultLocation: 'B-09', hasExpiration: true, defaultSellPrice: 268, avgPurchasePrice: 178, lastPurchasePrice: 184, createdAt: isoStamp(-240) },
  { id: 'item-gutter', sku: 'KLA-301', name: 'Odkvapový žľab pozink 150 mm', description: 'Dĺžka 4 m.', category: 'Klampiarske prvky', categories: ['Klampiarske prvky'], unit: 'ks', minStock: 40, optimalStock: 220, defaultLocation: 'C-01', hasExpiration: false, defaultSellPrice: 18.4, avgPurchasePrice: 11.2, lastPurchasePrice: 11.9, createdAt: isoStamp(-220) },
  { id: 'item-gutter-cu', sku: 'KLA-305', name: 'Odkvapový žľab meď 150 mm', description: 'Dĺžka 4 m, meď 0,6 mm.', category: 'Klampiarske prvky', categories: ['Klampiarske prvky'], unit: 'ks', minStock: 10, optimalStock: 60, defaultLocation: 'C-02', hasExpiration: false, defaultSellPrice: 74.9, avgPurchasePrice: 51.3, lastPurchasePrice: 54.8, createdAt: isoStamp(-210) },
  { id: 'item-window', sku: 'OKN-401', name: 'Okno 1200×1400 trojsklo', description: '6-komorový profil, Uw 0,86.', category: 'Okná a dvere', categories: ['Okná a dvere'], unit: 'ks', minStock: 4, optimalStock: 30, defaultLocation: 'D-01', hasExpiration: false, defaultSellPrice: 386, avgPurchasePrice: 244, lastPurchasePrice: 251, createdAt: isoStamp(-200) },
  { id: 'item-door', sku: 'OKN-420', name: 'Vchodové dvere hliník antracit', description: 'Bezpečnostné, 3-bodový zámok.', category: 'Okná a dvere', categories: ['Okná a dvere'], unit: 'ks', minStock: 2, optimalStock: 12, defaultLocation: 'D-04', hasExpiration: false, defaultSellPrice: 1480, avgPurchasePrice: 985, lastPurchasePrice: 1010, createdAt: isoStamp(-180) },
  { id: 'item-screw', sku: 'SPO-501', name: 'Samovrtná skrutka 4,8×35 (bal. 250)', category: 'Spojovací materiál', categories: ['Spojovací materiál'], unit: 'balenie', minStock: 20, optimalStock: 120, defaultLocation: 'E-02', hasExpiration: false, defaultSellPrice: 21.5, avgPurchasePrice: 13.4, lastPurchasePrice: 13.9, createdAt: isoStamp(-160) },
  { id: 'item-batten', sku: 'DRE-601', name: 'Strešná lata 40×60 impregnovaná', description: 'Dĺžka 4 m, KVH.', category: 'Drevo', categories: ['Drevo'], unit: 'bm', minStock: 400, optimalStock: 2400, defaultLocation: 'F-01', hasExpiration: false, defaultSellPrice: 2.15, avgPurchasePrice: 1.32, lastPurchasePrice: 1.44, createdAt: isoStamp(-150) },
];

export const WAREHOUSE_STOCK = [
  { warehouseId: 'wh-main', itemId: 'item-tile-clay', quantity: 2840, reservedQuantity: 1720, location: 'A-01' },
  { warehouseId: 'wh-main', itemId: 'item-tile-conc', quantity: 1960, reservedQuantity: 0, location: 'A-02' },
  { warehouseId: 'wh-main', itemId: 'item-sheet', quantity: 96, reservedQuantity: 40, location: 'A-05' },
  { warehouseId: 'wh-main', itemId: 'item-foil', quantity: 11, reservedQuantity: 4, location: 'B-04' },
  { warehouseId: 'wh-main', itemId: 'item-pir', quantity: 1180, reservedQuantity: 940, location: 'B-08' },
  { warehouseId: 'wh-main', itemId: 'item-mpvc', quantity: 31, reservedQuantity: 12, location: 'B-09' },
  { warehouseId: 'wh-main', itemId: 'item-gutter', quantity: 164, reservedQuantity: 22, location: 'C-01' },
  { warehouseId: 'wh-main', itemId: 'item-gutter-cu', quantity: 6, reservedQuantity: 0, location: 'C-02' },
  { warehouseId: 'wh-main', itemId: 'item-screw', quantity: 78, reservedQuantity: 10, location: 'E-02' },
  { warehouseId: 'wh-main', itemId: 'item-batten', quantity: 1640, reservedQuantity: 720, location: 'F-01' },
  { warehouseId: 'wh-east', itemId: 'item-window', quantity: 17, reservedQuantity: 11, location: 'D-01' },
  { warehouseId: 'wh-east', itemId: 'item-door', quantity: 3, reservedQuantity: 1, location: 'D-04' },
  { warehouseId: 'wh-east', itemId: 'item-tile-conc', quantity: 640, reservedQuantity: 0, location: 'A-02' },
  { warehouseId: 'wh-van', itemId: 'item-screw', quantity: 14, reservedQuantity: 0, location: 'Vozidlo' },
  { warehouseId: 'wh-van', itemId: 'item-gutter', quantity: 9, reservedQuantity: 0, location: 'Vozidlo' },
];

export const WAREHOUSE_BATCHES = [
  { id: 'batch-1', itemId: 'item-foil', warehouseId: 'wh-main', batchNumber: 'LOT-2026-0714', expirationDate: isoDate(210), initialQuantity: 30, currentQuantity: 11, purchasePrice: 61, createdAt: isoStamp(-120) },
  { id: 'batch-2', itemId: 'item-mpvc', warehouseId: 'wh-main', batchNumber: 'LOT-2026-0902', expirationDate: isoDate(48), initialQuantity: 45, currentQuantity: 31, purchasePrice: 178, createdAt: isoStamp(-70) },
  { id: 'batch-3', itemId: 'item-mpvc', warehouseId: 'wh-main', batchNumber: 'LOT-2025-1120', expirationDate: isoDate(-12), initialQuantity: 20, currentQuantity: 2, purchasePrice: 171, createdAt: isoStamp(-320) },
];

export const WAREHOUSE_MOVEMENTS = [
  {
    id: 'mv-1', documentNumber: 'PRI-2026-0042', type: 'inward', status: 'confirmed', warehouseId: 'wh-main', supplierId: 'sup-1',
    totalCostValue: 3351.2, totalSellValue: 5326.4, totalProfitValue: 1975.2, createdBy: 'Lucia Bieliková',
    note: 'Príjem pálenej krytiny pre zákazku Hrušková.', issuedAt: isoStamp(-18, '08:00'), createdAt: isoStamp(-18, '08:00'),
    items: [{ id: 'mvi-1', movementId: 'mv-1', itemId: 'item-tile-clay', quantity: 2840, unitPurchasePrice: 1.18, unitSellPrice: 1.78, totalPrice: 3351.2 }],
  },
  {
    id: 'mv-2', documentNumber: 'PRI-2026-0043', type: 'inward', status: 'confirmed', warehouseId: 'wh-main', supplierId: 'sup-3',
    totalCostValue: 20178, totalSellValue: 29382, totalProfitValue: 9204, createdBy: 'Lucia Bieliková',
    note: 'PIR dosky a hydroizolácia pre bytový dom Hálova.', issuedAt: isoStamp(-11, '09:30'), createdAt: isoStamp(-11, '09:30'),
    items: [
      { id: 'mvi-2', movementId: 'mv-2', itemId: 'item-pir', quantity: 1180, unitPurchasePrice: 17.1, unitSellPrice: 24.9, totalPrice: 20178 },
    ],
  },
  {
    id: 'mv-3', documentNumber: 'VYD-2026-0117', type: 'outward', status: 'confirmed', warehouseId: 'wh-main', leadId: 'lead-vinarstvo',
    totalCostValue: 5202.6, totalSellValue: 8075, totalProfitValue: 2872.4, createdBy: 'Mária Tóthová',
    note: 'Výdaj plechovej krytiny — Vinárstvo, etapa 2.', issuedAt: isoStamp(-9, '07:15'), createdAt: isoStamp(-9, '07:15'),
    items: [{ id: 'mvi-3', movementId: 'mv-3', itemId: 'item-sheet', quantity: 190, unitPurchasePrice: 27.4, unitSellPrice: 42.5, totalPrice: 5206 }],
  },
  {
    id: 'mv-4', documentNumber: 'VYD-2026-0118', type: 'outward', status: 'confirmed', warehouseId: 'wh-main', leadId: 'lead-alfa',
    totalCostValue: 428.4, totalSellValue: 702, totalProfitValue: 273.6, createdBy: 'Jozef Baláž',
    note: 'Materiál na mimoriadny zásah — Vlčince.', issuedAt: isoStamp(-6, '06:40'), createdAt: isoStamp(-6, '06:40'),
    items: [
      { id: 'mvi-4', movementId: 'mv-4', itemId: 'item-gutter', quantity: 24, unitPurchasePrice: 11.9, unitSellPrice: 18.4, totalPrice: 285.6 },
      { id: 'mvi-5', movementId: 'mv-4', itemId: 'item-screw', quantity: 6, unitPurchasePrice: 13.9, unitSellPrice: 21.5, totalPrice: 83.4 },
    ],
  },
  {
    id: 'mv-5', documentNumber: 'PRE-2026-0009', type: 'transfer', status: 'confirmed', warehouseId: 'wh-main', targetWarehouseId: 'wh-van',
    totalCostValue: 190.6, totalSellValue: 297.6, totalProfitValue: 107, createdBy: 'Lucia Bieliková',
    note: 'Doplnenie montážneho vozidla A.', issuedAt: isoStamp(-3, '16:20'), createdAt: isoStamp(-3, '16:20'),
    items: [
      { id: 'mvi-6', movementId: 'mv-5', itemId: 'item-gutter', quantity: 9, unitPurchasePrice: 11.9, unitSellPrice: 18.4, totalPrice: 107.1 },
      { id: 'mvi-7', movementId: 'mv-5', itemId: 'item-screw', quantity: 6, unitPurchasePrice: 13.9, unitSellPrice: 21.5, totalPrice: 83.4 },
    ],
  },
  {
    id: 'mv-6', documentNumber: 'VYD-2026-0119', type: 'outward', status: 'draft', warehouseId: 'wh-main', leadId: 'lead-silvia',
    totalCostValue: 2029.6, totalSellValue: 3061.6, totalProfitValue: 1032, createdBy: 'Mária Tóthová',
    note: 'Pripravený výdaj na nástup partie — čaká na potvrdenie.', issuedAt: isoStamp(0, '11:00'), createdAt: isoStamp(0, '11:00'),
    items: [
      { id: 'mvi-8', movementId: 'mv-6', itemId: 'item-tile-clay', quantity: 1720, unitPurchasePrice: 1.18, unitSellPrice: 1.78, totalPrice: 2029.6 },
    ],
  },
  {
    id: 'mv-7', documentNumber: 'INV-2026-0003', type: 'adjustment', status: 'confirmed', warehouseId: 'wh-main',
    totalCostValue: -342, totalSellValue: -536, totalProfitValue: -194, createdBy: 'Lucia Bieliková',
    note: 'Mesačná inventúra — poškodené rolky mPVC odpísané.', issuedAt: isoStamp(-2, '17:00'), createdAt: isoStamp(-2, '17:00'),
    items: [{ id: 'mvi-9', movementId: 'mv-7', itemId: 'item-mpvc', quantity: -2, unitPurchasePrice: 171, unitSellPrice: 268, totalPrice: -342 }],
  },
];

/* -------------------------------------------------------------------------- */
/* 04 — Financie & Cash Flow                                                  */
/* -------------------------------------------------------------------------- */

export const FINANCIAL_CATEGORIES = [
  { id: 'fc-in', type: 'income', name: 'Realizácie', level: 1, color: '#16a34a', icon: 'TrendingUp', createdAt: isoStamp(-400) },
  { id: 'fc-in-roof', type: 'income', name: 'Strechy', parentId: 'fc-in', level: 2, color: '#22c55e', createdAt: isoStamp(-400) },
  { id: 'fc-in-win', type: 'income', name: 'Okná a dvere', parentId: 'fc-in', level: 2, color: '#4ade80', createdAt: isoStamp(-400) },
  { id: 'fc-in-svc', type: 'income', name: 'Servis a údržba', parentId: 'fc-in', level: 2, color: '#86efac', createdAt: isoStamp(-400) },
  { id: 'fc-in-other', type: 'income', name: 'Ostatné príjmy', level: 1, color: '#0ea5e9', icon: 'Coins', createdAt: isoStamp(-400) },
  { id: 'fc-ex-mat', type: 'expense', name: 'Materiál', level: 1, color: '#dc2626', icon: 'Package', createdAt: isoStamp(-400) },
  { id: 'fc-ex-mat-roof', type: 'expense', name: 'Krytiny a izolácie', parentId: 'fc-ex-mat', level: 2, color: '#ef4444', createdAt: isoStamp(-400) },
  { id: 'fc-ex-mat-klamp', type: 'expense', name: 'Klampiarsky materiál', parentId: 'fc-ex-mat', level: 2, color: '#f87171', createdAt: isoStamp(-400) },
  { id: 'fc-ex-wages', type: 'expense', name: 'Mzdy a odvody', level: 1, color: '#f97316', icon: 'Users', createdAt: isoStamp(-400) },
  { id: 'fc-ex-sub', type: 'expense', name: 'Subdodávky', level: 1, color: '#a855f7', icon: 'Hammer', createdAt: isoStamp(-400) },
  { id: 'fc-ex-op', type: 'expense', name: 'Prevádzka', level: 1, color: '#64748b', icon: 'Building2', createdAt: isoStamp(-400) },
  { id: 'fc-ex-op-fuel', type: 'expense', name: 'Pohonné hmoty', parentId: 'fc-ex-op', level: 2, color: '#94a3b8', createdAt: isoStamp(-400) },
  { id: 'fc-ex-op-rent', type: 'expense', name: 'Nájom a energie', parentId: 'fc-ex-op', level: 2, color: '#cbd5e1', createdAt: isoStamp(-400) },
];

/**
 * Eight months of operating costs, so the cash-flow charts have a spine.
 *
 * Only the current month's wage and rent rows carry `isRecurring`. Flagging all
 * eight would register eight overlapping monthly series, and the forward
 * projection then stacks them — the weekly cash-flow chart drew ~150 k € of
 * wages a month against a company whose wage bill is ~18 k.
 */
const MONTHLY_BASE = Array.from({ length: 8 }).flatMap((_, i) => {
  const back = 7 - i;
  return [
    {
      id: `fr-wage-${back}`, type: 'expense', subtype: 'salary', title: `Mzdy a odvody — ${monthStart(back).slice(0, 7)}`,
      categoryId: 'fc-ex-wages', categoryPath: 'Mzdy a odvody',
      amountPlanned: 18400 + back * 210, amountReal: 18400 + back * 210, currency: 'EUR',
      status: back === 0 ? 'pending' : 'paid', issueDate: monthDay(back, 10), dueDate: monthDay(back, 15),
      paidDate: back === 0 ? undefined : monthDay(back, 14), paymentMethod: 'bank_transfer',
      isRecurring: back === 0, recurringFrequency: 'monthly', recurringConfig: { monthlyType: 'day_of_month', dayOfMonth: 15 },
      recurringStartDate: monthStart(11), createdBy: 'Lucia Bieliková', createdAt: `${monthDay(back, 10)} 09:00`,
    },
    {
      id: `fr-rent-${back}`, type: 'expense', subtype: 'regular', title: `Nájom haly a energie — ${monthStart(back).slice(0, 7)}`,
      categoryId: 'fc-ex-op-rent', categoryPath: 'Prevádzka / Nájom a energie',
      amountPlanned: 2450, amountReal: 2450, currency: 'EUR',
      status: back === 0 ? 'pending' : 'paid', issueDate: monthDay(back, 1), dueDate: monthDay(back, 8),
      paidDate: back === 0 ? undefined : monthDay(back, 7), paymentMethod: 'bank_transfer',
      isRecurring: back === 0, recurringFrequency: 'monthly', recurringConfig: { monthlyType: 'day_of_month', dayOfMonth: 8 },
      recurringStartDate: monthStart(11), createdBy: 'Lucia Bieliková', createdAt: `${monthDay(back, 1)} 09:00`,
    },
    {
      id: `fr-fuel-${back}`, type: 'expense', subtype: 'regular', title: `Pohonné hmoty — ${monthStart(back).slice(0, 7)}`,
      categoryId: 'fc-ex-op-fuel', categoryPath: 'Prevádzka / Pohonné hmoty',
      amountPlanned: 1250, amountReal: 1180 + back * 24, currency: 'EUR',
      status: back === 0 ? 'pending' : 'paid', issueDate: monthDay(back, 3), dueDate: monthDay(back, 20),
      paidDate: back === 0 ? undefined : monthDay(back, 18), paymentMethod: 'card',
      isRecurring: false, createdBy: 'Lucia Bieliková', createdAt: `${monthDay(back, 3)} 09:00`,
    },
    {
      id: `fr-rev-${back}`, type: 'income', subtype: 'invoice', title: `Fakturácia realizácií — ${monthStart(back).slice(0, 7)}`,
      categoryId: 'fc-in-roof', categoryPath: 'Realizácie / Strechy',
      amountPlanned: 34000 + back * 1900, amountReal: 34000 + back * 1900, currency: 'EUR',
      status: back === 0 ? 'pending' : 'paid', issueDate: monthDay(back, 25), dueDate: monthDay(back, 28),
      paidDate: back === 0 ? undefined : monthDay(back, 28), paymentMethod: 'bank_transfer',
      isRecurring: false, taxRate: 20, createdBy: 'Lucia Bieliková', createdAt: `${monthDay(back, 25)} 09:00`,
    },
  ];
});

export const FINANCIAL_RECORDS = [
  ...MONTHLY_BASE,
  {
    id: 'fr-hruskova-zaloha', type: 'income', subtype: 'invoice', title: 'Zálohová faktúra — Hrušková, strecha',
    description: 'Záloha 40 % na materiál a lešenie.',
    categoryId: 'fc-in-roof', categoryPath: 'Realizácie / Strechy',
    amountPlanned: 9920, amountReal: 9920, currency: 'EUR', status: 'paid',
    issueDate: isoDate(-28), dueDate: isoDate(-14), paidDate: isoDate(-15), paymentMethod: 'bank_transfer',
    isRecurring: false, projectId: 'project-hruskova', clientId: 'lead-silvia',
    invoiceNumber: 'FA-2026-031', taxRate: 20, createdBy: 'Lucia Bieliková', createdAt: isoStamp(-28),
  },
  {
    id: 'fr-hruskova-final', type: 'income', subtype: 'invoice', title: 'Doplatok — Hrušková, strecha',
    categoryId: 'fc-in-roof', categoryPath: 'Realizácie / Strechy',
    amountPlanned: 14880, amountReal: 0, currency: 'EUR', status: 'planned',
    issueDate: isoDate(28), dueDate: isoDate(42),
    isRecurring: false, projectId: 'project-hruskova', clientId: 'lead-silvia', taxRate: 20,
    createdBy: 'Lucia Bieliková', createdAt: isoStamp(-1),
  },
  {
    id: 'fr-alfa-q', type: 'income', subtype: 'invoice', title: 'Alfa Reality — štvrťročná údržba',
    categoryId: 'fc-in-svc', categoryPath: 'Realizácie / Servis a údržba',
    amountPlanned: 12400, amountReal: 0, currency: 'EUR', status: 'overdue',
    issueDate: isoDate(-34), dueDate: isoDate(-6),
    isRecurring: true, recurringFrequency: 'yearly', recurringConfig: { monthlyType: 'day_of_month', dayOfMonth: 1 },
    projectId: 'project-alfa', clientId: 'lead-alfa', invoiceNumber: 'FA-2026-027', taxRate: 20,
    createdBy: 'Lucia Bieliková', createdAt: isoStamp(-34),
  },
  {
    id: 'fr-vinarstvo-2', type: 'income', subtype: 'invoice', title: 'Vinárstvo Pod Zámkom — etapa 2',
    categoryId: 'fc-in-roof', categoryPath: 'Realizácie / Strechy',
    amountPlanned: 16700, amountReal: 8350, currency: 'EUR', status: 'partially_paid',
    issueDate: isoDate(-40), dueDate: isoDate(-12), paidDate: isoDate(-13), paymentMethod: 'bank_transfer',
    isRecurring: false, projectId: 'project-vinarstvo', clientId: 'lead-vinarstvo',
    invoiceNumber: 'FA-2026-024', taxRate: 20, createdBy: 'Lucia Bieliková', createdAt: isoStamp(-40),
  },
  {
    id: 'fr-skola', type: 'income', subtype: 'invoice', title: 'ZŠ Mierová — strecha telocvične',
    categoryId: 'fc-in-roof', categoryPath: 'Realizácie / Strechy',
    amountPlanned: 28900, amountReal: 28900, currency: 'EUR', status: 'paid',
    issueDate: isoDate(-30), dueDate: isoDate(-2), paidDate: isoDate(-4), paymentMethod: 'bank_transfer',
    isRecurring: false, projectId: 'project-skola', clientId: 'lead-skola',
    invoiceNumber: 'FA-2026-029', taxRate: 20, createdBy: 'Lucia Bieliková', createdAt: isoStamp(-30),
  },
  {
    id: 'fr-mat-krytiny', type: 'expense', subtype: 'material', title: 'Krytiny SK — pálená krytina',
    categoryId: 'fc-ex-mat-roof', categoryPath: 'Materiál / Krytiny a izolácie',
    amountPlanned: 3351, amountReal: 3351, currency: 'EUR', status: 'paid',
    issueDate: isoDate(-18), dueDate: isoDate(12), paidDate: isoDate(-4), paymentMethod: 'bank_transfer',
    isRecurring: false, projectId: 'project-hruskova', createdBy: 'Lucia Bieliková', createdAt: isoStamp(-18),
  },
  {
    id: 'fr-mat-pir', type: 'expense', subtype: 'material', title: 'Izolstav — PIR dosky a mPVC',
    categoryId: 'fc-ex-mat-roof', categoryPath: 'Materiál / Krytiny a izolácie',
    amountPlanned: 20178, amountReal: 0, currency: 'EUR', status: 'pending',
    issueDate: isoDate(-11), dueDate: isoDate(10),
    isRecurring: false, projectId: 'project-bytdom', createdBy: 'Lucia Bieliková', createdAt: isoStamp(-11),
  },
  {
    id: 'fr-sub-lesenie', type: 'expense', subtype: 'regular', title: 'Prenájom lešenia — Hálova 12',
    categoryId: 'fc-ex-sub', categoryPath: 'Subdodávky',
    amountPlanned: 4200, amountReal: 0, currency: 'EUR', status: 'planned',
    issueDate: isoDate(20), dueDate: isoDate(34),
    isRecurring: false, projectId: 'project-bytdom', createdBy: 'Mária Tóthová', createdAt: isoStamp(-2),
  },
  {
    id: 'fr-klamp', type: 'expense', subtype: 'material', title: 'Klampiarske centrum — medené žľaby',
    categoryId: 'fc-ex-mat-klamp', categoryPath: 'Materiál / Klampiarsky materiál',
    amountPlanned: 1642, amountReal: 1642, currency: 'EUR', status: 'paid',
    issueDate: isoDate(-22), dueDate: isoDate(8), paidDate: isoDate(-9), paymentMethod: 'bank_transfer',
    isRecurring: false, createdBy: 'Lucia Bieliková', createdAt: isoStamp(-22),
  },
  {
    id: 'fr-leasing', type: 'expense', subtype: 'regular', title: 'Leasing montážnej plošiny',
    categoryId: 'fc-ex-op', categoryPath: 'Prevádzka',
    amountPlanned: 640, amountReal: 640, currency: 'EUR', status: 'paid',
    issueDate: isoDate(-12), dueDate: isoDate(2), paidDate: isoDate(-3), paymentMethod: 'bank_transfer',
    isRecurring: true, recurringFrequency: 'monthly', recurringConfig: { monthlyType: 'day_of_month', dayOfMonth: 2 },
    recurringStartDate: monthStart(18), createdBy: 'Lucia Bieliková', createdAt: isoStamp(-12),
  },
  {
    id: 'fr-poistenie', type: 'expense', subtype: 'regular', title: 'Poistenie zodpovednosti za škodu',
    categoryId: 'fc-ex-op', categoryPath: 'Prevádzka',
    amountPlanned: 1980, amountReal: 1980, currency: 'EUR', status: 'paid',
    issueDate: isoDate(-60), dueDate: isoDate(-46), paidDate: isoDate(-48), paymentMethod: 'bank_transfer',
    isRecurring: true, recurringFrequency: 'yearly', recurringStartDate: monthStart(24),
    createdBy: 'Erik Kováč', createdAt: isoStamp(-60),
  },
  {
    id: 'fr-dotacia', type: 'income', subtype: 'regular', title: 'Dotácia na obnovu vozového parku',
    categoryId: 'fc-in-other', categoryPath: 'Ostatné príjmy',
    amountPlanned: 8000, amountReal: 8000, currency: 'EUR', status: 'paid',
    issueDate: isoDate(-70), dueDate: isoDate(-56), paidDate: isoDate(-52), paymentMethod: 'bank_transfer',
    isRecurring: false, createdBy: 'Erik Kováč', createdAt: isoStamp(-70),
  },
];

/* -------------------------------------------------------------------------- */
/* 05 — Hlasová zasadačka                                                     */
/* -------------------------------------------------------------------------- */

export const MEETING_NOTES = [
  {
    id: 'mn-1',
    title: 'Pondelková porada — plán týždňa',
    date: isoDate(-3),
    leadId: '',
    leadName: '',
    duration: 34,
    notes: 'Prešli sme kapacity partií na najbližšie dva týždne, stav ponúk a otvorené pohľadávky.',
    transcription:
      'Erik: Dobré ráno, začneme kapacitami. Partia A ide v stredu na Hruškovú, partia B dokončuje vinárstvo.\n' +
      'Mária: Vinárstvo je na sedemdesiatich percentách, klampiarske dokončenie stihneme do konca mesiaca.\n' +
      'Erik: Dobre. Čo Hálova?\n' +
      'Mária: Vlastníci odhlasovali, čakáme na podpis zmluvy. Lešenie treba objednať tri týždne vopred.\n' +
      'Lucia: Poprosím o pozor na Alfa Reality — faktúra je šesť dní po splatnosti, pošlem upomienku.\n' +
      'Jozef: Ja mám zajtra zameranie u Horvátha v Nitre a v piatok odovzdávam ponuku na Šahy.',
    aiSummary: {
      summary:
        'Kapacity na najbližšie dva týždne sú pokryté: partia A nastupuje na zákazku Hrušková, partia B dokončuje Vinárstvo Pod Zámkom (70 %). Bytový dom Hálova 12 je odhlasovaný vlastníkmi a čaká na podpis zmluvy — lešenie treba objednať tri týždne vopred. Otvorená je jedna pohľadávka po splatnosti (Alfa Reality, 12 400 €).',
      actionItems: [
        'Lucia — poslať upomienku k faktúre FA-2026-027 (Alfa Reality)',
        'Mária — objednať lešenie na Hálovu 12 po podpise zmluvy',
        'Jozef — zameranie okien u Horvátha (Nitra), utorok 9:30',
        'Erik — doplniť podklady do súťaže na športovú halu',
      ],
      sentiment: 'positive',
      topics: ['Kapacity partií', 'Pohľadávky', 'Hálova 12', 'Verejná súťaž'],
    },
    attachedUsers: ['user-erik', 'user-maria', 'user-jozef', 'user-lucia'],
    summaryGenerated: true,
    audioFile: '/uploads/porada-pondelok.wav',
    automatedNotes: `## Pondelková porada — plán týždňa

**Účastníci:** Erik Kováč, Mária Tóthová, Jozef Baláž, Lucia Bieliková · **Trvanie:** 34 min

### Kapacity partií
- **Partia A** — v stredu nastupuje na zákazku *Hrušková* (Bratislava, 168 m²).
- **Partia B** — dokončuje *Vinárstvo Pod Zámkom*, etapa 2 je na 70 %.

### Otvorené obchodné prípady
- *Hálova 12* — vlastníci odhlasovali kladne, čaká sa na podpis zmluvy. Lešenie treba objednať **tri týždne vopred**.
- *Novák Stavby* — ponuka bez odpovede 9 dní, klient žiadal splatnosť 30 dní.

### Financie
- Jedna pohľadávka po splatnosti: **Alfa Reality, 12 400 €** (6 dní).

### Rozhodnutia
1. Upomienku Alfa Reality poslať ešte dnes.
2. Lešenie na Hálovu objednať hneď po podpise.
3. Ponuku pre Nováka upraviť na splatnosť 30 dní oproti zálohe 30 %.`,
    automatedTasks: [
      { id: 'mt-1', title: 'Poslať upomienku Alfa Reality', assignedTo: 'Lucia Bieliková', deadline: isoDate(-1), created: true },
      { id: 'mt-2', title: 'Objednať lešenie — Hálova 12', assignedTo: 'Mária Tóthová', deadline: isoDate(14), created: true },
    ],
  },
  {
    id: 'mn-2',
    title: 'Rokovanie — Novák Stavby, subdodávka strešného plášťa',
    date: isoDate(-9),
    leadId: 'lead-novak',
    leadName: 'Novák Stavby s.r.o.',
    duration: 52,
    notes: 'Prešli sme skladbu strechy, harmonogram a platobné podmienky.',
    transcription:
      'Ján Novák: Potrebujeme mať plášť hotový do konca októbra, inak nám padá celý harmonogram.\n' +
      'Mária: Pri 1 240 metroch a skladbe s PIR-om počítame s piatimi týždňami čistej práce.\n' +
      'Ján Novák: A záruka?\n' +
      'Mária: Desať rokov na hydroizoláciu, päť na klampiarske prvky.\n' +
      'Ján Novák: Platobné podmienky by sme radi 30 dní.\n' +
      'Mária: Vieme ísť na 30 dní pri zálohe 30 % na materiál.',
    aiSummary: {
      summary:
        'Klient trvá na dokončení strešného plášťa do konca októbra. Odsúhlasená skladba s PIR izoláciou 120 mm a hydroizoláciou mPVC, plocha 1 240 m², odhad päť týždňov realizácie. Záruka 10 rokov na hydroizoláciu, 5 rokov na klampiarske prvky. Dohodnutá splatnosť 30 dní oproti zálohe 30 % na materiál.',
      actionItems: [
        'Mária — upraviť CP-2026-036 o zálohu 30 % a splatnosť 30 dní',
        'Mária — pripraviť harmonogram na 5 týždňov s rezervou na počasie',
        'Erik — overiť dostupnosť PIR dosiek u Izolstavu',
      ],
      sentiment: 'positive',
      topics: ['Subdodávka', 'Harmonogram', 'Platobné podmienky', 'Záruka'],
    },
    attachedLeads: ['lead-novak'],
    attachedUsers: ['user-maria', 'user-erik'],
    summaryGenerated: true,
    audioFile: '/uploads/rokovanie-novak.wav',
    automatedNotes: `## Rokovanie — Novák Stavby s.r.o.

**Predmet:** subdodávka strešného plášťa, 1 240 m² · **Trvanie:** 52 min

### Dohodnutý rozsah
- Odstránenie pôvodných vrstiev, tepelná izolácia **PIR 120 mm**, hydroizolácia **mPVC 1,5 mm**.
- Atiky, oplechovanie a strešné vpuste v cene.

### Termín
- Plášť musí byť hotový **do konca októbra**, inak padá harmonogram celej stavby.
- Náš odhad: **5 týždňov** čistej práce + rezerva na počasie.

### Obchodné podmienky
| Položka | Dohoda |
|---|---|
| Splatnosť | 30 dní |
| Záloha | 30 % na materiál |
| Záruka — hydroizolácia | 10 rokov |
| Záruka — klampiarske prvky | 5 rokov |

### Ďalší krok
Upraviť CP-2026-036 a poslať do dvoch pracovných dní.`,
    automatedTasks: [
      { id: 'mt-3', title: 'Upraviť CP-2026-036 — záloha a splatnosť', assignedTo: 'Mária Tóthová', deadline: isoDate(2), created: true },
    ],
  },
  {
    id: 'mn-3',
    title: 'Schôdza vlastníkov — SVB Hálova 12',
    date: isoDate(-21),
    leadId: 'lead-bytdom',
    leadName: 'SVB Petržalka — Hálova 12',
    duration: 71,
    notes: 'Prezentácia troch variantov sanácie plochej strechy, diskusia o financovaní.',
    transcription:
      'Mária: Predstavím tri varianty — od najlacnejšieho prekrytia až po kompletnú sanáciu s novou izoláciou.\n' +
      'Vlastník: A ktorý z nich nám vydrží dvadsať rokov?\n' +
      'Mária: Iba tretí. Prvé dva sú lacnejšie, ale za osem rokov to riešite znova.\n' +
      'Predseda: Vieme to rozložiť na splátky?\n' +
      'Mária: Áno, ponúkame splátkový kalendár na dvanásť mesiacov bez navýšenia.',
    aiSummary: {
      summary:
        'Vlastníkom boli predstavené tri varianty sanácie 940 m² plochej strechy. Odporúčaný je variant 3 (kompletná sanácia s PIR izoláciou a novými svetlíkmi) so životnosťou 20+ rokov. Kľúčovou otázkou bolo financovanie — ponúknutý splátkový kalendár na 12 mesiacov bez navýšenia. Hlasovanie dopadlo kladne.',
      actionItems: [
        'Mária — pripraviť zhrnutie ponuky na jednu stranu pre vlastníkov',
        'Lucia — pripraviť splátkový kalendár na 12 mesiacov',
        'Mária — dohodnúť podpis zmluvy s predsedom SVB',
      ],
      sentiment: 'positive',
      topics: ['Sanácia plochej strechy', 'Financovanie', 'Splátkový kalendár', 'Hlasovanie'],
    },
    attachedLeads: ['lead-bytdom'],
    attachedUsers: ['user-maria'],
    summaryGenerated: true,
    audioFile: '/uploads/schodza-halova.wav',
    automatedTasks: [],
  },
  {
    id: 'mn-4',
    title: 'Kontrolný deň — Vinárstvo Pod Zámkom',
    date: isoDate(-12),
    leadId: 'lead-vinarstvo',
    leadName: 'Vinárstvo Pod Zámkom s.r.o.',
    duration: 26,
    notes: 'Kontrola postupu na etape 2, riešenie detailu napojenia na starú halu.',
    transcription:
      'Michal Krajčír: Ako sme na tom s degustačnou sálou?\n' +
      'Mária: Sedemdesiat percent. Zdržal nás detail napojenia na starú halu.\n' +
      'Michal Krajčír: Bude to tesné aj pri prívalovom daždi?\n' +
      'Mária: Áno, riešime to dvojitým falcom a prídavným lemom.',
    aiSummary: {
      summary:
        'Etapa 2 (degustačná sála) je na 70 %. Zdržanie spôsobil detail napojenia na pôvodnú halu — vyriešené dvojitým falcom a prídavným lemovaním. Termín dokončenia zostáva v pláne.',
      actionItems: ['Mária — objednať prídavné lemovanie', 'Erik — potvrdiť termín klampiarskeho dokončenia'],
      sentiment: 'neutral',
      topics: ['Kontrolný deň', 'Detail napojenia', 'Termín'],
    },
    attachedLeads: ['lead-vinarstvo'],
    attachedUsers: ['user-maria'],
    summaryGenerated: true,
    audioFile: '/uploads/kontrolny-den-vinarstvo.wav',
    automatedTasks: [],
  },
  {
    id: 'mn-5',
    title: 'Interná porada — cenník klampiarskych prác',
    date: isoDate(-16),
    leadId: '',
    leadName: '',
    duration: 41,
    notes: 'Prehodnotenie marží po zdražení medi a titánzinku.',
    transcription:
      'Erik: Meď nám za pol roka zdražela o osemnásť percent. Ak nezdvihneme cenník, ideme na klampiarine pod nulu.\n' +
      'Jozef: Klienti to znesú, ale musíme to vedieť vysvetliť.\n' +
      'Lucia: Navrhujem prepočítať marže na položku, nie plošné zdvihnutie.',
    aiSummary: {
      summary:
        'Meď zdražela o 18 % za pol roka, titánzinok o 9 %. Plošné zdvihnutie cenníka bolo zamietnuté v prospech prepočtu marže po jednotlivých položkách. Zdôvodnenie pre klientov pripraví obchod.',
      actionItems: [
        'Erik — aktualizovať cenník klampiarskych prác po položkách',
        'Jozef — pripraviť argumentáciu pre klientov',
        'Lucia — prepočítať marže z posledných 20 zákaziek',
      ],
      sentiment: 'neutral',
      topics: ['Cenník', 'Marže', 'Ceny materiálu'],
    },
    attachedUsers: ['user-erik', 'user-jozef', 'user-lucia'],
    summaryGenerated: true,
    audioFile: null,
    automatedTasks: [],
  },
];

/* -------------------------------------------------------------------------- */
/* 02 & 10 — Adresár, registre a vlastné evidencie                            */
/* -------------------------------------------------------------------------- */

export const UNIFIED_ENTRIES = [
  {
    id: 'ue-zmluvy', name: 'Zmluvy a dokumenty', entryName: 'Dokument', folderName: 'Priečinok',
    icon: 'FileText', color: '#6366f1',
    modules: ['title', 'due_date', 'file', 'client'], folderModules: ['title'],
    foldersEnabled: true, showFolderSummary: true, warningDays: 30, archived: false,
  },
  {
    id: 'ue-revizie', name: 'Revízie a certifikáty', entryName: 'Revízia', folderName: 'Objekt',
    icon: 'ShieldCheck', color: '#0ea5e9',
    modules: ['title', 'due_date', 'file', 'client'], folderModules: ['title'],
    foldersEnabled: true, showFolderSummary: true, warningDays: 45, archived: false,
  },
  {
    id: 'ue-technika', name: 'Technika a náradie', entryName: 'Zariadenie', folderName: 'Kategória',
    icon: 'Wrench', color: '#f59e0b',
    modules: ['title', 'due_date', 'file'], folderModules: ['title'],
    foldersEnabled: true, showFolderSummary: false, warningDays: 30, archived: false,
  },
  {
    id: 'ue-skolenia', name: 'Školenia zamestnancov', entryName: 'Školenie', folderName: 'Zamestnanec',
    icon: 'GraduationCap', color: '#10b981',
    modules: ['title', 'due_date', 'file'], folderModules: ['title'],
    foldersEnabled: true, showFolderSummary: true, warningDays: 60, archived: false,
  },
];

export const UNIFIED_ENTRIES_DATA = {
  'ue-zmluvy': [
    { id: 'folder-zod', parentId: null, isFolder: true, title: 'Zmluvy o dielo 2026', icon: 'Folder' },
    { id: 'folder-ramcove', parentId: null, isFolder: true, title: 'Rámcové zmluvy', icon: 'Folder' },
    { id: 'folder-dodavatelske', parentId: null, isFolder: true, title: 'Dodávateľské zmluvy', icon: 'Folder' },
    { id: 'entry-z1', parentId: 'folder-zod', isFolder: false, title: 'Zmluva o dielo — Hrušková, rekonštrukcia strechy', dueDate: isoDate(120), fileName: 'ZoD-2026-018.pdf', fileSize: '284 KB', filePath: '/uploads/ZoD-2026-018.pdf', clientId: 'lead-silvia', leadId: 'lead-silvia' },
    { id: 'entry-z2', parentId: 'folder-zod', isFolder: false, title: 'Zmluva o dielo — Vinárstvo Pod Zámkom', dueDate: isoDate(40), fileName: 'ZoD-2026-011.pdf', fileSize: '312 KB', filePath: '/uploads/ZoD-2026-011.pdf', clientId: 'lead-vinarstvo', leadId: 'lead-vinarstvo' },
    { id: 'entry-z3', parentId: 'folder-zod', isFolder: false, title: 'Zmluva o dielo — ZŠ Mierová (ukončená)', dueDate: isoDate(-20), fileName: 'ZoD-2026-006.pdf', fileSize: '268 KB', filePath: '/uploads/ZoD-2026-006.pdf', clientId: 'lead-skola', leadId: 'lead-skola' },
    { id: 'entry-z4', parentId: 'folder-ramcove', isFolder: false, title: 'Rámcová zmluva — Alfa Reality a.s.', dueDate: isoDate(620), fileName: 'RZ-2025-002.pdf', fileSize: '404 KB', filePath: '/uploads/RZ-2025-002.pdf', clientId: 'lead-alfa', leadId: 'lead-alfa' },
    { id: 'entry-z5', parentId: 'folder-dodavatelske', isFolder: false, title: 'Dodávateľská zmluva — Krytiny SK s.r.o.', dueDate: isoDate(18), fileName: 'DZ-2025-014.pdf', fileSize: '196 KB', filePath: '/uploads/DZ-2025-014.pdf' },
    { id: 'entry-z6', parentId: 'folder-dodavatelske', isFolder: false, title: 'Dodávateľská zmluva — Izolstav', dueDate: isoDate(210), fileName: 'DZ-2026-003.pdf', fileSize: '182 KB', filePath: '/uploads/DZ-2026-003.pdf' },
    { id: 'entry-z7', parentId: null, isFolder: false, title: 'GDPR — spracovateľská zmluva (účtovníctvo)', dueDate: isoDate(300), fileName: 'GDPR-2025.pdf', fileSize: '148 KB', filePath: '/uploads/GDPR-2025.pdf' },
    { id: 'entry-z8', parentId: null, isFolder: false, title: 'Poistná zmluva — zodpovednosť za škodu', dueDate: isoDate(94), fileName: 'poistenie-2026.pdf', fileSize: '176 KB', filePath: '/uploads/poistenie-2026.pdf' },
    { id: 'entry-z9', parentId: null, isFolder: false, title: 'Nájomná zmluva — hala Vajnorská', dueDate: isoDate(24), fileName: 'najom-vajnorska.pdf', fileSize: '232 KB', filePath: '/uploads/najom-vajnorska.pdf' },
    { id: 'entry-z10', parentId: 'folder-zod', isFolder: false, title: 'Zmluva o dielo — SVB Hálova 12 (návrh)', dueDate: isoDate(60), fileName: 'ZoD-2026-022-navrh.pdf', fileSize: '298 KB', filePath: '/uploads/ZoD-2026-022-navrh.pdf', clientId: 'lead-bytdom', leadId: 'lead-bytdom' },
    { id: 'entry-z11', parentId: 'folder-ramcove', isFolder: false, title: 'Rámcová zmluva — Mesto Nové Zámky', dueDate: isoDate(380), fileName: 'RZ-2026-004.pdf', fileSize: '356 KB', filePath: '/uploads/RZ-2026-004.pdf', clientId: 'lead-mestonz', leadId: 'lead-mestonz' },
  ],
  'ue-revizie': [
    { id: 'folder-vozpark', parentId: null, isFolder: true, title: 'Vozový park', icon: 'Folder' },
    { id: 'folder-zdvih', parentId: null, isFolder: true, title: 'Zdvíhacia technika', icon: 'Folder' },
    { id: 'entry-r1', parentId: 'folder-vozpark', isFolder: false, title: 'STK — Iveco Daily BL-441ZC', dueDate: isoDate(22), fileName: 'STK-BL441ZC.pdf', fileSize: '96 KB', filePath: '/uploads/STK-BL441ZC.pdf' },
    { id: 'entry-r2', parentId: 'folder-vozpark', isFolder: false, title: 'STK — Ford Transit BL-902PT', dueDate: isoDate(-4), fileName: 'STK-BL902PT.pdf', fileSize: '92 KB', filePath: '/uploads/STK-BL902PT.pdf' },
    { id: 'entry-r3', parentId: 'folder-zdvih', isFolder: false, title: 'Revízia montážnej plošiny Genie Z-45', dueDate: isoDate(12), fileName: 'REV-plosina-2026.pdf', fileSize: '124 KB', filePath: '/uploads/REV-plosina-2026.pdf' },
    { id: 'entry-r4', parentId: 'folder-zdvih', isFolder: false, title: 'Revízia stavebného výťahu GEDA 500', dueDate: isoDate(88), fileName: 'REV-vytah-2026.pdf', fileSize: '118 KB', filePath: '/uploads/REV-vytah-2026.pdf' },
    { id: 'entry-r5', parentId: null, isFolder: false, title: 'Revízia bleskozvodu — sídlo firmy', dueDate: isoDate(160), fileName: 'REV-bleskozvod.pdf', fileSize: '104 KB', filePath: '/uploads/REV-bleskozvod.pdf' },
    { id: 'entry-r6', parentId: null, isFolder: false, title: 'Certifikát ISO 9001', dueDate: isoDate(410), fileName: 'ISO9001-2026.pdf', fileSize: '220 KB', filePath: '/uploads/ISO9001-2026.pdf' },
    { id: 'entry-r7', parentId: 'folder-vozpark', isFolder: false, title: 'STK — Iveco Daily BL-778KM', dueDate: isoDate(140), fileName: 'STK-BL778KM.pdf', fileSize: '94 KB', filePath: '/uploads/STK-BL778KM.pdf' },
    { id: 'entry-r8', parentId: 'folder-vozpark', isFolder: false, title: 'Emisná kontrola — Ford Transit BL-902PT', dueDate: isoDate(-4), fileName: 'EK-BL902PT.pdf', fileSize: '88 KB', filePath: '/uploads/EK-BL902PT.pdf' },
    { id: 'entry-r9', parentId: null, isFolder: false, title: 'Odborná prehliadka elektroinštalácie — hala', dueDate: isoDate(33), fileName: 'REV-elektro-hala.pdf', fileSize: '112 KB', filePath: '/uploads/REV-elektro-hala.pdf' },
  ],
  'ue-technika': [
    { id: 'folder-naradie', parentId: null, isFolder: true, title: 'Elektrické náradie', icon: 'Folder' },
    { id: 'folder-lesenie', parentId: null, isFolder: true, title: 'Lešenie a plošiny', icon: 'Folder' },
    { id: 'entry-t1', parentId: 'folder-naradie', isFolder: false, title: 'Falcovačka Schlebach Pico', dueDate: isoDate(75) },
    { id: 'entry-t2', parentId: 'folder-naradie', isFolder: false, title: 'Horúcovzdušný zvárací automat Leister', dueDate: isoDate(30) },
    { id: 'entry-t3', parentId: 'folder-lesenie', isFolder: false, title: 'Fasádne lešenie 420 m² — sada', dueDate: isoDate(150) },
    { id: 'entry-t4', parentId: 'folder-lesenie', isFolder: false, title: 'Montážna plošina Genie Z-45', dueDate: isoDate(12) },
  ],
  'ue-skolenia': [
    { id: 'folder-erik', parentId: null, isFolder: true, title: 'Erik Kováč', icon: 'Folder' },
    { id: 'folder-jozef', parentId: null, isFolder: true, title: 'Jozef Baláž', icon: 'Folder' },
    { id: 'entry-s1', parentId: 'folder-erik', isFolder: false, title: 'Práca vo výškach — periodické školenie', dueDate: isoDate(54) },
    { id: 'entry-s2', parentId: 'folder-jozef', isFolder: false, title: 'Práca vo výškach — periodické školenie', dueDate: isoDate(9) },
    { id: 'entry-s3', parentId: 'folder-jozef', isFolder: false, title: 'Viazač bremien', dueDate: isoDate(230) },
  ],
};

/* -------------------------------------------------------------------------- */
/* 09 — Nástenky vlastnými slovami                                            */
/* -------------------------------------------------------------------------- */

export const CUSTOM_DASHBOARDS = [
  {
    id: 'dash-obchod',
    name: 'Obchodný prehľad',
    icon: 'TrendingUp',
    color: '#4f46e5',
    activeModel: 'gemini-2.5-flash',
    archived: false,
    prompts: [
      { prompt: 'Zobraz mi hodnotu otvoreného pipeline, počet nových dopytov tento mesiac, úspešnosť ponúk, rozdelenie dopytov podľa zdroja a tabuľku najväčších otvorených príležitostí.', layout: {} },
    ],
    layout: {
      widgets: [
        { id: 'w-pipeline', type: 'metric', title: 'Hodnota otvoreného pipeline', size: 'sm', color: 'indigo', metricValue: '294 700 €', query: { action: 'demo_pipeline_value' } },
        { id: 'w-new', type: 'metric', title: 'Nové dopyty tento mesiac', size: 'sm', color: 'blue', metricValue: '11', query: { action: 'demo_new_leads' } },
        { id: 'w-win', type: 'metric', title: 'Úspešnosť ponúk', size: 'sm', color: 'emerald', metricValue: '42 %', query: { action: 'demo_win_rate' } },
        { id: 'w-avg', type: 'metric', title: 'Priemerná hodnota zákazky', size: 'sm', color: 'amber', metricValue: '31 480 €', query: { action: 'demo_avg_deal' } },
        { id: 'w-funnel', type: 'chart', chartType: 'bar', title: 'Dopyty podľa stavu', size: 'lg', color: 'indigo', mapping: { labelsKey: 'stav', dataKey: 'pocet' }, query: { action: 'demo_leads_by_state' } },
        { id: 'w-source', type: 'chart', chartType: 'doughnut', title: 'Odkiaľ prichádzajú dopyty', size: 'lg', color: 'purple', mapping: { labelsKey: 'zdroj', dataKey: 'pocet' }, query: { action: 'demo_leads_by_source' } },
        {
          id: 'w-top', type: 'table', title: 'Najväčšie otvorené príležitosti', size: 'full', color: 'indigo',
          columns: [
            { key: 'klient', label: 'Klient' },
            { key: 'stav', label: 'Stav' },
            { key: 'obchodnik', label: 'Obchodník' },
            { key: 'hodnota', label: 'Hodnota', format: 'currency' },
            { key: 'termin', label: 'Rozhodnutie', format: 'date' },
          ],
          query: { action: 'demo_top_opportunities' },
        },
      ],
    },
  },
  {
    id: 'dash-cashflow',
    name: 'Cash flow a pohľadávky',
    icon: 'Wallet',
    color: '#059669',
    activeModel: 'gemini-2.5-flash',
    archived: false,
    prompts: [
      { prompt: 'Sprav mi nástenku o peniazoch: koľko mi ešte majú zaplatiť, koľko je po splatnosti, ako vyzerá cash flow za posledných 8 mesiacov a zoznam faktúr po splatnosti.', layout: {} },
    ],
    layout: {
      widgets: [
        { id: 'w-recv', type: 'metric', title: 'Neuhradené pohľadávky', size: 'sm', color: 'emerald', metricValue: '48 380 €', query: { action: 'demo_receivables' } },
        { id: 'w-over', type: 'metric', title: 'Po splatnosti', size: 'sm', color: 'rose', metricValue: '12 400 €', query: { action: 'demo_overdue' } },
        { id: 'w-month', type: 'metric', title: 'Tržby tento mesiac', size: 'sm', color: 'blue', metricValue: '34 000 €', query: { action: 'demo_month_revenue' } },
        { id: 'w-goal', type: 'chart', chartType: 'gauge', title: 'Plnenie ročného plánu', size: 'sm', color: 'emerald', mapping: { valueKey: 'skutocnost', targetKey: 'plan' }, query: { action: 'demo_year_goal' } },
        { id: 'w-cf', type: 'chart', chartType: 'line', title: 'Cash flow za 8 mesiacov', size: 'full', color: 'emerald', mapping: { labelsKey: 'mesiac', dataKey: 'cashflow' }, query: { action: 'demo_cashflow' } },
        {
          id: 'w-late', type: 'table', title: 'Faktúry po splatnosti', size: 'lg', color: 'rose',
          columns: [
            { key: 'faktura', label: 'Faktúra' },
            { key: 'klient', label: 'Klient' },
            { key: 'suma', label: 'Suma', format: 'currency' },
            { key: 'splatnost', label: 'Splatnosť', format: 'date' },
          ],
          query: { action: 'demo_overdue_list' },
        },
        {
          id: 'w-costs', type: 'chart', chartType: 'doughnut', title: 'Štruktúra nákladov', size: 'lg', color: 'rose',
          mapping: { labelsKey: 'kategoria', dataKey: 'suma' }, query: { action: 'demo_cost_split' },
        },
      ],
    },
  },
];

/**
 * Answers to the `query.action` of every widget above, plus the fixed actions
 * the built-in Dashboard's starter widgets use. Those read column names the
 * widget presets hard-code (`status`, `count`, `owner`, …), so only the values
 * are in Slovak.
 */
export const DASHBOARD_QUERY_RESULTS: Record<string, any> = {
  leads_count: { count: 44 },
  pipeline_value: { value: 294700 },
  leads_by_status: [
    { status: 'Nový', count: 11, total_value: 68400 },
    { status: 'Kontaktovaný', count: 8, total_value: 51200 },
    { status: 'Obhliadka', count: 6, total_value: 103900 },
    { status: 'Ponuka odoslaná', count: 9, total_value: 156200 },
    { status: 'Zákazka', count: 5, total_value: 98700 },
    { status: 'Odmietnutý', count: 3, total_value: 14100 },
  ],
  leads_by_source: [
    { source: 'Web', count: 14, total_value: 121400 },
    { source: 'Odporúčanie', count: 11, total_value: 98600 },
    { source: 'Facebook', count: 7, total_value: 42300 },
    { source: 'Instagram', count: 5, total_value: 21800 },
    { source: 'Showroom', count: 3, total_value: 8900 },
  ],
  tasks_summary: [
    { status: 'Nová', count: 9 },
    { status: 'Prebieha', count: 6 },
    { status: 'Blokovaná', count: 2 },
    { status: 'Hotová', count: 17 },
  ],
  tasks_by_owner: [
    { owner: 'Erik Kováč', count: 12 },
    { owner: 'Mária Tóthová', count: 9 },
    { owner: 'Jozef Baláž', count: 7 },
  ],
  recent_leads: [
    { id: 'd1', name: 'Mesto Nové Zámky — športová hala', status: 'Obhliadka', value: 96500, owner: 'Erik Kováč', created_at: isoDate(-2) },
    { id: 'd2', name: 'Novák Stavby s.r.o.', status: 'Ponuka odoslaná', value: 86400, owner: 'Mária Tóthová', created_at: isoDate(-4) },
    { id: 'd3', name: 'SVB Petržalka — Hálova 12', status: 'Ponuka odoslaná', value: 58600, owner: 'Mária Tóthová', created_at: isoDate(-6) },
    { id: 'd4', name: 'Agrodružstvo Malanta', status: 'Nový', value: 41000, owner: 'Mária Tóthová', created_at: isoDate(-8) },
    { id: 'd5', name: 'Šimon Frenko — Šahy', status: 'Ponuka odoslaná', value: 11200, owner: 'Jozef Baláž', created_at: isoDate(-9) },
  ],
  recent_tasks: [
    { id: 't1', title: 'Obhliadka — športová hala', status: 'Prebieha', priority: 'high', owner: 'Erik Kováč', deadline: isoDate(2) },
    { id: 't2', title: 'Pripraviť ponuku pre SVB Petržalka', status: 'Nová', priority: 'high', owner: 'Mária Tóthová', deadline: isoDate(3) },
    { id: 't3', title: 'Objednať krytinu na Malantu', status: 'Blokovaná', priority: 'medium', owner: 'Jozef Baláž', deadline: isoDate(5) },
    { id: 't4', title: 'Fakturácia — prvá etapa Novák', status: 'Nová', priority: 'medium', owner: 'Mária Tóthová', deadline: isoDate(6) },
    { id: 't5', title: 'Zameranie strechy — Šahy', status: 'Hotová', priority: 'low', owner: 'Jozef Baláž', deadline: isoDate(-1) },
  ],
  recent_meetings: [
    { id: 'm1', title: 'Úvodné stretnutie — Mesto Nové Zámky', created_at: isoDate(-1) },
    { id: 'm2', title: 'Obhliadka SVB Petržalka', created_at: isoDate(-3) },
    { id: 'm3', title: 'Rokovanie o cene — Novák Stavby', created_at: isoDate(-5) },
  ],
  demo_pipeline_value: [{ hodnota: 294700 }],
  demo_new_leads: [{ pocet: 11 }],
  demo_win_rate: [{ percento: '42 %' }],
  demo_avg_deal: [{ hodnota: 31480 }],
  demo_leads_by_state: [
    { stav: 'Nový', pocet: 11 },
    { stav: 'Kontaktovaný', pocet: 8 },
    { stav: 'Obhliadka', pocet: 6 },
    { stav: 'Ponuka odoslaná', pocet: 9 },
    { stav: 'Zákazka', pocet: 5 },
    { stav: 'Odmietnutý', pocet: 3 },
  ],
  demo_leads_by_source: [
    { zdroj: 'Web', pocet: 14 },
    { zdroj: 'Odporúčanie', pocet: 11 },
    { zdroj: 'Facebook', pocet: 7 },
    { zdroj: 'Instagram', pocet: 5 },
    { zdroj: 'Showroom', pocet: 3 },
    { zdroj: 'Inzercia', pocet: 2 },
  ],
  demo_top_opportunities: [
    { klient: 'Mesto Nové Zámky — športová hala', stav: 'Obhliadka', obchodnik: 'Erik Kováč', hodnota: 96500, termin: isoDate(9) },
    { klient: 'Novák Stavby s.r.o.', stav: 'Ponuka odoslaná', obchodnik: 'Mária Tóthová', hodnota: 86400, termin: isoDate(5) },
    { klient: 'SVB Petržalka — Hálova 12', stav: 'Ponuka odoslaná', obchodnik: 'Mária Tóthová', hodnota: 58600, termin: isoDate(3) },
    { klient: 'Agrodružstvo Malanta', stav: 'Nový', obchodnik: 'Mária Tóthová', hodnota: 41000, termin: isoDate(16) },
    { klient: 'Šimon Frenko — Šahy', stav: 'Ponuka odoslaná', obchodnik: 'Jozef Baláž', hodnota: 11200, termin: isoDate(4) },
    { klient: 'Peter Horváth — Nitra', stav: 'Obhliadka', obchodnik: 'Jozef Baláž', hodnota: 7400, termin: isoDate(7) },
  ],
  demo_receivables: [{ hodnota: 48380 }],
  demo_overdue: [{ hodnota: 12400 }],
  demo_month_revenue: [{ hodnota: 34000 }],
  demo_year_goal: [{ skutocnost: 412000, plan: 520000 }],
  demo_cashflow: Array.from({ length: 8 }).map((_, i) => {
    const back = 7 - i;
    const income = 34000 + back * 1900 + (i % 3) * 4200;
    const cost = 22100 + back * 210 + (i % 2) * 3100;
    return { mesiac: monthStart(back).slice(0, 7), cashflow: income - cost };
  }),
  demo_overdue_list: [
    { faktura: 'FA-2026-027', klient: 'Alfa Reality a.s.', suma: 12400, splatnost: isoDate(-6) },
  ],
  demo_cost_split: [
    { kategoria: 'Mzdy a odvody', suma: 147200 },
    { kategoria: 'Materiál', suma: 98600 },
    { kategoria: 'Subdodávky', suma: 31400 },
    { kategoria: 'Prevádzka', suma: 29600 },
  ],
};

/* -------------------------------------------------------------------------- */
/* 07 — RAG AI & Agenti                                                       */
/* -------------------------------------------------------------------------- */

export const RAG_AGENTS = [
  { id: '11', name: 'Obchodný analytik', position: 'Analýza pipeline a ponúk', color: 'indigo', is_autonomous: 0, skill_content: '# Obchodný analytik\n\nSleduje pipeline, upozorňuje na stagnujúce ponuky a navrhuje ďalší krok.' },
  { id: '12', name: 'Kontrolór faktúr', position: 'Pohľadávky a splatnosti', color: 'emerald', is_autonomous: 1, skill_content: '# Kontrolór faktúr\n\nKaždé ráno prejde neuhradené faktúry a pripraví zoznam na upomienky.' },
  { id: '13', name: 'Asistent ponúk', position: 'Príprava cenových ponúk', color: 'amber', is_autonomous: 0, skill_content: '# Asistent ponúk\n\nZ poznámok z obhliadky zostaví návrh položiek cenovej ponuky.' },
  { id: '14', name: 'Skladový dozor', position: 'Zásoby a objednávky', color: 'purple', is_autonomous: 1, skill_content: '# Skladový dozor\n\nUpozorňuje na podlimitné zásoby a exspirujúce šarže.' },
];

export const RAG_HISTORY = [
  {
    sender: 'user',
    text: 'Ktoré ponuky nám visia najdlhšie bez odpovede a čo s nimi?',
    timestamp: isoStamp(0, '08:12'),
  },
  {
    sender: 'agent',
    text:
      'Prešiel som všetky otvorené ponuky. Bez odpovede najdlhšie visia tri:\n\n' +
      '1. **Novák Stavby s.r.o.** — CP-2026-036, 86 400 €, odoslaná pred 9 dňami. Klient na rokovaní žiadal splatnosť 30 dní; v ponuke je stále 14. Toto je pravdepodobne dôvod ticha.\n' +
      '2. **SVB Petržalka — Hálova 12** — CP-2026-039, 58 600 €, odoslaná pred 14 dňami. Vlastníci už odhlasovali kladne, chýba len podpis zmluvy.\n' +
      '3. **Šimon Frenko (Šahy)** — CP-2026-041, 11 200 €, odoslaná pred 6 dňami. Prvý kontakt bol z odporúčania, klient reagoval rýchlo — ticho je tu netypické.\n\n' +
      'Odporúčam: u Nováka poslať upravenú ponuku ešte dnes (je to najväčšia položka v pipeline), u SVB zavolať predsedovi kvôli termínu podpisu a Frenkovi poslať krátky follow-up.',
    timestamp: isoStamp(0, '08:12'),
  },
  {
    sender: 'user',
    text: 'A ako sme na tom s peniazmi? Zvládneme objednať materiál na Hálovu?',
    timestamp: isoStamp(0, '08:15'),
  },
  {
    sender: 'agent',
    text:
      'Krátka odpoveď: áno, ale až po úhrade od Alfa Reality.\n\n' +
      '• Neuhradené pohľadávky: **48 380 €**, z toho po splatnosti **12 400 €** (Alfa Reality, FA-2026-027, 6 dní).\n' +
      '• Záväzky v najbližších 10 dňoch: **20 178 €** (Izolstav — PIR dosky a mPVC).\n' +
      '• Materiál na Hálovu 12 je už naskladnený príjemkou PRI-2026-0043, faktúra je splatná o 10 dní.\n\n' +
      'Ak Alfa zaplatí do konca týždňa, cash flow zostáva kladný. Ak nie, odporúčam posunúť platbu Izolstavu — máme s nimi dohodnutých 21 dní a doteraz sme platili skôr.',
    timestamp: isoStamp(0, '08:15'),
  },
];

/* -------------------------------------------------------------------------- */
/* 08 — Automatizácie & Siete                                                 */
/* -------------------------------------------------------------------------- */

export const WORKFLOWS = [
  {
    id: 1,
    name: 'Nový dopyt z webu → úloha a privítací e-mail',
    description: 'Každý dopyt z webového formulára dostane majiteľa, úlohu na spätné volanie do 24 h a klient dostane potvrdenie.',
    trigger_type: 'lead_created',
    trigger_config: { source: 'website' },
    is_active: 1,
    updated_at: isoStamp(-4, '10:20'),
    stats: { total_runs: 214, success_runs: 211, failed_runs: 3, last_run: isoStamp(0, '07:58') },
    nodes: [
      { id: 'node-trigger', type: 'trigger', name: 'Nový dopyt z webu', x: 0, y: 200, data: { trigger_type: 'lead_created' } },
      { id: 'node-ai', type: 'ai_agent', name: 'AI zhrnutie dopytu', x: 460, y: 20, data: { provider: 'gemini', prompt: 'Zhrň dopyt klienta {{$trigger.name}} z mesta {{$trigger.city}} do dvoch viet a navrhni kategóriu.' } },
      { id: 'node-task', type: 'action', name: 'Vytvoriť úlohu — zavolať do 24 h', x: 460, y: 420, data: { type: 'create_task', title: 'Zavolať {{$trigger.name}}', description: '{{$node.node-ai.output}}', priority: 'high', deadline_days: 1, deadline_time: '10:00' } },
      { id: 'node-mail', type: 'action', name: 'Odoslať potvrdenie klientovi', x: 920, y: 200, data: { type: 'send_email', to: '{{$trigger.email}}', subject: 'Prijali sme váš dopyt — Rekonstav s.r.o.', body: 'Dobrý deň {{$trigger.name}}, ďakujeme za dopyt. Ozveme sa do 24 hodín.' } },
    ],
    edges: [
      { id: 'e1', source: 'node-trigger', target: 'node-ai' },
      { id: 'e2', source: 'node-trigger', target: 'node-task' },
      { id: 'e3', source: 'node-ai', target: 'node-mail' },
    ],
  },
  {
    id: 2,
    name: 'Faktúra po splatnosti → upomienka',
    description: 'Denne o 7:00 skontroluje neuhradené faktúry a pri prekročení splatnosti pripraví upomienku a úlohu pre fakturáciu.',
    trigger_type: 'timer',
    trigger_config: { cron: '0 7 * * *' },
    is_active: 1,
    updated_at: isoStamp(-11, '15:05'),
    stats: { total_runs: 186, success_runs: 186, failed_runs: 0, last_run: isoStamp(0, '07:00') },
    nodes: [
      { id: 'node-trigger', type: 'trigger', name: 'Každý deň o 7:00', x: 60, y: 200, data: { trigger_type: 'timer' } },
      { id: 'node-cond', type: 'condition', name: 'Je po splatnosti?', x: 400, y: 200, data: { cond_mode: 'visual', cond_logic: 'AND', rules: [{ field: '$trigger.days_overdue', op: 'gt', value: '0' }] } },
      { id: 'node-mail', type: 'action', name: 'Odoslať upomienku', x: 760, y: 90, data: { type: 'send_email', to: '{{$trigger.email}}', subject: 'Upomienka — faktúra {{$trigger.invoice}}' } },
      { id: 'node-task', type: 'action', name: 'Úloha pre fakturáciu', x: 760, y: 320, data: { type: 'create_task', title: 'Overiť úhradu {{$trigger.invoice}}', priority: 'high', deadline_days: 2 } },
    ],
    edges: [
      { id: 'e1', source: 'node-trigger', target: 'node-cond' },
      { id: 'e2', source: 'node-cond', target: 'node-mail', sourceHandle: 'true' },
      { id: 'e3', source: 'node-cond', target: 'node-task', sourceHandle: 'true' },
    ],
  },
  {
    id: 3,
    name: 'Ponuka odoslaná → follow-up po 5 dňoch',
    description: 'Ak klient do piatich dní nereaguje na odoslanú ponuku, AI pripraví návrh follow-up e-mailu.',
    trigger_type: 'lead_status_changed',
    trigger_config: { to_status: 'ponuka odoslaná' },
    is_active: 1,
    updated_at: isoStamp(-19, '09:40'),
    stats: { total_runs: 68, success_runs: 66, failed_runs: 2, last_run: isoStamp(-1, '09:00') },
    nodes: [
      { id: 'node-trigger', type: 'trigger', name: 'Stav → ponuka odoslaná', x: 60, y: 180, data: { trigger_type: 'lead_status_changed' } },
      { id: 'node-ai', type: 'ai_agent', name: 'AI návrh follow-upu', x: 420, y: 180, data: { provider: 'gemini', prompt: 'Napíš zdvorilý follow-up e-mail klientovi {{$trigger.name}} k ponuke odoslanej pred 5 dňami.' } },
      { id: 'node-mail', type: 'action', name: 'Odoslať obchodníkovi na schválenie', x: 780, y: 180, data: { type: 'send_email', to: '{{$trigger.owner_email}}', subject: 'Návrh follow-upu — {{$trigger.name}}' } },
    ],
    edges: [
      { id: 'e1', source: 'node-trigger', target: 'node-ai' },
      { id: 'e2', source: 'node-ai', target: 'node-mail' },
    ],
  },
  {
    id: 4,
    name: 'Podlimitná zásoba → objednávka dodávateľovi',
    description: 'Keď zásoba klesne pod minimum, pripraví návrh objednávky u primárneho dodávateľa.',
    trigger_type: 'timer',
    trigger_config: { cron: '0 6 * * 1' },
    is_active: 1,
    updated_at: isoStamp(-31, '11:15'),
    stats: { total_runs: 42, success_runs: 41, failed_runs: 1, last_run: isoStamp(-2, '06:00') },
    nodes: [
      { id: 'node-trigger', type: 'trigger', name: 'Každý pondelok o 6:00', x: 60, y: 200, data: { trigger_type: 'timer' } },
      { id: 'node-split', type: 'splitter', name: 'Rozdeliť podlimitné položky', x: 380, y: 200, data: { array_path: '$trigger.items' } },
      { id: 'node-ai', type: 'ai_agent', name: 'AI návrh množstva', x: 720, y: 200, data: { provider: 'gemini', prompt: 'Navrhni objednávané množstvo pre {{$item.name}} tak, aby sa zásoba dostala na optimum.' } },
    ],
    edges: [
      { id: 'e1', source: 'node-trigger', target: 'node-split' },
      { id: 'e2', source: 'node-split', target: 'node-ai' },
    ],
  },
  {
    id: 5,
    name: 'E-mail od klienta → priradenie k zákazke',
    description: 'Prichádzajúci e-mail sa podľa adresy priradí ku klientovi a zapíše do jeho časovej osi.',
    trigger_type: 'email_received',
    trigger_config: { folder: 'INBOX' },
    is_active: 0,
    updated_at: isoStamp(-48, '13:30'),
    stats: { total_runs: 902, success_runs: 884, failed_runs: 18, last_run: isoStamp(-48, '13:28') },
    nodes: [
      { id: 'node-trigger', type: 'trigger', name: 'Prijatý e-mail', x: 60, y: 200, data: { trigger_type: 'email_received' } },
      { id: 'node-cond', type: 'condition', name: 'Poznáme odosielateľa?', x: 400, y: 200, data: { cond_mode: 'visual', cond_logic: 'AND', rules: [{ field: '$trigger.known_client', op: 'eq', value: 'true' }] } },
      { id: 'node-act', type: 'action', name: 'Zapísať do časovej osi', x: 760, y: 120, data: { type: 'create_client', name: '{{$trigger.from_name}}' } },
    ],
    edges: [
      { id: 'e1', source: 'node-trigger', target: 'node-cond' },
      { id: 'e2', source: 'node-cond', target: 'node-act', sourceHandle: 'true' },
    ],
  },
];

export const WORKFLOW_LOGS = [
  { id: 901, workflow_id: 1, status: 'success', started_at: isoStamp(0, '07:58'), finished_at: isoStamp(0, '07:58'), message: 'Lead „Lukáš Danko" spracovaný, úloha a e-mail vytvorené.' },
  { id: 900, workflow_id: 1, status: 'success', started_at: isoStamp(-1, '19:41'), finished_at: isoStamp(-1, '19:41'), message: 'Lead „Agrodružstvo Malanta" spracovaný.' },
  { id: 899, workflow_id: 2, status: 'success', started_at: isoStamp(0, '07:00'), finished_at: isoStamp(0, '07:00'), message: '1 faktúra po splatnosti — upomienka odoslaná.' },
];

/* -------------------------------------------------------------------------- */
/* 04b — Fakturácia a cenové ponuky                                           */
/* -------------------------------------------------------------------------- */

export const COMPANY_BILLING = {
  companyName: 'Rekonstav s.r.o.',
  companySubtitle: 'Strechy, klampiarske práce a zateplenie',
  companyLogoUrl: null,
  street: 'Vajnorská 140',
  city: 'Bratislava',
  postalCode: '83104',
  country: 'Slovensko',
  companyId: '47215883',
  taxId: '2023774411',
  vatId: 'SK2023774411',
  email: 'obchod@rekonstav.sk',
  phone: '+421 905 100 100',
  phoneSecondary: '+421 2 4444 5555',
  website: 'https://rekonstav.sk',
  iban: 'SK31 1100 0000 0029 4512 7788',
  swift: 'TATRSKBX',
  bankName: 'Tatra banka, a.s.',
  defaultPaymentDueDays: 14,
  defaultVatRate: 20,
  defaultWarrantyText: '10 rokov na hydroizoláciu, 5 rokov na klampiarske prvky',
  defaultDurationText: '3–4 týždne',
  defaultStartDateText: 'Do 6 týždňov od podpisu',
  defaultNextSteps: 'Po odsúhlasení ponuky pripravíme zmluvu o dielo a dohodneme termín nástupu partie.',
  defaultSocialProof: 'ZŠ Mierová Bratislava · Vinárstvo Pod Zámkom · Alfa Reality a.s. · Mesto Nové Zámky',
  defaultUspCards: [
    { id: 'usp-1', title: '18 rokov na trhu', subtitle: 'Viac ako 900 dokončených striech', icon: 'Award' },
    { id: 'usp-2', title: 'Vlastné partie', subtitle: 'Žiadni nespoľahliví subdodávatelia', icon: 'Users' },
    { id: 'usp-3', title: 'Záruka 10 rokov', subtitle: 'Písomne, vrátane servisu', icon: 'ShieldCheck' },
  ],
};

const OFFER_ITEMS_HRUSKOVA = [
  { id: 'it-1', warehouseItemId: 'item-batten', sku: 'DRE-601', name: 'Demontáž pôvodnej krytiny a laťovania', description: 'Vrátane odvozu a likvidácie sute.', quantity: 168, unit: 'm²', unitPrice: 9.4, vatRate: 20, discountPct: 0, totalPrice: 1579.2 },
  { id: 'it-2', sku: 'MON-102', name: 'Nové laťovanie a kontralaty', description: 'Impregnované KVH 40×60.', quantity: 168, unit: 'm²', unitPrice: 12.8, vatRate: 20, discountPct: 0, totalPrice: 2150.4 },
  { id: 'it-3', sku: 'FOL-201', name: 'Poistná hydroizolácia — difúzna fólia', quantity: 168, unit: 'm²', unitPrice: 4.6, vatRate: 20, discountPct: 0, totalPrice: 772.8 },
  { id: 'it-4', warehouseItemId: 'item-tile-clay', sku: 'KRY-101', name: 'Pálená krytina — prírodná červená', description: 'Vrátane príslušenstva a hrebenáčov.', quantity: 1714, unit: 'ks', unitPrice: 1.78, vatRate: 20, discountPct: 5, totalPrice: 2898.4 },
  { id: 'it-5', sku: 'MON-210', name: 'Montáž krytiny', quantity: 168, unit: 'm²', unitPrice: 21.5, vatRate: 20, discountPct: 0, totalPrice: 3612 },
  { id: 'it-6', warehouseItemId: 'item-gutter', sku: 'KLA-301', name: 'Klampiarske prvky — žľaby, zvody, lemovania', quantity: 1, unit: 'súbor', unitPrice: 3480, vatRate: 20, discountPct: 0, totalPrice: 3480 },
  { id: 'it-7', sku: 'MON-330', name: 'Bleskozvod vrátane revíznej správy', quantity: 1, unit: 'súbor', unitPrice: 1290, vatRate: 20, discountPct: 0, totalPrice: 1290 },
  { id: 'it-8', sku: 'LES-001', name: 'Lešenie — prenájom a montáž', quantity: 1, unit: 'súbor', unitPrice: 1890, vatRate: 20, discountPct: 0, totalPrice: 1890 },
];

export const INVOICES_OFFERS = [
  {
    id: 'io-1', documentNumber: 'CP-2026-018', type: 'price_offer', mode: 'default',
    leadId: 'lead-silvia', clientId: 'lead-silvia', clientName: 'Silvia Hrušková',
    clientEmail: 'silvia.hruskova@example.sk', clientPhone: '+421 900 111 222',
    clientStreet: 'Záhradnícka 42', clientCity: 'Bratislava', clientPostalCode: '82108', clientCountry: 'Slovensko',
    title: 'Cenová ponuka na rekonštrukciu strechy',
    subject: 'Kompletná rekonštrukcia šikmej strechy rodinného domu — Bratislava',
    location: 'Bratislava',
    greetingNote: 'Dobrý deň, pani Hrušková,',
    introNote: 'ďakujeme za dôveru a za možnosť obhliadky. Na základe zamerania 168 m² strešnej plochy sme pre Vás pripravili ponuku v dvoch variantoch. Nižšie nájdete variant s pálenou krytinou, ktorý sme Vám odporučili vzhľadom na stav krovu a orientáciu domu.',
    uspCards: COMPANY_BILLING.defaultUspCards,
    reassuranceNote: 'Cena je konečná — nezahŕňa žiadne skryté položky. Ak sa počas realizácie ukáže potreba viacprác, vždy Vás vopred kontaktujeme.',
    items: OFFER_ITEMS_HRUSKOVA,
    subtotal: 17672.8, vatAmount: 3534.56, totalPrice: 21207.36, currency: 'EUR',
    durationText: '3–4 týždne', startDateText: 'Do 6 týždňov od podpisu', warrantyText: '10 rokov na hydroizoláciu, 5 rokov na klampiarske prvky',
    nextStepsNote: COMPANY_BILLING.defaultNextSteps,
    closingNote: 'Ponuka platí 30 dní. V prípade otázok som Vám k dispozícii na telefóne aj osobne.',
    signOffTeam: 'Tím Rekonstav s.r.o.',
    status: 'approved', issuedAt: isoDate(-52), validUntil: isoDate(-22),
    fileName: 'CP-2026-018-hruskova.pdf', filePath: '/uploads/CP-2026-018-hruskova.pdf',
    createdAt: isoStamp(-52), updatedAt: isoStamp(-44), createdBy: 'Erik Kováč',
  },
  {
    id: 'io-2', documentNumber: 'CP-2026-036', type: 'price_offer', mode: 'default',
    leadId: 'lead-novak', clientId: 'lead-novak', clientName: 'Novák Stavby s.r.o.',
    clientEmail: 'obchod@novakstavby.sk', clientStreet: 'Priemyselná 12', clientCity: 'Košice', clientPostalCode: '04001', clientCountry: 'Slovensko',
    clientIco: '36512478', clientDic: '2021845512', clientIcdph: 'SK2021845512',
    title: 'Cenová ponuka — subdodávka strešného plášťa',
    subject: 'Plochá strecha bytového domu, 1 240 m² — Košice',
    location: 'Košice',
    greetingNote: 'Dobrý deň, pán Novák,',
    introNote: 'na základe spoločnej obhliadky posielame ponuku na kompletný strešný plášť vrátane tepelnej izolácie PIR 120 mm a hydroizolácie mPVC.',
    uspCards: COMPANY_BILLING.defaultUspCards,
    items: [
      { id: 'n-1', sku: 'DEM-010', name: 'Odstránenie pôvodných vrstiev', quantity: 1240, unit: 'm²', unitPrice: 7.9, vatRate: 20, discountPct: 0, totalPrice: 9796 },
      { id: 'n-2', warehouseItemId: 'item-pir', sku: 'IZO-210', name: 'Tepelná izolácia PIR 120 mm', quantity: 1240, unit: 'm²', unitPrice: 24.9, vatRate: 20, discountPct: 8, totalPrice: 28405.9 },
      { id: 'n-3', warehouseItemId: 'item-mpvc', sku: 'IZO-220', name: 'Hydroizolácia mPVC 1,5 mm vrátane montáže', quantity: 1240, unit: 'm²', unitPrice: 21.4, vatRate: 20, discountPct: 0, totalPrice: 26536 },
      { id: 'n-4', sku: 'KLA-400', name: 'Atiky, oplechovanie a vpuste', quantity: 1, unit: 'súbor', unitPrice: 8640, vatRate: 20, discountPct: 0, totalPrice: 8640 },
    ],
    subtotal: 73377.9, vatAmount: 14675.58, totalPrice: 88053.48, currency: 'EUR',
    durationText: '5 týždňov', startDateText: 'Podľa harmonogramu stavby', warrantyText: '10 rokov na hydroizoláciu',
    status: 'sent', issuedAt: isoDate(-9), validUntil: isoDate(21),
    fileName: 'CP-2026-036-novak.pdf', filePath: '/uploads/CP-2026-036-novak.pdf',
    createdAt: isoStamp(-9), createdBy: 'Mária Tóthová',
  },
  {
    id: 'io-3', documentNumber: 'CP-2026-039', type: 'price_offer', mode: 'default',
    leadId: 'lead-bytdom', clientId: 'lead-bytdom', clientName: 'SVB Petržalka — Hálova 12',
    clientEmail: 'predseda@svbhalova12.sk', clientStreet: 'Hálova 12', clientCity: 'Bratislava', clientPostalCode: '85101', clientCountry: 'Slovensko',
    title: 'Cenová ponuka — sanácia plochej strechy',
    subject: 'Sanácia plochej strechy bytového domu, 940 m² — Petržalka',
    location: 'Bratislava',
    greetingNote: 'Dobrý deň,',
    introNote: 'na základe obhliadky a prezentácie na schôdzi vlastníkov posielame ponuku na variant 3 — kompletnú sanáciu s novou tepelnou izoláciou a svetlíkmi.',
    uspCards: COMPANY_BILLING.defaultUspCards,
    items: [
      { id: 'h-1', sku: 'DEM-010', name: 'Odstránenie pôvodných vrstiev', quantity: 940, unit: 'm²', unitPrice: 8.2, vatRate: 20, discountPct: 0, totalPrice: 7708 },
      { id: 'h-2', sku: 'IZO-210', name: 'Tepelná izolácia PIR 140 mm', quantity: 940, unit: 'm²', unitPrice: 27.4, vatRate: 20, discountPct: 5, totalPrice: 24466.2 },
      { id: 'h-3', sku: 'IZO-220', name: 'Hydroizolácia mPVC vrátane montáže', quantity: 940, unit: 'm²', unitPrice: 21.4, vatRate: 20, discountPct: 0, totalPrice: 20116 },
      { id: 'h-4', sku: 'SVE-100', name: 'Nové svetlíky 6 ks vrátane osadenia', quantity: 6, unit: 'ks', unitPrice: 640, vatRate: 20, discountPct: 0, totalPrice: 3840 },
    ],
    subtotal: 56130.2, vatAmount: 11226.04, totalPrice: 67356.24, currency: 'EUR',
    durationText: '6 týždňov', startDateText: 'Jar budúceho roka', warrantyText: '10 rokov',
    status: 'sent', issuedAt: isoDate(-14), validUntil: isoDate(16),
    fileName: 'CP-2026-039-halova.pdf', filePath: '/uploads/CP-2026-039-halova.pdf',
    createdAt: isoStamp(-14), createdBy: 'Mária Tóthová',
  },
  {
    id: 'io-4', documentNumber: 'CP-2026-041', type: 'price_offer', mode: 'default',
    leadId: 'lead-simon', clientId: 'lead-simon', clientName: 'Šimon Frenko',
    clientEmail: 'simon.frenko@example.sk', clientStreet: 'Mládežnícka 3', clientCity: 'Šahy', clientPostalCode: '93601', clientCountry: 'Slovensko',
    title: 'Cenová ponuka — plochá strecha garáže',
    subject: 'Rekonštrukcia plochej strechy garáže a prístavby — Šahy',
    location: 'Šahy',
    greetingNote: 'Dobrý deň, pán Frenko,',
    introNote: 'ďakujeme za dopyt na odporúčanie. Posielame ponuku na hydroizoláciu mPVC vrátane nového oplechovania atiky.',
    uspCards: COMPANY_BILLING.defaultUspCards,
    items: [
      { id: 'f-1', sku: 'DEM-010', name: 'Odstránenie pôvodnej živičnej krytiny', quantity: 96, unit: 'm²', unitPrice: 8.9, vatRate: 20, discountPct: 0, totalPrice: 854.4 },
      { id: 'f-2', sku: 'IZO-220', name: 'Hydroizolácia mPVC vrátane montáže', quantity: 96, unit: 'm²', unitPrice: 23.4, vatRate: 20, discountPct: 0, totalPrice: 2246.4 },
      { id: 'f-3', sku: 'KLA-400', name: 'Oplechovanie atiky a nový zvod', quantity: 1, unit: 'súbor', unitPrice: 1180, vatRate: 20, discountPct: 0, totalPrice: 1180 },
    ],
    subtotal: 4280.8, vatAmount: 856.16, totalPrice: 5136.96, currency: 'EUR',
    durationText: '2–3 dni', startDateText: 'Do 3 týždňov', warrantyText: '10 rokov',
    status: 'sent', issuedAt: isoDate(-6), validUntil: isoDate(24),
    fileName: 'CP-2026-041-frenko.pdf', filePath: '/uploads/CP-2026-041-frenko.pdf',
    createdAt: isoStamp(-6), createdBy: 'Jozef Baláž',
  },
  {
    id: 'io-5', documentNumber: 'FA-2026-031', type: 'invoice', mode: 'default',
    leadId: 'lead-silvia', clientId: 'lead-silvia', clientName: 'Silvia Hrušková',
    clientEmail: 'silvia.hruskova@example.sk', clientStreet: 'Záhradnícka 42', clientCity: 'Bratislava', clientPostalCode: '82108', clientCountry: 'Slovensko',
    title: 'Zálohová faktúra', subject: 'Záloha 40 % — rekonštrukcia strechy',
    uspCards: [],
    items: [{ id: 'entry-z1', sku: 'ZAL-040', name: 'Záloha 40 % na materiál a lešenie', quantity: 1, unit: 'ks', unitPrice: 8266.67, vatRate: 20, discountPct: 0, totalPrice: 8266.67 }],
    subtotal: 8266.67, vatAmount: 1653.33, totalPrice: 9920, currency: 'EUR',
    status: 'invoiced', issuedAt: isoDate(-28), dueDate: isoDate(-14),
    fileName: 'FA-2026-031.pdf', filePath: '/uploads/FA-2026-031.pdf',
    createdAt: isoStamp(-28), createdBy: 'Lucia Bieliková',
  },
  {
    id: 'io-6', documentNumber: 'FA-2026-027', type: 'invoice', mode: 'default',
    leadId: 'lead-alfa', clientId: 'lead-alfa', clientName: 'Alfa Reality a.s.',
    clientEmail: 'spolupraca@alfareality.sk', clientStreet: 'Vysokoškolákov 4', clientCity: 'Žilina', clientPostalCode: '01008', clientCountry: 'Slovensko',
    clientIco: '31584772', clientIcdph: 'SK2020447712',
    title: 'Faktúra', subject: 'Štvrťročná paušálna údržba 14 objektov',
    uspCards: [],
    items: [{ id: 'a-1', sku: 'SVC-Q', name: 'Paušálna údržba strešných plášťov — štvrťrok', quantity: 1, unit: 'ks', unitPrice: 10333.33, vatRate: 20, discountPct: 0, totalPrice: 10333.33 }],
    subtotal: 10333.33, vatAmount: 2066.67, totalPrice: 12400, currency: 'EUR',
    status: 'invoiced', issuedAt: isoDate(-34), dueDate: isoDate(-6),
    fileName: 'FA-2026-027.pdf', filePath: '/uploads/FA-2026-027.pdf',
    createdAt: isoStamp(-34), createdBy: 'Lucia Bieliková',
  },
  {
    id: 'io-7', documentNumber: 'PF-2026-009', type: 'proforma', mode: 'default',
    leadId: 'lead-vinarstvo', clientId: 'lead-vinarstvo', clientName: 'Vinárstvo Pod Zámkom s.r.o.',
    clientEmail: 'info@vinarstvopodzamkom.sk', clientStreet: 'Vinohradnícka 88', clientCity: 'Pezinok', clientPostalCode: '90201', clientCountry: 'Slovensko',
    clientIco: '47883921', clientIcdph: 'SK2024118833',
    title: 'Preddavková faktúra', subject: 'Etapa 3 — klampiarske dokončenie',
    uspCards: [],
    items: [{ id: 'v-1', sku: 'KLA-500', name: 'Klampiarske dokončenie — preddavok', quantity: 1, unit: 'ks', unitPrice: 4083.33, vatRate: 20, discountPct: 0, totalPrice: 4083.33 }],
    subtotal: 4083.33, vatAmount: 816.67, totalPrice: 4900, currency: 'EUR',
    status: 'draft', issuedAt: isoDate(-1), dueDate: isoDate(13),
    createdAt: isoStamp(-1), createdBy: 'Lucia Bieliková',
  },
];

/* -------------------------------------------------------------------------- */
/* Roles & settings                                                           */
/* -------------------------------------------------------------------------- */

const ROLES = [
  {
    name: 'Admin',
    permissions: { general_config: 'edit', pm_managers: 'edit', pipeline_stages: 'edit', traffic_sources: 'edit', system_reset: 'edit' },
  },
  {
    name: 'Manager',
    permissions: { general_config: 'view', pm_managers: 'view', pipeline_stages: 'view', traffic_sources: 'view', system_reset: 'nothing' },
  },
];

export const SETTINGS = {
  systemName: 'Rekonstav CRM',
  systemLanguage: 'sk',
  systemCurrency: 'EUR',
  leadStates: LEAD_STATES,
  leadSources: LEAD_SOURCES,
  leadCategories: LEAD_CATEGORIES,
  leadStateColors: {
    'nový': '#3b82f6',
    'kontaktovaný': '#0ea5e9',
    'obhliadka': '#8b5cf6',
    'ponuka odoslaná': '#f59e0b',
    'zákazka': '#16a34a',
    'odmietnutý': '#ef4444',
  },
  leadSourceColors: { website: '#0d9488', 'odporúčanie': '#8b5cf6', facebook: '#1d4ed8', instagram: '#db2777', showroom: '#f59e0b', inzercia: '#64748b' },
  leadCategoryColors: { 'Strechy': '#6366f1', 'Okná a dvere': '#0ea5e9', 'Zateplenie': '#14b8a6', 'Klampiarske práce': '#f59e0b' },
  /* Left empty deliberately. Mapping `zákazka` to the canonical `accepted` makes
     the `#overview` performance KPIs compute (they key off that English name),
     but it also demotes `zákazka` to a sub-state, and the pipeline header on the
     leads screen then stops showing it as a phase at all. The pipeline is the
     flagship screenshot; the marketing dashboard is not. */
  leadStageGroups: {},
  leadStateParents: {},
  leadStateFollowUp: { 'kontaktovaný': true, 'ponuka odoslaná': true },
  taskStates: TASK_STATES,
  taskStateColors: { 'Nová': '#3b82f6', 'Prebieha': '#f59e0b', 'Čaká sa': '#8b5cf6', 'Hotová': '#10b981' },
  projectManagers: OWNERS,
  companyBillingSettings: COMPANY_BILLING,
  /* The browser never receives real secrets — sync.php substitutes this mask, and
     `hasOpenAiKey()` treats a non-empty value as "configured". Without it every AI
     section paints an amber "OpenAI key missing" banner across the screenshot. */
  integrationsConfig: {
    openAiKey: '********',
    geminiApiKey: '********',
    emailProvider: 'smtp',
    smtpHost: 'smtp.rekonstav.sk',
    smtpPort: '465',
    smtpSecure: 'ssl',
    smtpAuth: true,
    smtpUser: 'obchod@rekonstav.sk',
    smtpPassword: '********',
    senderName: 'Rekonstav s.r.o.',
    senderEmail: 'obchod@rekonstav.sk',
    /* No ad campaigns on purpose. The ROI panel divides won-lead value by spend,
       and "won" is the English `accepted` that this Slovak pipeline never uses —
       so any spend at all renders as a red ROI: -100 %. With no spend the panel
       reads as simply not connected, which is the truth for this demo. */
    adsConnected: false,
    campaigns: [],
  },
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
    users: DEMO_USERS,
    roles: ROLES,
    meetingNotes: MEETING_NOTES,
    unifiedEntries: UNIFIED_ENTRIES,
    unifiedEntriesData: UNIFIED_ENTRIES_DATA,
    customDashboards: CUSTOM_DASHBOARDS,
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
    invoicesOffers: INVOICES_OFFERS,
    companyBillingSettings: COMPANY_BILLING,
    settings: SETTINGS,
  };
}
