<?php
/**
 * SAI pack, slovenské vydanie. Len dáta (zmluva: demo_seed/index.php); rovnaké kľúče, dĺžky zoznamov a čísla
 * ako packs/en/sai.php a packs/hu/sai.php, líšia sa len texty.
 *
 * 'completed' = demo-sai-1: „Zdraženie kremenných dosiek o 8 % s bezplatným laserovým zameraním", uložené tak,
 * ako ho zanechá dokončený ostrý beh. 'draft' = demo-sai-2: línia vonkajších kuchýň zo spekaného kameňa,
 * nastavená, ale nespustená. Ľudia a firmy sa uvádzajú cez ref (C3, L9, S1) a v texte ako {contact:C3} / {client:C3};
 * konkurenčná dielňa a jej majiteľ sú vymyslení. Sumy sú {m:EUR}.
 */
return [
    'completed' => [
        'title' => 'Zdraženie kremenných dosiek o 8 % s bezplatným laserovým zameraním',
        'hypothesis' => 'Čo ak zdražíme kremenné pracovné dosky o 8 %, ale laserové zameranie bude zadarmo (inak {m:90}), sľúbime montáž do 10 pracovných dní od zamerania a rozbehnutým projektom štúdií necháme staré ceny do konca štvrťroka?',
        'seed' => 'Nový cenník kremenných dosiek: +8 %. V cene: laserové zameranie ({item:I8}, inak {m:90}), montáž do 10 pracovných dní od zamerania. Rozbehnuté projekty štúdií ostávajú za staré ceny do konca štvrťroka.',
        'question' => 'Akceptujú naši zákazníci 8 % zdraženie kremenných dosiek, ak pridáme bezplatné laserové zameranie a montáž do 10 pracovných dní a rozbehnutým projektom štúdií ponecháme staré ceny?',
        'sources' => ['active_leads', 'existing_clients', 'projects'],
        'scale' => 30,
        'rounds' => 3,
        'lookback' => 12,
        'created' => ['day' => -4, 'time' => '08:55'],
        'updated' => ['day' => -4, 'time' => '16:40'],

        'answers' => [
            'yes' => 'Akceptujem (so zameraním a sľubom termínu)',
            'maybe' => 'Váham / chcem projektovú cenu',
            'no' => 'Odmietam (lacnejšia dielňa)',
        ],

        'nodes' => [
            ['id' => 'node_studios', 'type' => 'Partner', 'client' => 'C3', 'name' => 'Partnerské kuchynské štúdiá',
                'summary' => 'Prinášajú asi 55 % zákaziek, medzi nimi {client:C3}. Citlivé na cenu, ktorú musia obhájiť pred vlastným klientom, a na termín montáže.'],
            ['id' => 'node_homeowners', 'type' => 'Client', 'client' => 'L9', 'name' => 'Majitelia domov pri rekonštrukcii',
                'summary' => 'Kuchyňu kupujú raz za 15 rokov, ako {contact:L9}. Viac než cena ich trápi riziko poškodenia, meškanie a nejasná záruka.'],
            ['id' => 'node_architect', 'type' => 'Partner', 'client' => 'L10', 'name' => 'Partnerský architektonický ateliér',
                'summary' => '{client:L10} rokuje o rámcovej dohode na šesť vilových projektov ročne. Potrebuje pevnú štvrťročnú cenu.'],
            ['id' => 'node_developers', 'type' => 'Buyer', 'client' => 'C1', 'project' => 'P1', 'name' => 'Developeri',
                'summary' => '{client:C1} obkladá dvanásť víl v projekte {project:P1}. Reklamácia stojí stavbu deň partie a posúva odovzdanie.'],
            ['id' => 'node_rival', 'type' => 'Competitor', 'name' => 'Nízkonákladová kamenárska dielňa',
                'summary' => 'Podlieza ceny o 15 %, zameriava šablónou z preglejky a pevný termín montáže nesľubuje.'],
            ['id' => 'node_supplier', 'type' => 'Supplier', 'supplier' => 'S1', 'name' => 'Taliansky výrobca dosiek',
                'summary' => 'Hlavný dodávateľ kremeňa. Aktuálne 10-dňové meškanie dodávky ohrozuje sľub montáže do 10 pracovných dní.'],
        ],
        'edges' => [
            ['id' => 'edge_1', 'source' => 'node_rival', 'target' => 'node_studios', 'round' => 1, 'relation' => 'PODLIEZA',
                'fact' => 'Dielňa ponúka štúdiám províziu 5 % za každú odovzdanú zákazku.'],
            ['id' => 'edge_2', 'source' => 'node_studios', 'target' => 'node_homeowners', 'round' => 1, 'relation' => 'ODPORÚČA',
                'fact' => 'Štúdiá rozhodujú o výbere kamenárstva v 7 z 10 kuchýň.'],
            ['id' => 'edge_3', 'source' => 'node_supplier', 'target' => 'node_developers', 'round' => 2, 'relation' => 'OHROZUJE',
                'fact' => 'Meškajúca zásielka posúva dodávky kremeňa pre vily o 10 dní.'],
            ['id' => 'edge_4', 'source' => 'node_homeowners', 'target' => 'node_rival', 'round' => 2, 'relation' => 'POROVNÁVA',
                'fact' => 'Majitelia vidia na fórach fotky vylomených hrán po montáži lacnejšej dielne.'],
            ['id' => 'edge_5', 'source' => 'node_architect', 'target' => 'node_studios', 'round' => 3, 'relation' => 'POTVRDZUJE',
                'fact' => 'Architektonický ateliér hovorí, že pevná štvrťročná cena by mu umožnila viazať vilové projekty na Lapideu.'],
        ],

        'agents' => [
            ['username' => 'majitelka_studia', 'client' => 'C3', 'displayName' => '{contact:C3}', 'mbti' => 'ESTJ', 'stance' => 'opposing', 'followers' => 1840, 'karma' => 390, 'node' => 'node_studios',
                'profession' => 'Majiteľka kuchynského štúdia',
                'userChar' => 'Pragmatická majiteľka štúdia. Každé zdraženie musí vysvetliť klientom, preto ho odmietne, ak nedostane prechodné obdobie a niečo hmatateľné navyše.',
                'publicBio' => 'Kuchyne na mieru od 2009',
                'topics' => ['ceny', 'termíny', 'provízie']],
            ['username' => 'opatrna_majitelka', 'client' => 'L9', 'displayName' => '{contact:L9}', 'mbti' => 'ISFJ', 'stance' => 'supportive', 'followers' => 320, 'karma' => 140, 'node' => 'node_homeowners',
                'profession' => 'Majiteľka domu, rekonštrukcia kuchyne',
                'userChar' => 'Opatrná kupujúca. Drez vyrezaný o 8 mm vedľa ju raz stál mesiac čakania, takže presné zameranie a pevný termín sú pre ňu dôležitejšie než cena.',
                'publicBio' => 'Matka dvoch detí | rekonštrukcia rodinného domu',
                'topics' => ['presnosť', 'spoľahlivosť']],
            ['username' => 'kamen_diskont', 'displayName' => 'Dušan Hric', 'mbti' => 'ENTJ', 'stance' => 'opposing', 'followers' => 2650, 'karma' => 210, 'node' => 'node_rival',
                'profession' => 'Konateľ, KameňDiskont',
                'userChar' => 'Konkurent, ktorý súťaží cenou. Zdraženie označuje za predražovanie a štúdiá láka províziou.',
                'publicBio' => 'Rovnaký kameň, nižšia cena | Západné Slovensko',
                'topics' => ['ceny', 'provízie']],
            ['username' => 'architekt_partner', 'client' => 'L10', 'displayName' => '{contact:L10}', 'mbti' => 'ISTJ', 'stance' => 'neutral', 'followers' => 2980, 'karma' => 560, 'node' => 'node_architect',
                'profession' => 'Vedúci architektonického ateliéru',
                'userChar' => 'Presný a skeptický. Plánuje šesť víl ročne a podpíše len pevnú cenu so sľubom termínu, ktorý platí aj pri meškaní dodávateľa.',
                'publicBio' => 'Architektúra a interiéry | Mníchov',
                'topics' => ['rámcová dohoda', 'termíny dodávok']],
            ['username' => 'developer_stavby', 'client' => 'C1', 'displayName' => '{contact:C1}', 'mbti' => 'ENTP', 'stance' => 'neutral', 'followers' => 1510, 'karma' => 300, 'node' => 'node_developers',
                'profession' => 'Vedúci developmentu',
                'userChar' => 'Počíta náklady dvanástich víl. Jedna reklamácia ho stojí deň partie a meškanie odovzdania, preto sleduje celok, nie cenu dosky.',
                'publicBio' => 'Rezidenčný development | Bratislava',
                'topics' => ['celkové náklady', 'odovzdanie']],
            ['username' => 'riaditelka_hotela', 'client' => 'C6', 'displayName' => '{contact:C6}', 'mbti' => 'INFJ', 'stance' => 'supportive', 'followers' => 4120, 'karma' => 480, 'node' => 'node_developers',
                'profession' => 'Riaditeľka butikového hotela',
                'userChar' => 'Potrebuje presnú prácu v hotelovej prevádzke. Laserové zameranie jej ušetrí druhú návštevu a hosťom druhé kolo hluku.',
                'publicBio' => 'Hotelierstvo | Banská Štiavnica',
                'topics' => ['presnosť', 'zážitok hosťa']],
        ],

        'posts' => [
            ['id' => 101, 'round' => 1, 'agent' => 1, 'platform' => 'chitchat', 'type' => 'POST', 'likes' => 31, 'quotes' => 6, 'comments' => 15, 'sentiment' => -0.6, 'time' => '09:10', 'answer' => 'no', 'target' => 0,
                'text' => 'O 8 % drahšie dosky uprostred sezóny? Mojim klientom to nevysvetlím. Ak nedostanem aspoň tri mesiace na staré ceny pre rozbehnuté projekty, začnem hľadať inde.'],
            ['id' => 102, 'round' => 1, 'agent' => 3, 'platform' => 'chitchat', 'type' => 'POST', 'likes' => 44, 'quotes' => 11, 'comments' => 21, 'sentiment' => -0.8, 'time' => '09:40', 'answer' => 'no', 'target' => 0,
                'text' => 'Rovnaký kremeň, o 15 % lacnejšie, a štúdiá dostanú od nás 5 % províziu. Za laserové zameranie si nikto pripláca nemusí – my to zvládneme šablónou z preglejky.'],
            ['id' => 103, 'round' => 1, 'agent' => 2, 'platform' => 'chitchat', 'type' => 'QUOTE', 'likes' => 58, 'quotes' => 12, 'comments' => 19, 'sentiment' => 0.7, 'time' => '10:20', 'answer' => 'yes', 'target' => 102,
                'text' => 'Šablónou z preglejky? Presne tak mi minule vyrezali drez o 8 mm vedľa a na opravu som čakala mesiac. Bezplatné laserové zameranie a pevný termín mi za 8 % stoja.'],
            ['id' => 104, 'round' => 2, 'agent' => 4, 'platform' => 'forum', 'type' => 'POST', 'likes' => 67, 'quotes' => 14, 'comments' => 26, 'sentiment' => 0.3, 'time' => '12:35', 'answer' => 'maybe', 'target' => 0,
                'text' => 'Pri rámcovej dohode je kľúčové, či sľub 10 pracovných dní platí aj pri meškaní talianskeho dodávateľa. Ak áno a cena bude pevná na štvrťrok, 8 % akceptujeme.'],
            ['id' => 105, 'round' => 2, 'agent' => 6, 'platform' => 'forum', 'type' => 'POST', 'likes' => 73, 'quotes' => 16, 'comments' => 18, 'sentiment' => 0.75, 'time' => '13:05', 'answer' => 'yes', 'target' => 0,
                'text' => 'Laserové zameranie mi ušetrí druhú návštevu v obsadenom hoteli a reklamácie výrezov prakticky zmizli. Za to rada zaplatím 8 %.'],
            ['id' => 106, 'round' => 2, 'agent' => 5, 'platform' => 'chitchat', 'type' => 'POST', 'likes' => 49, 'quotes' => 9, 'comments' => 13, 'sentiment' => 0.4, 'time' => '14:20', 'answer' => 'maybe', 'target' => 0,
                'text' => 'Prepočítal som to na dvanásť víl: jedna reklamácia hrany ma stojí deň partie a zdržanie odovzdania. Pri 8 % navyše so zameraním v cene vychádzame lacnejšie než pri oprave, ak termín platí.'],
            ['id' => 107, 'round' => 3, 'agent' => 1, 'platform' => 'chitchat', 'type' => 'QUOTE', 'likes' => 88, 'quotes' => 17, 'comments' => 20, 'sentiment' => 0.55, 'time' => '15:50', 'answer' => 'yes', 'target' => 101,
                'text' => 'Potvrdené: staré ceny do konca štvrťroka pre všetky rozbehnuté projekty a zameranie zadarmo. Za týchto podmienok zostávam – a klientom ukážem laserový report.'],
            ['id' => 108, 'round' => 3, 'agent' => 4, 'platform' => 'forum', 'type' => 'COMMENT', 'likes' => 61, 'quotes' => 8, 'comments' => 14, 'sentiment' => 0.5, 'time' => '16:10', 'answer' => 'yes', 'target' => 104,
                'text' => 'Súhlasíme s rámcovou dohodou, ak výnimka pre Statuario (15 dní) bude výslovne v zmluve. Pre ostatné dekory 10 pracovných dní podpíšeme.'],
            ['id' => 109, 'round' => 3, 'agent' => 3, 'platform' => 'chitchat', 'type' => 'POST', 'likes' => 17, 'quotes' => 2, 'comments' => 9, 'sentiment' => -0.5, 'time' => '17:30', 'answer' => 'no', 'target' => 0,
                'text' => 'Uvidíme, ako dlho vydrží „montáž do 10 dní", keď im Taliansko zase nedodá. My aspoň nesľubujeme, čo nevieme splniť.'],
        ],

        'metrics' => [
            ['round' => 1, 'hour' => 9, 'sentiment' => -0.24, 'supportive' => 2, 'opposing' => 2, 'neutral' => 2, 'interactions' => 150, 'viral' => 38, 'dist' => [2, 1, 3], 'leading' => 'no', 'consensus' => 50],
            ['round' => 2, 'hour' => 12, 'sentiment' => 0.21, 'supportive' => 3, 'opposing' => 1, 'neutral' => 2, 'interactions' => 310, 'viral' => 61, 'dist' => [3, 2, 1], 'leading' => 'yes', 'consensus' => 50],
            ['round' => 3, 'hour' => 15, 'sentiment' => 0.46, 'supportive' => 4, 'opposing' => 1, 'neutral' => 1, 'interactions' => 470, 'viral' => 79, 'dist' => [4, 1, 1], 'leading' => 'yes', 'consensus' => 74],
        ],

        'report' => [
            'title' => 'Strategický briefing: zdraženie kremenných dosiek o 8 % s bezplatným laserovým zameraním',
            'summary' => 'Simulácia preverila zdraženie kremenných dosiek o 8 % spojené s bezplatným laserovým zameraním a montážou do 10 pracovných dní. Trh sa rozdelil na štúdiá, ktoré musia cenu obhájiť, a koncových zákazníkov, ktorí zvažujú riziko poškodenia a meškanie. Do 3. kola prechodné obdobie pre rozbehnuté projekty štúdií preklopilo najväčšieho skeptika a súhlas dosiahol 74 %.',
            'directAnswer' => 'ÁNO, s prechodným obdobím pre štúdiá (74 % súhlas)',
            'confidence' => 84,
            'verdictSummary' => 'Rozhodla hmatateľná hodnota: zákazníci a architekti vnímajú laserové zameranie a dodržaný termín ako ochranu pred reklamáciami, ktoré ich stoja oveľa viac než 8 %.',
            'shares' => [
                ['pct' => 74, 'count' => 4, 'sentiment' => 0.6],
                ['pct' => 16, 'count' => 1, 'sentiment' => 0.3],
                ['pct' => 10, 'count' => 1, 'sentiment' => -0.7],
            ],
            'drivers' => [
                ['title' => '1. Presné výrezy na prvý raz', 'explanation' => 'Majitelia domov aj developeri počítajú cenu reklamácie, nielen cenu dosky.',
                    'quote' => 'Bezplatné laserové zameranie a pevný termín mi za 8 % stoja.'],
                ['title' => '2. Bezplatné laserové zameranie', 'explanation' => 'Ušetrí druhú návštevu stavby a je jediné, čo konkurent so šablónou z preglejky rýchlo nenapodobní.',
                    'quote' => 'Laserové zameranie mi ušetrí druhú návštevu.'],
                ['title' => '3. Staré ceny do konca štvrťroka', 'explanation' => 'Prechodné obdobie neutralizovalo odpor štúdií, ktoré majú rozbehnuté ponuky.',
                    'quote' => 'Za týchto podmienok zostávam.'],
            ],
            'tipping' => [
                'round' => 3,
                'description' => 'Potvrdenie starých cien pre rozbehnuté projekty preklopilo majiteľku štúdia z odporu do podpory.',
                'impact' => 'Segment štúdií prešiel z odporu do podpory.',
            ],
            'whatIf' => [
                'Bez prechodného obdobia by štúdiá presunuli odhadom 30 % zákaziek ku konkurencii.',
                'Ak by sľub termínu neplatil pri meškaní dodávateľa, architektonický ateliér by rámcovú dohodu nepodpísal.',
            ],
            'recommendations' => [
                'Pred oznámením osobne zavolať 10 najväčším štúdiám a potvrdiť staré ceny do konca štvrťroka.',
                'Do rámcovej dohody s architektonickým ateliérom zapísať výnimku 15 dní pre Statuario.',
                'Udržiavať skladovú rezervu 6 dosiek najžiadanejších dekorov proti meškaniu od talianskeho výrobcu.',
            ],
            'sections' => [
                ['title' => '1. Konsenzus a polarizácia trhu',
                    'content' => 'Oznámenie rozdelilo trh na **sprostredkovateľov** (kuchynské štúdiá), ktorí musia cenu obhájiť, a **koncových zákazníkov**, ktorí zvažujú cenu reklamácie.

Kľúčové zistenia:
- **Obrat sentimentu**: z **-0,24** v 1. kole na **+0,46** v 3. kole.
- **Prechodné obdobie**: staré ceny pre rozbehnuté projekty premenili najhlasnejšieho odporcu na podporovateľa.
- **Laserové zameranie** bolo najcitovanejším prínosom u majiteľov domov aj v hoteli.'],
                ['title' => '2. Zraniteľnosti a hlavné námietky',
                    'content' => '1. **Termín pri meškaní dodávateľa**: sľub 10 pracovných dní musí platiť aj vtedy, keď taliansky výrobca mešká.
2. **Už odoslané ponuky**: štúdiá s ponukami za staré ceny potrebujú prechodné obdobie písomne.'],
                ['title' => '3. Protistratégia konkurencie',
                    'content' => 'Nízkonákladová dielňa ponúkla štúdiám províziu 5 % a cenu o 15 % nižšiu. Útok zlyhal, keď zákazníci zdieľali skúsenosti s nepresnými šablónami z preglejky.

- Fotky vylomených hrán z fór uškodili viac než akékoľvek cenové porovnanie.'],
                ['title' => '4. 🎯 AKÚ STRATÉGIU POUŽIŤ NA DOSIAHNUTIE CIEĽA?',
                    'content' => 'Na zavedenie zdraženia bez straty štúdií postupujte takto:'],
            ],
            'vulnerabilities' => [
                'Chýba písomné prechodné obdobie pre štúdiá s už odoslanými ponukami.',
                'Sľub termínu závisí od dodávateľa, ktorý práve mešká.',
                'Konkurencia môže laserové zameranie ďalej nazývať gýčom.',
            ],
            'counterMeasures' => [
                'Každému štúdiu poslať jednostranový list s potvrdením starých cien do konca štvrťroka.',
                'Ku každej ponuke priložiť report z laserového zamerania.',
                'Zverejniť fotky hotových hrán a výrezov pred a po.',
            ],
            'objections' => [
                ['objection' => '8 % navyše uprostred sezóny je priveľa.', 'rebuttal' => 'Zameranie, ktoré inak stojí {m:90}, je zadarmo, a jedna reklamácia stojí viac než zdraženie.'],
                ['objection' => 'Klientovi som už poslal ponuku so starou cenou.', 'rebuttal' => 'Všetky rozbehnuté projekty dodáme za staré ceny do konca štvrťroka.'],
                ['objection' => 'Čo ak taliansky dodávateľ zase mešká?', 'rebuttal' => 'Držíme skladovú rezervu najžiadanejších dekorov a výnimky (Statuario) uvádzame vopred.'],
            ],
            'gtm' => [
                '1. deň: osobné hovory s 10 najväčšími štúdiami a potvrdenie starých cien.',
                '7. deň: podpis rámcovej dohody s architektonickým ateliérom vrátane výnimky pre Statuario.',
                '14. deň: nový cenník s bezplatným laserovým zameraním na webe a v showroome.',
                '30. deň: kampaň „presnosť na milimeter" pre architektov.',
            ],
        ],
    ],

    'draft' => [
        'title' => 'Línia vonkajších kuchýň zo spekaného kameňa na jar',
        'hypothesis' => 'Čo ak na jar uvedieme líniu vonkajších kuchýň zo spekaného kameňa (pulty, zástena, dlažba terasy) cez partnerské štúdiá a showroom, s materiálom {item:I2} ako hlavným?',
        'seed' => 'Jarné uvedenie: vonkajšie kuchyne z materiálu {item:I2} (odolného voči mrazu a UV), pulty a zástena z vlastnej CNC dielne, dlažba terasy ako doplnok. Ponúkame cez partnerské štúdiá a showroom, laserové zameranie v cene.',
        'sources' => ['active_leads', 'existing_clients', 'projects'],
        'scale' => 30,
        'rounds' => 5,
        'lookback' => 12,
        'created' => ['day' => -1, 'time' => '15:20'],
    ],
];
