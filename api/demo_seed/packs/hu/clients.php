<?php
/**
 * Clients pack, magyar kiadás: mi történik a C1-C6 ügyfelekkel és az L7-L11 érdeklődőkkel (Part D3).
 *
 * Data only (contract: demo_seed/index.php; shape: header of demo_seed/clients.php). A személyek és a
 * cégek a company.php-ban vannak, rájuk ref / {placeholder} hivatkozik. Ugyanazok a kulcsok, listahosszok
 * és számok, mint a packs/en/clients.php és packs/sk/clients.php fájlban; csak a szövegek különböznek.
 * Az összegek a szövegben {m:EUR}, a dátumok {d:eltolás}.
 */
return [
    'categories' => [
        'private' => ['name' => 'Magánháztartások', 'parent' => null, 'level' => 1, 'color' => '#10b981', 'icon' => 'Home'],
        'commercial' => ['name' => 'Üzleti ügyfelek és fejlesztők', 'parent' => null, 'level' => 1, 'color' => '#3b82f6', 'icon' => 'Building'],
        'trade' => ['name' => 'Kereskedelmi partnerek és stúdiók', 'parent' => null, 'level' => 1, 'color' => '#8b5cf6', 'icon' => 'Users'],
        'hospitality' => ['name' => 'Szállodák és vendéglátás', 'parent' => 'commercial', 'level' => 2, 'color' => '#0ea5e9', 'icon' => 'Coffee'],
    ],

    'statusTitle' => 'Állapot módosítva: „%s”',

    // source: showroom | facebook | instagram | website. division: a kiadás két részlegének indexe.
    // adjustmentEur: a korábbi megrendelések értéke - a pozitív szám tesz egy rekordot ügyféllé.
    // leadCategories: a LEAD_CATEGORIES indexei (0 termékek, 1 szolgáltatások).
    'leads' => [
        'C1' => ['source' => 'showroom', 'owner' => 'owner', 'division' => 0, 'adjustmentEur' => 6800, 'leadCategories' => [0, 1], 'clientCategory' => 'commercial', 'referral' => null, 'day' => -150, 'legalForm' => 'Kft.',
            'interest' => 'Homlokzatburkolat és előcsarnok-padló egy új, 12 villás rezidenciához (kb. 180 m² nagy formátumú porcelán- és kvarclap).'],
        'C2' => ['source' => 'instagram', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 1850, 'leadCategories' => [0], 'clientCategory' => 'private', 'referral' => 'C3', 'day' => -110, 'legalForm' => '',
            'interest' => 'Konyhai munkalap és 60 cm-es hátfal fehér kvarcból, alulról beépített mosogató kivágással.'],
        'C3' => ['source' => 'showroom', 'owner' => 'pm', 'division' => 0, 'adjustmentEur' => 12400, 'leadCategories' => [0, 1], 'clientCategory' => 'trade', 'referral' => null, 'day' => -190, 'legalForm' => 'Kft.',
            'interest' => 'Partner konyhastúdió: munkalapok gyártása a konyhai projektjeihez, havonta kb. 8–10 munka.'],
        'C4' => ['source' => 'website', 'owner' => 'pm', 'division' => 1, 'adjustmentEur' => 3900, 'leadCategories' => [0, 1], 'clientCategory' => 'commercial', 'referral' => null, 'day' => -95, 'legalForm' => 'GmbH',
            'interest' => 'Bemutatótermi asztalok és ablakpárkányok szinterezett kőből egy ausztriai bútorkereskedőnek.'],
        'C5' => ['source' => 'facebook', 'owner' => 'owner', 'division' => 1, 'adjustmentEur' => 5200, 'leadCategories' => [0], 'clientCategory' => 'commercial', 'referral' => null, 'day' => -70, 'legalForm' => 'Kft.',
            'interest' => 'Fürdőszobai mosdópultok és falburkolat egy lakásfelújítás-sorozathoz.'],
        'C6' => ['source' => 'website', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 9500, 'leadCategories' => [0, 1], 'clientCategory' => 'hospitality', 'referral' => 'L10', 'day' => -60, 'legalForm' => 'Kft.',
            'interest' => 'Recepciós pult, wellness falburkolat és előcsarnok-padló egy butikhotelnek; éves karbantartási szerződés.'],
        'L7' => ['source' => 'website', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 0, 'leadCategories' => [0], 'clientCategory' => 'private', 'referral' => null, 'day' => -1, 'legalForm' => '',
            'interest' => 'Mosdópult és zuhanyfal-burkolat egy családi házban.'],
        'L8' => ['source' => 'instagram', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 0, 'leadCategories' => [0], 'clientCategory' => 'private', 'referral' => 'C2', 'day' => -8, 'legalForm' => '',
            'interest' => 'Teraszburkolat és kültéri konyhapult 20 mm-es porcelánlapokból.'],
        'L9' => ['source' => 'website', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 0, 'leadCategories' => [0], 'clientCategory' => 'private', 'referral' => null, 'day' => -4, 'legalForm' => '',
            'interest' => 'Konyhai munkalap fehér kvarcból, alulról beépített mosogató kivágással és 4 cm-es gérvágott él lehetőségével.'],
        'L10' => ['source' => 'showroom', 'owner' => 'owner', 'division' => 1, 'adjustmentEur' => 0, 'leadCategories' => [0, 1], 'clientCategory' => 'trade', 'referral' => null, 'day' => -75, 'legalForm' => 'GmbH',
            'interest' => 'Együttműködés egy építészstúdióval: munkalapok, burkolatok és padlók évente kb. hat villaprojekthez.'],
        'L11' => ['source' => 'facebook', 'owner' => 'sales', 'division' => 0, 'adjustmentEur' => 0, 'leadCategories' => [0], 'clientCategory' => 'private', 'referral' => null, 'day' => -40, 'legalForm' => '',
            'interest' => 'Kis fürdőszobai munkalap; az ügyfél egy olcsóbb műhelyt választott.'],
    ],

    // headers = true: a kártya úgy kerül be, ahogy a mail_broker.php teszi (From/To/Subject a levéltörzs fölött).
    // user = a CRM-felhasználó, akié a bejegyzés; null = itt senki nem váltotta ki (űrlap, bejövő levél).
    'timeline' => [
        // --- C1 Hegyvidék Rezidencia (fejlesztő) ---------------------------------------------------
        ['client' => 'C1', 'day' => -150, 'time' => '10:15', 'type' => 'phone', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Bemutatkozó hívás',
            'content' => '{contact:C1} bemutatótermi látogatás után hívott: egy új, 12 villás rezidenciához homlokzatburkolat és előcsarnok-padló kell nagy formátumú lapokból. Megbeszéltük a helyszíni szemlét és a következő lépéseket.'],
        ['client' => 'C1', 'day' => -147, 'time' => '09:40', 'type' => 'email', 'user' => 'owner', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Katalógus és mintatábla elküldve',
            'content' => 'Elküldtük a lapkatalógust, az árlistát és egy mintatáblát postán.'],
        ['client' => 'C1', 'day' => -138, 'time' => '14:00', 'type' => 'appointment', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Helyszíni szemle és lézeres felmérés',
            'content' => 'A homlokzatot és az előcsarnokot lézerrel felmértük, a fotók és rajzok a projektmappában vannak. Három szakasz: felmérés, gyártás, beépítés.'],
        ['client' => 'C1', 'day' => -118, 'time' => '11:20', 'type' => 'order', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Megrendelés visszaigazolva',
            'content' => 'A fejlesztő e-mailben elfogadta az ajánlatot ({m:24600}); a 40 %-os előleget kiszámlázzuk, a gyártási időpont lefoglalva.'],
        ['client' => 'C1', 'day' => -118, 'time' => '11:21', 'type' => 'status_change', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],
        ['client' => 'C1', 'day' => -12, 'time' => '16:10', 'type' => 'phone', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Homlokzat: az 1. szakasz kész',
            'content' => '{contact:C1} jelezte, hogy a homlokzat 1. szakasza elkészült, az állványt elbontották. A 2. szakasz lapjainak megrendelése e héten esedékes.'],

        // --- C2 Horváth Andrea (magánügyfél, a projekt kész) ------------------------------------------
        ['client' => 'C2', 'day' => -110, 'time' => '15:30', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Bemutatkozó hívás',
            'content' => 'Instagramon talált ránk, és a {client:C3} ajánlott minket. Fehér kvarc munkalapot és hátfalat szeretne. Megbeszéltük a bemutatótermi látogatást.'],
        ['client' => 'C2', 'day' => -104, 'time' => '13:00', 'type' => 'appointment', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Bemutatótermi látogatás és lézeres felmérés',
            'content' => 'A lapot a bemutatóteremben választotta ki, a konyháját még aznap délután lézerrel felmértük.'],
        ['client' => 'C2', 'day' => -96, 'time' => '10:05', 'type' => 'order', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Megrendelés visszaigazolva',
            'content' => 'Az ügyfél e-mailben visszaigazolta az ajánlatot ({m:5900}); a gyártás a jövő héten indul.'],
        ['client' => 'C2', 'day' => -96, 'time' => '10:06', 'type' => 'status_change', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],
        ['client' => 'C2', 'day' => -45, 'time' => '17:20', 'type' => 'note', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Beépítve és kifizetve',
            'content' => 'A munkalapot egy nap alatt beépítettük, a végszámla ki van fizetve. Az ügyfél hozzájárult, hogy a kész munka fotói bekerüljenek a referenciáink közé.'],
        ['client' => 'C2', 'day' => -6, 'time' => '11:15', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Garanciális bejelentés: apró kiszakadás az élen',
            'content' => '{contact:C2} apró kiszakadást talált a munkalap szélén a mosogatógép mellett, és fotót küldött. A garanciális jegy nyitva van, a javítás helyszíni időpontját egyeztetjük.'],

        // --- C3 KonyhaVonal Stúdió (partnerstúdió) ----------------------------------------------------------
        ['client' => 'C3', 'day' => -190, 'time' => '09:00', 'type' => 'phone', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Bemutatkozó hívás',
            'content' => '{contact:C3} konyhastúdiót vezet, és megbízható műhelyt keres munkalapokhoz: havonta 8–10 munka. Megbeszéltük a műhelylátogatást.'],
        ['client' => 'C3', 'day' => -183, 'time' => '16:10', 'type' => 'email', 'user' => 'pm', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Keretárlista elküldve',
            'content' => 'Elküldtük a partneri árlistát mennyiségi sávokkal és a szokásos átfutási időkkel.'],
        ['client' => 'C3', 'day' => -170, 'time' => '12:00', 'type' => 'note', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Megjegyzés az ügyfélről',
            'content' => 'A stúdió minden hétfőn küldi a munkalaplistát; a felmérést a saját szerelőik végzik. E-mailt szeretnek, a döntéshozó {contact:C3}.'],
        ['client' => 'C3', 'day' => -160, 'time' => '10:00', 'type' => 'status_change', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],
        ['client' => 'C3', 'day' => -9, 'time' => '14:25', 'type' => 'phone', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Hibás élprofil az egyik munkalapon',
            'content' => '{contact:C3} jelezte, hogy az egyik munkalap hibás élprofillal érkezett. Megállapodtunk az újragyártásban és a különbözet jóváírásában.'],

        // --- C4 Wohnwerk Steiner (külföldi kereskedő) -----------------------------------------------------------
        ['client' => 'C4', 'day' => -95, 'time' => '14:20', 'type' => 'phone', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Bemutatkozó hívás',
            'content' => '{contact:C4} a weboldalunkon talált ránk. A kereskedő bemutatótermi asztalokat és ablakpárkányokat szeretne szinterezett kőből, és az Ausztriába szállításról érdeklődik.'],
        ['client' => 'C4', 'day' => -88, 'time' => '09:30', 'type' => 'email', 'user' => 'pm', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Ajánlat és szállítási feltételek elküldve',
            'content' => 'Elküldtük az ajánlatot a lapméretekkel, a csomagolással és a bécsi szállítási feltételekkel.'],
        ['client' => 'C4', 'day' => -74, 'time' => '17:00', 'type' => 'order', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Megrendelés visszaigazolva',
            'content' => 'A kereskedő e-mailben visszaigazolta az ajánlatot; a vágás előtt 50 %-os előleget kértünk.'],
        ['client' => 'C4', 'day' => -74, 'time' => '17:01', 'type' => 'status_change', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],

        // --- C5 Délkapu Ingatlankezelő (lakássorozat) ---------------------------------------------------------------
        ['client' => 'C5', 'day' => -70, 'time' => '11:00', 'type' => 'phone', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Bemutatkozó hívás',
            'content' => '{contact:C5} egy társasház lakásait kezeli, amelyeket egyenként újítanak fel, és minden fürdőszobába ugyanolyan mosdópult kell.'],
        ['client' => 'C5', 'day' => -62, 'time' => '13:45', 'type' => 'appointment', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Helyszíni szemle',
            'content' => 'Megnéztünk három mintafürdőszobát, és megállapodtunk egy szabványos méretben, hogy az egész sorozat egy menetben vágható legyen.'],
        ['client' => 'C5', 'day' => -49, 'time' => '10:30', 'type' => 'order', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Megrendelés visszaigazolva',
            'content' => 'Az ingatlankezelő visszaigazolta az 1. sorozatot ({m:21000}); a beépítés kb. három hét múlva indul.'],
        ['client' => 'C5', 'day' => -49, 'time' => '10:31', 'type' => 'status_change', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],
        ['client' => 'C5', 'day' => -3, 'time' => '09:20', 'type' => 'note', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Az 1. sorozat kezdési időpontja',
            'content' => '{contact:C5} az első lakásokat {d:21} adja át. A vágást az előtte lévő hétre tervezzük.'],

        // --- C6 Aurum Hotel (butikhotel) ---------------------------------------------------------------------------------
        ['client' => 'C6', 'day' => -60, 'time' => '10:00', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Bemutatkozó hívás',
            'content' => '{contact:C6} a szálloda recepcióját, wellness részlegét és előcsarnokát újítja fel; az építész ajánlott minket. Megbeszéltük a helyszíni szemlét.'],
        ['client' => 'C6', 'day' => -52, 'time' => '15:00', 'type' => 'appointment', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Helyszíni szemle és lézeres felmérés',
            'content' => 'Felmértük a recepciót, a wellness falat és az előcsarnokot. A wellness falhoz nagy formátumú szinterezett kő kell; a recepciós pult 30 mm-es kvarc gérvágott sarkokkal.'],
        ['client' => 'C6', 'day' => -41, 'time' => '09:15', 'type' => 'order', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Megrendelés visszaigazolva',
            'content' => 'A szálloda aláírta az ajánlatot ({m:46000}) és az éves karbantartási szerződést; a 40 %-os előleg a számla szerint esedékes.'],
        ['client' => 'C6', 'day' => -41, 'time' => '09:16', 'type' => 'status_change', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => 'won', 'title' => null, 'content' => null],
        ['client' => 'C6', 'day' => -14, 'time' => '16:30', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Késik a lapok szállítása - bocsánatkérés',
            'content' => 'Jeleztük {contact:C6} részére, hogy az olaszországi lapok a tervezettnél később érkeznek, ezért a wellness fal csúszik. Az új időpontot írásban küldjük.'],
        ['client' => 'C6', 'day' => -6, 'time' => '14:00', 'type' => 'appointment', 'user' => 'pm', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Ügyfélmegbeszélés: a wellness fal csúszása',
            'content' => 'Találkoztunk {contact:C6} a szállodában: az új szállítási időpont, a lapminta jóváhagyása és a fizetési ütemezés. A megbeszélés jegyzete az AI tárgyalóban van.'],

        // --- L7 Kovács Péter (új, webes űrlap tegnap) ------------------------------------------------------------------------------
        ['client' => 'L7', 'day' => -1, 'time' => '19:42', 'type' => 'note', 'user' => null, 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Webes űrlap érdeklődés',
            'content' => "Beküldött űrlap, forrás: weboldal\nNév: {contact:L7}\nKategória: Termékek\nÉrték: {m:3200}\nÜzenet: A fő fürdőszobánkat újítjuk fel, és kvarc mosdópultot, valamint kő zuhanyfalat szeretnénk. Kérnénk egy árajánlatot és a szállítási határidőt."],

        // --- L8 Mészáros Éva (felvettük a kapcsolatot) -------------------------------------------------------------------------------
        ['client' => 'L8', 'day' => -8, 'time' => '20:05', 'type' => 'note', 'user' => null, 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Instagram-üzenet',
            'content' => '{contact:L8} azután írt nekünk, hogy látta {contact:C2} elkészült konyháját, aki ajánlott minket: új teraszburkolatot és kültéri konyhapultot szeretne.'],
        ['client' => 'L8', 'day' => -6, 'time' => '10:30', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Első hívás',
            'content' => 'A terasz kb. 26 m², a pult 2,4 m. A 20 mm-es porcelánlapok fagyállók, ezért kültérre is jók. Megbeszéltük a helyszíni felmérést.'],
        ['client' => 'L8', 'day' => -6, 'time' => '10:45', 'type' => 'status_change', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => 'contacted', 'title' => null, 'content' => null],
        ['client' => 'L8', 'day' => -2, 'time' => '12:30', 'type' => 'email', 'user' => 'sales', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Katalógus és mintatábla elküldve',
            'content' => 'Elküldtük a kültéri lapok katalógusát és az árlistát; az ajánlattervezet a felmérés után következik.'],

        // --- L9 Kozma Martina (ajánlat elküldve): a webes űrlap és a mosogató-kivágásról szóló levélváltás ---------------------
        ['client' => 'L9', 'day' => -4, 'time' => '08:15', 'type' => 'note', 'user' => null, 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Webes űrlap érdeklődés',
            'content' => "Beküldött űrlap, forrás: weboldal\nNév: {contact:L9}\nKategória: Termékek\nÉrték: {m:8400}\nÜzenet: Fehér kvarc konyhai munkalapot keresek, 2,4 m hosszút. A konyhabútort néhány hét múlva szerelik. A múlt héten jártam a bemutatótermükben, és árajánlatot szeretnék kérni."],
        ['client' => 'L9', 'day' => -3, 'time' => '09:12', 'type' => 'email', 'user' => 'sales', 'outgoing' => false, 'headers' => true, 'status' => null,
            'title' => 'Konyhapult rajzok + mosogató kivágás',
            'content' => "Kedves {first:sales}!\n\nköszönöm a múlt heti bemutatótermi látogatást. Csatolom az építészünk konyharajzait - a munkalap 2,4 m hosszú és 60 cm mély, a mosogatógép fölött 20 cm túlnyúlással.\n\nA megrendelés előtt három dolgot szeretnék megerősíteni:\n\n1. A mosogató alulról beépített Sinkra 500x400 mm, tehát a kivágást mind a négy oldalon políroztatnom kell.\n2. Ugyanezt a követ szeretnénk a 60 cm-es hátfalra is, 12 mm vastagságban.\n3. Lehetséges elöl a 4 cm-es gérvágott él, vagy az jelentősen módosítja az árat?\n\nA szállítás ideális esetben a {d:20} körüli héten lenne - a konyhabútort {d:24} szerelik.\n\nKöszönöm és szép napot,\n{contact:L9}"],
        ['client' => 'L9', 'day' => -2, 'time' => '16:40', 'type' => 'email', 'user' => 'sales', 'outgoing' => true, 'headers' => true, 'status' => null,
            'title' => 'RE: Konyhapult rajzok + mosogató kivágás',
            'content' => "Tisztelt {contact:L9}!\n\nköszönöm a rajzokat, minden világos.\n\n1. Az alulról beépített mosogató kivágása mind a négy él polírozásával együtt a megmunkálás alapárának része, felár nélkül.\n2. A 60 cm-es hátfal 12 mm-ben nem probléma - külön tételként hozzáadtam az ajánlathoz.\n3. A 4 cm-es gérvágott él megoldható; a többletvágás és ragasztás miatt nagyjából {m:180} felárat jelent a végösszegben.\n\nA módosított ajánlatot csatolom. Ha legkésőbb {d:2} napon visszaigazolja, a lézeres felmérést {d:6} napra tudjuk ütemezni, a szállítást pedig a {d:20} körüli hétre, így Ön időben lenne a konyhabútor szereléséhez.\n\nÜdvözlettel,\n{user:sales}"],
        ['client' => 'L9', 'day' => -2, 'time' => '16:45', 'type' => 'status_change', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => 'offer', 'title' => null, 'content' => null],

        // --- L10 Müller Architekten (külföldi építészstúdió, ajánlat elküldve) --------------------------------------------------
        ['client' => 'L10', 'day' => -75, 'time' => '11:00', 'type' => 'appointment', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Látogatás a bemutatóteremben',
            'content' => '{contact:L10} egy ügyféllel jött a bemutatóterembe, és megtetszettek neki a szinterezett kő minták. A stúdiója évente kb. hat villát tervez; az együttműködésről beszéltünk.'],
        ['client' => 'L10', 'day' => -68, 'time' => '09:50', 'type' => 'email', 'user' => 'owner', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Minták és referencialista elküldve',
            'content' => 'Elküldtünk három szinterezett kő mintát és a referenciaprojektjeink listáját, köztük az {client:C6} munkáját.'],
        ['client' => 'L10', 'day' => -45, 'time' => '15:15', 'type' => 'phone', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Hívás a németországi szállításról',
            'content' => 'A stúdiónak raklapos szállítás kell Bajorországba és a keretszerződésben fix négyzetméterár. Előkészítjük az együttműködési ajánlatot.'],
        ['client' => 'L10', 'day' => -30, 'time' => '10:20', 'type' => 'status_change', 'user' => 'owner', 'outgoing' => false, 'headers' => false, 'status' => 'offer', 'title' => null, 'content' => null],

        // --- L11 Tóth Roland (árban elveszett) -------------------------------------------------------------------------------------
        ['client' => 'L11', 'day' => -40, 'time' => '17:00', 'type' => 'phone', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Bemutatkozó hívás',
            'content' => 'Az ügyfélnek egy kis fürdőszobai munkalap kell, és több műhelyt hasonlít össze. Két napon belül ajánlatot ígértünk.'],
        ['client' => 'L11', 'day' => -36, 'time' => '10:10', 'type' => 'email', 'user' => 'sales', 'outgoing' => true, 'headers' => false, 'status' => null,
            'title' => 'Ajánlat elküldve',
            'content' => 'Elküldtük az ajánlatot {m:2900} értékben. Vékonyabb kvarcot javasoltunk, hogy csökkenjen az ár.'],
        ['client' => 'L11', 'day' => -30, 'time' => '13:40', 'type' => 'note', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => null,
            'title' => 'Elutasítva: másik műhely olcsóbb',
            'content' => 'Az ügyfél egy olcsóbb műhelyt választott, nagyjából 15 %-kal az áraink alatt. A kapcsolatot megtartjuk egy későbbi projektre.'],
        ['client' => 'L11', 'day' => -30, 'time' => '13:41', 'type' => 'status_change', 'user' => 'sales', 'outgoing' => false, 'headers' => false, 'status' => 'lost', 'title' => null, 'content' => null],
    ],
];
