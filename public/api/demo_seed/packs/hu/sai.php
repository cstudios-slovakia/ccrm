<?php
/**
 * SAI csomag, magyar kiadás. Csak adat (szerződés: demo_seed/index.php); a kulcsok, listahosszok és számok
 * azonosak a packs/en/sai.php és packs/sk/sai.php fájlokéval, csak a szövegek különböznek.
 *
 * 'completed' = demo-sai-1: „8 %-os kvarc munkalap-áremelés ingyenes lézeres felméréssel", úgy tárolva, ahogy
 * egy lefutott éles futás hagyja. 'draft' = demo-sai-2: kültéri konyhák szinterezett kőből, beállítva, de
 * nem futtatva. Az embereket és cégeket ref hivatkozza (C3, L9, S1), a szövegben {contact:C3} / {client:C3};
 * a versenytárs műhely és tulajdonosa kitalált. Az összegek {m:EUR}.
 */
return [
    'completed' => [
        'title' => '8 %-os kvarc munkalap-áremelés ingyenes lézeres felméréssel',
        'hypothesis' => 'Mi lenne, ha a kvarc munkalapokat 8 %-kal drágítanánk, de a lézeres felmérés ingyenes lenne (egyébként {m:90}), a felméréstől számított 10 munkanapon belüli szerelést ígérnénk, és a futó stúdióprojektekre a negyedév végéig a régi árat tartanánk?',
        'seed' => 'Új kvarc munkalap árlista: +8 %. Az árban: lézeres felmérés ({item:I8}, egyébként {m:90}), szerelés a felméréstől számított 10 munkanapon belül. A futó stúdióprojektek a negyedév végéig a régi áron maradnak.',
        'question' => 'Elfogadják-e ügyfeleink a kvarc munkalapok 8 %-os áremelését, ha ingyenes lézeres felmérést és 10 munkanapon belüli szerelést adunk, a futó stúdióprojekteknél pedig megtartjuk a régi árat?',
        'sources' => ['active_leads', 'existing_clients', 'projects'],
        'scale' => 30,
        'rounds' => 3,
        'lookback' => 12,
        'created' => ['day' => -4, 'time' => '08:55'],
        'updated' => ['day' => -4, 'time' => '16:40'],

        'answers' => [
            'yes' => 'Elfogadom (felméréssel és határidő-vállalással)',
            'maybe' => 'Bizonytalan / projektárat kér',
            'no' => 'Elutasítom (olcsóbb műhely)',
        ],

        'nodes' => [
            ['id' => 'node_studios', 'type' => 'Partner', 'client' => 'C3', 'name' => 'Partner konyhastúdiók',
                'summary' => 'A munkák mintegy 55 %-át hozzák, köztük a {client:C3}. Érzékenyek az árra, amelyet a saját ügyfelük előtt kell megvédeniük, és a szerelési határidőre.'],
            ['id' => 'node_homeowners', 'type' => 'Client', 'client' => 'L9', 'name' => 'Felújító lakástulajdonosok',
                'summary' => '15 évente egyszer vesznek konyhát, mint {contact:L9}. Az árnál jobban aggasztja őket a sérülés kockázata, a késés és a homályos garancia.'],
            ['id' => 'node_architect', 'type' => 'Partner', 'client' => 'L10', 'name' => 'Partner építészeti iroda',
                'summary' => 'A {client:L10} évi hat villaprojektre keretszerződést tárgyal. Fix negyedéves árra van szüksége.'],
            ['id' => 'node_developers', 'type' => 'Buyer', 'client' => 'C1', 'project' => 'P1', 'name' => 'Fejlesztők',
                'summary' => 'A {client:C1} tizenkét villát burkol a(z) {project:P1} projektben. Egy reklamáció egy brigádnapba kerül az építkezésnek, és késlelteti az átadást.'],
            ['id' => 'node_rival', 'type' => 'Competitor', 'name' => 'Fapados kőfaragó műhely',
                'summary' => '15 %-kal alákínál, rétegelt lemez sablonnal mér, és fix szerelési határidőt nem vállal.'],
            ['id' => 'node_supplier', 'type' => 'Supplier', 'supplier' => 'S1', 'name' => 'Olasz lapgyártó',
                'summary' => 'A fő kvarcbeszállító. A jelenlegi 10 napos szállítási késés veszélyezteti a 10 munkanapon belüli szerelés ígéretét.'],
        ],
        'edges' => [
            ['id' => 'edge_1', 'source' => 'node_rival', 'target' => 'node_studios', 'round' => 1, 'relation' => 'ALÁÍGÉR',
                'fact' => 'A műhely 5 % jutalékot kínál a stúdióknak minden átadott munkáért.'],
            ['id' => 'edge_2', 'source' => 'node_studios', 'target' => 'node_homeowners', 'round' => 1, 'relation' => 'AJÁNLJA',
                'fact' => 'A stúdiók döntenek arról, melyik kőfaragó készíti a konyhák 10-ből 7-ében a munkalapot.'],
            ['id' => 'edge_3', 'source' => 'node_supplier', 'target' => 'node_developers', 'round' => 2, 'relation' => 'VESZÉLYEZTETI',
                'fact' => 'A késő szállítmány 10 nappal tolja ki a villákhoz szükséges kvarc szállítását.'],
            ['id' => 'edge_4', 'source' => 'node_homeowners', 'target' => 'node_rival', 'round' => 2, 'relation' => 'ÖSSZEHASONLÍTJA',
                'fact' => 'A tulajdonosok fórumokon látnak fotókat kicsorbult élekről az olcsóbb műhely szerelései után.'],
            ['id' => 'edge_5', 'source' => 'node_architect', 'target' => 'node_studios', 'round' => 3, 'relation' => 'MEGERŐSÍTI',
                'fact' => 'Az építészeti iroda szerint egy fix negyedéves ár lehetővé tenné, hogy villaprojektjeit a Lapideához kösse.'],
        ],

        'agents' => [
            ['username' => 'studiotulajdonos', 'client' => 'C3', 'displayName' => '{contact:C3}', 'mbti' => 'ESTJ', 'stance' => 'opposing', 'followers' => 1840, 'karma' => 390, 'node' => 'node_studios',
                'profession' => 'Konyhastúdió-tulajdonos',
                'userChar' => 'Pragmatikus stúdiótulajdonos. Minden áremelést meg kell magyaráznia az ügyfeleinek, ezért elutasítja, ha nem kap átmeneti időszakot és valami kézzelfoghatót is.',
                'publicBio' => 'Egyedi konyhák 2009 óta',
                'topics' => ['árak', 'határidők', 'jutalék']],
            ['username' => 'ovatos_vasarlo', 'client' => 'L9', 'displayName' => '{contact:L9}', 'mbti' => 'ISFJ', 'stance' => 'supportive', 'followers' => 320, 'karma' => 140, 'node' => 'node_homeowners',
                'profession' => 'Konyháját felújító háztulajdonos',
                'userChar' => 'Óvatos vásárló. Egy 8 mm-rel elvágott mosogató egyszer egy hónap várakozásába került, ezért a pontos felmérés és a fix határidő fontosabb neki az árnál.',
                'publicBio' => 'Kétgyermekes anya | családi ház felújítása',
                'topics' => ['pontosság', 'megbízhatóság']],
            ['username' => 'ko_diszkont', 'displayName' => 'Gáspár Dénes', 'mbti' => 'ENTJ', 'stance' => 'opposing', 'followers' => 2650, 'karma' => 210, 'node' => 'node_rival',
                'profession' => 'Ügyvezető, KőDiszkont',
                'userChar' => 'Árban versenyző rivális. Az emelést túlárazásnak nevezi, és jutalékkal csábítja a stúdiókat.',
                'publicBio' => 'Ugyanaz a kő, alacsonyabb áron | Nyugat-Dunántúl',
                'topics' => ['árak', 'jutalék']],
            ['username' => 'epitesz_partner', 'client' => 'L10', 'displayName' => '{contact:L10}', 'mbti' => 'ISTJ', 'stance' => 'neutral', 'followers' => 2980, 'karma' => 560, 'node' => 'node_architect',
                'profession' => 'Építészeti iroda vezetője',
                'userChar' => 'Pontos és szkeptikus. Évente hat villát tervez, és csak olyan fix árat ír alá, amelynek határidő-ígérete a beszállító késésénél is érvényes.',
                'publicBio' => 'Építészet és belsőépítészet | München',
                'topics' => ['keretszerződés', 'szállítási határidők']],
            ['username' => 'fejleszto_villak', 'client' => 'C1', 'displayName' => '{contact:C1}', 'mbti' => 'ENTP', 'stance' => 'neutral', 'followers' => 1510, 'karma' => 300, 'node' => 'node_developers',
                'profession' => 'Fejlesztési vezető',
                'userChar' => 'Tizenkét villa költségét számolja. Egy reklamáció egy brigádnapba és késő átadásba kerül, ezért az egészet nézi, nem a lap árát.',
                'publicBio' => 'Lakóingatlan-fejlesztés | Győr',
                'topics' => ['teljes költség', 'átadás']],
            ['username' => 'szalloda_igazgato', 'client' => 'C6', 'displayName' => '{contact:C6}', 'mbti' => 'INFJ', 'stance' => 'supportive', 'followers' => 4120, 'karma' => 480, 'node' => 'node_developers',
                'profession' => 'Butikszálloda igazgatója',
                'userChar' => 'Pontos munkát vár egy működő szállodában. A lézeres felmérés megspórolja neki a második helyszíni látogatást, a vendégeknek pedig a második zajos kört.',
                'publicBio' => 'Vendéglátás | Sopron',
                'topics' => ['pontosság', 'vendégélmény']],
        ],

        'posts' => [
            ['id' => 101, 'round' => 1, 'agent' => 1, 'platform' => 'chitchat', 'type' => 'POST', 'likes' => 31, 'quotes' => 6, 'comments' => 15, 'sentiment' => -0.6, 'time' => '09:10', 'answer' => 'no', 'target' => 0,
                'text' => '8 %-kal drágább munkalapok a szezon közepén? Ezt nem tudom megmagyarázni az ügyfeleimnek. Ha a futó projektekre nem kapok legalább három hónap régi árat, máshol kezdek keresgélni.'],
            ['id' => 102, 'round' => 1, 'agent' => 3, 'platform' => 'chitchat', 'type' => 'POST', 'likes' => 44, 'quotes' => 11, 'comments' => 21, 'sentiment' => -0.8, 'time' => '09:40', 'answer' => 'no', 'target' => 0,
                'text' => 'Ugyanaz a kvarc 15 %-kal olcsóbban, és a stúdiók 5 % jutalékot kapnak tőlünk. A lézeres felméréséért senkinek sem kell felárat fizetnie – mi megoldjuk rétegelt lemez sablonnal.'],
            ['id' => 103, 'round' => 1, 'agent' => 2, 'platform' => 'chitchat', 'type' => 'QUOTE', 'likes' => 58, 'quotes' => 12, 'comments' => 19, 'sentiment' => 0.7, 'time' => '10:20', 'answer' => 'yes', 'target' => 102,
                'text' => 'Rétegelt lemez sablonnal? Pont így vágták el legutóbb 8 mm-rel a mosogatómat, és egy hónapot vártam a javításra. Az ingyenes lézeres felmérés és a fix határidő nekem megér 8 %-ot.'],
            ['id' => 104, 'round' => 2, 'agent' => 4, 'platform' => 'forum', 'type' => 'POST', 'likes' => 67, 'quotes' => 14, 'comments' => 26, 'sentiment' => 0.3, 'time' => '12:35', 'answer' => 'maybe', 'target' => 0,
                'text' => 'Keretszerződésnél az a kulcs, hogy a 10 munkanapos ígéret az olasz beszállító késése esetén is érvényes-e. Ha igen, és az ár negyedévre fix, elfogadjuk a 8 %-ot.'],
            ['id' => 105, 'round' => 2, 'agent' => 6, 'platform' => 'forum', 'type' => 'POST', 'likes' => 73, 'quotes' => 16, 'comments' => 18, 'sentiment' => 0.75, 'time' => '13:05', 'answer' => 'yes', 'target' => 0,
                'text' => 'A lézeres felmérés megspórolja a második helyszíni látogatást egy működő szállodában, és a kivágási reklamációk gyakorlatilag eltűntek. Ezért szívesen kifizetem a 8 %-ot.'],
            ['id' => 106, 'round' => 2, 'agent' => 5, 'platform' => 'chitchat', 'type' => 'POST', 'likes' => 49, 'quotes' => 9, 'comments' => 13, 'sentiment' => 0.4, 'time' => '14:20', 'answer' => 'maybe', 'target' => 0,
                'text' => 'Kiszámoltam tizenkét villára: egy élreklamáció egy brigádnapba és késleltetett átadásba kerül. 8 % felárral, a felméréssel az árban olcsóbban jövünk ki, mint egy javítással – ha a határidő tartja magát.'],
            ['id' => 107, 'round' => 3, 'agent' => 1, 'platform' => 'chitchat', 'type' => 'QUOTE', 'likes' => 88, 'quotes' => 17, 'comments' => 20, 'sentiment' => 0.55, 'time' => '15:50', 'answer' => 'yes', 'target' => 101,
                'text' => 'Megerősítették: a negyedév végéig régi ár minden futó projektre, és a felmérés ingyenes. Ilyen feltételekkel maradok – és megmutatom az ügyfeleimnek a lézeres jelentést.'],
            ['id' => 108, 'round' => 3, 'agent' => 4, 'platform' => 'forum', 'type' => 'COMMENT', 'likes' => 61, 'quotes' => 8, 'comments' => 14, 'sentiment' => 0.5, 'time' => '16:10', 'answer' => 'yes', 'target' => 104,
                'text' => 'Elfogadjuk a keretszerződést, ha a Statuario-kivétel (15 nap) kifejezetten bekerül a szerződésbe. A többi dekornál aláírjuk a 10 munkanapot.'],
            ['id' => 109, 'round' => 3, 'agent' => 3, 'platform' => 'chitchat', 'type' => 'POST', 'likes' => 17, 'quotes' => 2, 'comments' => 9, 'sentiment' => -0.5, 'time' => '17:30', 'answer' => 'no', 'target' => 0,
                'text' => 'Meglátjuk, meddig tart a „10 napos szerelés", amikor Olaszország megint nem szállít. Mi legalább nem ígérünk olyat, amit nem tudunk betartani.'],
        ],

        'metrics' => [
            ['round' => 1, 'hour' => 9, 'sentiment' => -0.24, 'supportive' => 2, 'opposing' => 2, 'neutral' => 2, 'interactions' => 150, 'viral' => 38, 'dist' => [2, 1, 3], 'leading' => 'no', 'consensus' => 50],
            ['round' => 2, 'hour' => 12, 'sentiment' => 0.21, 'supportive' => 3, 'opposing' => 1, 'neutral' => 2, 'interactions' => 310, 'viral' => 61, 'dist' => [3, 2, 1], 'leading' => 'yes', 'consensus' => 50],
            ['round' => 3, 'hour' => 15, 'sentiment' => 0.46, 'supportive' => 4, 'opposing' => 1, 'neutral' => 1, 'interactions' => 470, 'viral' => 79, 'dist' => [4, 1, 1], 'leading' => 'yes', 'consensus' => 74],
        ],

        'report' => [
            'title' => 'Stratégiai eligazítás: 8 %-os kvarc munkalap-áremelés ingyenes lézeres felméréssel',
            'summary' => 'A szimuláció a kvarc munkalapok 8 %-os áremelését vizsgálta ingyenes lézeres felméréssel és 10 munkanapon belüli szereléssel. A piac két részre szakadt: a stúdiókra, amelyeknek meg kell védeniük az árat, és a végső ügyfelekre, akik a sérülés kockázatát és a késést mérlegelik. A 3. körre a futó stúdióprojektekre adott átmeneti időszak meggyőzte a legnagyobb szkeptikust, és a támogatás elérte a 74 %-ot.',
            'directAnswer' => 'IGEN, átmeneti időszakkal a stúdióknak (74 % támogatás)',
            'confidence' => 84,
            'verdictSummary' => 'A kézzelfogható érték döntött: az ügyfelek és az építészek a lézeres felmérést és a tartott határidőt olyan reklamációk elleni védelemnek látják, amelyek sokkal többe kerülnek 8 %-nál.',
            'shares' => [
                ['pct' => 74, 'count' => 4, 'sentiment' => 0.6],
                ['pct' => 16, 'count' => 1, 'sentiment' => 0.3],
                ['pct' => 10, 'count' => 1, 'sentiment' => -0.7],
            ],
            'drivers' => [
                ['title' => '1. Pontos kivágások elsőre', 'explanation' => 'A lakástulajdonosok és a fejlesztők a reklamáció árát számolják, nem csak a lap árát.',
                    'quote' => 'Az ingyenes lézeres felmérés és a fix határidő nekem megér 8 %-ot.'],
                ['title' => '2. Ingyenes lézeres felmérés', 'explanation' => 'Megspórolja a második helyszíni látogatást, és az egyetlen dolog, amit a rétegelt lemez sablonos versenytárs gyorsan nem tud utánozni.',
                    'quote' => 'A lézeres felmérés megspórolja a második helyszíni látogatást.'],
                ['title' => '3. Régi árak a negyedév végéig', 'explanation' => 'Az átmeneti időszak semlegesítette azoknak a stúdióknak az ellenállását, amelyeknek ajánlatai már kint vannak.',
                    'quote' => 'Ilyen feltételekkel maradok.'],
            ],
            'tipping' => [
                'round' => 3,
                'description' => 'A futó projektekre a régi árak megerősítése a stúdiótulajdonost az ellenzéktől a támogatásba billentette.',
                'impact' => 'A stúdiók szegmense az ellenzésből a támogatásba váltott.',
            ],
            'whatIf' => [
                'Átmeneti időszak nélkül a stúdiók becslés szerint a munkáik 30 %-át a versenytárshoz vinnék.',
                'Ha a határidő-ígéret a beszállító késésénél nem tartana, az építészeti iroda nem írná alá a keretszerződést.',
            ],
            'recommendations' => [
                'A bejelentés előtt személyesen hívja fel a 10 legnagyobb stúdiót, és erősítse meg a régi árakat a negyedév végéig.',
                'Írja bele az építészeti irodával kötendő keretszerződésbe a Statuario 15 napos kivételét.',
                'Tartson 6 lapnyi tartalékot a legkeresettebb dekorokból az olasz gyártó késései ellen.',
            ],
            'sections' => [
                ['title' => '1. Konszenzus és piaci polarizáció',
                    'content' => 'A bejelentés két részre osztotta a piacot: a **közvetítőkre** (konyhastúdiók), akiknek meg kell védeniük az árat, és a **végső ügyfelekre**, akik a reklamáció árát mérlegelik.

Főbb megállapítások:
- **Hangulatváltás**: az 1. kör **-0,24** értékéről a 3. körre **+0,46**-ra.
- **Átmeneti időszak**: a futó projektek régi ára a leghangosabb ellenzőt támogatóvá tette.
- **A lézeres felmérés** volt a legtöbbet idézett előny a lakástulajdonosoknál és a szállodánál.'],
                ['title' => '2. Sebezhetőségek és fő kifogások',
                    'content' => '1. **Határidő a beszállító késésénél**: a 10 munkanapos ígéretnek akkor is érvényesnek kell lennie, ha az olasz gyártó késik.
2. **Már elküldött ajánlatok**: a régi áras ajánlattal rendelkező stúdióknak az átmeneti időszakot írásban kell megkapniuk.'],
                ['title' => '3. A versenytárs ellenstratégiája',
                    'content' => 'A fapados műhely 5 % jutalékot és 15 %-kal alacsonyabb árat kínált a stúdióknak. A támadás kudarcot vallott, amikor az ügyfelek megosztották a pontatlan rétegelt lemez sablonokkal szerzett tapasztalataikat.

- A fórumokon látott, kicsorbult élekről készült fotók többet ártottak bármilyen árösszehasonlításnál.'],
                ['title' => '4. 🎯 MELYIK STRATÉGIA VEZET A CÉLHOZ?',
                    'content' => 'Az áremelés stúdiók elvesztése nélküli bevezetéséhez kövesse ezeket a lépéseket:'],
            ],
            'vulnerabilities' => [
                'Nincs írásos átmeneti időszak a már elküldött ajánlatokkal rendelkező stúdióknak.',
                'A határidő-ígéret egy éppen késő beszállítótól függ.',
                'A versenytárs továbbra is trükknek nevezheti a lézeres felmérést.',
            ],
            'counterMeasures' => [
                'Küldjön minden stúdiónak egyoldalas levelet a régi árak negyedév végéig történő megerősítésével.',
                'Minden ajánlathoz mellékelje a lézeres felmérés jelentését.',
                'Tegyen közzé előtte-utána fotókat a kész élekről és kivágásokról.',
            ],
            'objections' => [
                ['objection' => '8 % felár a szezon közepén túl sok.', 'rebuttal' => 'A felmérés, amely egyébként {m:90}, ingyenes, egy reklamáció pedig többe kerül az emelésnél.'],
                ['objection' => 'Az ügyfelemnek már elküldtem az ajánlatot a régi áron.', 'rebuttal' => 'Minden futó projektet a negyedév végéig a régi áron szállítunk.'],
                ['objection' => 'Mi van, ha az olasz beszállító megint késik?', 'rebuttal' => 'A legkeresettebb dekorokból tartalékot tartunk, a kivételeket (Statuario) előre közöljük.'],
            ],
            'gtm' => [
                '1. nap: személyes hívások a 10 legnagyobb stúdiónak, a régi árak megerősítése.',
                '7. nap: a keretszerződés aláírása az építészeti irodával, a Statuario-kivétellel együtt.',
                '14. nap: új árlista ingyenes lézeres felméréssel a weboldalon és a bemutatóteremben.',
                '30. nap: „milliméteres pontosság" kampány építészeknek.',
            ],
        ],
    ],

    'draft' => [
        'title' => 'Kültéri konyhák szinterezett kőből tavaszra',
        'hypothesis' => 'Mi lenne, ha tavasszal kültéri konyhasort indítanánk szinterezett kőből (pultok, hátfal, teraszburkolat) a partner stúdiókon és a bemutatótermen keresztül, a(z) {item:I2} anyaggal mint főszereplővel?',
        'seed' => 'Tavaszi indulás: kültéri konyhák a(z) {item:I2} anyagból (fagy- és UV-álló), a pultok és a hátfal saját CNC műhelyből, teraszburkolat kiegészítőként. A partner stúdiókon és a bemutatótermen keresztül kínáljuk, a lézeres felmérés az árban.',
        'sources' => ['active_leads', 'existing_clients', 'projects'],
        'scale' => 30,
        'rounds' => 5,
        'lookback' => 12,
        'created' => ['day' => -1, 'time' => '15:20'],
    ],
];
