<?php
/**
 * Company pack, Slovak edition: Lapidea s.r.o. - the cast every other pack points at by ref.
 *
 * Data only (see the contract in demo_seed/index.php). Same keys, list lengths and numbers
 * as packs/hu/company.php and packs/en/company.php; only strings differ. Amounts are EUR
 * before conversion (…Eur keys). Fictional contact data only (B12): e-mail domains end in
 * .example, phone numbers are made up, IDs pass their checksums but belong to nobody.
 *
 * Sections: brand, company (the profile, D1), billing (offer/order defaults), divisions,
 * users (the three logins, keyed by role), employees E1-E6, clients C1-C6 + leads L7-L11,
 * projects P1-P5, items I1-I8, suppliers S1-S3, warehouses W1-W2.
 * A record that is deliberately foreign carries '_foreign' => true (C6).
 */
return [
    'brand' => 'Lapidea',

    /*
     * Sidebar of the three logins: the modules sorted into labelled groups (a user preference,
     * see src/utils/sidebarLayout.ts). Items are sidebar item ids; custom dashboards are not
     * listed and land in the first group.
     */
    'sidebarGroups' => [
        ['id' => 'group_overview', 'title' => 'Prehľad', 'items' => ['dashboard', 'overview', 'tasks', 'time-tracking']],
        ['id' => 'group_sales', 'title' => 'Predaj', 'items' => ['leads', 'clients', 'invoices', 'orders']],
        ['id' => 'group_operations', 'title' => 'Prevádzka', 'items' => ['projects', 'tickets', 'warehouse', 'financial']],
        ['id' => 'group_communication', 'title' => 'Komunikácia', 'items' => ['whatsapp', 'email', 'meetings', 'social_media']],
        ['id' => 'group_ai', 'title' => 'AI a automatizácia', 'items' => ['rag_ai', 'sai', 'automation']],
        ['id' => 'group_workspace', 'title' => 'Pracovisko', 'items' => ['employees', 'files', 'updates']],
    ],

    'company' => [
        'name' => 'Lapidea s.r.o.',
        'subtitle' => 'Kameň, kremeň a spekaný kameň na mieru',
        'street' => 'Vajnorská 142',
        'city' => 'Bratislava',
        'postalCode' => '831 04',
        'country' => 'Slovensko',
        'companyId' => '53 418 271',
        'taxId' => '2121384760',
        'vatId' => 'SK2121384760',
        'email' => 'info@lapidea.example',
        'phone' => '+421 2 5557 0142',
        'phoneSecondary' => '+421 905 555 142',
        'website' => 'https://lapidea.example',
        'iban' => 'SK50 9980 0000 1943 8207 1655',
        'swift' => 'DNBUSKBX',
        'bankName' => 'Danubia banka',
    ],

    'billing' => [
        'paymentDueDays' => 14,
        'shippingMethods' => ['Packeta', 'DPD', 'GLS', 'Osobný odber v showroome'],
        'paymentMethods' => ['Prevod na účet', 'Platba kartou', 'Dobierka'],
        'defaultPaymentMethod' => 'Prevod na účet',
        'warrantyText' => '10 rokov záruka na materiál a 5 rokov na spracovanie a montáž.',
        'durationText' => '3–4 týždne od schválenia vzorky',
        'startDateText' => 'Do 10 pracovných dní od pripísania zálohy',
        'nextSteps' => 'Potvrďte ponuku, uhraďte 40 % zálohu a dohodneme termín presného zamerania.',
        'socialProof' => 'Naši klienti: {client:C6}, {client:C3}, {client:C1}',
        'usp' => [
            ['title' => 'Zameranie laserom', 'subtitle' => 'Presnosť na milimeter'],
            ['title' => 'Vlastná CNC dielňa', 'subtitle' => 'Vodný lúč a brúsenie hrán u nás'],
            ['title' => 'Montáž v cene', 'subtitle' => 'Vlastná montážna čata'],
            ['title' => 'Záruka 10 rokov', 'subtitle' => 'Na materiál aj spracovanie'],
        ],
    ],

    'divisions' => [
        ['name' => 'Lapidea Bratislava', 'color' => '#3b82f6'],
        ['name' => 'Lapidea Trnava', 'color' => '#8b5cf6'],
    ],

    // The three logins. Password "password" for all. 'role' is the system role.
    'users' => [
        'owner' => ['name' => 'Andrej Kollár', 'first' => 'Andrej', 'last' => 'Kollár', 'email' => 'andrej.kollar@lapidea.example', 'role' => 'admin', 'color' => '#10b981', 'title' => 'Majiteľ a konateľ'],
        'pm' => ['name' => 'Simona Hudecová', 'first' => 'Simona', 'last' => 'Hudecová', 'email' => 'simona.hudecova@lapidea.example', 'role' => 'project_manager', 'color' => '#6366f1', 'title' => 'Vedúca výroby a projektov'],
        'sales' => ['name' => 'Juraj Benko', 'first' => 'Juraj', 'last' => 'Benko', 'email' => 'juraj.benko@lapidea.example', 'role' => 'project_manager', 'color' => '#f59e0b', 'title' => 'Predajca v showroome'],
    ],

    // E1-E3 are the three logins ('user' = their role ref); E4-E6 have no login.
    // 'pin' is the national personal number (fictional, valid checksum).
    'employees' => [
        'E1' => ['name' => 'Andrej Kollár', 'first' => 'Andrej', 'last' => 'Kollár', 'user' => 'owner', 'email' => 'andrej.kollar@lapidea.example', 'phone' => '+421 905 555 101', 'title' => 'Majiteľ a konateľ', 'department' => 'Vedenie', 'street' => 'Bajkalská 19', 'city' => 'Bratislava', 'zip' => '821 01', 'country' => 'Slovensko', 'pin' => '790312/5120', 'salaryEur' => 4200],
        'E2' => ['name' => 'Simona Hudecová', 'first' => 'Simona', 'last' => 'Hudecová', 'user' => 'pm', 'email' => 'simona.hudecova@lapidea.example', 'phone' => '+421 905 555 102', 'title' => 'Vedúca výroby a projektov', 'department' => 'Výroba', 'street' => 'Hlavná 48', 'city' => 'Trnava', 'zip' => '917 01', 'country' => 'Slovensko', 'pin' => '845902/3045', 'salaryEur' => 3100],
        'E3' => ['name' => 'Juraj Benko', 'first' => 'Juraj', 'last' => 'Benko', 'user' => 'sales', 'email' => 'juraj.benko@lapidea.example', 'phone' => '+421 905 555 103', 'title' => 'Predajca v showroome', 'department' => 'Predaj', 'street' => 'Ružinovská 8', 'city' => 'Bratislava', 'zip' => '821 02', 'country' => 'Slovensko', 'pin' => '881125/4309', 'salaryEur' => 2400],
        'E4' => ['name' => 'Martin Polák', 'first' => 'Martin', 'last' => 'Polák', 'user' => null, 'email' => 'martin.polak@lapidea.example', 'phone' => '+421 905 555 104', 'title' => 'Vedúci montážnej čaty', 'department' => 'Montáž', 'street' => 'Cesta mládeže 5', 'city' => 'Trnava', 'zip' => '917 01', 'country' => 'Slovensko', 'pin' => '910608/1270', 'salaryEur' => 2300],
        'E5' => ['name' => 'Tomáš Šimek', 'first' => 'Tomáš', 'last' => 'Šimek', 'user' => null, 'email' => 'tomas.simek@lapidea.example', 'phone' => '+421 905 555 105', 'title' => 'Operátor CNC a vodného lúča', 'department' => 'Výroba', 'street' => 'Kapitulská 3', 'city' => 'Trnava', 'zip' => '917 01', 'country' => 'Slovensko', 'pin' => '860117/2657', 'salaryEur' => 2100],
        'E6' => ['name' => 'Kristína Balážová', 'first' => 'Kristína', 'last' => 'Balážová', 'user' => null, 'email' => 'kristina.balazova@lapidea.example', 'phone' => '+421 905 555 106', 'title' => 'Kancelária a účtovníctvo', 'department' => 'Administratíva', 'street' => 'Záhradnícka 62', 'city' => 'Bratislava', 'zip' => '821 08', 'country' => 'Slovensko', 'pin' => '935430/3805', 'salaryEur' => 1900],
    ],

    // Clients C1-C6 (stage 'won') and leads L7-L11 (stage = the lead-state role of lookup.php).
    // 'type' is leads.client_type. 'name' is what the CRM shows, 'legalName' the invoicing entity,
    // 'short' how people say it in text, 'contact' the person (a private client: themselves).
    'clients' => [
        'C1' => ['name' => 'Rezidencia Horský park s.r.o.', 'legalName' => 'Rezidencia Horský park s.r.o.', 'short' => 'Horský park', 'type' => 'business', 'stage' => 'won', 'contact' => 'Ing. Marek Šimko', 'email' => 'marek.simko@horsky-park.example', 'phone' => '+421 903 555 201', 'street' => 'Cesta na Kamzík 22', 'city' => 'Bratislava', 'postalCode' => '831 01', 'country' => 'Slovensko', 'companyId' => '36221945', 'taxId' => '2053464094', 'vatId' => 'SK2053464094', 'website' => 'https://horsky-park.example', 'brief' => 'Fasádny obklad a podlaha lobby pre rezidenciu s 12 vilami', 'valueEur' => 24600, 'rating' => 5],
        'C2' => ['name' => 'Andrea Horváthová', 'legalName' => 'Andrea Horváthová', 'short' => 'Andrea', 'type' => 'person', 'stage' => 'won', 'contact' => 'Andrea Horváthová', 'email' => 'andrea.horvathova@mail.example', 'phone' => '+421 910 555 202', 'street' => 'Štúrova 14', 'city' => 'Nitra', 'postalCode' => '949 01', 'country' => 'Slovensko', 'companyId' => '', 'taxId' => '', 'vatId' => '', 'website' => '', 'brief' => 'Kuchynská doska a zástena z bieleho kremeňa', 'valueEur' => 5900, 'rating' => 5],
        'C3' => ['name' => 'KuchyneLine Studio s.r.o.', 'legalName' => 'KuchyneLine Studio s.r.o.', 'short' => 'KuchyneLine', 'type' => 'partner', 'stage' => 'won', 'contact' => 'Lucia Majerová', 'email' => 'lucia.majerova@kuchyneline.example', 'phone' => '+421 903 555 203', 'street' => 'Kollárova 9', 'city' => 'Trnava', 'postalCode' => '917 01', 'country' => 'Slovensko', 'companyId' => '47105836', 'taxId' => '2030246625', 'vatId' => 'SK2030246625', 'website' => 'https://kuchyneline.example', 'brief' => 'Rámcová zmluva: 8 – 10 kuchynských dosiek mesačne', 'valueEur' => 38000, 'rating' => 5],
        'C4' => ['_foreign' => true, 'name' => 'Interiéry Dvořák s.r.o.', 'legalName' => 'Interiéry Dvořák s.r.o.', 'short' => 'Dvořák', 'type' => 'business', 'stage' => 'won', 'contact' => 'Petr Dvořák', 'email' => 'petr.dvorak@interiery-dvorak.example', 'phone' => '+420 777 555 204', 'street' => 'Masarykova 31', 'city' => 'Brno', 'postalCode' => '602 00', 'country' => 'Česko', 'companyId' => '27180450', 'taxId' => 'CZ27180450', 'vatId' => 'CZ27180450', 'website' => 'https://interiery-dvorak.example', 'brief' => 'Stoly a parapety do showroomu zo spekaného kameňa', 'valueEur' => 17200, 'rating' => 4],
        'C5' => ['name' => 'Správa bytov Juh s.r.o.', 'legalName' => 'Správa bytov Juh s.r.o.', 'short' => 'Správa bytov Juh', 'type' => 'business', 'stage' => 'won', 'contact' => 'Daniela Kurucová', 'email' => 'daniela.kurucova@sbjuh.example', 'phone' => '+421 905 555 205', 'street' => 'Moldavská cesta 8', 'city' => 'Košice', 'postalCode' => '040 11', 'country' => 'Slovensko', 'companyId' => '51284677', 'taxId' => '2062992305', 'vatId' => 'SK2062992305', 'website' => 'https://sbjuh.example', 'brief' => 'Umývadlové dosky pre sériu rekonštrukcií bytových kúpeľní', 'valueEur' => 21000, 'rating' => 4],
        'C6' => ['name' => 'Hotel Aurum ****', 'legalName' => 'Aurum Hotels s.r.o.', 'short' => 'Hotel Aurum', 'type' => 'business', 'stage' => 'won', 'contact' => 'Beáta Lukáčová', 'email' => 'beata.lukacova@hotel-aurum.example', 'phone' => '+421 905 555 206', 'street' => 'Námestie sv. Trojice 4', 'city' => 'Banská Štiavnica', 'postalCode' => '969 01', 'country' => 'Slovensko', 'companyId' => '44039212', 'taxId' => '2097366942', 'vatId' => 'SK2097366942', 'website' => 'https://hotel-aurum.example', 'brief' => 'Recepčný pult, obklad wellness steny a podlaha lobby; servisná zmluva', 'valueEur' => 46000, 'rating' => 5],
        'L7' => ['name' => 'Peter Kováč', 'legalName' => 'Peter Kováč', 'short' => 'Peter', 'type' => 'person', 'stage' => 'new', 'contact' => 'Peter Kováč', 'email' => 'peter.kovac@mail.example', 'phone' => '+421 915 555 207', 'street' => 'Štúrova 5', 'city' => 'Pezinok', 'postalCode' => '902 01', 'country' => 'Slovensko', 'companyId' => '', 'taxId' => '', 'vatId' => '', 'website' => '', 'brief' => 'Umývadlová doska a obklad sprchovacieho kúta (formulár na webe)', 'valueEur' => 3200, 'rating' => 3],
        'L8' => ['name' => 'Eva Mináriková', 'legalName' => 'Eva Mináriková', 'short' => 'Eva', 'type' => 'person', 'stage' => 'contacted', 'contact' => 'Eva Mináriková', 'email' => 'eva.minarikova@mail.example', 'phone' => '+421 917 555 208', 'street' => 'Svätoplukova 12', 'city' => 'Senec', 'postalCode' => '903 01', 'country' => 'Slovensko', 'companyId' => '', 'taxId' => '', 'vatId' => '', 'website' => '', 'brief' => 'Dlažba terasy a pult vonkajšej kuchyne', 'valueEur' => 7800, 'rating' => 4],
        'L9' => ['name' => 'Martina Kováčová', 'legalName' => 'Martina Kováčová', 'short' => 'Martina', 'type' => 'person', 'stage' => 'offer', 'contact' => 'Martina Kováčová', 'email' => 'martina.kovacova@mail.example', 'phone' => '+421 911 555 209', 'street' => 'Kukučínova 15', 'city' => 'Trnava', 'postalCode' => '917 01', 'country' => 'Slovensko', 'companyId' => '', 'taxId' => '', 'vatId' => '', 'website' => '', 'brief' => 'Kuchynská doska z webového formulára; otázka k výrezu pre drez', 'valueEur' => 8400, 'rating' => 4],
        'L10' => ['_foreign' => true, 'name' => 'Müller Architekten GmbH', 'legalName' => 'Müller Architekten GmbH', 'short' => 'Müller', 'type' => 'partner', 'stage' => 'offer', 'contact' => 'Thomas Müller', 'email' => 't.mueller@mueller-architekten.example', 'phone' => '+49 89 5550 0210', 'street' => 'Maximilianstraße 14', 'city' => 'München', 'postalCode' => '80539', 'country' => 'Nemecko', 'companyId' => 'HRB 241389', 'taxId' => '143/118/20713', 'vatId' => 'DE298416750', 'website' => 'https://mueller-architekten.example', 'brief' => 'Partnerstvo na 6 vilových projektov ročne', 'valueEur' => 45000, 'rating' => 3],
        'L11' => ['name' => 'Roman Tóth', 'legalName' => 'Roman Tóth', 'short' => 'Roman', 'type' => 'person', 'stage' => 'lost', 'contact' => 'Roman Tóth', 'email' => 'roman.toth@mail.example', 'phone' => '+421 944 555 211', 'street' => 'Hlavná 77', 'city' => 'Galanta', 'postalCode' => '924 01', 'country' => 'Slovensko', 'companyId' => '', 'taxId' => '', 'vatId' => '', 'website' => '', 'brief' => 'Prehraté na cene proti lacnejšej dielni', 'valueEur' => 2900, 'rating' => 2],
    ],

    'projects' => [
        'P1' => ['name' => 'Horský park – fasáda a lobby', 'code' => 'LP-2026-01', 'client' => 'C1', 'valueEur' => 24600],
        'P2' => ['name' => 'Kuchynská doska – biely kremeň', 'code' => 'LP-2026-02', 'client' => 'C2', 'valueEur' => 5900],
        'P3' => ['name' => 'Hotel Aurum – recepcia a wellness', 'code' => 'LP-2026-03', 'client' => 'C6', 'valueEur' => 46000],
        'P4' => ['name' => 'KuchyneLine – rámcová zmluva 2026', 'code' => 'LP-2026-04', 'client' => 'C3', 'valueEur' => 38000],
        'P5' => ['name' => 'Byty – kúpeľne, séria 1', 'code' => 'LP-2026-05', 'client' => 'C5', 'valueEur' => 21000],
    ],

    // Prices and costs are EUR per unit before conversion (demo_money()).
    'items' => [
        'I1' => ['name' => 'Kremenná doska Calacatta 20 mm (Aurelia Quartz)', 'sku' => 'LP-AQ-001', 'category' => 'Dosky', 'unit' => 'm²', 'priceEur' => 185.0, 'costEur' => 95.0],
        'I2' => ['name' => 'Spekaný kameň Nero Marquina 12 mm (Stratos)', 'sku' => 'LP-ST-002', 'category' => 'Dosky', 'unit' => 'm²', 'priceEur' => 210.0, 'costEur' => 110.0],
        'I3' => ['name' => 'Porcelánová doska Statuario 6 mm (Lumina)', 'sku' => 'LP-LU-003', 'category' => 'Dosky', 'unit' => 'm²', 'priceEur' => 140.0, 'costEur' => 72.0],
        'I4' => ['name' => 'Žula Absolute Black 30 mm', 'sku' => 'LP-GR-004', 'category' => 'Dosky', 'unit' => 'm²', 'priceEur' => 240.0, 'costEur' => 130.0],
        'I5' => ['name' => 'Dvojzložkové lepidlo na kameň Stonefix 5 kg', 'sku' => 'LP-SF-005', 'category' => 'Chémia', 'unit' => 'ks', 'priceEur' => 24.5, 'costEur' => 14.2],
        'I6' => ['name' => 'Impregnácia Stonefix Seal 1 l', 'sku' => 'LP-SS-006', 'category' => 'Chémia', 'unit' => 'ks', 'priceEur' => 42.0, 'costEur' => 22.8],
        'I7' => ['name' => 'Sada na starostlivosť o dosku (čistič + leštidlo)', 'sku' => 'LP-CK-007', 'category' => 'E-shop', 'unit' => 'ks', 'priceEur' => 29.9, 'costEur' => 12.4],
        'I8' => ['name' => 'Zameranie laserom – návšteva', 'sku' => 'LP-SV-008', 'category' => 'Služby', 'unit' => 'návšteva', 'priceEur' => 90.0, 'costEur' => 0.0],
    ],

    'suppliers' => [
        'S1' => ['_foreign' => true, 'name' => 'Marmi Fiorano S.p.A.', 'contact' => 'Giulia Bianchi', 'email' => 'ordini@marmi-fiorano.example', 'phone' => '+39 0536 555 0123', 'street' => 'Via Statale 45', 'city' => 'Fiorano Modenese', 'postalCode' => '41042', 'country' => 'Taliansko', 'companyId' => 'MO-348792', 'taxId' => '03487920364', 'vatId' => 'IT03487920364', 'website' => 'https://marmi-fiorano.example', 'iban' => 'IT60 X054 2811 1010 0000 0123 456', 'swift' => 'MRFOITMM', 'paymentDueDays' => 30],
        'S2' => ['name' => 'Kameň Distribúcia s.r.o.', 'contact' => 'Roman Hlaváč', 'email' => 'objednavky@kamen-distribucia.example', 'phone' => '+421 2 5557 0231', 'street' => 'Pezinská 31', 'city' => 'Senec', 'postalCode' => '903 01', 'country' => 'Slovensko', 'companyId' => '31877460', 'taxId' => '2016480884', 'vatId' => 'SK2016480884', 'website' => 'https://kamen-distribucia.example', 'iban' => 'SK02 9980 0000 0023 1048 7712', 'swift' => 'DNBUSKBX', 'paymentDueDays' => 21],
        'S3' => ['name' => 'ChemStav s.r.o.', 'contact' => 'Zuzana Pavlíková', 'email' => 'predaj@chemstav.example', 'phone' => '+421 41 555 0312', 'street' => 'Hlinská 18', 'city' => 'Žilina', 'postalCode' => '010 01', 'country' => 'Slovensko', 'companyId' => '50093126', 'taxId' => '2019722232', 'vatId' => 'SK2019722232', 'website' => 'https://chemstav.example', 'iban' => 'SK30 9980 0000 0031 2250 9031', 'swift' => 'DNBUSKBX', 'paymentDueDays' => 14],
    ],

    // 'owner' = the login who manages it (role ref).
    'warehouses' => [
        'W1' => ['name' => 'Hlavný sklad – Bratislava', 'code' => 'WH-BA-01', 'address' => 'Vajnorská 142, 831 04 Bratislava', 'owner' => 'pm'],
        'W2' => ['name' => 'Sklad dielne – Trnava', 'code' => 'WH-TT-01', 'address' => 'Zavarská 11, 917 01 Trnava', 'owner' => 'pm'],
    ],
];
