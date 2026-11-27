<?php
/**
 * Tasks pack, magyar kiadás: 14 feladat a mai nap körül (docs/DEMO-MODE.md A4, 4A fázis).
 *
 * Data only (contract: demo_seed/index.php; shape: header of demo_seed/tasks.php). A személyek, ügyfelek és
 * projektek refek. A lista SORRENDJE adja a feladat azonosítóját (demo-tasks-<n>) - más modulok hivatkoznak rá,
 * ezért csak hozzáfűzni szabad, átrendezni soha: 1-4 owner, 5-9 pm, 10-14 sales. Ugyanazok a kulcsok,
 * listahosszok és számok, mint az en és sk packban; csak a szövegek különböznek. state: new | progress | blocked | done.
 * day: a határidő eltolása a mai naptól (negatív = lejárt). A neveket nem ragozzuk: alanyesetben, kötőjel
 * után vagy alanyként állnak.
 */
return [
    'tasks' => [
        // --- owner ------------------------------------------------------------------------------------
        ['title' => 'Lapok rendelése a(z) {project:P1} 2. szakaszához',
            'description' => 'A mennyiség egyeztetése a CNC vágási tervvel, majd a rendelés leadása az importőrnek. Az előcsarnok-padló lapjai ugyanabba a rendelésbe kerülnek.',
            'priority' => 'high', 'day' => 2, 'time' => '10:00', 'state' => 'progress', 'owner' => 'owner', 'assignees' => ['pm'], 'client' => 'C1', 'project' => 'P1', 'locking' => false, 'createdBy' => 'owner'],
        ['title' => 'Keretfeltételek elküldése – {client:L10}',
            'description' => 'Az együttműködési ajánlat kiment, de {contact:L10} még várja a németországi szállítási feltételeket és a fix négyzetméterárat. Készítsd el a feltételeket, és küldd el a mintalistával együtt.',
            'priority' => 'high', 'day' => -2, 'time' => '16:00', 'state' => 'new', 'owner' => 'owner', 'assignees' => ['sales'], 'client' => 'L10', 'project' => null, 'locking' => true, 'createdBy' => 'owner'],
        ['title' => 'Lejárt előleg sürgetése – {project:P3}',
            'description' => 'A 40 %-os előleg ({m:18400}) 12 napja lejárt. Hívd a szállodát ({contact:C6}), egyeztesd a fizetési dátumot, és a gyártási időpont felszabadítása előtt küldj barátságos emlékeztetőt a számlával.',
            'priority' => 'high', 'day' => -1, 'time' => '15:00', 'state' => 'progress', 'owner' => 'owner', 'assignees' => [], 'client' => 'C6', 'project' => 'P3', 'locking' => true, 'createdBy' => 'owner'],
        ['title' => 'Lapárlista felülvizsgálata a következő negyedévre',
            'description' => 'Hasonlítsd össze az olasz gyártó új árlistáját a helyi forgalmazóéval, és frissítsd a raktárban a(z) {item:I1} és a(z) {item:I2} eladási árát.',
            'priority' => 'low', 'day' => 9, 'time' => '14:00', 'state' => 'new', 'owner' => 'owner', 'assignees' => [], 'client' => null, 'project' => null, 'locking' => false, 'createdBy' => 'owner'],

        // --- pm -----------------------------------------------------------------------------------------
        ['title' => 'Késik a(z) {project:P3} lapszállítása – új időpont egyeztetése',
            'description' => 'A wellness falhoz szánt lapok a gyártónál ragadtak. Szerezz határozott szállítási dátumot, közöld írásban a szállodával ({contact:C6}), és nézd meg, hogy az előcsarnok-padló kerülhet-e előbb sorra.',
            'priority' => 'high', 'day' => -2, 'time' => '11:00', 'state' => 'blocked', 'owner' => 'pm', 'assignees' => ['owner'], 'client' => 'C6', 'project' => 'P3', 'locking' => true, 'createdBy' => 'pm'],
        ['title' => 'Az előcsarnok-padló beépítésének tervezése',
            'description' => 'Két szerelő két napra; a lapoknak egy nappal előbb a helyszínen kell lenniük. Egyeztesd a belépés időpontját az ügyfél ({client:C1}) építésvezetőjével.',
            'priority' => 'medium', 'day' => 7, 'time' => '08:00', 'state' => 'new', 'owner' => 'pm', 'assignees' => [], 'client' => 'C1', 'project' => 'P1', 'locking' => false, 'createdBy' => 'owner'],
        ['title' => 'Vágási terv készítése a mosdópultokhoz',
            'description' => 'Terítsd el az 1. sorozat összes mosdópultját a lehető legkevesebb lapon, hogy a hulladék 8 % alatt maradjon. Az 1. sorozat kb. három hét múlva indul.',
            'priority' => 'medium', 'day' => 14, 'time' => '09:00', 'state' => 'new', 'owner' => 'pm', 'assignees' => [], 'client' => 'C5', 'project' => 'P5', 'locking' => false, 'createdBy' => 'pm'],
        ['title' => 'Jóváírás a hibás élprofilért',
            'description' => 'A munkalapot a helyes profillal újragyártottuk. Állítsd ki a különbözet jóváírását, és küldd el a stúdiónak ({contact:C3}).',
            'priority' => 'medium', 'day' => -3, 'time' => '12:00', 'state' => 'done', 'owner' => 'pm', 'assignees' => [], 'client' => 'C3', 'project' => 'P4', 'locking' => false, 'createdBy' => 'pm'],
        ['title' => 'Garanciális kiszállás: a kiszakadt él javítása',
            'description' => 'Apró kiszakadás a mosogatógép mellett. Vidd magaddal a javítókészletet és a lap színéhez illő tömítőt; {contact:C2} délelőtt otthon van.',
            'priority' => 'medium', 'day' => 3, 'time' => '09:00', 'state' => 'new', 'owner' => 'pm', 'assignees' => ['sales'], 'client' => 'C2', 'project' => 'P2', 'locking' => false, 'createdBy' => 'sales'],

        // --- sales --------------------------------------------------------------------------------------------
        ['title' => 'Lézeres felmérés a konyhában – {client:L9}',
            'description' => 'Menj ki a házhoz, és mérd fel lézerrel a konyhát a fehér kvarc munkalaphoz, a hátfalhoz és a mosogató kivágásához. Fotózd le a mosogatógép mögötti falat.',
            'priority' => 'high', 'day' => 6, 'time' => '10:00', 'state' => 'new', 'owner' => 'sales', 'assignees' => [], 'client' => 'L9', 'project' => null, 'locking' => false, 'createdBy' => 'sales'],
        ['title' => 'Módosított ajánlat követése – {client:L9}',
            'description' => 'A módosított ajánlatot {d:2} napig akarta visszaigazolni. Ha nem jön semmi, hívd fel, emlékeztesd a 4 cm-es gérvágott él lehetőségére ({m:180}), és tartsd szabadon a felmérési időpontot.',
            'priority' => 'high', 'day' => 2, 'time' => '11:00', 'state' => 'new', 'owner' => 'sales', 'assignees' => [], 'client' => 'L9', 'project' => null, 'locking' => true, 'createdBy' => 'sales'],
        ['title' => 'Telefon – {client:L8}: a terasz felmérésének időpontja',
            'description' => 'Egyeztess időpontot a terasz és a kültéri konyhapult felmérésére, utána küldd el az ajánlattervezetet. Említsd meg a fagyálló, 20 mm-es porcelánlapokat.',
            'priority' => 'medium', 'day' => 0, 'time' => '14:00', 'state' => 'new', 'owner' => 'sales', 'assignees' => [], 'client' => 'L8', 'project' => null, 'locking' => false, 'createdBy' => 'sales'],
        ['title' => 'Visszahívás a webes érdeklődésre – {client:L7}',
            'description' => 'Új érdeklődés tegnap estéről: mosdópult és zuhanyfal. Kérdezd meg a fürdőszoba méretét, hívd meg a bemutatóterembe, és küldd el a katalógust.',
            'priority' => 'medium', 'day' => 0, 'time' => '09:30', 'state' => 'new', 'owner' => 'sales', 'assignees' => [], 'client' => 'L7', 'project' => null, 'locking' => false, 'createdBy' => 'sales'],
        ['title' => 'A kész konyha záró fotói és értékelés kérése',
            'description' => 'A kész munkalapot lefotóztuk a referenciákhoz, és az ügyfelet ({contact:C2}) megkértük egy rövid online értékelésre.',
            'priority' => 'low', 'day' => -9, 'time' => '14:00', 'state' => 'done', 'owner' => 'sales', 'assignees' => [], 'client' => 'C2', 'project' => 'P2', 'locking' => false, 'createdBy' => 'sales'],
    ],
];
