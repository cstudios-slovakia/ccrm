<?php
/**
 * Tickets pack, magyar kiadás: a C6 támogatási szerződés és a D7 öt szerviz-jegye.
 *
 * Csak adat (lásd a szerződést a demo_seed/index.php-ban). Ugyanazok a kulcsok, listahosszok és
 * számok, mint a packs/en/tickets.php és packs/sk/tickets.php fájlban; csak a szövegek térnek el.
 *
 * A T1..T5 jegyek a demo-tickets-1..5 azonosítók (más modulok ezekkel hivatkoznak rájuk, pl. az
 * időmérés). A nem kötelező blokkok null értékűek, ha hiányoznak: 'response' (első válasz),
 * 'resolved', 'closed', 'satisfaction' (CSAT) és 'task' (a jegyhez kapcsolt CRM-feladat).
 */
return [
    'contract' => [
        'client' => 'C6', 'project' => 'P3', 'tier' => 'pro', 'monthlyHours' => 2.0, 'hourlyRateEur' => 65.0,
        'fromDay' => -120, 'untilDay' => 245,
        'notes' => 'Éves karbantartási szerződés a szállodának: két újraimpregnálási kiszállás az előcsarnok padlójára és a wellness-fal burkolatára, valamint garanciális támogatás elsőbbségi válaszidővel.',
    ],

    'tickets' => [

        'T1' => [
            'client' => 'C2', 'project' => 'P2', 'assignee' => 'pm', 'status' => 'open', 'priority' => 'normal', 'type' => 'incident', 'source' => 'email',
            'createdDay' => -3, 'createdTime' => '15:20',
            'response' => ['day' => -3, 'time' => '16:40'], 'resolved' => null, 'closed' => null, 'satisfaction' => null,
            'title' => 'Apró kiszakadás a munkalap szélén a mosogatógép mellett',
            'description' => 'A fehér kvarc munkalap elülső élén, közvetlenül a mosogatógép mellett egy apró, kb. 5 mm-es kiszakadás keletkezett. Nem mély, de szeretném garanciában javíttatni.',
            'tags' => ['garancia', 'él', 'javítás'],
            'watchers' => ['owner'],
            'messages' => [
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -3, 'time' => '15:20', 'body' => 'Jó napot kívánok! A munkalap szélén a mosogatógép mellett egy apró kiszakadás keletkezett, mellékelem a fotót. Javítható garanciában?'],
                ['from' => 'agent', 'user' => 'pm', 'internal' => 0, 'day' => -3, 'time' => '16:40', 'body' => 'Tisztelt {contact:C2}! Köszönjük a fotót, a javításra garancia vonatkozik. Szerelőnk {wd:2} érkezik az él javítására, kb. egy óráig tart, és utána nyoma sem lesz.'],
                ['from' => 'agent', 'user' => 'pm', 'internal' => 1, 'day' => -2, 'time' => '09:10', 'body' => 'A Calacatta kvarchoz színre keverve a javítógyanta a műhelyben van. {user:pm} egyezteti az időpontot az ügyféllel; a készletet {user:E4} viszi.'],
            ],
            'time' => [
                ['user' => 'pm', 'minutes' => 30, 'billable' => 0, 'day' => -3, 'note' => 'Fotó átnézése és garanciaellenőrzés'],
                ['user' => 'pm', 'minutes' => 45, 'billable' => 0, 'day' => -2, 'note' => 'Gyanta a laphoz igazítva, kiszállás tervezve'],
            ],
            'task' => ['owner' => 'pm', 'status' => 'progress', 'priority' => 'medium', 'deadlineDay' => 2, 'deadlineTime' => '10:00', 'title' => 'Élkiszakadás javítása: {client:C2}', 'description' => 'Garanciális javítás: apró kiszakadás az elülső élen a mosogatógépnél. Vidd a színre kevert gyantakészletet, javítsd a helyszínen (kb. 1 óra), és az eredményt fotózd le a jegyhez.'],
        ],

        'T2' => [
            'client' => 'C1', 'project' => 'P1', 'assignee' => 'pm', 'status' => 'closed', 'priority' => 'normal', 'type' => 'feature_request', 'source' => 'email',
            'createdDay' => -9, 'createdTime' => '08:50',
            'response' => ['day' => -9, 'time' => '09:20'], 'resolved' => ['day' => -8, 'time' => '14:30'], 'closed' => ['day' => -6, 'time' => '10:00'],
            'satisfaction' => ['score' => 5, 'comment' => 'Gyors és érthető volt, a rajzot még aznap javították.'],
            'title' => 'A főzőlap kivágását a rajzon 560-ról 564 mm-re kell módosítani',
            'description' => 'A készülék gyártója új beépítési lapot küldött a mintavilla főzőlapjához. Kérjük, a lap vágása előtt módosítsák a kivágás szélességét a rajzon 560 mm-ről 564 mm-re.',
            'tags' => ['rajz', 'kivágás', 'gyártás'],
            'watchers' => [],
            'messages' => [
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -9, 'time' => '08:50', 'body' => 'Jó reggelt! Mellékelem a főzőlap új beépítési lapját. Kérem, módosítsák a kivágást 560-ról 564 mm-re, és erősítsék meg.'],
                ['from' => 'agent', 'user' => 'pm', 'internal' => 0, 'day' => -8, 'time' => '14:30', 'body' => 'Tisztelt {contact:C1}! A rajzot 564 mm-re módosítottuk, és továbbítottuk a CNC műhelynek. A javított PDF e jegy mellékletében van.'],
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -7, 'time' => '09:05', 'body' => 'Köszönöm, részünkről megerősítve.'],
            ],
            'time' => [
                ['user' => 'pm', 'minutes' => 30, 'billable' => 1, 'day' => -8, 'note' => 'Rajzmódosítás, kivágás 564 mm'],
            ],
            'task' => null,
        ],

        'T3' => [
            'client' => 'C6', 'project' => 'P3', 'assignee' => 'pm', 'status' => 'new', 'priority' => 'high', 'type' => 'incident', 'source' => 'email',
            'createdDay' => -1, 'createdTime' => '16:10',
            'response' => ['day' => -1, 'time' => '16:50'], 'resolved' => null, 'closed' => null, 'satisfaction' => null,
            'title' => 'Wellness-fal: hajszálrepedés az egyik hézagban',
            'description' => 'A wellness-fal burkolatának egyik függőleges hézagában kb. 1 mm széles és 40 cm hosszú hajszálrepedés nyílt. Megvilágításnál látszik. Kérjük, nézzék meg, mielőtt újabb vendégek érkeznek.',
            'tags' => ['wellness', 'hézag', 'burkolat'],
            'watchers' => ['owner'],
            'messages' => [
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -1, 'time' => '16:10', 'body' => 'Jó napot kívánok! A wellness-fal egyik hézagában hajszálrepedést vettünk észre, a fotókat mellékeltem. Megnézné valaki még a héten?'],
                ['from' => 'agent', 'user' => 'pm', 'internal' => 0, 'day' => -1, 'time' => '16:50', 'body' => 'Tisztelt {contact:C6}! Köszönjük a fotókat. Magas prioritással rögzítettük, és a hézagot még a héten megvizsgáljuk a helyszínen. A pontos időpontot holnap megerősítjük.'],
            ],
            'time' => [],
            'task' => null,
        ],

        'T4' => [
            'client' => 'C6', 'project' => 'P3', 'assignee' => 'pm', 'status' => 'scheduled', 'priority' => 'normal', 'type' => 'question', 'source' => 'manual',
            'createdDay' => -9, 'createdTime' => '11:00',
            'response' => ['day' => -9, 'time' => '11:00'], 'resolved' => null, 'closed' => null, 'satisfaction' => null,
            'title' => 'Az előcsarnok padlójának ütemezett újraimpregnálása',
            'description' => 'Az éves karbantartási szerződésben foglalt két újraimpregnálási kiszállás első alkalma: az előcsarnok padlójának tisztítása és újraimpregnálása.',
            'tags' => ['szerződés', 'impregnálás', 'karbantartás'],
            'watchers' => [],
            'messages' => [
                ['from' => 'agent', 'user' => 'pm', 'internal' => 0, 'day' => -9, 'time' => '11:05', 'body' => 'Tisztelt {contact:C6}! A karbantartási szerződésük első újraimpregnálási kiszállását {d:6} 8:00-ra terveztük. Az előcsarnokot kb. három órára vendégmentesen kellene tartani.'],
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -8, 'time' => '10:40', 'body' => 'Köszönjük, megfelel. Aznap reggel lezárjuk az előcsarnok oldalbejáratát.'],
            ],
            'time' => [],
            'task' => ['owner' => 'pm', 'status' => 'new', 'priority' => 'medium', 'deadlineDay' => 6, 'deadlineTime' => '08:00', 'title' => 'Előcsarnok padlójának újraimpregnálása: {client:C6}', 'description' => 'Karbantartási kiszállás 1/2 a szerződésből. Vidd a tisztítószert és két üveg {item:I6} terméket; impregnálás után a padlót 3 órára tartsd lezárva.'],
        ],

        'T5' => [
            'client' => 'C3', 'project' => 'P4', 'assignee' => 'sales', 'status' => 'resolved', 'priority' => 'normal', 'type' => 'incident', 'source' => 'email',
            'createdDay' => -14, 'createdTime' => '09:15',
            'response' => ['day' => -14, 'time' => '10:30'], 'resolved' => ['day' => -11, 'time' => '16:00'], 'closed' => null, 'satisfaction' => null,
            'title' => 'Hibás élprofillal szállítottunk egy munkalapot',
            'description' => 'A múlt heti rendelés egyik munkalapja a megrendelt enyhén lekerekített él helyett díszes (ógörbe) éllel érkezett. A stúdió nem tudja beépíteni.',
            'tags' => ['gyártás', 'él', 'jóváírás'],
            'watchers' => ['owner'],
            'messages' => [
                ['from' => 'client', 'user' => null, 'internal' => 0, 'day' => -14, 'time' => '09:15', 'body' => 'Jó napot kívánok! Az utolsó szállítmány egyik munkalapja ógörbe éllel készült, pedig enyhén lekerekített élt rendeltünk. Nem tudjuk beépíteni. Kérem, segítsenek.'],
                ['from' => 'agent', 'user' => 'sales', 'internal' => 0, 'day' => -14, 'time' => '10:30', 'body' => 'Tisztelt {contact:C3}! Elnézést kérünk a tévesztésért. A munkalapot újragyártjuk a megfelelő éllel, és térítésmentesen kiszállítjuk.'],
                ['from' => 'agent', 'user' => 'pm', 'internal' => 1, 'day' => -13, 'time' => '08:45', 'body' => 'A rendelési lapon helyes volt a profil, a CNC-program viszont a régi. Az új lap csütörtökön megy a vízsugárra; {user:E5} indulás előtt összeveti a profilt a rajzzal.'],
                ['from' => 'agent', 'user' => 'sales', 'internal' => 0, 'day' => -11, 'time' => '16:00', 'body' => 'Az újragyártott munkalapot ma kiszállítottuk. A többletszállítási díjról szóló {m:180} összegű jóváírás a következő számlával érkezik.'],
            ],
            'time' => [
                ['user' => 'sales', 'minutes' => 40, 'billable' => 0, 'day' => -14, 'note' => 'Egyeztetés a stúdióval és újrarendelés'],
                ['user' => 'pm', 'minutes' => 90, 'billable' => 0, 'day' => -12, 'note' => 'Újragyártás tervezése, program javítása'],
            ],
            'task' => null,
        ],
    ],
];
