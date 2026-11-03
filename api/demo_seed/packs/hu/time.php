<?php
/**
 * Pack `time` (hu) - amit a három belépő az időmérőben rögzít (C10).
 * Mindegyiküknek van egy MUNKATÉTEL-KÉSZLETE, amit a modul az utolsó 15 munkanapra oszt szét
 * (demo_seed/time.php): minden tétel nagyjából egyformán gyakran tér vissza. Az arányok: a
 * tulajdonos ~25 %-a számlázható, a gyártásvezetőé ~70 %, az értékesítőé ~45 %; nagyjából
 * minden tizedik bejegyzésnek nincs projektje.
 *
 *   title     amit a felhasználó beírt; csak akkor kerül mentésre, ha a tétel nincs feladathoz vagy jegyhez kötve
 *   note      a bejegyzés leírása ('' = nincs)
 *   project   projekt-hivatkozás vagy null
 *   link      null | 'task' | 'ticket': a projekt `pick`-edik minta-feladatához (jegyéhez) kapcsolódik
 *   billable  az ügyfélnek számlázható
 */
return [
    'billableRateEur' => 45,

    'device' => ['name' => 'Chrome · macOS', 'browser' => 'Chrome', 'os' => 'macOS', 'version' => '1.0.0'],

    'pools' => [
        'owner' => [
            ['title' => 'Szálloda: hívás az átadási határidőről és a fizetési ütemezésről', 'note' => 'Az új határidőt utána e-mailben megerősítettük.', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Homlokzat árazása és beszállítói ajánlatok', 'note' => '', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Keretszerződés: mennyiségek és árak a partnerstúdióval', 'note' => 'Az árak a negyedév végéig rögzítettek.', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Lapok megrendelése a wellness falhoz', 'note' => '', 'project' => 'P3', 'link' => 'task', 'pick' => 0, 'billable' => false],
            ['title' => 'Heti gyártási és értékesítési megbeszélés', 'note' => 'A heti prioritások egyeztetve.', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'A homlokzati rajzok jóváhagyása', 'note' => '', 'project' => 'P1', 'link' => 'task', 'pick' => 1, 'billable' => false],
            ['title' => 'A beszállítói árlista jóváhagyása', 'note' => 'A következő negyedéves lista az olasz gyártótól.', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Villatelep bejárása az építésvezetővel', 'note' => '', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Ajánlatok átnézése az értékesítővel', 'note' => '', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Hézag a wellness falon: válasz a szállodának', 'note' => '', 'project' => 'P3', 'link' => 'ticket', 'pick' => 0, 'billable' => false],
            ['title' => 'Bemutatótermi látogatások, e-mailek és telefonok', 'note' => 'Projektekhez még besorolandó.', 'project' => null, 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Cash flow és számlák ellenőrzése', 'note' => '', 'project' => 'P4', 'link' => 'task', 'pick' => 2, 'billable' => false],
        ],
        'pm' => [
            ['title' => 'Vágási terv a homlokzati lapokhoz', 'note' => 'A hulladék 8 % alatt maradt.', 'project' => 'P1', 'link' => 'task', 'pick' => 0, 'billable' => true],
            ['title' => 'CNC-teritás és lapkiosztás', 'note' => '', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Felmérés és sablonok a wellness falhoz', 'note' => '', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Beépítési időpontok tervezése, homlokzat 1. szakasz', 'note' => '', 'project' => 'P1', 'link' => 'task', 'pick' => 1, 'billable' => true],
            ['title' => 'Élprofilok és munkalapgyártás', 'note' => 'Gérvágott élek, 4 cm.', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Minőség-ellenőrzés szállítás előtt', 'note' => '', 'project' => 'P4', 'link' => 'task', 'pick' => 0, 'billable' => true],
            ['title' => 'Helyszíni szemle: wellness fal burkolása', 'note' => 'A fotók feltöltve a projektbe.', 'project' => 'P3', 'link' => 'task', 'pick' => 1, 'billable' => true],
            ['title' => 'Előcsarnok padlójának kiosztása és hézagterve', 'note' => '', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Reklamáció: téves élprofilt szállítottak', 'note' => 'Jóváírásban állapodtunk meg.', 'project' => 'P4', 'link' => 'ticket', 'pick' => 0, 'billable' => false],
            ['title' => 'Hézag a wellness falon: ellenőrzés', 'note' => '', 'project' => 'P3', 'link' => 'ticket', 'pick' => 0, 'billable' => false],
            ['title' => 'Lapszállítás egyeztetése a beszállítóval', 'note' => 'A szállítás egy héttel csúszott.', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Műhelyadminisztráció és csapatmegbeszélés', 'note' => '', 'project' => null, 'link' => null, 'pick' => 0, 'billable' => false],
        ],
        'sales' => [
            ['title' => 'Felmérés: a szálloda előcsarnokának padlója', 'note' => '', 'project' => 'P3', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'A homlokzat anyagának és árnyalatának kiválasztása', 'note' => 'Az ügyfél kiválasztotta az árnyalatot.', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Bemutatótermi tanácsadás a partnerstúdiónak', 'note' => '', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Ajánlat a homlokzatburkolat változatára', 'note' => '', 'project' => 'P1', 'link' => 'task', 'pick' => 0, 'billable' => true],
            ['title' => 'Lézeres felmérés', 'note' => '', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => true],
            ['title' => 'Utánkövetés a webes érdeklődésre küldött ajánlathoz', 'note' => 'Várjuk, hogy az ügyfél kiválassza az élt.', 'project' => null, 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Mintatáblák a bemutatóterembe', 'note' => '', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'A partnerstúdió rendelési listájának frissítése', 'note' => '', 'project' => 'P4', 'link' => 'task', 'pick' => 1, 'billable' => false],
            ['title' => 'A homlokzat fotódokumentációja', 'note' => '', 'project' => 'P1', 'link' => null, 'pick' => 0, 'billable' => false],
            ['title' => 'Főzőlap-kivágás módosítása: telefon az ügyféllel', 'note' => 'A főzőlap kivágása megváltozott a rajzon.', 'project' => 'P1', 'link' => 'ticket', 'pick' => 0, 'billable' => false],
            ['title' => 'Bemutatótermi nyílt nap előkészítése', 'note' => '', 'project' => 'P4', 'link' => null, 'pick' => 0, 'billable' => false],
        ],
    ],

    'activity' => [
        ['domain' => 'marmi-fiorano.example', 'title' => 'Marmi Fiorano – kvarclap árlista', 'from' => '10:12', 'minutes' => 14, 'project' => 'P3'],
        ['domain' => 'mail.lapidea.example', 'title' => 'Beérkezett (4) – Lapidea Mail', 'from' => '11:05', 'minutes' => 9, 'project' => null],
        ['domain' => 'cad-viewer.example', 'title' => 'Wellness_fal_sablon.dwg – Rajzmegjelenítő', 'from' => '13:40', 'minutes' => 23, 'project' => null],
        ['domain' => 'docs.lapidea.example', 'title' => 'Beépítési ellenőrzőlista – projektdokumentumok', 'from' => '15:20', 'minutes' => 11, 'project' => null],
    ],
];
