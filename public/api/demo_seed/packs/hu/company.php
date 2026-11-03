<?php
/**
 * Company pack, Hungarian edition: Lapidea Kft. - the cast every other pack points at by ref.
 *
 * Data only (see the contract in demo_seed/index.php). Same keys, list lengths and numbers
 * as packs/sk/company.php and packs/en/company.php; only strings differ. Hungarian names are
 * family name first ('name' => 'Kollár András'; 'first' is the given name, for greetings).
 * Amounts are EUR before conversion (…Eur keys). Fictional contact data only (B12).
 */
return [
    'brand' => 'Lapidea',

    /*
     * Sidebar of the three logins: the modules sorted into labelled groups (a user preference,
     * see src/utils/sidebarLayout.ts). Items are sidebar item ids; custom dashboards are not
     * listed and land in the first group.
     */
    'sidebarGroups' => [
        ['id' => 'group_overview', 'title' => 'Áttekintés', 'items' => ['dashboard', 'overview', 'tasks', 'time-tracking']],
        ['id' => 'group_sales', 'title' => 'Értékesítés', 'items' => ['leads', 'clients', 'invoices', 'orders']],
        ['id' => 'group_operations', 'title' => 'Működés', 'items' => ['projects', 'tickets', 'warehouse', 'financial']],
        ['id' => 'group_communication', 'title' => 'Kommunikáció', 'items' => ['whatsapp', 'email', 'meetings', 'social_media']],
        ['id' => 'group_ai', 'title' => 'AI és automatizálás', 'items' => ['rag_ai', 'sai', 'automation']],
        ['id' => 'group_workspace', 'title' => 'Munkaterület', 'items' => ['employees', 'files', 'updates']],
    ],

    'company' => [
        'name' => 'Lapidea Kft.',
        'subtitle' => 'Kő, kvarc és szinterezett kő méretre',
        'street' => 'Budai út 18.',
        'city' => 'Győr',
        'postalCode' => '9027',
        'country' => 'Magyarország',
        'companyId' => '08-09-031472',
        'taxId' => '27184532-2-08',
        'vatId' => 'HU27184532',
        'email' => 'info@lapidea.example',
        'phone' => '+36 96 555 142',
        'phoneSecondary' => '+36 30 555 0142',
        'website' => 'https://lapidea.example',
        'iban' => 'HU33 9951 0017 0000 0037 4109 8251',
        'swift' => 'RBBKHUHB',
        'bankName' => 'Rába Bank',
    ],

    'billing' => [
        'paymentDueDays' => 14,
        'shippingMethods' => ['GLS', 'MPL', 'Foxpost', 'Személyes átvétel a bemutatóteremben'],
        'paymentMethods' => ['Banki átutalás', 'Bankkártyás fizetés', 'Utánvét'],
        'defaultPaymentMethod' => 'Banki átutalás',
        'warrantyText' => '10 év garancia az anyagra, 5 év a megmunkálásra és a beépítésre.',
        'durationText' => '3–4 hét a minta jóváhagyásától számítva',
        'startDateText' => 'Az előleg beérkezésétől számított 10 munkanapon belül',
        'nextSteps' => 'Erősítse meg az ajánlatot, fizesse be a 40 %-os előleget, és egyeztetjük a pontos felmérés időpontját.',
        'socialProof' => 'Ügyfeleink: {client:C6}, {client:C3}, {client:C1}',
        'usp' => [
            ['title' => 'Lézeres felmérés', 'subtitle' => 'Milliméter pontosság'],
            ['title' => 'Saját CNC műhely', 'subtitle' => 'Vízsugaras vágás és élcsiszolás házon belül'],
            ['title' => 'Beépítés az árban', 'subtitle' => 'Saját szerelőcsapat'],
            ['title' => '10 év garancia', 'subtitle' => 'Az anyagra és a megmunkálásra is'],
        ],
    ],

    'divisions' => [
        ['name' => 'Lapidea Győr', 'color' => '#3b82f6'],
        ['name' => 'Lapidea Budapest', 'color' => '#8b5cf6'],
    ],

    // The three logins. Password "password" for all. 'role' is the system role.
    'users' => [
        'owner' => ['name' => 'Kollár András', 'first' => 'András', 'last' => 'Kollár', 'email' => 'kollar.andras@lapidea.example', 'role' => 'admin', 'color' => '#10b981', 'title' => 'Tulajdonos és ügyvezető'],
        'pm' => ['name' => 'Szabó Szilvia', 'first' => 'Szilvia', 'last' => 'Szabó', 'email' => 'szabo.szilvia@lapidea.example', 'role' => 'project_manager', 'color' => '#6366f1', 'title' => 'Gyártás- és projektvezető'],
        'sales' => ['name' => 'Juhász János', 'first' => 'János', 'last' => 'Juhász', 'email' => 'juhasz.janos@lapidea.example', 'role' => 'project_manager', 'color' => '#f59e0b', 'title' => 'Bemutatótermi értékesítő'],
    ],

    // E1-E3 are the three logins ('user' = their role ref); E4-E6 have no login.
    // 'pin' is the tax identification number (adóazonosító jel; fictional, valid checksum).
    'employees' => [
        'E1' => ['name' => 'Kollár András', 'first' => 'András', 'last' => 'Kollár', 'user' => 'owner', 'email' => 'kollar.andras@lapidea.example', 'phone' => '+36 30 555 0101', 'title' => 'Tulajdonos és ügyvezető', 'department' => 'Vezetés', 'street' => 'Árpád út 19.', 'city' => 'Győr', 'zip' => '9021', 'country' => 'Magyarország', 'pin' => '8409771004', 'salaryEur' => 4200],
        'E2' => ['name' => 'Szabó Szilvia', 'first' => 'Szilvia', 'last' => 'Szabó', 'user' => 'pm', 'email' => 'szabo.szilvia@lapidea.example', 'phone' => '+36 30 555 0102', 'title' => 'Gyártás- és projektvezető', 'department' => 'Gyártás', 'street' => 'Baross Gábor út 48.', 'city' => 'Győr', 'zip' => '9021', 'country' => 'Magyarország', 'pin' => '8429781072', 'salaryEur' => 3100],
        'E3' => ['name' => 'Juhász János', 'first' => 'János', 'last' => 'Juhász', 'user' => 'sales', 'email' => 'juhasz.janos@lapidea.example', 'phone' => '+36 30 555 0103', 'title' => 'Bemutatótermi értékesítő', 'department' => 'Értékesítés', 'street' => 'Jókai utca 8.', 'city' => 'Győr', 'zip' => '9022', 'country' => 'Magyarország', 'pin' => '8445231146', 'salaryEur' => 2400],
        'E4' => ['name' => 'Molnár Márton', 'first' => 'Márton', 'last' => 'Molnár', 'user' => null, 'email' => 'molnar.marton@lapidea.example', 'phone' => '+36 30 555 0104', 'title' => 'Szerelőcsapat-vezető', 'department' => 'Beépítés', 'street' => 'Kossuth Lajos utca 5.', 'city' => 'Győr', 'zip' => '9022', 'country' => 'Magyarország', 'pin' => '8454481214', 'salaryEur' => 2300],
        'E5' => ['name' => 'Tóth Tamás', 'first' => 'Tamás', 'last' => 'Tóth', 'user' => null, 'email' => 'toth.tamas@lapidea.example', 'phone' => '+36 30 555 0105', 'title' => 'CNC- és vízsugaras gépkezelő', 'department' => 'Gyártás', 'street' => 'Bartók Béla út 3.', 'city' => 'Győr', 'zip' => '9023', 'country' => 'Magyarország', 'pin' => '8434801280', 'salaryEur' => 2100],
        'E6' => ['name' => 'Kiss Krisztina', 'first' => 'Krisztina', 'last' => 'Kiss', 'user' => null, 'email' => 'kiss.krisztina@lapidea.example', 'phone' => '+36 30 555 0106', 'title' => 'Iroda és könyvelés', 'department' => 'Adminisztráció', 'street' => 'Kazinczy utca 62.', 'city' => 'Győr', 'zip' => '9024', 'country' => 'Magyarország', 'pin' => '8461401352', 'salaryEur' => 1900],
    ],

    // Clients C1-C6 (stage 'won') and leads L7-L11 (stage = the lead-state role of lookup.php).
    // 'type' is leads.client_type. 'name' is what the CRM shows, 'legalName' the invoicing entity,
    // 'short' how people say it in text, 'contact' the person (a private client: themselves).
    'clients' => [
        'C1' => ['name' => 'Hegyvidék Rezidencia Kft.', 'legalName' => 'Hegyvidék Rezidencia Kft.', 'short' => 'Hegyvidék', 'type' => 'business', 'stage' => 'won', 'contact' => 'Dr. Fekete Márk', 'email' => 'fekete.mark@hegyvidek-rezidencia.example', 'phone' => '+36 30 555 0201', 'street' => 'Szent István út 40.', 'city' => 'Győr', 'postalCode' => '9021', 'country' => 'Magyarország', 'companyId' => '08-09-029811', 'taxId' => '25031919-2-08', 'vatId' => 'HU25031919', 'website' => 'https://hegyvidek-rezidencia.example', 'brief' => 'Homlokzatburkolat és előcsarnok-padló egy 12 villás rezidenciához', 'valueEur' => 24600, 'rating' => 5],
        'C2' => ['name' => 'Horváth Andrea', 'legalName' => 'Horváth Andrea', 'short' => 'Andrea', 'type' => 'person', 'stage' => 'won', 'contact' => 'Horváth Andrea', 'email' => 'horvath.andrea@mail.example', 'phone' => '+36 20 555 0202', 'street' => 'Fő utca 23.', 'city' => 'Mosonmagyaróvár', 'postalCode' => '9200', 'country' => 'Magyarország', 'companyId' => '', 'taxId' => '', 'vatId' => '', 'website' => '', 'brief' => 'Konyhapult és hátfal fehér kvarcból', 'valueEur' => 5900, 'rating' => 5],
        'C3' => ['name' => 'KonyhaVonal Stúdió Kft.', 'legalName' => 'KonyhaVonal Stúdió Kft.', 'short' => 'KonyhaVonal', 'type' => 'partner', 'stage' => 'won', 'contact' => 'Major Lúcia', 'email' => 'major.lucia@konyhavonal.example', 'phone' => '+36 30 555 0203', 'street' => 'Arany János utca 7.', 'city' => 'Győr', 'postalCode' => '9021', 'country' => 'Magyarország', 'companyId' => '08-09-027364', 'taxId' => '26440729-2-08', 'vatId' => 'HU26440729', 'website' => 'https://konyhavonal.example', 'brief' => 'Keretszerződés: havi 8–10 konyhapult', 'valueEur' => 38000, 'rating' => 5],
        'C4' => ['_foreign' => true, 'name' => 'Wohnwerk Steiner GmbH', 'legalName' => 'Wohnwerk Steiner GmbH', 'short' => 'Steiner', 'type' => 'business', 'stage' => 'won', 'contact' => 'Stefan Steiner', 'email' => 'stefan.steiner@wohnwerk-steiner.example', 'phone' => '+43 1 555 0204', 'street' => 'Mariahilfer Straße 88', 'city' => 'Wien', 'postalCode' => '1070', 'country' => 'Ausztria', 'companyId' => 'FN 418276 b', 'taxId' => 'ATU58301427', 'vatId' => 'ATU58301427', 'website' => 'https://wohnwerk-steiner.example', 'brief' => 'Bemutatótermi asztalok és ablakpárkányok szinterezett kőből', 'valueEur' => 17200, 'rating' => 4],
        'C5' => ['name' => 'Délkapu Ingatlankezelő Kft.', 'legalName' => 'Délkapu Ingatlankezelő Kft.', 'short' => 'Délkapu', 'type' => 'business', 'stage' => 'won', 'contact' => 'Kurucz Dániel', 'email' => 'kurucz.daniel@delkapu.example', 'phone' => '+36 30 555 0205', 'street' => 'Üllői út 112.', 'city' => 'Budapest', 'postalCode' => '1091', 'country' => 'Magyarország', 'companyId' => '01-09-318826', 'taxId' => '27911068-2-41', 'vatId' => 'HU27911068', 'website' => 'https://delkapu.example', 'brief' => 'Mosdópultok egy lakásfelújítás-sorozat fürdőszobáihoz', 'valueEur' => 21000, 'rating' => 4],
        'C6' => ['name' => 'Aurum Hotel ****', 'legalName' => 'Aurum Hotels Kft.', 'short' => 'Aurum Hotel', 'type' => 'business', 'stage' => 'won', 'contact' => 'Lukács Beáta', 'email' => 'lukacs.beata@hotel-aurum.example', 'phone' => '+36 30 555 0206', 'street' => 'Fő tér 4.', 'city' => 'Sopron', 'postalCode' => '9400', 'country' => 'Magyarország', 'companyId' => '08-09-024477', 'taxId' => '28204530-2-08', 'vatId' => 'HU28204530', 'website' => 'https://hotel-aurum.example', 'brief' => 'Recepciós pult, wellness-fal burkolat és előcsarnok-padló; szervizszerződés', 'valueEur' => 46000, 'rating' => 5],
        'L7' => ['name' => 'Kovács Péter', 'legalName' => 'Kovács Péter', 'short' => 'Péter', 'type' => 'person', 'stage' => 'new', 'contact' => 'Kovács Péter', 'email' => 'kovacs.peter@mail.example', 'phone' => '+36 20 555 0207', 'street' => 'Szent Márton utca 5.', 'city' => 'Pannonhalma', 'postalCode' => '9090', 'country' => 'Magyarország', 'companyId' => '', 'taxId' => '', 'vatId' => '', 'website' => '', 'brief' => 'Mosdópult és zuhanyfal burkolat (webes űrlap)', 'valueEur' => 3200, 'rating' => 3],
        'L8' => ['name' => 'Mészáros Éva', 'legalName' => 'Mészáros Éva', 'short' => 'Éva', 'type' => 'person', 'stage' => 'contacted', 'contact' => 'Mészáros Éva', 'email' => 'meszaros.eva@mail.example', 'phone' => '+36 70 555 0208', 'street' => 'Fő utca 12.', 'city' => 'Kapuvár', 'postalCode' => '9330', 'country' => 'Magyarország', 'companyId' => '', 'taxId' => '', 'vatId' => '', 'website' => '', 'brief' => 'Teraszburkolat és kültéri konyhapult', 'valueEur' => 7800, 'rating' => 4],
        'L9' => ['name' => 'Kozma Martina', 'legalName' => 'Kozma Martina', 'short' => 'Martina', 'type' => 'person', 'stage' => 'offer', 'contact' => 'Kozma Martina', 'email' => 'kozma.martina@mail.example', 'phone' => '+36 30 555 0209', 'street' => 'Kossuth tér 15.', 'city' => 'Tata', 'postalCode' => '2890', 'country' => 'Magyarország', 'companyId' => '', 'taxId' => '', 'vatId' => '', 'website' => '', 'brief' => 'Konyhapult a webes űrlapról; kérdés a mosogató kivágásáról', 'valueEur' => 8400, 'rating' => 4],
        'L10' => ['_foreign' => true, 'name' => 'Müller Architekten GmbH', 'legalName' => 'Müller Architekten GmbH', 'short' => 'Müller', 'type' => 'partner', 'stage' => 'offer', 'contact' => 'Thomas Müller', 'email' => 't.mueller@mueller-architekten.example', 'phone' => '+49 89 5550 0210', 'street' => 'Maximilianstraße 14', 'city' => 'München', 'postalCode' => '80539', 'country' => 'Németország', 'companyId' => 'HRB 241389', 'taxId' => '143/118/20713', 'vatId' => 'DE298416750', 'website' => 'https://mueller-architekten.example', 'brief' => 'Együttműködés évi 6 villaprojektre', 'valueEur' => 45000, 'rating' => 3],
        'L11' => ['name' => 'Tóth Roland', 'legalName' => 'Tóth Roland', 'short' => 'Roland', 'type' => 'person', 'stage' => 'lost', 'contact' => 'Tóth Roland', 'email' => 'toth.roland@mail.example', 'phone' => '+36 20 555 0211', 'street' => 'Szent István út 77.', 'city' => 'Komárom', 'postalCode' => '2900', 'country' => 'Magyarország', 'companyId' => '', 'taxId' => '', 'vatId' => '', 'website' => '', 'brief' => 'Árban alulmaradt egy olcsóbb műhellyel szemben', 'valueEur' => 2900, 'rating' => 2],
    ],

    'projects' => [
        'P1' => ['name' => 'Hegyvidék – homlokzat és előcsarnok', 'code' => 'LP-2026-01', 'client' => 'C1', 'valueEur' => 24600],
        'P2' => ['name' => 'Konyhapult – fehér kvarc', 'code' => 'LP-2026-02', 'client' => 'C2', 'valueEur' => 5900],
        'P3' => ['name' => 'Aurum Hotel – recepció és wellness', 'code' => 'LP-2026-03', 'client' => 'C6', 'valueEur' => 46000],
        'P4' => ['name' => 'KonyhaVonal – keretszerződés 2026', 'code' => 'LP-2026-04', 'client' => 'C3', 'valueEur' => 38000],
        'P5' => ['name' => 'Lakások – fürdőszobák, 1. sorozat', 'code' => 'LP-2026-05', 'client' => 'C5', 'valueEur' => 21000],
    ],

    // Prices and costs are EUR per unit before conversion (demo_money()).
    'items' => [
        'I1' => ['name' => 'Calacatta kvarclap 20 mm (Aurelia Quartz)', 'sku' => 'LP-AQ-001', 'category' => 'Lapok', 'unit' => 'm²', 'priceEur' => 185.0, 'costEur' => 95.0],
        'I2' => ['name' => 'Nero Marquina szinterezett kő 12 mm (Stratos)', 'sku' => 'LP-ST-002', 'category' => 'Lapok', 'unit' => 'm²', 'priceEur' => 210.0, 'costEur' => 110.0],
        'I3' => ['name' => 'Statuario porcelánlap 6 mm (Lumina)', 'sku' => 'LP-LU-003', 'category' => 'Lapok', 'unit' => 'm²', 'priceEur' => 140.0, 'costEur' => 72.0],
        'I4' => ['name' => 'Absolute Black gránit 30 mm', 'sku' => 'LP-GR-004', 'category' => 'Lapok', 'unit' => 'm²', 'priceEur' => 240.0, 'costEur' => 130.0],
        'I5' => ['name' => 'Kétkomponensű kőragasztó Stonefix 5 kg', 'sku' => 'LP-SF-005', 'category' => 'Vegyi áru', 'unit' => 'db', 'priceEur' => 24.5, 'costEur' => 14.2],
        'I6' => ['name' => 'Stonefix Seal impregnáló 1 l', 'sku' => 'LP-SS-006', 'category' => 'Vegyi áru', 'unit' => 'db', 'priceEur' => 42.0, 'costEur' => 22.8],
        'I7' => ['name' => 'Pultápoló készlet (tisztító + polír)', 'sku' => 'LP-CK-007', 'category' => 'Webshop', 'unit' => 'db', 'priceEur' => 29.9, 'costEur' => 12.4],
        'I8' => ['name' => 'Lézeres felmérés – kiszállás', 'sku' => 'LP-SV-008', 'category' => 'Szolgáltatás', 'unit' => 'kiszállás', 'priceEur' => 90.0, 'costEur' => 0.0],
    ],

    'suppliers' => [
        'S1' => ['_foreign' => true, 'name' => 'Marmi Fiorano S.p.A.', 'contact' => 'Giulia Bianchi', 'email' => 'ordini@marmi-fiorano.example', 'phone' => '+39 0536 555 0123', 'street' => 'Via Statale 45', 'city' => 'Fiorano Modenese', 'postalCode' => '41042', 'country' => 'Olaszország', 'companyId' => 'MO-348792', 'taxId' => '03487920364', 'vatId' => 'IT03487920364', 'website' => 'https://marmi-fiorano.example', 'iban' => 'IT60 X054 2811 1010 0000 0123 456', 'swift' => 'MRFOITMM', 'paymentDueDays' => 30],
        'S2' => ['name' => 'Kőpont Kft.', 'contact' => 'Hajdu Roland', 'email' => 'rendeles@kopont.example', 'phone' => '+36 96 555 231', 'street' => 'Pápai út 31.', 'city' => 'Győr', 'postalCode' => '9028', 'country' => 'Magyarország', 'companyId' => '08-09-020156', 'taxId' => '25836271-2-08', 'vatId' => 'HU25836271', 'website' => 'https://kopont.example', 'iban' => 'HU06 9951 0017 0000 0041 2038 7652', 'swift' => 'RBBKHUHB', 'paymentDueDays' => 21],
        'S3' => ['name' => 'KémiaÉpít Kft.', 'contact' => 'Pál Zsuzsanna', 'email' => 'ertekesites@kemiaepit.example', 'phone' => '+36 22 555 312', 'street' => 'Palotai út 18.', 'city' => 'Székesfehérvár', 'postalCode' => '8000', 'country' => 'Magyarország', 'companyId' => '07-09-014983', 'taxId' => '29583140-2-07', 'vatId' => 'HU29583140', 'website' => 'https://kemiaepit.example', 'iban' => 'HU89 9951 0017 0000 0052 8840 9136', 'swift' => 'RBBKHUHB', 'paymentDueDays' => 14],
    ],

    // 'owner' = the login who manages it (role ref).
    'warehouses' => [
        'W1' => ['name' => 'Győri központi raktár', 'code' => 'WH-GY-01', 'address' => '9027 Győr, Budai út 18.', 'owner' => 'pm'],
        'W2' => ['name' => 'Budapesti raktár', 'code' => 'WH-BP-01', 'address' => '1117 Budapest, Hengermalom út 21.', 'owner' => 'pm'],
    ],
];
