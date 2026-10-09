<?php
/**
 * Demo seed module: tasks.
 *
 * Contract (see index.php / helpers.php): idempotent — delete this module's
 * own 'demo-%' rows, then insert. Ids come from demo_id('tasks', n); dates from
 * demo_d()/demo_dt(); text from demo_t([...], demo_lang($pdo)).
 *
 * 22 tasks: 8 owned by Alex, 7 by Sam, 7 by Jordan (the three demo tasks from
 * setup.php are left alone). `owner` is the primary assignee's NAME and
 * `task_assignees` lists everyone responsible — the Tasks board filters on the
 * latter. Statuses are the instance's own task states (TASK_STATES), so they
 * land in real board columns. Deadlines span overdue, today, this week and next
 * week; done tasks carry completed_by/completed_at like the board writes them.
 */
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/lookup.php';

function demo_seed_tasks(PDO $pdo): void {
    $lang = demo_lang($pdo);
    $T = static fn(array $byLang): string => demo_t($byLang, $lang);
    [$alex, $sam, $jordan] = demo_user_names();
    $states = demo_task_states($pdo);

    $pdo->exec("DELETE FROM `task_assignees` WHERE `task_id` LIKE 'demo-tasks-%'");
    $pdo->exec("DELETE FROM `tasks` WHERE `id` LIKE 'demo-tasks-%'");

    $c = static fn(int $n): string => demo_id('clients', $n);
    $p = static fn(int $n): string => demo_id('projects', $n);

    // [n, [en, sk, hu] title, [en, sk, hu] description, priority, deadline offset, time, state, owner, extra assignees,
    //  lead id, project id, locking, created by]
    $tasks = [
        // --- Alex ---------------------------------------------------------------
        [1, ['Order slabs for Villa Slavín, stage 2', 'Objednať dosky pre Vilu Slavín, 2. etapa', 'Lapok rendelése a Vila Slavín 2. szakaszához'],
            ['Confirm the quantity with the CNC plan and place the order with the importer.', 'Potvrdiť množstvo podľa CNC plánu a poslať objednávku importérovi.', 'A mennyiség egyeztetése a CNC tervvel, majd a rendelés leadása az importőrnek.'],
            'high', 2, '10:00', 'progress', $alex, [], $c(1), $p(1), 0, $alex],
        [2, ['Send a revised offer to Thomas Müller', 'Poslať upravenú ponuku Thomasovi Müllerovi', 'Módosított ajánlat küldése Thomas Müllernek'],
            ['The first offer has expired. Refresh the prices, keep the 5 % volume discount and extend the validity.', 'Prvá ponuka vypršala. Aktualizovať ceny, ponechať 5 % zľavu z objemu a predĺžiť platnosť.', 'Az első ajánlat lejárt. Frissítsd az árakat, tartsd a 5 % mennyiségi kedvezményt és hosszabbítsd meg az érvényességet.'],
            'high', -3, '12:00', 'new', $alex, [], 'lead-3', null, 1, $alex],
        [3, ['Chase the open invoice – Vila Slavín', 'Upomenúť otvorenú faktúru – Vila Slavín', 'Nyitott számla sürgetése – Vila Slavín'],
            ['The interim invoice is due soon. Call accounting at the developer and confirm the payment date.', 'Priebežná faktúra sa blíži k splatnosti. Zavolať do účtovníctva developera a potvrdiť dátum platby.', 'A részszámla hamarosan esedékes. Hívd a fejlesztő könyvelését és erősítsd meg a fizetési dátumot.'],
            'medium', 0, '15:00', 'new', $alex, [], $c(1), $p(1), 0, $alex],
        [4, ['Prepare shop drawings for the hotel reception desk', 'Pripraviť dielenské výkresy recepčného pultu', 'Műhelyrajzok készítése a hotel recepciós pultjához'],
            ['Draw the 30 mm Calacatta desk with the mitred corners and send it to the hotel architect.', 'Nakresliť 30 mm pult Calacatta so zrezanými rohmi a poslať architektovi hotela.', 'Rajzold meg a 30 mm-es Calacatta pultot gérvágott sarkokkal, és küldd el a hotel építészének.'],
            'medium', 6, '16:00', 'progress', $alex, [], $c(6), $p(3), 0, $alex],
        [5, ['Call Sandra Weber about the terrace draft offer', 'Zavolať Sandre Weber ohľadom konceptu ponuky na terasu', 'Sandra Weber hívása a teraszajánlat tervezetéről'],
            ['Check the terrace area and decide whether we send the draft as it is.', 'Overiť plochu terasy a rozhodnúť, či koncept pošleme tak, ako je.', 'Ellenőrizd a terasz méretét, és döntsd el, hogy a tervezetet így küldjük-e.'],
            'medium', 1, '09:30', 'new', $alex, [], $c(8), null, 0, $alex],
        [6, ['Hotel Alpenblick – agree the laser measurement date', 'Hotel Alpenblick – dohodnúť termín laserového zamerania', 'Hotel Alpenblick – lézeres felmérés időpontjának egyeztetése'],
            ['Book the Proliner and the van for Munich together with the hotel manager.', 'Rezervovať Proliner a dodávku do Mníchova spolu s manažérkou hotela.', 'Foglald le a Prolinert és a szállítót Münchenre a hotel vezetőjével együtt.'],
            'high', 9, '11:00', 'new', $alex, [$jordan], $c(6), $p(3), 0, $jordan],
        [7, ['Review supplier prices for next quarter', 'Prehodnotiť ceny dodávateľov na budúci štvrťrok', 'Beszállítói árak felülvizsgálata a következő negyedévre'],
            ['Compare the three slab importers and update the default sell prices in the warehouse.', 'Porovnať troch importérov dosiek a aktualizovať predajné ceny v sklade.', 'Hasonlítsd össze a három lapimportőrt, és frissítsd az eladási árakat a raktárban.'],
            'low', 12, '14:00', 'new', $alex, [], null, null, 0, $alex],
        [8, ['Close the Novák showroom offer', 'Uzavrieť ponuku pre showroom Novák', 'A Novák bemutatótermi ajánlat lezárása'],
            ['Offer accepted by phone; paperwork filed.', 'Ponuka potvrdená telefonicky; dokumenty založené.', 'Az ajánlatot telefonon elfogadták; a papírok lerakva.'],
            'medium', -10, '12:00', 'done', $alex, [], 'lead-1', null, 0, $alex],

        // --- Sam ----------------------------------------------------------------
        [9, ['Schedule the install crew for the Novák showroom', 'Naplánovať montážnu čatu pre showroom Novák', 'A szerelőcsapat beosztása a Novák bemutatóterembe'],
            ['Two installers for two days; the marble must be on site the day before.', 'Dvaja montéri na dva dni; mramor musí byť na mieste deň vopred.', 'Két szerelő két napra; a márványnak egy nappal előbb a helyszínen kell lennie.'],
            'high', 4, '08:00', 'new', $sam, [], 'lead-1', $p(5), 0, $sam],
        [10, ['Agree the sill profile with Interiéry Dvořák', 'Dohodnúť profil parapetov s Interiéry Dvořák', 'Párkányprofil egyeztetése az Interiéry Dvořákkal'],
            ['The project is on hold until the client picks one of two profiles. Send both samples.', 'Projekt čaká, kým klient nevyberie jeden z dvoch profilov. Poslať obe vzorky.', 'A projekt addig áll, amíg az ügyfél nem választ a két profil közül. Küldd el mindkét mintát.'],
            'high', -2, '13:00', 'blocked', $sam, [], $c(4), $p(4), 1, $sam],
        [11, ['Call Peter Baláž – why was the offer rejected?', 'Zavolať Petrovi Balážovi – prečo bola ponuka zamietnutá?', 'Baláž Péter hívása – miért utasította el az ajánlatot?'],
            ['Ask about price versus material; offer a ceramic alternative if price was the reason.', 'Opýtať sa na cenu verzus materiál; ak išlo o cenu, ponúknuť keramickú alternatívu.', 'Kérdezd meg, az ár vagy az anyag volt-e a gond; ha az ár, ajánlj kerámia alternatívát.'],
            'low', 0, '16:30', 'new', $sam, [], $c(7), null, 0, $sam],
        [12, ['Check the CNC cutting plan for Villa Slavín', 'Skontrolovať plán CNC rezania pre Vilu Slavín', 'A Vila Slavín CNC vágási tervének ellenőrzése'],
            ['Nest the remaining slabs to keep the offcuts under 8 %.', 'Rozložiť zvyšné dosky tak, aby odrezky boli pod 8 %.', 'Terítsd el a maradék lapokat úgy, hogy a hulladék 8 % alatt maradjon.'],
            'medium', 1, '09:00', 'progress', $sam, [$alex], $c(1), $p(1), 0, $alex],
        [13, ['KitchenLine – worktop volume forecast', 'KitchenLine – prognóza objemu pracovných dosiek', 'KitchenLine – munkalap-mennyiség előrejelzése'],
            ['Agree the expected jobs per month so we can reserve slab stock and the CNC line.', 'Dohodnúť očakávaný počet zákaziek mesačne, aby sme mohli rezervovať dosky a CNC linku.', 'Egyeztessétek a havi várható munkák számát, hogy lefoglalhassuk a lapkészletet és a CNC-sort.'],
            'medium', 8, '10:00', 'new', $sam, [], $c(3), null, 0, $sam],
        [14, ['Order adhesive and diamond blades', 'Objednať lepidlo a diamantové kotúče', 'Ragasztó és gyémánttárcsák rendelése'],
            ['Stock is below the minimum. Order from the usual supplier before the next installation.', 'Zásoba je pod minimom. Objednať u bežného dodávateľa pred ďalšou montážou.', 'A készlet a minimum alatt van. Rendeld meg a szokásos beszállítótól a következő beépítés előtt.'],
            'low', -1, '11:00', 'progress', $sam, [], null, null, 0, $sam],
        [15, ['Send the sample board to Peter Baláž', 'Poslať vzorkovník Petrovi Balážovi', 'Mintatábla küldése Baláž Péternek'],
            ['Sent by post with the catalogue.', 'Odoslané poštou spolu s katalógom.', 'Postán elküldve a katalógussal együtt.'],
            'low', -5, '15:00', 'done', $sam, [], $c(7), null, 0, $sam],

        // --- Jordan -------------------------------------------------------------
        [16, ['Follow up on Martina Kováčová\'s revised quote', 'Doriešiť upravenú ponuku Martiny Kováčovej', 'Kováčová Martina módosított ajánlatának követése'],
            ['She wanted to confirm by Friday; call if nothing arrives and keep the laser measurement slot.', 'Mala potvrdiť do piatku; ak nepríde nič, zavolať a podržať termín laserového zamerania.', 'Péntekig akart visszaigazolni; ha nem jön semmi, hívd fel, és tartsd az időpontot a lézeres felmérésre.'],
            'high', 1, '11:00', 'new', $jordan, [], 'lead-2', null, 1, $jordan],
        [17, ['Final photos of the Horváthová kitchen', 'Záverečné fotky kuchyne Horváthová', 'A Horváthová konyha záró fotói'],
            ['Photograph the finished worktop for the portfolio (client agreed).', 'Odfotiť hotovú dosku pre portfólio (klientka súhlasila).', 'Fotózd le a kész munkalapot a portfóliónak (az ügyfél beleegyezett).'],
            'low', -16, '14:00', 'done', $jordan, [], $c(2), $p(2), 0, $jordan],
        [18, ['Ask Andrea Horváthová for a review', 'Požiadať Andreu Horváthovú o recenziu', 'Értékelés kérése Horváthová Andreától'],
            ['A short Google review would help; send the link by e-mail.', 'Krátka recenzia na Google by pomohla; poslať odkaz e-mailom.', 'Egy rövid Google-értékelés sokat segítene; küldd el a linket e-mailben.'],
            'low', 5, '10:30', 'new', $jordan, [], $c(2), null, 0, $jordan],
        [19, ['Plan crane and transport for the Munich delivery', 'Naplánovať žeriav a dopravu na dodávku do Mníchova', 'Daru és szállítás tervezése a müncheni szállításhoz'],
            ['Check road limits for 3.2 m slabs and book the crane with the hotel.', 'Overiť cestné obmedzenia pre dosky 3,2 m a rezervovať žeriav s hotelom.', 'Ellenőrizd az útkorlátozásokat a 3,2 m-es lapokhoz, és foglald le a darut a hotellel.'],
            'high', 14, '09:00', 'new', $jordan, [$sam], $c(6), $p(3), 0, $jordan],
        [20, ['Advance invoice reminder – Hotel Alpenblick', 'Upomienka zálohovej faktúry – Hotel Alpenblick', 'Előlegszámla emlékeztető – Hotel Alpenblick'],
            ['The 30 % advance is overdue. Send a friendly reminder before the production slot is released.', 'Záloha 30 % je po splatnosti. Poslať priateľskú upomienku skôr, než uvoľníme výrobný termín.', 'A 30 % előleg lejárt. Küldj egy barátságos emlékeztetőt, mielőtt felszabadítjuk a gyártási időpontot.'],
            'high', -6, '10:00', 'progress', $jordan, [], $c(6), $p(3), 1, $jordan],
        [21, ['Prepare the phase 2 quote for Kovács', 'Pripraviť ponuku fázy 2 pre Kovács', 'A Kovács 2. fázisú ajánlatának elkészítése'],
            ['Six more vanity tops and 52 m² of wall cladding for the Győr renovations.', 'Ďalších šesť dosiek pod umývadlá a 52 m² obkladu pre rekonštrukcie v Győri.', 'Még hat mosdópult és 52 m² falburkolat a győri felújításokhoz.'],
            'medium', 7, '13:00', 'new', $jordan, [], $c(5), null, 0, $jordan],
        [22, ['Material check for the Győr vanity tops', 'Kontrola materiálu pre dosky pod umývadlá Győr', 'Anyagellenőrzés a győri mosdópultokhoz'],
            ['Count the quartz offcuts in stock and confirm they cover the six tops.', 'Spočítať kremenné odrezky na sklade a potvrdiť, že pokryjú šesť dosiek.', 'Számold meg a raktári kvarcmaradékokat, és ellenőrizd, hogy fedezik-e a hat pultot.'],
            'medium', 0, '13:00', 'progress', $jordan, [], $c(5), null, 0, $jordan],
    ];

    $ins = $pdo->prepare(
        "INSERT INTO `tasks` (`id`, `title`, `description`, `priority`, `start_date`, `deadline`, `deadline_time`, `status`, `owner`, `created_by`,
            `related_lead_id`, `related_project_id`, `is_locking`, `archived`, `completed_by`, `completed_at`, `created_at`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)"
    );
    $insAss = $pdo->prepare("INSERT IGNORE INTO `task_assignees` (`task_id`, `user_name`) VALUES (?, ?)");

    foreach ($tasks as $t) {
        [$n, $title, $desc, $prio, $off, $time, $state, $owner, $extra, $leadId, $projId, $lock, $createdBy] = $t;
        $id = demo_id('tasks', $n);
        $lead = ($leadId !== null && demo_row_exists($pdo, 'leads', $leadId)) ? $leadId : null;
        $proj = ($projId !== null && demo_table_exists($pdo, 'projects') && demo_row_exists($pdo, 'projects', $projId)) ? $projId : null;
        $done = $state === 'done';
        $completedAt = $done ? demo_d($off) . ' ' . $time : null;
        $ins->execute([
            $id, $T(['en' => $title[0], 'sk' => $title[1], 'hu' => $title[2]]), $T(['en' => $desc[0], 'sk' => $desc[1], 'hu' => $desc[2]]),
            $prio, demo_d(min($off, 0) - 4), demo_d($off), $time, $states[$state], $owner, $createdBy, $lead, $proj, $lock,
            $done ? $owner : null, $completedAt, demo_dt(min($off, -1) - 6, '09:00'),
        ]);
        foreach (array_merge([$owner], $extra) as $who) {
            $insAss->execute([$id, $who]);
        }
    }
}
