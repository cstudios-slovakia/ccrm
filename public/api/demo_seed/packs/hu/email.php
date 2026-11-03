<?php
/**
 * Demo pack "email" (hu): the demo mailbox for about three weeks (module email.php).
 *
 * Senders and recipients are cast refs (owner, pm, sales, C1..C6, L9, S1, S2) or a key of
 * `parties`. `re` points at the `n` of the message a reply answers. Attachment shapes:
 * `rows` (csv), `title` + `lines` (pdf), `seed` (png), `ics` (invitation). `[[name:S1]]` and
 * `[[contact:S1]]` are filled by email.php for cast records demo_text() has no placeholder for.
 */
return [
    'quoteHead' => '%1$s %2$s ezt írta:',
    'parties' => [
        'news' => ['name' => 'Kőipari Hírlevél', 'email' => 'newsletter@stone-trade.example'],
        'courier' => ['name' => 'GLS Üzleti Csomag', 'email' => 'tracking@carrier.example'],
    ],
    'messages' => [
        [
            'n' => 1,
            'folder' => 'INBOX',
            'day' => -21,
            'time' => '16:20',
            'from' => 'S1',
            'to' => 'pm',
            'seen' => true,
            'subject' => 'Lapár árlista a következő negyedévre és a megbeszélés időpontja',
            'body' => 'Tisztelt {first:pm}!

Mellékelem a következő negyedév lapárlistáját. Az árak 250 m² feletti rendelésre és a fioranói gyárunkból, raklapon történő szállításra érvényesek.

Holnap 10:00-kor átbeszélhetjük a lapok elosztását és a berakodási időpontokat. Megfelel Önnek?

Üdvözlettel
[[contact:S1]]
[[name:S1]]',
            'att' => [
                [
                    'name' => 'lapar_arlista_negyedev.csv',
                    'rows' => [
                        ['Tétel', 'Vastagság (mm)', 'Ár m²-enként (EUR)'],
                        ['Aurelia Calacatta kvarc', 20, '{m:99}'],
                        ['Stratos Nero Marquina szinterezett kő', 12, '{m:114}'],
                        ['Lumina Statuario porcelánlap', 6, '{m:74}'],
                    ],
                ],
            ],
        ],
        [
            'n' => 2,
            'folder' => 'Sent',
            'day' => -20,
            'time' => '15:10',
            'from' => 'pm',
            'to' => 'S1',
            'seen' => true,
            're' => 1,
            'subject' => 'RE: Lapár árlista a következő negyedévre és a megbeszélés időpontja',
            'body' => 'Tisztelt Hölgyem/Uram!

Köszönöm a mai beszélgetést. Megerősítem a következő negyedévre szóló lapkiosztást: 140 m² Calacatta kvarc, 60 m² Nero Marquina szinterezett kő és 80 m² Statuario porcelán. Az első berakodás az első héten lesz.

Elfogadjuk az árlistában szereplő árakat. Kérem a rendelés és a feladási határidő visszaigazolását.

Üdvözlettel
{user:pm}
{company}',
        ],
        [
            'n' => 3,
            'folder' => 'INBOX',
            'day' => -18,
            'time' => '11:30',
            'from' => 'C3',
            'to' => 'pm',
            'seen' => true,
            'subject' => 'Heti megrendelési lista – 44. hét',
            'body' => 'Kedves {first:pm}!

Mellékelem a heti konyhapult-listát: kilenc megrendelés, összesen kb. 31 m². Két munka szinterezett kőből készül, ezeknél gyorsabb határidőt kérünk.

Köszönettel
{contact:C3}
{client:C3}',
            'att' => [
                [
                    'name' => 'heti_lista_44_het.csv',
                    'rows' => [
                        ['Munka', 'Anyag', 'Felület (m²)', 'Határidő'],
                        ['KL-4401', 'Calacatta kvarc 20 mm', 3.8, '{d:5}'],
                        ['KL-4402', 'Nero Marquina szinterezett kő 12 mm', 4.2, '{d:4}'],
                        ['KL-4403', 'Absolute Black gránit 30 mm', 3.1, '{d:7}'],
                        ['KL-4404', 'Calacatta kvarc 20 mm', 2.9, '{d:7}'],
                    ],
                ],
            ],
        ],
        [
            'n' => 4,
            'folder' => 'Sent',
            'day' => -17,
            'time' => '09:05',
            'from' => 'pm',
            'to' => 'C3',
            'seen' => true,
            're' => 3,
            'subject' => 'RE: Heti megrendelési lista – 44. hét',
            'body' => 'Kedves {contact:C3}!

A listát megkaptuk. A két szinterezett kő munkát négy munkanapon belül tudjuk szállítani, a többit a keretszerződés szerint hat napon belül. A KL-4403 felmérését még egyeztetik a szerelőink.

Üdvözlettel
{user:pm}',
        ],
        [
            'n' => 5,
            'folder' => 'INBOX',
            'day' => -17,
            'time' => '07:00',
            'from' => 'news',
            'to' => 'owner',
            'seen' => true,
            'subject' => 'Kő & design: konyhapult-trendek ősszel',
            'body' => 'Ezen a héten válogatásunkban:

• A szinterezett kő kiszorítja a kvarcot a {m:8000} feletti konyhákból
• Hogyan változik a kereslet a 4 cm-es élre és a falburkolatra
• Felületápolás: mi működik valóban

A teljes számot elolvashatja a weboldalon. A feliratkozást bármikor lemondhatja.',
        ],
        [
            'n' => 6,
            'folder' => 'INBOX',
            'day' => -12,
            'time' => '10:10',
            'from' => 'L9',
            'to' => 'sales',
            'seen' => true,
            'subject' => 'Mosogató kivágás – hogyan tovább?',
            'body' => 'Tisztelt Hölgyem/Uram!

A weboldali űrlapon keresztül írtam konyhapult miatt. A mosogatót aláépítéssel szeretném, és attól tartok, hogy a kivágás körüli él nem lesz elég erős. Mellékelem a helyszín fotóját a méretekkel.

Elkészülne az ajánlat a hét végéig?

Köszönöm
{contact:L9}',
            'att' => [
                ['name' => 'mosogato_kivagas.png', 'seed' => 61],
            ],
        ],
        [
            'n' => 7,
            'folder' => 'Sent',
            'day' => -12,
            'time' => '14:20',
            'from' => 'sales',
            'to' => 'L9',
            'seen' => true,
            're' => 6,
            'subject' => 'RE: Mosogató kivágás – hogyan tovább?',
            'body' => 'Tisztelt {contact:L9}!

Köszönöm a fotót. Az aláépített mosogató kvarcnál bevett megoldás: a kivágást CNC-n munkáljuk meg, az élt pedig alulról megerősítjük. Mellékelem a 2,4 × 0,6 m-es pultra és a hátfalra szóló ajánlatot. A 4 cm-es, gérvágott él felára {m:180}.

Ha megfelel, a felmérést egyeztetjük Önnél.

Üdvözlettel
{user:sales}
{company}',
            'att' => [
                [
                    'name' => 'ajanlat_konyhapult.pdf',
                    'title' => 'Árajánlat – konyhapult',
                    'lines' => [
                        'Fehér kvarcpult 20 mm, 2,4 × 0,6 m',
                        'Hátfal 12 mm, aláépített mosogató kivágás',
                        'Opcionális: 4 cm-es gérvágott él +{m:180}',
                        '',
                        'Összesen: {m:8400}',
                    ],
                ],
            ],
        ],
        [
            'n' => 8,
            'folder' => 'INBOX',
            'day' => -11,
            'time' => '09:02',
            'from' => 'L9',
            'to' => 'sales',
            'seen' => true,
            're' => 7,
            'subject' => 'RE: Mosogató kivágás – hogyan tovább?',
            'body' => 'Tisztelt Hölgyem/Uram!

Az ajánlat jónak tűnik. A 4 cm-es élet meg lehet csinálni a mosogató körül is, vagy csak az előlapon?

{contact:L9}',
        ],
        [
            'n' => 9,
            'folder' => 'Sent',
            'day' => -11,
            'time' => '11:40',
            'from' => 'sales',
            'to' => 'L9',
            'seen' => true,
            're' => 8,
            'subject' => 'RE: Mosogató kivágás – hogyan tovább?',
            'body' => 'Tisztelt {contact:L9}!

A vastag él a kivágás körül is megoldható, erre éppen ez az ideális megoldás. A felmérést {d:2} ({wd:2}) délutánra javaslom. Megfelel?

Üdvözlettel
{user:sales}',
        ],
        [
            'n' => 10,
            'folder' => 'INBOX',
            'day' => -10,
            'time' => '12:00',
            'from' => 'S2',
            'to' => 'pm',
            'seen' => true,
            'subject' => 'Őszi maradéklap-akció: –15 %',
            'body' => 'Tisztelt Partnerünk!

Mint minden ősszel, most is 15 % kedvezménnyel kínáljuk a raktári maradéklapokat. A lista mellékelve, a készlet erejéig érvényes. A maradékok mosdópultokhoz és ablakpárkányokhoz jól használhatók.

[[name:S2]]',
            'att' => [
                [
                    'name' => 'maradeklapok.pdf',
                    'title' => 'Maradéklapok – ősz',
                    'lines' => [
                        'Calacatta 20 mm, 1,6 × 0,7 m .......... {m:210}',
                        'Absolute Black 30 mm, 1,2 × 0,6 m ..... {m:160}',
                        '',
                        'Az árak áfa nélkül értendők. A 15 % kedvezmény már benne van.',
                    ],
                ],
            ],
        ],
        [
            'n' => 11,
            'folder' => 'Sent',
            'day' => -8,
            'time' => '09:30',
            'from' => 'pm',
            'to' => 'C6',
            'seen' => true,
            'subject' => 'Aurum Hotel – lapok késése és új határidő',
            'body' => 'Tisztelt {contact:C6}!

Elnézést kérünk a késésért. A wellnessfal burkolatához szükséges lapokat a beszállító tíz nappal később engedte ki a gyártásból. Az új határidő a lapok műhelybe érkezésére: {d:4}. A recepció és az előcsarnok szerelését ekkor kezdjük: {d:9}.

Szívesen találkozunk, hogy átnézzük a hézagminták színét és a részletfizetési ütemezést. Jelezze, ha Önnek megfelel ez a nap: {wd:4}.

Üdvözlettel
{user:pm}
{company}',
        ],
        [
            'n' => 12,
            'folder' => 'INBOX',
            'day' => -7,
            'time' => '15:12',
            'from' => 'C6',
            'to' => 'pm',
            'seen' => true,
            're' => 11,
            'subject' => 'RE: Aurum Hotel – lapok késése és új határidő',
            'body' => 'Tisztelt {user:pm}!

Köszönjük a nyílt tájékoztatást. Az új határidőt elfogadjuk, de a wellness megnyitása fix. Kérem, tartsák a szerelés időpontját ({d:9}), és küldjék el jóváhagyásra a hézagszíneket.

{contact:C6}
{client:C6}',
        ],
        [
            'n' => 13,
            'folder' => 'INBOX',
            'day' => -6,
            'time' => '08:30',
            'from' => 'C6',
            'to' => 'owner',
            'seen' => true,
            'subject' => 'Meghívó: hézagminta megtekintése a helyszínen',
            'body' => 'Tisztelt {user:owner}!

Mellékelem a meghívót a hézagminta helyszíni megtekintésére a spában. Kérem, erősítse meg a részvételét.

{contact:C6}',
            'att' => [
                [
                    'name' => 'invite.ics',
                    'ics' => ['day' => 4, 'time' => '10:00', 'minutes' => 60, 'title' => 'Hézagminta megtekintése – Aurum Hotel', 'location' => 'Aurum Hotel, wellness'],
                ],
            ],
        ],
        [
            'n' => 14,
            'folder' => 'Sent',
            'day' => -3,
            'time' => '09:00',
            'from' => 'owner',
            'to' => 'C6',
            'seen' => true,
            'subject' => 'Emlékeztető: lejárt előlegszámla',
            'body' => 'Tisztelt {contact:C6}!

Felhívjuk szíves figyelmét, hogy az előlegszámla fizetési határideje {d:-12} volt (projekt: {project:P3}). Valószínűleg figyelmetlenségről van szó. Kérjük, a következő napokban egyenlítse ki, hogy tarthassuk a lapszállítás határidejét.

Ha már fizetett, kérjük, tekintse tárgytalannak ezt a levelet.

Üdvözlettel
{user:owner}
{company}',
        ],
        [
            'n' => 15,
            'folder' => 'INBOX',
            'day' => -2,
            'time' => '13:40',
            'from' => 'C6',
            'to' => 'owner',
            'seen' => true,
            're' => 14,
            'subject' => 'RE: Emlékeztető: lejárt előlegszámla',
            'body' => 'Tisztelt {user:owner}!

Elnézést kérünk, a számla elveszett két osztály között. A könyvelő legkésőbb ekkorra kiegyenlíti: {d:3}.

{contact:C6}',
        ],
        [
            'n' => 16,
            'folder' => 'Sent',
            'day' => -9,
            'time' => '14:00',
            'from' => 'owner',
            'to' => 'C1',
            'seen' => true,
            'subject' => '{project:P1} – második részlet',
            'body' => 'Tisztelt {contact:C1}!

Mellékelve küldjük a második részlet számláját (projekt: {project:P1}). A felmérés befejezésének és a vágás első fázisának felel meg. A fizetési határidő 14 nap.

Üdvözlettel
{user:owner}
{company}',
            'att' => [
                [
                    'name' => 'masodik_reszlet_szamla.pdf',
                    'title' => 'Számla – második részlet',
                    'lines' => ['Vevő: {client:C1}', 'Projekt: {project:P1}', 'Fizetési határidő: {d:5}'],
                ],
            ],
        ],
        [
            'n' => 17,
            'folder' => 'INBOX',
            'day' => -8,
            'time' => '10:25',
            'from' => 'C1',
            'to' => 'owner',
            'seen' => true,
            're' => 16,
            'subject' => 'RE: {project:P1} – második részlet',
            'body' => 'Tisztelt {user:owner}!

A számlát megkaptuk és továbbítottuk a könyvelésnek. A kifizetés határidőre megtörténik. Egyben kérdezem, hogy az előcsarnok felmérése még ebben a hónapban belefér-e.

{contact:C1}',
        ],
        [
            'n' => 18,
            'folder' => 'INBOX',
            'day' => -6,
            'time' => '10:05',
            'from' => 'C1',
            'to' => 'pm',
            'seen' => true,
            'subject' => 'Fotók a homlokzatról – 3. emelet',
            'body' => 'Tisztelt {user:pm}!

Két fotót küldök a homlokzat jelenlegi állapotáról a harmadik emeleten. Az illesztések jól néznek ki, a sarkokat még ellenőrizzük.

{contact:C1}',
            'att' => [
                ['name' => 'homlokzat_3em_a.png', 'seed' => 71],
                ['name' => 'homlokzat_3em_b.png', 'seed' => 72],
            ],
        ],
        [
            'n' => 19,
            'folder' => 'INBOX',
            'day' => -14,
            'time' => '17:45',
            'from' => 'C2',
            'to' => 'sales',
            'seen' => true,
            'subject' => 'Kis csorba a pult élén',
            'body' => 'Tisztelt Hölgyem/Uram!

A mosogatógép mellett észrevettem egy kis csorbát a pult szélén. Garanciális esetnek számít? Mellékelem a fotót.

Köszönöm
{contact:C2}',
            'att' => [
                ['name' => 'csorba_el.png', 'seed' => 81],
            ],
        ],
        [
            'n' => 20,
            'folder' => 'Sent',
            'day' => -13,
            'time' => '09:15',
            'from' => 'sales',
            'to' => 'C2',
            'seen' => true,
            're' => 19,
            'subject' => 'RE: Kis csorba a pult élén',
            'body' => 'Tisztelt {contact:C2}!

Köszönöm a fotót. Igen, garanciális esetről van szó, az élt díjmentesen javítjuk. A kérést felvettük a szervizben, és kollégánk felveszi Önnel a kapcsolatot a látogatás időpontjával.

Üdvözlettel
{user:sales}
{company}',
        ],
        [
            'n' => 21,
            'folder' => 'INBOX',
            'day' => -5,
            'time' => '11:25',
            'from' => 'sales',
            'to' => 'owner',
            'seen' => true,
            'subject' => 'Nyílt nap a szalonban – ellenőrző lista',
            'body' => 'Szia {first:owner}!

A nyílt napra ({d:10}) a minták, a büfé és a vízsugaras vágás bemutatója készen áll. Csak a szórólap költségvetésének jóváhagyása hiányzik.

{user:sales}',
        ],
        [
            'n' => 22,
            'folder' => 'INBOX',
            'day' => -4,
            'time' => '08:50',
            'from' => 'courier',
            'to' => 'sales',
            'seen' => true,
            'subject' => 'A mintákat tartalmazó csomagja megérkezett',
            'body' => 'A kőmintákat tartalmazó csomagot átadtuk a címzettnek. Aláírással vette át.

Követés: LP-554-2290',
        ],
        [
            'n' => 23,
            'folder' => 'INBOX',
            'day' => -1,
            'time' => '10:05',
            'from' => 'C6',
            'to' => 'pm',
            'seen' => false,
            'subject' => 'Hajszálrepedés a wellnessfal illesztésénél',
            'body' => 'Tisztelt {user:pm}!

A wellnessfal egyik illesztésénél hajszálrepedést vettünk észre. Sürgős, mert közeledik a megnyitás. Mellékelem a fotót.

{contact:C6}',
            'att' => [
                ['name' => 'illesztes_wellness.png', 'seed' => 91],
            ],
        ],
        [
            'n' => 24,
            'folder' => 'INBOX',
            'day' => 0,
            'time' => '07:30',
            'from' => 'C3',
            'to' => 'pm',
            'seen' => false,
            'subject' => 'Heti megrendelési lista – 45. hét',
            'body' => 'Kedves {first:pm}!

A heti lista mellékelve. Ezúttal tíz megrendelés, ebből egy új, gránit mosdópulttal.

{contact:C3}
{client:C3}',
            'att' => [
                [
                    'name' => 'heti_lista_45_het.csv',
                    'rows' => [
                        ['Munka', 'Anyag', 'Felület (m²)', 'Határidő'],
                        ['KL-4501', 'Absolute Black gránit 30 mm', 1.4, '{d:8}'],
                        ['KL-4502', 'Calacatta kvarc 20 mm', 3.6, '{d:8}'],
                    ],
                ],
            ],
        ],
    ],
];
