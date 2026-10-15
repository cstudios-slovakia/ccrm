<?php
/**
 * Demo seed module: warehouse.
 *
 * Contract (see index.php / helpers.php): idempotent — delete this module's
 * own 'demo-%' rows, then insert. Ids come from demo_id('warehouse', n); dates from
 * demo_d()/demo_dt(); text from demo_t([...], demo_lang($pdo)).
 *
 * This is also the single implementation behind scripts/seed_demo_warehouse.php
 * (the CLI script requires this file and calls demo_seed_warehouse()).
 *
 * Two warehouses, four suppliers, ten items, and ~3 months of documents:
 * receipts (PRI, inward), issues (VYD, outward) and one transfer (PRE). The
 * documents are simulated chronologically in PHP and `warehouse_stock`,
 * `warehouse_batches` and each item's weighted-average purchase price are
 * DERIVED from that simulation, so stock always equals the sum of movements
 * (an inward adds, an outward subtracts, a transfer moves). Money follows
 * WarehouseView.tsx: inward total_price = qty × purchase price; outward
 * total_price = qty × sell price, unit_purchase_price = the item's running
 * average cost; transfers are valued at average cost with zero profit.
 *
 * Issues are filed against the demo clients/leads (movement.lead_id) of the
 * projects they supply. Offers reference the item ids 101-106 (see offers.php).
 *
 * Id plan: 1-2 warehouses, 11-14 suppliers, 101-110 items, 201+ batches,
 * 301+ movements, 401+ movement lines.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

function demo_seed_warehouse(PDO $pdo): void {
    $lang = demo_lang($pdo);
    $T = static fn(array $byLang): string => demo_t($byLang, $lang);
    $uid = demo_user_ids($pdo);
    $mail = ['Alex' => 'alex@crm.com', 'Sam' => 'sam@crm.com', 'Jordan' => 'jordan@crm.com'];
    $wh1 = demo_id('warehouse', 1);
    $wh2 = demo_id('warehouse', 2);
    $c = static fn(int $n): string => demo_id('clients', $n);

    // --- Clean own rows (children first; FKs would otherwise block) --------------
    $pdo->exec("DELETE FROM `warehouse_movement_items` WHERE `id` LIKE 'demo-warehouse-%' OR `movement_id` LIKE 'demo-warehouse-%'");
    $pdo->exec("DELETE FROM `warehouse_movements` WHERE `id` LIKE 'demo-warehouse-%'");
    $pdo->exec("DELETE FROM `warehouse_batches` WHERE `id` LIKE 'demo-warehouse-%'");
    $pdo->exec("DELETE FROM `warehouse_stock` WHERE `warehouse_id` LIKE 'demo-warehouse-%' OR `item_id` LIKE 'demo-warehouse-%'");
    $pdo->exec("DELETE FROM `warehouse_items` WHERE `id` LIKE 'demo-warehouse-%'");
    $pdo->exec("DELETE FROM `suppliers` WHERE `id` LIKE 'demo-warehouse-%'");
    $pdo->exec("DELETE FROM `warehouses` WHERE `id` LIKE 'demo-warehouse-%'");

    // --- Warehouses ---------------------------------------------------------------
    $insWh = $pdo->prepare("INSERT INTO `warehouses` (`id`, `name`, `code`, `address`, `manager_user_id`, `is_default`) VALUES (?, ?, ?, ?, ?, ?)");
    $hasDefault = (int)$pdo->query("SELECT COUNT(*) FROM `warehouses` WHERE `is_default` = 1")->fetchColumn() > 0;
    $insWh->execute([$wh1, $T(['en' => 'Main warehouse Bratislava', 'sk' => 'Hlavný sklad Bratislava', 'hu' => 'Pozsonyi központi raktár']),
        'DEMO-BA-01', 'Vajnorská 142, 831 04 Bratislava', $uid['Sam'], $hasDefault ? 0 : 1]);
    $insWh->execute([$wh2, $T(['en' => 'Production warehouse Trnava', 'sk' => 'Výrobný sklad Trnava', 'hu' => 'Nagyszombati gyártási raktár']),
        'DEMO-TT-01', 'Zavarská 11, 917 01 Trnava', $uid['Jordan'], 0]);

    // --- Suppliers ------------------------------------------------------------------
    $suppliers = [
        [11, 'Laminam Slovakia s.r.o.', '48123456', '2120123456', 'SK2120123456', 'Prievozská 4D', 'Bratislava', '821 09', 'Slovakia',
            'objednavky@laminam.example.com', '+421 905 111 222', 'https://laminam.example.com', 'SK8902000000001234567890', 'SUBASKBX', 14,
            ['Official distributor of large-format ceramic and sintered slabs.', 'Oficiálny distribútor veľkoformátových keramických a spekaných dosiek.', 'Nagy formátumú kerámia- és szinterezettlap-forgalmazó.'],
            [['Peter Kováč', 'Sales director', '+421 905 111 222', 'kovac@laminam.example.com'], ['Lucia Vargová', 'Customer service', '+421 905 111 223', 'vargova@laminam.example.com']]],
        [12, 'Stone Import Verona S.r.l.', 'IT09876543210', 'IT09876543210', 'IT09876543210', 'Via del Marmo 45', 'Verona', '37135', 'Italy',
            'export@stoneverona.example.com', '+39 045 889 900', 'https://stoneverona.example.com', 'IT60X0542811101000000123456', 'UNCRITM1VER', 30,
            ['Natural marble and quartz supplier straight from the Italian quarries.', 'Dodávateľ prírodného mramoru a kremeňa priamo z talianskych lomov.', 'Természetes márvány és kvarc beszállító közvetlenül az olasz bányákból.'],
            [['Marco Rossi', 'Export area manager', '+39 340 123 4567', 'm.rossi@stoneverona.example.com']]],
        [13, 'Mapei Slovensko s.r.o.', '35890123', '2021890123', 'SK2021890123', 'Nádražná 39', 'Ivanka pri Dunaji', '900 28', 'Slovakia',
            'predaj@mapei.example.com', '+421 2 4020 4511', 'https://mapei.example.com', 'SK1211000000002621234567', 'TATRSKBX', 14,
            ['Building chemistry: S1/S2 adhesives and grouts.', 'Stavebná chémia: lepidlá triedy S1/S2 a škárovacie hmoty.', 'Építőipari vegyi anyagok: S1/S2 ragasztók és fugázók.'],
            [['Ing. Ján Novotný', 'Technical representative', '+421 911 333 444', 'j.novotny@mapei.example.com']]],
        [14, 'Diatech Slovakia s.r.o.', '46512309', '2023512309', 'SK2023512309', 'Priemyselná 8', 'Senec', '903 01', 'Slovakia',
            'obchod@diatech.example.com', '+421 905 622 018', 'https://diatech.example.com', 'SK3109000000000012345678', 'GIBASKBX', 21,
            ['Diamond blades, polishing pads and consumables for stone workshops.', 'Diamantové kotúče, leštiace kotúče a spotrebný materiál pre kamenárske dielne.', 'Gyémánttárcsák, polírkorongok és fogyóeszközök kőműhelyeknek.'],
            [['Tomáš Beňo', 'Account manager', '+421 905 622 018', 'beno@diatech.example.com']]],
    ];
    $insSup = $pdo->prepare(
        "INSERT INTO `suppliers` (`id`, `name`, `company_id`, `tax_id`, `vat_id`, `street`, `city`, `postal_code`, `country`, `email`, `phone`, `website`,
            `iban`, `swift`, `payment_due_days`, `notes`, `contacts_json`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    foreach ($suppliers as $s) {
        $contacts = array_map(static fn($k) => ['name' => $k[0], 'position' => $k[1], 'phone' => $k[2], 'email' => $k[3]], $s[16]);
        $insSup->execute([
            demo_id('warehouse', $s[0]), $s[1], $s[2], $s[3], $s[4], $s[5], $s[6], $s[7], $s[8], $s[9], $s[10], $s[11], $s[12], $s[13], $s[14],
            $T(['en' => $s[15][0], 'sk' => $s[15][1], 'hu' => $s[15][2]]), json_encode($contacts, JSON_UNESCAPED_UNICODE),
        ]);
    }

    // --- Items ------------------------------------------------------------------------
    $catSlabs = $T(['en' => 'Slabs', 'sk' => 'Dosky', 'hu' => 'Lapok']);
    $catChem = $T(['en' => 'Building chemistry', 'sk' => 'Stavebná chémia', 'hu' => 'Építőipari vegyi anyagok']);
    $catTools = $T(['en' => 'Tools and consumables', 'sk' => 'Náradie a spotrebný materiál', 'hu' => 'Szerszámok és fogyóeszközök']);
    // [n, sku, name[en,sk,hu], description[en,sk,hu], category, unit[en,sk,hu], min, optimal, location, expires, sell price]
    $items = [
        [101, 'DEMO-QZ-CW20', ['Quartz slab Calacatta White 20 mm', 'Kremenná doska Calacatta White 20 mm', 'Calacatta White kvarclap 20 mm'],
            ['Engineered quartz, polished, 3200×1600 mm.', 'Technický kremeň, leštený, 3200×1600 mm.', 'Mérnöki kvarc, polírozott, 3200×1600 mm.'], $catSlabs, 'm²', 20, 80, 'A-01', 0, 238.0],
        [102, 'DEMO-QZ-CG20', ['Calacatta Gold quartz slab 20 mm', 'Kremenná doska Calacatta Gold 20 mm', 'Calacatta Gold kvarclap 20 mm'],
            ['Warm gold veining, polished, 3200×1600 mm.', 'Teplé zlaté žilkovanie, leštená, 3200×1600 mm.', 'Meleg arany erezet, polírozott, 3200×1600 mm.'], $catSlabs, 'm²', 40, 150, 'A-02', 0, 245.0],
        [103, 'DEMO-MB-NM30', ['Nero Marquina marble slab 30 mm', 'Mramorová doska Nero Marquina 30 mm', 'Nero Marquina márványlap 30 mm'],
            ['Black Spanish marble with white veins, polished.', 'Čierny španielsky mramor s bielymi žilami, leštený.', 'Fekete spanyol márvány fehér erekkel, polírozott.'], $catSlabs, 'm²', 15, 50, 'A-03', 0, 295.0],
        [104, 'DEMO-PO-ST06', ['Porcelain slab 6 mm Statuario, 1600×3200', 'Porcelánová doska 6 mm Statuario, 1600×3200', 'Statuario porcelánlap 6 mm, 1600×3200'],
            ['Thin large-format porcelain for cladding and furniture.', 'Tenký veľkoformátový porcelán na obklady a nábytok.', 'Vékony, nagy formátumú porcelán burkolatokhoz és bútorokhoz.'], $catSlabs, 'm²', 40, 200, 'B-01', 0, 78.0],
        [105, 'DEMO-SS-AR12', ['Sintered stone slab 12 mm Arctic', 'Spekaný kameň 12 mm Arctic', 'Arctic szinterezett kő 12 mm'],
            ['Heat- and scratch-resistant sintered stone.', 'Spekaný kameň odolný voči teplu a poškriabaniu.', 'Hő- és karcálló szinterezett kő.'], $catSlabs, 'm²', 8, 30, 'B-02', 0, 189.0],
        [106, 'DEMO-PO-BA20', ['Outdoor porcelain slab 20 mm Basalt', 'Exteriérová porcelánová doska 20 mm Basalt', 'Basalt kültéri porcelánlap 20 mm'],
            ['Anti-slip 20 mm porcelain for terraces.', 'Protišmyková 20 mm porcelánová doska na terasy.', 'Csúszásmentes 20 mm-es porcelán teraszokhoz.'], $catSlabs, 'm²', 15, 60, 'TT-01', 0, 82.0],
        [107, 'DEMO-CH-KM25', ['Keraflex Maxi S1 adhesive 25 kg', 'Lepidlo Keraflex Maxi S1 25 kg', 'Keraflex Maxi S1 ragasztó 25 kg'],
            ['Deformable cement adhesive for stone and large-format slabs.', 'Deformovateľné cementové lepidlo pre kameň a veľkoformátové dosky.', 'Deformálható cementragasztó kőhöz és nagy formátumú lapokhoz.'], $catChem, 'bag', 30, 120, 'CHEM-02', 1, 24.5],
        [108, 'DEMO-CH-TX01', ['Tenax Ager impregnation 1 L', 'Impregnácia Tenax Ager 1 L', 'Tenax Ager impregnálás 1 L'],
            ['Wet-effect impregnation for polished and honed stone.', 'Impregnácia s efektom mokrého kameňa pre leštený a matný kameň.', 'Nedves hatású impregnálás polírozott és matt kőhöz.'], $catChem, 'pcs', 10, 40, 'CHEM-01', 1, 42.0],
        [109, 'DEMO-TL-DB350', ['Diamond blade 350 mm', 'Diamantový kotúč 350 mm', 'Gyémánttárcsa 350 mm'],
            ['Bridge-saw blade for quartz and porcelain.', 'Kotúč na mostovú pílu pre kremeň a porcelán.', 'Hídfűrész tárcsa kvarchoz és porcelánhoz.'], $catTools, 'pcs', 8, 14, 'TOOL-01', 0, 96.0],
        [110, 'DEMO-CH-EP15', ['Two-component stone epoxy 1.5 kg', 'Dvojzložkové kamenárske epoxidové lepidlo 1,5 kg', 'Kétkomponensű kő epoxi 1,5 kg'],
            ['Colour-matched adhesive for mitred joints.', 'Lepidlo v odtieni kameňa pre zrezané spoje.', 'Színazonos ragasztó a gérvágott illesztésekhez.'], $catChem, 'pcs', 15, 50, 'CHEM-03', 0, 31.0],
    ];
    $itemBy = [];
    foreach ($items as $i) {
        $itemBy[$i[0]] = $i;
    }

    // --- Documents --------------------------------------------------------------------
    // lines: [item n, qty, price, batch key|null]; price = purchase price (inward) or sell price (outward)
    // batches: key => [item n, wh, batch number, expiration offset]
    $batchDefs = [
        'b1' => [107, 1, 'KM-A-' . date('Y') . '-01', 230],
        'b2' => [107, 1, 'KM-A-' . date('Y') . '-02', 18],   // expires soon -> the expiry warning
        'b3' => [108, 1, 'TX-' . date('Y') . '-01', 300],
    ];
    // [day, type, warehouse, other warehouse|supplier n|lead id|null, author, note[en,sk,hu], lines]
    $docs = [
        [-88, 'inward', 1, 12, 'Sam', ['Delivery of Calacatta White and Nero Marquina slabs from Verona.', 'Dodávka dosiek Calacatta White a Nero Marquina z Verony.', 'Calacatta White és Nero Marquina lapok szállítmánya Veronából.'],
            [[101, 60, 118.0], [103, 30, 128.0]]],
        [-86, 'inward', 1, 11, 'Sam', ['Porcelain and sintered slabs for the Villa Slavín cladding and showroom tables.', 'Porcelánové a spekané dosky na obklad Vily Slavín a showroomové stoly.', 'Porcelán- és szinterezett lapok a Vila Slavín burkolathoz és a bemutatótermi asztalokhoz.'],
            [[104, 260, 41.0], [105, 24, 96.0]]],
        [-80, 'inward', 1, 13, 'Jordan', ['Pallet of adhesive and impregnation.', 'Paleta lepidla a impregnácie.', 'Ragasztó és impregnáló raklap.'],
            [[107, 120, 14.2, 'b1'], [108, 36, 22.8, 'b3'], [110, 36, 17.0]]],
        [-70, 'inward', 1, 12, 'Alex', ['Calacatta Gold slabs for the wholesale partner.', 'Dosky Calacatta Gold pre veľkoobchodného partnera.', 'Calacatta Gold lapok a nagykereskedelmi partnernek.'],
            [[102, 140, 112.0]]],
        [-62, 'inward', 2, 11, 'Jordan', ['Outdoor porcelain for the Trnava production warehouse.', 'Exteriérový porcelán pre výrobný sklad Trnava.', 'Kültéri porcelán a nagyszombati gyártási raktárba.'],
            [[106, 70, 44.0]]],
        [-60, 'outward', 1, $c(1), 'Alex', ['Villa Slavín, stage 1: cladding slabs and adhesive.', 'Vila Slavín, 1. etapa: obkladové dosky a lepidlo.', 'Vila Slavín, 1. szakasz: burkolólapok és ragasztó.'],
            [[104, 90, 78.0], [107, 40, 24.5, 'b1'], [110, 14, 31.0]]],
        [-50, 'transfer', 1, 2, 'Jordan', ['Slabs moved to the Trnava workshop for CNC cutting.', 'Dosky presunuté do dielne v Trnave na CNC rezanie.', 'Lapok átvitele a nagyszombati műhelybe CNC vágásra.'],
            [[104, 60, 0.0], [101, 12, 0.0]]],
        [-48, 'outward', 1, $c(2), 'Jordan', ['Horváthová kitchen: Calacatta White worktop and epoxy.', 'Kuchyňa Horváthová: pracovná doska Calacatta White a epoxid.', 'Horváthová konyha: Calacatta White munkalap és epoxi.'],
            [[101, 9.6, 238.0], [110, 2, 31.0]]],
        [-45, 'inward', 1, 14, 'Sam', ['Blades for the CNC line.', 'Kotúče pre CNC linku.', 'Tárcsák a CNC-sorhoz.'],
            [[109, 7, 58.0]]],
        [-40, 'outward', 1, $c(1), 'Alex', ['Villa Slavín, stage 2: cladding, adhesive and impregnation.', 'Vila Slavín, 2. etapa: obklad, lepidlo a impregnácia.', 'Vila Slavín, 2. szakasz: burkolat, ragasztó és impregnálás.'],
            [[104, 80, 78.0], [108, 6, 42.0, 'b3'], [107, 30, 24.5, 'b1'], [110, 14, 31.0]]],
        [-33, 'inward', 1, 13, 'Jordan', ['Second adhesive delivery, short shelf life.', 'Druhá dodávka lepidla, krátka expirácia.', 'Második ragasztószállítmány, rövid szavatossági idővel.'],
            [[107, 80, 14.6, 'b2']]],
        [-30, 'outward', 1, $c(4), 'Sam', ['Interiéry Dvořák: sintered stone for tables and sills.', 'Interiéry Dvořák: spekaný kameň na stoly a parapety.', 'Interiéry Dvořák: szinterezett kő asztalokhoz és párkányokhoz.'],
            [[105, 14, 189.0]]],
        [-25, 'outward', 2, $c(3), 'Sam', ['KitchenLine Studio: outdoor porcelain for a terrace job.', 'KitchenLine Studio: exteriérový porcelán na terasu.', 'KitchenLine Studio: kültéri porcelán egy teraszmunkához.'],
            [[106, 24, 82.0]]],
        [-22, 'outward', 1, $c(3), 'Alex', ['KitchenLine Studio: Calacatta Gold slabs for partner jobs.', 'KitchenLine Studio: dosky Calacatta Gold na partnerské zákazky.', 'KitchenLine Studio: Calacatta Gold lapok partnermunkákhoz.'],
            [[102, 24, 245.0]]],
        [-20, 'inward', 1, 12, 'Alex', ['Top-up of Calacatta White slabs.', 'Doplnenie dosiek Calacatta White.', 'Calacatta White lapok utánpótlása.'],
            [[101, 25, 121.0]]],
        [-12, 'outward', 1, $c(5), 'Alex', ['Kovács: quartz for the Győr vanity tops.', 'Kovács: kremeň na dosky pod umývadlá Győr.', 'Kovács: kvarc a győri mosdópultokhoz.'],
            [[101, 12, 238.0]]],
        [-9, 'inward', 2, 11, 'Jordan', ['More cladding porcelain for the Trnava workshop.', 'Ďalší obkladový porcelán do dielne v Trnave.', 'További burkolóporcelán a nagyszombati műhelybe.'],
            [[104, 40, 41.5]]],
        [-6, 'outward', 1, 'lead-1', 'Sam', ['Novák showroom: Nero Marquina marble and adhesive.', 'Showroom Novák: mramor Nero Marquina a lepidlo.', 'Novák bemutatóterem: Nero Marquina márvány és ragasztó.'],
            [[103, 20, 295.0], [107, 12, 24.5, 'b1']]],
        [-3, 'outward', 1, $c(6), 'Jordan', ['Hotel Alpenblick: slab samples for the reception desk.', 'Hotel Alpenblick: vzorky dosiek na recepčný pult.', 'Hotel Alpenblick: lapminták a recepciós pulthoz.'],
            [[102, 1.5, 245.0]]],
    ];
    usort($docs, static fn($a, $b) => $a[0] <=> $b[0]);

    // --- Simulation: stock, batches, running average cost, document numbers -----------
    $stock = [];          // [wh n][item n] => qty
    $onHand = [];         // item n => qty across warehouses
    $avg = [];            // item n => running weighted-average purchase price
    $last = [];           // item n => last purchase price
    $batchQty = [];       // batch key => ['initial' =>, 'current' =>, 'price' =>]
    $seqByKey = [];
    $prepared = [];
    $lineSeq = 0;
    foreach ($docs as $mi => $d) {
        [$off, $type, $whN, $other, $author, $note, $lines] = $d;
        $prefix = ['inward' => 'PRI', 'outward' => 'VYD', 'transfer' => 'PRE'][$type];
        $key = $prefix . '-' . substr(demo_d($off), 0, 4);
        $seqByKey[$key] = ($seqByKey[$key] ?? 0) + 1;
        $number = sprintf('%s-%04d', $key, $seqByKey[$key]);

        $cost = 0.0;
        $sell = 0.0;
        $rows = [];
        foreach ($lines as $ln) {
            $item = $ln[0];
            $qty = (float)$ln[1];
            $price = (float)$ln[2];
            $batchKey = $ln[3] ?? null;
            $batchId = $batchKey ? demo_id('warehouse', 200 + (int)substr($batchKey, 1)) : null;
            $defaultSell = (float)$itemBy[$item][10];
            if ($type === 'inward') {
                $total = $qty * $price;
                $cost += $total;
                $newOn = ($onHand[$item] ?? 0) + $qty;
                $avg[$item] = $newOn > 0 ? (($onHand[$item] ?? 0) * ($avg[$item] ?? $price) + $qty * $price) / $newOn : $price;
                $onHand[$item] = $newOn;
                $last[$item] = $price;
                $stock[$whN][$item] = ($stock[$whN][$item] ?? 0) + $qty;
                if ($batchKey) {
                    $batchQty[$batchKey] = ['initial' => ($batchQty[$batchKey]['initial'] ?? 0) + $qty, 'current' => ($batchQty[$batchKey]['current'] ?? 0) + $qty, 'price' => $price];
                }
                $rows[] = [$item, $batchId, $qty, $price, $defaultSell, round($total, 2)];
            } elseif ($type === 'outward') {
                $unitCost = round($avg[$item] ?? 0, 4);
                $total = $qty * $price;
                $cost += $qty * $unitCost;
                $sell += $total;
                $stock[$whN][$item] = ($stock[$whN][$item] ?? 0) - $qty;
                $onHand[$item] = ($onHand[$item] ?? 0) - $qty;
                if ($batchKey) {
                    $batchQty[$batchKey]['current'] -= $qty;
                }
                $rows[] = [$item, $batchId, $qty, $unitCost, $price, round($total, 2)];
            } else { // transfer: $other is the target warehouse n
                $unitCost = round($avg[$item] ?? 0, 4);
                $cost += $qty * $unitCost;
                $stock[$whN][$item] = ($stock[$whN][$item] ?? 0) - $qty;
                $stock[$other][$item] = ($stock[$other][$item] ?? 0) + $qty;
                $rows[] = [$item, null, $qty, $unitCost, $defaultSell, round($qty * $unitCost, 2)];
            }
            if (($stock[$whN][$item] ?? 0) < -0.0001) {
                throw new \RuntimeException("Demo warehouse data would drive item {$item} negative in warehouse {$whN} at {$number}.");
            }
        }
        $prepared[] = [$mi, $off, $type, $whN, $other, $author, $note, $number, $rows, round($cost, 2), round($sell, 2)];
    }

    // --- Items (with the average and last prices the simulation ended on) ---------------
    $insItem = $pdo->prepare(
        "INSERT INTO `warehouse_items` (`id`, `sku`, `barcode`, `name`, `description`, `category`, `unit`, `min_stock`, `optimal_stock`, `default_location`,
            `has_expiration`, `default_sell_price`, `avg_purchase_price`, `last_purchase_price`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $unitNames = [
        'm²' => 'm²',
        'bag' => $T(['en' => 'bag', 'sk' => 'balenie', 'hu' => 'zsák']),
        'pcs' => $T(['en' => 'pcs', 'sk' => 'ks', 'hu' => 'db']),
    ];
    foreach ($items as $i) {
        $n = $i[0];
        $insItem->execute([
            demo_id('warehouse', $n), $i[1], '85880' . str_pad((string)$n, 7, '0', STR_PAD_LEFT),
            $T(['en' => $i[2][0], 'sk' => $i[2][1], 'hu' => $i[2][2]]), $T(['en' => $i[3][0], 'sk' => $i[3][1], 'hu' => $i[3][2]]),
            $i[4], $unitNames[$i[5]], $i[6], $i[7], $i[8], $i[9], $i[10], round($avg[$n] ?? 0, 4), round($last[$n] ?? 0, 4),
        ]);
    }

    // --- Batches ---------------------------------------------------------------------------
    $insBatch = $pdo->prepare(
        "INSERT INTO `warehouse_batches` (`id`, `item_id`, `warehouse_id`, `batch_number`, `expiration_date`, `initial_quantity`, `current_quantity`, `purchase_price`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $batchExp = [];
    foreach ($batchDefs as $key => [$itemN, $whN, $number, $expOff]) {
        $batchExp[$key] = demo_d($expOff);
        $q = $batchQty[$key] ?? ['initial' => 0, 'current' => 0, 'price' => 0];
        $insBatch->execute([demo_id('warehouse', 200 + (int)substr($key, 1)), demo_id('warehouse', $itemN), demo_id('warehouse', $whN), $number, $batchExp[$key],
            $q['initial'], max(0, $q['current']), $q['price']]);
    }

    // --- Stock (derived) -----------------------------------------------------------------------
    $reserved = ['1,101' => 15.0, '1,104' => 25.0, '1,103' => 4.0];
    $insStock = $pdo->prepare(
        "INSERT INTO `warehouse_stock` (`warehouse_id`, `item_id`, `quantity`, `reserved_quantity`, `location`) VALUES (?, ?, ?, ?, ?)"
    );
    foreach ($stock as $whN => $byItem) {
        foreach ($byItem as $itemN => $qty) {
            if ($qty <= 0.00001) {
                continue;
            }
            $loc = $whN === 2 ? 'TT-' . $itemBy[$itemN][8] : $itemBy[$itemN][8];
            $res = min($qty, $reserved[$whN . ',' . $itemN] ?? 0.0);
            $insStock->execute([demo_id('warehouse', $whN), demo_id('warehouse', $itemN), round($qty, 4), $res, $loc]);
        }
    }

    // --- Movements and lines -------------------------------------------------------------------------
    $insMov = $pdo->prepare(
        "INSERT INTO `warehouse_movements` (`id`, `document_number`, `type`, `status`, `warehouse_id`, `target_warehouse_id`, `supplier_id`, `lead_id`,
            `total_cost_value`, `total_sell_value`, `total_profit_value`, `created_by`, `note`, `issued_at`)
         VALUES (?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $insLine = $pdo->prepare(
        "INSERT INTO `warehouse_movement_items` (`id`, `movement_id`, `item_id`, `batch_id`, `quantity`, `unit_purchase_price`, `unit_sell_price`, `total_price`, `expiration_date`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $batchKeyById = [];
    foreach (array_keys($batchDefs) as $k) {
        $batchKeyById[demo_id('warehouse', 200 + (int)substr($k, 1))] = $k;
    }
    foreach ($prepared as [$mi, $off, $type, $whN, $other, $author, $note, $number, $rows, $cost, $sell]) {
        $movId = demo_id('warehouse', 301 + $mi);
        $supplier = $type === 'inward' ? demo_id('warehouse', $other) : null;
        $target = $type === 'transfer' ? demo_id('warehouse', $other) : null;
        $lead = null;
        if ($type === 'outward' && is_string($other) && demo_row_exists($pdo, 'leads', $other)) {
            $lead = $other;
        }
        $insMov->execute([
            $movId, $number, $type, demo_id('warehouse', $whN), $target, $supplier, $lead,
            $cost, $type === 'outward' ? $sell : ($type === 'transfer' ? $cost : 0), $type === 'outward' ? round($sell - $cost, 2) : 0,
            $mail[$author], $T(['en' => $note[0], 'sk' => $note[1], 'hu' => $note[2]]), demo_dt($off, sprintf('%02d:%02d', 8 + ($mi % 8), ($mi * 7) % 60)),
        ]);
        foreach ($rows as [$itemN, $batchId, $qty, $unitPurchase, $unitSell, $total]) {
            $lineSeq++;
            $exp = ($batchId !== null && isset($batchKeyById[$batchId])) ? $batchExp[$batchKeyById[$batchId]] : null;
            $insLine->execute([demo_id('warehouse', 400 + $lineSeq), $movId, demo_id('warehouse', $itemN), $batchId, $qty, $unitPurchase, $unitSell, $total, $exp]);
        }
    }
}
