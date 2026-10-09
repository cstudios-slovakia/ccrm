<?php
/**
 * Demo seed module: clients.
 *
 * Contract (see index.php / helpers.php): idempotent — delete this module's
 * own 'demo-%' rows, then insert. Ids come from demo_id('clients', n); dates from
 * demo_d()/demo_dt(); text from demo_t([...], demo_lang($pdo)).
 *
 * How the app tells a lead from a client (src/utils/clientRecord.ts, the
 * Clients registry in ClientsView.tsx): leads and clients share the `leads`
 * table, and a record is a client when its id starts with 'client-' OR it
 * carries a positive `adjustment`. The status is NOT what decides it — "won"
 * only describes the pipeline stage. Demo ids must start with 'demo-' so
 * api/wipe_demo.php can remove them, so the new clients use a positive
 * `adjustment` (value of earlier orders) plus the won state, which is exactly
 * what the Clients registry accepts. Profiles are grouped by lower-cased name.
 *
 * Id plan:  1-8       leads rows (1-6 clients, 7-8 open leads)
 *           101-104   client_categories (the customer category tree)
 *           1001+     timeline_events
 *
 * Existing demo leads (created by setup.php): lead-1 Ján Novák is promoted to a
 * client; lead-2 and lead-3 stay open leads and are linked from here
 * (referrals) and from the offers module.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

function demo_seed_clients(PDO $pdo): void {
    $lang = demo_lang($pdo);
    $T = static fn(array $byLang): string => demo_t($byLang, $lang);
    $states = demo_lead_states($pdo);
    $sources = demo_lead_sources($pdo);
    $cats = demo_lead_categories($pdo);
    $users = demo_user_names();
    [$alex, $sam, $jordan] = $users;
    $divisions = demo_divisions($pdo);
    $divMain = $divisions[0] ?? 'Cstudios';
    $divHu = $divisions[1] ?? $divMain;

    // --- Clean own rows (FK cascades also clear their categories and events) ----
    $pdo->exec("DELETE FROM `timeline_events` WHERE `id` LIKE 'demo-clients-%'");
    $pdo->exec("DELETE FROM `lead_categories` WHERE `lead_id` LIKE 'demo-clients-%'");
    $pdo->exec("DELETE FROM `leads` WHERE `id` LIKE 'demo-clients-%'");
    if (demo_table_exists($pdo, 'client_categories')) {
        $pdo->exec("DELETE FROM `client_categories` WHERE `id` LIKE 'demo-clients-%'");
    }

    // --- Customer categories (a 2-level tree) -------------------------------
    $catPrivate = demo_id('clients', 101);
    $catCommercial = demo_id('clients', 102);
    $catTrade = demo_id('clients', 103);
    $catHospitality = demo_id('clients', 104);
    if (demo_table_exists($pdo, 'client_categories')) {
        $insCat = $pdo->prepare(
            "INSERT INTO `client_categories` (`id`, `name`, `parent_id`, `level`, `sort_order`, `color`, `icon`) VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        $catRows = [
            [$catPrivate, $T(['en' => 'Private households', 'sk' => 'Súkromné domácnosti', 'hu' => 'Magánháztartások']), null, 1, 1, '#10b981', 'Home'],
            [$catCommercial, $T(['en' => 'Commercial & developers', 'sk' => 'Komerčné a developeri', 'hu' => 'Kereskedelmi és fejlesztők']), null, 1, 2, '#3b82f6', 'Building'],
            [$catTrade, $T(['en' => 'Trade partners & studios', 'sk' => 'Obchodní partneri a štúdiá', 'hu' => 'Kereskedelmi partnerek és stúdiók']), null, 1, 3, '#8b5cf6', 'Users'],
            [$catHospitality, $T(['en' => 'Hotels & hospitality', 'sk' => 'Hotely a gastro', 'hu' => 'Szállodák és vendéglátás']), $catCommercial, 2, 1, '#0ea5e9', 'Coffee'],
        ];
        foreach ($catRows as $r) {
            $insCat->execute($r);
        }
    }

    // --- Leads / clients ------------------------------------------------------
    // Interest texts double as the lead's interest_note and the timeline topic.
    $interest = [
        1 => $T(['en' => 'Stone cladding for the facade and entrance hall of a new villa complex in Slavín (about 180 m² of large-format porcelain slabs).',
                 'sk' => 'Kamenný obklad fasády a vstupnej haly novej vilovej zástavby na Slavíne (približne 180 m² veľkoformátových porcelánových dosiek).',
                 'hu' => 'Kőburkolat egy új villaegyüttes homlokzatára és előcsarnokába Slavínban (kb. 180 m² nagy formátumú porcelánlap).']),
        2 => $T(['en' => 'Kitchen worktop and 60 cm backsplash in white quartz, undermount sink cutout.',
                 'sk' => 'Kuchynská pracovná doska a 60 cm zástena z bieleho kremeňa, výrez na podstavný drez.',
                 'hu' => 'Konyhai munkalap és 60 cm-es hátfal fehér kvarcból, alulról beépített mosogató kivágással.']),
        3 => $T(['en' => 'Partner studio: fabrication of worktops for its kitchen projects, about 8–10 jobs a month.',
                 'sk' => 'Partnerské štúdio: výroba pracovných dosiek pre jeho kuchynské zákazky, približne 8–10 zákaziek mesačne.',
                 'hu' => 'Partnerstúdió: munkalapok gyártása konyhai projektjeihez, havonta kb. 8–10 munka.']),
        4 => $T(['en' => 'Showroom tables and window sills in sintered stone for a furniture retailer.',
                 'sk' => 'Showroomové stoly a parapety zo spekaného kameňa pre predajcu nábytku.',
                 'hu' => 'Bemutatótermi asztalok és ablakpárkányok szinterezett kőből egy bútorkereskedőnek.']),
        5 => $T(['en' => 'Bathroom vanity tops and wall cladding for a series of apartment renovations in Győr.',
                 'sk' => 'Dosky pod umývadlá a obklad stien kúpeľní pre sériu rekonštrukcií bytov v Győri.',
                 'hu' => 'Fürdőszobai mosdópultok és falburkolat egy győri lakásfelújítás-sorozathoz.']),
        6 => $T(['en' => 'Reception desk, spa wall cladding and lobby flooring for a boutique hotel.',
                 'sk' => 'Recepčný pult, obklad steny wellness a podlaha lobby pre butikový hotel.',
                 'hu' => 'Recepciós pult, wellness falburkolat és előcsarnok padló egy butikhotelnek.']),
        7 => $T(['en' => 'Bathroom vanity top and shower wall cladding in a family house.',
                 'sk' => 'Doska pod umývadlo a obklad sprchovacieho kúta v rodinnom dome.',
                 'hu' => 'Mosdópult és zuhanyfal-burkolat egy családi házban.']),
        8 => $T(['en' => 'Terrace paving and outdoor kitchen counter in 20 mm porcelain slabs.',
                 'sk' => 'Dlažba terasy a pult vonkajšej kuchyne z 20 mm porcelánových dosiek.',
                 'hu' => 'Teraszburkolat és kültéri konyhapult 20 mm-es porcelánlapokból.']),
    ];

    $srcWeb = $sources[min(3, count($sources) - 1)];
    $srcShow = $sources[0];
    $srcFb = $sources[min(1, count($sources) - 1)];
    $srcIg = $sources[min(2, count($sources) - 1)];

    // [n, name, city, type, status, source, owner, division, value, adjustment, rating, phone, email,
    //  companyId, taxId, vatId, contact, website, street, zip, country, categories, categoryId, referral,
    //  createdOffset, extra(legal_form, region, district, nace, size, established)]
    $leads = [
        [1, 'Vila Slavín Development s.r.o.', 'Bratislava', 'business', $states['won'], $srcShow, $alex, $divMain, 24600, 6800, 5,
            '+421 903 245 118', 'obchod@vilaslavin.example.com', '52118347', '2120847391', 'SK2120847391', 'Ing. Marek Šimko', 'https://vilaslavin.example.com',
            'Vlárska 28', '831 01', 'Slovakia', [0, 1], $catCommercial, null, -150,
            ['s.r.o.', 'Bratislavský kraj', 'Bratislava III', '41.20', '10-49', '2019-03-12']],
        [2, 'Andrea Horváthová', 'Nitra', 'person', $states['won'], $srcIg, $jordan, $divMain, 5900, 1850, 4,
            '+421 918 402 665', 'andrea.horvathova@example.com', null, null, null, null, null,
            'Štúrova 31', '949 01', 'Slovakia', [0], $catPrivate, 'lead-1', -110, null],
        [3, 'KitchenLine Studio s.r.o.', 'Trnava', 'partner', $states['won'], $srcShow, $sam, $divMain, 38000, 12400, 4,
            '+421 905 770 314', 'objednavky@kitchenline.example.com', '47392806', '2023917452', 'SK2023917452', 'Lucia Majerová', 'https://kitchenline.example.com',
            'Hospodárska 14', '917 01', 'Slovakia', [0, 1], $catTrade, null, -190,
            ['s.r.o.', 'Trnavský kraj', 'Trnava', '31.02', '10-49', '2016-09-01']],
        [4, 'Interiéry Dvořák s.r.o.', 'Brno', 'business', $states['won'], $srcWeb, $sam, $divMain, 17200, 3900, 4,
            '+420 602 118 745', 'info@interierydvorak.example.com', '27588134', 'CZ27588134', 'CZ27588134', 'Ing. Petr Dvořák', 'https://interierydvorak.example.com',
            'Cejl 52', '602 00', 'Czech Republic', [0, 1], $catCommercial, null, -95,
            ['s.r.o.', 'Jihomoravský kraj', 'Brno-město', '47.59', '10-49', '2012-05-21']],
        [5, 'Kovács & Társa Kft.', 'Győr', 'partner', $states['won'], $srcFb, $alex, $divHu, 21500, 5200, 4,
            '+36 30 482 1170', 'iroda@kovacstarsa.example.com', '08-09-021634', '14839206-2-08', 'HU14839206', 'Kovács Gábor', 'https://kovacstarsa.example.com',
            'Szent István út 18', '9021', 'Hungary', [0], $catTrade, null, -70, null],
        [6, 'Hotel Alpenblick GmbH', 'München', 'business', $states['won'], $srcWeb, $jordan, $divMain, 46000, 9500, 5,
            '+49 89 2155 4780', 'einkauf@alpenblick.example.com', 'HRB 248731', '143/815/08156', 'DE312845907', 'Katrin Brandt', 'https://alpenblick.example.com',
            'Leopoldstraße 112', '80802', 'Germany', [0, 1], $catHospitality, 'lead-3', -60, null],
        [7, 'Mgr. Peter Baláž', 'Žilina', 'person', $states['contacted'], $srcFb, $sam, $divMain, 7400, 0, 3,
            '+421 907 316 520', 'peter.balaz@example.com', null, null, null, null, null,
            'Hlinská 9', '010 01', 'Slovakia', [0], null, null, -9, null],
        [8, 'Sandra Weber', 'Leipzig', 'person', $states['new'], $srcWeb, $alex, $divMain, 12900, 0, 4,
            '+49 341 9902 6118', 'sandra.weber@example.de', null, null, null, null, null,
            'Karl-Liebknecht-Straße 71', '04275', 'Germany', [0], null, 'lead-3', -3, null],
    ];

    $insLead = $pdo->prepare(
        "INSERT INTO `leads` (`id`, `name`, `city`, `client_type`, `status`, `source`, `owner`, `division`, `value`, `adjustment`, `rating`,
            `phone`, `email`, `company_id`, `tax_id`, `vat_id`, `contact_person`, `website`, `street`, `postal_code`, `country`,
            `interest_note`, `referral_lead_id`, `client_category_id`, `legal_form`, `region`, `district`, `sk_nace`, `organization_size`,
            `establishment_date`, `created_at`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $insLeadCat = $pdo->prepare("INSERT IGNORE INTO `lead_categories` (`lead_id`, `category_name`) VALUES (?, ?)");

    foreach ($leads as $l) {
        [$n, $name, $city, $type, $status, $source, $owner, $division, $value, $adj, $rating,
         $phone, $email, $ico, $dic, $icdph, $contact, $web, $street, $zip, $country, $catIdx, $catId, $referral, $offset, $extra] = $l;
        $id = demo_id('clients', $n);
        $referralId = ($referral !== null && demo_row_exists($pdo, 'leads', $referral)) ? $referral : null;
        $insLead->execute([
            $id, $name, $city, $type, $status, $source, $owner, $division, $value, $adj, $rating,
            $phone, $email, $ico, $dic, $icdph, $contact, $web, $street, $zip, $country,
            $interest[$n], $referralId, $catId,
            $extra[0] ?? null, $extra[1] ?? null, $extra[2] ?? null, $extra[3] ?? null, $extra[4] ?? null, $extra[5] ?? null,
            demo_d($offset),
        ]);
        foreach ($catIdx as $ci) {
            if (isset($cats[$ci])) {
                $insLeadCat->execute([$id, $cats[$ci]]);
            }
        }
    }

    // --- Promote lead-1 (Ján Novák): his offer was accepted ------------------------
    // A positive adjustment is what moves him into the Clients registry.
    if (demo_row_exists($pdo, 'leads', 'lead-1')) {
        $promoCat = demo_table_exists($pdo, 'client_categories') ? $catCommercial : null;
        $pdo->prepare(
            "UPDATE `leads` SET `status` = ?, `adjustment` = 3200.00, `rating` = 5, `client_category_id` = ? WHERE `id` = 'lead-1'"
        )->execute([$states['won'], $promoCat]);
    }

    // --- Timeline ---------------------------------------------------------------
    // Documents (offers, invoices) are filed by the offers module with real
    // amounts; here: calls, mails, visits, notes and status changes.
    $ev = [
        'call' => [
            $T(['en' => 'Intro call', 'sk' => 'Úvodný hovor', 'hu' => 'Bemutatkozó hívás']),
            $T(['en' => 'Topic: %s Agreed on a site visit and the next steps.', 'sk' => 'Téma: %s Dohodli sme obhliadku a ďalšie kroky.', 'hu' => 'Téma: %s Megbeszéltük a helyszíni szemlét és a következő lépéseket.']),
        ],
        'visit' => [
            $T(['en' => 'Site visit and laser measurement', 'sk' => 'Obhliadka a laserové zameranie', 'hu' => 'Helyszíni szemle és lézeres felmérés']),
            $T(['en' => 'Measured the site with the Proliner, photos and drawings saved to the project folder.', 'sk' => 'Miesto sme zamerali Prolinerom, fotky a nákresy sú uložené v priečinku projektu.', 'hu' => 'A helyszínt Prolinerrel felmértük, a fotók és rajzok a projektmappába kerültek.']),
        ],
        'mail' => [
            $T(['en' => 'Catalogue and sample board sent', 'sk' => 'Odoslaný katalóg a vzorkovník', 'hu' => 'Katalógus és mintatábla elküldve']),
            $T(['en' => 'Sent the slab catalogue, price guide and sample board by post.', 'sk' => 'Poslali sme katalóg dosiek, cenník a vzorkovník poštou.', 'hu' => 'Elküldtük a lapkatalógust, az árlistát és a mintatáblát postán.']),
        ],
        'order' => [
            $T(['en' => 'Order confirmed', 'sk' => 'Objednávka potvrdená', 'hu' => 'Megrendelés visszaigazolva']),
            $T(['en' => 'The client confirmed the offer by e-mail; production slot booked.', 'sk' => 'Klient potvrdil ponuku e-mailom; výrobný termín je rezervovaný.', 'hu' => 'Az ügyfél e-mailben visszaigazolta az ajánlatot; a gyártási időpont lefoglalva.']),
        ],
        'note' => [
            $T(['en' => 'Client note', 'sk' => 'Poznámka ku klientovi', 'hu' => 'Megjegyzés az ügyfélről']),
            $T(['en' => 'Prefers e-mail in the morning, calls only after 14:00. Decision-maker: the contact person.', 'sk' => 'Uprednostňuje e-mail ráno, telefonáty až po 14:00. Rozhoduje kontaktná osoba.', 'hu' => 'Reggel e-mailt szeretne, telefonálni csak 14:00 után. A döntéshozó a kapcsolattartó.']),
        ],
    ];
    $statusTitle = static fn(string $to): string => $T([
        'en' => 'Status changed to "' . $to . '"', 'sk' => 'Stav zmenený na „' . $to . '“', 'hu' => 'Állapot módosítva: „' . $to . '”',
    ]);

    // [clientIndex(or lead id), dayOffset, time, type, kind, author, outgoing]
    $timeline = [
        [1, -150, '10:15', 'phone', 'call', $alex, 0],
        [1, -147, '09:40', 'email', 'mail', $alex, 1],
        [1, -138, '14:00', 'appointment', 'visit', $alex, 0],
        [1, -118, '11:20', 'note', 'order', $alex, 0],
        [1, -118, '11:21', 'status_change', 'won', $alex, 0],
        [2, -110, '15:30', 'phone', 'call', $jordan, 0],
        [2, -104, '13:00', 'appointment', 'visit', $jordan, 0],
        [2, -96, '10:05', 'note', 'order', $jordan, 0],
        [3, -190, '09:00', 'phone', 'call', $sam, 0],
        [3, -183, '16:10', 'email', 'mail', $sam, 1],
        [3, -170, '12:00', 'note', 'note', $sam, 0],
        [3, -160, '10:00', 'status_change', 'won', $sam, 0],
        [4, -95, '14:20', 'phone', 'call', $sam, 0],
        [4, -88, '09:30', 'email', 'mail', $sam, 1],
        [4, -74, '17:00', 'note', 'order', $sam, 0],
        [5, -70, '11:00', 'phone', 'call', $alex, 0],
        [5, -62, '13:45', 'appointment', 'visit', $alex, 0],
        [5, -49, '10:30', 'note', 'order', $alex, 0],
        [6, -60, '10:00', 'phone', 'call', $jordan, 0],
        [6, -52, '15:00', 'appointment', 'visit', $jordan, 0],
        [6, -41, '09:15', 'note', 'order', $jordan, 0],
        [7, -9, '16:40', 'phone', 'call', $sam, 0],
        [7, -6, '10:10', 'email', 'mail', $sam, 1],
        [8, -3, '12:30', 'email', 'mail', $alex, 0],
        ['lead-1', -25, '09:50', 'appointment', 'visit', $sam, 0],
        ['lead-1', -9, '14:35', 'note', 'order', $sam, 0],
        ['lead-1', -9, '14:36', 'status_change', 'won', $sam, 0],
    ];
    $insEv = $pdo->prepare(
        "INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`, `extra_time`, `is_outgoing`, `author`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $seq = 0;
    foreach ($timeline as [$who, $off, $time, $type, $kind, $author, $outgoing]) {
        $leadId = is_int($who) ? demo_id('clients', $who) : $who;
        if (!is_int($who) && !demo_row_exists($pdo, 'leads', $leadId)) {
            continue;
        }
        $seq++;
        $topic = is_int($who) ? $interest[$who] : '';
        if ($kind === 'won') {
            $title = $statusTitle($states['won']);
            $content = null;
        } else {
            [$title, $content] = $ev[$kind];
            if (strpos($content, '%s') !== false) {
                $content = sprintf($content, $topic);
            }
        }
        $insEv->execute([
            demo_id('clients', 1000 + $seq), $leadId, $type, demo_dt($off, $time), $title, $content,
            $type === 'appointment' ? $time : null, $outgoing, $author,
        ]);
    }
}
