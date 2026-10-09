<?php
/**
 * Demo seed module: offers.
 *
 * Contract (see index.php / helpers.php): idempotent — delete this module's
 * own 'demo-%' rows, then insert. Ids come from demo_id('offers', n); dates from
 * demo_d()/demo_dt(); text from demo_t([...], demo_lang($pdo)).
 *
 * 8 price offers + 2 proforma + 2 invoices. The schema's status enum is
 * draft | sent | approved | rejected | invoiced | cancelled — there is no
 * "accepted" or "expired": accepted = 'approved', and an expired offer is a
 * 'sent' one whose valid_until has passed (the Invoicing list derives the label).
 *
 * Money follows InvoicingView.tsx exactly: a line's total_price is net
 * (qty × unit_price × (1 − discount %)), subtotal = Σ net lines, VAT = Σ line
 * net × rate, total = subtotal + VAT; all rounded to cents.
 *
 * Each document also files its own announcement on the lead's timeline (the
 * same event the Invoicing wizard writes), so timeline amounts equal the
 * documents' totals. The finance module reads proforma/invoice rows from here.
 *
 * Id plan: 1-12 documents, 101+ lines, 2001+ timeline events.
 * The project values in projects.php equal the accepted offers' totals below
 * (24 132.00 / 4 832.40 / 32 692.80 / 9 364.80).
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

/** Round to cents the way the client does. */
function demo_offers_round(float $v): float {
    return round($v * 100) / 100;
}

function demo_seed_offers(PDO $pdo): void {
    $lang = demo_lang($pdo);
    $T = static fn(array $byLang): string => demo_t($byLang, $lang);
    [$alex, $sam, $jordan] = demo_user_names();

    // Line-item catalogue: key => [en, sk, hu, unit, warehouse item n, sku]
    $cat = [
        'porc_clad' => ['Porcelain slab 6 mm, 1600×3200 – wall cladding', 'Porcelánová doska 6 mm, 1600×3200 – obklad', 'Porcelánlap 6 mm, 1600×3200 – falburkolat', 'm²', 104, 'DEMO-PO-ST06'],
        'quartz_cw' => ['Quartz slab Calacatta White 20 mm', 'Kremenná doska Calacatta White 20 mm', 'Kvarclap Calacatta White 20 mm', 'm²', 101, 'DEMO-QZ-CW20'],
        'quartz_bs' => ['Quartz backsplash Calacatta White 12 mm', 'Kremenná zástena Calacatta White 12 mm', 'Kvarc hátfal Calacatta White 12 mm', 'm²', null, null],
        'gold'      => ['Calacatta Gold quartz slab 20 mm', 'Kremenná doska Calacatta Gold 20 mm', 'Calacatta Gold kvarclap 20 mm', 'm²', 102, 'DEMO-QZ-CG20'],
        'marq'      => ['Nero Marquina marble slab 30 mm', 'Mramorová doska Nero Marquina 30 mm', 'Nero Marquina márványlap 30 mm', 'm²', 103, 'DEMO-MB-NM30'],
        'porc_out'  => ['Outdoor porcelain slab 20 mm', 'Exteriérová porcelánová doska 20 mm', 'Kültéri porcelánlap 20 mm', 'm²', 106, 'DEMO-PO-BA20'],
        'fab'       => ['Cutting and edge finishing', 'Rezanie a opracovanie hrán', 'Vágás és élmegmunkálás', 'm²', null, null],
        'sink'      => ['Undermount sink cutout, polished', 'Výrez na podstavný drez, leštený', 'Alulról beépített mosogató kivágása, polírozott', 'ks', null, null],
        'hob'       => ['Hob cutout', 'Výrez na varnú dosku', 'Főzőlap kivágás', 'ks', null, null],
        'mitre'     => ['4 cm mitred edge', 'Zrezaná hrana 4 cm', '4 cm-es gérvágott él', 'm', null, null],
        'laser'     => ['Laser measurement on site (Proliner)', 'Laserové zameranie na mieste (Proliner)', 'Lézeres helyszíni felmérés (Proliner)', 'ks', null, null],
        'install'   => ['Installation by our crew', 'Montáž našou čatou', 'Beépítés saját szerelőcsapattal', 'ks', null, null],
        'install_m2'=> ['Installation of cladding', 'Montáž obkladu', 'Burkolat beépítése', 'm²', null, null],
        'transport' => ['Transport and unloading', 'Doprava a vyloženie', 'Szállítás és lerakodás', 'ks', null, null],
        'crane'     => ['Transport, crane and unloading', 'Doprava, žeriav a vyloženie', 'Szállítás, daru és lerakodás', 'ks', null, null],
        'vanity'    => ['Vanity top in quartz, made to measure', 'Doska pod umývadlo z kremeňa na mieru', 'Mosdópult kvarcból, méretre', 'ks', null, null],
        'table'     => ['Showroom table, sintered stone', 'Showroomový stôl, spekaný kameň', 'Bemutatótermi asztal, szinterezett kő', 'ks', 105, 'DEMO-SS-AR12'],
        'sill'      => ['Window sill, sintered stone', 'Parapet, spekaný kameň', 'Ablakpárkány, szinterezett kő', 'm', null, null],
        'desk'      => ['Reception desk, Calacatta quartz 30 mm', 'Recepčný pult, kremeň Calacatta 30 mm', 'Recepciós pult, Calacatta kvarc 30 mm', 'ks', null, null],
        'floor'     => ['Lobby flooring, large-format porcelain', 'Podlaha lobby, veľkoformátový porcelán', 'Előcsarnok padló, nagy formátumú porcelán', 'm²', null, null],
        'counter'   => ['Outdoor kitchen counter', 'Pult vonkajšej kuchyne', 'Kültéri konyhapult', 'ks', null, null],
    ];

    // Documents. lines: [key, qty, unit_price, discount %]  (VAT 20 % on every line)
    // [n, type, leadId, issuedOffset, validDays, status, statusChangedOffset, author, subject[en,sk,hu], location, lines]
    $docs = [
        [1, 'price_offer', demo_id('clients', 1), -140, 30, 'approved', -125, $alex,
            ['Stone cladding of the facade and entrance hall – Villa Slavín', 'Kamenný obklad fasády a vstupnej haly – Vila Slavín', 'Homlokzat és előcsarnok kőburkolata – Vila Slavín'], 'Bratislava',
            [['porc_clad', 180, 68], ['fab', 180, 14.5], ['laser', 1, 350], ['install_m2', 180, 22], ['crane', 1, 950]]],
        [2, 'price_offer', demo_id('clients', 2), -100, 30, 'approved', -96, $jordan,
            ['Kitchen worktop with backsplash, undermount sink', 'Kuchynská doska so zásteny, podstavný drez', 'Konyhai munkalap hátfallal, alulról beépített mosogató'], 'Nitra',
            [['quartz_cw', 9.2, 238], ['fab', 9.2, 96], ['sink', 1, 120], ['hob', 1, 60], ['mitre', 6.4, 28], ['laser', 1, 180], ['install', 1, 320], ['transport', 1, 95]]],
        [3, 'price_offer', demo_id('clients', 6), -55, 30, 'approved', -41, $jordan,
            ['Reception desk, spa wall cladding and lobby flooring', 'Recepčný pult, obklad steny wellness a podlaha lobby', 'Recepciós pult, wellness falburkolat és előcsarnok padló'], 'München',
            [['desk', 1, 4850], ['porc_clad', 64, 118], ['floor', 82, 96], ['laser', 1, 420], ['install', 1, 5200], ['crane', 1, 1350]]],
        [4, 'price_offer', 'lead-3', -50, 30, 'sent', -50, $alex,
            ['Slab supply for the wholesale partner – Calacatta Gold and Nero Marquina', 'Dodávka dosiek pre veľkoobchodného partnera – Calacatta Gold a Nero Marquina', 'Lapszállítás nagykereskedelmi partnernek – Calacatta Gold és Nero Marquina'], 'Košice',
            [['gold', 120, 195, 5], ['marq', 40, 255, 5], ['transport', 1, 780]]],
        [5, 'price_offer', 'lead-2', -18, 30, 'sent', -18, $jordan,
            ['Kitchen worktop 2.4 × 0.6 m with 12 mm backsplash', 'Kuchynská doska 2,4 × 0,6 m so zásterou 12 mm', 'Konyhai munkalap 2,4 × 0,6 m 12 mm-es hátfallal'], 'Trnava',
            [['quartz_cw', 1.44, 238], ['quartz_bs', 1.44, 168], ['fab', 2.88, 96], ['sink', 1, 120], ['mitre', 2.4, 75], ['laser', 1, 180], ['install', 1, 260]]],
        [6, 'price_offer', demo_id('clients', 4), -88, 30, 'approved', -74, $sam,
            ['Showroom tables and window sills in sintered stone', 'Showroomové stoly a parapety zo spekaného kameňa', 'Bemutatótermi asztalok és ablakpárkányok szinterezett kőből'], 'Brno',
            [['table', 4, 1150], ['sill', 14, 96], ['laser', 1, 290], ['transport', 1, 690], ['install', 1, 880]]],
        [7, 'price_offer', demo_id('clients', 8), -1, 30, 'draft', -1, $alex,
            ['Terrace paving and outdoor kitchen counter', 'Dlažba terasy a pult vonkajšej kuchyne', 'Teraszburkolat és kültéri konyhapult'], 'Leipzig',
            [['porc_out', 38, 74], ['counter', 1, 1260], ['fab', 38, 8.9], ['transport', 1, 720]]],
        [8, 'price_offer', demo_id('clients', 7), -7, 30, 'rejected', -3, $sam,
            ['Bathroom vanity top and shower wall cladding', 'Doska pod umývadlo a obklad sprchovacieho kúta', 'Mosdópult és zuhanyfal-burkolat'], 'Žilina',
            [['vanity', 1, 640], ['porc_clad', 8.4, 118], ['sink', 2, 60], ['laser', 1, 140], ['install', 1, 380]]],
        // Proforma (advance) invoices
        [9, 'proforma', demo_id('clients', 1), -135, 14, 'invoiced', -121, $alex,
            ['Advance 50 % – stone cladding Villa Slavín', 'Záloha 50 % – kamenný obklad Vila Slavín', '50 % előleg – Vila Slavín kőburkolat'], 'Bratislava',
            [['@deposit', 1, 10055.00]]],
        [10, 'proforma', demo_id('clients', 6), -40, 14, 'sent', -40, $jordan,
            ['Advance 30 % – reception, spa and lobby', 'Záloha 30 % – recepcia, wellness a lobby', '30 % előleg – recepció, wellness és előcsarnok'], 'München',
            [['@deposit', 1, 8173.20]]],
        // Invoices
        [11, 'invoice', demo_id('clients', 2), -16, 14, 'approved', -10, $jordan,
            ['Invoice – kitchen worktop with backsplash', 'Faktúra – kuchynská doska so zásterou', 'Számla – konyhai munkalap hátfallal'], 'Nitra',
            [['quartz_cw', 9.2, 238], ['fab', 9.2, 96], ['sink', 1, 120], ['hob', 1, 60], ['mitre', 6.4, 28], ['laser', 1, 180], ['install', 1, 320], ['transport', 1, 95]]],
        [12, 'invoice', demo_id('clients', 1), -6, 14, 'sent', -6, $alex,
            ['Invoice – stage 1: slab supply and CNC cutting, less advance', 'Faktúra – 1. etapa: dodávka dosiek a CNC rezanie, po odpočte zálohy', 'Számla – 1. szakasz: lapszállítás és CNC vágás, előleg levonásával'], 'Bratislava',
            [['porc_clad', 180, 68], ['fab', 180, 14.5], ['@advance', 1, -10055.00]]],
    ];

    $titles = [
        'price_offer' => $T(['en' => 'Price offer', 'sk' => 'Cenová ponuka', 'hu' => 'Árajánlat']),
        'proforma'    => $T(['en' => 'Proforma invoice', 'sk' => 'Zálohová faktúra', 'hu' => 'Előlegszámla']),
        'invoice'     => $T(['en' => 'Invoice', 'sk' => 'Faktúra', 'hu' => 'Számla']),
    ];
    $prefix = ['price_offer' => 'CP', 'proforma' => 'ZF', 'invoice' => 'FA'];

    // Generic texts shared by every document.
    $intro = $T(['en' => 'Thank you for your trust. Below you will find the scope, quantities and prices based on our site measurement and your requirements.',
                 'sk' => 'Ďakujeme za dôveru. Nižšie nájdete rozsah, množstvá a ceny na základe nášho zamerania a vašich požiadaviek.',
                 'hu' => 'Köszönjük a bizalmat. Az alábbiakban a felmérésünk és az Ön igényei alapján összeállított terjedelem, mennyiségek és árak olvashatók.']);
    $reassurance = $T(['en' => 'Every slab is checked on receipt and every cut is made on our CNC line, so the result matches the drawing to the millimetre.',
                       'sk' => 'Každú dosku kontrolujeme pri prevzatí a každý rez robíme na našej CNC linke, takže výsledok sedí s výkresom na milimeter.',
                       'hu' => 'Minden lapot átvételkor ellenőrzünk, és minden vágás CNC-soron készül, így az eredmény milliméterre egyezik a rajzzal.']);
    $usp = json_encode([
        ['title' => $T(['en' => 'Laser measurement', 'sk' => 'Laserové zameranie', 'hu' => 'Lézeres felmérés']),
         'subtitle' => $T(['en' => 'Proliner accuracy on site', 'sk' => 'Presnosť Proliner priamo na mieste', 'hu' => 'Proliner pontosság a helyszínen']), 'icon' => 'Ruler'],
        ['title' => $T(['en' => 'Own CNC production', 'sk' => 'Vlastná CNC výroba', 'hu' => 'Saját CNC gyártás']),
         'subtitle' => $T(['en' => 'Cutting, polishing and mitres in-house', 'sk' => 'Rezanie, leštenie a zrezané hrany u nás', 'hu' => 'Vágás, polírozás és gérvágás házon belül']), 'icon' => 'Cpu'],
        ['title' => $T(['en' => 'Installed by our crew', 'sk' => 'Montáž našou čatou', 'hu' => 'Saját szerelőcsapat']),
         'subtitle' => $T(['en' => '10-year warranty on workmanship', 'sk' => '10-ročná záruka na prácu', 'hu' => '10 év garancia a kivitelezésre']), 'icon' => 'ShieldCheck'],
    ], JSON_UNESCAPED_UNICODE);
    $duration = $T(['en' => '2–4 weeks from approval', 'sk' => '2–4 týždne od schválenia', 'hu' => '2–4 hét a jóváhagyástól']);
    $startText = $T(['en' => 'After the laser measurement', 'sk' => 'Po laserovom zameraní', 'hu' => 'A lézeres felmérés után']);
    $warranty = $T(['en' => '10 years', 'sk' => '10 rokov', 'hu' => '10 év']);
    $nextSteps = $T(['en' => 'Confirm the offer by e-mail and we book the measurement and the production slot.',
                     'sk' => 'Potvrďte ponuku e-mailom a my rezervujeme zameranie a výrobný termín.',
                     'hu' => 'Erősítse meg az ajánlatot e-mailben, mi pedig lefoglaljuk a felmérést és a gyártási időpontot.']);
    $closing = $T(['en' => 'We look forward to working with you.', 'sk' => 'Tešíme sa na spoluprácu.', 'hu' => 'Várjuk a közös munkát.']);
    $signOff = $T(['en' => 'The Cstudios stone team', 'sk' => 'Kamenárska čata Cstudios', 'hu' => 'A Cstudios kőmegmunkáló csapata']);
    $greeting = static fn(string $name): string => $T(['en' => "Hello {$name},", 'sk' => "Dobrý deň, {$name},", 'hu' => "Tisztelt {$name},"]);

    // --- Clean own rows --------------------------------------------------------
    $pdo->exec("DELETE FROM `invoice_offer_items` WHERE `id` LIKE 'demo-offers-%' OR `invoice_offer_id` LIKE 'demo-offers-%'");
    $pdo->exec("DELETE FROM `invoices_offers` WHERE `id` LIKE 'demo-offers-%'");
    $pdo->exec("DELETE FROM `timeline_events` WHERE `id` LIKE 'demo-offers-%'");

    // Document numbers: per prefix and year, in issue order.
    $order = $docs;
    usort($order, static fn($a, $b) => $a[3] <=> $b[3]);
    $counters = [];
    $numbers = [];
    foreach ($order as $d) {
        $year = substr(demo_d($d[3]), 0, 4);
        $key = $prefix[$d[1]] . '-' . $year;
        $counters[$key] = ($counters[$key] ?? 0) + 1;
        $numbers[$d[0]] = sprintf('%s-%03d', $key, $counters[$key]);
    }

    $insDoc = $pdo->prepare(
        "INSERT INTO `invoices_offers` (`id`, `document_number`, `type`, `mode`, `lead_id`, `client_id`, `client_name`, `client_email`, `client_phone`,
            `client_street`, `client_city`, `client_postal_code`, `client_country`, `client_ico`, `client_dic`, `client_icdph`,
            `title`, `subject`, `location`, `greeting_note`, `intro_note`, `usp_cards_json`, `reassurance_note`,
            `subtotal`, `vat_amount`, `total_price`, `currency`, `duration_text`, `start_date_text`, `warranty_text`,
            `next_steps_note`, `closing_note`, `sign_off_team`, `status`, `status_changed_at`, `issued_at`, `valid_until`, `due_date`, `created_by`)
         VALUES (?, ?, ?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $insItem = $pdo->prepare(
        "INSERT INTO `invoice_offer_items` (`id`, `invoice_offer_id`, `warehouse_item_id`, `sku`, `name`, `description`, `quantity`, `unit`, `unit_price`, `vat_rate`, `discount_pct`, `total_price`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 20.00, ?, ?)"
    );
    $insEv = $pdo->prepare(
        "INSERT INTO `timeline_events` (`id`, `lead_id`, `type`, `timestamp`, `title`, `content`, `amount`, `file_type`, `author`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $leadStmt = $pdo->prepare("SELECT * FROM `leads` WHERE `id` = ?");

    $lineSeq = 0;
    $evSeq = 0;
    foreach ($docs as $d) {
        [$n, $type, $leadId, $issuedOff, $validDays, $status, $changedOff, $author, $subj, $location, $lines] = $d;
        $leadStmt->execute([$leadId]);
        $lead = $leadStmt->fetch(PDO::FETCH_ASSOC);
        if (!$lead) {
            continue; // the client/lead this document belongs to does not exist
        }
        $docId = demo_id('offers', $n);
        $number = $numbers[$n];
        $issued = demo_d($issuedOff);
        $subject = $T(['en' => $subj[0], 'sk' => $subj[1], 'hu' => $subj[2]]);

        // Lines and totals
        $rows = [];
        $subtotal = 0.0;
        $vat = 0.0;
        $depositSource = $T(['en' => 'stone cladding Villa Slavín', 'sk' => 'kamenný obklad Vila Slavín', 'hu' => 'Vila Slavín kőburkolat']);
        foreach ($lines as $ln) {
            $key = $ln[0];
            $qty = (float)$ln[1];
            $price = (float)$ln[2];
            $disc = (float)($ln[3] ?? 0);
            $whItem = null;
            $sku = null;
            if ($key === '@deposit') {
                $name = $T(['en' => 'Advance payment', 'sk' => 'Zálohová platba', 'hu' => 'Előlegfizetés']);
                $unit = 'ks';
            } elseif ($key === '@advance') {
                $name = $T(['en' => 'Advance deducted (see proforma ' . ($numbers[9] ?? '') . ')', 'sk' => 'Odpočet zálohy (pozri zálohovú faktúru ' . ($numbers[9] ?? '') . ')', 'hu' => 'Levont előleg (lásd előlegszámla ' . ($numbers[9] ?? '') . ')']);
                $unit = 'ks';
            } else {
                $c = $cat[$key];
                $name = $T(['en' => $c[0], 'sk' => $c[1], 'hu' => $c[2]]);
                $unit = $c[3];
                if ($c[4] !== null) {
                    $whItem = demo_id('warehouse', $c[4]);
                    $sku = $c[5];
                }
            }
            $net = demo_offers_round($qty * $price * (100 - $disc) / 100);
            $subtotal += $net;
            $vat += $net * 0.20;
            $rows[] = [$whItem, $sku, $name, $qty, $unit, $price, $disc, $net];
        }
        $subtotal = demo_offers_round($subtotal);
        $vat = demo_offers_round($vat);
        $total = demo_offers_round($subtotal + $vat);

        $isOffer = $type === 'price_offer';
        $valid = $isOffer ? demo_d($issuedOff + $validDays) : null;
        $due = $isOffer ? null : demo_d($issuedOff + $validDays);

        $insDoc->execute([
            $docId, $number, $type, $leadId, $leadId, $lead['name'], $lead['email'], $lead['phone'],
            $lead['street'], $lead['city'], $lead['postal_code'], $lead['country'], $lead['company_id'], $lead['tax_id'], $lead['vat_id'],
            $titles[$type], $subject, $location, $greeting((string)($lead['contact_person'] ?: $lead['name'])), $intro, $usp, $reassurance,
            $subtotal, $vat, $total, $duration, $startText, $warranty,
            $nextSteps, $closing, $signOff, $status, demo_d($changedOff), $issued, $valid, $due, $author,
        ]);
        foreach ($rows as $r) {
            $lineSeq++;
            $insItem->execute([demo_id('offers', 100 + $lineSeq), $docId, $r[0], $r[1], $r[2], null, $r[3], $r[4], $r[5], $r[6], $r[7]]);
        }

        // The announcement on the lead's timeline (what the wizard writes).
        $evSeq++;
        $evType = $isOffer ? 'offer' : ($type === 'proforma' ? 'proforma_invoice' : 'invoice');
        $money = number_format($total, 2, '.', ' ') . ' EUR';
        $insEv->execute([
            demo_id('offers', 2000 + $evSeq), $leadId, $evType, demo_dt($issuedOff, '10:00'),
            $titles[$type] . ' (' . $number . ')',
            $T(['en' => "Document issued for {$money}. Subject: {$subject}",
                'sk' => "Vystavený doklad v hodnote {$money}. Predmet: {$subject}",
                'hu' => "Kiállított bizonylat {$money} értékben. Tárgy: {$subject}"]),
            $total, $isOffer ? 'offer' : 'invoice', $author,
        ]);
    }
}
